import "dotenv/config";
import { writeFileSync } from "fs";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";
const OUTPUT_DIR = "../images";

async function createAndPoll(name, selfieUrl, garmentUrl, category) {
  const apiKey = getYouCamApiKey();
  
  console.log(`\n📷 ${name}`);
  
  const response = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ src_file_url: selfieUrl, ref_file_url: garmentUrl, garment_category: category }),
  });
  
  const data = await response.json();
  const taskId = data.data.task_id;
  console.log(`   Task created: ${taskId.substring(0, 20)}...`);
  
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3/" + taskId, {
      headers: { Authorization: "Bearer " + apiKey },
    });
    const statusData = await statusRes.json();
    console.log(`   [${i+1}] ${statusData.data.task_status}`);
    
    if (statusData.data.task_status === "success") {
      const url = statusData.data.results?.url || statusData.data.results?.Result_image_url;
      return url;
    }
    if (statusData.data.task_status === "error") {
      console.log(`   ✗ Error: ${statusData.data.error_message}`);
      return null;
    }
  }
  return null;
}

async function downloadImage(url: string, filename: string) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    writeFileSync(`${OUTPUT_DIR}/${filename}`, Buffer.from(buffer));
    console.log(`   ✓ Saved: ${OUTPUT_DIR}/${filename}`);
    return true;
  } catch (e) {
    console.log(`   ✗ Failed to download: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 YouCam Multi-Step Try-On Test");
  console.log("=".repeat(60));
  
  // Test images - using images that work with YouCam
  const manUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400"; // Full body woman
  const jeansUrl = "https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COZZI-M09002IAI_00_b0de9a91-6fea-4cc8-a795-8a2b45e3fede.jpg?v=1776186154"; // APC jeans
  const shirtUrl = "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400"; // White shirt
  
  console.log("\n📋 Plan:");
  console.log("   1. Try on Jeans (lower_body)");
  console.log("   2. Try on Shirt (upper_body) using jeans result");
  
  // Step 1: Jeans
  console.log("\n" + "=".repeat(60));
  console.log("Step 1: Try on Jeans");
  const jeansResult = await createAndPoll("Jeans", manUrl, jeansUrl, "lower_body");
  
  if (!jeansResult) {
    console.log("\n❌ Failed to try on jeans!");
    return;
  }
  console.log(`\n   📸 Jeans Result URL: ${jeansResult}`);
  
  // Download jeans result
  await downloadImage(jeansResult, "man_jeans_only.jpg");
  
  // Step 2: Shirt
  console.log("\n" + "=".repeat(60));
  console.log("Step 2: Try on Shirt (using jeans result)");
  const shirtResult = await createAndPoll("Shirt", jeansResult, shirtUrl, "upper_body");
  
  if (!shirtResult) {
    console.log("\n⚠️  Shirt failed, but jeans worked!");
    return;
  }
  console.log(`\n   📸 Final Result URL: ${shirtResult}`);
  
  // Download final result
  await downloadImage(shirtResult, "man_jeans_shirt.jpg");
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ SUCCESS!");
  console.log("=".repeat(60));
  console.log("\n📁 Output files in /images/:");
  console.log("   - man_jeans_only.jpg  (Step 1)");
  console.log("   - man_jeans_shirt.jpg (Step 2 - Final)");
}

main();
