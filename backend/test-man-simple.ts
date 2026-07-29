import "dotenv/config";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";

async function createAndPoll(name, selfieUrl, garmentUrl, category) {
  const apiKey = getYouCamApiKey();
  
  console.log(`Testing: ${name}`);
  
  const response = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ src_file_url: selfieUrl, ref_file_url: garmentUrl, garment_category: category }),
  });
  
  const data = await response.json();
  const taskId = data.data.task_id;
  console.log(`  Task: ${taskId.substring(0, 20)}...`);
  
  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(YOUCAM_BASE_URL + "/s2s/v2.0/task/cloth-v3/" + taskId, {
      headers: { Authorization: "Bearer " + apiKey },
    });
    const statusData = await statusRes.json();
    console.log(`  [${i+1}] ${statusData.data.task_status}`);
    
    if (statusData.data.task_status === "success") {
      return statusData.data.results?.url || statusData.data.results?.Result_image_url;
    }
    if (statusData.data.task_status === "error") {
      console.log(`  Error: ${statusData.data.error_message}`);
      return null;
    }
  }
  return null;
}

async function main() {
  // Using full-body images from Unsplash that worked
  const manUrl = "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400"; // Full body woman
  const jeansUrl = "https://cdn.shopify.com/s/files/1/0007/0051/4360/files/COZZI-M09002IAI_00_b0de9a91-6fea-4cc8-a795-8a2b45e3fede.jpg?v=1776186154";
  const shirtUrl = "https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=400"; // Shirt
  
  console.log("\n=== Step 1: Jeans ===");
  const result1 = await createAndPoll("Jeans", manUrl, jeansUrl, "lower_body");
  
  if (result1) {
    console.log("\n=== Step 2: Shirt ===");
    const result2 = await createAndPoll("Shirt", result1, shirtUrl, "upper_body");
    if (result2) {
      console.log("\n✅ SUCCESS!");
      console.log("Final:", result2);
    }
  } else {
    console.log("\n❌ Jeans failed");
  }
}

main();
