# Somela Shopping Agent — Repository Knowledge

**Last updated:** Jul 25, 2026

---

## Project Overview

Somela is an AI-powered shopping marketplace with:
- **Chat-driven discovery** — natural language product search
- **AI try-on** — virtual try-on via YouCam/Perfect Corp API
- **Visual search** — "Shazam for clothes" reverse-image lookup
- **AI checkout** — automated purchases via Prava payment

**Key principle:** Marketplace is NOT a chatbot. It's a browsable product grid; AI panel is a co-pilot alongside it.

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js/TypeScript (ESM) |
| LLM | Anthropic Claude (Agent SDK) |
| Database | Postgres + pgvector (Supabase for fast setup) |
| Embeddings | Voyage AI multimodal-3.5 |
| Image Processing | YouCam/Perfect Corp API |
| Payments | Prava (hackathon focus) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Product Grid (UI)                     │
└─────────────────────────────────────────────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
   ┌──────────┐   ┌────────────┐   ┌───────────┐
   │  Fast    │   │  Discovery  │   │  Visual   │
   │  Path    │   │  Agent      │   │  Search   │
   │ (GET)    │   │  (POST)     │   │  (POST)   │
   └──────────┘   └────────────┘   └───────────┘
         │                 │                 │
         ▼                 ▼                 ▼
   ┌──────────────────────────────────────────────────┐
   │            Catalog Query (structured filter)       │
   │            Vector Search (pgvector + Voyage)       │
   └──────────────────────────────────────────────────┘
```

---

## Key Files

| File | Purpose |
|------|---------|
| `types.ts` | `Product`, `ProductVariant` interfaces |
| `catalog.json` | Real scraped products (2 stores) |
| `ingest.ts` | Catalog ingestion from Shopify stores |
| `catalog-query.ts` | Structured search (category/color/price) |
| `discovery-turn.ts` | AI agent loop for chat discovery |
| `user-preferences.ts` | User preference persistence |
| `vector/PLAN.md` | Vector search architecture |
| `vector/*.ts` | Embedding + similarity search |
| `Visual/PLAN.md` | Visual search ("Shazam for clothes") |
| `YOUCAM.md` | YouCam try-on API integration |
| `Flow.md` | App flow decisions (auth, discovery, try-on, checkout) |

---

## Build Timeline

| Phase | Day | Focus |
|-------|-----|-------|
| 1 | Day 1-2 | Discovery & Ingestion + Embedding |
| 2 | Day 3 | Visual Search (similar products) |
| 3 | Day 4-5 | Agent SDK + YouCam Try-on |
| 4 | Hackathon | Prava Payment Integration |

## Backend Structure

Backend is in `/backend` folder with Express + Drizzle ORM.

```
backend/
├── src/
│   ├── index.ts              # Express app entry
│   ├── routes/              # API routes
│   │   ├── catalog.ts       # GET /api/catalog ✅
│   │   ├── sessions.ts      # POST /api/sessions ✅
│   │   ├── preferences.ts   # GET/PUT /api/preferences ✅
│   │   ├── search.ts        # Semantic search (Phase 2)
│   │   ├── chat.ts          # AI chat (Phase 3)
│   │   ├── tryon.ts         # YouCam try-on (Phase 3)
│   │   └── visual-search.ts # Visual search (Phase 2)
│   ├── services/
│   │   └── ingest.ts        # Shopify catalog ingestion
│   ├── db/
│   │   ├── schema.ts        # Drizzle schema
│   │   └── index.ts         # DB client
│   └── types/
│       └── api.ts           # Zod schemas
├── drizzle.config.ts
├── package.json
└── README.md
```

### Database Schema (Drizzle)

| Table | Description |
|-------|-------------|
| `shops` | Store configurations |
| `products` | Product catalog |
| `product_embeddings` | Vector embeddings (1024-dim, pgvector) |
| `sessions` | User sessions |
| `users` | User accounts |
| `user_preferences` | Preference profiles |
| `user_selfies` | User photos for try-on |
| `tryon_tasks` | Try-on job tracking |
| `visual_search_tasks` | Visual search job tracking |
| `conversations` | Chat history |

## Phase 1 Implementation (Backend)

### Done ✅
- Express server with routes
- Drizzle ORM schema with pgvector
- Catalog API (`GET /api/catalog`)
- Sessions API (`POST /api/sessions`)
- Preferences API (`GET/PUT /api/preferences`)
- Ingest service for Shopify catalog
- Visual search API (`POST /api/visual-search`) - works with text queries

### Database Status
- **2227 products** ingested (573 from outdoor-voices, 1654 from apc-us)
- **15 products** currently embedded (Voyage AI rate-limited)
- All products need re-embedding with voyage-3-large for image-based visual search

### Voyage AI Models
| Model | Dimensions | Image URLs | Notes |
|-------|-----------|------------|-------|
| voyage-3-lite | 512 | ❌ | Used for initial embeddings |
| voyage-3-large | 1024 | ✅ | Needed for visual search with images |
| voyage-multimodal-3 | ? | ✅ Base64 only | Not usable via URL |

### To Do
1. Re-embed all 2227 products with voyage-3-large (rate limited)
2. Full visual search with image uploads

---

## Visual Search API

```
POST /api/visual-search
{
  "text": "denim jeans"  // or
  "imageUrl": "https://..."  
}
```

Returns taskId, poll GET /api/visual-search/:taskId for results.

**Note:** Currently works best with text queries (15 embedded products).
Full image search requires re-embedding all products with voyage-3-large.

---

## User Preference Layers

| Layer | Scope | Lifetime |
|-------|-------|----------|
| Conversation history | Current session | Cleared per session |
| Persisted profile | `user_preferences` row | Durable across sessions |

---

## Commands

```bash
# Type check
npx tsc --noEmit

# Run scripts
npx tsx ingest.ts
npx tsx run-discovery.ts

# Install dependencies
npm install
```

---

## API Design Principles

1. **One function, multiple callers** — e.g., `catalog-query.ts` used by both fast-path GET and agent tool
2. **Direct paths for deterministic actions** — no LLM for catalog browse, try-on initiation
3. **Agent only for ambiguity** — discovery-turn resolves intent, then calls deterministic tools
4. **Async for long operations** — try-on, visual search return immediately with taskId, webhook for completion

---

## Stores Currently Scraped

- ✅ `outdoorvoices.com` (outdoor-voices)
- ✅ `apc-us.com` (apc-us)
- ❌ `madhappy.com`, `officinegenerale.com`, `adoredvintage.com` (bot protection)

---

## Known Gaps

- Color field missing for single-colorway products (fallback exists in code)
- No real Postgres yet (flat JSON)
- No HTTP routes yet
- No YouCam client implementation (only types/docs)
- No agent SDK wired to HTTP
