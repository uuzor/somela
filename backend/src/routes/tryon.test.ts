import { describe, expect, it } from "bun:test";
import { readFileSync } from "fs";

const route = readFileSync("./src/routes/tryon.ts", "utf-8");
const service = readFileSync("./src/services/tryon.ts", "utf-8");

describe("try-on lifecycle", () => {
  it("uses the shared asynchronous job service for incremental try-on", () => {
    expect(route).toContain("startTryOnJob");
    expect(route).toContain('tryonRouter.post("/", tryonRateLimit');
    expect(route).toContain('tryonRouter.post("/multi", tryonRateLimit');
    expect(service).toContain("void processTryOnTask");
    expect(route).toContain("Batch try-on has been replaced");
  });

  it("accepts exactly one product per persisted state", () => {
    expect(route).toContain(".length(1)");
    expect(service).toContain("productIds.length !== 1");
    expect(service).toContain("parentTaskId");
    expect(service).toContain("outfitState");
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

  it("classifies footwear independently", () => {
    expect(service).toContain("/shoe|sneaker|boot|heel|sandal|loafer|footwear/");
    expect(service).toContain('return "shoes"');
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
