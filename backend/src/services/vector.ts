/**
 * Vector Search Service
 * 
 * Provides multimodal embedding and similarity search capabilities using Voyage AI.
 * Supports both text and image embeddings for visual search functionality.
 * 
 * Key features:
 * - Combined text+image embeddings for products (voyage-4 supports image URLs natively)
 * - Query embeddings with text, image, or both
 * - Cosine similarity-based product search
 */

import { VoyageAIClient } from "voyageai";
import postgres from "postgres";
import { db, products, productEmbeddings } from "../db/index.js";
import { eq, sql, isNull } from "drizzle-orm";

// ============================================================================
// Configuration
// ============================================================================

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!VOYAGE_API_KEY) {
  console.warn("⚠️ VOYAGE_API_KEY not set - vector search will not be available");
}

if (!DATABASE_URL) {
  console.warn("⚠️ DATABASE_URL not set - vector search will not be available");
}

// Initialize Voyage AI client
const voyage = VOYAGE_API_KEY 
  ? new VoyageAIClient({ apiKey: VOYAGE_API_KEY })
  : null;

// Initialize DB connection for raw SQL queries (for vector operations)
const sqlDb = DATABASE_URL 
  ? postgres(DATABASE_URL, { ssl: "require", max: 5 })
  : null;

// ============================================================================
// Types
// ============================================================================

export interface ProductEmbedding {
  productId: string;
  embedding: number[];
  embeddedAt: string;
}

export interface SimilarProduct {
  productId: string;
  distance: number; // cosine distance (lower = more similar)
}

export interface SearchResult extends SimilarProduct {
  title: string;
  images: string[];
  minPrice: number | null;
  maxPrice: number | null;
  category: string | null;
  url: string | null;
}

export interface EmbedQueryInput {
  text?: string;
  imageUrl?: string;
}

// ============================================================================
// Embedding Functions
// ============================================================================

/**
 * Create multimodal text content for a product
 * Combines title, description, category, and tags into a cohesive text representation
 */
function createProductTextContent(product: {
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
}): string {
  const parts: string[] = [product.title];
  
  if (product.category) {
    parts.push(`Category: ${product.category}`);
  }
  
  if (product.description) {
    parts.push(product.description);
  }
  
  if (product.tags && product.tags.length > 0) {
    parts.push(`Tags: ${product.tags.join(", ")}`);
  }
  
  return parts.join(". ");
}

/**
 * Embed a single product with image-only (for pure visual search)
 * Uses voyage-4 with multimodalEmbed API which supports image URLs natively (1024 dimensions)
 * 
 * This is the key to visual search: products are embedded with their images only,
 * so users can search by uploading a photo and finding visually similar items.
 * 
 * Use this when you want pure image similarity, not text+image combined.
 */
export async function embedProductImageOnly(
  product: {
    id: string;
    images?: string[];
  }
): Promise<ProductEmbedding> {
  if (!voyage) {
    throw new Error("Voyage AI client not initialized - VOYAGE_API_KEY not set");
  }

  const primaryImage = product.images?.[0];
  if (!primaryImage) {
    throw new Error(`Product ${product.id} has no image to embed`);
  }

  // Image-only embedding using voyage-4 multimodal API
  const result = await voyage.multimodalEmbed({
    inputs: [{ content: [{ type: "image_url", imageUrl: primaryImage }] }],
    model: "voyage-4",
    inputType: "document",
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error(`Voyage returned no embedding for product ${product.id}`);
  }

  return {
    productId: product.id,
    embedding,
    embeddedAt: new Date().toISOString(),
  };
}

/**
 * Embed a single product with both text and image (multimodal)
 * Uses voyage-4 with multimodalEmbed API which supports image URLs (1024 dimensions)
 * 
 * This creates a vector that captures both semantic meaning (from text) and visual
 * appearance (from image), enabling both text queries and image-based search.
 */
export async function embedProductMultimodal(
  product: {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    tags?: string[];
    images?: string[];
  }
): Promise<ProductEmbedding> {
  if (!voyage) {
    throw new Error("Voyage AI client not initialized - VOYAGE_API_KEY not set");
  }

  const primaryImage = product.images?.[0];
  if (!primaryImage) {
    throw new Error(`Product ${product.id} has no image to embed`);
  }

  // Create text content
  const textContent = createProductTextContent(product);

  // voyage-4 multimodal API with both text and image
  const result = await voyage.multimodalEmbed({
    inputs: [{ 
      content: [
        { type: "text", text: textContent },
        { type: "image_url", imageUrl: primaryImage }
      ]
    }],
    model: "voyage-4",
    inputType: "document",
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error(`Voyage returned no embedding for product ${product.id}`);
  }

  return {
    productId: product.id,
    embedding,
    embeddedAt: new Date().toISOString(),
  };
}

// Backwards compatibility alias
export { embedProductImageOnly as embedProduct };

/**
 * Embed a query for similarity search
 * Supports text-only, image-only, or combined text+image queries
 */
export async function embedQuery(input: EmbedQueryInput): Promise<number[]> {
  if (!voyage) {
    throw new Error("Voyage AI client not initialized - VOYAGE_API_KEY not set");
  }

  if (!input.text && !input.imageUrl) {
    throw new Error("embedQuery requires at least one of text or imageUrl");
  }

  const content: Array<{ type: "text"; text: string } | { type: "image_url"; imageUrl: string }> = [];
  
  if (input.text) {
    content.push({ type: "text", text: input.text });
  }
  if (input.imageUrl) {
    content.push({ type: "image_url", imageUrl: input.imageUrl });
  }

  // Use multimodalEmbed API for all query types
  const result = await voyage.multimodalEmbed({
    inputs: [{ content }],
    model: "voyage-4",
    inputType: "query", // different prompt prefix than "document"
  });

  const embedding = result.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Voyage returned no embedding for query");
  }

  return embedding;
}

// ============================================================================
// Vector Search Functions
// ============================================================================

/**
 * Find products similar to a given product using stored embeddings
 * Uses the product's own embedding as the query vector
 */
export async function findSimilarToProduct(
  productId: string,
  limit = 12
): Promise<SimilarProduct[]> {
  if (!sqlDb) {
    throw new Error("Database not initialized - DATABASE_URL not set");
  }

  // Find similar products using vector cosine distance
  // Using raw SQL for pgvector operations
  const result = await sqlDb`
    SELECT b.product_id, (a.embedding <=> b.embedding) as distance
    FROM product_embeddings a, product_embeddings b
    WHERE a.product_id = ${productId}
      AND b.product_id != ${productId}
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return (result as any[]).map((row) => ({
    productId: row.product_id,
    distance: Number(row.distance),
  }));
}

/**
 * Search for products similar to a query (text, image, or both)
 * Embeds the query and searches against all product embeddings
 */
export async function vectorSearchProducts(
  query: EmbedQueryInput,
  limit = 12
): Promise<SearchResult[]> {
  if (!sqlDb) {
    throw new Error("Database not initialized - DATABASE_URL not set");
  }

  // Get query embedding
  const queryEmbedding = await embedQuery(query);
  const embeddingStr = `[${queryEmbedding.join(",")}]`;

  // Search using pgvector cosine distance
  const result = await sqlDb`
    SELECT 
      pe.product_id,
      (pe.embedding <=> ${sqlDb.unsafe(embeddingStr)}) as distance,
      p.title,
      p.images,
      p.min_price,
      p.max_price,
      p.category,
      p.url
    FROM product_embeddings pe
    JOIN products p ON pe.product_id = p.id
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return result.map((row: any) => ({
    productId: row.product_id,
    distance: Number(row.distance),
    title: row.title || "",
    images: row.images || [],
    minPrice: row.min_price ? parseFloat(String(row.min_price)) : null,
    maxPrice: row.max_price ? parseFloat(String(row.max_price)) : null,
    category: row.category,
    url: row.url,
  }));
}

/**
 * Vector search with confidence scoring
 * Buckets results into confidence levels based on cosine distance
 */
export type MatchConfidence = "exact" | "close" | "similar" | "low";

export interface SearchResultWithConfidence extends SearchResult {
  confidence: MatchConfidence;
}

/**
 * Confidence thresholds based on cosine distance
 * These are calibrated empirically - lower distance = higher confidence
 */
const CONFIDENCE_THRESHOLDS = {
  exact: 0.15,
  close: 0.35,
  similar: 0.55,
};

export function bucketConfidence(distance: number): MatchConfidence {
  if (distance < CONFIDENCE_THRESHOLDS.exact) return "exact";
  if (distance < CONFIDENCE_THRESHOLDS.close) return "close";
  if (distance < CONFIDENCE_THRESHOLDS.similar) return "similar";
  return "low";
}

/**
 * Vector search with confidence scores
 * Returns products bucketed by match confidence
 */
export async function vectorSearchWithConfidence(
  query: EmbedQueryInput,
  limit = 12
): Promise<SearchResultWithConfidence[]> {
  const results = await vectorSearchProducts(query, limit);
  
  return results.map((result) => ({
    ...result,
    confidence: bucketConfidence(result.distance),
  }));
}

// ============================================================================
// Embedding Management
// ============================================================================

/**
 * Store a product embedding in the database
 */
export async function storeEmbedding(embedding: ProductEmbedding): Promise<void> {
  if (!sqlDb) {
    throw new Error("Database not initialized - DATABASE_URL not set");
  }

  await sqlDb`
    INSERT INTO product_embeddings (product_id, embedding, embedded_at)
    VALUES (
      ${embedding.productId}, 
      ${JSON.stringify(embedding.embedding)}, 
      ${new Date(embedding.embeddedAt)}
    )
    ON CONFLICT (product_id) 
    DO UPDATE SET 
      embedding = ${JSON.stringify(embedding.embedding)},
      embedded_at = ${new Date(embedding.embeddedAt)}
  `;
}

/**
 * Get all products that need embedding (missing embeddings)
 */
export async function getProductsWithoutEmbeddings(limit = 500): Promise<any[]> {
  const result = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      category: products.category,
      tags: products.tags,
      images: products.images,
    })
    .from(products)
    .leftJoin(
      productEmbeddings,
      eq(products.id, productEmbeddings.productId)
    )
    .where(isNull(productEmbeddings.productId))
    .limit(limit);
  
  return result;
}

/**
 * Get all products (for re-embedding all)
 */
export async function getAllProductsForEmbedding(): Promise<any[]> {
  const result = await db
    .select({
      id: products.id,
      title: products.title,
      description: products.description,
      category: products.category,
      tags: products.tags,
      images: products.images,
    })
    .from(products);
  
  return result;
}

/**
 * Get count of embedded products
 */
export async function getEmbeddingCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productEmbeddings);
  
  return result[0]?.count ?? 0;
}

/**
 * Get total product count
 */
export async function getProductCount(): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products);
  
  return result[0]?.count ?? 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if vector search is available
 */
export function isVectorSearchAvailable(): boolean {
  return !!voyage && !!sqlDb;
}

/**
 * Close database connections
 */
export async function closeConnections(): Promise<void> {
  if (sqlDb) {
    await sqlDb.end();
  }
}
