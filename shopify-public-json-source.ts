import type { CatalogSource, Product, ProductVariant } from "./types";
import type { ShopifyProductsResponse, ShopifyRawProduct } from "./shopify-raw-types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const PAGE_SIZE = 250; // Shopify's max per page for this endpoint
const MAX_PAGES = 20;  // hard stop so a misbehaving store can't loop forever
const RETRY_DELAYS_MS = [500, 1500, 4000]; // 3 attempts total per page

// Cheap keyword -> category mapping. Good enough for "yoga clothes, blue" style
// discovery queries on Day 3. Extend this list per-store as you learn their
// product_type/tag conventions — don't over-engineer it before you have data.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  yoga: ["yoga", "legging", "sports bra"],
  outerwear: ["jacket", "coat", "puffer", "parka", "vest"],
  denim: ["denim", "jean"],
  dress: ["dress"],
  top: ["tee", "t-shirt", "shirt", "top", "sweater", "hoodie", "sweatshirt"],
  bottom: ["pant", "short", "skirt", "trouser"],
  tailoring: ["suit", "blazer", "tailor"],
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

// option1/option2 are positional and store-specific ("Color" might be
// option1 on one shop, option2 on another) — use the `options` array to
// figure out which slot actually holds color vs size instead of guessing.
function extractColorSize(
  raw: ShopifyRawProduct,
  variant: ShopifyRawProduct["variants"][number]
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

function normalize(shopId: string, baseUrl: string, raw: ShopifyRawProduct): Product {
  const variants: ProductVariant[] = raw.variants.map((v) => {
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
    title: raw.title,
    description: stripHtml(raw.body_html).slice(0, 500),
    category: guessCategory(raw.product_type, raw.tags),
    images: raw.images.map((img) => img.src),
    variants,
    minPrice: prices.length ? Math.min(...prices) : 0,
    maxPrice: prices.length ? Math.max(...prices) : 0,
    tags: raw.tags,
    url: `${baseUrl}/products/${raw.handle}`,
    fetchedAt: new Date().toISOString(),
  };
}

async function fetchPage(baseUrl: string, page: number): Promise<ShopifyRawProduct[]> {
  const url = `${baseUrl}/products.json?limit=${PAGE_SIZE}&page=${page}`;

  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": BROWSER_UA, Accept: "application/json" },
      });

      if (res.status === 429) {
        // Shopify rate limit — back off and retry rather than failing the whole run
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

export class ShopifyPublicJsonSource implements CatalogSource {
  constructor(public readonly shopId: string, private readonly baseUrl: string) {}

  async fetchProducts(): Promise<Product[]> {
    const all: Product[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const rawProducts = await fetchPage(this.baseUrl, page);
      if (rawProducts.length === 0) break; // no more pages

      all.push(...rawProducts.map((r) => normalize(this.shopId, this.baseUrl, r)));

      if (rawProducts.length < PAGE_SIZE) break; // last page was partial, so we're done
    }

    return all;
  }
}