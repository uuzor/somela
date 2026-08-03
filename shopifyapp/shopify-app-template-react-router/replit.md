# GoatSight — Shopify Merchant App

A Shopify embedded app that lets merchants selling clothes and shoes sync their product catalogues to the GoatSight image-search and embedding backend. Developers can then pay per query to run AI-powered visual similarity search against those indexed products.

## Stack

| Layer | Technology |
|---|---|
| Framework | React Router v7 (Shopify App Template) |
| Shopify integration | `@shopify/shopify-app-react-router` |
| Database | SQLite via Prisma |
| UI | Shopify Polaris Web Components (`<s-*>`) |
| Auth | Shopify OAuth (handled by adapter) |
| Billing | Shopify recurring app subscriptions |

## Architecture

```
app/
  shopify.server.ts       ← Shopify app config, billing plans, afterAuth hook
  db.server.ts            ← Prisma client singleton
  services/
    goatsight.server.ts   ← HTTP client for your external embedding backend
    sync.server.ts        ← Sync orchestration (initial, full resync, single, webhook)
  routes/
    app.tsx               ← Authenticated layout (nav: Dashboard, Products, Billing)
    app._index.tsx        ← Dashboard — stats, last sync, quick actions
    app.products.tsx      ← Product listing with status badges + per-product resync
    app.billing.tsx       ← Subscription plan management
    app.api.resync-all.tsx          ← POST: trigger full catalogue resync
    app.api.resync.$productId.tsx   ← POST: resync a single product
    webhooks.products.create.tsx    ← Auto-sync on product create
    webhooks.products.update.tsx    ← Auto-sync on product update
    webhooks.products.delete.tsx    ← Remove from index on delete
    webhooks.app.uninstalled.tsx    ← Cleanup on uninstall
prisma/
  schema.prisma           ← Session, Merchant, Product models
```

## V1 Feature Summary

| Feature | Route/Handler |
|---|---|
| Shopify OAuth install | Handled by adapter + `afterAuth` hook |
| Merchant registration | `afterAuth` → `prisma.merchant.upsert` |
| Billing (Starter $19, Growth $49, Pro $149/mo) | `app.billing.tsx` |
| Initial catalogue sync | Triggered on first dashboard load |
| Dashboard stats | `app._index.tsx` |
| Product list + status | `app.products.tsx` |
| Per-product manual resync | `app.products.tsx` action |
| Full catalogue resync | Dashboard primary action |
| Webhook auto-sync (create/update/delete) | `webhooks.products.*.tsx` |
| Uninstall cleanup | `webhooks.app.uninstalled.tsx` |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SHOPIFY_API_KEY` | Yes | From Shopify Partners dashboard |
| `SHOPIFY_API_SECRET` | Yes | From Shopify Partners dashboard |
| `SHOPIFY_APP_URL` | Yes | Your public app URL |
| `SCOPES` | Yes | Set to `read_products` |
| `SESSION_SECRET` | Yes | Random secret for session signing |
| `DATABASE_URL` | Yes | PostgreSQL connection string (same DB your backend uses) |
| `VOYAGE_API_KEY` | Yes | Voyage AI API key (for `voyage-4` image embeddings) |

## Running Locally

Shopify apps require the Shopify CLI for local development (tunnelling, env injection):

```bash
shopify app dev
```

Or for a plain server (after building):

```bash
npm run setup   # runs prisma generate + migrate deploy
npm run build
npm run start
```

## Database

Prisma with SQLite (`prisma/dev.sqlite`). Models:

- **Session** — Shopify OAuth sessions
- **Merchant** — one row per installed store (plan, sync status, subscription)
- **Product** — one row per Shopify product per store (sync status, error message)

Run migrations:

```bash
npx prisma migrate dev --name <description>
npx prisma studio   # browse data
```

## How the plugin writes to the shared database

The plugin talks directly to your infrastructure — no intermediate backend API call:

```
Shopify App  →  Voyage AI (voyage-4)    →  image embedding (1024-dim)
             →  PostgreSQL + pgvector   →  products + product_embeddings tables
```

Service layer: `app/services/vector.server.ts`

**products table** — upserted on every sync:

| Column | Source |
|---|---|
| `id` | `shopify::{shop}::{numericId}` |
| `title` | Shopify product title |
| `description` | Shopify body HTML |
| `category` | Shopify `productType` |
| `tags` | Shopify tags |
| `images` | Shopify image CDN URLs |
| `min_price` / `max_price` | Derived from variants |
| `url` | `https://{shop}/products/{handle}` |
| `shop` | Merchant's myshopify.com domain |

**product_embeddings table** — upserted after each Voyage AI call:

| Column | Source |
|---|---|
| `product_id` | Same `id` as above |
| `embedding` | voyage-4 output for primary image URL |
| `embedded_at` | Timestamp |

On first deploy, `ensureSchema()` in vector.server.ts runs `ALTER TABLE products ADD COLUMN IF NOT EXISTS shop TEXT` to add multi-tenant support to the existing schema.

Your backend continues to handle all developer-facing search queries against the same tables — the plugin only writes.

## V2 Roadmap (not built)

- Customer-facing search bar widget embeddable in storefronts
- Per-merchant search results page
- Developer API key management UI
- Query analytics for merchants

## User Preferences

- Keep existing project structure; don't migrate stack
- V1 is merchant-only facing
- V2 will add customer-facing search widget
