/**
 * YouCam (Perfect Corp) API Client
 * 
 * Based on: docs.perfectcorp.com AI Clothes API
 * 
 * Flow:
 * 1. Auth: Authorization: Bearer YOUR_API_KEY
 * 2. Upload: File API to get upload URL + file_id, then PUT the image
 * 3. Initiate: POST to task endpoint → get task_id
 * 4. Resolve: Poll or Webhook (we use webhook for real-time)
 */

import crypto from "crypto";

const YOUCAM_BASE_URL = "https://v2-api.yce.perfectcorp.com";

// Type definitions
export interface YouCamFileUploadResponse {
  file_id: string;
  file_upload_url: string;
  expires_at: string;
}

export interface YouCamTaskResponse {
  task_id: string;
  task_status: "pending" | "processing" | "success" | "error";
  result?: YouCamTaskResult;
  error?: {
    code: string;
    message: string;
  };
}

export interface YouCamTaskResult {
  result_image_url: string;
  // Other fields depend on task type
}

export interface AIClothTaskParams {
  cloth_image_id: string;  // file_id from uploaded garment image
  person_image_id: string; // file_id from uploaded selfie
}

export interface BackgroundRemovalParams {
  image_id: string;  // file_id from uploaded image
}

export interface PhotoEnhanceParams {
  image_id: string;  // file_id from uploaded image
}

/**
 * Upload an image to YouCam and get a file_id
 * 
 * Steps:
 * 1. GET /s2s/v2.0/file/upload-url to get upload URL
 * 2. PUT image to that URL
 * 3. Use returned file_id for task creation
 */
export async function uploadImage(
  imageUrl: string,
  apiKey: string
): Promise<YouCamFileUploadResponse> {
  // Step 1: Get upload URL
  const uploadUrlResponse = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/file/upload-url`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!uploadUrlResponse.ok) {
    const error = await uploadUrlResponse.text();
    throw new Error(`Failed to get upload URL: ${error}`);
  }

  const { file_id, file_upload_url, expires_at } = await uploadUrlResponse.json() as YouCamFileUploadResponse;

  // Step 2: Fetch the image from the URL and upload to YouCam
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new Error(`Failed to fetch image from ${imageUrl}`);
  }
  const imageBuffer = await imageResponse.arrayBuffer();

  // Step 3: PUT the image to the upload URL
  const uploadResponse = await fetch(file_upload_url, {
    method: "PUT",
    body: imageBuffer,
    headers: {
      "Content-Type": "image/jpeg", // Adjust based on actual image type
    },
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload image: ${error}`);
  }

  return { file_id, file_upload_url, expires_at };
}

/**
 * Upload image from a buffer (for local file uploads)
 */
export async function uploadImageBuffer(
  buffer: Buffer,
  contentType: string,
  apiKey: string
): Promise<YouCamFileUploadResponse> {
  // Step 1: Get upload URL
  const uploadUrlResponse = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/file/upload-url`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!uploadUrlResponse.ok) {
    const error = await uploadUrlResponse.text();
    throw new Error(`Failed to get upload URL: ${error}`);
  }

  const { file_id, file_upload_url, expires_at } = await uploadUrlResponse.json() as YouCamFileUploadResponse;

  // Step 2: PUT the image to the upload URL
  const uploadResponse = await fetch(file_upload_url, {
    method: "PUT",
    body: buffer,
    headers: {
      "Content-Type": contentType,
    },
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.text();
    throw new Error(`Failed to upload image: ${error}`);
  }

  return { file_id, file_upload_url, expires_at };
}

/**
 * Create an AI-Cloth task for virtual try-on
 * 
 * Direct type: no template lookup needed
 * Takes garment image + person image → returns result image
 */
export async function createAIClothTask(
  params: AIClothTaskParams,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/ai-cloth`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cloth_image_id: params.cloth_image_id,
        person_image_id: params.person_image_id,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create AI-Cloth task: ${error}`);
  }

  return response.json() as unknown as YouCamTaskResponse;
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
        image_id: params.image_id,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create background removal task: ${error}`);
  }

  return response.json() as unknown as YouCamTaskResponse;
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
        image_id: params.image_id,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create photo enhance task: ${error}`);
  }

  return response.json() as unknown as YouCamTaskResponse;
}

/**
 * Poll task status
 */
export async function getTaskStatus(
  taskId: string,
  taskType: "ai-cloth" | "ai-photo-background-removal" | "ai-photo-enhance",
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
    throw new Error(`Failed to get task status: ${error}`);
  }

  return response.json() as unknown as YouCamTaskResponse;
}

// ============================================================================
// Webhook Verification
// ============================================================================

/**
 * Verify YouCam webhook signature
 * 
 * Signature scheme: HMAC-SHA256
 * Signed content: {webhook-id}.{webhook-timestamp}.{raw-minified-json-body}
 * 
 * @param payload Raw request body as string
 * @param signature Signature from header (whsec_xxxxx)
 * @param secret Webhook secret from YouCam console
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  // Extract the actual base64-encoded secret (remove whsec_ prefix if present)
  let actualSecret = secret;
  if (secret.startsWith("whsec_")) {
    actualSecret = secret.slice(6);
  }

  // The secret is base64-encoded - decode it
  const secretBuffer = Buffer.from(actualSecret, "base64");

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac("sha256", secretBuffer)
    .update(payload)
    .digest("base64");

  // Use timing-safe comparison
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
  task_type: "ai-cloth" | "ai-photo-background-removal" | "ai-photo-enhance";
  task_status: "success" | "error";
  result?: YouCamTaskResult;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Verify and parse webhook request
 * 
 * @param payload Raw request body as string
 * @param signature Signature from header
 * @param secret Webhook secret
 * @returns Parsed payload if valid, throws if invalid
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
  const secret = process.env.YOUCAM_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("YOUCAM_WEBHOOK_SECRET not configured");
  }
  return secret;
}
