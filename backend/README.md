# OpenCommerceLens Backend

Express.js API for the OpenCommerceLens shopping agent.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env with your database URL
```

### 3. Set up database

Using Supabase:
1. Create a new Supabase project
2. Copy the `DATABASE_URL` from Settings > Database
3. Enable pgvector extension in SQL Editor:
   ```sql
   create extension if not exists vector;
   ```

### 4. Push schema to database

```bash
npm run db:push
```

### 5. Ingest catalog

```bash
npm run ingest
```

### 6. Start dev server

```bash
npm run dev
```

---

## API Endpoints

### Health
- `GET /health` - Health check

### Catalog (Phase 1 ✅)
- `GET /api/catalog` - List products with filters
  - Query: `?category=yoga&color=blue&maxPrice=80&limit=20&offset=0`
- `GET /api/catalog/:id` - Get single product
- `GET /api/catalog/shops/list` - List available shops
- `GET /api/catalog/categories/list` - List available categories

### Sessions (Phase 1 ✅)
- `POST /api/sessions` - Create session
- `GET /api/sessions/:token` - Get session
- `DELETE /api/sessions/:token` - Invalidate session

### Preferences (Phase 1 ✅)
- `GET /api/preferences` - Get user preferences (auth: Bearer token)
- `PUT /api/preferences` - Update preferences
- `DELETE /api/preferences` - Clear preferences

### Search (Phase 2 🔜)
- `GET /api/search/similar/:productId` - "More like this"
- `POST /api/search/semantic` - Semantic search

### Visual Search (Phase 2 🔜)
- `POST /api/visual-search` - Upload image for search
- `GET /api/visual-search/:taskId` - Get results

### Chat (Phase 3 🔜)
- `POST /api/chat` - AI-powered product discovery
- `GET /api/chat/history` - Get conversation history

### Try-on (Phase 3 🔜)
- `POST /api/tryon` - Start try-on
- `GET /api/tryon/:taskId` - Get try-on status
- `POST /api/tryon/selfie` - Upload selfie
- `POST /api/tryon/webhook` - YouCam webhook

---

## Database Schema

### Tables

| Table | Description |
|-------|-------------|
| `shops` | Store configurations |
| `products` | Product catalog |
| `product_embeddings` | Vector embeddings (1024-dim) |
| `sessions` | User sessions |
| `users` | User accounts |
| `user_preferences` | Preference profiles |
| `user_selfies` | User photos for try-on |
| `tryon_tasks` | Try-on job tracking |
| `visual_search_tasks` | Visual search job tracking |
| `conversations` | Chat history |

---

## Tech Stack

- **Runtime:** Node.js 22+ / TypeScript
- **Framework:** Express.js
- **ORM:** Drizzle ORM + Postgres
- **Vector:** pgvector
- **Validation:** Zod

---

## Project Structure

```
src/
├── index.ts          # Express app entry
├── routes/           # API routes
│   ├── catalog.ts
│   ├── sessions.ts
│   ├── preferences.ts
│   ├── search.ts
│   ├── visual-search.ts
│   ├── chat.ts
│   └── tryon.ts
├── services/         # Business logic
│   └── ingest.ts
├── db/              # Database
│   ├── index.ts     # Drizzle client
│   └── schema.ts    # Table definitions
└── types/           # TypeScript types
    └── api.ts       # Zod schemas
```

