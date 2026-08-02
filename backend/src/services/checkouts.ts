import { and, desc, eq, inArray } from "drizzle-orm";
import {
  cartItems,
  carts,
  checkouts,
  db,
  pravaPaymentSessions,
  pravaTransactions,
  type CheckoutItemSnapshot,
} from "../db/index.js";

export type CheckoutOwner = {
  userId?: string | null;
  sessionId?: string | null;
};

type RemotePaymentResult = {
  session_id?: string;
  order_id?: string;
  status?: string;
  transactions?: Array<{
    txn_id?: string;
    status?: string;
    line_items?: Array<Record<string, unknown>>;
  }>;
};

const TERMINAL_STATUSES = new Set(["paid", "failed", "expired", "cancelled"]);

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function ownerFilter(owner: CheckoutOwner) {
  if (owner.userId) return eq(checkouts.userId, owner.userId);
  if (owner.sessionId) return eq(checkouts.sessionId, owner.sessionId);
  return null;
}

async function removePaidCheckoutItems(owner: CheckoutOwner, items: CheckoutItemSnapshot[]) {
  const cartItemIds = [...new Set(items.map((item) => item.cartItemId).filter((id): id is string => Boolean(id)))];
  if (cartItemIds.length === 0) return;

  const cartOwnerFilter = owner.userId
    ? eq(carts.userId, owner.userId)
    : owner.sessionId
      ? eq(carts.sessionId, owner.sessionId)
      : null;
  if (!cartOwnerFilter) return;

  const ownedCarts = await db.select({ id: carts.id }).from(carts).where(cartOwnerFilter);
  const ownedCartIds = ownedCarts.map((cart) => cart.id);
  if (ownedCartIds.length === 0) return;

  await db.delete(cartItems).where(
    and(
      inArray(cartItems.id, cartItemIds),
      inArray(cartItems.cartId, ownedCartIds),
    ),
  );
}

function serializeCheckout(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    checkoutGroupId: row.checkoutGroupId,
    userId: row.userId,
    sessionId: row.sessionId,
    cartId: row.cartId,
    paymentSessionId: row.paymentSessionId,
    merchantName: row.merchantName,
    merchantUrl: row.merchantUrl,
    merchantCountry: row.merchantCountry,
    currency: row.currency,
    subtotal: toNumber(row.subtotal),
    shipping: toNumber(row.shipping),
    tax: toNumber(row.tax),
    total: toNumber(row.total),
    items: Array.isArray(row.items) ? row.items : [],
    status: row.status,
    providerSessionId: row.providerSessionId,
    providerOrderId: row.providerOrderId,
    approvedAt: row.approvedAt,
    completedAt: row.completedAt,
    failedAt: row.failedAt,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    metadata: row.metadata || {},
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function buildCheckoutItemSnapshots(rawItems: unknown): CheckoutItemSnapshot[] {
  if (!Array.isArray(rawItems)) return [];

  return rawItems.map((raw) => {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    return {
      productId: typeof item.productId === "string" ? item.productId : null,
      cartItemId: typeof item.cartItemId === "string" ? item.cartItemId : null,
      variantId: typeof item.variantId === "string" ? item.variantId : null,
      name: String(item.name || item.description || item.title || "Product"),
      image: typeof item.image === "string" ? item.image : null,
      variant: typeof item.variant === "string" ? item.variant : null,
      unitPrice: toNumber(item.unitPrice ?? item.unit_price ?? item.price),
      quantity: Math.max(1, Math.floor(toNumber(item.quantity, 1))),
    };
  });
}

export function sanitizePravaPaymentResult(remote: RemotePaymentResult | null | undefined) {
  if (!remote) return null;
  return {
    session_id: remote.session_id || null,
    order_id: remote.order_id || null,
    status: remote.status || "pending",
    transactions: Array.isArray(remote.transactions)
      ? remote.transactions.map((transaction) => ({
          txn_id: transaction.txn_id || null,
          status: transaction.status || null,
          line_items: Array.isArray(transaction.line_items)
            ? transaction.line_items.map((rawLineItem) => {
                const lineItem = rawLineItem || {};
                return {
                  txn_ref_id: typeof lineItem.txn_ref_id === "string" ? lineItem.txn_ref_id : null,
                  merchant_name: typeof lineItem.merchant_name === "string" ? lineItem.merchant_name : null,
                  merchant_url: typeof lineItem.merchant_url === "string" ? lineItem.merchant_url : null,
                  total_amount: typeof lineItem.total_amount === "string" ? lineItem.total_amount : null,
                  status: typeof lineItem.status === "string" ? lineItem.status : null,
                  products: Array.isArray(lineItem.products)
                    ? lineItem.products.map((rawProduct) => {
                        const product = rawProduct && typeof rawProduct === "object" ? rawProduct as Record<string, unknown> : {};
                        return {
                          product_ref_id: typeof product.product_ref_id === "string" ? product.product_ref_id : null,
                          external_product_id: typeof product.external_product_id === "string" ? product.external_product_id : null,
                          name: typeof product.name === "string" ? product.name : "Product",
                          unit_price: typeof product.unit_price === "string" ? product.unit_price : null,
                          quantity: toNumber(product.quantity, 1),
                        };
                      })
                    : [],
                };
              })
            : [],
        }))
      : [],
  };
}

export function mapPravaStatus(status: unknown): string {
  switch (String(status || "pending").toLowerCase()) {
    case "awaiting_result":
      return "approved";
    case "completed":
      return "paid";
    case "failed":
    case "declined":
      return "failed";
    case "expired":
      return "expired";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "pending":
    case "pending_approval":
      return "awaiting_approval";
    default:
      return "created";
  }
}

export async function createCheckoutForPaymentSession(
  owner: CheckoutOwner,
  paymentSession: any,
  metadata: Record<string, unknown> = {},
) {
  const items = buildCheckoutItemSnapshots(metadata.items);
  const shipping = toNumber(metadata.shipping);
  const tax = toNumber(metadata.tax ?? metadata.taxes);
  const total = toNumber(paymentSession.totalAmount);
  const itemSubtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const subtotal = itemSubtotal || Math.max(0, total - shipping - tax);
  const checkoutMetadata = {
    source: typeof metadata.source === "string" ? metadata.source : "prava_session",
    cartCheckout: Boolean(metadata.cartCheckout),
    merchantGroupCount: toNumber(metadata.merchantGroupCount, 1),
  };

  const values = {
    userId: owner.userId || null,
    sessionId: owner.sessionId || null,
    cartId: paymentSession.cartId || null,
    paymentSessionId: paymentSession.id,
    merchantName: paymentSession.merchantName,
    merchantUrl: paymentSession.merchantUrl,
    merchantCountry: paymentSession.merchantCountry,
    currency: paymentSession.currency || "USD",
    subtotal: String(subtotal),
    shipping: String(shipping),
    tax: String(tax),
    total: String(total),
    items,
    status: mapPravaStatus(paymentSession.status),
    providerSessionId: paymentSession.providerSessionId || null,
    providerOrderId: paymentSession.providerCheckoutId || null,
    metadata: checkoutMetadata,
    updatedAt: new Date(),
  };

  const [row] = await db.insert(checkouts)
    .values(values)
    .onConflictDoUpdate({
      target: checkouts.paymentSessionId,
      set: values,
    })
    .returning();

  return serializeCheckout(row);
}

export async function listCheckouts(owner: CheckoutOwner, options: { status?: string; limit?: number } = {}) {
  const filter = ownerFilter(owner);
  if (!filter) return [];
  const where = options.status ? and(filter, eq(checkouts.status, options.status)) : filter;
  const rows = await db.select()
    .from(checkouts)
    .where(where)
    .orderBy(desc(checkouts.createdAt))
    .limit(Math.min(Math.max(options.limit || 50, 1), 100));
  return rows.map(serializeCheckout);
}

export async function getCheckout(owner: CheckoutOwner, checkoutId: string) {
  const filter = ownerFilter(owner);
  if (!filter) return null;
  const [row] = await db.select()
    .from(checkouts)
    .where(and(filter, eq(checkouts.id, checkoutId)))
    .limit(1);
  return serializeCheckout(row);
}

export async function getCheckoutByPaymentSession(owner: CheckoutOwner, paymentSessionId: string) {
  const filter = ownerFilter(owner);
  if (!filter) return null;
  const [row] = await db.select()
    .from(checkouts)
    .where(and(filter, eq(checkouts.paymentSessionId, paymentSessionId)))
    .limit(1);
  return serializeCheckout(row);
}

export async function syncCheckoutStatus(
  owner: CheckoutOwner,
  checkoutId: string,
  loadRemoteResult: (providerSessionId: string) => Promise<RemotePaymentResult>,
) {
  const current = await getCheckout(owner, checkoutId);
  if (!current) return null;

  if (TERMINAL_STATUSES.has(current.status)) {
    if (current.status === "paid") {
      await removePaidCheckoutItems(owner, Array.isArray(current.items) ? current.items : []);
    }
    return { checkout: current, paymentResult: null };
  }

  const remoteSessionId = current.providerSessionId;
  if (!remoteSessionId) {
    return { checkout: current, paymentResult: null };
  }

  const remote = await loadRemoteResult(remoteSessionId);
  const paymentResult = sanitizePravaPaymentResult(remote);
  const status = mapPravaStatus(remote.status);
  const now = new Date();
  const firstTransaction = remote.transactions?.[0];
  const firstLineItem = firstTransaction?.line_items?.[0] || {};
  const failureMessage = status === "failed"
    ? String(firstLineItem.status || firstTransaction?.status || "Payment failed")
    : null;

  const [updated] = await db.update(checkouts)
    .set({
      status,
      providerOrderId: remote.order_id || current.providerOrderId || null,
      approvedAt: status === "approved" || status === "paid" ? current.approvedAt || now : current.approvedAt,
      completedAt: status === "paid" ? current.completedAt || now : current.completedAt,
      failedAt: status === "failed" ? current.failedAt || now : current.failedAt,
      failureCode: status === "failed" ? String(firstLineItem.status || "PAYMENT_FAILED") : null,
      failureMessage,
      updatedAt: now,
    })
    .where(eq(checkouts.id, checkoutId))
    .returning();

  await db.update(pravaPaymentSessions)
    .set({ status: String(remote.status || "pending"), updatedAt: now })
    .where(eq(pravaPaymentSessions.id, current.paymentSessionId));

  const transactionStatus = status === "paid"
    ? "captured"
    : status === "failed"
      ? "declined"
      : status === "approved"
        ? "authorized"
        : "pending_approval";
  await db.update(pravaTransactions)
    .set({
      status: transactionStatus,
      approvalStatus: status === "failed" ? "declined" : status === "approved" || status === "paid" ? "approved" : "pending",
      providerTransactionId: firstTransaction?.txn_id || null,
      errorCode: status === "failed" ? String(firstLineItem.status || "PAYMENT_FAILED") : null,
      errorMessage: failureMessage,
      updatedAt: now,
    })
    .where(eq(pravaTransactions.paymentSessionId, current.paymentSessionId));

  if (status === "paid") {
    await removePaidCheckoutItems(owner, Array.isArray(current.items) ? current.items : []);
  }

  return {
    checkout: serializeCheckout(updated),
    paymentResult,
  };
}
