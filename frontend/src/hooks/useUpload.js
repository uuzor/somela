/**
 * useUpload - Hook for uploading images to Supabase Storage
 * 
 * Usage:
 *   const { upload, isUploading, error } = useUpload();
 *   const url = await upload(file, 'selfies/user123');
 */

import { useState, useCallback } from "react";

const UPLOAD_API_BASE = "http://localhost:3000/api/upload";

async function postUpload(path, body) {
  const response = await fetch(`${UPLOAD_API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
  }

  return data;
}

export function useUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);

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
      const base64 = await readFileAsBase64(file);
      const response = await postUpload("/image", {
        imageData: base64,
        folder,
        contentType: file.type,
      });
      return response.url;
    } catch (err) {
      const message = err?.message || "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadFromUrl = useCallback(async (url, folder = "uploads") => {
    if (!url) {
      throw new Error("No URL provided");
    }

    setIsUploading(true);
    setError(null);

    try {
      const response = await postUpload("/from-url", { url, folder });
      return response.url;
    } catch (err) {
      const message = err?.message || "Upload failed";
      setError(message);
      throw new Error(message);
    } finally {
      setIsUploading(false);
    }
  }, []);

  const uploadSelfie = useCallback(async (image, userId) => {
    setIsUploading(true);
    setError(null);

    try {
      let imageUrl;

      if (typeof image === "string") {
        imageUrl = image;
      } else if (image instanceof File) {
        imageUrl = await upload(image, `selfies/${userId}`);
      } else {
        throw new Error("Invalid image source");
      }

      const response = await fetch(`${UPLOAD_API_BASE}/selfie`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ imageUrl }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || data.message || `Upload failed with status ${response.status}`);
      }

      return {
        selfieId: data.selfieId,
        imageUrl: data.imageUrl,
      };
    } catch (err) {
      const message = err?.message || "Upload failed";
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

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default useUpload;
