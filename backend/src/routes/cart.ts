import { Router } from "express";
import { db, carts, cartItems, products } from "../db/index.js";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { AddCartItemSchema, UpdateCartItemSchema } from "../types/api.js";
import { defaultRateLimit } from "../middleware/rateLimit.js";

export const cartRouter = Router();

cartRouter.use(defaultRateLimit);

async function findCart(userId?: string | null, sessionId?: string | null) {
  if (userId) {
    const [cart] = await db
      .select()
      .from(carts)
      .where(and(eq(carts.userId, userId), eq(carts.status, "active")))
      .limit(1);
    return cart || null;
  }
  if (sessionId) {
    const [cart] = await db
      .select()
      .from(carts)
      .where(and(eq(carts.sessionId, sessionId), eq(carts.status, "active")))
      .limit(1);
    return cart || null;
  }
  return null;
}

async function resolveCart(userId?: string | null, sessionId?: string | null) {
  const existing = await findCart(userId, sessionId);
  if (existing) {
    return existing;
  }
  const [newCart] = await db
    .insert(carts)
    .values({
      userId: userId || null,
      sessionId: sessionId || null,
      status: "active",
    })
    .returning();
  return newCart;
}

async function getCartForAuth(userId?: string | null, sessionId?: string | null) {
  const cart = await findCart(userId, sessionId);
  if (!cart) {
    return null;
  }
  const items = await db
    .select({
      itemId: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      product: {
        id: products.id,
        title: products.title,
        images: products.images,
        minPrice: products.minPrice,
        maxPrice: products.maxPrice,
        url: products.url,
      },
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cart.id));
  return {
    cartId: cart.id,
    status: cart.status,
    items,
  };
}

// GET /api/cart
cartRouter.get("/", async (req, res) => {
  try {
    const userId = req.header("x-user-id") || null;
    const sessionId = (req.query.sessionId as string | undefined) || null;

    if (!userId && !sessionId) {
      return res.json({ cart: null });
    }

    const result = await getCartForAuth(userId, sessionId);
    return res.json({ cart: result });
  } catch (error) {
    console.error("Cart fetch error:", error);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
});

// POST /api/cart/items
cartRouter.post("/items", async (req, res) => {
  try {
    const userId = req.header("x-user-id") || null;
    const sessionId = (req.query.sessionId as string | undefined) || null;

    if (!userId && !sessionId) {
      return res.status(401).json({ error: "Missing x-user-id header or sessionId query param" });
    }

    const body = AddCartItemSchema.parse(req.body);
    const cart = await resolveCart(userId, sessionId);

    const [existing] = await db
      .select()
      .from(cartItems)
      .where(and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, body.productId), body.variantId ? eq(cartItems.variantId, body.variantId) : sql`${cartItems.variantId} IS NULL`))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: existing.quantity + body.quantity, updatedAt: new Date() })
        .where(eq(cartItems.id, existing.id))
        .returning();
      const [product] = await db.select().from(products).where(eq(products.id, updated.productId)).limit(1);
      return res.status(200).json({
        itemId: updated.id,
        productId: updated.productId,
        variantId: updated.variantId,
        quantity: updated.quantity,
        product: {
          id: product.id,
          title: product.title,
          images: product.images,
          minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
          maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
          url: product.url,
        },
      });
    }

    const [created] = await db
      .insert(cartItems)
      .values({
        cartId: cart.id,
        productId: body.productId,
        variantId: body.variantId || null,
        quantity: body.quantity,
      })
      .returning();

    const [product] = await db.select().from(products).where(eq(products.id, created.productId)).limit(1);
    return res.status(201).json({
      itemId: created.id,
      productId: created.productId,
      variantId: created.variantId,
      quantity: created.quantity,
      product: {
        id: product.id,
        title: product.title,
        images: product.images,
        minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
        maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
        url: product.url,
      },
    });
  } catch (error) {
    console.error("Cart item add error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    res.status(500).json({ error: "Failed to add item to cart" });
  }
});

// PUT /api/cart/items/:itemId
cartRouter.put("/items/:itemId", async (req, res) => {
  try {
    const userId = req.header("x-user-id") || null;
    const sessionId = (req.query.sessionId as string | undefined) || null;

    if (!userId && !sessionId) {
      return res.status(401).json({ error: "Missing x-user-id header or sessionId query param" });
    }

    const body = UpdateCartItemSchema.parse(req.body);
    const cart = await findCart(userId, sessionId);

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, req.params.itemId)).limit(1);

    if (!item || item.cartId !== cart.id) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    if (body.quantity < 1) {
      await db.delete(cartItems).where(eq(cartItems.id, item.id));
    } else {
      await db.update(cartItems).set({ quantity: body.quantity, updatedAt: new Date() }).where(eq(cartItems.id, item.id));
    }

    const result = await getCartForAuth(userId, sessionId);
    return res.json({ cart: result });
  } catch (error) {
    console.error("Cart item update error:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update cart item" });
  }
});

// DELETE /api/cart/items/:itemId
cartRouter.delete("/items/:itemId", async (req, res) => {
  try {
    const userId = req.header("x-user-id") || null;
    const sessionId = (req.query.sessionId as string | undefined) || null;

    if (!userId && !sessionId) {
      return res.status(401).json({ error: "Missing x-user-id header or sessionId query param" });
    }

    const cart = await findCart(userId, sessionId);

    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    const [item] = await db.select().from(cartItems).where(eq(cartItems.id, req.params.itemId)).limit(1);

    if (!item || item.cartId !== cart.id) {
      return res.status(404).json({ error: "Cart item not found" });
    }

    await db.delete(cartItems).where(eq(cartItems.id, item.id));
    return res.status(204).send();
  } catch (error) {
    console.error("Cart item delete error:", error);
    res.status(500).json({ error: "Failed to delete cart item" });
  }
});
