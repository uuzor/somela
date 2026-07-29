/**
 * Upload images to Supabase Storage
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://xqfwcyodibmtzmfhjyqf.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  console.error("Get it from: https://supabase.com/dashboard/project/xqfwcyodibmtzmfhjyqf/settings/api");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false }
});

async function uploadImage(filePath: string, fileName: string): Promise<string | null> {
  const fileData = readFileSync(filePath);
  
  console.log(`\nUploading ${filePath}...`);
  
  const { data, error } = await supabase.storage
    .from("images")
    .upload(fileName, fileData, {
      contentType: fileName.endsWith(".png") ? "image/png" : "image/jpeg",
      upsert: true
    });
  
  if (error) {
    console.error(`  Error: ${error.message}`);
    return null;
  }
  
  console.log(`  Uploaded: ${data.Key}`);
  
  // Get public URL
  const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);
  console.log(`  URL: ${urlData.publicUrl}`);
  
  return urlData.publicUrl;
}

async function main() {
  console.log("=" .repeat(60));
  console.log("Uploading images to Supabase Storage");
  console.log("=" .repeat(60));

  const manUrl = await uploadImage("../manstanding.jpg", "manstanding.jpg");
  const jeansUrl = await uploadImage("../images/jeans_product.jpg", "jeans_product.jpg");
  const shirtUrl = await uploadImage("../shirt.jpg", "shirt.jpg");

  console.log("\n" + "=".repeat(60));
  console.log("Upload Summary:");
  console.log("=".repeat(60));
  console.log(`  manstanding.jpg: ${manUrl}`);
  console.log(`  jeans_product.jpg: ${jeansUrl}`);
  console.log(`  shirt.jpg: ${shirtUrl}`);

  if (manUrl && jeansUrl && shirtUrl) {
    console.log("\n✅ All uploads successful!");
    console.log("\nUse these URLs with YouCam:");
    console.log(`  src_file_url: ${manUrl}`);
    console.log(`  ref_file_url (jeans): ${jeansUrl}`);
    console.log(`  ref_file_url (shirt): ${shirtUrl}`);
  } else {
    console.log("\n❌ Some uploads failed");
  }
}

main();
