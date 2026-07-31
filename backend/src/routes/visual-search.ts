import { Router } from "express";
import { db, visualSearchTasks } from "../db/index.js";
import { eq } from "drizzle-orm";
import { VisualSearchRequestSchema } from "../types/api.js";
import {
  vectorSearchWithConfidence,
  isVectorSearchAvailable,
} from "../services/vector.js";
import {
  createBackgroundRemovalTask,
  getYouCamApiKey,
  isYouCamConfigured,
  getYouCamWebhookSecret,
  verifyWebhookSignature,
  extractResultUrl,
  pollTask,
  type YouCamWebhookPayload,
} from "../services/youcam.js";
import { visualSearchRateLimit } from "../middleware/rateLimit.js";

export const visualSearchRouter = Router();

visualSearchRouter.post("/", visualSearchRateLimit);

async function processVisualSearch(
  taskId: string,
  input: { imageUrl?: string; text?: string }
) {
  try {
    const [task] = await db
      .select()
      .from(visualSearchTasks)
      .where(eq(visualSearchTasks.id, taskId))
      .limit(1);

    if (!task || task.status !== "processing") {
      return;
    }

    if (!input.imageUrl && !input.text) {
      throw new Error("Either imageUrl or text must be provided");
    }

    const results = await vectorSearchWithConfidence(
      { imageUrl: input.imageUrl, text: input.text },
      12
    );

    await db
      .update(visualSearchTasks)
      .set({
        status: "completed",
        results: results as any,
        completedAt: new Date(),
      })
      .where(eq(visualSearchTasks.id, taskId));

    console.log(`Visual search ${taskId} completed with ${results.length} results`);
  } catch (error) {
    console.error(`Visual search ${taskId} failed:`, error);
    await db
      .update(visualSearchTasks)
      .set({ status: "failed", errorMessage: String(error), completedAt: new Date() })
      .where(eq(visualSearchTasks.id, taskId));
  }
}

async function processVisualSearchAfterBackgroundRemoval(taskId: string, bgTaskId: string) {
  const [task] = await db
    .select()
    .from(visualSearchTasks)
    .where(eq(visualSearchTasks.id, taskId))
    .limit(1);

  if (!task || task.status !== "processing") {
    return;
  }

  const apiKey = getYouCamApiKey();
  const bgResult = await pollTask(bgTaskId, "ai-photo-background-removal", apiKey, 60, 3000);
  const resultUrl = bgResult ? extractResultUrl(bgResult) : null;

  await processVisualSearch(taskId, {
    imageUrl: resultUrl || task.queryImageUrl || undefined,
    text: task.queryText || undefined,
  });
}

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

    const [task] = await db.insert(visualSearchTasks).values({
      queryImageUrl: input.imageUrl,
      queryText: input.text,
      status: "processing",
    }).returning();

    if (isYouCamConfigured() && input.imageUrl) {
      const apiKey = getYouCamApiKey();
      const bgTask = await createBackgroundRemovalTask(
        { image_url: input.imageUrl },
        apiKey
      );

      await db
        .update(visualSearchTasks)
        .set({ externalTaskId: bgTask.task_id })
        .where(eq(visualSearchTasks.id, task.id));

      processVisualSearchAfterBackgroundRemoval(task.id, bgTask.task_id).catch(console.error);
    } else {
      processVisualSearch(task.id, input).catch(console.error);
    }

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

// Webhook for YouCam background removal completion
visualSearchRouter.post("/webhook", async (req, res) => {
  try {
    const rawBody = (req as any).rawBody;
    if (!rawBody) {
      console.error("Webhook: Raw body not available");
      return res.status(400).json({ error: "Raw body not available" });
    }

    const signature = req.headers["x-yce-webhook-signature"] as string;
    if (!signature) {
      console.error("Webhook: Missing signature header");
      return res.status(400).json({ error: "Missing signature header" });
    }

    const webhookSecret = getYouCamWebhookSecret();
    const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

    if (!isValid) {
      console.error("Webhook: Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload: YouCamWebhookPayload = JSON.parse(rawBody);
    console.log("Webhook received:", {
      webhook_id: payload.webhook_id,
      task_id: payload.task_id,
      task_type: payload.task_type,
      task_status: payload.task_status,
    });

    const [task] = await db
      .select()
      .from(visualSearchTasks)
      .where(eq(visualSearchTasks.externalTaskId, payload.task_id))
      .limit(1);

    if (!task) {
      console.error("Webhook: Task not found for external ID:", payload.task_id);
      return res.status(404).json({ error: "Task not found" });
    }

    if (payload.task_status === "success" && payload.results?.[0]) {
      const resultUrl = payload.results[0].url || payload.results[0].result_image_url;
      if (!resultUrl) {
        console.error("Webhook: No result URL in payload");
        return res.status(400).json({ error: "No result URL in payload" });
      }

      await processVisualSearch(task.id, {
        imageUrl: resultUrl,
        text: task.queryText || undefined,
      });
    } else if (payload.task_status === "error") {
      await db
        .update(visualSearchTasks)
        .set({
          status: "failed",
          errorMessage: payload.error?.message || "Unknown error",
          completedAt: new Date(),
        })
        .where(eq(visualSearchTasks.id, task.id));

      console.error(`Visual search task ${task.id} failed:`, payload.error);
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

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
