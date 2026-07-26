import { Router } from "express";
import { db, products, productEmbeddings } from "../db/index.js";
import { eq } from "drizzle-orm";
import { SemanticSearchSchema } from "../types/api.js";
import { searchRateLimit } from "../middleware/rateLimit.js";
import { 
  vectorSearchProducts, 
  findSimilarToProduct,
  isVectorSearchAvailable 
} from "../services/vector.js";

export const searchRouter = Router();

// Apply rate limiting
searchRouter.use(searchRateLimit);

// GET /api/search/similar/:productId - "More like this" button
searchRouter.get("/similar/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 12, 24);
    
    // Check if product exists
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Check if vector search is available
    if (!isVectorSearchAvailable()) {
      // Fallback: return products from same category
      const fallback = await db
        .select()
        .from(products)
        .where(eq(products.shopId, product.shopId))
        .limit(limit);
      
      return res.json({
        products: fallback.map((p) => ({
          id: p.id,
          title: p.title,
          images: p.images,
          minPrice: p.minPrice ? parseFloat(String(p.minPrice)) : null,
          maxPrice: p.maxPrice ? parseFloat(String(p.maxPrice)) : null,
          category: p.category,
          url: p.url,
        })),
        mode: "fallback",
        message: "Vector search not available",
      });
    }
    
    // Use vector search for similar products
    const similarProducts = await findSimilarToProduct(productId, limit);
    
    res.json({
      products: similarProducts.map((p) => ({
        id: p.productId,
        title: p.title,
        images: p.images,
        minPrice: p.minPrice,
        maxPrice: p.maxPrice,
        category: p.category,
        url: p.url,
        distance: p.distance,
        confidence: p.confidence,
      })),
      mode: "vector",
    });
  } catch (error) {
    console.error("Similar products error:", error);
    res.status(500).json({ error: "Failed to find similar products" });
  }
});

// POST /api/search/semantic - Semantic/text search
searchRouter.post("/semantic", async (req, res) => {
  try {
    const input = SemanticSearchSchema.parse(req.body);
    const limit = Math.min(input.limit || 12, 24);
    
    if (!process.env.VOYAGE_API_KEY) {
      return res.status(503).json({
        error: "Semantic search not available",
        reason: "VOYAGE_API_KEY not configured",
      });
    }
    
    if (!isVectorSearchAvailable()) {
      return res.status(503).json({
        error: "Semantic search not available",
        reason: "Database not connected",
      });
    }
    
    // Perform vector search
    const results = await vectorSearchProducts(
      { text: input.text },
      limit
    );
    
    res.json({
      products: results.map((p) => ({
        id: p.productId,
        title: p.title,
        images: p.images,
        minPrice: p.minPrice,
        maxPrice: p.maxPrice,
        category: p.category,
        url: p.url,
        distance: p.distance,
        confidence: p.confidence,
      })),
      query: input.text,
      mode: "semantic",
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    res.status(500).json({ error: "Search failed", details: String(error) });
  }
});
