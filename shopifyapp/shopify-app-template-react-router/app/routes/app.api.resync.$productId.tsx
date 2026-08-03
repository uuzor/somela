import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { syncSingleProduct } from "../services/sync.server";

/**
 * API route: POST /app/api/resync/:productId
 * Resyncs a single product. :productId should be the Shopify numeric ID
 * (the GID is reconstructed here).
 * Called via useFetcher from the products page.
 */
export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const { productId } = params;

  if (!productId) {
    return Response.json({ ok: false, message: "Missing productId" }, { status: 400 });
  }

  // Accept either a raw numeric ID or a full GID
  const shopifyGid = productId.startsWith("gid://")
    ? productId
    : `gid://shopify/Product/${productId}`;

  try {
    await syncSingleProduct(admin, shop, shopifyGid);
    return Response.json({ ok: true, message: "Resynced successfully" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ ok: false, message }, { status: 500 });
  }
};
