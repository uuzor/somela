# Vector Search — Architecture

Jul 25, 2026. Adds semantic/visual similarity search on top of the structured `search_catalog` filter from Day 2-3.

---

## 1. Why this is needed — the gap structured filters can't close

`catalog-query.ts`'s filter is exact-match: `category`, `color`, `price`. It's great for "yoga clothes, blue" but useless for the queries a marketplace chat panel actually gets a lot of:

- Vibe/style queries with no clean tag: *"something boho for a festival"*, *"minimalist office fit"*, *"date night, not too try-hard"*.
- Reverse-image queries: user uploads a photo of an outfit they saw elsewhere — *"find me something like this."*
- Cross-product similarity: *"more like this"* on a product card, without the user typing anything.

None of these map to `{category, color, price}`. They need embedding-based nearest-neighbor search.

## 2. Model choice: `voyage-multimodal-3.5`, not CLIP

The key property that matters here: Voyage's multimodal models process text and images through a **single shared backbone**, rather than separate text/image towers like CLIP. That directly avoids CLIP's known failure mode for mixed-modality search — text and image embeddings tend to cluster near other embeddings of the *same* modality, so a text query searching against image-embedded products under-performs. Since our use case is exactly mixed (text queries like "boho" searching against image-heavy garment records), this isn't a minor quality difference, it's the thing that makes the feature work at all.

Spec: 1024-dim by default (256/512/2048 also available if storage/latency ever becomes a concern), 32K token context, `input_type: "document"` for what you're indexing and `input_type: "query"` for what a user is searching with — Voyage automatically applies different prompting for each, so don't skip setting this.

## 3. DB choice: pgvector on the same Postgres, not a separate vector DB

Given Day 2 already put catalog + preferences on Postgres/Supabase with RLS, adding `pgvector` as an extension is one migration, not a new service to run, monitor, and keep in sync with the primary DB. A dedicated vector DB (Pinecone, Weaviate, Qdrant) would only earn its complexity at a scale well beyond a 15-30 store catalog — hundreds to low thousands of products is comfortably inside what `pgvector` with an HNSW index handles well. Revisit only if catalog size or query volume grows by an order of magnitude.

```sql
create extension if not exists vector;

create table product_embeddings (
  product_id text primary key references products(id) on delete cascade,
  embedding vector(1024) not null,
  embedded_at timestamptz not null default now()
);

create index on product_embeddings using hnsw (embedding vector_cosine_ops);
```

One row per product, one vector per row — see section 4 for why one combined vector beats separate text/image vectors here.

## 4. What actually gets embedded — one vector per product, not per field

Embed **title + description + tags + primary image together, in a single `multimodal_embed` call**, as one interleaved input — not a separate text embedding and a separate image embedding per product. This is exactly what "single shared backbone" buys you: one vector that represents the whole product, so a query like "boho" can match on the image's visual style even if the word "boho" never appears in the title, and a query like "the blue one" can match on text even if color isn't visually obvious in the photo. Splitting into two vectors would mean deciding at query time which one to search, which defeats the point.

## 5. When embeddings get generated — ingestion time, not query time

This slots directly into the scheduled ingestion flow from `flow.md` section 2: after the Day 4 background-removal/enhance step produces a clean product image, embed `{title, description, tags, processedImage}` as one call and upsert into `product_embeddings`. Only re-embed products that are new or whose image/text actually changed since the last run — same "don't reprocess 3,000 unchanged records daily" discipline as the image-prep step.

Query-time embedding only happens for the user's *query* (a short text string, or an uploaded inspo photo) — a single cheap call per search, not a re-embed of the catalog.

## 6. Agent vs direct — same framework as try-on, applied here

| Trigger | Ambiguity to resolve? | Route |
|---|---|---|
| Tap "more like this" on a product card | None — exact product_id known | Direct: `GET /similar/:productId` → pgvector KNN, no agent |
| Chat: "something boho for a festival" | Yes — this is exactly what structured filters can't parse, and what the agent needs to recognize *as* a vector-search case rather than trying to force it into `category`/`color` | Agent calls a new `vector_search_products(query)` tool, gets candidates, returns via the same `respond_to_user` pattern as `discovery-turn.ts` |
| User uploads an inspo photo | Some — but mechanically it's still "embed this image, do KNN," no NL parsing needed | Direct: `POST /visual-search` with the image, no agent required unless the user also typed something ambiguous alongside it |

The important addition to `discovery-turn.ts`'s system prompt: tell the model explicitly that vibe/style descriptions with no clean category/color match should route to `vector_search_products`, not get forced into `search_catalog` with an invented category. Otherwise the model will guess a category that doesn't exist in your taxonomy rather than falling back to the tool actually built for this case.

---

## Implementation

`embed-product.ts` — batch step, extends ingestion. `vector-search.ts` — the query function both the direct route and the agent tool call into (same one-function-two-callers pattern as `catalog-query.ts`).


import { VoyageAIClient } from "voyageai";
import type { Product } from "./types.js";

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });

export interface ProductEmbedding {
  productId: string;
  embedding: number[];
  embeddedAt: string;
}

// One interleaved text+image input per product, not separate text/image
// embeddings — this is what makes a query like "boho" match on visual style
// even when the word never appears in the title. See vector-search.md §4.
export async function embedProduct(product: Product): Promise<ProductEmbedding> {
  const primaryImage = product.images[0];
  if (!primaryImage) {
    throw new Error(`Product ${product.id} has no image to embed`);
  }

  const textPart = [product.title, product.description, ...product.tags].join(". ");

  const result = await voyage.multimodalEmbed({
    inputs: [{ content: [{ type: "text", text: textPart }, { type: "image_url", imageUrl: primaryImage }] }],
    model: "voyage-multimodal-3.5",
    inputType: "document", // we're indexing catalog items, not searching with them
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error(`Voyage returned no embedding for product ${product.id}`);
  }

  return { productId: product.id, embedding, embeddedAt: new Date().toISOString() };
}

// Embeds only products missing a row in product_embeddings, or whose
// primary image/text changed since the last embed — same "don't reprocess
// what hasn't changed" discipline as the Day 4 image-prep step.
export async function embedNewOrChangedProducts(
  products: Product[],
  alreadyEmbeddedIds: Set<string>
): Promise<ProductEmbedding[]> {
  const toEmbed = products.filter((p) => !alreadyEmbeddedIds.has(p.id));
  const results: ProductEmbedding[] = [];

  // Sequential on purpose for a first pass — Voyage's batch inference API
  // (docs.voyageai.com/docs/batch-inference) is the right upgrade once this
  // is processing hundreds of products per run and latency matters.
  for (const product of toEmbed) {
    try {
      results.push(await embedProduct(product));
    } catch (err) {
      console.error(`Failed to embed ${product.id}:`, err);
    }
  }

  return results;
}


import { Pool } from "pg";
import { VoyageAIClient } from "voyageai";

const voyage = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export interface SimilarProduct {
  productId: string;
  distance: number; // cosine distance, lower = more similar
}

async function embedQuery(input: { text?: string; imageUrl?: string }): Promise<number[]> {
  const content: Array<{ type: "text"; text: string } | { type: "image_url"; imageUrl: string }> = [];
  if (input.text) content.push({ type: "text", text: input.text });
  if (input.imageUrl) content.push({ type: "image_url", imageUrl: input.imageUrl });

  if (content.length === 0) {
    throw new Error("embedQuery requires at least one of text or imageUrl");
  }

  const result = await voyage.multimodalEmbed({
    inputs: [{ content }],
    model: "voyage-multimodal-3.5",
    inputType: "query", // different prompt prefix than "document" — see vector-search.md §2
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding) throw new Error("Voyage returned no embedding for query");
  return embedding;
}

// The direct route: "more like this" tap on a known product. No embedding
// call needed — reuse the product's own stored vector as the query vector.
export async function findSimilarToProduct(
  productId: string,
  limit = 12
): Promise<SimilarProduct[]> {
  const { rows } = await pool.query(
    `select b.product_id, a.embedding <=> b.embedding as distance
     from product_embeddings a, product_embeddings b
     where a.product_id = $1 and b.product_id != $1
     order by distance asc
     limit $2`,
    [productId, limit]
  );
  return rows.map((r) => ({ productId: r.product_id, distance: r.distance }));
}

// The agent-tool route: free-text style/vibe query, or an uploaded inspo
// photo, or both together. This is what discovery-turn.ts's
// vector_search_products tool calls once the model decides a query doesn't
// fit the structured category/color filter.
export async function vectorSearchProducts(
  query: { text?: string; imageUrl?: string },
  limit = 12
): Promise<SimilarProduct[]> {
  const queryEmbedding = await embedQuery(query);
  const { rows } = await pool.query(
    `select product_id, embedding <=> $1 as distance
     from product_embeddings
     order by distance asc
     limit $2`,
    [`[${queryEmbedding.join(",")}]`, limit]
  );
  return rows.map((r) => ({ productId: r.product_id, distance: r.distance }));
}