import { describe, it, expect } from "bun:test";

// Inline the types and extractResultUrl to test without external deps
interface YouCamTaskResponse {
  task_status: "pending" | "processing" | "running" | "success" | "error";
  results?: Array<{ url: string; result_image_url?: string }> | { url: string; result_image_url?: string };
  error?: { code: string; message: string };
}

function extractResultUrl(response: YouCamTaskResponse): string | null {
  if (!response.results) {
    return null;
  }
  const results = Array.isArray(response.results)
    ? response.results
    : [response.results];
  if (results.length === 0) {
    return null;
  }
  const result = results[0];
  return result?.url || result?.result_image_url || null;
}

describe("extractResultUrl", () => {
  it("returns url from object results", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: { url: "https://example.com/result.jpg" },
    };
    expect(extractResultUrl(response)).toBe("https://example.com/result.jpg");
  });

  it("returns result_image_url from object results when url is absent", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: { result_image_url: "https://example.com/enhanced.jpg" },
    };
    expect(extractResultUrl(response)).toBe("https://example.com/enhanced.jpg");
  });

  it("returns url from array results", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: [{ url: "https://example.com/result.jpg" }],
    };
    expect(extractResultUrl(response)).toBe("https://example.com/result.jpg");
  });

  it("returns result_image_url from array results", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: [{ result_image_url: "https://example.com/enhanced.jpg" }],
    };
    expect(extractResultUrl(response)).toBe("https://example.com/enhanced.jpg");
  });

  it("returns null when no results", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: undefined,
    };
    expect(extractResultUrl(response)).toBeNull();
  });

  it("returns null when results array is empty", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: [],
    };
    expect(extractResultUrl(response)).toBeNull();
  });

  it("returns null when results object has no url", () => {
    const response: YouCamTaskResponse = {
      task_status: "success",
      results: {},
    };
    expect(extractResultUrl(response)).toBeNull();
  });
});
