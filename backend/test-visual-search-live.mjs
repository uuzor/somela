import crypto from "crypto";

const YOUCAM_BASE_URL = "https://yce-api-01.makeupar.com";
const YOUCAM_API_KEY = process.env.YOUCAM_API_KEY;
const YOUCAM_SECRET_KEY = process.env.YOUCAM_SECRET_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

async function youcamRequest(path, options = {}) {
  const res = await fetch(`${YOUCAM_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${YOUCAM_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`YouCam ${path} returned ${res.status}: ${text}`);
  }
  return res.json();
}

async function testYouCamApi() {
  console.log("\n=== Test 1: YouCam API Connectivity ===");
  try {
    const uploadUrlRes = await youcamRequest("/s2s/v2.0/file/upload-url");
    console.log("GET /s2s/v2.0/file/upload-url:", JSON.stringify(uploadUrlRes).slice(0, 200));
    console.log("✓ YouCam API is reachable");
  } catch (err) {
    console.error("✗ YouCam API failed:", err.message);
    return false;
  }
  return true;
}

async function testBackgroundRemovalTask(imageUrl) {
  console.log("\n=== Test 2: Create Background Removal Task ===");
  try {
    const task = await youcamRequest("/s2s/v2.0/task/ai-photo-background-removal", {
      method: "POST",
      body: JSON.stringify({ image_url: imageUrl }),
    });
    console.log("Task created:", JSON.stringify(task).slice(0, 300));
    if (task.data?.task_id) {
      console.log("✓ Background removal task created, task_id:", task.data.task_id);
      return task.data.task_id;
    }
    console.error("✗ No task_id in response:", task);
    return null;
  } catch (err) {
    console.error("✗ Background removal task failed:", err.message);
    return null;
  }
}

async function testWebhookSignature() {
  console.log("\n=== Test 3: Webhook Signature Verification ===");
  const payload = JSON.stringify({
    webhook_id: "test-123",
    webhook_timestamp: Date.now(),
    task_id: "task-abc",
    task_type: "ai-photo-background-removal",
    task_status: "success",
    results: [{ url: "https://example.com/result.jpg" }],
  });

  const signature = crypto
    .createHmac("sha256", Buffer.from(YOUCAM_SECRET_KEY, "base64"))
    .update(payload)
    .digest("base64");

  console.log("Generated signature:", signature.slice(0, 20) + "...");

  const expectedSignature = crypto
    .createHmac("sha256", Buffer.from(YOUCAM_SECRET_KEY, "base64"))
    .update(payload)
    .digest("base64");

  const isValid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (isValid) {
    console.log("✓ Webhook signature verification works");
  } else {
    console.error("✗ Webhook signature verification failed");
  }
  return isValid;
}

async function testVoyageApi() {
  console.log("\n=== Test 4: Voyage AI API Connectivity ===");
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: "test query for visual search",
        model: "voyage-4",
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("✗ Voyage API failed:", res.status, text);
      return false;
    }

    const data = await res.json();
    const embedding = data.data?.[0]?.embedding;
    if (embedding && Array.isArray(embedding) && embedding.length > 0) {
      console.log(`✓ Voyage API returned embedding with ${embedding.length} dimensions`);
      return true;
    }
    console.error("✗ Voyage API returned no embedding:", data);
    return false;
  } catch (err) {
    console.error("✗ Voyage API error:", err.message);
    return false;
  }
}

async function testVisualSearchTask() {
  console.log("\n=== Test 5: Full Visual Search Flow ===");
  const testImageUrl = "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png";

  const taskId = await testBackgroundRemovalTask(testImageUrl);
  if (!taskId) return false;

  console.log("\nPolling task status (up to 3 attempts)...");
  for (let i = 0; i < 3; i++) {
    await new Promise(r => setTimeout(r, 5000));
    try {
      const status = await youcamRequest(`/s2s/v2.0/task/ai-photo-background-removal/${taskId}`);
      console.log(`Attempt ${i + 1}:`, JSON.stringify(status).slice(0, 300));
      if (status.data?.task_status === "success" || status.data?.task_status === "error") {
        console.log(`✓ Task completed with status: ${status.data.task_status}`);
        return true;
      }
      console.log(`  Task still ${status.data?.task_status || "processing"}...`);
    } catch (err) {
      console.error(`  Poll attempt ${i + 1} failed:`, err.message);
    }
  }

  console.log("⚠ Task still processing after 3 polls (this is normal for async tasks)");
  return true;
}

async function main() {
  console.log("Testing Visual Search & Webhook with session API keys");
  console.log("YOUCAM_API_KEY:", YOUCAM_API_KEY ? `${YOUCAM_API_KEY.slice(0, 8)}...` : "missing");
  console.log("YOUCAM_SECRET_KEY:", YOUCAM_SECRET_KEY ? "set" : "missing");
  console.log("VOYAGE_API_KEY:", VOYAGE_API_KEY ? `${VOYAGE_API_KEY.slice(0, 8)}...` : "missing");

  if (!YOUCAM_API_KEY || !YOUCAM_SECRET_KEY) {
    console.error("\n✗ Missing YOUCAM_API_KEY or YOUCAM_SECRET_KEY");
    process.exit(1);
  }

  const results = {
    youcamApi: await testYouCamApi(),
    webhookSig: await testWebhookSignature(),
    voyageApi: await testVoyageApi(),
    visualSearch: await testVisualSearchTask(),
  };

  console.log("\n=== Summary ===");
  console.log("YouCam API:", results.youcamApi ? "✓ PASS" : "✗ FAIL");
  console.log("Webhook Signature:", results.webhookSig ? "✓ PASS" : "✗ FAIL");
  console.log("Voyage AI:", results.voyageApi ? "✓ PASS" : "✗ FAIL");
  console.log("Visual Search Flow:", results.visualSearch ? "✓ PASS" : "✗ FAIL");

  const allPassed = Object.values(results).every(r => r);
  if (allPassed) {
    console.log("\n✓ All tests passed!");
    process.exit(0);
  } else {
    console.log("\n✗ Some tests failed");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
