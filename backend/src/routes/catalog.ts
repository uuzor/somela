import { Router } from "express";
import { db, products } from "../db/index.js";
import { eq, and, gte, lte, like, sql, desc, count } from "drizzle-orm";
import { CatalogFiltersSchema } from "../types/api.js";
import { defaultRateLimit } from "../middleware/rateLimit.js";

export const catalogRouter = Router();

// Apply rate limiting to all catalog routes
catalogRouter.use(defaultRateLimit);

// Color fallback words (same as original catalog-query.ts)
const COLOR_WORDS = [
  "black", "white", "blue", "red", "green", "evergreen", "floral",
  "pink", "beige", "cream", "navy", "grey", "gray", "brown", "olive",
];

// GET /api/catalog
catalogRouter.get("/", async (req, res) => {
  try {
    // Validate and parse query params with limits
    const limit = Math.min(
      parseInt(req.query.limit as string, 10) || 20,
      100  // Max 100 items per request
    );
    const offset = Math.max(
      parseInt(req.query.offset as string, 10) || 0,
      0
    );

    const rawFilters = {
      category: req.query.category as string | undefined,
      color: req.query.color as string | undefined,
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      shopId: req.query.shopId as string | undefined,
    };

    // Validate filters
    const filters = CatalogFiltersSchema.parse(rawFilters);
    
    // Build conditions array
    const conditions = [];
    
    if (filters.category) {
      conditions.push(eq(products.category, filters.category));
    }
    
    if (filters.shopId) {
      conditions.push(eq(products.shopId, filters.shopId));
    }
    
    if (filters.minPrice !== undefined) {
      conditions.push(lte(products.minPrice, String(filters.minPrice)));
    }
    
    if (filters.maxPrice !== undefined) {
      conditions.push(gte(products.maxPrice, String(filters.maxPrice)));
    }
    
    // Get total count before pagination
    const countResult = conditions.length > 0
      ? await db.select({ count: count() }).from(products).where(and(...conditions))
      : await db.select({ count: count() }).from(products);
    const total = countResult[0]?.count ?? 0;
    
    // Execute query with pagination
    const results = conditions.length > 0
      ? await db.select().from(products).where(and(...conditions))
      : await db.select().from(products);
    
    // Sort by fetchedAt descending
    const sorted = results
      .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())
      .slice(offset, offset + limit);
    
    // Color filtering happens in JS (fallback logic)
    let filtered = sorted;
    if (filters.color) {
      const targetColor = filters.color.toLowerCase();
      filtered = sorted.filter((p) => {
        // Check structured color in variants
        const hasStructuredMatch = p.variants?.some(
          (v: any) => v.color?.toLowerCase() === targetColor
        );
        if (hasStructuredMatch) return true;
        
        // Fallback: check title and tags
        const haystack = [p.title, ...(p.tags || [])].join(" ").toLowerCase();
        return haystack.includes(targetColor) || COLOR_WORDS.some(c => 
          haystack.includes(c) && targetColor.includes(c)
        );
      });
    }
    
    res.json({
      products: filtered.map((p) => ({
        id: p.id,
        shopId: p.shopId,
        title: p.title,
        description: p.description,
        category: p.category,
        images: p.images,
        minPrice: p.minPrice ? parseFloat(String(p.minPrice)) : null,
        maxPrice: p.maxPrice ? parseFloat(String(p.maxPrice)) : null,
        tags: p.tags,
        url: p.url,
      })),
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
    
    res.json({
      id: product.id,
      shopId: product.shopId,
      title: product.title,
      description: product.description,
      category: product.category,
      images: product.images,
      processedImages: product.processedImages,
      variants: product.variants,
      minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
      maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
      tags: product.tags,
      url: product.url,
    });
  } catch (error) {
    console.error("Product fetch error:", error);
    res.status(500).json({ error: "Failed to fetch product" });
  }
});

// GET /api/catalog/shops - List available shops
catalogRouter.get("/shops/list", async (_req, res) => {
  try {
    const { shops } = await import("../db/schema.js");
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
      categories: result.map((r) => r.category).filter(Boolean) 
    });
  } catch (error) {
    console.error("Categories fetch error:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});
