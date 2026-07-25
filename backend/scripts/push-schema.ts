/**
 * Custom schema push script for Neon
 * Uses direct connection which allows DDL operations
 */
import "dotenv/config";
import postgres from "postgres";

function getDirectUrl(): string {
  const url = process.env.DATABASE_URL || "";
  // For Supabase: add session mode option to bypass PgBouncer restrictions
  if (url.includes("pooler.supabase.com")) {
    return url.includes("options")
      ? url
      : url + "?options=-c%20pooler%3Dsession";
  }
  return url.replace("-pooler.", ".");
}

async function main() {
  const directUrl = getDirectUrl();
  console.log("Connecting...");
  console.log("URL:", directUrl.replace(/:([^@]+)@/, ":***@")); // Mask password
  
  const client = postgres(directUrl, {
    ssl: "require",
    max: 1,
  });
  
  try {
    // Try pgvector first (standard vector extension)
    console.log("Trying to enable pgvector extension...");
    try {
      await client`CREATE EXTENSION IF NOT EXISTS vector CASCADE`;
      console.log("✅ pgvector enabled");
    } catch {
      console.log("⚠️  pgvector not available, will use text-based storage");
    }
    
    // Create tables
    const tables = [
      {
        name: "users",
        sql: `CREATE TABLE IF NOT EXISTS users (
          id text PRIMARY KEY,
          email varchar(255) UNIQUE,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "shops",
        sql: `CREATE TABLE IF NOT EXISTS shops (
          id serial PRIMARY KEY,
          shop_id varchar(100) NOT NULL UNIQUE,
          name varchar(255) NOT NULL,
          domain varchar(255) NOT NULL,
          base_url varchar(500) NOT NULL,
          active boolean DEFAULT true NOT NULL,
          last_fetched_at timestamptz,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "products",
        sql: `CREATE TABLE IF NOT EXISTS products (
          id text PRIMARY KEY,
          shop_id varchar(100) NOT NULL,
          shop varchar(100) NOT NULL REFERENCES shops(shop_id),
          title varchar(500) NOT NULL,
          description text,
          category varchar(100),
          images jsonb DEFAULT '[]',
          processed_images jsonb DEFAULT '[]',
          variants jsonb DEFAULT '[]',
          min_price numeric(10, 2),
          max_price numeric(10, 2),
          tags jsonb DEFAULT '[]',
          url text,
          fetched_at timestamptz NOT NULL,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "product_embeddings",
        sql: `CREATE TABLE IF NOT EXISTS product_embeddings (
          product_id text PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
          embedding text NOT NULL,
          embedded_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "sessions",
        sql: `CREATE TABLE IF NOT EXISTS sessions (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text REFERENCES users(id) ON DELETE CASCADE,
          session_token varchar(255) NOT NULL UNIQUE,
          is_guest boolean DEFAULT true NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          last_active_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "user_preferences",
        sql: `CREATE TABLE IF NOT EXISTS user_preferences (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
          category varchar(100),
          color varchar(50),
          max_price numeric(10, 2),
          min_price numeric(10, 2),
          style jsonb DEFAULT '[]',
          size varchar(20),
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "user_selfies",
        sql: `CREATE TABLE IF NOT EXISTS user_selfies (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          image_url text NOT NULL,
          processed_image_url text,
          is_default boolean DEFAULT false,
          created_at timestamptz DEFAULT NOW() NOT NULL
        )`
      },
      {
        name: "tryon_tasks",
        sql: `CREATE TABLE IF NOT EXISTS tryon_tasks (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id uuid REFERENCES sessions(id),
          product_ids jsonb NOT NULL,
          selfie_id uuid REFERENCES user_selfies(id),
          external_task_id text,
          status varchar(50) DEFAULT 'pending' NOT NULL,
          result_image_url text,
          error_message text,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL,
          completed_at timestamptz
        )`
      },
      {
        name: "visual_search_tasks",
        sql: `CREATE TABLE IF NOT EXISTS visual_search_tasks (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          session_id uuid REFERENCES sessions(id),
          query_image_url text,
          query_text varchar(500),
          external_task_id text,
          status varchar(50) DEFAULT 'pending' NOT NULL,
          results jsonb,
          error_message text,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL,
          completed_at timestamptz
        )`
      },
      {
        name: "conversations",
        sql: `CREATE TABLE IF NOT EXISTS conversations (
          id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          session_id uuid REFERENCES sessions(id),
          messages jsonb DEFAULT '[]',
          last_preferences jsonb,
          created_at timestamptz DEFAULT NOW() NOT NULL,
          updated_at timestamptz DEFAULT NOW() NOT NULL
        )`
      }
    ];
    
    for (const table of tables) {
      try {
        await client.unsafe(table.sql);
        console.log(`✅ ${table.name} table created`);
      } catch (e: any) {
        if (e.message?.includes("already exists")) {
          console.log(`⏭️  ${table.name} already exists`);
        } else {
          console.error(`❌ ${table.name}:`, e.message);
        }
      }
    }
    
    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS products_shop_id_idx ON products(shop_id)",
      "CREATE INDEX IF NOT EXISTS products_category_idx ON products(category)",
      "CREATE INDEX IF NOT EXISTS products_min_price_idx ON products(min_price)",
      // Vector index - skip if pgvector not available (will add manually later)
      { sql: "CREATE INDEX IF NOT EXISTS product_embeddings_embedding_idx ON product_embeddings USING hnsw (embedding vector_cosine_ops)", optional: true },
      "CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id)",
      "CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_idx ON sessions(session_token)",
      "CREATE UNIQUE INDEX IF NOT EXISTS user_preferences_user_id_idx ON user_preferences(user_id)",
      "CREATE INDEX IF NOT EXISTS user_preferences_session_id_idx ON user_preferences(session_id)",
      "CREATE INDEX IF NOT EXISTS user_selfies_user_id_idx ON user_selfies(user_id)",
      "CREATE INDEX IF NOT EXISTS tryon_tasks_user_id_idx ON tryon_tasks(user_id)",
      "CREATE INDEX IF NOT EXISTS tryon_tasks_status_idx ON tryon_tasks(status)",
      "CREATE INDEX IF NOT EXISTS tryon_tasks_external_idx ON tryon_tasks(external_task_id)",
      "CREATE INDEX IF NOT EXISTS visual_search_session_idx ON visual_search_tasks(session_id)",
      "CREATE INDEX IF NOT EXISTS visual_search_status_idx ON visual_search_tasks(status)",
      "CREATE INDEX IF NOT EXISTS conversations_user_id_idx ON conversations(user_id)",
    ];
    
    for (const idx of indexes) {
      const idxItem = typeof idx === 'string' ? idx : idx.sql;
      const idxName = idxItem.match(/INDEX (IF NOT EXISTS )?(\S+)/)?.[2];
      const isOptional = typeof idx === 'object' && idx.optional;
      try {
        await client.unsafe(idxItem);
        console.log(`✅ ${idxName} created`);
      } catch (e: any) {
        if (e.message?.includes("already exists")) {
          console.log(`⏭️  ${idxName} already exists`);
        } else if (isOptional) {
          console.log(`⚠️  ${idxName} skipped (vector extension not available)`);
        } else {
          console.error(`❌ ${idxName}:`, e.message);
        }
      }
    }
    
    console.log("\n✅ Schema push complete!");
    
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("❌ Schema push failed:", err);
  process.exit(1);
});
