import { Router } from "express";
import { z } from "zod";
import { defaultRateLimit } from "../middleware/rateLimit.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";
import { hasSavedProductsOwner, listSavedProducts, removeSavedProduct, saveProduct } from "../services/saved-products.js";

export const savedProductsRouter = Router();

savedProductsRouter.use(defaultRateLimit);

const SaveProductSchema = z.object({
  productId: z.string().min(1),
});

// GET /api/saved-products
savedProductsRouter.get("/", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!hasSavedProductsOwner(identity)) {
      return res.json({ savedProducts: [] });
    }

    const items = await listSavedProducts({ userId: identity.userId, sessionId: identity.sessionId });
    return res.json({ savedProducts: items });
  } catch (error) {
    console.error("Saved products fetch error:", error);
    res.status(500).json({ error: "Failed to fetch saved products" });
  }
});

// POST /api/saved-products/items
savedProductsRouter.post("/items", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!hasSavedProductsOwner(identity)) {
      return res.status(401).json({ error: "Missing authorization or sessionId" });
    }

    const body = SaveProductSchema.parse(req.body);
    const result = await saveProduct({ userId: identity.userId, sessionId: identity.sessionId }, body.productId);

    if (!result.product || !result.savedProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    return res.status(result.created ? 201 : 200).json({
      savedProduct: {
        savedId: result.savedProduct.id,
        productId: result.savedProduct.productId,
        product: result.product,
        createdAt: result.savedProduct.createdAt,
        updatedAt: result.savedProduct.updatedAt,
      },
    });
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("Saved product create error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    res.status(status).json({ error: "Failed to save product" });
  }
});

// DELETE /api/saved-products/items/:productId
savedProductsRouter.delete("/items/:productId", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!hasSavedProductsOwner(identity)) {
      return res.status(401).json({ error: "Missing authorization or sessionId" });
    }

    const removed = await removeSavedProduct({ userId: identity.userId, sessionId: identity.sessionId }, req.params.productId);
    if (!removed) {
      return res.status(404).json({ error: "Saved product not found" });
    }

    return res.status(204).send();
  } catch (error) {
    console.error("Saved product delete error:", error);
    res.status(500).json({ error: "Failed to remove saved product" });
  }
});
