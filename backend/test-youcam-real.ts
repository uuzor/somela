import "dotenv/config";
import { writeFileSync } from "fs";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";
const SUPABASE_URL = "https://xqfwcyodibmtzmfhjyqf.supabase.co/storage/v1/object/public/images";

async function createAndPoll(name, selfieUrl, garmentUrl, category) {
  const apiKey = getYouCamApiKey();
  
  console.log(`\n📷 ${name}`);
  console.log(`   Source: ${selfieUrl}`);
  console.log(`   Garment: ${garmentUrl}`);
  
  const response = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ src_file_url: selfieUrl, ref_file_url: garmentUrl, garment_category: category }),
  });
  
  const data = await response.json();
  const taskId = data.data.task_id;
  console.log(`   Task: ${taskId.substring(0, 20)}...`);
  
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3/" + taskId, {
      headers: { Authorization: "Bearer " + apiKey },
    });
    const statusData = await statusRes.json();
    console.log(`   [${i+1}] ${statusData.data.task_status}`);
    
    if (statusData.data.task_status === "success") {
      return statusData.data.results?.url || statusData.data.results?.Result_image_url;
    }
    if (statusData.data.task_status === "error") {
      console.log(`   Error: ${statusData.data.error_message}`);
      return null;
    }
  }
  return null;
}

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    writeFileSync(`../images/${filename}`, Buffer.from(buffer));
    console.log(`   ✓ Saved: ../images/${filename}`);
    return true;
  } catch (e) {
    console.log(`   ✗ Failed: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 YouCam Multi-Step Try-On with YOUR Images!");
  console.log("=".repeat(60));
  
  const manUrl = `${SUPABASE_URL}/manstanding.jpg`;
  const jeansUrl = `${SUPABASE_URL}/jeans_product.jpg`;
  const shirtUrl = `${SUPABASE_URL}/shirt.jpg`;

  console.log("\n📋 Plan:");
  console.log("   1. Try on Jeans (lower_body)");
  console.log("   2. Try on Shirt (upper_body)");

  // Step 1
  console.log("\n" + "=".repeat(60));
  console.log("Step 1: Jeans");
  const jeansResult = await createAndPoll("Jeans", manUrl, jeansUrl, "lower_body");
  
  if (!jeansResult) {
    console.log("\n❌ Jeans failed!");
    return;
  }
  console.log(`\n   📸 Jeans Result: ${jeansResult}`);
  await downloadImage(jeansResult, "result_jeans_only.jpg");

  // Step 2
  console.log("\n" + "=".repeat(60));
  console.log("Step 2: Shirt");
  const shirtResult = await createAndPoll("Shirt", jeansResult, shirtUrl, "upper_body");
  
  if (!shirtResult) {
    console.log("\n⚠️ Shirt failed, but jeans worked!");
    return;
  }
  console.log(`\n   📸 Final Result: ${shirtResult}`);
  await downloadImage(shirtResult, "result_jeans_shirt.jpg");

  console.log("\n" + "=".repeat(60));
  console.log("✅ SUCCESS!");
  console.log("=".repeat(60));
}

main();
