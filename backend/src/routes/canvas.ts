import { Router } from "express";
import { db, conversations, cartItems, carts, products, userPreferences } from "../db/index.js";
import { desc, eq, and } from "drizzle-orm";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";

export const canvasRouter = Router();

async function getActor(req: any) {
  const identity = await resolveRequestIdentity(req);
  const sessionId = identity.sessionId || undefined;
  return { userId: identity.userId || undefined, sessionId };
}

async function getCartSnapshot(userId?: string, sessionId?: string) {
  const conditions = [] as any[];
  if (userId) conditions.push(eq(carts.userId, userId));
  if (!userId && sessionId) conditions.push(eq(carts.sessionId, sessionId));
  if (conditions.length === 0) return null;

  const [cart] = await db
    .select()
    .from(carts)
    .where(and(...conditions, eq(carts.status, "active")))
    .limit(1);

  if (!cart) return null;

  const items = await db
    .select({
      id: cartItems.id,
      productId: cartItems.productId,
      variantId: cartItems.variantId,
      quantity: cartItems.quantity,
      product: {
        id: products.id,
        title: products.title,
        images: products.images,
        minPrice: products.minPrice,
        maxPrice: products.maxPrice,
        category: products.category,
        url: products.url,
      },
    })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.cartId, cart.id));

  return {
    id: cart.id,
    status: cart.status,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
  };
}

async function getConversationSnapshot(userId?: string, sessionId?: string) {
  if (!userId && !sessionId) return null;

  const conditions = [] as any[];
  if (userId) conditions.push(eq(conversations.userId, userId));
  if (sessionId) conditions.push(eq(conversations.sessionId, sessionId));

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (!conversation) return null;

  const messages = conversation.messages || [];
  return {
    id: conversation.id,
    sessionId: conversation.sessionId,
    messageCount: messages.length,
    lastMessage: messages.length > 0 ? messages[messages.length - 1].content || "" : "",
    updatedAt: conversation.updatedAt,
    messages,
    lastPreferences: conversation.lastPreferences || null,
  };
}

async function getPreferencesSnapshot(userId?: string) {
  if (!userId) return null;

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  if (!prefs) return null;

  return {
    category: prefs.category,
    colors: prefs.preferredColors || [],
    styles: prefs.preferredStyles || [],
    sizes: prefs.sizes || [],
    minPrice: prefs.minPrice ? parseFloat(String(prefs.minPrice)) : null,
    maxPrice: prefs.maxPrice ? parseFloat(String(prefs.maxPrice)) : null,
    dislikedItems: prefs.dislikedItems || [],
  };
}

function serializeProduct(product: any) {
  return {
    id: product.id,
    shopId: product.shopId,
    title: product.title,
    description: product.description,
    category: product.category,
    images: product.images,
    processedImages: product.processedImages,
    minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
    maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
    tags: product.tags,
    url: product.url,
  };
}

// GET /api/canvas/bootstrap
canvasRouter.get("/bootstrap", async (req, res) => {
  try {
    const { userId, sessionId } = await getActor(req);

    const [catalog, cart, conversation, preferences] = await Promise.all([
      db.select().from(products).orderBy(desc(products.fetchedAt)).limit(12),
      getCartSnapshot(userId, sessionId),
      getConversationSnapshot(userId, sessionId),
      getPreferencesSnapshot(userId),
    ]);

    res.json({
      session: {
        userId: userId || null,
        sessionId: sessionId || null,
      },
      preferences,
      cart,
      conversation,
      catalog: catalog.map(serializeProduct),
      canvasHints: {
        hasConversation: !!conversation,
        hasCart: !!cart,
        hasPreferences: !!preferences,
      },
    });
  } catch (error) {
    console.error("Canvas bootstrap error:", error);
    res.status(500).json({ error: "Failed to bootstrap canvas" });
  }
});
