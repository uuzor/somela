import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

const TRYON_PATH = "./src/routes/tryon.ts";

describe("tryon.ts selfie implementation", () => {
  it("imports processSelfie from youcam service", () => {
    const content = readFileSync(TRYON_PATH, "utf-8");
    expect(content).toContain("processSelfie");
    expect(content).toContain('from "../services/youcam.js"');
  });

  it("triggers async selfie prep after storing selfie record", () => {
    const content = readFileSync(TRYON_PATH, "utf-8");
    expect(content).toContain("processSelfie(selfie.id, imageUrl, userId, apiKey)");
    expect(content).toContain("isYouCamConfigured()");
  });

  it("does not contain TODO comment", () => {
    const content = readFileSync(TRYON_PATH, "utf-8");
    expect(content).not.toContain("TODO");
  });

  it("returns processing status in selfie response", () => {
    const content = readFileSync(TRYON_PATH, "utf-8");
    expect(content).toContain('status: "processing"');
    expect(content).toContain("processedImageUrl: null");
  });

  it("getTaskStatus call includes taskType in GET handler", () => {
    const content = readFileSync(TRYON_PATH, "utf-8");
    expect(content).toContain('getTaskStatus(task.externalTaskId, "cloth-v3", apiKey)');
  });
});
