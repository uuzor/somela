/**
 * YouCam (Perfect Corp) API Client
 *
 * Based on: docs.perfectcorp.com AI Clothes API V3
 *
 * Flow:
 * 1. Auth: Authorization: Bearer YOUR_API_KEY
 * 2. Upload: call the File API to get an upload URL + file_id, then PUT the image to that URL
 * 3. Initiate: POST the task config (e.g. /s2s/v2.0/task/skin-analysis, or AI-Cloth for our case) → get back a task_id
 * 4. Resolve: everything is async. Two ways to find out when it's done:
 *    - Poll: GET /{task-type}/${task_id} until task_status is success/error
 *    - Webhook: register an HTTPS endpoint once in the API Console; YouCam POSTs to it when the task finishes
 */

import crypto from "crypto";
import { db } from "../db/index.js";
import { userSelfies } from "../db/schema.js";
import { eq } from "drizzle-orm";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";

// Type definitions - YouCam API wraps responses in { status, data }
interface YouCamApiResponse<T> {
  status: number;
  data: T;
}

export interface YouCamFileUploadResponse {
  file_id: string;
}

export interface YouCamTaskResponse {
  task_id: string;
  task_status: "pending" | "processing" | "running" | "success" | "error";
  results?: Array<{ url: string; result_image_url?: string }> | { url: string; result_image_url?: string };
  error?: {
    code: string;
    message: string;
  };
}

export interface YouCamTaskResult {
  url: string;
  result_image_url?: string;
}

export interface AIClothTaskParams {
  src_file_url: string;   // URL of the person/selfie image
  ref_file_url: string;  // URL of the garment/clothing image
  garment_category?: "upper_body" | "lower_body" | "full_body";
}

export interface BackgroundRemovalParams {
  image_url: string;
}

export interface PhotoEnhanceParams {
  image_url: string;
}

// ============================================================================
// File Upload
// ============================================================================

/**
 * Upload an image to YouCam's File API.
 * Step 1: POST /s2s/v2.0/file/upload-url to get upload_url + file_id
 * Step 2: PUT the image bytes to upload_url
 */
export async function uploadImage(
  imageUrl: string,
  apiKey: string
): Promise<YouCamFileUploadResponse> {
  try {
    new URL(imageUrl);
  } catch {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }

  // Step 1: Get upload URL from YouCam File API (POST method)
  const uploadUrlResponse = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/file/upload-url`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ image_url: imageUrl }), // Send the image URL directly
    }
  );

  if (!uploadUrlResponse.ok) {
    const error = await uploadUrlResponse.text();
    throw new Error(`Failed to get upload URL: ${error}`);
  }

  const uploadData = (await uploadUrlResponse.json()) as YouCamApiResponse<{
    upload_url: string;
    file_id: string;
  }>;
  const { upload_url, file_id } = uploadData.data;

  // Step 2: Fetch the image and PUT it to the upload URL
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  const putResponse = await fetch(upload_url, {
    method: "PUT",
    body: imageBuffer,
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });

  if (!putResponse.ok) {
    const error = await putResponse.text();
    throw new Error(`Failed to upload image to YouCam: ${error}`);
  }

  console.log(`Image uploaded to YouCam, file_id: ${file_id}`);
  return { file_id };
}

// ============================================================================
// Task APIs
// ============================================================================

/**
 * Create an AI-Cloth v3 task for virtual try-on
 */
export async function createAIClothTask(
  params: AIClothTaskParams,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        src_file_url: params.src_file_url,
        ref_file_url: params.ref_file_url,
        garment_category: params.garment_category || "upper_body",
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create AI-Cloth task: ${error}`);
  }

  const apiResponse = await response.json() as YouCamApiResponse<{ task_id: string }>;
  console.log("Task created response:", apiResponse);

  return {
    task_id: apiResponse.data.task_id,
    task_status: "processing",
  };
}

/**
 * Create a background removal task
 */
export async function createBackgroundRemovalTask(
  params: BackgroundRemovalParams,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/ai-photo-background-removal`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: params.image_url,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create background removal task: ${error}`);
  }

  const apiResponse = await response.json() as YouCamApiResponse<{ task_id: string }>;
  return {
    task_id: apiResponse.data.task_id,
    task_status: "processing",
  };
}

/**
 * Create a photo enhancement task
 */
export async function createPhotoEnhanceTask(
  params: PhotoEnhanceParams,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/ai-photo-enhance`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: params.image_url,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create photo enhance task: ${error}`);
  }

  const apiResponse = await response.json() as YouCamApiResponse<{ task_id: string }>;
  return {
    task_id: apiResponse.data.task_id,
    task_status: "processing",
  };
}

// ============================================================================
// Task Polling
// ============================================================================

/**
 * Poll task status for any YouCam task type
 */
export async function getTaskStatus(
  taskId: string,
  taskType: string,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/${taskType}/${taskId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get task status for ${taskType}/${taskId}: ${error}`);
  }

  const apiResponse = await response.json() as YouCamApiResponse<YouCamTaskResponse>;
  return apiResponse.data;
}

/**
 * Poll a YouCam task until it completes or times out
 */
export async function pollTask(
  taskId: string,
  taskType: string,
  apiKey: string,
  maxAttempts = 60,
  pollIntervalMs = 5000
): Promise<YouCamTaskResponse | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTaskStatus(taskId, taskType, apiKey);

    if (status.task_status === "success") {
      return status;
    }

    if (status.task_status === "error") {
      console.error(`Task ${taskId} failed:`, status.error);
      return null;
    }

    console.log(`  Task ${taskId} still processing... (${i + 1}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  console.error(`Task ${taskId} timed out`);
  return null;
}

// ============================================================================
// Image Processing Pipeline
// ============================================================================

/**
 * Process an image through background removal and enhancement.
 * Returns the final processed image URL, or null on failure.
 */
export async function processImage(
  imageUrl: string,
  apiKey: string
): Promise<string | null> {
  try {
    // Step 1: Upload image to YouCam
    console.log(`  Uploading image...`);
    const upload = await uploadImage(imageUrl, apiKey);
    console.log(`  Uploaded, file_id: ${upload.file_id}`);

    // Step 2: Background removal
    console.log(`  Creating background removal task...`);
    const bgRemovalTask = await createBackgroundRemovalTask(
      { image_url: upload.file_id },
      apiKey
    );
    console.log(`  Background removal task: ${bgRemovalTask.task_id}`);

    const bgResult = await pollTask(
      bgRemovalTask.task_id,
      "ai-photo-background-removal",
      apiKey
    );
    if (!bgResult) {
      console.error(`  Background removal failed for ${imageUrl}`);
      return null;
    }

    const bgResultUrl = extractResultUrl(bgResult);
    if (!bgResultUrl) {
      console.error(`  No result URL from background removal for ${imageUrl}`);
      return null;
    }

    // Step 3: Upload background-removed image for enhancement
    console.log(`  Uploading background-removed image for enhance...`);
    const bgUpload = await uploadImage(bgResultUrl, apiKey);

    // Step 4: Enhance
    console.log(`  Creating photo enhance task...`);
    const enhanceTask = await createPhotoEnhanceTask(
      { image_url: bgUpload.file_id },
      apiKey
    );
    console.log(`  Enhance task: ${enhanceTask.task_id}`);

    const enhanceResult = await pollTask(
      enhanceTask.task_id,
      "ai-photo-enhance",
      apiKey
    );
    if (!enhanceResult) {
      console.error(`  Enhance failed for ${imageUrl}`);
      return bgResultUrl; // Return background-removed at least
    }

    const enhanceResultUrl = extractResultUrl(enhanceResult);
    return enhanceResultUrl ?? bgResultUrl;
  } catch (error) {
    console.error(`  Error processing ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Process a user selfie through background removal and enhancement.
 * Stores the result URL on the user_selfies record.
 */
export async function processSelfie(
  selfieId: string,
  imageUrl: string,
  userId: string,
  apiKey: string
): Promise<string | null> {
  console.log(`Processing selfie ${selfieId} for user ${userId}`);
  const processedUrl = await processImage(imageUrl, apiKey);

  if (processedUrl) {
    await db
      .update(userSelfies)
      .set({
        processedImageUrl: processedUrl,
      })
      .where(eq(userSelfies.id, selfieId));

    console.log(`Selfie ${selfieId} processed, stored at: ${processedUrl}`);
  } else {
    console.error(`Selfie ${selfieId} processing failed`);
  }

  return processedUrl;
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify YouCam webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const secretBuffer = Buffer.from(secret, "base64");
  const expectedSignature = crypto
    .createHmac("sha256", secretBuffer)
    .update(payload)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Parse webhook payload
 */
export interface YouCamWebhookPayload {
  webhook_id: string;
  webhook_timestamp: number;
  task_id: string;
  task_type: "cloth-v3" | "ai-photo-background-removal" | "ai-photo-enhance";
  task_status: "success" | "error";
  results?: YouCamTaskResult[];
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Verify and parse webhook request
 */
export function verifyAndParseWebhook(
  payload: string,
  signature: string,
  secret: string
): YouCamWebhookPayload {
  if (!verifyWebhookSignature(payload, signature, secret)) {
    throw new Error("Invalid webhook signature");
  }

  try {
    const data = JSON.parse(payload) as YouCamWebhookPayload;
    return data;
  } catch {
    throw new Error("Invalid webhook payload");
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if YouCam API is configured
 */
export function isYouCamConfigured(): boolean {
  return !!process.env.YOUCAM_API_KEY;
}

/**
 * Get YouCam API key
 */
export function getYouCamApiKey(): string {
  const apiKey = process.env.YOUCAM_API_KEY;
  if (!apiKey) {
    throw new Error("YOUCAM_API_KEY not configured");
  }
  return apiKey;
}

/**
 * Get YouCam webhook secret
 */
export function getYouCamWebhookSecret(): string {
  const secret = process.env.YOUCAM_SECRET_KEY;
  if (!secret) {
    throw new Error("YOUCAM_SECRET_KEY not configured");
  }
  return secret;
}

/**
 * Extract result URL from task response
 */
export function extractResultUrl(response: YouCamTaskResponse): string | null {
  if (!response.results) {
    return null;
  }

  // Handle both array and object formats
  const results = Array.isArray(response.results)
    ? response.results
    : [response.results];

  if (results.length === 0) {
    return null;
  }

  const result = results[0];
  return result?.url || result?.result_image_url || null;
}
