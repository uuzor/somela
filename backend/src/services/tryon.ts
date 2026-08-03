import { and, desc, eq } from "drizzle-orm";
import { db, products, tryonTasks, userSelfies } from "../db/index.js";
import { productSummarySelect } from "../db/product-select.js";
import { downloadFromUrl, generateStoragePath, uploadToStorage } from "./supabase.js";
import {
  createAIClothTask,
  extractResultUrl,
  getYouCamApiKey,
  pollTask,
} from "./youcam.js";

const BUCKET_NAME = "images";

function fail(message: string, status: number): never {
  const error = new Error(message);
  (error as any).status = status;
  throw error;
}

export function detectGarmentCategory(product: any): "upper_body" | "lower_body" | "full_body" {
  const combined = [
    product?.category,
    product?.productType,
    product?.title,
    ...(Array.isArray(product?.tags) ? product.tags : []),
  ].filter(Boolean).join(" ").toLowerCase();

  if (/dress|gown|jumpsuit|romper|full.?body/.test(combined)) return "full_body";
  if (/denim|pant|jean|trouser|skirt|short|bottom|leg/.test(combined)) return "lower_body";
  if (/top|shirt|blouse|sweater|hoodie|jacket|coat|blazer/.test(combined)) return "upper_body";
  return "full_body";
}

export async function saveTryOnResult(url: string, taskId: string, step: number) {
  try {
    const { buffer, contentType } = await downloadFromUrl(url);
    const path = generateStoragePath("tryon/" + taskId + "/step-" + step, "jpg");
    return await uploadToStorage(BUCKET_NAME, path, buffer, contentType);
  } catch (error) {
    console.error("Failed to persist try-on result:", error);
    return url;
  }
}

async function resolveSelfie(userId: string, selfieId?: string) {
  const rows = selfieId
    ? await db.select().from(userSelfies).where(and(eq(userSelfies.id, selfieId), eq(userSelfies.userId, userId))).limit(1)
    : await db.select().from(userSelfies).where(eq(userSelfies.userId, userId)).orderBy(desc(userSelfies.isDefault), desc(userSelfies.createdAt)).limit(1);
  const selfie = rows[0];
  if (!selfie) fail("No selfie on file. Please upload a selfie first.", 400);
  if (selfie.status === "processing") fail("Your selfie is still being prepared.", 409);
  if (selfie.status === "failed") fail(selfie.errorMessage || "Selfie preparation failed.", 422);
  return selfie;
}

async function processTryOnTask(taskId: string, sourceImageUrl: string, productRecords: any[]) {
  try {
    const apiKey = getYouCamApiKey();
    let sourceImage = sourceImageUrl;

    await db.update(tryonTasks).set({
      status: "processing",
      stage: "preparing",
      currentStep: 0,
      totalSteps: productRecords.length,
      updatedAt: new Date(),
    }).where(eq(tryonTasks.id, taskId));

    for (let index = 0; index < productRecords.length; index += 1) {
      const product = productRecords[index];
      const garmentImage = product.processedImages?.[0] || product.images?.[0];
      if (!garmentImage) throw new Error("No garment image available for " + product.title);

      const externalTask = await createAIClothTask({
        src_file_url: sourceImage,
        ref_file_url: garmentImage,
        garment_category: detectGarmentCategory(product),
      }, apiKey);

      await db.update(tryonTasks).set({
        externalTaskId: externalTask.task_id,
        garmentImageUrl: garmentImage,
        stage: "applying_garment",
        currentStep: index + 1,
        currentProductId: product.id,
        updatedAt: new Date(),
      }).where(eq(tryonTasks.id, taskId));

      const result = await pollTask(externalTask.task_id, "cloth-v3", apiKey, 60, 3000);
      const resultUrl = result ? extractResultUrl(result) : null;
      if (!resultUrl) {
        throw new Error(result?.error?.message || "YouCam try-on did not return an image");
      }

      sourceImage = await saveTryOnResult(resultUrl, taskId, index + 1);
    }

    await db.update(tryonTasks).set({
      status: "completed",
      stage: "completed",
      currentStep: productRecords.length,
      currentProductId: null,
      resultImageUrl: sourceImage,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tryonTasks.id, taskId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(tryonTasks).set({
      status: "failed",
      stage: "failed",
      errorMessage: message,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tryonTasks.id, taskId));
    throw error;
  }
}

export async function startTryOnJob(input: {
  userId: string;
  productIds: string[];
  selfieId?: string;
  sessionId?: string | null;
  parentTaskId?: string;
}) {
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  if (productIds.length !== 1) {
    fail("Incremental try-on accepts exactly one product at a time.", 400);
  }

  const parentTask = input.parentTaskId
    ? await getOwnedTryOnTask(input.userId, input.parentTaskId)
    : null;
  if (input.parentTaskId && !parentTask) fail("Previous try-on state was not found.", 404);
  if (parentTask && parentTask.status !== "completed") fail("Previous try-on state is not ready.", 409);
  if (parentTask && !parentTask.resultImageUrl) fail("Previous try-on state has no result image.", 409);

  const selfie = parentTask
    ? await resolveSelfie(input.userId, parentTask.selfieId || undefined)
    : await resolveSelfie(input.userId, input.selfieId);
  const sourceImageUrl = parentTask?.resultImageUrl || selfie.processedImageUrl || selfie.imageUrl;
  const productRows = await Promise.all(
    productIds.map((id) => db.select(productSummarySelect).from(products).where(eq(products.id, id)).limit(1)),
  );
  const productRecords = productRows.map((rows) => rows[0]).filter(Boolean);
  if (productRecords.length !== productIds.length) fail("One or more products were not found.", 404);
  if (productRecords.some((product) => !(product.processedImages?.[0] || product.images?.[0]))) {
    fail("One or more products do not have a garment image.", 400);
  }
  const garmentSlot = detectGarmentCategory(productRecords[0]);
  const outfitState = {
    ...((parentTask?.outfitState as Record<string, string> | null) || {}),
    [garmentSlot]: productIds[0],
  };

  const [task] = await db.insert(tryonTasks).values({
    userId: input.userId,
    sessionId: input.sessionId || null,
    productId: productIds[0],
    productIds,
    parentTaskId: parentTask?.id || null,
    sourceImageUrl,
    garmentSlot,
    outfitState,
    selfieId: selfie.id,
    userSelfieUrl: sourceImageUrl,
    garmentImageUrl: productRecords[0].processedImages?.[0] || productRecords[0].images?.[0] || null,
    status: "processing",
    stage: "queued",
    currentStep: 0,
    totalSteps: productIds.length,
  }).returning();

  void processTryOnTask(task.id, sourceImageUrl, productRecords).catch((error) => {
    console.error("Try-on background job failed:", error);
  });

  return task;
}

export async function getOwnedTryOnTask(userId: string, taskId: string) {
  const [task] = await db.select().from(tryonTasks)
    .where(and(eq(tryonTasks.id, taskId), eq(tryonTasks.userId, userId)))
    .limit(1);
  return task || null;
}

export async function listOwnedTryOnTasks(userId: string, limit = 20) {
  const tasks = await db.select().from(tryonTasks)
    .where(eq(tryonTasks.userId, userId))
    .orderBy(desc(tryonTasks.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50));
  return Promise.all(tasks.map(async (task) => {
    const ids = [...new Set([
      ...(Array.isArray(task.productIds) ? task.productIds : []),
      ...Object.values((task.outfitState as Record<string, string> | null) || {}),
    ])];
    const rows = await Promise.all(ids.map((id) => db.select(productSummarySelect).from(products).where(eq(products.id, id)).limit(1)));
    const resolvedProducts = rows.map((result) => result[0]).filter(Boolean);
    return {
      ...task,
      products: resolvedProducts.filter((product) => task.productIds?.includes(product.id)),
      outfitProducts: resolvedProducts.filter((product) => Object.values(task.outfitState || {}).includes(product.id)),
    };
  }));
}
