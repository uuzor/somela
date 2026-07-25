import { Router } from "express";
import { db, tryonTasks, userSelfies, products } from "../db/index.js";
import { eq } from "drizzle-orm";
import { TryonRequestSchema } from "../types/api.js";
import { tryonRateLimit } from "../middleware/rateLimit.js";
import {
  uploadImage,
  createAIClothTask,
  getYouCamApiKey,
  getYouCamWebhookSecret,
  verifyWebhookSignature,
  isYouCamConfigured,
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
    const garmentImageUrl = product.processedImages?.[0] || product.images?.[0];
    if (!garmentImageUrl) {
      return res.status(400).json({ error: "No product images available" });
    }
    
    // Get selfie URL (use processed if available)
    const selfieImageUrl = selfie.processedImageUrl || selfie.imageUrl;
    
    // Upload images to YouCam
    const apiKey = getYouCamApiKey();
    console.log("Uploading garment image:", garmentImageUrl);
    const garmentUpload = await uploadImage(garmentImageUrl, apiKey);
    console.log("Garment uploaded, file_id:", garmentUpload.file_id);
    
    console.log("Uploading selfie image:", selfieImageUrl);
    const selfieUpload = await uploadImage(selfieImageUrl, apiKey);
    console.log("Selfie uploaded, file_id:", selfieUpload.file_id);
    
    // Create AI-Cloth task
    const taskResponse = await createAIClothTask(
      {
        cloth_image_id: garmentUpload.file_id,
        person_image_id: selfieUpload.file_id,
      },
      apiKey
    );
    console.log("AI-Cloth task created:", taskResponse.task_id);
    
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
      status: "processing",
      message: "Processing try-on...",
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
    
    // TODO: Implement YouCam selfie prep
    
    // Create selfie record
    const [selfie] = await db.insert(userSelfies).values({
      userId,
      imageUrl,
      isDefault: true,
    }).returning();
    
    res.status(201).json({
      selfieId: selfie.id,
      imageUrl: selfie.imageUrl,
      message: "Selfie uploaded (prep coming in Phase 3)",
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
    if (payload.task_status === "success" && payload.result) {
      await db
        .update(tryonTasks)
        .set({
          status: "completed",
          resultImageUrl: payload.result.result_image_url,
          completedAt: new Date(),
        })
        .where(eq(tryonTasks.id, task.id));
      
      console.log(`Try-on task ${task.id} completed with result:`, payload.result.result_image_url);
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
