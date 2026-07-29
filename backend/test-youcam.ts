/**
 * Test script for YouCam AI-Cloth API
 * Usage: npx tsx test-youcam.ts
 */

import "dotenv/config";
import { 
  createAIClothTask, 
  getTaskStatus, 
  pollTask, 
  extractResultUrl,
  getYouCamApiKey 
} from "./src/services/youcam.js";

async function main() {
  console.log("🧪 Testing YouCam AI-Cloth API\n");

  const apiKey = getYouCamApiKey();
  
  // Test images - using the APC jeans product image
  const selfieUrl = "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400"; // Male portrait
  const garmentUrl = "https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COZZI-M09002IAI_00_b0de9a91-6fea-4cc8-a795-8a2b45e3fede.jpg?v=1776186154"; // APC jeans

  console.log("📷 Test images:");
  console.log("  Selfie:", selfieUrl);
  console.log("  Garment:", garmentUrl);
  console.log();

  try {
    // YouCam AI-Cloth v3 accepts direct URLs - no file upload needed
    console.log("1️⃣  Creating AI-Cloth task (lower_body for jeans)...");
    const task = await createAIClothTask(
      {
        src_file_url: selfieUrl,  // Direct URL works!
        ref_file_url: garmentUrl, // Direct URL works!
        garment_category: "lower_body", // jeans are lower body
      },
      apiKey
    );
    console.log("   ✓ Task created, task_id:", task.task_id);
    console.log("   Initial status:", task.task_status);

    // Step 2: Poll for results
    console.log("\n2️⃣  Polling for results...");
    console.log("   (This may take 30-60 seconds...)\n");
    
    const result = await pollTask(task.task_id, "cloth-v3", apiKey, 60, 5000);
    
    if (result) {
      console.log("   ✓ Task completed!");
      console.log("   Result URL:", extractResultUrl(result));
    } else {
      console.log("   ✗ Task failed or timed out");
    }

  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

main();
