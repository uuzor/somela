import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleProductDeleted } from "../services/sync.server";

/**
 * Webhook handler: products/delete
 * Fires when a merchant deletes a product from Shopify.
 * Removes it from the local tracker and shared catalogue.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[OpenCommerceLens] Received ${topic} webhook for ${shop}`);

  // payload for products/delete only contains { id }
  const shopifyGid = `gid://shopify/Product/${(payload as { id: number | string }).id}`;

  await handleProductDeleted(shop, shopifyGid);

  return new Response(null, { status: 200 });
};
