import { Router } from "express";
import { db, tryonTasks, userSelfies, products } from "../db/index.js";
import { eq } from "drizzle-orm";
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
  type YouCamWebhookPayload,
} from "../services/youcam.js";

export const tryonRouter = Router();

// Apply rate limiting
tryonRouter.post("/", tryonRateLimit);
tryonRouter.post("/selfie", tryonRateLimit);

// POST /api/tryon - Initiate try-on
tryonRouter.post("/", async (req, res) => {
  try {
    const input = TryonRequestSchema.parse(req.body);
    
    // Get user from auth header
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
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
    
    const taskResponse = await createAIClothTask(
      {
        src_file_url: selfieImageUrl,
        ref_file_url: garmentImageUrl,
        garment_category: "upper_body",
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

// POST /api/tryon/selfie - Upload selfie
tryonRouter.post("/selfie", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
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

// Raw body middleware for webhook signature verification
// This needs to be registered in index.ts
