import { Router } from "express";
import { db, visualSearchTasks } from "../db/index.js";
import { eq } from "drizzle-orm";
import { VisualSearchRequestSchema } from "../types/api.js";
import { 
  vectorSearchWithConfidence, 
  isVectorSearchAvailable,
  bucketConfidence,
  type SearchResultWithConfidence
} from "../services/vector.js";
import { visualSearchRateLimit } from "../middleware/rateLimit.js";

export const visualSearchRouter = Router();

// Apply rate limiting to POST endpoints
visualSearchRouter.post("/", visualSearchRateLimit);

// POST /api/visual-search - Upload image for visual search
visualSearchRouter.post("/", async (req, res) => {
  try {
    const input = VisualSearchRequestSchema.parse(req.body);
    
    if (!isVectorSearchAvailable()) {
      return res.status(503).json({
        error: "Visual search not available",
        reason: "VOYAGE_API_KEY or DATABASE_URL not configured",
      });
    }
    
    // Create task
    const [task] = await db.insert(visualSearchTasks).values({
      queryImageUrl: input.imageUrl,
      queryText: input.text,
      status: "processing",
    }).returning();
    
    // Process in background (don't await)
    processVisualSearch(task.id, input).catch(console.error);
    
    res.status(201).json({
      taskId: task.id,
      status: "processing",
      message: "Processing visual search...",
    });
  } catch (error) {
    console.error("Visual search error:", error);
    res.status(400).json({ error: "Invalid visual search request", details: error });
  }
});

async function processVisualSearch(
  taskId: string, 
  input: { imageUrl?: string; text?: string }
) {
  try {
    if (!input.imageUrl && !input.text) {
      throw new Error("Either imageUrl or text must be provided");
    }
    
    // Use vector search from the service (handles embedding and search)
    const results = await vectorSearchWithConfidence(
      { imageUrl: input.imageUrl, text: input.text },
      12
    );
    
    // Update task with results
    await db.update(visualSearchTasks)
      .set({ 
        status: "completed", 
        results: results as any,
        completedAt: new Date(),
      })
      .where(eq(visualSearchTasks.id, taskId));
      
    console.log(`Visual search ${taskId} completed with ${results.length} results`);
  } catch (error) {
    console.error(`Visual search ${taskId} failed:`, error);
    await db.update(visualSearchTasks)
      .set({ status: "failed", errorMessage: String(error) })
      .where(eq(visualSearchTasks.id, taskId));
  }
}

// GET /api/visual-search/:taskId - Get visual search results
visualSearchRouter.get("/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [task] = await db
      .select()
      .from(visualSearchTasks)
      .where(eq(visualSearchTasks.id, taskId))
      .limit(1);
    
    if (!task) {
      return res.status(404).json({ error: "Visual search task not found" });
    }
    
    res.json({
      taskId: task.id,
      status: task.status,
      queryImageUrl: task.queryImageUrl,
      queryText: task.queryText,
      results: task.results,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    });
  } catch (error) {
    console.error("Visual search status error:", error);
    res.status(500).json({ error: "Failed to get visual search status" });
  }
});

// Webhook for YouCam background removal completion
visualSearchRouter.post("/webhook", async (req, res) => {
  // TODO: Implement YouCam webhook handler
  // - Verify HMAC signature
  // - Embed cleaned image
  // - Run vector search
  // - Store results
  res.json({ received: true });
});
