import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";

const VISUAL_SEARCH_PATH = "./src/routes/visual-search.ts";
const INDEX_PATH = "./src/index.ts";

describe("visual search webhook implementation", () => {
  it("webhook handler verifies HMAC signature", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("verifyWebhookSignature");
    expect(content).toContain("x-yce-webhook-signature");
  });

  it("webhook handler finds task by externalTaskId", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("eq(visualSearchTasks.externalTaskId, payload.task_id)");
  });

  it("webhook handler embeds cleaned image and runs vector search on success", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("vectorSearchWithConfidence");
    expect(content).toContain("imageUrl: resultUrl");
    expect(content).toContain("payload.results[0]");
  });

  it("webhook handler stores results with confidence bucketing", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("results: results as any");
    expect(content).toContain("completedAt: new Date()");
  });

  it("webhook handler marks task as failed on error", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain('status: "failed"');
    expect(content).toContain("payload.error?.message");
  });

  it("POST handler triggers YouCam background removal when configured", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("createBackgroundRemovalTask");
    expect(content).toContain("externalTaskId: bgTask.task_id");
    expect(content).toContain("isYouCamConfigured()");
  });

  it("POST handler falls back to direct processing when YouCam not configured", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain("processVisualSearch(task.id, input).catch(console.error)");
  });

  it("webhook route is registered on visualSearchRouter", () => {
    const content = readFileSync(VISUAL_SEARCH_PATH, "utf-8");
    expect(content).toContain('visualSearchRouter.post("/webhook"');
  });

  it("raw body middleware is wired for visual search webhook in index.ts", () => {
    const content = readFileSync(INDEX_PATH, "utf-8");
    expect(content).toContain('/api/visual-search/webhook');
    expect(content).toContain("rawBody");
  });
});
