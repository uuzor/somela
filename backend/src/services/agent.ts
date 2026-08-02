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
import { db, products, productVariants, userPreferences, sessions, tryonTasks, userSelfies, carts, cartItems, pravaPaymentSessions, pravaTransactions, shops } from "../db/index.js";
import { createPravaPaymentSession, createPravaTransaction, updatePravaTransaction, getPravaRemotePaymentResult } from "../services/prava.js";
import { hasSavedProductsOwner, listSavedProducts } from "../services/saved-products.js";
import { productSummarySelect } from "../db/product-select.js";
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
  type SessionKnowledge,
} from "./validation.js";

// Re-export validated types
export type { ProductCard, UIPayload, UIAction, StreamingEvent, ChatMessage, ChatState, SessionKnowledge } from "./validation.js";
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

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
    return "checkout";
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

function isBareConfirmation(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /^(confirm|confirmed|yes|yep|yeah|ok|okay|proceed|go ahead|do it|sounds good|let's do it|lets do it)$/.test(normalized);
}

function isCartCheckoutIntent(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /(checkout|check out|buy these|buy those|checkout my cart|check out my cart|checkout the cart|pay for the cart|continue to checkout|proceed to checkout|start checkout)/.test(normalized);
}

function buildSessionKnowledgeContext(sessionKnowledge?: SessionKnowledge | null): string {
  if (!sessionKnowledge) {
    return "";
  }

  const lines = [
    "SESSION KNOWLEDGE:",
    sessionKnowledge.lastMessage ? `- Last message: ${sessionKnowledge.lastMessage}` : null,
    sessionKnowledge.lastChatState ? `- Last chat state: ${sessionKnowledge.lastChatState}` : null,
    sessionKnowledge.lastAssistantIntent ? `- Last assistant intent: ${sessionKnowledge.lastAssistantIntent}` : null,
    sessionKnowledge.pendingConfirmation ? `- Pending confirmation: ${sessionKnowledge.pendingConfirmation}` : null,
    sessionKnowledge.purchaseIntentId ? `- Purchase intent ID: ${sessionKnowledge.purchaseIntentId}` : null,
    sessionKnowledge.paymentSessionId ? `- Payment session ID: ${sessionKnowledge.paymentSessionId}` : null,
    sessionKnowledge.approvalUrl ? `- Approval URL: ${sessionKnowledge.approvalUrl}` : null,
    sessionKnowledge.cartSummary ? `- Cart summary: ${sessionKnowledge.cartSummary.itemCount ?? 0} items, total ${sessionKnowledge.cartSummary.currency || "USD"} ${sessionKnowledge.cartSummary.totalPrice ?? 0}` : null,
    sessionKnowledge.savedSummary ? `- Saved summary: ${sessionKnowledge.savedSummary.itemCount ?? 0} items` : null,
    sessionKnowledge.lastProductIds?.length ? `- Last product IDs: ${sessionKnowledge.lastProductIds.join(", ")}` : null,
    "",
    "If the user sends a bare confirmation like 'confirm', 'yes', or 'proceed', resolve it against the pending confirmation in session knowledge.",
    "Do not ask for a user ID, session ID, or the specific item again if the session knowledge already identifies the active checkout or try-on flow.",
  ].filter(Boolean);

  return lines.join("\n");
}

// ==========================================================================
// Agent Tools
// ==========================================================================

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
      const productData = await db.select(productSummarySelect).from(products).where(inArray(products.id, productIds));
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
  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, args.productId)).limit(1);
  
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
  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, args.productId)).limit(1);
  
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
  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, args.productId)).limit(1);
  
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
async function preparePurchaseTool(args: { productId?: string; cartCheckout?: boolean; cartItemIds?: string[]; variantId?: string; quantity?: number; userId: string; sessionId?: string }) {
  const prepareFromCart = Boolean(args.cartCheckout || !args.productId);
  console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_start`, {
    userId: args.userId,
    sessionId: args.sessionId || null,
    cartCheckout: Boolean(args.cartCheckout || !args.productId),
    productId: args.productId || null,
    cartItemIdsCount: Array.isArray(args.cartItemIds) ? args.cartItemIds.length : 0,
    quantity: args.quantity || 1,
  });


  const buildGroupCheckout = async (items: Array<{ product: any; cartItemId?: string; quantity: number; variantId?: string | null }>) => {
    const grouped = new Map<string, Array<typeof items[number]>>();
    for (const item of items) {
      const merchantKey = item.product?.merchantName || item.product?.shopName || item.product?.shop || "Partner Store";
      const next = grouped.get(merchantKey) || [];
      next.push(item);
      grouped.set(merchantKey, next);
    }

    const merchantGroups = Array.from(grouped.entries()).map(([merchantName, groupItems]) => {
      const merchant = groupItems[0]?.product || {};
      const checkoutItems = groupItems.map((item) => {
        const product = item.product || {};
        const variant = item.variantId
          ? (product.variants || []).find((v: any) => v.id === item.variantId) || null
          : null;
        const itemPrice = variant?.price
          ? parseFloat(String(variant.price))
          : (product.minPrice ? parseFloat(String(product.minPrice)) : 0);
        return {
          description: product.title || "Item",
          unitPrice: String(itemPrice),
          quantity: item.quantity,
          productId: product.id,
          cartItemId: item.cartItemId || null,
          variantId: item.variantId || null,
        };
      });

      const total = Math.round(checkoutItems.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 1), 0) * 100) / 100;
      return {
        merchantName,
        merchantUrl: merchant.merchantUrl || merchant.url || "https://example.com",
        merchantCountry: "US",
        currency: "USD",
        totalAmount: total,
        items: checkoutItems,
      };
    });

    return merchantGroups;
  };

  if (prepareFromCart) {
    const cart = await resolveCart(args.userId, args.sessionId);
    if (!cart) {
      return { error: "Unable to resolve cart. Please provide userId or sessionId." };
    }

    const rows = await db
      .select({
        cartItemId: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        variantId: cartItems.variantId,
        product: productSummarySelect,
        merchantName: shops.name,
        merchantDomain: shops.domain,
        merchantUrl: shops.baseUrl,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .innerJoin(shops, eq(products.shop, shops.shopId))
      .where(eq(cartItems.cartId, cart.id));

    const cartItemIds = Array.isArray(args.cartItemIds) && args.cartItemIds.length > 0
      ? new Set(args.cartItemIds)
      : null;
    const selected = cartItemIds
      ? rows.filter((row) => cartItemIds.has(row.cartItemId))
      : rows;

    console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_cart_rows`, {
      cartId: cart.id,
      totalRows: rows.length,
      selectedRows: selected.length,
    });
    if (selected.length === 0) {
      return { error: "No cart items found for checkout" };
    }

    const merchantGroups = await buildGroupCheckout(selected.map((row) => ({
      ...row,
      product: {
        ...row.product,
        merchantName: row.merchantName,
        merchantDomain: row.merchantDomain,
      },
    })));
    console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_grouped`, {
      merchantGroups: merchantGroups.map((group) => ({ merchantName: group.merchantName, itemCount: group.items.length, totalAmount: group.totalAmount })),
      total: merchantGroups.reduce((sum, group) => sum + Number(group.totalAmount || 0), 0),
    });

    if (merchantGroups.length > 1) {
      return {
        cartCheckout: true,
        multiMerchant: true,
        merchantGroups,
        total: merchantGroups.reduce((sum, group) => sum + Number(group.totalAmount || 0), 0),
        currency: "USD",
        message: `Your cart contains ${selected.length} items across ${merchantGroups.length} merchants. Prava checkout must be created merchant by merchant, so I can prepare each merchant group in sequence.`,
      };
    }

    const group = merchantGroups[0];
    console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_create_session`, {
      merchantName: group.merchantName,
      itemCount: group.items.length,
      totalAmount: group.totalAmount,
      currency: group.currency,
    });

    const paymentSession = await createPravaPaymentSession(
      { userId: args.userId },
      {
        merchantName: group.merchantName,
        merchantUrl: group.merchantUrl,
        merchantCountry: group.merchantCountry,
        totalAmount: group.totalAmount,
        currency: group.currency,
        status: "awaiting_confirmation",
        metadata: {
          items: group.items,
          cartCheckout: true,
          merchantGroupCount: merchantGroups.length,
        },
      },
    );

    if (!paymentSession) {
      return { error: "Failed to create payment session" };
    }

    return {
      cartCheckout: true,
      purchaseIntentId: paymentSession.id,
      paymentSessionId: paymentSession.id,
      providerSessionId: paymentSession.providerSessionId || null,
      approvalUrl: paymentSession.approvalUrl || null,
      merchant: group.merchantName,
      merchantUrl: group.merchantUrl,
      itemPrice: 0,
      shipping: 0,
      taxes: 0,
      total: group.totalAmount,
      currency: group.currency,
      items: group.items,
      requiresConfirmation: true,
      message: `Cart checkout prepared for ${group.merchantName} with ${group.items.length} items. Confirm to proceed with Prava checkout.`,
    };
  }

  console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_single_product_start`, {
    productId: args.productId,
    variantId: args.variantId || null,
  });

  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, args.productId!)).limit(1);
  if (!product) {
    return { error: "Product not found" };
  }

  const cart = await resolveCart(args.userId, args.sessionId);
  if (cart) {
    const rows = await db
      .select({
        cartItemId: cartItems.id,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        variantId: cartItems.variantId,
        product: productSummarySelect,
        merchantName: shops.name,
        merchantDomain: shops.domain,
        merchantUrl: shops.baseUrl,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .innerJoin(shops, eq(products.shop, shops.shopId))
      .where(eq(cartItems.cartId, cart.id));

    const merchantRows = rows.filter((row) => row.product?.shop === product.shop);
    if (merchantRows.length > 1) {
      const merchantGroups = await buildGroupCheckout(merchantRows.map((row) => ({
        ...row,
        product: {
          ...row.product,
          merchantName: row.merchantName,
          merchantDomain: row.merchantDomain,
          merchantUrl: row.merchantUrl,
        },
      })));
      const group = merchantGroups[0];
      const paymentSession = await createPravaPaymentSession(
        { userId: args.userId },
        {
          merchantName: group.merchantName,
          merchantUrl: group.merchantUrl,
          merchantCountry: group.merchantCountry,
          totalAmount: group.totalAmount,
          currency: group.currency,
          status: "awaiting_confirmation",
          metadata: {
            items: group.items,
            cartCheckout: true,
            merchantGroupCount: merchantGroups.length,
            merchantCheckoutSource: "product_in_cart",
          },
        },
      );

      if (!paymentSession) {
        return { error: "Failed to create payment session" };
      }

      return {
        cartCheckout: true,
        purchaseIntentId: paymentSession.id,
        paymentSessionId: paymentSession.id,
        providerSessionId: paymentSession.providerSessionId || null,
        approvalUrl: paymentSession.approvalUrl || null,
        merchant: group.merchantName,
        merchantUrl: group.merchantUrl,
        itemPrice: 0,
        shipping: 0,
        taxes: 0,
        total: group.totalAmount,
        currency: group.currency,
        items: group.items,
        requiresConfirmation: true,
        message: `Cart checkout prepared for ${group.merchantName} with ${group.items.length} items. Confirm to proceed with Prava checkout.`,
      };
    }
  }

  let variant = null;
  if (args.variantId) {
    const [v] = await db.select().from(productVariants).where(
      and(eq(productVariants.id, args.variantId), eq(productVariants.productId, args.productId!))
    ).limit(1);
    variant = v;
  }

  const quantity = Math.max(1, Number(args.quantity || 1));
  const itemPrice = variant?.price
    ? parseFloat(String(variant.price))
    : (product.minPrice ? parseFloat(String(product.minPrice)) : 0);
  const shipping = 8.95;
  const taxes = Math.round(itemPrice * 0.08 * 100) / 100;
  const total = Math.round((itemPrice * quantity + shipping + taxes) * 100) / 100;
  console.log(`[CHAT_FLOW ${args.sessionId || "no-session"}] prepare_purchase_single_product_totals`, {
    productId: product.id,
    quantity,
    itemPrice,
    shipping,
    taxes,
    total,
  });


  const paymentSession = await createPravaPaymentSession(
    { userId: args.userId },
    {
      merchantName: product.shop || "Partner Store",
      merchantUrl: product.url || "https://example.com",
      merchantCountry: "US",
      totalAmount: total,
      currency: "USD",
      status: "awaiting_confirmation",
      metadata: {
        items: [{ description: product.title, unitPrice: String(itemPrice), quantity }],
        productId: product.id,
        productName: product.title,
        variantId: args.variantId || null,
        quantity,
        itemPrice,
        shipping,
        taxes,
      },
    },
  );

  if (!paymentSession) {
    return { error: "Failed to create payment session" };
  }

  return {
    purchaseIntentId: paymentSession.id,
    paymentSessionId: paymentSession.id,
    providerSessionId: paymentSession.providerSessionId || null,
    approvalUrl: paymentSession.approvalUrl || null,
    productId: product.id,
    productName: product.title,
    variant: variant ? `${variant.color || ""} ${variant.size || ""}`.trim() : "Standard",
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

  const [session] = await db.select().from(pravaPaymentSessions).where(eq(pravaPaymentSessions.id, args.purchaseIntentId)).limit(1);
  if (!session) {
    return { error: "Purchase intent not found" };
  }

  const [transaction] = await db.insert(pravaTransactions).values({
    userId: args.userId,
    paymentSessionId: session.id,
    merchantName: session.merchantName,
    merchantUrl: session.merchantUrl,
    merchantCountry: session.merchantCountry,
    amount: session.totalAmount,
    currency: session.currency || "USD",
    status: "pending_approval",
    approvalStatus: "pending",
    metadata: {
      purchaseIntentId: session.id,
      confirmationToken: args.confirmationToken,
    },
  }).returning();

  return {
    success: true,
    orderId: transaction.id,
    purchaseIntentId: session.id,
    status: "pending_approval",
    message: "Checkout initiated. Awaiting Prava approval...",
    approvalRequired: true,
  };
}

/**
  * Get purchase status
  */
async function getPurchaseStatusTool(args: { purchaseIntentId: string }) {
  const [session] = await db.select().from(pravaPaymentSessions).where(eq(pravaPaymentSessions.id, args.purchaseIntentId)).limit(1);
  if (!session) {
    return { purchaseIntentId: args.purchaseIntentId, status: "not_found", message: "Purchase intent not found." };
  }

  const [transaction] = await db.select().from(pravaTransactions).where(eq(pravaTransactions.paymentSessionId, session.id)).limit(1);
  const remoteSessionId = session.providerSessionId || session.id;
  let remote: any = null;

  try {
    remote = await getPravaRemotePaymentResult(remoteSessionId);
  } catch {
    remote = null;
  }

  const remoteStatus = remote?.status || session.status || transaction?.status || "pending";

  if (remoteStatus === "completed" && transaction) {
    await updatePravaTransaction({ userId: session.userId, sessionId: session.sessionId }, transaction.id, {
      status: "captured",
      approvalStatus: "approved",
      metadata: {
        ...(transaction.metadata || {}),
        remoteResult: remote,
      },
    });
  } else if (remoteStatus === "failed" && transaction) {
    await updatePravaTransaction({ userId: session.userId, sessionId: session.sessionId }, transaction.id, {
      status: "declined",
      approvalStatus: "declined",
      errorMessage: remote?.transactions?.[0]?.line_items?.[0]?.status || "Payment failed",
      metadata: {
        ...(transaction.metadata || {}),
        remoteResult: remote,
      },
    });
  }

  return {
    purchaseIntentId: args.purchaseIntentId,
    status: remoteStatus,
    message: remoteStatus === "completed"
      ? "Payment completed successfully."
      : remoteStatus === "failed"
        ? "Payment was declined."
        : "Payment status pending. Please check back shortly.",
    providerSessionId: session.providerSessionId || null,
    approvalUrl: session.approvalUrl || null,
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

  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, args.productId)).limit(1);
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
      const [product] = await db
        .select({
          ...productSummarySelect,
          merchantName: shops.name,
          merchantDomain: shops.domain,
          merchantUrl: shops.baseUrl,
        })
        .from(products)
        .innerJoin(shops, eq(products.shop, shops.shopId))
        .where(eq(products.id, item.productId))
        .limit(1);
      return {
        cartItemId: item.id,
        productId: item.productId,
        title: product?.title || 'Unknown Product',
        images: product?.images || [],
        minPrice: product?.minPrice ? parseFloat(String(product.minPrice)) : null,
        maxPrice: product?.maxPrice ? parseFloat(String(product.maxPrice)) : null,
        category: product?.category || null,
        url: product?.url || null,
        merchantName: product?.merchantName || null,
        merchantDomain: product?.merchantDomain || null,
        merchantUrl: product?.merchantUrl || null,
        shopId: product?.shopId || null,
        shop: product?.shop || null,
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

  const grouped = cartItemsWithProducts.reduce((acc: Record<string, any[]>, item) => {
    const key = item.merchantName || item.shop || "Partner Store";
    acc[key] = acc[key] || [];
    acc[key].push(item);
    return acc;
  }, {});

  const merchantGroups = Object.entries(grouped).map(([merchantName, groupItems]) => ({
    merchantName,
    totalItems: groupItems.reduce((sum, item: any) => sum + Number(item.quantity || 1), 0),
    totalPrice: Math.round(groupItems.reduce((sum, item: any) => sum + Number(item.minPrice || 0) * Number(item.quantity || 1), 0) * 100) / 100,
    items: groupItems,
  }));

  return { items: cartItemsWithProducts, merchantGroups, totalItems, totalPrice: Math.round(totalPrice * 100) / 100 };
}

/**
 * View the current saved products
 */
async function viewSavedProductsTool(args: { userId?: string; sessionId?: string }) {
  const owner = { userId: args.userId || null, sessionId: args.sessionId || null };
  if (!hasSavedProductsOwner(owner)) {
    return { items: [], totalItems: 0 };
  }

  const items = await listSavedProducts(owner);
  const saved = items.map((item) => ({
    savedId: item.savedId,
    productId: item.productId,
    title: item.product?.title || 'Unknown Product',
    images: item.product?.images || [],
    minPrice: item.product?.minPrice ? parseFloat(String(item.product.minPrice)) : null,
    maxPrice: item.product?.maxPrice ? parseFloat(String(item.product.maxPrice)) : null,
    category: item.product?.category || null,
    url: item.product?.url || null,
  }));

  return { items: saved, totalItems: saved.length };
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
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
      },
    },
    handler: getUserPreferencesTool,
  },
  {
    name: "set_user_preferences",
    description: "Save or update the user's shopping preferences.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        category: { type: "string", description: "Preferred category" },
        colors: { type: "array", items: { type: "string" }, description: "Preferred colors" },
        sizes: { type: "array", items: { type: "string" }, description: "Preferred sizes" },
        maxPrice: { type: "number", description: "Maximum budget" },
      },
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
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        confirmationToken: { type: "string", description: "Confirmation token from user accepting the suggestion" },
      },
      required: ["productId", "confirmationToken"],
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
        cartCheckout: { type: "boolean", description: "Set true to prepare checkout from the current cart instead of a single product" },
        cartItemIds: { type: "array", items: { type: "string" }, description: "Optional cart item IDs to checkout as a group" },
        variantId: { type: "string", description: "Optional variant ID" },
        quantity: { type: "number", description: "Quantity (default 1)" },
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
      },
      required: [],
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
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
      },
      required: ["purchaseIntentId", "confirmationToken"],
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
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
      },
      required: ["productId"],
    },
    handler: addToCartTool,
  },
  {
    name: "view_cart",
    description: "View the current contents of the shopping cart, including totals.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
      },
    },
    handler: viewCartTool,
  },
  {
    name: "view_saved_products",
    description: "View the current saved products or wishlist.",
    parameters: {
      type: "object",
      properties: {
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
      },
    },
    handler: viewSavedProductsTool,
  },
  {
    name: "update_cart_item",
    description: "Update the quantity of an item in the cart. Use quantity=0 to remove an item.",
    parameters: {
      type: "object",
      properties: {
        cartItemId: { type: "string", description: "The cart item ID to update" },
        quantity: { type: "number", description: "New quantity (0 to remove)" },
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
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
        userId: { type: "string", description: "Injected by the backend. Do not ask the user for this." },
        sessionId: { type: "string", description: "Optional session context if needed." },
      },
      required: ["cartItemId"],
    },
    handler: removeFromCartTool,
  },
];

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a helpful humorous clothing-shopping agent for OpenCommerceLens.
You have to reply users in a conversational and concise manner, guiding them through the shopping experience.
if they greet you,answer properly, greet them back with humour and ask how you can help.
Help users discover, compare, try on and purchase clothes from our curated collection.
Never ask the user for their user ID, login, or session ID. Identity is injected by the backend, and guest users should continue with the current session context.

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
1. If the user wants to checkout a single product, use prepare_purchase for that product and show the full purchase summary.
2. If the user wants to checkout their cart, always call view_cart first and inspect the merchant groups.
3. Never guess totals. Always use the backend totals from view_cart or prepare_purchase.
4. Present the merchant, items, and total clearly, then stop and wait for an explicit confirmation like "confirm" or "yes".
5. After confirmation, call prepare_purchase for exactly one merchant group at a time.
6. If the cart contains multiple merchants, do not combine them into one session. Process merchant groups sequentially: Merchant 1 of N, then Merchant 2 of N, and so on.
7. After prepare_purchase returns an approval URL, present it and keep the UI in checkout state.
8. After the user approves in Prava, call get_purchase_status to verify success.
9. Only mark the checkout as complete after get_purchase_status reports success for the current merchant group.

WORKFLOW FOR CART:
1. Use add_to_cart to add products to the cart.
2. Use view_cart to show the user what's in their cart, including totals and merchant groups.
3. Use update_cart_item to change quantities.
4. Use remove_from_cart to remove items.
5. After cart changes, use view_cart to show the updated cart.
6. If the user says "checkout my cart" or similar, call view_cart first and then prepare_purchase for the first merchant group in the cart.
7. If the cart has multiple merchants, explain clearly that checkout must be split by merchant and only one Prava session can be prepared at a time.
8. Continue with the next merchant group only after the previous merchant group has been approved and completed.
9. If the user asks what is saved, use view_saved_products.

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
  sessionKnowledge?: SessionKnowledge;
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
  const { sessionId, userId, message, imageUrl, conversationHistory = [], shoppingState, sessionKnowledge, onEvent } = options;

  console.log(`[CHAT_FLOW ${sessionId}] runAgentStream_start`, {
    messageLength: message?.length || 0,
    historyCount: conversationHistory.length,
    hasImage: !!imageUrl,
    hasShoppingState: !!shoppingState,
    hasSessionKnowledge: !!sessionKnowledge,
  });

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

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

  const sessionKnowledgePrompt = buildSessionKnowledgeContext(sessionKnowledge);
  if (sessionKnowledgePrompt) {
    messages.push({ role: "system", content: sessionKnowledgePrompt });
  }

  const normalizeContent = (value: unknown) => {
    if (typeof value === "string") {
      return value;
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value);
  };

  for (const msg of conversationHistory.slice(-10)) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: normalizeContent(msg.content) });
    } else if (msg.role === "assistant") {
      messages.push({ role: "assistant", content: normalizeContent(msg.content) });
    }
  }

  let userContent = message;
  if (sessionKnowledge?.pendingConfirmation && isBareConfirmation(message)) {
    userContent = `${message}\n\n[Session confirmation context: the user is confirming the current ${sessionKnowledge.pendingConfirmation} flow. Current purchase intent: ${sessionKnowledge.purchaseIntentId || "none"}. Pending confirmation: ${sessionKnowledge.pendingConfirmation}.]`;
  }
  if (imageUrl) {
    userContent = `${message}\n\n[User uploaded an image for visual search: ${imageUrl}]`;
  }
  messages.push({ role: "user", content: userContent });

  let assistantMessage = "";
  let toolResults: Array<{ role: "tool"; tool_call_id: string; content: string }> = [];
  let actions: UIAction[] = [];
  let uiPayload: UIPayload = DEFAULT_UI_PAYLOAD;
  let chatState: ChatState = DEFAULT_CHAT_STATE;
  const toolNamesUsed = new Set<string>();
  const toolDefs = TOOLS.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
  const emitChatState = (
    state: ChatState,
    reason?: string,
    meta: { hasProducts?: boolean; productCount?: number; requiresInput?: boolean } = {},
  ) => {
    chatState = state;
    onEvent(createChatStateEvent(state, reason, meta));
  };
  const pushToolMessage = (toolCallId: string, result: unknown) => {
    toolResults.push({
      role: "tool",
      tool_call_id: toolCallId,
      content: typeof result === "string" ? result : JSON.stringify(result),
    });
  };

  const confirmationIntent = sessionKnowledge?.pendingConfirmation === "checkout" && isBareConfirmation(message);
  const cartCheckoutIntent = isCartCheckoutIntent(message);

  if (confirmationIntent && (sessionKnowledge?.purchaseIntentId || sessionKnowledge?.paymentSessionId)) {
    const purchaseIntentId = sessionKnowledge.purchaseIntentId || sessionKnowledge.paymentSessionId || "";
    const confirmationToken = `confirm_${sessionId}_${Date.now()}`;

    console.log(`[CHAT_FLOW ${sessionId}] checkout_confirmation_shortcut`, {
      purchaseIntentId,
      pendingConfirmation: sessionKnowledge?.pendingConfirmation || "none",
    });

    onEvent({
      event: "tool_call",
      data: { name: "execute_prava_checkout", arguments: { purchaseIntentId, confirmationToken } },
    });
    const result = await executePravaCheckoutTool({
      purchaseIntentId,
      confirmationToken,
      userId,
    });
    toolNamesUsed.add("execute_prava_checkout");
    onEvent({
      event: "tool_result",
      data: { name: "execute_prava_checkout", result },
    });

    const checkoutResult: any = result;
    assistantMessage = checkoutResult.message || "Checkout initiated. Awaiting Prava approval...";
    if (checkoutResult.approvalUrl || checkoutResult.approvalRequired) {
      uiPayload = {
        type: "payment_pending",
        purchaseIntentId: checkoutResult.purchaseIntentId || checkoutResult.orderId || purchaseIntentId,
        approvalUrl: checkoutResult.approvalUrl || null,
        providerSessionId: checkoutResult.providerSessionId || null,
      };
      onEvent({ event: "ui_payload", data: uiPayload });
      emitChatState("checkout", "prava_approval_pending", { requiresInput: true });
    }

    onEvent({ event: "text", data: assistantMessage });
    messages.push({ role: "assistant", content: assistantMessage });
    const derivedState = deriveChatState(uiPayload, assistantMessage, toolNamesUsed);
    onEvent({
      event: "done",
      data: {
        reply: assistantMessage,
        uiPayload: safeValidateUIPayload(uiPayload),
        actions: actions.slice(0, 10),
        messages: messages as any,
        chatState: derivedState,
      },
    });
    return messages;
  }

  if (cartCheckoutIntent) {
    console.log(`[CHAT_FLOW ${sessionId}] checkout_cart_shortcut`, {
      pendingConfirmation: sessionKnowledge?.pendingConfirmation || "none",
      purchaseIntentId: sessionKnowledge?.purchaseIntentId || null,
      paymentSessionId: sessionKnowledge?.paymentSessionId || null,
    });

    onEvent({
      event: "tool_call",
      data: { name: "view_cart", arguments: { userId, sessionId } },
    });
    const cartResult = await viewCartTool({ userId, sessionId });
    toolNamesUsed.add("view_cart");
    onEvent({
      event: "tool_result",
      data: { name: "view_cart", result: cartResult },
    });

    if (!cartResult.items?.length || !cartResult.merchantGroups?.length) {
      assistantMessage = "Your cart is empty right now.";
      onEvent({ event: "text", data: assistantMessage });
      emitChatState("chat", "empty_cart", { requiresInput: true });
      const derivedState = deriveChatState(uiPayload, assistantMessage, toolNamesUsed);
      onEvent({
        event: "done",
        data: {
          reply: assistantMessage,
          uiPayload: safeValidateUIPayload(uiPayload),
          actions: actions.slice(0, 10),
          messages: messages as any,
          chatState: derivedState,
        },
      });
      return messages;
    }

    const firstGroup = cartResult.merchantGroups[0];
    const firstGroupCartItemIds = (firstGroup.items || []).map((item: any) => item.cartItemId).filter(Boolean);

    onEvent({
      event: "tool_call",
      data: {
        name: "prepare_purchase",
        arguments: { userId, sessionId, cartCheckout: true, cartItemIds: firstGroupCartItemIds },
      },
    });
    const purchaseResult = await preparePurchaseTool({
      userId,
      sessionId,
      cartCheckout: true,
      cartItemIds: firstGroupCartItemIds,
    });
    toolNamesUsed.add("prepare_purchase");
    onEvent({
      event: "tool_result",
      data: { name: "prepare_purchase", result: purchaseResult },
    });

    if (purchaseResult.multiMerchant) {
      assistantMessage = purchaseResult.message || `Your cart has ${cartResult.totalItems} items across multiple merchants.`;
      onEvent({ event: "text", data: assistantMessage });
      emitChatState("checkout", "cart_multi_merchant", { requiresInput: true });
      const derivedState = deriveChatState(uiPayload, assistantMessage, toolNamesUsed);
      onEvent({
        event: "done",
        data: {
          reply: assistantMessage,
          uiPayload: safeValidateUIPayload(uiPayload),
          actions: actions.slice(0, 10),
          messages: messages as any,
          chatState: derivedState,
        },
      });
      return messages;
    }

    if (purchaseResult.purchaseIntentId) {
      assistantMessage = purchaseResult.message || `Cart checkout prepared for ${purchaseResult.merchant || "your cart"}.`;
      uiPayload = {
        type: "confirm_purchase",
        purchase: {
          productId: purchaseResult.productId || "",
          variantId: (purchaseResult as any).variantId || "",
          productName: purchaseResult.productName || "",
          variant: purchaseResult.variant || "Standard",
          merchant: purchaseResult.merchant || "Partner Store",
          itemPrice: typeof purchaseResult.itemPrice === "number" ? purchaseResult.itemPrice : 0,
          shipping: typeof purchaseResult.shipping === "number" ? purchaseResult.shipping : 0,
          taxes: typeof purchaseResult.taxes === "number" ? purchaseResult.taxes : 0,
          total: typeof purchaseResult.total === "number" ? purchaseResult.total : 0,
          purchaseIntentId: purchaseResult.purchaseIntentId,
          paymentSessionId: purchaseResult.paymentSessionId || purchaseResult.purchaseIntentId,
          providerSessionId: purchaseResult.providerSessionId || undefined,
          approvalUrl: purchaseResult.approvalUrl || null,
          currency: purchaseResult.currency || "USD",
        },
      };
      onEvent({ event: "text", data: assistantMessage });
      onEvent({ event: "ui_payload", data: uiPayload });
      emitChatState("checkout", "purchase_prepared", { requiresInput: true });
      messages.push({ role: "assistant", content: assistantMessage });
      const derivedState = deriveChatState(uiPayload, assistantMessage, toolNamesUsed);
      onEvent({
        event: "done",
        data: {
          reply: assistantMessage,
          uiPayload: safeValidateUIPayload(uiPayload),
          actions: actions.slice(0, 10),
          messages: messages as any,
          chatState: derivedState,
        },
      });
      return messages;
    }
  }

  for (let turn = 0; turn < 8; turn++) {
    try {
      toolResults = [];
      console.log(`[CHAT_FLOW ${sessionId}] openai_turn_start`, { turn, messageCount: messages.length, toolCount: toolDefs.length });
      const response = await withTimeout(
        openai.chat.completions.create({
          model: OPENAI_MODEL,
          messages,
          tools: toolDefs,
          tool_choice: "auto",
        }),
        45000,
        `OpenAI turn ${turn + 1}`
      );
      console.log(`[CHAT_FLOW ${sessionId}] openai_turn_end`, { turn, hasChoice: !!response.choices?.[0] });

      const choice = response.choices[0];
      if (!choice.message) break;

      if (choice.message.content) {
        assistantMessage = choice.message.content;
        onEvent({ event: "text", data: choice.message.content });
      }

      const toolCalls = (choice.message as any).tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function?.name || toolCall.name;
          const args = JSON.parse(toolCall.function?.arguments || "{}");
          toolNamesUsed.add(toolName);

          onEvent({
            event: "tool_call",
            data: { name: toolName, arguments: args },
          });

          if (["get_user_preferences", "set_user_preferences", "initiate_try_on", "prepare_purchase", "execute_prava_checkout", "add_to_cart", "view_cart", "view_saved_products", "update_cart_item", "remove_from_cart"].includes(toolName)) {
            args.userId = userId;
          }
          if (["prepare_purchase", "view_cart", "execute_prava_checkout"].includes(toolName)) {
            args.sessionId = sessionId;
          }

          const tool = TOOLS.find((t) => t.name === toolName);
          if (tool) {
            try {
              console.log(`[CHAT_FLOW ${sessionId}] tool_start`, { turn, toolName });
              const result = await withTimeout(Promise.resolve(tool.handler(args)), 30000, `Tool ${toolName}`);
              console.log(`[CHAT_FLOW ${sessionId}] tool_end`, { turn, toolName });

              onEvent({
                event: "tool_result",
                data: { name: toolName, result },
              });

              if (toolName === "search_catalog" && result.products) {
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
              } else if (toolName === "prepare_purchase") {
                if (result.multiMerchant) {
                  assistantMessage = result.message || assistantMessage;
                } else if (result.purchaseIntentId) {
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
                    purchaseIntentId: result.purchaseIntentId || undefined,
                    paymentSessionId: result.paymentSessionId || result.purchaseIntentId || undefined,
                    providerSessionId: result.providerSessionId || undefined,
                    approvalUrl: result.approvalUrl || null,
                    currency: result.currency || "USD",
                  };
                  uiPayload = {
                    type: "confirm_purchase",
                    purchase,
                  };
                  onEvent({ event: "ui_payload", data: uiPayload });
                  emitChatState("checkout", "purchase_prepared", { requiresInput: true });
                }
              } else if (toolName === "execute_prava_checkout") {
                if (result.approvalUrl || result.approvalRequired) {
                  uiPayload = {
                    type: "payment_pending",
                    purchaseIntentId: result.purchaseIntentId || result.orderId || "",
                    approvalUrl: result.approvalUrl || null,
                    providerSessionId: result.providerSessionId || null,
                  };
                  onEvent({ event: "ui_payload", data: uiPayload });
                  emitChatState("checkout", "prava_approval_pending", { requiresInput: true });
                }
              }

              pushToolMessage(toolCall.id, result);
            } catch (error: any) {
              console.error(`Tool ${toolName} error:`, error);
              pushToolMessage(toolCall.id, { error: error.message });
            }
          } else {
            pushToolMessage(toolCall.id, { error: `Unknown tool: ${toolName}` });
          }
        }

        messages.push({
          role: "assistant",
          content: normalizeContent(choice.message.content),
          ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        } as OpenAI.Chat.ChatCompletionMessageParam);
        for (const result of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: result.tool_call_id,
            content: result.content,
          } as any);
        }
      } else {
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
























