import { Router } from "express";
import { db, tryonTasks, userSelfies, sessions } from "../db/index.js";
import { eq } from "drizzle-orm";
import { TryonRequestSchema } from "../types/api.js";

export const tryonRouter = Router();

// Placeholder for YouCam try-on - requires YOUCAM_API_KEY
// Full implementation in Phase 3

// POST /api/tryon - Initiate try-on
tryonRouter.post("/", async (req, res) => {
  try {
    const input = TryonRequestSchema.parse(req.body);
    
    // Get user from auth header
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }
    
    if (!process.env.YOUCAM_API_KEY) {
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
    
    // TODO: Implement YouCam AI-Cloth integration
    // For now, create a pending task
    const [task] = await db.insert(tryonTasks).values({
      userId,
      productIds: input.productIds,
      selfieId: selfie.id,
      status: "pending",
    }).returning();
    
    res.status(201).json({
      taskId: task.id,
      status: task.status,
      message: "Try-on coming in Phase 3",
    });
  } catch (error) {
    console.error("Try-on error:", error);
    res.status(400).json({ error: "Invalid try-on request", details: error });
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
  // TODO: Implement YouCam webhook handler
  // - Verify HMAC signature
  // - Update task status
  // - Store result image URL
  res.json({ received: true });
});
