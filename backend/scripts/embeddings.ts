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
// Voyage AI API (Image-Only for Visual Search)
// ============================================================================

/**
 * Get IMAGE-ONLY embedding for visual search
 * Uses voyage-4 with image URLs (1024 dimensions)
 * 
 * This is the key to visual search: products are embedded with their images only,
 * so users can upload a photo and find visually similar items.
 * 
 * Pure image embedding ensures visual similarity matching works correctly.
 */
async function getImageEmbedding(imageUrl: string): Promise<number[]> {
  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: imageUrl,
      model: "voyage-4",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Voyage API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json() as { data: { embedding: number[] }[] };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) {
    throw new Error("Voyage returned no embedding");
  }

  return embedding;
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
  images: string[];
}

interface ProductEmbedding {
  product_id: string;
  embedding: string;
}

async function getProductsWithoutEmbeddings(): Promise<Product[]> {
  return db`
    SELECT p.id, p.title, p.description, p.category, p.tags, p.images
    FROM products p
    LEFT JOIN product_embeddings pe ON p.id = pe.product_id
    WHERE pe.product_id IS NULL
    LIMIT 500
  `;
}

async function getAllProducts(): Promise<Product[]> {
  return db`SELECT id, title, description, category, tags, images FROM products`;
}

async function insertEmbedding(embedding: ProductEmbedding) {
  await db`INSERT INTO product_embeddings ${db(embedding)} ON CONFLICT (product_id) DO UPDATE SET embedding = ${embedding.embedding}`;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("🚀 Starting IMAGE-ONLY embeddings generation...");
  console.log("   Using voyage-4 with image URLs for visual search support\n");

  // Limit to 100 products for initial testing
  const TEST_LIMIT = 100;
  const products = await getAllProducts();
  
  // Check which products are already embedded
  const existingEmbeddings = await db`
    SELECT product_id FROM product_embeddings
  `;
  const existingIds = new Set(existingEmbeddings.map(e => e.product_id));
  
  // Filter out already embedded products and limit to TEST_LIMIT
  const toEmbed = products
    .filter(p => !existingIds.has(p.id))
    .slice(0, TEST_LIMIT);
  
  console.log(`Total products in DB: ${products.length}`);
  console.log(`Already embedded: ${existingIds.size}`);
  console.log(`Will embed: ${toEmbed.length} products\n`);

  // Count how many have images
  const withImages = toEmbed.filter(p => p.images && p.images.length > 0);
  console.log(`   ${withImages.length} products have images (required for embedding)\n`);

  let processed = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH_SIZE = 1; // One at a time due to rate limits

  for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
    const batch = toEmbed.slice(i, i + BATCH_SIZE);

    for (let j = 0; j < batch.length; j++) {
      const p = batch[j];
      
      // Skip products without images - visual search requires images
      if (!p.images || p.images.length === 0) {
        skipped++;
        if ((i + j + 1) % 20 === 0 || i + j + 1 >= toEmbed.length) {
          console.log(`   Progress: ${i + j + 1}/${toEmbed.length} (embedded: ${processed}, skipped: ${skipped}, errors: ${errors})`);
        }
        continue;
      }
      
      const primaryImage = p.images[0];
      
      let retries = 0;
      const maxRetries = 3;
      
      while (retries < maxRetries) {
        try {
          // Get IMAGE-ONLY embedding (pure visual similarity)
          const embedding = await getImageEmbedding(primaryImage);
          await insertEmbedding({ product_id: p.id, embedding: JSON.stringify(embedding) });
          processed++;
          
          if ((i + j + 1) % 20 === 0 || i + j + 1 >= toEmbed.length) {
            console.log(`   Progress: ${i + j + 1}/${toEmbed.length} (embedded: ${processed}, skipped: ${skipped}, errors: ${errors})`);
          }
          
          // Rate limiting - 200ms between requests
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

  console.log(`\n✅ Embeddings complete!`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Skipped (no images): ${skipped}`);
  console.log(`   Errors: ${errors}`);
  
  await db.end();
}

main().catch((err) => {
  console.error("❌ Embeddings failed:", err);
  process.exit(1);
});
