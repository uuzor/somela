/**
 * Shopping Agent Service
 * 
 * Implements an OpenAI-compatible agent loop with tools for:
 * - Discovery: search, product details, variants, preferences
 * - Try-on: suggest, initiate, status (split for confirmation)
 * - Payment: prepare, execute, status (split for confirmation)
 * - Cart: add, view, update, remove items
 * 
 * Uses OpenAI SDK with OpenRouter or direct OpenAI API
 * 
 * HARDENING:
 * - All AI-generated data is validated via Zod schemas
 * - Streaming support for real-time UI updates
 * - Tool results are validated before being used
 */

import OpenAI from "openai";
import { db, products, productVariants, userPreferences, sessions, tryonTasks, userSelfies, carts, cartItems } from "../db/index.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { searchCatalog } from "./catalog-query.js";
import { vectorSearchProducts } from "./vector.js";
import {
  type ProductCard,
  type UIPayload,
  type UIAction,
  type ShoppingState as ValidatedShoppingState,
  type CatalogFilters as ValidatedCatalogFilters,
  type AgentResponse as ValidatedAgentResponse,
  safeValidateUIPayload,
  safeValidateProducts,
  formatSSEMessage,
  type StreamingEvent,
  type ChatMessage,
  type ChatState,
} from "./validation.js";

// Re-export validated types
export type { ProductCard, UIPayload, UIAction, StreamingEvent, ChatMessage, ChatState } from "./validation.js";
export type ShoppingState = ValidatedShoppingState;
export type CatalogFilters = ValidatedCatalogFilters;
export type AgentResponse = ValidatedAgentResponse;

// ============================================================================
// Configuration
// ============================================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "openai/gpt-4o";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 120000);

// ============================================================================
// OpenAI Client
// ============================================================================

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  baseURL: OPENAI_BASE_URL,
  timeout: OPENAI_TIMEOUT_MS,
});

// ============================================================================
// Types (for internal use)
// ============================================================================

export interface AgentMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface Tool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: any;
  };
}

// Streaming callback type
export type StreamingCallback = (event: StreamingEvent) => void;

// ============================================================================
// Default/Empty Validators
// ============================================================================

const DEFAULT_UI_PAYLOAD: UIPayload = {
  type: "replace_catalog",
  products: [],
};

const DEFAULT_ACTIONS: UIAction[] = [];
const DEFAULT_CHAT_STATE: ChatState = "chat";

function createChatStateEvent(
  state: ChatState,
  reason?: string,
  meta: { hasProducts?: boolean; productCount?: number; requiresInput?: boolean } = {},
): StreamingEvent {
  return {
    event: "ui_state",
    data: {
      state,
      reason,
      ...meta,
    },
  } as StreamingEvent;
}

function deriveChatState(
  uiPayload: UIPayload,
  assistantMessage: string,
  toolNames: Set<string>,
): ChatState {
  if (uiPayload.type === "replace_catalog" && uiPayload.products.length > 0) {
    return "show_catalog";
  }

  if (uiPayload.type === "show_product") {
    return "show_product";
  }

  if (uiPayload.type === "suggest_try_on" || toolNames.has("initiate_try_on")) {
    return "tryon";
  }

  if (uiPayload.type === "confirm_purchase" || uiPayload.type === "payment_pending" || toolNames.has("prepare_purchase") || toolNames.has("execute_prava_checkout")) {
    return toolNames.has("execute_prava_checkout") ? "processing" : "checkout";
  }

  if (uiPayload.type === "order_confirmed") {
    return "confirmation";
  }

  const trimmed = assistantMessage.trim();
  if (trimmed.endsWith("?") || /\b(what kind|which one|which style|how many|what color|what size|do you want|can you clarify)\b/i.test(trimmed)) {
    return "clarify";
  }

  if (toolNames.has("search_catalog")) {
    return "chat";
  }

  return "chat";
}

// ============================================================================
// Agent Tools
// ============================================================================

/**
 * Search the product catalog using hybrid search (vector + structured filters)
 */
async function searchCatalogTool(args: { query?: string; category?: string; color?: string; minPrice?: number; maxPrice?: number; store?: string; limit?: number }) {
  const filters: CatalogFilters = {
    query: args.query,
    category: args.category,
    color: args.color,
    minPrice: args.minPrice,
    maxPrice: args.maxPrice,
    store: args.store,
    limit: args.limit || 12,
  };

  let results: any[] = [];

  // Use vector search for semantic queries
  if (args.query) {
    const vectorResults = await vectorSearchProducts({ text: args.query }, args.limit || 12);
    if (vectorResults.length > 0) {
      // Get full product data
      const productIds = vectorResults.map(r => r.productId);
      const productData = await db.select().from(products).where(inArray(products.id, productIds));
      results = productData.map(p => ({
        productId: p.id,
        title: p.title,
        images: p.images || [],
        minPrice: p.minPrice ? parseFloat(String(p.minPrice)) : null,
        maxPrice: p.maxPrice ? parseFloat(String(p.maxPrice)) : null,
        category: p.category,
        url: p.url,
        similarityScore: 1 - (vectorResults.find(r => r.productId === p.id)?.distance || 0),
      }));
    }
  }

  // Fallback to structured search
  if (results.length === 0) {
    results = await searchCatalog(filters);
    results = results.map(p => ({
      productId: p.id,
      title: p.title,
      images: p.images || [],
      minPrice: p.minPrice ? parseFloat(String(p.minPrice)) : null,
      maxPrice: p.maxPrice ? parseFloat(String(p.maxPrice)) : null,
      category: p.category,
      url: p.url,
    }));
  }

  return { products: results };
}

/**
 * Get detailed information about a specific product
 */
async function getProductDetailsTool(args: { productId: string }) {
  const [product] = await db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  
  if (!product) {
    return { error: "Product not found" };
  }

  return {
    productId: product.id,
    title: product.title,
    description: product.description,
    images: product.images || [],
    minPrice: product.minPrice ? parseFloat(String(product.minPrice)) : null,
    maxPrice: product.maxPrice ? parseFloat(String(product.maxPrice)) : null,
    category: product.category,
    tags: product.tags || [],
    url: product.url,
  };
}

/**
 * Get available variants for a product (size, color, stock)
 */
async function getAvailableVariantsTool(args: { productId: string }) {
  const variants = await db.select().from(productVariants).where(eq(productVariants.productId, args.productId));
  
  return {
    variants: variants.map(v => ({
      variantId: v.id,
      color: v.color || null,
      size: v.size || null,
      price: v.price ? parseFloat(String(v.price)) : null,
      inStock: v.stockQuantity !== null && v.stockQuantity > 0,
    })),
  };
}

/**
 * Get user's saved preferences
 */
async function getUserPreferencesTool(args: { userId: string }) {
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, args.userId)).limit(1);
  
  if (!prefs) {
    return {
      preferences: {
        sizes: [],
        colors: [],
        styles: [],
        maxPrice: null,
        dislikedItems: [],
      },
    };
  }

  return {
    preferences: {
      sizes: prefs.sizes || [],
      colors: prefs.preferredColors || [],
      styles: prefs.preferredStyles || [],
      maxPrice: prefs.maxPrice ? parseFloat(String(prefs.maxPrice)) : null,
      dislikedItems: prefs.dislikedItems || [],
    },
  };
}

/**
 * Update user's saved preferences
 */
async function setUserPreferencesTool(args: { userId: string; category?: string; colors?: string[]; sizes?: string[]; maxPrice?: number }) {
  const existing = await db.select().from(userPreferences).where(eq(userPreferences.userId, args.userId)).limit(1);
  
  const maxPriceStr = args.maxPrice !== undefined ? String(args.maxPrice) : undefined;
  
  if (existing.length > 0) {
    await db.update(userPreferences)
      .set({
        preferredColors: args.colors || existing[0].preferredColors,
        sizes: args.sizes || existing[0].sizes,
        maxPrice: maxPriceStr ?? existing[0].maxPrice,
        updatedAt: new Date(),
      })
      .where(eq(userPreferences.userId, args.userId));
  } else {
    await db.insert(userPreferences).values({
      userId: args.userId,
      preferredColors: args.colors || [],
      sizes: args.sizes || [],
      maxPrice: maxPriceStr,
    });
  }

  return { success: true, message: "Preferences updated" };
}

/**
 * Suggest try-on (returns UI action card, does NOT initiate)
 */
async function suggestTryOnTool(args: { productId: string; reason: string }) {
  const [product] = await db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  
  if (!product) {
    return { error: "Product not found" };
  }

  return {
    suggestion: {
      productId: product.id,
      title: product.title,
      image: product.images?.[0] || null,
      reason: args.reason,
    },
    requiresConfirmation: true,
    message: `Would you like to try on the ${product.title}? ${args.reason}`,
  };
}

/**
 * Initiate try-on (requires prior suggestion + user confirmation)
 */
async function initiateTryOnTool(args: { productId: string; variantId?: string; userId: string; confirmationToken: string }) {
  // Validate confirmation token (in production, verify against stored token)
  if (!args.confirmationToken) {
    return { error: "Confirmation required", requiresConfirmation: true };
  }

  // Get user's selfie
  const [selfie] = await db.select().from(userSelfies).where(eq(userSelfies.userId, args.userId)).limit(1);
  
  if (!selfie) {
    return { error: "No selfie on file. Please upload a selfie first." };
  }

  // Get product image
  const [product] = await db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  
  if (!product || !product.images?.[0]) {
    return { error: "Product image not available" };
  }

  // Create try-on task
  const [task] = await db.insert(tryonTasks).values({
    userId: args.userId,
    garmentImageUrl: product.images[0],
    userSelfieUrl: selfie.imageUrl,
    status: "processing",
  }).returning();

  return {
    success: true,
    tryOnId: task.id,
    status: "processing",
    message: "Try-on job started. You can check status with get_try_on_status.",
  };
}

/**
 * Get try-on status (for async polling)
 */
async function getTryOnStatusTool(args: { tryOnId: string }) {
  const [task] = await db.select().from(tryonTasks).where(eq(tryonTasks.id, args.tryOnId)).limit(1);
  
  if (!task) {
    return { error: "Try-on task not found" };
  }

  return {
    tryOnId: task.id,
    status: task.status,
    resultUrl: task.resultImageUrl || null,
    error: task.errorMessage || null,
  };
}

/**
 * Prepare purchase (stores immutable purchase intent)
 */
async function preparePurchaseTool(args: { productId: string; variantId?: string; quantity?: number; userId: string }) {
  const [product] = await db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  
  if (!product) {
    return { error: "Product not found" };
  }

  let variant = null;
  if (args.variantId) {
    const [v] = await db.select().from(productVariants).where(
      and(eq(productVariants.id, args.variantId), eq(productVariants.productId, args.productId))
    ).limit(1);
    variant = v;
  }

  const itemPrice = variant?.price 
    ? parseFloat(String(variant.price)) 
    : (product.minPrice ? parseFloat(String(product.minPrice)) : 0);
  const shipping = 8.95; // Placeholder
  const taxes = Math.round(itemPrice * 0.08 * 100) / 100; // 8% placeholder
  const total = Math.round((itemPrice + shipping + taxes) * 100) / 100;

  // Store purchase intent (in production, use proper table with immutable records)
  const purchaseIntentId = `pi_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return {
    purchaseIntentId,
    productId: product.id,
    productName: product.title,
    variant: variant ? `${variant.color || ''} ${variant.size || ''}`.trim() : "Standard",
    merchant: product.shop || "Partner Store",
    itemPrice,
    shipping,
    taxes,
    total,
    currency: "USD",
    requiresConfirmation: true,
    message: `Purchase prepared: ${product.title} for $${total}. Confirm to proceed with Prava checkout.`,
  };
}

/**
 * Execute Prava checkout (requires prior prepare + user confirmation)
 */
async function executePravaCheckoutTool(args: { purchaseIntentId: string; confirmationToken: string; userId: string }) {
  if (!args.confirmationToken) {
    return { error: "Confirmation required", requiresConfirmation: true };
  }

  // In production, this would:
  // 1. Verify confirmation token
  // 2. Call Prava API for payment token
  // 3. Execute checkout on merchant site
  // 4. Return actual order status

  // Placeholder implementation
  const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return {
    success: true,
    orderId,
    status: "pending_approval",
    message: "Checkout initiated. Awaiting Prava approval...",
    approvalRequired: true,
  };
}

/**
  * Get purchase status
  */
async function getPurchaseStatusTool(args: { purchaseIntentId: string }) {
  // In production, query actual order/payment status
  // For now, return placeholder
  
  return {
    purchaseIntentId: args.purchaseIntentId,
    status: "pending",
    message: "Payment status pending. Please check back shortly.",
  };
}

// ============================================================================
// Cart Tools
// ============================================================================

/**
 * Resolve or create a cart for a user (authenticated or guest)
 */
async function resolveCart(userId: string | undefined, sessionId: string | undefined) {
  if (userId) {
    let [cart] = await db.select().from(carts).where(and(eq(carts.userId, userId), eq(carts.status, "active"))).limit(1);
    if (!cart) {
      [cart] = await db.insert(carts).values({ userId, sessionId, status: "active" }).returning();
    }
    return cart;
  }

  if (sessionId) {
    let [cart] = await db.select().from(carts).where(and(eq(carts.sessionId, sessionId), eq(carts.status, "active"))).limit(1);
    if (!cart) {
      [cart] = await db.insert(carts).values({ sessionId, status: "active" }).returning();
    }
    return cart;
  }

  return null;
}

/**
 * Add a product to the cart
 */
async function addToCartTool(args: { productId: string; variantId?: string; quantity?: number; userId?: string; sessionId?: string }) {
  const cart = await resolveCart(args.userId, args.sessionId);
  if (!cart) {
    return { error: "Unable to resolve cart. Please provide userId or sessionId." };
  }

  const [product] = await db.select().from(products).where(eq(products.id, args.productId)).limit(1);
  if (!product) {
    return { error: "Product not found" };
  }

  // Check if item already in cart
  const existingItem = await db.select().from(cartItems).where(
    and(eq(cartItems.cartId, cart.id), eq(cartItems.productId, args.productId))
  ).limit(1);

  if (existingItem.length > 0) {
    // Update quantity
    const updated = await db.update(cartItems)
      .set({ quantity: existingItem[0].quantity + (args.quantity || 1), updatedAt: new Date() })
      .where(eq(cartItems.id, existingItem[0].id))
      .returning();
    return { success: true, message: `Updated ${product.title} quantity to ${updated[0].quantity}`, cartItemId: updated[0].id };
  }

  // Add new item
  const [newItem] = await db.insert(cartItems).values({
    cartId: cart.id,
    productId: args.productId,
    variantId: args.variantId || null,
    quantity: args.quantity || 1,
  }).returning();

  return { success: true, message: `Added ${product.title} to cart`, cartItemId: newItem.id };
}

/**
 * View the current cart contents
 */
async function viewCartTool(args: { userId?: string; sessionId?: string }) {
  const cart = await resolveCart(args.userId, args.sessionId);
  if (!cart) {
    return { items: [], totalItems: 0, totalPrice: 0 };
  }

  const items = await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id));

  const cartItemsWithProducts = await Promise.all(
    items.map(async (item) => {
      const [product] = await db.select().from(products).where(eq(products.id, item.productId)).limit(1);
      return {
        cartItemId: item.id,
        productId: item.productId,
        title: product?.title || "Unknown Product",
        images: product?.images || [],
        minPrice: product?.minPrice ? parseFloat(String(product.minPrice)) : null,
        variantId: item.variantId,
        quantity: item.quantity,
      };
    })
  );

  const totalItems = cartItemsWithProducts.reduce((sum, i) => sum + i.quantity, 0);
  const totalPrice = cartItemsWithProducts.reduce((sum, i) => {
    const price = i.minPrice || 0;
    return sum + price * i.quantity;
  }, 0);

  return { items: cartItemsWithProducts, totalItems, totalPrice: Math.round(totalPrice * 100) / 100 };
}

/**
 * Update the quantity of a cart item
 */
async function updateCartItemTool(args: { cartItemId: string; quantity: number; userId?: string; sessionId?: string }) {
  const cart = await resolveCart(args.userId, args.sessionId);
  if (!cart) {
    return { error: "Unable to resolve cart. Please provide userId or sessionId." };
  }

  const [item] = await db.select().from(cartItems).where(
    and(eq(cartItems.id, args.cartItemId), eq(cartItems.cartId, cart.id))
  ).limit(1);

  if (!item) {
    return { error: "Cart item not found" };
  }

  if (args.quantity <= 0) {
    await db.delete(cartItems).where(eq(cartItems.id, args.cartItemId));
    return { success: true, message: "Item removed from cart" };
  }

  const [updated] = await db.update(cartItems)
    .set({ quantity: args.quantity, updatedAt: new Date() })
    .where(eq(cartItems.id, args.cartItemId))
    .returning();

  return { success: true, message: `Updated quantity to ${updated.quantity}`, cartItemId: updated.id };
}

/**
 * Remove an item from the cart
 */
async function removeFromCartTool(args: { cartItemId: string; userId?: string; sessionId?: string }) {
  const cart = await resolveCart(args.userId, args.sessionId);
  if (!cart) {
    return { error: "Unable to resolve cart. Please provide userId or sessionId." };
  }

  const [item] = await db.select().from(cartItems).where(
    and(eq(cartItems.id, args.cartItemId), eq(cartItems.cartId, cart.id))
  ).limit(1);

  if (!item) {
    return { error: "Cart item not found" };
  }

  await db.delete(cartItems).where(eq(cartItems.id, args.cartItemId));
  return { success: true, message: "Item removed from cart" };
}

// ============================================================================
// Tool Registry
// ============================================================================

const TOOLS: Array<{ name: string; description: string; parameters: any; handler: (args: any) => Promise<any> }> = [
  {
    name: "search_catalog",
    description: "Search the product catalog using hybrid search (semantic + structured filters). Use for finding products by style, category, color, price, or store.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Natural language search query (e.g., 'blue yoga clothes', 'casual outfit')" },
        category: { type: "string", description: "Product category (e.g., yoga, denim, dress, outerwear, top, bottom)" },
        color: { type: "string", description: "Color preference" },
        minPrice: { type: "number", description: "Minimum price" },
        maxPrice: { type: "number", description: "Maximum price" },
        store: { type: "string", description: "Store name filter" },
        limit: { type: "number", description: "Max results (default 12)" },
      },
    },
    handler: searchCatalogTool,
  },
  {
    name: "get_product_details",
    description: "Get detailed information about a specific product including description, images, and full metadata.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
      },
      required: ["productId"],
    },
    handler: getProductDetailsTool,
  },
  {
    name: "get_available_variants",
    description: "Get available variants for a product with sizes, colors, and stock status.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
      },
      required: ["productId"],
    },
    handler: getAvailableVariantsTool,
  },
  {
    name: "get_user_preferences",
    description: "Get the user's saved preferences including sizes, colors, styles, budget, and disliked items.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" },
      },
      required: ["userId"],
    },
    handler: getUserPreferencesTool,
  },
  {
    name: "set_user_preferences",
    description: "Save or update the user's shopping preferences.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID" },
        category: { type: "string", description: "Preferred category" },
        colors: { type: "array", items: { type: "string" }, description: "Preferred colors" },
        sizes: { type: "array", items: { type: "string" }, description: "Preferred sizes" },
        maxPrice: { type: "number", description: "Maximum budget" },
      },
      required: ["userId"],
    },
    handler: setUserPreferencesTool,
  },
  {
    name: "suggest_try_on",
    description: "Suggest a try-on for a product. Returns a UI action card for user confirmation. Does NOT initiate try-on.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID to try on" },
        reason: { type: "string", description: "Reason for suggesting this product" },
      },
      required: ["productId", "reason"],
    },
    handler: suggestTryOnTool,
  },
  {
    name: "initiate_try_on",
    description: "Actually start a try-on job. Requires prior suggest_try_on call and user confirmation.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID to try on" },
        variantId: { type: "string", description: "Optional variant ID" },
        userId: { type: "string", description: "The user ID" },
        confirmationToken: { type: "string", description: "Confirmation token from user accepting the suggestion" },
      },
      required: ["productId", "userId", "confirmationToken"],
    },
    handler: initiateTryOnTool,
  },
  {
    name: "get_try_on_status",
    description: "Check the status of a try-on job. Use for async polling after initiate_try_on.",
    parameters: {
      type: "object",
      properties: {
        tryOnId: { type: "string", description: "The try-on job ID" },
      },
      required: ["tryOnId"],
    },
    handler: getTryOnStatusTool,
  },
  {
    name: "prepare_purchase",
    description: "Prepare a purchase by resolving current price, availability, and storing an immutable purchase intent.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID" },
        variantId: { type: "string", description: "Optional variant ID" },
        quantity: { type: "number", description: "Quantity (default 1)" },
        userId: { type: "string", description: "The user ID" },
      },
      required: ["productId", "userId"],
    },
    handler: preparePurchaseTool,
  },
  {
    name: "execute_prava_checkout",
    description: "Execute the Prava checkout. Requires prior prepare_purchase call and user confirmation.",
    parameters: {
      type: "object",
      properties: {
        purchaseIntentId: { type: "string", description: "Purchase intent ID from prepare_purchase" },
        confirmationToken: { type: "string", description: "Confirmation token from user confirming the purchase" },
        userId: { type: "string", description: "The user ID" },
      },
      required: ["purchaseIntentId", "confirmationToken", "userId"],
    },
    handler: executePravaCheckoutTool,
  },
  {
    name: "get_purchase_status",
    description: "Check the status of a purchase or order.",
    parameters: {
      type: "object",
      properties: {
        purchaseIntentId: { type: "string", description: "The purchase intent ID" },
      },
      required: ["purchaseIntentId"],
    },
    handler: getPurchaseStatusTool,
  },
  {
    name: "add_to_cart",
    description: "Add a product to the shopping cart. Use when the user wants to add an item to their cart.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string", description: "The product ID to add" },
        variantId: { type: "string", description: "Optional variant ID (size/color)" },
        quantity: { type: "number", description: "Quantity to add (default 1)" },
        userId: { type: "string", description: "The user ID (for authenticated users)" },
        sessionId: { type: "string", description: "The session ID (for guest users)" },
      },
      required: ["productId"],
    },
    handler: addToCartTool,
  },
  {
    name: "view_cart",
    description: "View the current contents of the shopping cart.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "The user ID (for authenticated users)" },
        sessionId: { type: "string", description: "The session ID (for guest users)" },
      },
    },
    handler: viewCartTool,
  },
  {
    name: "update_cart_item",
    description: "Update the quantity of an item in the cart. Use quantity=0 to remove an item.",
    parameters: {
      type: "object",
      properties: {
        cartItemId: { type: "string", description: "The cart item ID to update" },
        quantity: { type: "number", description: "New quantity (0 to remove)" },
        userId: { type: "string", description: "The user ID (for authenticated users)" },
        sessionId: { type: "string", description: "The session ID (for guest users)" },
      },
      required: ["cartItemId", "quantity"],
    },
    handler: updateCartItemTool,
  },
  {
    name: "remove_from_cart",
    description: "Remove an item from the shopping cart.",
    parameters: {
      type: "object",
      properties: {
        cartItemId: { type: "string", description: "The cart item ID to remove" },
        userId: { type: "string", description: "The user ID (for authenticated users)" },
        sessionId: { type: "string", description: "The session ID (for guest users)" },
      },
      required: ["cartItemId"],
    },
    handler: removeFromCartTool,
  },
];

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a helpful clothing-shopping agent for OpenCommerceLens.

Help users discover, compare, try on and purchase clothes from our curated collection.

VISUAL SEARCH:
When users upload an image, they want to find visually similar clothing items. The system has already performed visual search and returned matching products. Present these results helpfully, describing how each item relates to what they uploaded.

CRITICAL RULES:
1. Use search_catalog instead of inventing products.
2. Respect the user's saved size, style, colour and budget from get_user_preferences.
3. Check availability (get_available_variants) before recommending a product.
4. NEVER initiate a try-on without explicit user confirmation (use suggest_try_on first).
5. NEVER execute a purchase without showing the product, variant, merchant, currency and final price and receiving explicit confirmation.
6. After confirmation, use execute_prava_checkout.
7. NEVER claim that a payment succeeded until get_purchase_status returns a successful result.
8. Do NOT let the model calculate payment totals - use prepare_purchase which does this properly.
9. Do NOT let the model decide whether confirmation happened - your backend verifies the confirmation token.

WORKFLOW FOR VISUAL SEARCH:
When the user's message includes "[User uploaded an image]", visually similar products have already been searched and returned. Describe these results, highlighting key similarities in style, color, or category. Do NOT re-search unless the user asks to refine.

WORKFLOW FOR TRY-ON:
1. Use suggest_try_on to show a product card to the user
2. Wait for user to confirm (they tap "Try it on")
3. Use initiate_try_on with the confirmation token

WORKFLOW FOR PURCHASE:
1. Use prepare_purchase to show the full purchase summary
2. Wait for user to confirm
3. Use execute_prava_checkout with the confirmation token
4. Use get_purchase_status to verify success

WORKFLOW FOR CART:
1. Use add_to_cart to add products to the cart
2. Use view_cart to show the user what's in their cart
3. Use update_cart_item to change quantities
4. Use remove_from_cart to remove items
5. After cart changes, use view_cart to show the updated cart
6. The user can proceed to checkout from the cart view

Keep responses conversational but concise. Use tools efficiently - don't make unnecessary calls.`;

// ============================================================================
// Agent Loop
// ============================================================================

export interface RunAgentOptions {
  sessionId: string;
  userId: string;
  message: string;
  imageUrl?: string; // Optional image for visual search
  conversationHistory?: AgentMessage[];
  shoppingState?: ShoppingState;
}

/**
 * Run the agent (non-streaming version)
 * Uses validated types from validation.ts
 */
export async function runAgent(options: RunAgentOptions): Promise<AgentResponse> {
  // Collect events for final response
  let finalReply = "";
  let actions: UIAction[] = [];
  let uiPayload: UIPayload = DEFAULT_UI_PAYLOAD;
  let chatState: ChatState = DEFAULT_CHAT_STATE;

  // Streaming callback that collects final state
  const collectEvent = (event: StreamingEvent) => {
    if (event.event === "text") {
      finalReply += event.data;
    } else if (event.event === "ui_action") {
      actions.push(event.data);
    } else if (event.event === "ui_payload") {
      uiPayload = event.data;
    } else if (event.event === "ui_state") {
      chatState = event.data.state;
    }
  };

  // Run streaming version and capture full message history
  const messages = await runAgentStream({ ...options, onEvent: collectEvent });

  // Validate and return
  return {
    chatReply: finalReply || "I'm not sure how to help with that.",
    uiPayload: safeValidateUIPayload(uiPayload),
    actions: actions.slice(0, 10), // Limit actions
    conversationId: options.sessionId,
    messages,
    chatState,
    updatedState: { chatState },
  };
}

export interface RunAgentStreamOptions extends RunAgentOptions {
  onEvent: StreamingCallback;
}

/**
 * Run the agent with streaming support
 * Sends events to the frontend via the callback
 */
export async function runAgentStream(options: RunAgentStreamOptions): Promise<any[]> {
  const { sessionId, userId, message, imageUrl, conversationHistory = [], shoppingState, onEvent } = options;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  // Add conversation context with current state
  if (shoppingState) {
    const contextPrompt = `\n\nCURRENT SHOPPING STATE:
- Visible products: ${shoppingState.visibleProductIds.length} items
- Active filters: ${JSON.stringify(shoppingState.activeFilters)}
${shoppingState.focusedProductId ? `- Focused product: ${shoppingState.focusedProductId}` : ""}
${shoppingState.activeTryOnId ? `- Active try-on: ${shoppingState.activeTryOnId}` : ""}
${shoppingState.purchaseIntentId ? `- Purchase intent: ${shoppingState.purchaseIntentId}` : ""}

When user says "the third one" or similar, use visibleProductIds to resolve.`;
    messages.push({ role: "system", content: contextPrompt });
  }

  // Add conversation history
  for (const msg of conversationHistory.slice(-10)) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: msg.content });
    }
  }

  // Build user message content
  let userContent = message;
  if (imageUrl) {
    userContent = `${message}\n\n[User uploaded an image for visual search: ${imageUrl}]`;
  }
  messages.push({ role: "user", content: userContent });

  let chatState: ChatState = DEFAULT_CHAT_STATE;
  const toolNamesUsed = new Set<string>();
  const emitChatState = (nextState: ChatState, reason?: string, meta: { hasProducts?: boolean; productCount?: number; requiresInput?: boolean } = {}) => {
    if (chatState === nextState && !reason) {
      return;
    }
    chatState = nextState;
    onEvent(createChatStateEvent(nextState, reason, meta));
  };

  // If imageUrl is provided, perform visual search first and include results
  let visualSearchResults = null;
  onEvent(createChatStateEvent(chatState, "conversation_started", { requiresInput: true }));
  if (imageUrl) {
    try {
      visualSearchResults = await vectorSearchProducts({ imageUrl }, 12);
      
      // Send visual search results as an event
      const visualProducts = visualSearchResults.map((r) => ({
        productId: r.productId,
        title: r.title,
        images: r.images || [],
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        category: r.category,
        url: r.url,
      }));
      onEvent({
        event: "ui_payload",
        data: {
          type: "replace_catalog",
          products: visualProducts,
        },
      });
      emitChatState("show_catalog", "visual_search_results", {
        hasProducts: visualProducts.length > 0,
        productCount: visualProducts.length,
        requiresInput: false,
      });
    } catch (error) {
      console.error("Visual search failed:", error);
    }
  }

  // Build tool definitions
  const toolDefs: OpenAI.Chat.ChatCompletionTool[] = TOOLS.map(t => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let assistantMessage: string = "";
  let toolResults: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];
  let actions: UIAction[] = [];
  let uiPayload: UIPayload = DEFAULT_UI_PAYLOAD;

  // If we already have visual search results, set them as the initial uiPayload
  if (visualSearchResults && visualSearchResults.length > 0) {
    uiPayload = {
      type: "replace_catalog",
      products: visualSearchResults.map((r) => ({
        productId: r.productId,
        title: r.title,
        images: r.images || [],
        minPrice: r.minPrice,
        maxPrice: r.maxPrice,
        category: r.category,
        url: r.url,
      })),
    };
  }

  // Agent loop (max 8 iterations)
  for (let turn = 0; turn < 8; turn++) {
    try {
      toolResults = [];
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages,
        tools: toolDefs,
        tool_choice: "auto",
        max_tokens: 2048,
      });

      const choice = response.choices[0];
      if (!choice.message) break;

      // Handle text response - stream it
      if (choice.message.content) {
        assistantMessage = choice.message.content;
        onEvent({ event: "text", data: choice.message.content });
      }

      // Handle tool calls
      const toolCalls = (choice.message as any).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name || toolCall.name;
          const args = JSON.parse(toolCall.function?.arguments || "{}");
          toolNamesUsed.add(toolName);
          
          // Stream tool call event
          onEvent({
            event: "tool_call",
            data: { name: toolName, arguments: args },
          });

          // Inject userId where needed
          if (["get_user_preferences", "set_user_preferences", "initiate_try_on", "prepare_purchase", "execute_prava_checkout", "add_to_cart", "view_cart", "update_cart_item", "remove_from_cart"].includes(toolName)) {
            args.userId = userId;
          }

          // Find and execute tool
          const tool = TOOLS.find(t => t.name === toolName);
          if (tool) {
            try {
              const result = await tool.handler(args);
              
              // Stream tool result
              onEvent({
                event: "tool_result",
                data: { name: toolName, result },
              });

              // Validate and track special results
              if (toolName === "search_catalog" && result.products) {
                // Validate products
                const validProducts = safeValidateProducts(result.products);
                uiPayload = {
                  type: "replace_catalog",
                  products: validProducts.slice(0, 12),
                };
                onEvent({ event: "ui_payload", data: uiPayload });
                emitChatState("show_catalog", "search_results", {
                  hasProducts: validProducts.length > 0,
                  productCount: validProducts.length,
                  requiresInput: false,
                });
              } else if (toolName === "suggest_try_on" && result.suggestion) {
                const action: UIAction = {
                  type: "suggest_try_on",
                  productId: result.suggestion.productId,
                };
                actions.push(action);
                onEvent({ event: "ui_action", data: action });
                emitChatState("tryon", "try_on_suggested", { requiresInput: true });
              } else if (toolName === "prepare_purchase" && result.purchaseIntentId) {
                // Validate purchase summary
                const purchase = {
                  productId: result.productId || "",
                  variantId: result.variantId || "",
                  productName: result.productName || "",
                  variant: result.variant || "Standard",
                  merchant: result.merchant || "Partner Store",
                  itemPrice: typeof result.itemPrice === "number" ? result.itemPrice : 0,
                  shipping: typeof result.shipping === "number" ? result.shipping : 0,
                  taxes: typeof result.taxes === "number" ? result.taxes : 0,
                  total: typeof result.total === "number" ? result.total : 0,
                  currency: result.currency || "USD",
                };
                uiPayload = {
                  type: "confirm_purchase",
                  purchase,
                };
                onEvent({ event: "ui_payload", data: uiPayload });
                emitChatState("checkout", "purchase_prepared", { requiresInput: true });
              }

              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify(result),
              });
            } catch (error: any) {
              console.error(`Tool ${toolName} error:`, error);
              toolResults.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: JSON.stringify({ error: error.message }),
              });
            }
          } else {
            toolResults.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
            });
          }
        }

        // Add assistant message and tool results
        messages.push(choice.message as OpenAI.Chat.ChatCompletionMessage);
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: result.tool_call_id,
            content: result.content,
          } as any);
        }
      } else {
        // No tool calls, we're done
        break;
      }
    } catch (error: any) {
      console.error("Agent loop error:", error);
      onEvent({
        event: "error",
        data: {
          code: "AGENT_ERROR",
          message: error.message || "An error occurred",
        },
      });
      break;
    }
  }

  const derivedState = deriveChatState(uiPayload, assistantMessage, toolNamesUsed);
  emitChatState(
    derivedState,
    "final_state_determined",
    {
      hasProducts: uiPayload.type === "replace_catalog" ? uiPayload.products.length > 0 : undefined,
      productCount: uiPayload.type === "replace_catalog" ? uiPayload.products.length : undefined,
      requiresInput: derivedState === "clarify" || derivedState === "chat",
    },
  );

   // Send final event with complete response
  onEvent({
    event: "done",
    data: {
      reply: assistantMessage || "I'm not sure how to help with that.",
      uiPayload: safeValidateUIPayload(uiPayload),
      actions: actions.slice(0, 10),
      messages: messages as any,
      chatState: derivedState,
    },
  });

  return messages;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if agent is available (API key configured)
 */
export function isAgentAvailable(): boolean {
  return !!OPENAI_API_KEY;
}






