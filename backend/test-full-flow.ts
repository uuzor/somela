/**
 * Test complete flow:
 * 1. Upload image to Supabase
 * 2. Send to YouCam
 * 3. Save result to Supabase
 * 4. Return Supabase URL
 */

import "dotenv/config";
import { uploadToStorage, generateStoragePath, downloadFromUrl } from "./src/services/supabase.js";
import { getYouCamApiKey } from "./src/services/youcam.js";
import { readFileSync } from "fs";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";
const BUCKET_NAME = "images";

async function uploadToSupabase(filePath: string, folder: string): Promise<string> {
  const data = readFileSync(filePath);
  const path = generateStoragePath(folder, "jpg");
  const url = await uploadToStorage(BUCKET_NAME, path, data, "image/jpeg");
  console.log(`  Uploaded to Supabase: ${url}`);
  return url;
}

async function uploadFromUrl(url: string, folder: string): Promise<string> {
  const response = await fetch(url);
  const buffer = Buffer.from(await response.arrayBuffer());
  const path = generateStoragePath(folder, "jpg");
  const publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, "image/jpeg");
  console.log(`  Uploaded to Supabase: ${publicUrl}`);
  return publicUrl;
}

async function tryOnWithYouCam(srcUrl: string, garmentUrl: string, category: string): Promise<string> {
  const apiKey = getYouCamApiKey();
  
  console.log(`  Calling YouCam...`);
  const response = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ src_file_url: srcUrl, ref_file_url: garmentUrl, garment_category: category }),
  });
  
  const data = await response.json();
  const taskId = data.data.task_id;
  console.log(`  Task created: ${taskId.substring(0, 20)}...`);
  
  // Poll
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/task/cloth-v3/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const statusData = await statusRes.json();
    console.log(`  [${i + 1}] ${statusData.data.task_status}`);
    
    if (statusData.data.task_status === "success") {
      return statusData.data.results?.url || statusData.data.results?.Result_image_url;
    }
    if (statusData.data.task_status === "error") {
      throw new Error(statusData.data.error_message);
    }
  }
  throw new Error("Timeout");
}

async function saveToSupabase(url: string, folder: string): Promise<string> {
  console.log(`  Downloading from: ${url.substring(0, 50)}...`);
  const { buffer } = await downloadFromUrl(url);
  const path = generateStoragePath(folder, "jpg");
  const publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, "image/jpeg");
  console.log(`  Saved to Supabase: ${publicUrl}`);
  return publicUrl;
}

async function main() {
  console.log("=".repeat(60));
  console.log("🧪 Complete Try-On Flow Test");
  console.log("=".repeat(60));
  console.log("\nFlow:");
  console.log("  1. Upload selfie to Supabase");
  console.log("  2. Upload products to Supabase");
  console.log("  3. Try on jeans (YouCam) → save result to Supabase");
  console.log("  4. Try on shirt (YouCam) → save result to Supabase");
  console.log("  5. Return final Supabase URL\n");

  const sessionId = `test_${Date.now()}`;
  
  // Step 1: Upload selfie
  console.log("Step 1: Uploading selfie...");
  const selfieUrl = await uploadToSupabase("../manstanding.jpg", `tryon/${sessionId}`);
  
  // Step 2: Upload products (they're already in Supabase, but let's use URLs)
  console.log("\nStep 2: Using product images...");
  const jeansUrl = "https://xqfwcyodibmtzmfhjyqf.supabase.co/storage/v1/object/public/images/jeans_product.jpg";
  const shirtUrl = "https://xqfwcyodibmtzmfhjyqf.supabase.co/storage/v1/object/public/images/shirt.jpg";
  console.log(`  Jeans: ${jeansUrl}`);
  console.log(`  Shirt: ${shirtUrl}`);
  
  // Step 3: Try on jeans
  console.log("\nStep 3: Try on jeans (lower_body)...");
  const jeansResult = await tryOnWithYouCam(selfieUrl, jeansUrl, "lower_body");
  const stableJeansUrl = await saveToSupabase(jeansResult, `tryon/${sessionId}`);
  
  // Step 4: Try on shirt
  console.log("\nStep 4: Try on shirt (upper_body)...");
  const shirtResult = await tryOnWithYouCam(stableJeansUrl, shirtUrl, "upper_body");
  const finalUrl = await saveToSupabase(shirtResult, `tryon/${sessionId}`);
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("✅ COMPLETE FLOW SUCCESS!");
  console.log("=".repeat(60));
  console.log("\n📁 All images saved to Supabase Storage bucket 'images':");
  console.log(`   selfie: ${selfieUrl}`);
  console.log(`   step1 (jeans): ${stableJeansUrl}`);
  console.log(`   step2 (final): ${finalUrl}`);
  console.log("\n🌐 Final URL for frontend:");
  console.log(`   ${finalUrl}`);
}

main().catch(console.error);
