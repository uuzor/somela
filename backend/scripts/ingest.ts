import "dotenv/config";
import { db, shops, products } from "../src/db/index.js";

// ============================================================================
// Types
// ============================================================================

interface ShopifyRawImage { src: string; }
interface ShopifyRawVariant {
  id: number; title: string; price: string; available: boolean;
  option1?: string | null; option2?: string | null;
}
interface ShopifyRawProduct {
  id: number; title: string; body_html: string; product_type: string;
  tags: string[]; handle: string; images: ShopifyRawImage[];
  variants: ShopifyRawVariant[]; options: { name: string; position: number }[];
}
interface ShopifyProductsResponse { products: ShopifyRawProduct[]; }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const PAGE_SIZE = 250;
const MAX_PAGES = 20;

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

function extractColorSize(raw: ShopifyRawProduct, variant: ShopifyRawVariant) {
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

async function fetchPage(baseUrl: string, page: number): Promise<ShopifyRawProduct[]> {
  const url = `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
      });
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, [500, 1500, 4000][attempt] ?? 4000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ShopifyProductsResponse;
      return data.products ?? [];
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, [500, 1500][attempt]));
    }
  }
  return [];
}

async function ingestShop(shopId: string, domain: string, baseUrl: string) {
  console.log(`\n📦 Ingesting ${shopId} from ${domain}...`);
  
  await db.insert(shops).values({
    shopId, name: shopId.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
    domain, baseUrl, active: true, lastFetchedAt: new Date(),
  }).onConflictDoUpdate({ target: shops.shopId, set: { lastFetchedAt: new Date(), active: true } });

  const all: ShopifyRawProduct[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const raw = await fetchPage(baseUrl, page);
    if (raw.length === 0) break;
    all.push(...raw);
    if (raw.length < PAGE_SIZE) break;
  }
  console.log(`   Found ${all.length} products`);

  // Process in batches of 50 for better performance
  const BATCH_SIZE = 50;
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    const values = batch.map((raw) => {
      const variants = raw.variants.map((v) => {
        const { color, size } = extractColorSize(raw, v);
        return { id: `${shopId}:${v.id}`, title: v.title, price: parseFloat(v.price), available: v.available, color, size };
      });
      const prices = variants.map((v) => v.price).filter((p) => !Number.isNaN(p));
      return {
        id: `${shopId}:${raw.id}`, shopId, shop: shopId, title: raw.title,
        description: stripHtml(raw.body_html).slice(0, 500),
        category: guessCategory(raw.product_type, raw.tags),
        images: raw.images.map((img) => img.src),
        variants: variants as any,
        minPrice: prices.length ? String(Math.min(...prices)) : "0",
        maxPrice: prices.length ? String(Math.max(...prices)) : "0",
        tags: raw.tags, url: `${baseUrl}/products/${raw.handle}`, fetchedAt: new Date(),
      };
    });
    
    await db.insert(products).values(values).onConflictDoUpdate({
      target: products.id,
      set: { shop: shopId, title: products.title, description: products.description,
        category: products.category, images: products.images,
        variants: products.variants, minPrice: products.minPrice,
        maxPrice: products.maxPrice, tags: products.tags, url: products.url,
        fetchedAt: new Date(), updatedAt: new Date() },
    });
    
    console.log(`   Processed ${Math.min(i + BATCH_SIZE, all.length)}/${all.length}`);
  }
  console.log(`   ✅ Ingested ${all.length} products`);
  return all.length;
}

async function main() {
  console.log("🚀 Starting catalog ingestion...\n");
  
  const configs = [
    { shopId: "outdoor-voices", domain: "outdoorvoices.com", baseUrl: "https://www.outdoorvoices.com" },
    { shopId: "apc-us", domain: "apc-us.com", baseUrl: "https://www.apc-us.com" },
  ];

  let total = 0;
  for (const cfg of configs) {
    try {
      total += await ingestShop(cfg.shopId, cfg.domain, cfg.baseUrl);
    } catch (err) {
      console.error(`❌ Failed ${cfg.shopId}:`, err);
    }
  }
  console.log(`\n✅ Ingestion complete! Total: ${total} products`);
}

main().catch((err) => { console.error("❌ Ingestion failed:", err); process.exit(1); });
