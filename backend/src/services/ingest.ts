import "dotenv/config";
import { db, shops, products } from "../db/index.js";
import { eq } from "drizzle-orm";

// ============================================================================
// TypeScript types matching Shopify's public JSON API
// ============================================================================

interface ShopifyRawImage {
  src: string;
}

interface ShopifyRawVariant {
  id: number;
  title: string;
  price: string;
  available: boolean;
  option1?: string | null;
  option2?: string | null;
    option3?: string | null;
    compare_at_price?: string | null;
    inventory_quantity?: number | null;
    barcode?: string | null;
    requires_shipping?: boolean | null;
    taxable?: boolean | null;
    weight?: string | number | null;
    weight_unit?: string | null;
}

interface ShopifyRawProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  handle: string;
    vendor?: string;
    status?: string;
  images: ShopifyRawImage[];
  variants: ShopifyRawVariant[];
  options: { name: string; position: number }[];
}

interface ShopifyProductsResponse {
  products: ShopifyRawProduct[];
}

// ============================================================================
// Constants
// ============================================================================

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGE_SIZE = 250;
const MAX_PAGES = 20;
const RETRY_DELAYS_MS = [500, 1500, 4000];

// ============================================================================
// Category detection
// ============================================================================

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

// ============================================================================
// Helper functions
// ============================================================================

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function guessCategory(productType: string, tags: string[]): string | undefined {
  const haystack = [productType, ...tags].join(" ").toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => haystack.includes(kw))) return category;
  }
  return productType ? productType.toLowerCase() : undefined;
}

function extractColorSize(
  raw: ShopifyRawProduct,
  variant: ShopifyRawVariant
): { color?: string; size?: string } {
  const result: { color?: string; size?: string } = {};
  raw.options.forEach((opt, idx) => {
    const value = idx === 0 ? variant.option1 : idx === 1 ? variant.option2 : undefined;
    if (!value) return;
    const name = opt.name.toLowerCase();
    if (name.includes("color") || name.includes("colour")) result.color = value;
    else if (name.includes("size")) result.size = value;
  });
  return result;
}


function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionValues(raw: ShopifyRawProduct, optionIndex: number): string[] {
  const values = new Set<string>();
  for (const variant of raw.variants) {
    const value = optionIndex === 0 ? variant.option1 : optionIndex === 1 ? variant.option2 : variant.option3;
    if (value) values.add(value);
  }
  return Array.from(values);
}

function inferStatus(raw: ShopifyRawProduct, variants: Array<{ available: boolean }>): string {
  if (raw.status) return raw.status.toLowerCase();
  return variants.some((variant) => variant.available) ? "active" : "unavailable";
}

function inferProductFlags(variants: Array<{ compareAtPrice?: number | null; price: number; inventoryQuantity?: number | null; requiresShipping?: boolean | null; taxable?: boolean | null }>) {
  const compareAtPrices = variants.map((variant) => variant.compareAtPrice).filter((value): value is number => typeof value === "number" && !Number.isNaN(value));
  const prices = variants.map((variant) => variant.price).filter((value) => !Number.isNaN(value));
  const inventories = variants.map((variant) => variant.inventoryQuantity).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const requiresShipping = variants.some((variant) => variant.requiresShipping === true);
  const taxable = variants.some((variant) => variant.taxable === true);

  return {
    minPrice: prices.length ? String(Math.min(...prices)) : "0",
    maxPrice: prices.length ? String(Math.max(...prices)) : "0",
    compareAtPriceMin: compareAtPrices.length ? String(Math.min(...compareAtPrices)) : null,
    compareAtPriceMax: compareAtPrices.length ? String(Math.max(...compareAtPrices)) : null,
    totalInventory: inventories.length ? inventories.reduce((sum, value) => sum + value, 0) : null,
    requiresShipping: requiresShipping ? true : null,
    taxable: taxable ? true : null,
    onSale: variants.some((variant) => variant.compareAtPrice != null && variant.compareAtPrice > variant.price),
  };
}

// ============================================================================
// Fetch functions
// ============================================================================

async function fetchPage(baseUrl: string, page: number): Promise<ShopifyRawProduct[]> {
  const url = `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });

      if (res.status === 429) {
        const waitMs = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!;
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      if (!res.ok) {
        throw new Error(`${baseUrl} page ${page} returned ${res.status}`);
      }

      const data = (await res.json()) as ShopifyProductsResponse;
      return data.products ?? [];
    } catch (err) {
      lastError = err;
      const waitMs = RETRY_DELAYS_MS[attempt];
      if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(
    `Failed to fetch ${baseUrl} page ${page} after ${RETRY_DELAYS_MS.length + 1} attempts: ${lastError}`
  );
}

async function fetchAllProducts(shopId: string, baseUrl: string): Promise<ShopifyRawProduct[]> {
  const all: ShopifyRawProduct[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const rawProducts = await fetchPage(baseUrl, page);
    if (rawProducts.length === 0) break;

    all.push(...rawProducts);

    if (rawProducts.length < PAGE_SIZE) break;
  }

  return all;
}

// ============================================================================
// Normalization
// ============================================================================

function normalizeProduct(
  shopId: string,
  baseUrl: string,
  raw: ShopifyRawProduct
) {
  const variants = raw.variants.map((v) => {
    const { color, size } = extractColorSize(raw, v);
    const compareAtPrice = v.compare_at_price ? parseFloat(v.compare_at_price) : null;
    const stockQuantity = v.inventory_quantity ?? null;
    const price = parseFloat(v.price);
    return {
      id: `${shopId}:${v.id}`,
      shopVariantId: String(v.id),
      title: v.title,
      price,
      compareAtPrice,
      available: v.available,
      availableForSale: v.available,
      stockQuantity,
      color,
      size,
      barcode: v.barcode ?? null,
      requiresShipping: v.requires_shipping ?? null,
      taxable: v.taxable ?? null,
      weight: toNumber(v.weight),
      weightUnit: v.weight_unit ?? null,
      image: raw.images[0]?.src ?? null,
    };
  });

  const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(p));
  const compareAtPrices = variants.map((v) => v.compareAtPrice).filter((p): p is number => typeof p === "number" && !Number.isNaN(p));
  const totalInventory = variants.map((v) => v.stockQuantity).filter((p): p is number => typeof p === "number" && Number.isFinite(p)).reduce((sum, p) => sum + p, 0);
  const options = raw.options.map((option, index) => ({
    name: option.name,
    values: normalizeOptionValues(raw, index),
  }));
  const status = inferStatus(raw, variants);
  const onSale = variants.some((variant) => variant.compareAtPrice != null && variant.compareAtPrice > variant.price);

  return {
    id: `${shopId}:${raw.id}`,
    shopId,
    shop: shopId, // Reference to shops table
    handle: raw.handle,
    title: raw.title,
    description: stripHtml(raw.body_html).slice(0, 500),
    category: guessCategory(raw.product_type, raw.tags),
    vendor: raw.vendor ?? null,
    productType: raw.product_type ?? null,
    status,
    images: raw.images.map((img) => img.src),
    variants,
    options,
    collections: [],
    seo: null,
    minPrice: prices.length ? String(Math.min(...prices)) : "0",
    maxPrice: prices.length ? String(Math.max(...prices)) : "0",
    compareAtPriceMin: compareAtPrices.length ? String(Math.min(...compareAtPrices)) : null,
    compareAtPriceMax: compareAtPrices.length ? String(Math.max(...compareAtPrices)) : null,
    onSale,
    totalInventory: Number.isFinite(totalInventory) ? totalInventory : null,
    requiresShipping: variants.some((variant) => variant.requiresShipping === true) ? true : null,
    taxable: variants.some((variant) => variant.taxable === true) ? true : null,
    tags: raw.tags,
    url: `${baseUrl}/products/${raw.handle}`,
    fetchedAt: new Date(),
  };
}

// Main ingest function
// ============================================================================

async function ingestShop(shopId: string, domain: string, baseUrl: string) {
  console.log(`\nðŸ“¦ Ingesting ${shopId} from ${domain}...`);
  
  // Upsert shop
  await db.insert(shops).values({
    shopId,
    name: shopId.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    domain,
    baseUrl,
    active: true,
    lastFetchedAt: new Date(),
  }).onConflictDoUpdate({
    target: shops.shopId,
    set: {
      lastFetchedAt: new Date(),
      active: true,
    },
  });

  // Fetch products
  const rawProducts = await fetchAllProducts(shopId, baseUrl);
  console.log(`   Found ${rawProducts.length} raw products`);

  // Normalize and upsert
  let inserted = 0;
  for (const raw of rawProducts) {
    const product = normalizeProduct(shopId, baseUrl, raw);
    
    await db.insert(products).values(product).onConflictDoUpdate({
      target: products.id,
        set: {
          ...product as any,
          updatedAt: new Date(),
        },
    });
    inserted++;
    
    if (inserted % 50 === 0) {
      console.log(`   Processed ${inserted}/${rawProducts.length} products`);
    }
  }

  console.log(`   âœ… Ingested ${inserted} products`);
  return inserted;
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main() {
  console.log("ðŸš€ Starting catalog ingestion...\n");

  const shopConfigs = [
    { shopId: "outdoor-voices", domain: "outdoorvoices.com", baseUrl: "https://www.outdoorvoices.com" },
    { shopId: "apc-us", domain: "apc-us.com", baseUrl: "https://www.apc-us.com" },
  ];

  let totalProducts = 0;
  for (const config of shopConfigs) {
    try {
      const count = await ingestShop(config.shopId, config.domain, config.baseUrl);
      totalProducts += count;
    } catch (error) {
      console.error(`âŒ Failed to ingest ${config.shopId}:`, error);
    }
  }

  console.log(`\nâœ… Ingestion complete! Total: ${totalProducts} products`);
}

main().catch((err) => {
  console.error("âŒ Ingestion failed:", err);
  process.exit(1);
});


