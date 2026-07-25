import { Router } from "express";
import { db, visualSearchTasks, products } from "../db/index.js";
import { eq } from "drizzle-orm";
import { VisualSearchRequestSchema } from "../types/api.js";

export const visualSearchRouter = Router();

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

// Compute cosine similarity between two vectors
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Get embedding from Voyage AI
async function getVoyageEmbedding(input: string | { url: string }): Promise<number[]> {
  // voyage-4 supports both text and image URLs (1024 dims)
  const isImageUrl = typeof input === "object" && input.url && input.url.startsWith("http");
  const body = { input: isImageUrl ? input.url : (input as string), model: "voyage-4" };
  
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// POST /api/visual-search - Upload image for visual search
visualSearchRouter.post("/", async (req, res) => {
  try {
    const input = VisualSearchRequestSchema.parse(req.body);
    
    if (!VOYAGE_API_KEY) {
      return res.status(503).json({
        error: "Visual search not available",
        reason: "VOYAGE_API_KEY not configured",
      });
    }
    
    // Create task
    const [task] = await db.insert(visualSearchTasks).values({
      queryImageUrl: input.imageUrl,
      queryText: input.text,
      status: "processing",
    }).returning();
    
    // Process in background (don't await)
    processVisualSearch(task.id, input).catch(console.error);
    
    res.status(201).json({
      taskId: task.id,
      status: "processing",
      message: "Processing visual search...",
    });
  } catch (error) {
    console.error("Visual search error:", error);
    res.status(400).json({ error: "Invalid visual search request", details: error });
  }
});

async function processVisualSearch(taskId: string, input: { imageUrl?: string; text?: string }) {
  try {
    let queryEmbedding: number[];
    
    if (input.imageUrl) {
      // Get embedding from image URL using multimodal model
      queryEmbedding = await getVoyageEmbedding({ url: input.imageUrl });
    } else if (input.text) {
      // Get embedding from text query
      queryEmbedding = await getVoyageEmbedding(input.text);
    } else {
      throw new Error("Either imageUrl or text must be provided");
    }
    
    // Get all product embeddings
    const embeddings = await db.query.productEmbeddings.findMany({
      with: { product: true },
    });
    
    if (embeddings.length === 0) {
      await db.update(visualSearchTasks)
        .set({ status: "completed", results: [], errorMessage: "No products embedded yet" })
        .where(eq(visualSearchTasks.id, taskId));
      return;
    }
    
    // Calculate similarities
    const similarities = embeddings.map((emb) => {
      const productEmbedding = JSON.parse(emb.embedding) as number[];
      const similarity = cosineSimilarity(queryEmbedding, productEmbedding);
      return {
        productId: emb.productId,
        title: emb.product?.title || "",
        images: emb.product?.images || [],
        minPrice: emb.product?.minPrice ? parseFloat(String(emb.product.minPrice)) : null,
        maxPrice: emb.product?.maxPrice ? parseFloat(String(emb.product.maxPrice)) : null,
        category: emb.product?.category,
        url: emb.product?.url,
        distance: 1 - similarity, // Convert similarity to distance
        confidence: similarity > 0.9 ? "exact" : similarity > 0.8 ? "close" : similarity > 0.7 ? "similar" : "low",
      };
    });
    
    // Sort by similarity (highest first)
    similarities.sort((a, b) => a.distance - b.distance);
    
    // Update task with results
    await db.update(visualSearchTasks)
      .set({ 
        status: "completed", 
        results: similarities.slice(0, 12) as any,
        completedAt: new Date(),
      })
      .where(eq(visualSearchTasks.id, taskId));
      
    console.log(`Visual search ${taskId} completed with ${similarities.length} results`);
  } catch (error) {
    console.error(`Visual search ${taskId} failed:`, error);
    await db.update(visualSearchTasks)
      .set({ status: "failed", errorMessage: String(error) })
      .where(eq(visualSearchTasks.id, taskId));
  }
}

// GET /api/visual-search/:taskId - Get visual search results
visualSearchRouter.get("/:taskId", async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const [task] = await db
      .select()
      .from(visualSearchTasks)
      .where(eq(visualSearchTasks.id, taskId))
      .limit(1);
    
    if (!task) {
      return res.status(404).json({ error: "Visual search task not found" });
    }
    
    res.json({
      taskId: task.id,
      status: task.status,
      queryImageUrl: task.queryImageUrl,
      queryText: task.queryText,
      results: task.results,
      errorMessage: task.errorMessage,
      createdAt: task.createdAt,
      completedAt: task.completedAt,
    });
  } catch (error) {
    console.error("Visual search status error:", error);
    res.status(500).json({ error: "Failed to get visual search status" });
  }
});

// Webhook for YouCam background removal completion
visualSearchRouter.post("/webhook", async (req, res) => {
  // TODO: Implement YouCam webhook handler
  // - Verify HMAC signature
  // - Embed cleaned image
  // - Run vector search
  // - Store results
  res.json({ received: true });
});
