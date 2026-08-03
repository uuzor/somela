import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const migrationsDirectory = new URL("../prisma/migrations/", import.meta.url);
const migrationsPath = fileURLToPath(migrationsDirectory);
const migrationNames = fs
  .readdirSync(migrationsPath, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  await sql.unsafe(
    'CREATE TABLE IF NOT EXISTS "shopify_app_schema_migrations" (' +
      '"name" text PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())'
  );

  for (const name of migrationNames) {
    const applied = await sql.unsafe(
      "SELECT 1 FROM shopify_app_schema_migrations WHERE name = $1 LIMIT 1",
      [name]
    );
    if (applied.length > 0) continue;

    const migrationPath = path.join(
      migrationsPath,
      name,
      "migration.sql"
    );
    const migration = fs.readFileSync(migrationPath, "utf8");
    await sql.begin(async (transaction) => {
      await transaction.unsafe(migration);
      await transaction.unsafe(
        "INSERT INTO shopify_app_schema_migrations (name) VALUES ($1)",
        [name]
      );
    });
    console.info("[OCL_DB] shopify_storage_migration_applied", { name });
  }

  const tables = await sql.unsafe(
    "SELECT table_name FROM information_schema.tables " +
      "WHERE table_schema = 'public' AND table_name LIKE 'shopify_app_%' " +
      "ORDER BY table_name"
  );
  console.log(JSON.stringify({ migrated: true, tables }, null, 2));
} finally {
  await sql.end();
}
