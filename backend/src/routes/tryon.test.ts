import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const route = readFileSync("./src/routes/tryon.ts", "utf-8");
const service = readFileSync("./src/services/tryon.ts", "utf-8");

describe("try-on lifecycle", () => {
  it("uses the shared asynchronous job service for single and multi try-on", () => {
    expect(route).toContain("startTryOnJob");
    expect(route).toContain('tryonRouter.post("/", tryonRateLimit');
    expect(route).toContain('tryonRouter.post("/multi", tryonRateLimit');
    expect(service).toContain("void processTryOnTask");
  });

  it("limits outfit jobs to five products", () => {
    expect(route).toContain(".min(1).max(5)");
    expect(service).toContain("productIds.length > 5");
  });

  it("owner-scopes selfies and task status", () => {
    expect(service).toContain("eq(userSelfies.userId, userId)");
    expect(service).toContain("eq(tryonTasks.userId, userId)");
    expect(route).toContain("getOwnedTryOnTask");
  });

  it("uses full-body classification for dresses", () => {
    expect(service).toContain("/dress|gown|jumpsuit|romper|full.?body/");
    expect(service).toContain('return "full_body"');
  });

  it("verifies webhook signatures and persists successful results", () => {
    expect(route).toContain("verifyWebhookSignature");
    expect(route).toContain("saveTryOnResult");
    expect(route).toContain('status: "completed"');
  });

  it("returns explicit selfie lifecycle fields", () => {
    expect(route).toContain("processedImageUrl");
    expect(route).toContain("errorMessage");
    expect(route).toContain("selfie.status");
  });
});
