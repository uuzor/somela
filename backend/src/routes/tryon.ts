import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, tryonTasks, userSelfies } from "../db/index.js";
import { tryonRateLimit } from "../middleware/rateLimit.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";
import {
  getYouCamApiKey,
  getYouCamWebhookSecret,
  isYouCamConfigured,
  processSelfie,
  verifyWebhookSignature,
  type YouCamWebhookPayload,
} from "../services/youcam.js";
import { getOwnedTryOnTask, listOwnedTryOnTasks, saveTryOnResult, startTryOnJob } from "../services/tryon.js";

export const tryonRouter = Router();

const TryOnInputSchema = z.object({
  productIds: z.array(z.string().min(1)).length(1),
  selfieId: z.string().uuid().optional(),
  parentTaskId: z.string().uuid().optional(),
});

function sendError(res: any, error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ error: "Invalid try-on request", details: error.errors });
  }
  const status = Number((error as any)?.status || 500);
  const message = error instanceof Error ? error.message : fallback;
  return res.status(status).json({ error: status >= 500 ? fallback : message });
}

async function authenticatedUser(req: any): Promise<{ userId: string; sessionId: string | null }> {
  const identity = await resolveRequestIdentity(req);
  if (!identity.userId) {
    const error = new Error("Authorization required");
    (error as any).status = 401;
    throw error;
  }
  return { userId: identity.userId, sessionId: identity.sessionId || null };
}

function serializeTask(task: any) {
  return {
    taskId: task.id,
    status: task.status,
    stage: task.stage || "queued",
    currentStep: task.currentStep || 0,
    totalSteps: task.totalSteps || Math.max(task.productIds?.length || 1, 1),
    currentProductId: task.currentProductId || null,
    productIds: task.productIds || [],
    products: task.products || [],
    outfitProducts: task.outfitProducts || [],
    parentTaskId: task.parentTaskId || null,
    sourceImageUrl: task.sourceImageUrl || null,
    garmentSlot: task.garmentSlot || null,
    outfitState: task.outfitState || {},
    selfieId: task.selfieId || null,
    userSelfieUrl: task.userSelfieUrl || null,
    resultImageUrl: task.resultImageUrl || null,
    errorMessage: task.errorMessage || null,
    externalTaskId: task.externalTaskId || null,
    createdAt: task.createdAt,
    completedAt: task.completedAt || null,
  };
}

tryonRouter.post("/", tryonRateLimit, async (req, res) => {
  try {
    if (!isYouCamConfigured()) {
      return res.status(503).json({ error: "Try-on not available", reason: "YOUCAM_API_KEY not configured" });
    }
    const input = TryOnInputSchema.parse(req.body);
    const identity = await authenticatedUser(req);
    const task = await startTryOnJob({
      userId: identity.userId,
      sessionId: identity.sessionId,
      productIds: input.productIds,
      selfieId: input.selfieId,
      parentTaskId: input.parentTaskId,
    });
    return res.status(202).json(serializeTask(task));
  } catch (error) {
    console.error("Try-on start error:", error);
    return sendError(res, error, "Failed to initiate try-on");
  }
});

tryonRouter.post("/multi", tryonRateLimit, async (req, res) => {
  return res.status(410).json({
    error: "Batch try-on has been replaced by incremental try-on. Apply one product to the current look at a time.",
  });
});

tryonRouter.post("/selfie", tryonRateLimit, async (req, res) => {
  try {
    const identity = await authenticatedUser(req);
    const input = z.object({ imageUrl: z.string().url() }).parse(req.body);

    await db.update(userSelfies).set({ isDefault: false }).where(eq(userSelfies.userId, identity.userId));
    const configured = isYouCamConfigured();
    const [selfie] = await db.insert(userSelfies).values({
      userId: identity.userId,
      imageUrl: input.imageUrl,
      isDefault: true,
      status: configured ? "processing" : "completed",
    }).returning();

    if (configured) {
      void processSelfie(selfie.id, selfie.imageUrl, identity.userId, getYouCamApiKey()).catch((error) => {
        console.error("Async selfie preparation failed:", error);
      });
    }

    return res.status(201).json({
      selfieId: selfie.id,
      imageUrl: selfie.imageUrl,
      processedImageUrl: selfie.processedImageUrl,
      status: selfie.status,
      errorMessage: selfie.errorMessage,
    });
  } catch (error) {
    console.error("Selfie registration error:", error);
    return sendError(res, error, "Failed to register selfie");
  }
});

tryonRouter.get("/selfies", async (req, res) => {
  try {
    const identity = await authenticatedUser(req);
    const selfies = await db.select().from(userSelfies)
      .where(eq(userSelfies.userId, identity.userId))
      .orderBy(desc(userSelfies.isDefault), desc(userSelfies.createdAt));
    return res.json({
      selfies: selfies.map((selfie) => ({
        id: selfie.id,
        imageUrl: selfie.imageUrl,
        processedImageUrl: selfie.processedImageUrl,
        isDefault: selfie.isDefault,
        status: selfie.status,
        errorMessage: selfie.errorMessage,
        createdAt: selfie.createdAt,
      })),
    });
  } catch (error) {
    console.error("Selfie list error:", error);
    return sendError(res, error, "Failed to list selfies");
  }
});

tryonRouter.get("/history", async (req, res) => {
  try {
    const identity = await authenticatedUser(req);
    const limit = z.coerce.number().int().min(1).max(50).default(20).parse(req.query.limit);
    const tasks = await listOwnedTryOnTasks(identity.userId, limit);
    return res.json({ jobs: tasks.map(serializeTask) });
  } catch (error) {
    console.error("Try-on history error:", error);
    return sendError(res, error, "Failed to list try-on history");
  }
});

tryonRouter.post("/webhook", async (req, res) => {
  try {
    const rawBody = (req as any).rawBody;
    const signature = req.headers["x-yce-webhook-signature"] as string;
    if (!rawBody || !signature) return res.status(400).json({ error: "Missing webhook body or signature" });
    if (!verifyWebhookSignature(rawBody, signature, getYouCamWebhookSecret())) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const payload = JSON.parse(rawBody) as YouCamWebhookPayload;
    const [task] = await db.select().from(tryonTasks)
      .where(eq(tryonTasks.externalTaskId, payload.task_id))
      .limit(1);
    if (!task) return res.status(404).json({ error: "Task not found" });

    // Multi-step jobs are finalized by the background worker after the last garment.
    if ((task.productIds?.length || 0) > 1) return res.json({ received: true });

    if (payload.task_status === "success" && payload.results?.[0]) {
      const remoteUrl = payload.results[0].url || payload.results[0].result_image_url;
      if (remoteUrl) {
        const resultImageUrl = await saveTryOnResult(remoteUrl, task.id, 1);
        await db.update(tryonTasks).set({
          status: "completed",
          stage: "completed",
          currentStep: task.totalSteps || 1,
          currentProductId: null,
          resultImageUrl,
          errorMessage: null,
          completedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(tryonTasks.id, task.id));
      }
    } else if (payload.task_status === "error") {
      await db.update(tryonTasks).set({
        status: "failed",
        stage: "failed",
        errorMessage: payload.error?.message || "YouCam processing failed",
        completedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(tryonTasks.id, task.id));
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Try-on webhook error:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
});

tryonRouter.get("/:taskId", async (req, res) => {
  try {
    const identity = await authenticatedUser(req);
    const task = await getOwnedTryOnTask(identity.userId, req.params.taskId);
    if (!task) return res.status(404).json({ error: "Try-on task not found" });
    return res.json(serializeTask(task));
  } catch (error) {
    console.error("Try-on status error:", error);
    return sendError(res, error, "Failed to get try-on status");
  }
});
