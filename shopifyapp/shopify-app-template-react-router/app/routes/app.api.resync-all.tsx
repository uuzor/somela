import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  syncErrorMessage,
  triggerFullResync,
} from "../services/sync.server";

/**
 * API route: POST /app/api/resync-all
 * Triggers a full catalogue resync. Called via useFetcher from the dashboard.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  console.info("[OCL_SYNC] resync_all_request_accepted", { shop });

  // Fire-and-forget — response returns immediately
  triggerFullResync(admin, shop).catch((err) =>
    console.error("[OCL_SYNC] resync_all_task_rejected", {
      shop,
      errorMessage: syncErrorMessage(err),
    })
  );

  return Response.json({ ok: true, message: "Full resync started" });
};
