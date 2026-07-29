/**
 * Upload local images to YouCam File API
 * Usage: npx tsx upload-to-youcam.ts
 */

import "dotenv/config";
import { readFileSync } from "fs";
import { getYouCamApiKey } from "./src/services/youcam.js";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";

async function uploadFileToYouCam(filePath: string, apiKey: string): Promise<string | null> {
  const fileData = readFileSync(filePath);
  const fileName = filePath.split("/").pop() || "image.jpg";
  const mimeType = fileName.endsWith(".png") ? "image/png" : "image/jpeg";

  console.log(`\nUploading ${filePath}...`);
  console.log(`  Size: ${fileData.length} bytes`);

  // Try direct upload endpoint
  const response = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/file/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": mimeType,
      "X-File-Name": fileName,
    },
    body: fileData,
  });

  if (response.ok) {
    const data = await response.json();
    console.log(`  Success! file_id: ${data.data?.file_id || data.file_id}`);
    return data.data?.file_id || data.file_id;
  }

  // Try with multipart form
  const formData = new FormData();
  const blob = new Blob([fileData], { type: mimeType });
  formData.append("file", blob, fileName);

  const multipartResponse = await fetch(`${YOUCAM_BASE_URL}/s2s/v2.0/file/upload-multipart`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (multipartResponse.ok) {
    const data = await multipartResponse.json();
    console.log(`  Success! file_id: ${data.data?.file_id || data.file_id}`);
    return data.data?.file_id || data.file_id;
  }

  console.log(`  Failed: ${response.status} ${await response.text()}`);
  return null;
}

async function main() {
  const apiKey = getYouCamApiKey();
  
  console.log("=" .repeat(60));
  console.log("Uploading images to YouCam File API");
  console.log("=" .repeat(60));

  // Upload images
  const manFileId = await uploadFileToYouCam("../manstanding.jpg", apiKey);
  const jeansFileId = await uploadFileToYouCam("../images/jeans_product.jpg", apiKey);
  const shirtFileId = await uploadFileToYouCam("../shirt.jpg", apiKey);

  console.log("\n" + "=".repeat(60));
  console.log("Upload Summary:");
  console.log("=".repeat(60));
  console.log(`  manstanding.jpg: ${manFileId || "FAILED"}`);
  console.log(`  jeans_product.jpg: ${jeansFileId || "FAILED"}`);
  console.log(`  shirt.jpg: ${shirtFileId || "FAILED"}`);

  if (manFileId && jeansFileId && shirtFileId) {
    console.log("\n✅ All uploads successful!");
    console.log("\nYou can now use these file_ids with AI-Cloth API:");
    console.log(`  src_file_url: ${manFileId}`);
    console.log(`  ref_file_url (jeans): ${jeansFileId}`);
    console.log(`  ref_file_url (shirt): ${shirtFileId}`);
  } else {
    console.log("\n❌ Some uploads failed");
  }
}

main();
