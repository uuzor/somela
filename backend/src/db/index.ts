import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL!;

// For query building - use pooled connection for regular ops
const queryClient = postgres(connectionString, {
  ssl: "require",
  max: 10,
});
export const db = drizzle(queryClient, { schema });

// Export schema for convenience
export * from "./schema.js";

// Helper to convert embedding array to string format for storage
export function embeddingToString(embedding: number[]): string {
  return `[${embedding.join(", ")}]`;
}

// Helper to parse embedding string back to array
export function embeddingToArray(embeddingStr: string): number[] {
  const cleaned = embeddingStr.replace(/[\[\]]/g, "");
  return cleaned.split(",").map(s => parseFloat(s.trim()));
}
