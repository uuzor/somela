/**
 * YouCam (Perfect Corp) API Client
 * 
 * Based on: docs.perfectcorp.com AI Clothes API V3
 * 
 * Flow:
 * 1. Auth: Authorization: Bearer YOUR_API_KEY
 * 2. Create task with src_file_url (person) and ref_file_url (garment)
 * 3. Poll for result or use webhook
 */

import crypto from "crypto";

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

/**
 * For AI-Cloth v3, we can use src_file_url and ref_file_url directly
 */
export async function uploadImage(
  imageUrl: string,
  _apiKey: string
): Promise<YouCamFileUploadResponse> {
  try {
    new URL(imageUrl);
  } catch {
    throw new Error(`Invalid image URL: ${imageUrl}`);
  }
  console.log(`Using image URL directly: ${imageUrl}`);
  return { file_id: imageUrl };
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

/**
 * Poll task status for AI-Cloth v3
 */
export async function getTaskStatus(
  taskId: string,
  apiKey: string
): Promise<YouCamTaskResponse> {
  const response = await fetch(
    `${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3/${taskId}`,
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

  const apiResponse = await response.json() as YouCamApiResponse<YouCamTaskResponse>;
  console.log("Task status response:", JSON.stringify(apiResponse, null, 2));
  return apiResponse.data;
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
