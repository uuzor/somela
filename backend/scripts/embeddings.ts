import "dotenv/config";
import postgres from "postgres";

// ============================================================================
// Configuration
// ============================================================================

const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!VOYAGE_API_KEY) {
  console.error("❌ VOYAGE_API_KEY not set");
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL not set");
  process.exit(1);
}

// ============================================================================
// Voyage AI API
// ============================================================================

async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: text,
      model: "voyage-4",  // Supports both text AND image URLs (1024 dims)
    }),
  });

  if (!response.ok) {
    throw new Error(`Voyage API error: ${response.status}`);
  }

  const data = await response.json() as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

// ============================================================================
// Database
// ============================================================================

const db = postgres(DATABASE_URL!, { ssl: "require", max: 5 });

interface Product {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
}

interface ProductEmbedding {
  product_id: string;
  embedding: string;
}

async function getProductsWithoutEmbeddings(): Promise<Product[]> {
  return db`
    SELECT p.id, p.title, p.description, p.category, p.tags
    FROM products p
    LEFT JOIN product_embeddings pe ON p.id = pe.product_id
    WHERE pe.product_id IS NULL
    LIMIT 500
  `;
}

async function getAllProducts(): Promise<Product[]> {
  return db`SELECT id, title, description, category, tags FROM products`;
}

async function insertEmbedding(embedding: ProductEmbedding) {
  await db`INSERT INTO product_embeddings ${db(embedding)} ON CONFLICT (product_id) DO UPDATE SET embedding = ${embedding.embedding}`;
}

async function insertEmbeddings(embeddings: ProductEmbedding[]) {
  for (const embedding of embeddings) {
    await insertEmbedding(embedding);
  }
}

// ============================================================================
// Text creation for embedding
// ============================================================================

function createEmbeddingText(product: Product): string {
  const parts: string[] = [product.title];
  
  if (product.category) {
    parts.push(`Category: ${product.category}`);
  }
  
  if (product.description) {
    parts.push(product.description);
  }
  
  if (product.tags && product.tags.length > 0) {
    parts.push(`Tags: ${product.tags.join(", ")}`);
  }
  
  return parts.join(". ");
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🚀 Starting embeddings generation...\n");

  const products = await getAllProducts();
  console.log(`Found ${products.length} products to embed`);

  let processed = 0;
  let errors = 0;
  const BATCH_SIZE = 1; // One at a time due to rate limits

  for (let i = 0; i < products.length; i += BATCH_SIZE) {
    const batch = products.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      const text = createEmbeddingText(p);
      
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          const embedding = await getEmbedding(text);
          await insertEmbedding({ product_id: p.id, embedding: JSON.stringify(embedding) });
          processed++;
          
          if ((i + j + 1) % 50 === 0 || i + j + 1 >= products.length) {
            console.log(`   Processed ${i + j + 1}/${products.length}`);
          }
          
          // Minimal delay between requests (200ms)
          await new Promise((r) => setTimeout(r, 200));
          break;
        } catch (err) {
          retries++;
          const waitTime = retries * 1000;
          console.error(`   Error at ${i + j} (retry ${retries}/${maxRetries}): ${(err as Error).message}. Waiting ${waitTime}ms...`);
          await new Promise((r) => setTimeout(r, waitTime));
        }
      }
      
      if (retries >= maxRetries) {
        errors++;
        console.error(`   Failed at ${i + j} after ${maxRetries} retries`);
      }
    }
  }

  console.log(`\n✅ Embeddings complete! Processed: ${processed}, Errors: ${errors}`);
  
  await db.end();
}

main().catch((err) => {
  console.error("❌ Embeddings failed:", err);
  process.exit(1);
});
