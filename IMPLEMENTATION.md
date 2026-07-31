# OpenCommerceLens Implementation Plan

**Created:** Jul 25, 2026  
**Goal:** Build core shopping discovery → visual search → AI try-on → payments

---

## Phase 1: Discovery & Ingestion + Embedding
**Duration:** Day 1-2 | **Goal:** Full catalog pipeline with semantic search

---

### 1.1 Database Setup

**Backend already created in `/backend` with Drizzle ORM.**

**Tasks:**
- [ ] Create Supabase project (or local Postgres with pgvector)
- [ ] Add `DATABASE_URL` to `/backend/.env`
- [ ] Enable pgvector extension:
  ```sql
  create extension if not exists vector;
  ```
- [ ] Push schema to DB:
  ```bash
  cd backend && npm run db:push
  ```

---

### 1.2 Run Ingestion

**Tasks:**
- [ ] Run: `cd backend && npm run ingest`
- [ ] Verify: Should ingest from outdoorvoices.com and apc-us.com
- [ ] Check: `select count(*) from products;` should show products
- [ ] Check: `select count(*) from shops;` should show 2 shops

---

### 1.3 Test Catalog API

**Tasks:**
- [ ] Start server: `cd backend && npm run dev`
- [ ] Test: `curl "http://localhost:3000/api/catalog?category=yoga"`
- [ ] Test: `curl "http://localhost:3000/api/catalog?color=blue&maxPrice=80"`
- [ ] Test: `curl "http://localhost:3000/api/catalog/categories/list"`

---

### 1.4 Test Sessions & Preferences

**Tasks:**
- [ ] Create session: `curl -X POST http://localhost:3000/api/sessions`
- [ ] Get preferences: Use session token in Authorization header
- [ ] Update preferences: `curl -X PUT -H "Authorization: Bearer <token>" -d '{"category":"yoga"}'`
- [ ] Verify in DB: `select * from user_preferences;`

---

### 1.5 Vector Embedding (Phase 2 prep)

**Tasks:**
- [ ] Add `VOYAGE_API_KEY` to `.env`
- [ ] Install: `npm install voyageai` (already in package.json)
- [ ] Create `src/services/embeddings.ts`:
  - Embed each product with `voyage-multimodal-3.5`
  - Upsert into `product_embeddings` table
  - Run: `npm run embed` (new script)
- [ ] Verify: `select count(*) from product_embeddings;`

---

### 1.6 Phase 1 Validation Checklist

**Before moving to Phase 2:**
- [ ] Schema pushed to database
- [ ] Ingestion completed (products in DB)
- [ ] `GET /api/catalog` returns filtered results
- [ ] `GET /api/catalog?color=blue` works with fallback matching
- [ ] Session creation works
- [ ] Preferences save/load works
- [ ] Embeddings created for products

---

## Phase 2: Visual Search (Similar Products)
**Duration:** Day 3 | **Goal:** "More like this" and reverse-image search

### 2.1 Similar Products Endpoint

**Tasks:**
- [ ] Create `GET /similar/:productId` endpoint
- [ ] Implement `findSimilarToProduct()` in `vector/vector-search.ts`:
  ```sql
  select b.product_id, a.embedding <=> b.embedding as distance
  from product_embeddings a, product_embeddings b
  where a.product_id = $1 and b.product_id != $1
  order by distance asc limit 12
  ```
- [ ] Return products with distance scores

### 2.2 Semantic Search Endpoint

**Tasks:**
- [ ] Create `POST /search` endpoint:
  ```
  POST /search { text?: string, imageUrl?: string }
  ```
- [ ] Implement `vectorSearchProducts()` in `vector/vector-search.ts`:
  - Embed query with `inputType: "query"`
  - Run pgvector KNN against `product_embeddings`
  - Return bucketed results
- [ ] Add confidence labels (not raw distances):
  ```
  < 0.15 → "Exact match"
  0.15-0.35 → "Close match"
  0.35-0.55 → "Similar style"
  > 0.55 → "Nothing close" (don't show)
  ```

### 2.3 Visual Search (Reverse Image)

**Tasks:**
- [ ] Create `POST /visual-search` endpoint:
  ```
  POST /visual-search { image: Buffer }
  ```
- [ ] Create `youcam-client.ts` (or use YouCam MCP for exploration):
  - Upload image → get file_id
  - Initiate background removal task
  - Return `{ status: "processing", searchId }`
- [ ] Create webhook receiver for YouCam completion:
  - Verify HMAC signature
  - Embed cleaned image
  - Run vector search
  - Store results
- [ ] Create `GET /visual-search/:searchId` to poll results
- [ ] Implement confidence bucketing per §2.2

---

## Phase 3: Agent SDK + YouCam Try-on
**Duration:** Day 4-5 | **Goal:** AI-powered discovery + virtual try-on

### 3.1 Discovery Agent

**Tasks:**
- [ ] Set up Claude Agent SDK:
  ```typescript
  import { Agent } from "@anthropic-ai/sdk/agent";
  const agent = new Agent({
    model: "claude-sonnet-4-20250514",
    tools: [searchCatalog, setUserPreference, vectorSearchProducts, respondToUser]
  });
  ```
- [ ] Create `POST /chat` endpoint:
  ```
  POST /chat { userId, sessionId, messages: [{role, content}] }
  ```
- [ ] Implement tools:
  - `searchCatalog` → calls `catalog-query.ts`
  - `setUserPreference` → saves to DB, returns updated preferences
  - `vectorSearchProducts` → semantic search
  - `respondToUser` → terminal tool, returns `{chatReply, uiPayload}`
- [ ] Add system prompt with:
  - Product knowledge (shops, categories, price ranges)
  - Zero-result handling ("nothing in blue right now...")
  - Routing vibe queries to vector search
  - Preference narrowing (don't restart from empty)
- [ ] Wire to UI: chat panel + grid replace

### 3.2 User Preferences Memory

**Tasks:**
- [ ] Load persisted preferences on session start
- [ ] Pass full conversation history + preferences to each turn
- [ ] Auto-suggest based on preference profile

### 3.3 YouCam Try-on Integration

**Tasks:**
- [x] Create `POST /tryon` endpoint:
  ```
  POST /tryon { userId, garmentId }
  ```
- [x] Create `youcam-client.ts`:
  - Upload garment image + user selfie
  - Initiate AI-Cloth task
  - Store taskId → userId mapping
  - Return `{ status: "processing", taskId }`
- [x] Create webhook receiver:
  - Verify HMAC signature
  - Look up userId for taskId
  - Store result image URL
- [x] Create `GET /tryon/:taskId` endpoint:
  - Return status + result image URL when ready
- [ ] UI: loading state → result display on card
- [x] Create batch image prep script for background removal + enhancement

### 3.4 Agent Try-on Tool

**Tasks:**
- [ ] Add `initiateTryon` tool to discovery agent:
  - Resolves garmentIds from ambiguous language
  - Calls same `POST /tryon` as direct path
  - Returns conversational reply + taskId for UI
- [ ] Add selfie capture flow:
  - Prompt user to upload if no selfie on file
  - Require account for selfie storage (guest can't store face photo)

---

## Phase 4: Payment (Prava Integration)
**Duration:** Hackathon (Jul 31 - Aug 2) | **Goal:** Real checkout automation

### 4.1 Prava MCP Setup

**Tasks:**
- [ ] Confirm Prava sandbox access
- [ ] Add Prava MCP to checkout agent only (separate, privilege-gated):
  ```
  mcp.addServer("prava", "mcp.pay.prava.space/mcp")
  ```
- [ ] Verify token-in-checkout assumption:
  - Test: drop Prava token as card+CVV into Shopify checkout
  - If fails → investigate per-PSP integration needs

### 4.2 Checkout Flow

**Tasks:**
- [ ] Create `POST /checkout` endpoint:
  ```
  POST /checkout { userId, productId, variantId }
  ```
- [ ] Create separate checkout agent with Prava MCP:
  - Has `payments:write` and `checkout:run` scopes
  - Not reachable from discovery agent
- [ ] Implement mandate request → passkey approval → token flow
- [ ] Drop token into shop's Shopify checkout
- [ ] Return confirmation

### 4.3 Checkout UI

**Tasks:**
- [ ] Add "Buy" button to product cards
- [ ] Require account for checkout (no guest checkout)
- [ ] Show order confirmation state

---

## Testing Checklist

### Phase 1 Tests
- [ ] Ingestion runs without errors for both stores
- [ ] All products have category, minPrice, images
- [ ] Embeddings created for all products
- [ ] `GET /catalog` returns filtered results
- [ ] User preferences save/load correctly

### Phase 2 Tests
- [ ] `GET /similar/:productId` returns 12 similar products
- [ ] `POST /search` with "boho festival" returns vibe-matched products
- [ ] `POST /visual-search` completes background removal + search
- [ ] Confidence labels display correctly

### Phase 3 Tests
- [ ] `POST /chat` with "yoga clothes, blue" returns products + chat reply
- [ ] Follow-up "make it cheaper" narrows existing search
- [ ] Zero-result case shows helpful message
- [ ] Try-on flow: upload selfie → select garment → see result
- [ ] Agent "try this on" suggestion requires explicit confirmation

### Phase 4 Tests
- [ ] Checkout agent successfully completes test transaction
- [ ] Order confirmation surfaces in UI
- [ ] Guest → account conversion preserves preferences

---

## File Structure (Current)

```
/workspace/project/opencommercelens/
├── backend/                    # NEW: Express + Drizzle backend
│   ├── src/
│   │   ├── index.ts          # Express app entry
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic (ingest, etc.)
│   │   ├── db/              # Drizzle schema + client
│   │   └── types/           # Zod schemas
│   ├── drizzle.config.ts
│   ├── package.json
│   └── README.md
├── src/                       # Legacy (root-level, to be deprecated)
├── catalog.json
├── types.ts
├── PLAN.md
├── Flow.md
└── IMPLEMENTATION.md
```

---

## Dependencies (Already Added)

Backend already has all dependencies installed:
- `express` - HTTP server
- `drizzle-orm` - Type-safe ORM
- `postgres` - PostgreSQL client
- `voyageai` - Vector embeddings (for Phase 2)
- `zod` - Schema validation
- `dotenv` - Environment variables
- `cors` - CORS support

---

## Env Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Required for Phase 1
DATABASE_URL=postgresql://user:password@localhost:5432/opencommercelens

# Required for Phase 2 (embeddings)
VOYAGE_API_KEY=voyage-xxxxx

# Required for Phase 3 (try-on)
YOUCAM_API_KEY=xxxxx
YOUCAM_WEBHOOK_SECRET=whsec_xxxxx

# Required for Phase 3 (chat agent)
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

