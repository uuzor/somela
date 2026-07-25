import { writeFile } from "node:fs/promises";
import { ShopifyPublicJsonSource } from "./shopify-public-json-source";
import type { CatalogSource, Product } from "./types";

// Add a new source here once a store is confirmed working (see the curl check
// from earlier). Nothing downstream (search, ranking, try-on) needs to change
// when you add one — that's the whole point of the CatalogSource interface.
const SOURCES: CatalogSource[] = [
  new ShopifyPublicJsonSource("outdoor-voices", "https://www.outdoorvoices.com"),
  new ShopifyPublicJsonSource("apc-us", "https://www.apc-us.com"),
];

async function main() {
  const results = await Promise.allSettled(SOURCES.map((s) => s.fetchProducts()));

  const catalog: Product[] = [];
  results.forEach((result, i) => {
    const shopId = SOURCES[i].shopId;
    if (result.status === "fulfilled") {
      console.log(`${shopId}: ${result.value.length} products`);
      catalog.push(...result.value);
    } else {
      // One store failing should never take down the other's ingestion —
      // log it and keep going, don't let Promise.all fail the whole run.
      console.error(`${shopId}: FAILED — ${result.reason}`);
    }
  });

  await writeFile("catalog.json", JSON.stringify(catalog, null, 2));
  console.log(`\nWrote ${catalog.length} total products to catalog.json`);
}

main().catch((err) => {
  console.error("Ingestion crashed:", err);
  process.exit(1);
});