import { Router } from "express";
import { db, products, shops } from "../db/index.js";
import { productSummarySelect } from "../db/product-select.js";
import { eq, and, gte, lte, sql } from "drizzle-orm";
import { CatalogFiltersSchema } from "../types/api.js";
import { defaultRateLimit } from "../middleware/rateLimit.js";

export const catalogRouter = Router();

catalogRouter.use(defaultRateLimit);

const COLOR_WORDS = [
  "black", "white", "blue", "red", "green", "evergreen", "floral",
  "pink", "beige", "cream", "navy", "grey", "gray", "brown", "olive",
];

function serializeProduct(product: any) {
  return {
    id: product.id,
    shopId: product.shopId,

    title: product.title,
    description: product.description,
    category: product.category,
    vendor: product.vendor,
    productType: product.productType,
    status: product.status,
    images: product.images,
    primaryImage: Array.isArray(product.images) ? product.images[0] ?? null : null,
    processedImages: product.processedImages,
    variants: product.variants,
    options: product.options ?? [],
    collections: product.collections ?? [],
    seo: product.seo ?? null,
    minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
    maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
    compareAtPriceMin: product.compareAtPriceMin ? parseFloat(String(product.compareAtPriceMin)) : null,
    compareAtPriceMax: product.compareAtPriceMax ? parseFloat(String(product.compareAtPriceMax)) : null,
    onSale: Boolean(product.onSale),
    totalInventory: product.totalInventory ?? null,
    requiresShipping: product.requiresShipping ?? null,
    taxable: product.taxable ?? null,
    tags: product.tags,
    url: product.url,
  };
}

// GET /api/catalog/shops - List available shops
catalogRouter.get("/shops/list", async (_req, res) => {
  try {
    const result = await db.select().from(shops).where(eq(shops.active, true));
    res.json({ shops: result });
  } catch (error) {
    console.error("Shops fetch error:", error);
    res.status(500).json({ error: "Failed to fetch shops" });
  }
});

// GET /api/catalog/categories - List available categories
catalogRouter.get("/categories/list", async (_req, res) => {
  try {
    const result = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(sql`${products.category} IS NOT NULL`);

    res.json({
      categories: result.map((r) => r.category).filter(Boolean),
    });
  } catch (error) {
    console.error("Categories fetch error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// GET /api/catalog
catalogRouter.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);

    const rawFilters = {
      category: req.query.category as string | undefined,
      color: req.query.color as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      shopId: req.query.shopId as string | undefined,
    };

    const filters = CatalogFiltersSchema.parse(rawFilters);
    const conditions = [];

    if (filters.category) {
      conditions.push(eq(products.category, filters.category));
    }

    if (filters.shopId) {
      conditions.push(eq(products.shopId, filters.shopId));
    }

    if (filters.minPrice !== undefined) {
      conditions.push(gte(products.minPrice, String(filters.minPrice)));
    }

    if (filters.maxPrice !== undefined) {
      conditions.push(lte(products.maxPrice, String(filters.maxPrice)));
    }

    const results = conditions.length > 0
      ? await db.select(productSummarySelect).from(products).where(and(...conditions))
      : await db.select(productSummarySelect).from(products);

    const sorted = results.sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime());

    let filtered = sorted;
    if (filters.color) {
      const targetColor = filters.color.toLowerCase();
      filtered = sorted.filter((p) => {
        const hasStructuredMatch = p.variants?.some((v: any) => v.color?.toLowerCase() === targetColor);
        if (hasStructuredMatch) return true;

        const haystack = [p.title, ...(p.tags || [])].join(" ").toLowerCase();
        return haystack.includes(targetColor) || COLOR_WORDS.some((c) => haystack.includes(c) && targetColor.includes(c));
      });
    }

    const total = filtered.length;
    const page = filtered.slice(offset, offset + limit);

    res.json({
      products: page.map(serializeProduct),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        category: filters.category,
        color: filters.color,
        minPrice: filters.minPrice,
        maxPrice: filters.maxPrice,
        shopId: filters.shopId,
      },
    });
  } catch (error) {
    console.error("Catalog query error:", error);
    res.status(400).json({ error: "Invalid filters", details: String(error) });
  }
});

// GET /api/catalog/:id
catalogRouter.get("/:id", async (req, res) => {
  try {
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, req.params.id))
      .limit(1);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(serializeProduct(product));
  } catch (error) {
    console.error("Product fetch error:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

