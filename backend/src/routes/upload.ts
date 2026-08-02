import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, userSelfies } from "../db/index.js";
import { uploadToStorage, generateStoragePath } from "../services/supabase.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";
import { getYouCamApiKey, isYouCamConfigured, processSelfie } from "../services/youcam.js";

export const uploadRouter = Router();

const BUCKET_NAME = "images";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

function isSafeRemoteUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "0.0.0.0" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("169.254.") ||
      host.startsWith("172.16.") ||
      host.startsWith("172.17.") ||
      host.startsWith("172.18.") ||
      host.startsWith("172.19.") ||
      host.startsWith("172.2")
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/upload/selfie - Upload a selfie for try-on
 * Body: { imageUrl: string } - URL of the image already uploaded somewhere
 *       OR { imageData: string, userId: string } - base64 encoded image
 */
uploadRouter.post("/selfie", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authorization required" });
    }

    const { imageUrl, imageData } = req.body;

    let publicUrl: string;

    if (imageUrl) {
      if (!isSafeRemoteUrl(imageUrl)) {
        return res.status(400).json({ error: "Invalid or unsafe image URL" });
      }
      publicUrl = imageUrl;
    } else if (imageData) {
      const path = generateStoragePath(`selfies/${userId}`, "jpg");
      const buffer = Buffer.from(imageData, "base64");
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({ error: "Image exceeds maximum size" });
      }
      publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, "image/jpeg");
    } else {
      return res.status(400).json({ error: "imageUrl or imageData required" });
    }

    await db.update(userSelfies).set({ isDefault: false }).where(eq(userSelfies.userId, userId));
    const configured = isYouCamConfigured();
    const [selfie] = await db.insert(userSelfies).values({
      userId,
      imageUrl: publicUrl,
      isDefault: true,
      status: configured ? "processing" : "completed",
    }).returning();

    if (configured) {
      void processSelfie(selfie.id, publicUrl, userId, getYouCamApiKey()).catch((error) => {
        console.error("Async selfie preparation failed:", error);
      });
    }

    res.status(201).json({
      selfieId: selfie.id,
      imageUrl: publicUrl,
      processedImageUrl: selfie.processedImageUrl,
      status: selfie.status,
      errorMessage: selfie.errorMessage,
    });
  } catch (error) {
    console.error("Selfie upload error:", error);
    res.status(500).json({ error: "Failed to upload selfie" });
  }
});

/**
 * POST /api/upload/image - Upload any image to Supabase Storage
 * Body: { imageData: string, folder?: string }
 * Returns: { url: string }
 */
uploadRouter.post("/image", async (req, res) => {
  try {
    const { imageData, folder = "uploads", contentType = "image/jpeg" } = req.body;

    if (!imageData) {
      return res.status(400).json({ error: "imageData required" });
    }

    const path = generateStoragePath(folder, contentType === "image/png" ? "png" : "jpg");
    const buffer = Buffer.from(imageData, "base64");

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "Image exceeds maximum size" });
    }

    const publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, contentType);

    res.status(201).json({
      url: publicUrl,
      path,
    });
  } catch (error) {
    console.error("Image upload error:", error);
    res.status(500).json({ error: "Failed to upload image" });
  }
});

/**
 * POST /api/upload/from-url - Upload image from external URL to Supabase
 * Body: { url: string, folder?: string }
 */
uploadRouter.post("/from-url", async (req, res) => {
  try {
    const { url, folder = "uploads" } = req.body;

    if (!url) {
      return res.status(400).json({ error: "url required" });
    }

    if (!isSafeRemoteUrl(url)) {
      return res.status(400).json({ error: "Invalid or unsafe URL" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch image" });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({ error: "URL did not return an image" });
    }

    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "Image exceeds maximum size" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "Image exceeds maximum size" });
    }

    const path = generateStoragePath(folder, contentType === "image/png" ? "png" : "jpg");
    const publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, contentType);

    res.status(201).json({
      url: publicUrl,
      path,
    });
  } catch (error) {
    console.error("URL upload error:", error);
    res.status(500).json({ error: "Failed to upload from URL" });
  }
});
