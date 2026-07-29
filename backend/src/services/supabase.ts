import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Buffer } from "buffer";

// Use environment variables
const SUPABASE_URL = "https://xqfwcyodibmtzmfhjyqf.supabase.co";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// Create admin client for server-side operations
export function getSupabaseAdmin(): SupabaseClient {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

// Upload file to Supabase Storage
export async function uploadToStorage(
  bucket: string,
  path: string,
  data: Buffer | ArrayBuffer,
  contentType: string = "image/jpeg"
): Promise<string> {
  const supabase = getSupabaseAdmin();
  
  const { data: uploadData, error } = await supabase.storage
    .from(bucket)
    .upload(path, data, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return urlData.publicUrl;
}

// Upload from URL to Supabase Storage
export async function uploadFromUrl(
  bucket: string,
  path: string,
  sourceUrl: string
): Promise<string> {
  // Fetch the image
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const contentType = response.headers.get("content-type") || "image/jpeg";
  
  return uploadToStorage(bucket, path, Buffer.from(arrayBuffer), contentType);
}

// Download from URL (for YouCam results)
export async function downloadFromUrl(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  
  const contentType = response.headers.get("content-type") || "image/jpeg";
  const arrayBuffer = await response.arrayBuffer();
  
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

// Generate unique filename
export function generateStoragePath(prefix: string, extension: string = "jpg"): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}/${timestamp}_${random}.${extension}`;
}
