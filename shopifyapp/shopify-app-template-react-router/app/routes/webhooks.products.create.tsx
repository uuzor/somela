import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { enqueueProductWebhook } from "../services/webhook-queue.server";

/**
 * Webhook handler: products/create
 * Fires when a merchant adds a new product in Shopify.
 * Sends the product to OpenCommerceLens for embedding.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[OpenCommerceLens] Received ${topic} webhook for ${shop}`);

  const webhookId = request.headers.get("X-Shopify-Webhook-Id");
  const queueResult = await enqueueProductWebhook(shop, payload, { topic, webhookId });
  console.info("[OCL_WEBHOOK] webhook_acknowledged", {
    shop,
    topic,
    webhookId,
    status: 200,
    ...queueResult,
  });

  return new Response(null, { status: 200 });
};
