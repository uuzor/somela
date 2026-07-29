/**
 * Test YouCam with local images using base64 encoding
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";

async function tryOnWithBase64(
  name: string,
  srcBase64: string,
  refUrl: string,
  category: string
): Promise<string | null> {
  const apiKey = getYouCamApiKey();
  
  console.log(`\n${name}:`);
  
  const response = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      src_file_url: `data:image/jpeg;base64,${srcBase64}`,
      ref_file_url: refUrl,
      garment_category: category,
    }),
  });

  const data = await response.json();
  
  if (data.status !== 200) {
    console.log(`  Failed: ${JSON.stringify(data)}`);
    return null;
  }

  const taskId = data.data.task_id;
  console.log(`  Task: ${taskId.substring(0, 20)}...`);

  // Poll
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    
    const statusRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    
    const statusData = await statusRes.json();
    console.log(`  [${i + 1}] ${statusData.data?.task_status}`);
    
    if (statusData.data?.task_status === "success") {
      return statusData.data.results?.url || statusData.data.results?.Result_image_url;
    }
    if (statusData.data?.task_status === "error") {
      console.log(`  Error: ${statusData.data.error_message}`);
      return null;
    }
  }
  
  return null;
}

async function main() {
  console.log("=" .repeat(60));
  console.log("Testing YouCam with base64 encoded local images");
  console.log("=" .repeat(60));

  // Read and encode images
  const manBase64 = readFileSync("../manstanding.jpg").toString("base64");
  const jeansBase64 = readFileSync("../images/jeans_product.jpg").toString("base64");
  const shirtBase64 = readFileSync("../shirt.jpg").toString("base64");

  console.log(`\nImage sizes:`);
  console.log(`  manstanding: ${(manBase64.length / 1024).toFixed(1)} KB base64`);
  console.log(`  jeans: ${(jeansBase64.length / 1024).toFixed(1)} KB base64`);
  console.log(`  shirt: ${(shirtBase64.length / 1024).toFixed(1)} KB base64`);

  // Try jeans first
  const jeansResult = await tryOnWithBase64(
    "Step 1: Jeans",
    manBase64,
    `data:image/jpeg;base64,${jeansBase64}`,
    "lower_body"
  );

  if (jeansResult) {
    console.log(`\n  Result: ${jeansResult}`);
    
    // Save result
    try {
      const resultResponse = await fetch(jeansResult);
      const resultBuffer = await resultResponse.arrayBuffer();
      require("fs").writeFileSync("../images/man_jeans_base64.jpg", Buffer.from(resultBuffer));
      console.log("  Saved to ../images/man_jeans_base64.jpg");
    } catch (e) {
      console.log(`  Could not save: ${e.message}`);
    }

    // Try shirt
    const shirtResult = await tryOnWithBase64(
      "Step 2: Shirt",
      jeansResult, // Use jeans result URL
      `data:image/jpeg;base64,${shirtBase64}`,
      "upper_body"
    );

    if (shirtResult) {
      console.log(`\n  Final Result: ${shirtResult}`);
      console.log("\n✅ SUCCESS!");
      
      // Save final result
      try {
        const finalResponse = await fetch(shirtResult);
        const finalBuffer = await finalResponse.arrayBuffer();
        require("fs").writeFileSync("../images/man_final_base64.jpg", Buffer.from(finalBuffer));
        console.log("  Saved to ../images/man_final_base64.jpg");
      } catch (e) {
        console.log(`  Could not save: ${e.message}`);
      }
    }
  } else {
    console.log("\n❌ Jeans try-on failed");
  }
}

main();
