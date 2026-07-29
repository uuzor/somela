import { Router } from "express";
import { randomUUID } from "crypto";
import { db, userSelfies } from "../db/index.js";
import { eq } from "drizzle-orm";
import { uploadToStorage, generateStoragePath } from "../services/supabase.js";

export const uploadRouter = Router();

const BUCKET_NAME = "images";

/**
 * POST /api/upload/selfie - Upload a selfie for try-on
 * Body: { imageUrl: string } - URL of the image already uploaded somewhere
 *       OR { imageData: string, userId: string } - base64 encoded image
 */
uploadRouter.post("/selfie", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const { imageUrl, imageData } = req.body;

    let publicUrl: string;

    if (imageUrl) {
      // If URL is provided, use it directly (already uploaded elsewhere)
      publicUrl = imageUrl;
    } else if (imageData) {
      // If base64 data is provided, upload to Supabase
      const path = generateStoragePath(`selfies/${userId}`, "jpg");
      const buffer = Buffer.from(imageData, "base64");
      publicUrl = await uploadToStorage(BUCKET_NAME, path, buffer, "image/jpeg");
    } else {
      return res.status(400).json({ error: "imageUrl or imageData required" });
    }

    // Create selfie record in DB
    const [selfie] = await db.insert(userSelfies).values({
      userId,
      imageUrl: publicUrl,
      isDefault: true,
    }).returning();

    res.status(201).json({
      selfieId: selfie.id,
      imageUrl: publicUrl,
      status: "success",
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

    // Fetch the image
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: "Failed to fetch image" });
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(arrayBuffer);

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
