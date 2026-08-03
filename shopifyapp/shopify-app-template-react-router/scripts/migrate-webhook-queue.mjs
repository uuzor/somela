import fs from "node:fs";
import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const migrationUrl = new URL(
  "../../../backend/src/migrations/008_shopify_sync_jobs.sql",
  import.meta.url
);
const migration = fs.readFileSync(migrationUrl, "utf8");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });

try {
  await sql.unsafe(migration);
  const columns = await sql.unsafe(
    "SELECT column_name, data_type FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND table_name = 'shopify_sync_jobs' " +
      "ORDER BY ordinal_position"
  );
  const indexes = await sql.unsafe(
    "SELECT indexname FROM pg_indexes " +
      "WHERE schemaname = 'public' AND tablename = 'shopify_sync_jobs' " +
      "ORDER BY indexname"
  );
  console.log(
    JSON.stringify({ migrated: true, columns, indexes }, null, 2)
  );
} finally {
  await sql.end();
}
