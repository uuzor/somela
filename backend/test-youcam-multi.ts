/**
 * Test script for YouCam AI-Cloth with multiple products
 * Tests: 2-product sequential try-on (jeans then hoodie)
 * 
 * YouCam v3 supports ONE garment at a time.
 * For multiple products: try sequentially and compose results.
 */

import "dotenv/config";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";

async function createAndPollTask(
  name: string,
  selfieUrl: string,
  garmentUrl: string,
  category: "upper_body" | "lower_body" | "full_body"
): Promise<{ success: boolean; resultUrl?: string; error?: string }> {
  const apiKey = getYouCamApiKey();
  
  console.log(`\n📷 ${name}`);
  console.log(`   Garment: ${garmentUrl.substring(0, 70)}...`);
  
  const response = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      src_file_url: selfieUrl,
      ref_file_url: garmentUrl,
      garment_category: category,
    }),
  });
  
  const data = await response.json() as { status: number; data: { task_id: string } };
  const taskId = data.data.task_id;
  console.log(`   Task ID: ${taskId.substring(0, 30)}...`);
  
  // Poll for result
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 2000));
    
    const statusRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    
    const statusData = await statusRes.json() as { 
      status: number; 
      data: { task_status: string; results?: { url: string }[]; error_message?: string } 
    };
    
    const taskStatus = statusData.data.task_status;
    console.log(`   [${i + 1}] Status: ${taskStatus}`);
    
    if (taskStatus === "success") {
      // Results can be an array or an object
      let resultUrl: string | null = null;
      if (statusData.data.results) {
        if (Array.isArray(statusData.data.results)) {
          resultUrl = statusData.data.results[0]?.url || null;
        } else {
          resultUrl = (statusData.data.results as any)?.url || null;
        }
      }
      console.log(`   ✓ Success!`);
      return { success: true, resultUrl: resultUrl || undefined };
    }
    
    if (taskStatus === "error") {
      console.log(`   ✗ Error: ${statusData.data.error_message}`);
      return { success: false, error: statusData.data.error_message || "Unknown error" };
    }
  }
  
  console.log(`   ✗ Timed out`);
  return { success: false, error: "Timed out" };
}

async function main() {
  console.log("🧪 Testing YouCam AI-Cloth - Multi-Product Try-On\n");
  console.log("=".repeat(60));
  console.log("\n📋 Test Plan:");
  console.log("   1. Try on Jeans (lower_body)");
  console.log("   2. Try on Hoodie (upper_body) using jeans result");
  console.log("   3. This simulates full outfit try-on");
  
  // Test images - using a full-body photo for lower_body
  const selfieUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400"; // Full body woman
  const jeansUrl = "https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COZZI-M09002IAI_00_b0de9a91-6fea-4cc8-a795-8a2b45e3fede.jpg?v=1776186154"; // APC jeans
  const hoodieUrl = "https://images.unsplash.com/photo-1556821840-3a63f95609a7?w=400"; // Hoodie from Unsplash

  // Step 1: Try on jeans
  console.log("\n" + "=".repeat(60));
  console.log("Step 1: Try on Jeans (lower_body)");
  
  const jeansResult = await createAndPollTask(
    "Jeans",
    selfieUrl,
    jeansUrl,
    "lower_body"
  );
  
  if (!jeansResult.success || !jeansResult.resultUrl) {
    console.log("\n❌ Failed to try on jeans, cannot continue");
    return;
  }
  
  console.log(`   📸 Result: ${jeansResult.resultUrl}`);
  
  // Step 2: Try on hoodie with the jeans result
  console.log("\n" + "=".repeat(60));
  console.log("Step 2: Try on Hoodie (upper_body) using jeans result");
  
  const hoodieResult = await createAndPollTask(
    "Hoodie",
    jeansResult.resultUrl, // Use the jeans result as the new selfie
    hoodieUrl,
    "upper_body"
  );
  
  if (!hoodieResult.success || !hoodieResult.resultUrl) {
    console.log("\n❌ Failed to try on hoodie");
    console.log("   You may need to try a different hoodie image");
    return;
  }
  
  console.log(`   📸 Result: ${hoodieResult.resultUrl}`);
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Final Results:");
  console.log(`   Jeans result: ${jeansResult.resultUrl}`);
  console.log(`   Jeans + Hoodie result: ${hoodieResult.resultUrl}`);
  console.log("\n✅ Multi-product try-on test complete!");
}

main();
