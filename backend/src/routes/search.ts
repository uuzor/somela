import { Router } from "express";
import { db, products, productEmbeddings } from "../db/index.js";
import { eq } from "drizzle-orm";
import { SemanticSearchSchema } from "../types/api.js";

export const searchRouter = Router();

// Placeholder for semantic search - requires VOYAGE_API_KEY and embeddings
// Full implementation in Phase 2

// GET /api/search/similar/:productId - "More like this" button
searchRouter.get("/similar/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const { limit = 12 } = req.query;
    
    // Check if product exists
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    
    // Check if embeddings exist
    const [embedding] = await db
      .select()
      .from(productEmbeddings)
      .where(eq(productEmbeddings.productId, productId))
      .limit(1);
    
    if (!embedding) {
      // Fallback: return random products (no embeddings yet)
      const fallback = await db
        .select()
        .from(products)
        .where(eq(products.shopId, product.shopId))
        .limit(Number(limit));
      
      return res.json({
        products: fallback.map((p) => ({
          id: p.id,
          title: p.title,
          images: p.images,
          minPrice: p.minPrice ? parseFloat(String(p.minPrice)) : null,
          category: p.category,
          url: p.url,
        })),
        note: "Vector embeddings not ready - using fallback",
      });
    }
    
    // TODO: Implement pgvector KNN search
    // For now, return placeholder
    res.json({
      message: "Semantic search coming in Phase 2",
      requires: ["VOYAGE_API_KEY", "product_embeddings populated"],
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
    
    if (!process.env.VOYAGE_API_KEY) {
      return res.status(503).json({
        error: "Semantic search not available",
        reason: "VOYAGE_API_KEY not configured",
      });
    }
    
    // TODO: Implement semantic search with Voyage AI
    // For now, return placeholder
    res.json({
      message: "Semantic search coming in Phase 2",
      query: input,
    });
  } catch (error) {
    console.error("Semantic search error:", error);
    res.status(400).json({ error: "Invalid search query", details: error });
  }
});
