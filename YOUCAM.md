# YouCam (Perfect Corp) API — Integration Analysis

Sources: `docs.perfectcorp.com/develop/quick_start_guide`, `/mcp`, `/webhook`. Jul 25, 2026.

---

## 1. How the API actually works (mechanics, not opinion)

Every AI task follows the same shape, regardless of which specific endpoint you call:

1. **Auth:** `Authorization: Bearer YOUR_API_KEY` on every request.
2. **Upload:** call the File API to get an upload URL + `file_id`, then PUT the image to that URL.
3. **Initiate:** `POST` the task config (e.g. `/s2s/v2.0/task/skin-analysis`, or `AI-Cloth` for our case) → get back a `task_id`.
4. **Resolve:** everything is async. Two ways to find out when it's done:
   - **Poll:** `GET /{task-type}/${task_id}` until `task_status` is `success`/`error`.
   - **Webhook:** register an HTTPS endpoint once in the API Console; YouCam POSTs to it when the task finishes, HMAC-SHA256 signed (Standard Webhooks spec), carrying `task_id` + `task_status`.

**Relevant endpoints for us**, from the MCP capability table:

| API | Execution type | Use in this project |
|---|---|---|
| `AI-Cloth` | Direct (no template lookup needed) | The actual try-on call — takes a garment image + a person image directly, since we're using our own scraped product photos, not YouCam's catalog |
| `AI-Photo-Background-Removal` | Direct | Day 4 prep pipeline, on scraped garment images |
| `AI-Photo-Enhance` | Direct | Day 4 prep pipeline, same batch job |

"Direct" matters here specifically for `AI-Cloth`: some other categories (makeup patterns, hairstyles, "looks") require a preceding template-ID lookup call. Ours doesn't — we hand it a garment photo and a person photo and get a result. One less round trip.

---

## 2. The MCP layer — what it is and what it isn't

`youcam-api-mcp` (`https://mcp-api-01.makeupar.com/mcp`) wraps the whole REST flow — upload, task creation, and **polling — into tool calls an MCP-aware client can invoke without writing any of that plumbing.

Read carefully what it's built for: the setup guide's example clients are **Cursor, Copilot in VS Code, Claude for Desktop** — interactive developer tools where a human is sitting at a keyboard, invoking a tool, and is fine waiting a few seconds for a result to stream back into their editor or chat window. That's a materially different situation from a production chat backend serving concurrent users on a latency budget.

This distinction is the crux of the whole "agent vs direct" question below.

---

## 3. The actual decision, scenario by scenario

Your instinct in the prompt was right — "user selects the clothes to try on" doesn't need to go through the agent. But it's worth being precise about *why*, because the same reasoning tells you exactly which cases *do* need it, rather than making that call case-by-case on vibes.

### Scenario A — user taps "Try this on" on a specific product card

**User flow:** browsing catalog cards (fast GET path, already built) → taps a garment → app already knows exactly which `garment_id` and which stored selfie. Zero ambiguity to resolve.

**Route: direct call, no agent.**

```
POST /tryon  { userId, garmentId }
```

Backend: loads the user's selfie + garment image URLs from DB → calls YouCam's File API to get the images hosted (or passes public URLs if `AI-Cloth` accepts them directly — confirm during Day 4-5 build) → `POST` to `AI-Cloth` → gets `task_id` back → **returns immediately** to the frontend with `{ status: "processing", taskId }` → frontend shows a loading state on that card.

Why not poll in-request: `AI-Cloth` generation isn't instant, and holding an HTTP request open for an unknown number of seconds is bad for a chat/UI backend serving many users concurrently. Use the **webhook** instead: when YouCam POSTs completion to your registered endpoint, verify the HMAC signature, look up which user/garment that `task_id` belongs to (you stored that mapping when you initiated the task), fetch the result image, and push it to the frontend (websocket, SSE, or the frontend polls a lightweight `GET /tryon/:taskId` status route — cheap, since it's just a DB read, not a YouCam call).

No LLM involved anywhere in this path. This is the same "fast path" category as catalog browsing from the earlier architecture — it just happens to be async instead of synchronous.

### Scenario B — user says something ambiguous in chat

**User flow:** *"show me this outfit but swap the top for something more casual"*, or *"try the blue version on him instead"* — referring to prior context, needing resolution of "this outfit," "swap," "him" against conversation + preference history.

**Route: agent resolves intent, then calls the exact same deterministic tool as Scenario A.**

This is the pinned-tool-call pattern from the discovery-turn work: the agent's only job is to turn ambiguous language into a concrete `garmentIds[]` list (same shape Scenario A's UI tap already produces) and call one tool — `initiate_tryon(garmentIds)`. The agent does **not** talk to YouCam directly, does **not** poll, does **not** wait for the image. It calls your backend's `initiate_tryon` tool, gets back `{ status: "processing", taskId }` immediately, and can reply conversationally ("Swapping that in now — one sec") while the image streams in via the same webhook path as Scenario A.

Concretely: **one `initiate_tryon` implementation, two callers** — the UI's direct tap, and the agent's tool call. Neither one talks to YouCam's REST/MCP surface on its own; both go through your backend function, which is the only thing that owns the upload/task/webhook lifecycle. This mirrors the `catalog-query.ts` pattern from Day 2-3 — one function, fast-path and agent-path both call it.

### Scenario C — the Day 4 prep pipeline (background removal + enhance on scraped images)

**User flow:** none — no user is waiting on this. It's a batch job that runs once per scraped image, during/after ingestion, before anything ever reaches a user.

**Route: direct call, no agent, not even in the request path of anything user-facing.**

Runs as part of (or right after) `ingest.ts`: for each newly scraped product image, call `AI-Photo-Background-Removal` then `AI-Photo-Enhance`, store the resulting URL back onto the `Product` record (e.g. `images_processed[]` alongside the original `images[]`). Poll-vs-webhook matters less here since it's an offline batch job with no human waiting — polling in a background worker is simpler to build by Day 4 than standing up a webhook receiver just for this one internal job. Save the webhook receiver for Scenario A/B where it actually earns its complexity (concurrent users, need for push-not-poll).

This is also where the **failure-rate measurement** from your original plan happens — log every task that comes back `error`, divide by total, compare against the 20% gate.

---

## 4. Where MCP *does* earn a place in this project

Don't connect the raw `youcam-api-mcp` server into your production Claude Agent SDK session for the runtime paths above — the built-in polling behavior is the wrong shape for a multi-user backend on a latency budget, and the deterministic tool-call pattern above already gives you a cleaner contract.

Where it's genuinely useful: **during your own Day 4-5 build**, point Claude Desktop or Claude Code itself at `youcam-api-mcp` (exact config is in the doc — `npx mcp-remote` for Claude Desktop) to interactively explore `AI-Cloth`'s actual input/output shape against real scraped images before you write `initiate_tryon`'s implementation. It'll handle auth and polling for you while you're figuring out the request contract, so you're not hand-rolling upload/poll code just to see what a response looks like. Throw that exploration away once you've confirmed the shape — the production code is the direct REST + webhook path above.

---

## 5. Webhook implementation notes (for Scenario A/B's receiver)

- Signature scheme: HMAC-SHA256, secret is base64-encoded with a `whsec_` prefix — strip the prefix, base64-decode, use the raw bytes as the HMAC key.
- Signed content is `{webhook-id}.{webhook-timestamp}.{raw-minified-json-body}` — use the **raw** request body, not a re-serialized version, or the signature won't match.
- Use the official Standard Webhooks library rather than hand-rolling verification — the doc explicitly recommends this and it removes a whole class of subtle bugs (timing-safe comparison, raw-body handling).
- `webhook-id` is stable across retries — use it for idempotency (YouCam may retry delivery; your handler should be safe to receive the same completion twice without double-processing).
- Register the endpoint once in the API Console (up to 10 endpoints supported) — do this on Day 4 alongside the prep-pipeline work, not on Day 5 when you're under more time pressure building the try-on UI.

---

## 6. Summary — one line per scenario

| Trigger | Ambiguity to resolve? | Route |
|---|---|---|
| User taps a specific garment | None | Direct: `initiate_tryon` → YouCam REST → webhook |
| User asks in chat, referencing context | Yes — which garment(s)? | Agent resolves `garmentIds[]` → same `initiate_tryon` call |
| Ingestion-time image prep | None, no user present | Direct batch job, polling is fine (no concurrency pressure) |
| Exploring the API's shape during build | N/A — it's you, not a user | MCP via Claude Desktop, throwaway |