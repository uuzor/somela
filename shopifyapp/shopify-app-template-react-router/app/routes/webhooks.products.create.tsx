import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleProductWebhook } from "../services/sync.server";

/**
 * Webhook handler: products/create
 * Fires when a merchant adds a new product in Shopify.
 * Sends the product to OpenCommerceLens for embedding.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[OpenCommerceLens] Received ${topic} webhook for ${shop}`);

  await handleProductWebhook(shop, payload);

  return new Response(null, { status: 200 });
};
