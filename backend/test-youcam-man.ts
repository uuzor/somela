/**
 * Test script for YouCam AI-Cloth with actual manstanding.webp
 * Tests: Jeans + Shirt on a real person
 */

import "dotenv/config";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";
const LOCAL_SERVER = "http://localhost:8080";

async function createAndPollTask(
  name: string,
  selfieUrl: string,
  garmentUrl: string,
  category: "upper_body" | "lower_body" | "full_body"
): Promise<{ success: boolean; resultUrl?: string; error?: string }> {
  const apiKey = getYouCamApiKey();
  
  console.log(`\n📷 ${name}`);
  console.log(`   Source: ${selfieUrl}`);
  console.log(`   Garment: ${garmentUrl}`);
  
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
    await new Promise(r => setTimeout(r, 3000));
    
    const statusRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    
    const statusData = await statusRes.json() as { 
      status: number; 
      data: { task_status: string; results?: any; error_message?: string } 
    };
    
    const taskStatus = statusData.data.task_status;
    console.log(`   [${i + 1}] Status: ${taskStatus}`);
    
    if (taskStatus === "success") {
      let resultUrl: string | null = null;
      if (statusData.data.results) {
        resultUrl = statusData.data.results?.url || statusData.data.results?.Result_image_url || null;
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
  console.log("🧪 Testing YouCam AI-Cloth with Man + Jeans + Shirt\n");
  console.log("=".repeat(60));
  
  // Using uploaded URLs (accessible from internet)
  const selfieUrl = "https://file.io/wWwjiSASO7Kq/manstanding.webp";
  const jeansUrl = "https://file.io/wvw3iPA5O9cI/jeans_product.jpg";
  const shirtUrl = "https://file.io/wCwWiCAlOfnh/shirt.webp";

  console.log("\n📋 Test Plan:");
  console.log("   1. Try on Jeans (lower_body)");
  console.log("   2. Try on Shirt (upper_body) using jeans result");
  
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
    console.log("\n❌ Failed to try on jeans");
    return;
  }
  
  console.log(`\n   📸 Jeans Result URL:`);
  console.log(`      ${jeansResult.resultUrl}`);
  
  // Step 2: Try on shirt with the jeans result
  console.log("\n" + "=".repeat(60));
  console.log("Step 2: Try on Shirt (upper_body) using jeans result");
  
  const shirtResult = await createAndPollTask(
    "Shirt",
    jeansResult.resultUrl,
    shirtUrl,
    "upper_body"
  );
  
  if (!shirtResult.success || !shirtResult.resultUrl) {
    console.log("\n❌ Failed to try on shirt");
    console.log("\n✅ Still got jeans result!");
    console.log("\n📸 Final Jeans Result:");
    console.log(`   ${jeansResult.resultUrl}`);
    return;
  }
  
  console.log(`\n   📸 Shirt Result URL:`);
  console.log(`      ${shirtResult.resultUrl}`);
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 Final Results:");
  console.log(`   Step 1 - Jeans: ${jeansResult.resultUrl}`);
  console.log(`   Step 2 - Jeans + Shirt: ${shirtResult.resultUrl}`);
  console.log("\n✅ Multi-product try-on test complete!");
}

main();
