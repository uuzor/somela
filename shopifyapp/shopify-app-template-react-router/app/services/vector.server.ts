/**
 * OpenCommerceLens Vector Service
 *
 * Writes product data and multimodal embeddings directly to the shared
 * PostgreSQL database (the same one your backend reads from for search).
 *
 * Embedding model: voyage-multimodal-3.5
 *   - Interleaved text + image in a single call
 *   - 1024 dimensions
 *   - REST endpoint: POST https://api.voyageai.com/v1/multimodalembeddings
 *   - Correct input format: inputs: [{ content: [{type,text},{type,image_url,image_url}] }]
 *
 * Required env vars:
 *   DATABASE_URL    — postgres connection string (with SSL)
 *   VOYAGE_API_KEY  — Voyage AI API key
 */

import postgres from "postgres";

// ─── Connections ──────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!DATABASE_URL) {
  console.warn("[OpenCommerceLens] DATABASE_URL not set; vector writes disabled");
}
if (!VOYAGE_API_KEY) {
  console.warn("[OpenCommerceLens] VOYAGE_API_KEY not set; embeddings disabled");
}

let _sql: ReturnType<typeof postgres> | null = null;

export function getSharedSql() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!_sql) {
    _sql = postgres(DATABASE_URL, { ssl: "require", max: 5 });
  }
  return _sql;
}

const getSql = getSharedSql;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  shopVariantId: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  availableForSale: boolean;
  stockQuantity: number | null;
  color?: string;
  size?: string;
  sku: string | null;
  barcode: string | null;
  weight: number | null;
  weightUnit: string | null;
  image: string | null;
  // Retained for richer Shopify consumers while stockQuantity remains the
  // canonical OpenCommerceLens field.
  inventoryQuantity: number | null;
  requiresShipping: boolean;
  taxable: boolean;
  selectedOptions: { name: string; value: string }[];
}

export interface ProductOption {
  name: string;    // e.g. "Color", "Size"
  values: string[]; // e.g. ["Black", "White", "Red"]
}

export interface ProductSeo {
  title: string | null;
  description: string | null;
}

export interface ProductToIndex {
  shopifyId: string;            // Shopify GID: gid://shopify/Product/123
  shop: string;                 // mystore.myshopify.com
  title: string;
  handle: string;
  description: string | null;
  category: string | null;
  vendor: string | null;
  productType: string | null;
  status: string | null;        // ACTIVE, DRAFT, ARCHIVED
  tags: string[];
  images: string[];             // CDN URLs — first image used for embedding
  variants: ProductVariant[];
  options: ProductOption[];
  collections: string[];
  seo: ProductSeo | null;
  totalInventory: number | null;
}

export interface IndexResult {
  success: boolean;
  productDbId?: string;
  message?: string;
  excluded?: boolean;
}

// ─── Product ID ───────────────────────────────────────────────────────────────

/**
 * Stable ID written to the shared DB.
 * Format: {shopId}:{numericId}, matching the backend ingest contract.
 */
export function productDbId(shop: string, shopifyGid: string): string {
  const numericId = shopifyGid.split("/").pop() ?? shopifyGid;
  return `${canonicalShopId(shop)}:${numericId}`;
}

export function canonicalShopId(shop: string): string {
  return shop
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\.myshopify\.com\/?$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function variantDbId(productId: string, shopifyVariantId: string): string {
  const numericId = shopifyVariantId.split("/").pop() ?? shopifyVariantId;
  return `${productId}:${numericId}`;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  yoga: ["yoga", "legging", "sports bra", "workout"],
  outerwear: ["jacket", "coat", "puffer", "parka", "vest"],
  denim: ["denim", "jean"],
  dress: ["dress", "gown", "romper", "jumpsuit"],
  top: ["tee", "t-shirt", "shirt", "top", "sweater", "hoodie", "sweatshirt", "blouse"],
  bottom: ["pant", "short", "skirt", "trouser", "legging", "skort"],
  tailoring: ["suit", "blazer", "tailor"],
  swim: ["swim", "bikini", "swimsuit", "boardshort"],
  accessory: ["cap", "hat", "bag", "sock", "belt"],
};

export function inferProductCategory(
  productType: string | null | undefined,
  tags: string[]
): string | null {
  const haystack = [productType ?? "", ...tags].join(" ").toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => haystack.includes(keyword))) return category;
  }
  return productType?.trim().toLowerCase() || null;
}

// ─── Text content builder ─────────────────────────────────────────────────────

/**
 * Build a rich text representation of the product for multimodal embedding.
 * Includes colors, sizes, availability, price/discount signal, and description
 * so semantic searches like "red trench coat size M on sale" work correctly.
 */
function buildProductText(product: ProductToIndex): string {
  const parts: string[] = [`Title: ${product.title}`];

  if (product.vendor) parts.push(`Brand: ${product.vendor}`);
  if (product.category || product.productType) {
    parts.push(`Category: ${product.category ?? product.productType}`);
  }

  // Structured options (Color, Size, Material, etc.)
  for (const opt of product.options) {
    if (opt.values.length > 0) {
      parts.push(`${opt.name}: ${opt.values.join(", ")}`);
    }
  }

  // Collections the product belongs to
  if (product.collections.length > 0) {
    parts.push(`Collections: ${product.collections.join(", ")}`);
  }

  if (product.description) {
    const plain = product.description
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 400);
    if (plain) parts.push(plain);
  }

  if (product.tags.length > 0) {
    parts.push(`Tags: ${product.tags.slice(0, 20).join(", ")}`);
  }

  // Price & discount signal
  const prices = product.variants
    .map((v) => v.price)
    .filter((p) => !isNaN(p));
  const comparePrices = product.variants
    .map((v) => v.compareAtPrice ?? NaN)
    .filter((p) => !isNaN(p));

  if (prices.length > 0) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    parts.push(min === max ? `Price: $${min}` : `Price: $${min}–$${max}`);
  }
  if (comparePrices.length > 0) {
    const maxCompare = Math.max(...comparePrices);
    parts.push(`Original price: $${maxCompare} (on sale)`);
  }

  // Availability
  const inStock = product.variants.some((v) => v.availableForSale);
  parts.push(inStock ? "In stock" : "Out of stock");

  // Shipping / tax
  const ships = product.variants.some((v) => v.requiresShipping);
  if (ships) parts.push("Requires shipping");

  return parts.join(". ");
}

// ─── Voyage AI multimodal API ─────────────────────────────────────────────────

type VoyageContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: string };

/**
 * Call voyage-multimodal-3.5 with interleaved text + image.
 * Returns a 1024-dim embedding vector.
 *
 * IMPORTANT format quirks (live-tested 2026-07-28):
 *  - Each input must be { content: [...] }, NOT a raw array
 *  - Image segments: { type: "image_url", image_url: "..." } — field name matches type name
 */
async function getMultimodalEmbedding(
  textContent: string,
  imageUrl?: string
): Promise<number[]> {
  if (!VOYAGE_API_KEY) throw new Error("VOYAGE_API_KEY is not set");

  const input: VoyageContentItem[] = [{ type: "text", text: textContent }];
  if (imageUrl) input.push({ type: "image_url", image_url: imageUrl });

  const res = await fetch("https://api.voyageai.com/v1/multimodalembeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ content: input }],
      model: "voyage-multimodal-3.5",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Voyage AI error ${res.status}: ${err}`);
  }

  const data = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };

  const embedding = data.data?.[0]?.embedding;
  if (!embedding || embedding.length === 0) {
    throw new Error("Voyage AI returned no embedding");
  }

  return embedding;
}

// ─── Schema bootstrap ─────────────────────────────────────────────────────────

/**
 * Validates the shared catalogue schema once per process.
 * Migrations remain owned by the backend, not this ingestion worker.
 */
let schemaValidationPromise: Promise<void> | null = null;

export async function ensureSchema(): Promise<void> {
  if (schemaValidationPromise) return schemaValidationPromise;

  schemaValidationPromise = validateSchema();
  try {
    await schemaValidationPromise;
  } catch (error) {
    schemaValidationPromise = null;
    throw error;
  }
}

async function validateSchema(): Promise<void> {
  const sql = getSql();
  const requiredColumns: Record<string, string[]> = {
    shops: [
      "shop_id", "name", "domain", "base_url", "active", "created_at", "updated_at",
    ],
    products: [
      "id", "shop_id", "shop", "title", "description", "category",
      "tags", "images", "processed_images", "min_price", "max_price", "url",
      "vendor", "status", "on_sale", "compare_at_price_min",
      "compare_at_price_max", "total_inventory", "requires_shipping",
      "is_taxable", "variants", "options", "collections", "seo", "fetched_at",
      "created_at", "updated_at",
    ],
    product_variants: [
      "id", "product_id", "shop_variant_id", "title", "color", "size",
      "price", "stock_quantity", "available", "image", "created_at", "updated_at",
    ],
    product_embeddings: ["product_id", "embedding", "embedded_at"],
  };
  const rows = await sql<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('shops', 'products', 'product_variants', 'product_embeddings')
  `;
  const present = new Set(
    rows.map((row) => `${row.table_name}.${row.column_name}`)
  );
  const missing = Object.entries(requiredColumns).flatMap(([table, columns]) =>
    columns
      .filter((column) => !present.has(`${table}.${column}`))
      .map((column) => `${table}.${column}`)
  );
  if (missing.length > 0) {
    throw new Error(`Shared catalogue schema is missing: ${missing.join(", ")}`);
  }

  console.info("[OCL_INDEX] shared_schema_validated", {
    tables: Object.keys(requiredColumns),
    checkedColumns: Object.values(requiredColumns).flat().length,
  });
}

// ─── Database writes ──────────────────────────────────────────────────────────

async function upsertProduct(product: ProductToIndex): Promise<string> {
  const sql = getSql();
  const id = productDbId(product.shop, product.shopifyId);
  const shopId = canonicalShopId(product.shop);
  const url = `https://${product.shop}/products/${product.handle}`;
  const now = new Date();
  const shopName = shopId.replace(/[-_]+/g, " ");
  const catalogStatus = (product.status || "active").toLowerCase();

  await sql`
    INSERT INTO shops (shop_id, name, domain, base_url, active, created_at, updated_at)
    VALUES (${shopId}, ${shopName}, ${product.shop}, ${`https://${product.shop}`}, true, ${now}, ${now})
    ON CONFLICT (shop_id) DO UPDATE SET
      name = EXCLUDED.name,
      domain = EXCLUDED.domain,
      base_url = EXCLUDED.base_url,
      active = true,
      updated_at = EXCLUDED.updated_at
  `;

  // ── Price calculations ──────────────────────────────────────────────────────
  const prices = product.variants
    .map((v) => v.price)
    .filter((p) => !isNaN(p));
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  const comparePrices = product.variants
    .map((v) => v.compareAtPrice ?? NaN)
    .filter((p) => !isNaN(p));
  const minCompare = comparePrices.length > 0 ? Math.min(...comparePrices) : null;
  const maxCompare = comparePrices.length > 0 ? Math.max(...comparePrices) : null;

  // Product is on sale if any variant has a compareAtPrice higher than its sale price
  const onSale = product.variants.some((v) => {
    if (v.compareAtPrice === null) return false;
    return v.compareAtPrice > v.price;
  });

  // ── Shipping / tax flags ────────────────────────────────────────────────────
  const requiresShipping = product.variants.some((v) => v.requiresShipping);
  const isTaxable = product.variants.some((v) => v.taxable);

  // ── Write using tagged template + sql.json() for JSONB columns ────────────
  // sql.json() is required here — passing pre-stringified values with ::jsonb
  // causes the postgres library to double-encode them as JSONB string scalars.
  await sql`
    INSERT INTO products (
      id, shop_id, shop, title, description, category,
      tags, images,
      min_price, max_price, url,
      vendor, status,
      on_sale, compare_at_price_min, compare_at_price_max,
      total_inventory, requires_shipping, is_taxable,
      variants, options, collections, seo,
      fetched_at
    ) VALUES (
      ${id}, ${shopId}, ${shopId}, ${product.title}, ${product.description ?? null}, ${product.category},
      ${sql.json(product.tags)}, ${sql.json(product.images)},
      ${minPrice}, ${maxPrice}, ${url},
      ${product.vendor ?? null}, ${catalogStatus},
      ${onSale}, ${minCompare}, ${maxCompare},
      ${product.totalInventory ?? null}, ${requiresShipping}, ${isTaxable},
      ${sql.json(product.variants as any)}, ${sql.json(product.options as any)}, ${sql.json(product.collections as any)}, ${product.seo ? sql.json(product.seo as any) : null},
      ${now}
    )
    ON CONFLICT (id) DO UPDATE SET
      title                 = EXCLUDED.title,
      description           = EXCLUDED.description,
      category              = EXCLUDED.category,
      tags                  = EXCLUDED.tags,
      images                = EXCLUDED.images,
      min_price             = EXCLUDED.min_price,
      max_price             = EXCLUDED.max_price,
      url                   = EXCLUDED.url,
      shop                  = EXCLUDED.shop,
      shop_id               = EXCLUDED.shop_id,
      vendor                = EXCLUDED.vendor,
      status                = EXCLUDED.status,
      on_sale               = EXCLUDED.on_sale,
      compare_at_price_min  = EXCLUDED.compare_at_price_min,
      compare_at_price_max  = EXCLUDED.compare_at_price_max,
      total_inventory       = EXCLUDED.total_inventory,
      requires_shipping     = EXCLUDED.requires_shipping,
      is_taxable            = EXCLUDED.is_taxable,
      variants              = EXCLUDED.variants,
      options               = EXCLUDED.options,
      collections           = EXCLUDED.collections,
      seo                   = EXCLUDED.seo,
      fetched_at            = EXCLUDED.fetched_at,
      updated_at            = EXCLUDED.fetched_at
  `;

  await replaceProductVariants(id, product.variants);
  return id;
}

async function replaceProductVariants(
  productId: string,
  variants: ProductVariant[]
): Promise<void> {
  const sql = getSql();

  // The JSONB product payload and relational variant rows must describe the
  // same Shopify snapshot. Removing stale rows first also handles deleted
  // Shopify variants.
  await sql`DELETE FROM product_variants WHERE product_id = ${productId}`;

  for (const variant of variants) {
    await sql`
      INSERT INTO product_variants (
        id, product_id, shop_variant_id, title, color, size,
        price, stock_quantity, available, image, created_at, updated_at
      ) VALUES (
        ${variant.id}, ${productId}, ${variant.shopVariantId},
        ${variant.title}, ${variant.color ?? null}, ${variant.size ?? null},
        ${variant.price}, ${variant.stockQuantity}, ${variant.available},
        ${variant.image}, ${new Date()}, ${new Date()}
      )
      ON CONFLICT (id) DO UPDATE SET
        product_id = EXCLUDED.product_id,
        shop_variant_id = EXCLUDED.shop_variant_id,
        title = EXCLUDED.title,
        color = EXCLUDED.color,
        size = EXCLUDED.size,
        price = EXCLUDED.price,
        stock_quantity = EXCLUDED.stock_quantity,
        available = EXCLUDED.available,
        image = EXCLUDED.image,
        updated_at = EXCLUDED.updated_at
    `;
  }
}

async function upsertEmbedding(dbId: string, embedding: number[]): Promise<void> {
  const sql = getSql();
  const embeddingStr = `[${embedding.join(",")}]`;

  await sql.unsafe(
    `INSERT INTO product_embeddings (product_id, embedding, embedded_at)
     VALUES ($1, $2::vector, $3)
     ON CONFLICT (product_id) DO UPDATE SET
       embedding   = EXCLUDED.embedding,
       embedded_at = EXCLUDED.embedded_at`,
    [dbId, embeddingStr, new Date()]
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full pipeline for one product:
 *   1. Build rich text (title + brand + category + options + description + tags + price + availability)
 *   2. Call voyage-multimodal-3.5 with text + primary image URL → 1024-dim vector
 *   3. Upsert full product row in shared `products` table (all new columns)
 *   4. Upsert embedding in `product_embeddings`
 */
export async function indexProduct(product: ProductToIndex): Promise<IndexResult> {
  const primaryImage = product.images[0];
  const dbId = productDbId(product.shop, product.shopifyId);
  const startedAt = Date.now();

  try {
    console.info("[OCL_INDEX] product_pipeline_started", {
      productId: dbId,
      title: product.title,
      imageCount: product.images.length,
      variantCount: product.variants.length,
    });
    await ensureSchema();
    if (product.status && product.status.toUpperCase() !== "ACTIVE") {
      await removeProductFromIndex(product.shop, product.shopifyId);
      console.info("[OCL_INDEX] product_removed_from_index", {
        productId: dbId,
        status: product.status,
      });
      return {
        success: true,
        excluded: true,
        message: `Skipped Shopify ${product.status.toLowerCase()} product`,
      };
    }
    const text = buildProductText(product);
    const embeddingStartedAt = Date.now();
    console.info("[OCL_INDEX] embedding_request_started", {
      productId: dbId,
      hasImage: Boolean(primaryImage),
      textLength: text.length,
    });
    const embedding = await getMultimodalEmbedding(text, primaryImage);
    console.info("[OCL_INDEX] embedding_request_completed", {
      productId: dbId,
      dimensions: embedding.length,
      durationMs: Date.now() - embeddingStartedAt,
    });
    await upsertProduct(product);
    console.info("[OCL_INDEX] catalogue_upsert_completed", {
      productId: dbId,
      variantCount: product.variants.length,
    });
    await upsertEmbedding(dbId, embedding);
    console.info("[OCL_INDEX] embedding_upsert_completed", {
      productId: dbId,
      durationMs: Date.now() - startedAt,
    });
    return { success: true, productDbId: dbId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[OCL_INDEX] product_pipeline_failed", {
      productId: dbId,
      title: product.title,
      durationMs: Date.now() - startedAt,
      errorMessage: message,
    });
    return { success: false, message };
  }
}

/**
 * Remove a product from both tables.
 */
export async function removeProductFromIndex(
  shop: string,
  shopifyGid: string
): Promise<void> {
  const sql = getSql();
  const id = productDbId(shop, shopifyGid);
  await sql`DELETE FROM product_embeddings WHERE product_id = ${id}`;
  await sql`DELETE FROM products WHERE id = ${id}`;
}

export async function removeShopFromIndex(shop: string): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM product_embeddings
    WHERE product_id IN (SELECT id FROM products WHERE shop_id = ${shop})
  `;
  await sql`DELETE FROM products WHERE shop_id = ${shop}`;
  await sql`UPDATE shops SET active = false, updated_at = NOW() WHERE shop_id = ${shop}`;
}

export function isVectorServiceReady(): boolean {
  return !!DATABASE_URL && !!VOYAGE_API_KEY;
}
