/**
 * useUpload - Hook for uploading images to Supabase Storage
 * 
 * Usage:
 *   const { upload, isUploading, error } = useUpload();
 *   const url = await upload(file, 'selfies/user123');
 */

import { useState, useCallback } from "react";
import { apiClient } from "@/lib/api-client";

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Upload an image file to Supabase via backend
   * @param {File} file - The image file to upload
   * @param {string} [folder='uploads'] - Folder path in Supabase storage
   * @returns {Promise<string>} The public URL of the uploaded image
   */
  const upload = useCallback(async (file, folder = "uploads") => {
    if (!file) {
      throw new Error("No file provided");
    }

    if (!file.type.startsWith("image/")) {
      throw new Error("File must be an image");
    }

    setIsUploading(true);
    setError(null);

    try {
      // Read file as base64
      const base64 = await readFileAsBase64(file);

      // Send to backend which uploads to Supabase
      const response = await apiClient.post("/upload/image", {
        imageData: base64,
        folder,
        contentType: file.type,
      });

      return response.url;
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * Upload from a URL (proxy to Supabase)
   * @param {string} url - The external URL to upload from
   * @param {string} [folder='uploads'] - Folder path in Supabase storage
   * @returns {Promise<string>} The public URL of the uploaded image
   */
  const uploadFromUrl = useCallback(async (url, folder = "uploads") => {
    if (!url) {
      throw new Error("No URL provided");
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await apiClient.post("/upload/from-url", {
        url,
        folder,
      });

      return response.url;
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * Upload a selfie for the current user
   * @param {File|string} image - File or URL
   * @param {string} userId - User ID
   * @returns {Promise<{selfieId: string, imageUrl: string}>}
   */
  const uploadSelfie = useCallback(async (image, userId) => {
    setIsUploading(true);
    setError(null);

    try {
      let imageUrl;

      if (typeof image === "string") {
        // It's a URL, use it directly
        imageUrl = image;
      } else if (image instanceof File) {
        // It's a file, upload it
        imageUrl = await upload(image, `selfies/${userId}`);
      } else {
        throw new Error("Invalid image source");
      }

      // Register selfie in backend
      const response = await apiClient.post(
        "/upload/selfie",
        { imageUrl },
        { headers: { "x-user-id": userId } }
      );

      return {
        selfieId: response.selfieId,
        imageUrl: response.imageUrl,
      };
    } catch (err) {
      const message = err.response?.data?.error || err.message || "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, [upload]);

  return {
    upload,
    uploadFromUrl,
    uploadSelfie,
    isUploading,
    error,
    clearError: () => setError(null),
  };
}

/**
 * Read a File as base64 string
 */
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Remove data URL prefix to get just the base64
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default useUpload;
