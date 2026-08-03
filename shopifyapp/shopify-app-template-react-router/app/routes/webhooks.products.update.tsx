import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleProductWebhook } from "../services/sync.server";

/**
 * Webhook handler: products/update
 * Fires when a merchant edits a product (title, images, price, etc.).
 * Re-sends the updated product to OpenCommerceLens.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[OpenCommerceLens] Received ${topic} webhook for ${shop}`);

  await handleProductWebhook(shop, payload);

  return new Response(null, { status: 200 });
};
