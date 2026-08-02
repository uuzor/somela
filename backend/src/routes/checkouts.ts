import { Router } from "express";
import { z } from "zod";
import { defaultRateLimit } from "../middleware/rateLimit.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";
import { getPravaRemotePaymentResult } from "../services/prava.js";
import { getCheckout, listCheckouts, syncCheckoutStatus } from "../services/checkouts.js";

export const checkoutsRouter = Router();
checkoutsRouter.use(defaultRateLimit);

const CheckoutListQuerySchema = z.object({
  status: z.enum([
    "created",
    "awaiting_approval",
    "approved",
    "paid",
    "failed",
    "expired",
    "cancelled",
  ]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

async function requireCheckoutUser(req: Parameters<typeof resolveRequestIdentity>[0]) {
  const identity = await resolveRequestIdentity(req);
  if (!identity.isAuthenticated || !identity.userId) {
    const error = new Error("Authentication required");
    (error as any).status = 401;
    throw error;
  }
  return identity;
}

checkoutsRouter.get("/", async (req, res) => {
  try {
    const identity = await requireCheckoutUser(req);
    const query = CheckoutListQuerySchema.parse(req.query);
    const rows = await listCheckouts(
      { userId: identity.userId },
      { status: query.status, limit: query.limit },
    );
    return res.json({ checkouts: rows });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid checkout query", details: error.errors });
    }
    const status = Number((error as any)?.status || 500);
    console.error("Checkout history error:", error);
    return res.status(status).json({ error: status === 401 ? "Authentication required" : "Failed to fetch checkout history" });
  }
});

checkoutsRouter.get("/:checkoutId", async (req, res) => {
  try {
    const identity = await requireCheckoutUser(req);
    const checkout = await getCheckout({ userId: identity.userId }, req.params.checkoutId);
    if (!checkout) return res.status(404).json({ error: "Checkout not found" });
    return res.json({ checkout });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    console.error("Checkout detail error:", error);
    return res.status(status).json({ error: status === 401 ? "Authentication required" : "Failed to fetch checkout" });
  }
});

checkoutsRouter.post("/:checkoutId/sync", async (req, res) => {
  try {
    const identity = await requireCheckoutUser(req);
    const result = await syncCheckoutStatus(
      { userId: identity.userId },
      req.params.checkoutId,
      getPravaRemotePaymentResult,
    );
    if (!result) return res.status(404).json({ error: "Checkout not found" });
    return res.json(result);
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    console.error("Checkout sync error:", error);
    return res.status(status).json({ error: status === 401 ? "Authentication required" : "Failed to synchronize checkout" });
  }
});
