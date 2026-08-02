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

async function processTryOnTask(taskId: string, selfie: any, productRecords: any[]) {
  try {
    const apiKey = getYouCamApiKey();
    let sourceImage = selfie.processedImageUrl || selfie.imageUrl;

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
      resultImageUrl: sourceImage,
      errorMessage: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(tryonTasks.id, taskId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.update(tryonTasks).set({
      status: "failed",
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
}) {
  const productIds = [...new Set(input.productIds.filter(Boolean))];
  if (productIds.length === 0 || productIds.length > 5) {
    fail("Try-on requires between one and five products.", 400);
  }

  const selfie = await resolveSelfie(input.userId, input.selfieId);
  const productRows = await Promise.all(
    productIds.map((id) => db.select(productSummarySelect).from(products).where(eq(products.id, id)).limit(1)),
  );
  const productRecords = productRows.map((rows) => rows[0]).filter(Boolean);
  if (productRecords.length !== productIds.length) fail("One or more products were not found.", 404);
  if (productRecords.some((product) => !(product.processedImages?.[0] || product.images?.[0]))) {
    fail("One or more products do not have a garment image.", 400);
  }

  const [task] = await db.insert(tryonTasks).values({
    userId: input.userId,
    sessionId: input.sessionId || null,
    productId: productIds[0],
    productIds,
    selfieId: selfie.id,
    userSelfieUrl: selfie.processedImageUrl || selfie.imageUrl,
    garmentImageUrl: productRecords[0].processedImages?.[0] || productRecords[0].images?.[0] || null,
    status: "processing",
  }).returning();

  void processTryOnTask(task.id, selfie, productRecords).catch((error) => {
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
