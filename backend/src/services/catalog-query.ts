/**
 * Catalog Query Service
 * 
 * Provides structured search for the product catalog using database queries.
 * Used by both the fast-path GET /catalog and the discovery agent.
 */

import { db, products, productVariants } from "../db/index.js";
import { eq, and, like, or, gte, lte, inArray, sql } from "drizzle-orm";

export interface CatalogFilters {
  query?: string;
  category?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  store?: string;
  shopId?: string;
  limit?: number;
  offset?: number;
}

// Color word matching for products without structured variant colors
const COLOR_WORDS = [
  "black", "white", "blue", "red", "green", "evergreen", "floral",
  "pink", "beige", "cream", "navy", "grey", "gray", "brown", "olive",
  "orange", "yellow", "purple", "burgundy", "camel", "tan", "rust",
];

function productMatchesColor(product: any, color: string): boolean {
  const target = color.toLowerCase();
  
  // Check structured variants
  if (product.variants) {
    const variants = Array.isArray(product.variants) ? product.variants : [];
    const hasStructuredMatch = variants.some(
      (v: any) => v.color?.toLowerCase() === target
    );
    if (hasStructuredMatch) return true;
  }
  
  // Fallback to title/tags
  const haystack = [product.title, ...(product.tags || [])].join(" ").toLowerCase();
  return haystack.includes(target);
}

export async function searchCatalog(filters: CatalogFilters): Promise<any[]> {
  const { category, color, minPrice, maxPrice, shopId, limit = 20, offset = 0 } = filters;
  
  const conditions: any[] = [];
  
  if (category) {
    conditions.push(like(products.category, `%${category}%`));
  }
  
  if (shopId) {
    conditions.push(eq(products.shopId, shopId));
  }
  
  if (minPrice !== undefined) {
    conditions.push(lte(products.minPrice, String(minPrice)));
  }
  
  if (maxPrice !== undefined) {
    conditions.push(gte(products.maxPrice, String(maxPrice)));
  }
  
  let results = await db
    .select()
    .from(products)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit)
    .offset(offset);
  
  // Filter by color if needed (requires title/tag matching)
  if (color) {
    results = results.filter(p => productMatchesColor(p, color));
  }
  
  return results;
}

export async function searchByIds(productIds: string[]): Promise<any[]> {
  if (productIds.length === 0) return [];
  
  return db
    .select()
    .from(products)
    .where(inArray(products.id, productIds));
}

export async function getProductById(productId: string): Promise<any | null> {
  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  
  return product || null;
}

export async function getVariantsForProduct(productId: string): Promise<any[]> {
  return db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));
}

export async function getCategories(): Promise<string[]> {
  const result = await db
    .selectDistinct({ category: products.category })
    .from(products)
    .where(sql`${products.category} IS NOT NULL`);
  
  return result
    .map(r => r.category)
    .filter((c): c is string => c !== null);
}

export async function getColors(): Promise<string[]> {
  return COLOR_WORDS;
}
