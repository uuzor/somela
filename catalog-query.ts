import { readFile } from "node:fs/promises";
import type { Product } from "./types.js";

export interface CatalogFilters {
  category?: string;
  color?: string;
  maxPrice?: number;
  minPrice?: number;
}

// Same gap flagged from the real sample: many single-colorway products have
// no structured variant.color. Fall back to matching the color word against
// title/tags so a query like "blue" still finds them. This is intentionally
// a small fixed vocabulary — extend it as you see real misses, don't try to
// guess every color name up front.
const COLOR_WORDS = [
  "black", "white", "blue", "red", "green", "evergreen", "floral",
  "pink", "beige", "cream", "navy", "grey", "gray", "brown", "olive",
];

function productMatchesColor(product: Product, color: string): boolean {
  const target = color.toLowerCase();
  const hasStructuredMatch = product.variants.some(
    (v) => v.color?.toLowerCase() === target
  );
  if (hasStructuredMatch) return true;

  const haystack = [product.title, ...product.tags].join(" ").toLowerCase();
  return haystack.includes(target);
}

let cachedCatalog: Product[] | null = null;

async function loadCatalog(path: string): Promise<Product[]> {
  if (cachedCatalog) return cachedCatalog;
  const raw = await readFile(path, "utf-8");
  cachedCatalog = JSON.parse(raw) as Product[];
  return cachedCatalog;
}

export async function searchCatalog(
  filters: CatalogFilters,
  catalogPath = "src/fixtures/catalog.sample.json"
): Promise<Product[]> {
  const catalog = await loadCatalog(catalogPath);

  return catalog.filter((p) => {
    if (filters.category && p.category !== filters.category) return false;
    if (filters.color && !productMatchesColor(p, filters.color)) return false;
    if (filters.minPrice !== undefined && p.maxPrice < filters.minPrice) return false;
    if (filters.maxPrice !== undefined && p.minPrice > filters.maxPrice) return false;
    return true;
  });
}