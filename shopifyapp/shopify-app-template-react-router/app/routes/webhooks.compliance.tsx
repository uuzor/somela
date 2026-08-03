import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { removeShopFromIndex } from "../services/vector.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const normalizedTopic = String(topic).toLowerCase().replaceAll("_", "/");

  console.log(`[OpenCommerceLens] Received compliance webhook ${topic} for ${shop}`);

  // No customer or order scopes are requested, so customer requests are no-ops.
  // Shop redaction removes all catalogue, tracking, and session data.
  if (normalizedTopic === "shop/redact") {
    await removeShopFromIndex(shop);
    await db.product.deleteMany({ where: { shop } });
    await db.session.deleteMany({ where: { shop } });
    await db.merchant.deleteMany({ where: { shop } });
  }

  return new Response(null, { status: 200 });
};
