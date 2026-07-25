# Visual Search ("Shazam for clothes")

Jul 25, 2026. Point a camera at a garment, get matches from the catalog, try it on or buy it. Builds directly on `vector-search.ts` and `youcam-integration.md` — this doc is about closing the gaps between them, not introducing new infrastructure.

---

## 1. The real gap: domain mismatch between query photo and catalog photos

This is the thing that will make or break match quality, and it's easy to miss because both pieces already "work" in isolation.

Catalog images going into `product_embeddings` are the **Day 4 processed** versions — background removed, enhanced, clean studio-style product shots. A user's uploaded photo is whatever they actually took: cluttered background, an outfit worn on a body, bad lighting, an Instagram screenshot with UI chrome around it. Embedding that raw photo and comparing it against a space built from clean product shots is comparing across two different visual distributions — Voyage's model is good, but it's not magic; garbage-in domain mismatch degrades nearest-neighbor quality regardless of model quality.

**Fix: run the same YouCam background-removal step on the query photo before embedding it, not just on catalog images at ingestion time.** Both sides of the comparison need to live in the same visual domain. This adds one YouCam call to the search path that didn't exist in the chat-based "inspo photo" case from `vector-search.md` — worth the extra latency, since without it you're not actually comparing like-for-like.

## 2. Confidence, not certainty — Shazam's UX lesson actually applies here

Shazam's real UX trick isn't the matching algorithm, it's that it's honest when it doesn't have a confident answer — it says "no match" instead of guessing. pgvector's KNN will **always** return the K nearest vectors, even if the nearest one is only vaguely related. Silently showing 12 results with no signal of confidence will make the feature look broken the first time someone photographs something genuinely not in your 2-5 store catalog (which, early on, will be often).

Bucket the cosine distance into an honest label rather than showing raw results or a fake percentage:

| Distance (cosine) | Label shown to user |
|---|---|
| < 0.15 | "Exact match" |
| 0.15 – 0.35 | "Close match" |
| 0.35 – 0.55 | "Similar style" |
| > 0.55 | Don't show as a match — show "Nothing close in our shops yet — here's what's closest in style" as a distinct, lower-confidence section |

**These exact cutoffs are placeholders, not calibrated numbers** — you don't have real distance-score data yet with only 2 live stores' worth of embeddings. Once Day 2's real catalog is embedded, run 15-20 test photos (some of items you know are in the catalog, some of items you know aren't) and look at the actual distance distribution before locking these thresholds in. Shipping guessed thresholds as if they're calibrated is worse than not having the confidence label at all.

## 3. The flow

1. User taps a camera/upload icon (separate entry point from the chat panel — this is a direct action, not a conversation).
2. Photo uploads → backend kicks off YouCam background-removal on it → returns `{status: "processing", searchId}` immediately, same non-blocking pattern as try-on.
3. On background-removal completion (webhook), backend embeds the cleaned image (`input_type: "query"`, image-only, no text) and runs `vectorSearchProducts` against `product_embeddings`.
4. Results get bucketed per the table above and pushed to the frontend (same push/poll mechanism as the try-on result — this is genuinely the same infra, different payload).
5. From a result card, two existing flows take over unchanged: **tap to try on** → `initiate_tryon(garmentId)`, direct call, no agent (same as any other product card); **tap to buy** → existing checkout flow, requires an account.

## 4. Auth — no login required for the search itself

A garment photo isn't identity-sensitive the way a selfie is (`flow.md` §1's account requirement was specifically about *face* photos). Let guest sessions use visual search freely — the account requirement only kicks in exactly where it already did: try-on needs a selfie on file, checkout needs a real account. Don't add friction to the identify-a-garment step itself; that's the "wow, it just works" moment you want a first-time guest to hit before ever being asked to sign up.

## 5. This is a direct-path feature, not an agent one — worth stating explicitly

Nothing about "upload a photo, find matches" needs an LLM in the loop. It's deterministic end to end: background removal → embed → KNN → bucket → display. Don't route this through `discovery-turn.ts` even though it touches the same `vectorSearchProducts` function the agent can also call — this entry point calls it directly, same one-function-multiple-callers pattern that's been consistent since `catalog-query.ts`. The only place an agent could plausibly get involved is *after* results are shown, if the user then types something like "show me these in a different color" — at that point you're back in an ordinary discovery-turn chat, with the visual-search results as conversation context.

---

## Implementation

`visual-search.ts` orchestrates the pipeline: initiate background removal, and — on webhook completion — embed and search. The YouCam call is typed against the documented REST contract from `youcam-integration.md` but not yet implemented as a client (no `youcam-client.ts` exists in this repo yet); flagged clearly below rather than silently assumed.

import { initiateBackgroundRemoval, uploadImage, getTaskResult } from "./youcam-client.js";
import { vectorSearchProducts, type SimilarProduct } from "./vector-search.js";

export type MatchConfidence = "exact" | "close" | "similar" | "low";

export interface VisualSearchResult extends SimilarProduct {
  confidence: MatchConfidence;
}

// Placeholder thresholds — see visual-search.md §2. Recalibrate against real
// distance distributions once the real catalog is embedded; don't ship
// these as if they were measured.
function bucketConfidence(distance: number): MatchConfidence {
  if (distance < 0.15) return "exact";
  if (distance < 0.35) return "close";
  if (distance < 0.55) return "similar";
  return "low";
}

// In-memory stand-in for a searches table keyed by taskId — same "swap the
// implementation, keep the signature" pattern as user-preferences.ts. A
// real deployment persists this (Postgres row or Redis) so results survive
// past a single process and can be pushed to the right connected client.
type SearchState =
  | { status: "processing" }
  | { status: "done"; results: VisualSearchResult[] }
  | { status: "error"; message: string };

const searches = new Map<string, SearchState>();

// Step 1: user uploads a photo. Kicks off background removal and returns
// immediately — never blocks the request on YouCam's async task.
export async function initiateVisualSearch(imageBuffer: Buffer): Promise<{ searchId: string }> {
  const fileId = await uploadImage(imageBuffer);
  const taskId = await initiateBackgroundRemoval(fileId);
  searches.set(taskId, { status: "processing" });
  return { searchId: taskId };
}

// Step 2: called from the webhook receiver once background removal
// completes. This is where the domain-mismatch fix from visual-search.md §1
// actually happens — we embed the *cleaned* image, not the raw upload.
export async function handleBackgroundRemovalComplete(taskId: string): Promise<void> {
  try {
    const result = await getTaskResult(taskId);
    if (result.status !== "success" || !result.resultImageUrl) {
      searches.set(taskId, { status: "error", message: "Background removal did not succeed" });
      return;
    }

    const matches = await vectorSearchProducts({ imageUrl: result.resultImageUrl });
    const bucketed: VisualSearchResult[] = matches.map((m) => ({
      ...m,
      confidence: bucketConfidence(m.distance),
    }));

    searches.set(taskId, { status: "done", results: bucketed });
  } catch (err) {
    searches.set(taskId, { status: "error", message: String(err) });
  }
}

// Step 3: frontend polls (or a push channel reads from the same state) using
// the searchId returned from step 1.
export function getVisualSearchState(searchId: string): SearchState | undefined {
  return searches.get(searchId);
}



// Thin client for YouCam's S2S REST API, scoped to just what visual search
// needs: upload an image, kick off AI-Photo-Background-Removal, and read
// back the result once done. Built directly from the Quick Start Guide
// contract (docs.perfectcorp.com/develop/quick_start_guide) — upload -> get
// file_id -> POST task -> poll or webhook -> download URL.
//
// NOT YET LIVE-TESTED: this sandbox can't reach perfectcorp.com (not on the
// network allowlist) and there's no API key here to test with. The exact
// base host wasn't given in the pages fetched for this project (only the
// path /s2s/v2.0/task/{task-type} was documented) — confirm the real base
// URL against the API Reference before wiring this up for real, don't trust
// the placeholder below.

const YOUCAM_BASE_URL = process.env.YOUCAM_API_BASE_URL ?? "https://yce-api-01.perfectcorp.com"; // UNVERIFIED — confirm against API Reference

interface UploadImageInfo {
  fileId: string;
  uploadUrl: string;
}

interface TaskCreatedResponse {
  taskId: string;
}

async function youcamRequest<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${YOUCAM_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.YOUCAM_API_KEY}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`YouCam ${path} returned ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadImage(imageBuffer: Buffer): Promise<string> {
  const info = await youcamRequest<UploadImageInfo>("/s2s/v2.0/file/upload-info", {
    method: "POST",
  });
  await fetch(info.uploadUrl, { method: "PUT", body: new Uint8Array(imageBuffer) });
  return info.fileId;
}

export async function initiateBackgroundRemoval(fileId: string): Promise<string> {
  const task = await youcamRequest<TaskCreatedResponse>("/s2s/v2.0/task/photo-background-removal", {
    method: "POST",
    body: JSON.stringify({ file_id: fileId }),
  });
  return task.taskId;
}

export interface TaskResult {
  status: "success" | "error" | "processing";
  resultImageUrl?: string;
}

export async function getTaskResult(taskId: string): Promise<TaskResult> {
  return youcamRequest<TaskResult>(`/s2s/v2.0/task/photo-background-removal/${taskId}`, {
    method: "GET",
  });
}

// Webhook payload shape, per docs.perfectcorp.com/develop/webhook
export interface YouCamWebhookPayload {
  created_at: number;
  data: { task_id: string; task_status: "success" | "error" };
}