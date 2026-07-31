import { Router } from "express";
import { db, tryonTasks, userSelfies, products } from "../db/index.js";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { TryonRequestSchema } from "../types/api.js";
import { tryonRateLimit } from "../middleware/rateLimit.js";
import {
  createAIClothTask,
  getTaskStatus,
  extractResultUrl,
  getYouCamApiKey,
  getYouCamWebhookSecret,
  verifyWebhookSignature,
  isYouCamConfigured,
  processSelfie,
  pollTask,
  type YouCamWebhookPayload,
} from "../services/youcam.js";
import { uploadToStorage, generateStoragePath, downloadFromUrl } from "../services/supabase.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";

export const tryonRouter = Router();

const BUCKET_NAME = "images";

// Apply rate limiting
tryonRouter.post("/", tryonRateLimit);
tryonRouter.post("/selfie", tryonRateLimit);
tryonRouter.post("/multi", tryonRateLimit);

// Helper: Detect garment category from product
function detectGarmentCategory(product: any): "upper_body" | "lower_body" | "full_body" {
  const category = (product.category || "").toLowerCase();
  const title = (product.title || "").toLowerCase();
  const tags = ((product as any).tags || []).join(" ").toLowerCase();
  const combined = `${category} ${title} ${tags}`;
  
  if (/denim|pant|jean|trouser|skirt|short|bottom|leg/.test(combined)) {
    return "lower_body";
  }
  if (/top|shirt|blouse|sweater|hoodie|jacket|coat|dress|full/.test(combined)) {
    return "upper_body";
  }
  return "full_body";
}

// Helper: Download YouCam result and upload to Supabase
async function saveResultToSupabase(youcamUrl: string, sessionId: string, step: number): Promise<string> {
  try {
    const { buffer, contentType } = await downloadFromUrl(youcamUrl);
    const path = generateStoragePath(`tryon/${sessionId}`, "jpg");
    const publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, contentType);
    console.log(`  Saved step ${step} result to Supabase: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error(`  Failed to save to Supabase, returning original URL: ${error}`);
    return youcamUrl; // Fallback to original URL
  }
}

// POST /api/tryon/multi - Multi-step try-on for multiple products
// Now saves results to Supabase Storage
tryonRouter.post("/multi", async (req, res) => {
  try {
    const input = z.object({
      productIds: z.array(z.string()).min(1),
      selfieId: z.string().optional(),
    }).parse(req.body);
    
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authorization required" });
    }
    
    if (!isYouCamConfigured()) {
      return res.status(503).json({
        error: "Try-on not available",
        reason: "YOUCAM_API_KEY not configured",
      });
    }
    
    // Get selfie
    let selfie;
    if (input.selfieId) {
      [selfie] = await db
        .select()
        .from(userSelfies)
        .where(eq(userSelfies.id, input.selfieId))
        .limit(1);
    } else {
      [selfie] = await db
        .select()
        .from(userSelfies)
        .where(eq(userSelfies.userId, userId))
        .limit(1);
    }
    
    if (!selfie) {
      return res.status(400).json({
        error: "No selfie on file",
        message: "Please upload a selfie first",
      });
    }
    
    // Get all products
    const productRecords = await Promise.all(
      input.productIds.map(id => 
        db.select().from(products).where(eq(products.id, id)).limit(1)
      )
    );
    
    const validProducts = productRecords
      .flat()
      .filter(p => p && (p.images?.[0] || (p as any).processedImages?.[0]));
    
    if (validProducts.length === 0) {
      return res.status(400).json({ error: "No valid products found" });
    }
    
    // Generate session ID
    const sessionId = `tryon_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    // Create parent task
    const [parentTask] = await db.insert(tryonTasks).values({
      userId,
      productIds: input.productIds,
      selfieId: selfie.id,
      externalTaskId: sessionId,
      status: "processing",
    }).returning();
    
    // Start async multi-step process
    const apiKey = getYouCamApiKey();
    let currentSourceImage = selfie.processedImageUrl || selfie.imageUrl;
    const steps = [];
    
    console.log(`Starting multi-step try-on session ${sessionId}`);
    console.log(`Products to try on: ${validProducts.length}`);
    
    // Process each product sequentially
    for (let i = 0; i < validProducts.length; i++) {
      const product = validProducts[i];
      const garmentImageUrl = (product as any).processedImages?.[0] || product.images?.[0];
      const garmentCategory = detectGarmentCategory(product);
      
      console.log(`Step ${i + 1}: Trying on ${product.title} (${garmentCategory})`);
      
      // Create YouCam task
      const taskResponse = await createAIClothTask(
        {
          src_file_url: currentSourceImage,
          ref_file_url: garmentImageUrl,
          garment_category: garmentCategory,
        },
        apiKey
      );
      
      // Poll for result
      const result = await pollTask(taskResponse.task_id, "cloth-v3", apiKey, 60, 3000);
      
      if (result && extractResultUrl(result)) {
        const youcamResultUrl = extractResultUrl(result)!;
        
        // Save result to Supabase Storage
        const stableUrl = await saveResultToSupabase(youcamResultUrl, sessionId, i + 1);
        
        // Use stable URL for next step
        currentSourceImage = stableUrl;
        
        steps.push({
          step: i + 1,
          productId: product.id,
          productTitle: product.title,
          category: garmentCategory,
          status: "success",
          resultUrl: stableUrl,
        });
        
        console.log(`Step ${i + 1}: Success!`);
      } else {
        const errorMsg = result?.error?.message || "Try-on failed";
        steps.push({
          step: i + 1,
          productId: product.id,
          productTitle: product.title,
          category: garmentCategory,
          status: "error",
          errorMessage: errorMsg,
        });
        
        console.error(`Step ${i + 1}: Failed - ${errorMsg}`);
        
        // Update parent task and return partial results
        await db
          .update(tryonTasks)
          .set({
            status: "failed",
            errorMessage: `Failed at step ${i + 1}: ${errorMsg}`,
            completedAt: new Date(),
          })
          .where(eq(tryonTasks.id, parentTask.id));
        
        return res.json({
          sessionId,
          taskId: parentTask.id,
          status: "error",
          currentStep: i + 1,
          totalSteps: validProducts.length,
          steps,
          finalResultUrl: steps.length > 0 ? steps[steps.length - 1].resultUrl : null,
          errorMessage: errorMsg,
        });
      }
    }
    
    // All steps completed successfully
    await db
      .update(tryonTasks)
      .set({
        status: "completed",
        resultImageUrl: currentSourceImage, // This is now the Supabase URL
        completedAt: new Date(),
      })
      .where(eq(tryonTasks.id, parentTask.id));
    
    console.log(`Multi-step try-on ${sessionId} completed successfully!`);
    
    res.json({
      sessionId,
      taskId: parentTask.id,
      status: "success",
      currentStep: validProducts.length,
      totalSteps: validProducts.length,
      steps,
      finalResultUrl: currentSourceImage, // Supabase URL
    });
  } catch (error) {
    console.error("Multi-step try-on error:", error);
    res.status(500).json({ 
      error: "Failed to process multi-step try-on", 
      details: String(error) 
    });
  }
});

// POST /api/tryon - Initiate try-on (single product)
tryonRouter.post("/", async (req, res) => {
  try {
    const input = TryonRequestSchema.parse(req.body);
    
    // Get user from auth header
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authorization required" });
    }
    
    if (!isYouCamConfigured()) {
      return res.status(503).json({
        error: "Try-on not available",
        reason: "YOUCAM_API_KEY not configured",
      });
    }
    
    // Check if user has a selfie
    const [selfie] = await db
      .select()
      .from(userSelfies)
      .where(eq(userSelfies.userId, userId))
      .limit(1);
    
    if (!selfie) {
      return res.status(400).json({
        error: "No selfie on file",
        message: "Please upload a selfie first",
      });
    }
    
    // Get product images (first product in the list)
    const productId = input.productIds[0];
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Get garment image URL (use first image or processed image)
    const garmentImageUrl = (product as any).processedImages?.[0] || product.images?.[0];
    if (!garmentImageUrl) {
      return res.status(400).json({ error: "No product images available" });
    }
    
    // Get selfie URL (use processed if available)
    const selfieImageUrl = selfie.processedImageUrl || selfie.imageUrl;
    
    // Call YouCam API with direct URLs (v3 API)
    const apiKey = getYouCamApiKey();
    console.log("Creating AI-Cloth task with:");
    console.log("  Selfie URL:", selfieImageUrl);
    console.log("  Garment URL:", garmentImageUrl);
    console.log("  Product count:", input.productIds.length);
    
    const garmentCategory = detectGarmentCategory(product);
    
    const taskResponse = await createAIClothTask(
      {
        src_file_url: selfieImageUrl,
        ref_file_url: garmentImageUrl,
        garment_category: garmentCategory,
      },
      apiKey
    );
    
    console.log("AI-Cloth task created:", taskResponse.task_id, "status:", taskResponse.task_status);
    
    // Create task record in DB
    const [task] = await db.insert(tryonTasks).values({
      userId,
      productIds: input.productIds,
      selfieId: selfie.id,
      externalTaskId: taskResponse.task_id,
      status: "processing",
    }).returning();
    
    res.status(201).json({
      taskId: task.id,
      status: taskResponse.task_status,
      externalTaskId: taskResponse.task_id,
      message: taskResponse.task_status === "success" 
        ? "Try-on complete!" 
        : "Processing try-on...",
    });
  } catch (error) {
    console.error("Try-on error:", error);
    res.status(500).json({ error: "Failed to initiate try-on", details: String(error) });
  }
});

// POST /api/tryon/selfie - Upload selfie
tryonRouter.post("/selfie", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authorization required" });
    }
    
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: "imageUrl required" });
    }

    // Create selfie record
    const [selfie] = await db.insert(userSelfies).values({
      userId,
      imageUrl,
      isDefault: true,
    }).returning();

    // Trigger async selfie prep (background removal + enhancement)
    if (isYouCamConfigured()) {
      const apiKey = getYouCamApiKey();
      processSelfie(selfie.id, imageUrl, userId, apiKey).catch((err) => {
        console.error(`Async selfie prep failed for ${selfie.id}:`, err);
      });
    }

    res.status(201).json({
      selfieId: selfie.id,
      imageUrl: selfie.imageUrl,
      processedImageUrl: null,
      status: "processing",
      message: "Selfie uploaded, processing in background",
    });
  } catch (error) {
    console.error("Selfie upload error:", error);
    res.status(500).json({ error: "Failed to upload selfie" });
  }
});

// GET /api/tryon/selfies - List user selfies
tryonRouter.get("/selfies", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authorization required" });
    }
    
    const selfies = await db
      .select()
      .from(userSelfies)
      .where(eq(userSelfies.userId, userId))
      .orderBy(userSelfies.createdAt);
    
    res.json({
      selfies: selfies.map(s => ({
        id: s.id,
        imageUrl: s.imageUrl,
        processedImageUrl: s.processedImageUrl,
        isDefault: s.isDefault,
        status: s.processedImageUrl ? "completed" : "processing",
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error("Selfies list error:", error);
    res.status(500).json({ error: "Failed to list selfies" });
  }
});

// Webhook endpoint for YouCam completion
tryonRouter.post("/webhook", async (req, res) => {
  try {
    // Get raw body for signature verification
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error("Webhook: Raw body not available");
      return res.status(400).json({ error: "Raw body not available" });
    }
    
    // Get signature from header
    const signature = req.headers["x-yce-webhook-signature"] as string;
    if (!signature) {
      console.error("Webhook: Missing signature header");
      return res.status(400).json({ error: "Missing signature header" });
    }
    
    // Verify webhook signature
    const webhookSecret = getYouCamWebhookSecret();
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);
    
    if (!isValid) {
      console.error("Webhook: Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    
    // Parse payload
    const payload: YouCamWebhookPayload = JSON.parse(rawBody);
    console.log("Webhook received:", {
      webhook_id: payload.webhook_id,
      task_id: payload.task_id,
      task_type: payload.task_type,
      task_status: payload.task_status,
    });
    
    // Find the tryon task by external task ID
    const [task] = await db
      .select()
      .from(tryonTasks)
      .where(eq(tryonTasks.externalTaskId, payload.task_id))
      .limit(1);
    
    if (!task) {
      console.error("Webhook: Task not found for external ID:", payload.task_id);
      return res.status(404).json({ error: "Task not found" });
    }
    
    // Update task based on status
    if (payload.task_status === "success" && payload.results?.[0]) {
      const resultUrl = payload.results[0].url || payload.results[0].result_image_url;
      await db
        .update(tryonTasks)
        .set({
          status: "completed",
          resultImageUrl: resultUrl,
          completedAt: new Date(),
        })
        .where(eq(tryonTasks.id, task.id));
      
      console.log(`Try-on task ${task.id} completed with result:`, resultUrl);
    } else if (payload.task_status === "error") {
      await db
        .update(tryonTasks)
        .set({
          status: "failed",
          errorMessage: payload.error?.message || "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(tryonTasks.id, task.id));
      
      console.error(`Try-on task ${task.id} failed:`, payload.error);
    }
    
    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// GET /api/tryon/:taskId - Get try-on status
tryonRouter.get("/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [task] = await db
      .select()
      .from(tryonTasks)
      .where(eq(tryonTasks.id, taskId))
      .limit(1);
    
    if (!task) {
      return res.status(404).json({ error: "Try-on task not found" });
    }
    
    // If task is still processing, poll YouCam for latest status
    if (task.status === "processing" && task.externalTaskId && isYouCamConfigured()) {
      try {
        const apiKey = getYouCamApiKey();
        const youcamStatus = await getTaskStatus(task.externalTaskId, "cloth-v3", apiKey);
        
        console.log(`Polled YouCam for task ${task.externalTaskId}:`, youcamStatus.task_status);
        
        const resultUrl = extractResultUrl(youcamStatus);
        
        // Update local status if changed
        if (youcamStatus.task_status === "success" && resultUrl) {
          await db
            .update(tryonTasks)
            .set({
              status: "completed",
              resultImageUrl: resultUrl,
              completedAt: new Date(),
            })
            .where(eq(tryonTasks.id, task.id));
          
          return res.json({
            taskId: task.id,
            status: "completed",
            productIds: task.productIds,
            resultImageUrl: resultUrl,
            completedAt: new Date().toISOString(),
          });
        }
        
        if (youcamStatus.task_status === "error") {
          await db
            .update(tryonTasks)
            .set({
              status: "failed",
              errorMessage: youcamStatus.error?.message || "YouCam processing failed",
              completedAt: new Date(),
            })
            .where(eq(tryonTasks.id, task.id));
          
          return res.json({
            taskId: task.id,
            status: "failed",
            productIds: task.productIds,
            errorMessage: youcamStatus.error?.message || "YouCam processing failed",
            completedAt: new Date().toISOString(),
          });
        }
      } catch (pollError) {
        console.error("Failed to poll YouCam:", pollError);
        // Continue with local status
      }
    }
    
    res.json({
      taskId: task.id,
      status: task.status,
      productIds: task.productIds,
      resultImageUrl: task.resultImageUrl,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    });
  } catch (error) {
    console.error("Try-on status error:", error);
    res.status(500).json({ error: "Failed to get try-on status" });
  }
});
