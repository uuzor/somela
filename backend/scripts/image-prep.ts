/**
 * Batch Image Prep Script
 * 
 * Processes scraped product images with:
 * 1. AI-Photo-Background-Removal
 * 2. AI-Photo-Enhance
 * 
 * Run after ingestion to prepare images for try-on.
 * 
 * Usage:
 *   YOUCAM_API_KEY=xxx DATABASE_URL=xxx npx tsx scripts/image-prep.ts
 */

import "dotenv/config";
import postgres from "postgres";
import {
  uploadImage,
  createBackgroundRemovalTask,
  createPhotoEnhanceTask,
  getTaskStatus,
  isYouCamConfigured,
} from "../src/services/youcam.js";

const DATABASE_URL = process.env.DATABASE_URL!;
const BATCH_SIZE = 10; // Process images in batches
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds

interface Product {
  id: string;
  images: string[];
  processed_images: string[];
}

interface BackgroundRemovalResult {
  file_id: string;
  result_url: string;
}

interface EnhanceResult {
  file_id: string;
  result_url: string;
}

/**
 * Poll for task completion
 */
async function pollTask(
  taskId: string,
  taskType: "ai-photo-background-removal" | "ai-photo-enhance",
  maxAttempts = 60 // 5 minutes max
): Promise<{ result_url: string } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getTaskStatus(taskId, taskType, process.env.YOUCAM_API_KEY!);
    
    if (status.task_status === "success" && status.result) {
      return { result_url: (status.result as any).result_image_url };
    }
    
    if (status.task_status === "error") {
      console.error(`Task ${taskId} failed:`, status.error);
      return null;
    }
    
    console.log(`  Task ${taskId} still processing... (${i + 1}/${maxAttempts})`);
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  
  console.error(`Task ${taskId} timed out`);
  return null;
}

/**
 * Process a single image through background removal and enhance
 */
async function processImage(imageUrl: string): Promise<string | null> {
  const apiKey = process.env.YOUCAM_API_KEY!;
  
  try {
    console.log(`  Uploading image...`);
    const upload = await uploadImage(imageUrl, apiKey);
    console.log(`  Uploaded, file_id: ${upload.file_id}`);
    
    // Background removal
    console.log(`  Creating background removal task...`);
    const bgRemovalTask = await createBackgroundRemovalTask(
      { image_id: upload.file_id },
      apiKey
    );
    console.log(`  Background removal task: ${bgRemovalTask.task_id}`);
    
    const bgResult = await pollTask(bgRemovalTask.task_id, "ai-photo-background-removal");
    if (!bgResult) {
      console.error(`  Background removal failed for ${imageUrl}`);
      return null;
    }
    
    // Upload background-removed image for enhance
    console.log(`  Uploading background-removed image for enhance...`);
    const bgUpload = await uploadImage(bgResult.result_url, apiKey);
    
    // Enhance
    console.log(`  Creating photo enhance task...`);
    const enhanceTask = await createPhotoEnhanceTask(
      { image_id: bgUpload.file_id },
      apiKey
    );
    console.log(`  Enhance task: ${enhanceTask.task_id}`);
    
    const enhanceResult = await pollTask(enhanceTask.task_id, "ai-photo-enhance");
    if (!enhanceResult) {
      console.error(`  Enhance failed for ${imageUrl}`);
      return bgResult.result_url; // Return background-removed at least
    }
    
    return enhanceResult.result_url;
  } catch (error) {
    console.error(`  Error processing ${imageUrl}:`, error);
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  if (!isYouCamConfigured()) {
    console.error("YOUCAM_API_KEY not configured");
    process.exit(1);
  }
  
  if (!DATABASE_URL) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }
  
  const db = postgres(DATABASE_URL, { ssl: "require" });
  
  try {
    // Get products without processed images
    const products = await db`
      SELECT id, images, processed_images
      FROM products
      WHERE images IS NOT NULL 
        AND array_length(images, 1) > 0
        AND (processed_images IS NULL OR array_length(processed_images, 1) = 0)
      LIMIT ${BATCH_SIZE}
    `;
    
    if (products.length === 0) {
      console.log("No products to process");
      return;
    }
    
    console.log(`Processing ${products.length} products...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (const product of products as any[]) {
      console.log(`\nProcessing product: ${product.id}`);
      const originalImages: string[] = product.images || [];
      
      if (originalImages.length === 0) {
        console.log(`  No images to process`);
        continue;
      }
      
      // Process only the first image for now
      const processedImages: string[] = [];
      const firstImage = originalImages[0];
      
      const processedUrl = await processImage(firstImage);
      if (processedUrl) {
        processedImages.push(processedUrl);
        successCount++;
      } else {
        failCount++;
      }
      
      // Update product in DB
      if (processedImages.length > 0) {
        await db`
          UPDATE products
          SET processed_images = ${processedImages}
          WHERE id = ${product.id}
        `;
        console.log(`  Updated product ${product.id} with processed images`);
      }
    }
    
    console.log(`\nDone! Success: ${successCount}, Failed: ${failCount}`);
  } finally {
    await db.end();
  }
}

main().catch(console.error);
