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
}

interface ShopifyRawProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  handle: string;
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
    return {
      id: `${shopId}:${v.id}`,
      title: v.title,
      price: parseFloat(v.price),
      available: v.available,
      color,
      size,
    };
  });

  const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(p));

  return {
    id: `${shopId}:${raw.id}`,
    shopId,
    shop: shopId, // Reference to shops table
    title: raw.title,
    description: stripHtml(raw.body_html).slice(0, 500),
    category: guessCategory(raw.product_type, raw.tags),
    images: raw.images.map((img) => img.src),
    variants,
    minPrice: prices.length ? String(Math.min(...prices)) : "0",
    maxPrice: prices.length ? String(Math.max(...prices)) : "0",
    tags: raw.tags,
    url: `${baseUrl}/products/${raw.handle}`,
    fetchedAt: new Date(),
  };
}

// ============================================================================
// Main ingest function
// ============================================================================

async function ingestShop(shopId: string, domain: string, baseUrl: string) {
  console.log(`\n📦 Ingesting ${shopId} from ${domain}...`);
  
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
        title: product.title,
        description: product.description,
        category: product.category,
        images: product.images,
        variants: product.variants as any,
        minPrice: String(product.minPrice),
        maxPrice: String(product.maxPrice),
        tags: product.tags,
        url: product.url,
        fetchedAt: product.fetchedAt,
        updatedAt: new Date(),
      },
    });
    inserted++;
    
    if (inserted % 50 === 0) {
      console.log(`   Processed ${inserted}/${rawProducts.length} products`);
    }
  }

  console.log(`   ✅ Ingested ${inserted} products`);
  return inserted;
}

// ============================================================================
// CLI entry point
// ============================================================================

async function main() {
  console.log("🚀 Starting catalog ingestion...\n");

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
      console.error(`❌ Failed to ingest ${config.shopId}:`, error);
    }
  }

  console.log(`\n✅ Ingestion complete! Total: ${totalProducts} products`);
}

main().catch((err) => {
  console.error("❌ Ingestion failed:", err);
  process.exit(1);
});
