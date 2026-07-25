# App Flow Decisions

Jul 25, 2026. Companion to `plan.md` (build schedule) and `youcam-integration.md` (try-on mechanics). This doc is about product/system *flow* — what happens, in what order, and why — not implementation code.

---

## 0. The core idea in one paragraph

It's a marketplace, not a chatbot. The main surface is a product grid, browsable like any storefront. An AI side panel sits alongside it, always available but never mandatory — a user can shop by scrolling and tapping, or by talking, and both control the same grid. The panel is a co-pilot for the marketplace, not a replacement for it. This matters for every decision below: whichever route a user takes (tap or type), it should converge on the same state, not fork into two different experiences.

---

## 1. Auth & session flow

**Decision: guest sessions are allowed, browsing is never gated, but two specific actions require a real account.**

- App load creates a session either way — an anonymous `session_id` for guests, or a real `user_id` for logged-in users. Both get a `user_preferences` row; a guest's is ephemeral (ties to the session, not durable across devices/browsers), a logged-in user's persists.
- **Try-on requires a selfie on file, which requires at least a lightweight account** (even just email — no need for full KYC at this stage) — you're storing a photo of someone's face, that's not something to attach to an anonymous session that could be someone else's browser five minutes later.
- **Checkout requires a real account, full stop** — Prava's mandate/passkey flow is inherently identity-bound, and a guest session has no durable identity to bind a payment mandate to.
- Guest-to-account conversion should carry the guest's accumulated preferences forward (merge the ephemeral row into the new persisted one) rather than discarding them — a user who spent five minutes refining "yoga clothes, blue, under $80" shouldn't have to repeat that the moment they sign up to actually buy something.

## 2. Discovery/ingestion flow (scheduled, not user-triggered)

**Decision: catalog refresh is a background job on a schedule, decoupled from any live user session — with one narrow exception.**

- `ingest.ts` runs on a daily schedule per store (cron, or a scheduled function — doesn't need to be fancier than that pre-hackathon). Each run upserts into the catalog DB and re-runs the Day 4 image-prep pipeline (background removal + enhance) only on images that are new or changed since the last run — no point re-processing 3,000 unchanged photos daily.
- Each shop's catalog row carries a `fetchedAt` timestamp (already in the `Product` type from Day 1's build). Define staleness as **>24h since last successful fetch** for now — revisit if a store's inventory turns over faster than that.
- **The one exception where a live user action touches ingestion:** if the discovery agent's `search_catalog` call comes back suspiciously thin against a query that should clearly have matches (e.g. "yoga clothes" returns 0 results from a store that definitely carries yoga wear), the agent can trigger a targeted live rescan of that one shop rather than waiting for tomorrow's scheduled run. This should be rare and rate-limited (e.g. max once per shop per hour) — it's a fallback for staleness, not a substitute for the scheduled job.

## 3. Marketplace load flow (first paint, before any chat)

**Decision: personalize the default view for returning users, show a sensible curated default for new ones — never an empty grid.**

- **Returning user (persisted preferences exist):** default grid load uses their last saved `{category, color, price}` filter via the plain `GET /catalog` fast path — no agent call needed, this is just a DB read using data that's already there.
- **New user / guest with no preference row yet:** default grid shows a curated cross-section (e.g. a handful of items per category, per store) rather than nothing. The AI panel shows an inviting prompt ("Tell me what you're looking for, or just browse") rather than assuming intent.
- Either way, the grid is populated before the user has typed anything — the AI panel augments the marketplace, it doesn't gate access to it.

## 4. Chat-driven discovery flow (the "list morphs as you chat" behavior)

**Decision: each discovery turn fully replaces the grid's contents with its result set — not an incremental merge.**

Walking the actual turn: user types "yoga clothes, blue" into the side panel → `POST /chat` → `discovery-turn.ts` (already built) parses this into `{category: yoga, color: blue}`, saves it to `user_preferences`, searches the catalog, and returns `{chatReply, uiPayload}`. The frontend does two things with that response: appends `chatReply` to the chat panel, and **replaces** the grid's contents with `uiPayload`. Full replace, not append — a user refining their search expects the marketplace to reflect their latest intent, not accumulate every past query's results.

**Follow-up refinement is where this needs more care than the first turn.** If the user then says "actually make it cheaper," the agent has the full conversation history plus the just-saved preference row, so it should narrow the *existing* filter (`{category: yoga, color: blue, maxPrice: X}`) rather than starting over from an empty one — this only works because `discovery-turn.ts` already passes full message history into each call, not just the latest message in isolation. Worth explicitly testing this exact "narrow an existing search" case on Day 3, not just fresh queries.

**Zero-result handling:** if `search_catalog` comes back empty, the agent's `chatReply` should say so and suggest a reasonable broadening ("nothing in blue right now — want to see yoga wear in other colors?") rather than silently rendering an empty grid. This is a prompt-level instruction to add to `discovery-turn.ts`'s system prompt.

## 5. Preference memory — two distinct layers, don't conflate them

This is the point from the earlier GTM discussion — the preference profile is the retention mechanic, so it's worth being precise about what's actually being remembered and why.

| Layer | Scope | Lifetime | Purpose |
|---|---|---|---|
| **Conversation history** | Current chat session | Cleared per session (or kept short-term) | Lets the agent resolve "this outfit," "cheaper," "him" against what was just said |
| **Persisted preference profile** | `user_preferences` row, per account | Durable across sessions/devices | Personalizes the next marketplace load, lets the AI proactively suggest without being re-asked |

Every `set_user_preference` call from a discovery turn writes to the durable layer, not just the session — that's what makes the marketplace personalized *next* time the user opens the app, not just within the current chat. This is the concrete mechanic behind "the profile is the retention mechanic, not the try-on" from the GTM positioning.

## 6. Try-on flow — two entry points, one hard rule

Full mechanics are in `youcam-integration.md`. The flow-level decisions:

- **User-selected:** tap a garment card → direct call, no agent, no ambiguity to resolve (Scenario A in the YouCam doc).
- **AI-selected, i.e. the agent proactively suggests a try-on** based on the preference profile ("since you're into blue yoga wear, want to see the Recharge Legging on you?") — **this must always be a suggestion requiring an explicit tap to confirm, never an auto-fired try-on.** The agent can *propose* a candidate in its chat reply and surface it as a suggested card in the panel, but running an actual `initiate_tryon` job that consumes the user's stored selfie happens only on that explicit confirmation, same as the tap path. Don't let "AI has chosen for them based on preference" quietly become "AI runs the job without asking" — it's the user's photo and it costs real API credits per run.
- **First-time selfie capture:** whichever path triggers try-on, if the user has no selfie on file yet, both paths branch into a capture/upload step first, then proceed. This is also the point where guest sessions get pushed to create an account (see section 1).

## 7. Checkout flow (post-hackathon, Prava)

- Only reachable from an authenticated account (section 1).
- User taps "Buy" on a product card or a try-on result → routes to the checkout agent, which is a **separately privileged** Claude Code invocation from the discovery/try-on agents — it's the only one with the Prava MCP connection and `payments:write`/`checkout:run` scopes, per the architecture decision from earlier.
- Mandate request → Prava's hosted passkey approval (user leaves your UI momentarily for Prava's own approval screen) → token returned → checkout agent completes the purchase on the merchant's real checkout → confirmation surfaces back into both the chat panel and the marketplace (e.g. an order-confirmed state on that product card).

## 8. Edge states worth naming explicitly (so they're designed, not discovered)

| Situation | Handling |
|---|---|
| Discovery query returns zero results | Agent says so in `chatReply`, suggests a broadened filter — never a silently empty grid |
| Catalog is stale for the store a query needs | Agent-triggered targeted rescan, rate-limited (max 1/shop/hour) |
| YouCam task fails | Surface an error state on that specific card, offer retry — don't fail the whole chat turn |
| Webhook never arrives (dropped delivery) | Safety-net poll after a timeout window (e.g. 30s) as a fallback, since webhook delivery isn't guaranteed |
| Guest tries to buy | Redirect to account creation, carrying cart/selection state through, not discarding it |
| User asks the agent to buy something without confirming price/store first | Checkout agent should restate what it's about to do and require explicit confirmation before calling Prava — this is a real money action, treat it with more friction than a discovery or try-on turn, not less |