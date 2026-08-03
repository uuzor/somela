import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { removeShopFromIndex } from "../services/vector.server";

/**
 * Webhook handler: app/uninstalled
 *
 * Cleans up sessions, merchant record, and local product tracking rows.
 * Note: products remain in the shared PostgreSQL database so developers who
 * have already paid for queries against this merchant's catalogue are not
 * disrupted. If you want to remove them too, call removeProductFromIndex
 * from vector.server.ts for each product before deleting the rows here.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`[OpenCommerceLens] Received ${topic} for ${shop}; cleaning up`);

  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // An uninstalled merchant must no longer be discoverable.
  await removeShopFromIndex(shop);

  // Remove local sync-tracking rows
  await db.product.deleteMany({ where: { shop } });
  await db.merchant.deleteMany({ where: { shop } });

  return new Response(null, { status: 200 });
};
