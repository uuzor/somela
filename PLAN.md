# Shopping Agent — Build Plan

Today: Jul 25, 2026 (Day 1 of 6 pre-hackathon). Hackathon: Jul 31 – Aug 2 (Prava integration only).

---

## 0. Status check — what's already built (end of Day 1)

- **Niche locked:** general clothing, full-outfit discovery (not a micro-niche).
- **Stores confirmed live for scraping (2 of 5 target):** `outdoorvoices.com`, `apc-us.com`. Three more (`madhappy.com`, `officinegenerale.com`, `adoredvintage.com`) failed a plain curl (`000`, likely bot-protection) — retry with a browser User-Agent, or headless-browser fetch, or fold in as mock data. Not blocking.
- **Catalog ingestion pipeline built** (`src/types.ts`, `src/shopify-raw-types.ts`, `src/shopify-public-json-source.ts`, `src/ingest.ts`) — paginates, retries on 429, normalizes into a shared `Product` shape, type-checks clean.
- **Real sample validated against the pipeline:** category-guessing works (`skort` → `bottom` via product_type fallback). **Known gap found:** single-colorway products don't expose a structured `color` field in Shopify's raw data — patched with a title/tag fallback in `src/catalog-query.ts`, not yet re-validated against a full real catalog pull.
- **Discovery-turn agent loop built** (`src/discovery-turn.ts`) — tool-use loop with `search_catalog`, `set_user_preference`, and a terminal `respond_to_user` tool the model must call exactly once. Type-checks clean, executes up to the API auth boundary (no key in build sandbox — needs a real run with `ANTHROPIC_API_KEY` set).
- **Scoping enforced in code, not prompt:** `set_user_preference`'s tool schema has no `userId` field — the model can't choose whose row it writes. `userId` is injected by the caller.

**Not yet done:** real end-to-end run of discovery-turn against a real catalog, any DB (still flat JSON files), any HTTP route, try-on, checkout, and the SDK choice below.

---

## 1. Open decision: Claude Agent SDK vs Codex CLI headless mode

Both are legitimate "headless agent wired into your own infra" options and either would satisfy Prava's Agent-path integration (it's MCP-based, so it's model/runtime agnostic). Worth deciding deliberately rather than drifting into one.

| | Claude Agent SDK | Codex CLI headless (`codex exec`) |
|---|---|---|
| Fit with work already built | Direct — `discovery-turn.ts` already uses Anthropic's tool-use pattern; migrating to the Agent SDK is additive (session/thread management, built-in MCP wiring), not a rewrite | Would mean re-porting the tool loop to a different SDK/auth model |
| MCP support | Native, first-class | Added recently — Python SDK auth, MCP with parallel tool calls, per the release you cited |
| Anthropic's own stated use cases | Explicitly lists SRE/oncall-style agents — matches this project's "diagnose intent → act on DB/tools → report back" shape | General-purpose coding-agent framing, less domain-matched language, but functionally comparable |
| Switching cost today | Low (extend, don't replace) | Medium-high (new auth flow, re-verify tool-loop behavior) |

**Recommendation:** stay on the Claude Agent SDK path for now — not because Codex is worse, but because the code already built (discovery-turn's tool loop) is a near-direct fit for it, and switching mid-build burns days you don't have. Revisit after the hackathon if there's a concrete reason (cost, latency, a Codex-specific feature you need) — don't switch on vibes.

---

## 2. Day 2 (Jul 26) — Catalog pipeline hardening + real DB

- [ ] Run `npx tsx src/ingest.ts` for real against both live stores; commit the resulting `catalog.json`.
- [ ] Spot-check 10-15 real entries the way we checked the skort — look specifically for: missing colors (known gap, fallback exists — confirm it actually catches real cases), category misses (add keywords as found, e.g. `skort`), price parsing edge cases (sale prices, bundles).
- [ ] Stand up Postgres with RLS (Supabase is the fast path) and migrate `user-preferences.ts` off flat files onto a real `user_preferences` table scoped by `user_id`. Do this now, not later — Day 5's try-on history and eventual Prava checkout both need real scoped rows, and retrofitting RLS after the agent code is wired to file paths is more painful than doing it now while there's one call site.
- [ ] Migrate `catalog-query.ts` to query the DB instead of a JSON file (same function signature — nothing calling it should need to change).
- [ ] Stub a re-ingestion trigger (manual re-run is fine pre-hackathon; don't build a cron system you don't need yet).

## 3. Day 3 (Jul 27) — Real HTTP surface + search hardening

- [ ] Wire `discovery-turn.ts` behind a `POST /chat` route.
- [ ] Wire `catalog-query.ts` behind a plain `GET /catalog?category=&color=&minPrice=&maxPrice=` route — this is the fast path from the architecture diagram, no agent involved.
- [ ] Run the discovery turn against 8-10 real varied queries ("yoga clothes, blue", "something for a date, under $100", "denim jacket") against the real catalog from Day 2. Watch specifically for cases where the model's `search_catalog` filter doesn't match how the catalog actually categorizes things — that's a normalization gap, fix in `catalog-query.ts`/`guessCategory`, not by fighting the model's parsing.

## 4. Day 4 (Jul 28) — Image prep pipeline + the failure-rate gate

- [ ] Run YouCam background-removal + enhance against real scraped product images from both live stores (not placeholders).
- [ ] Measure and record the failure rate against a defined threshold — set the number now: **>20% failure = stop and fix the prep pipeline before touching the try-on UI.**
- [ ] This is a hard gate into Day 5 — don't let a shaky image pipeline become a UI problem you paper over.

## 5. Day 5 (Jul 29) — Try-on turn (pinned tool call, not a free agent loop)

- [ ] Wrap YouCam's try-on call as a single deterministic tool: `youcam_tryon(user_image, garment_ids[])`.
- [ ] Agent's only job here: resolve which garments the user means ("the whole outfit" vs "just the top") from message + preference history, then call the one tool. No free-form image-processing decisions inside the agent loop — same discipline as the discovery turn's `respond_to_user` pattern (structured in, structured out).
- [ ] Wire selfie capture → prep → try-on → display end-to-end.
- [ ] Stub the "Buy" button — shows intent, no real checkout yet.

## 6. Day 6 (Jul 30) — Polish, real users, secure Prava access

- [ ] Test with a handful of real people from the niche community.
- [ ] Soft-launch waitlist post to that same community.
- [ ] **Do this today, not Day 1 of the hackathon:** confirm Prava sandbox/dashboard access is actually active. Request it now if not.
- [ ] Push hard to confirm the single biggest risk before the clock starts: whether Prava's token is genuinely droppable as a standard card + CVV into the target shop's real Shopify checkout. If this needs deeper per-PSP integration instead, the whole "one automation pattern, many shops" hackathon plan changes — better to know today than on hour 6.

---

## 7. Hackathon (Jul 31 – Aug 2, 48 hrs) — Prava only

| Window | Focus |
|---|---|
| Hr 0–6 | Add Prava MCP (`mcp.pay.prava.space/mcp`) as a **separate, privilege-gated** checkout-agent connection — not reachable from the general discovery agent. Confirm token-in-real-checkout assumption if not already confirmed Day 6. |
| Hr 6–24 | Build mandate request → passkey approval → token → drop into that shop's real checkout form. Run a real test transaction. |
| Hr 24–36 | If time allows, extend the same automation pattern to a 2nd/3rd shop. Add retry/error handling on failed mandates or checkout failures. |
| Hr 36–46 | Record the demo (selfie → discovery → try-on → mandate approval → completed order). Write the submission — lead with the preference profile as the retention mechanic, try-on and Prava as supporting features, per the earlier positioning call. |
| Hr 46–48 | Submit. |

---

## 8. Standing risk register

1. **Prava token/checkout compatibility** — highest severity, confirm by Day 6 at the latest.
2. **Bot-protected stores** (madhappy, officinegenerale, adoredvintage) — not blocking, revisit with browser UA / headless fetch, or leave as mock.
3. **Scraped-data attribute gaps** (color being the first one found) — treat as an ongoing discipline: spot-check a sample after every real ingestion run, don't assume the schema is clean because it type-checked.
4. **Agent-loop cost/latency** — only the discovery and checkout turns should go through the full agent loop; catalog browsing and try-on execution stay on deterministic/fast paths. Don't let this drift as the codebase grows









Use this version:

  1. Describe your company or idea in a single sentence
  OpenCommerceLens is an AI-native shopping assistant that turns natural conversation into personalized product discovery, comparison, try-
  on, and checkout in a single seamless flow.

  2. Why are you working on this idea?
  I’m working on this because e-commerce still forces people to do too much manual work before they can buy anything: search, filter,
  compare, and jump between tools. I believe shopping should feel more like a high-trust conversation that quickly understands intent,
  narrows options, and helps people make better decisions with less friction. OpenCommerceLens is my attempt to build that experience from
  the ground up.

  3. How far along are you? Describe your progress to-date
  I have a working product prototype with a chat-first discovery experience, streaming AI responses, tool calling, backend session
  persistence, Google authentication, markdown-formatted assistant responses, and a live frontend-backend flow that already supports moving
  from conversation into product exploration and canvas-based actions. The core architecture is in place, and I’m actively iterating on the
  interaction model, backend contracts, and product surfaces.

  4. Give a breakdown of the equity ownership in percentages among yourself and any other stockholders
  I own 100% of the company. There are no other stockholders.

  5. Share something you have achieved in the past that you are particularly proud of accomplishing
  One thing I’m especially proud of is launching a video production AI platform end to end. It required taking an idea from concept to a real
  product, shipping the technical infrastructure, and making the experience usable enough for people to actually adopt. That taught me how to
  build and iterate quickly on AI products with a real user workflow, which is directly informing how I’m building OpenCommerceLens.

  If you want, I can make these even stronger in one of these directions:
.