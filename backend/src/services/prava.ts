import { and, desc, eq } from "drizzle-orm";
import { db, pravaConnections, pravaMandates, pravaPaymentSessions, pravaTransactions, users } from "../db/index.js";
import { createCheckoutForPaymentSession, sanitizePravaPaymentResult } from "./checkouts.js";

const PRAVA_BASE_URL = process.env.PRAVA_BASE_URL || "https://sandbox.api.prava.space";
const PRAVA_API_SECRET = process.env.PRAVA_API_SECRET;

export type PravaOwner = { userId?: string | null; sessionId?: string | null; email?: string | null };
export type PravaConnectionInput = { providerAccountId?: string | null; providerSubject?: string | null; email?: string | null; displayName?: string | null; metadata?: Record<string, unknown>; status?: string };
export type PravaPaymentSessionInput = { merchantName: string; merchantUrl: string; merchantCountry: string; totalAmount: number; currency: string; status?: string; approvalUrl?: string | null; providerSessionId?: string | null; providerCheckoutId?: string | null; cartId?: string | null; expiresAt?: Date | null; metadata?: Record<string, unknown> };
export type PravaMandateInput = { scope: "listed" | "any"; frequency: "one_time" | "weekly" | "monthly" | "yearly"; merchantName?: string | null; merchantUrl?: string | null; merchantCountry?: string | null; amount: number; currency: string; status?: string; approvalUrl?: string | null; providerMandateId?: string | null; validFrom?: Date | null; validUntil?: Date | null; metadata?: Record<string, unknown> };
export type PravaTransactionInput = { paymentSessionId?: string | null; mandateId?: string | null; merchantName: string; merchantUrl: string; merchantCountry: string; amount: number; currency: string; status?: string; providerTransactionId?: string | null; approvalStatus?: string | null; authorizationCode?: string | null; errorCode?: string | null; errorMessage?: string | null; metadata?: Record<string, unknown> };

export type PravaSessionContext = {
  userId?: string | null;
  email?: string | null;
  amount: string;
  currency: string;
  merchant: { name: string; url: string; countryCodeIso2: string };
  items: Array<{ description: string; unitPrice: string; quantity: number; productId?: string | null; cartItemId?: string | null; variantId?: string | null; name?: string | null }>;
  callbackUrl?: string | null;
};

export type PravaRemoteSession = {
  session_id: string;
  session_token: string;
  iframe_url: string;
  expires_at?: string;
  order_id?: string;
};

export type PravaPaymentResult = {
  session_id: string;
  order_id?: string;
  status: "pending" | "awaiting_result" | "completed" | "failed" | string;
  transactions?: Array<{
    txn_id?: string;
    status?: string;
    line_items?: Array<{
      txn_ref_id?: string;
      merchant_name?: string;
      merchant_url?: string;
      total_amount?: string;
      status?: string;
      token?: string;
      dynamic_cvv?: string;
      expiry_month?: string;
      expiry_year?: string;
      products?: Array<{ product_ref_id?: string; external_product_id?: string | null; name?: string; unit_price?: string; quantity?: number }>;
    }>;
  }>;
};

function hasOwner(owner: PravaOwner) { return Boolean(owner.userId || owner.sessionId); }
function toNumber(value: string | number | null | undefined) { if (value === null || value === undefined) return null; return typeof value === "number" ? value : Number(value); }
function sanitizePaymentSessionMetadata(value: unknown) {
  if (!value || typeof value !== "object") return {};
  const { sessionToken: _sessionToken, remoteSession: _remoteSession, ...safe } = value as Record<string, unknown>;
  return safe;
}
function ownerFilter(owner: PravaOwner) { if (owner.userId) return eq(pravaPaymentSessions.userId, owner.userId); if (owner.sessionId) return eq(pravaPaymentSessions.sessionId, owner.sessionId); return null; }
function mandateFilter(owner: PravaOwner) { if (owner.userId) return eq(pravaMandates.userId, owner.userId); if (owner.sessionId) return eq(pravaMandates.sessionId, owner.sessionId); return null; }
function transactionFilter(owner: PravaOwner) { if (owner.userId) return eq(pravaTransactions.userId, owner.userId); if (owner.sessionId) return eq(pravaTransactions.sessionId, owner.sessionId); return null; }
function connectionFilter(owner: PravaOwner) { if (owner.userId) return eq(pravaConnections.userId, owner.userId); if (owner.sessionId) return eq(pravaConnections.sessionId, owner.sessionId); return null; }

async function resolvePravaOwnerEmail(owner: PravaOwner) {
  if (owner.email) return owner.email;
  if (!owner.userId) return null;
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, owner.userId)).limit(1);
  return row?.email || null;
}

function serializeConnection(row: any) { return row ? { id: row.id, userId: row.userId, sessionId: row.sessionId, provider: row.provider, providerAccountId: row.providerAccountId, providerSubject: row.providerSubject, email: row.email, displayName: row.displayName, status: row.status, metadata: row.metadata || {}, linkedAt: row.linkedAt, createdAt: row.createdAt, updatedAt: row.updatedAt } : null; }
function serializePaymentSession(row: any) { return row ? { id: row.id, userId: row.userId, sessionId: row.sessionId, cartId: row.cartId, merchantName: row.merchantName, merchantUrl: row.merchantUrl, merchantCountry: row.merchantCountry, totalAmount: toNumber(row.totalAmount), currency: row.currency, status: row.status, approvalUrl: row.approvalUrl, providerSessionId: row.providerSessionId, providerCheckoutId: row.providerCheckoutId, expiresAt: row.expiresAt, metadata: sanitizePaymentSessionMetadata(row.metadata), createdAt: row.createdAt, updatedAt: row.updatedAt } : null; }
function serializeMandate(row: any) { return row ? { id: row.id, userId: row.userId, sessionId: row.sessionId, scope: row.scope, frequency: row.frequency, merchantName: row.merchantName, merchantUrl: row.merchantUrl, merchantCountry: row.merchantCountry, amount: toNumber(row.amount), currency: row.currency, status: row.status, approvalUrl: row.approvalUrl, providerMandateId: row.providerMandateId, validFrom: row.validFrom, validUntil: row.validUntil, metadata: row.metadata || {}, createdAt: row.createdAt, updatedAt: row.updatedAt } : null; }
function serializeTransaction(row: any) { return row ? { id: row.id, userId: row.userId, sessionId: row.sessionId, paymentSessionId: row.paymentSessionId, mandateId: row.mandateId, merchantName: row.merchantName, merchantUrl: row.merchantUrl, merchantCountry: row.merchantCountry, amount: toNumber(row.amount), currency: row.currency, status: row.status, providerTransactionId: row.providerTransactionId, approvalStatus: row.approvalStatus, authorizationCode: row.authorizationCode, errorCode: row.errorCode, errorMessage: row.errorMessage, metadata: row.metadata || {}, createdAt: row.createdAt, updatedAt: row.updatedAt } : null; }

async function pravaRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!PRAVA_API_SECRET) {
    throw new Error("PRAVA_API_SECRET is required");
  }

  const doRequest = async () => {
    const response = await fetch(`${PRAVA_BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${PRAVA_API_SECRET}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });

    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const error = new Error(typeof payload === "string" ? payload : payload?.message || `Prava API request failed (${response.status})`);
      (error as any).status = response.status;
      (error as any).payload = payload;
      throw error;
    }

    return payload as T;
  };

  try {
    return await doRequest();
  } catch (error: any) {
    const status = Number(error?.status || 0);
    if (status >= 500 && status < 600) {
      return await doRequest();
    }
    throw error;
  }
}

export function hasPravaOwner(owner: PravaOwner) { return hasOwner(owner); }

export async function createPravaRemoteSession(input: PravaSessionContext) {
  console.log(`[PRAVA] createPravaRemoteSession_start`, {
    userId: input.userId || null,
    email: input.email || null,
    merchantName: input.merchant.name,
    currency: input.currency,
    totalAmount: input.amount,
    itemCount: input.items.length,
    items: input.items.map((item) => ({
      productId: item.productId || null,
      cartItemId: item.cartItemId || null,
      variantId: item.variantId || null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  });

  return pravaRequest<PravaRemoteSession>("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({
      user_id: input.userId || undefined,
      user_email: input.email || undefined,
      total_amount: input.amount,
      currency: input.currency,
      purchase_context: [
        {
          merchant_details: {
            name: input.merchant.name,
            url: input.merchant.url,
            country_code_iso2: input.merchant.countryCodeIso2,
          },
          product_details: input.items.map((item) => ({
            description: item.description,
            name: item.name || item.description,
            unit_price: item.unitPrice,
            quantity: item.quantity,
            external_product_id: item.productId || item.cartItemId || undefined,
            product_ref_id: item.variantId || undefined,
          })),
        },
      ],
    }),
  });
}

export async function getPravaRemotePaymentResult(sessionId: string) {
  return pravaRequest<PravaPaymentResult>(`/v1/sessions/${sessionId}/payment-result`, { method: "GET" });
}



export async function getPravaConnection(owner: PravaOwner) { const filter = connectionFilter(owner); if (!filter) return null; const [row] = await db.select().from(pravaConnections).where(filter).orderBy(desc(pravaConnections.createdAt)).limit(1); return serializeConnection(row); }
export async function upsertPravaConnection(owner: PravaOwner, input: PravaConnectionInput) { if (!hasOwner(owner)) throw new Error("Missing Prava owner"); const existing = await getPravaConnection(owner); if (existing) { const [updated] = await db.update(pravaConnections).set({ providerAccountId: input.providerAccountId ?? existing.providerAccountId ?? null, providerSubject: input.providerSubject ?? existing.providerSubject ?? null, email: input.email ?? existing.email ?? null, displayName: input.displayName ?? existing.displayName ?? null, status: input.status ?? existing.status ?? "linked", metadata: { ...(existing.metadata || {}), ...(input.metadata || {}) }, updatedAt: new Date() }).where(connectionFilter(owner)!).returning(); return serializeConnection(updated); } const [created] = await db.insert(pravaConnections).values({ userId: owner.userId || null, sessionId: owner.sessionId || null, providerAccountId: input.providerAccountId || null, providerSubject: input.providerSubject || null, email: input.email || null, displayName: input.displayName || null, status: input.status || "linked", metadata: input.metadata || {} }).returning(); return serializeConnection(created); }
export async function deletePravaConnection(owner: PravaOwner) { const filter = connectionFilter(owner); if (!filter) return false; const existing = await getPravaConnection(owner); if (!existing) return false; await db.delete(pravaConnections).where(filter); return true; }

export async function listPravaPaymentSessions(owner: PravaOwner) { const filter = ownerFilter(owner); if (!filter) return []; const rows = await db.select().from(pravaPaymentSessions).where(filter).orderBy(desc(pravaPaymentSessions.createdAt)); return rows.map(serializePaymentSession); }
export async function getPravaPaymentSession(owner: PravaOwner, id: string) { const filter = ownerFilter(owner); if (!filter) return null; const [row] = await db.select().from(pravaPaymentSessions).where(and(filter, eq(pravaPaymentSessions.id, id))).limit(1); return serializePaymentSession(row); }
export async function createPravaPaymentSession(owner: PravaOwner, input: PravaPaymentSessionInput) {
  if (!hasOwner(owner)) throw new Error("Missing Prava owner");

  const ownerEmail = await resolvePravaOwnerEmail(owner);
  const remote = await createPravaRemoteSession({
    userId: owner.userId || null,
    email: ownerEmail,
    amount: String(input.totalAmount),
    currency: input.currency,
    merchant: {
      name: input.merchantName,
      url: input.merchantUrl,
      countryCodeIso2: input.merchantCountry,
    },
    items: Array.isArray(input.metadata?.items) ? input.metadata.items as any[] : [],
  }).catch((error) => {
    console.warn("Prava remote session create failed, falling back to local record:", error);
    return null;
  });

  const [created] = await db.insert(pravaPaymentSessions).values({
    userId: owner.userId || null,
    sessionId: owner.sessionId || null,
    cartId: input.cartId || null,
    merchantName: input.merchantName,
    merchantUrl: input.merchantUrl,
    merchantCountry: input.merchantCountry,
    totalAmount: String(input.totalAmount),
    currency: input.currency,
    status: remote ? "pending_approval" : (input.status || "draft"),
    approvalUrl: remote?.iframe_url ?? input.approvalUrl ?? null,
    providerSessionId: remote?.session_id ?? input.providerSessionId ?? null,
    providerCheckoutId: remote?.order_id ?? input.providerCheckoutId ?? null,
    expiresAt: remote?.expires_at ? new Date(remote.expires_at) : input.expiresAt ?? null,
    metadata: {
      ...(input.metadata || {}),
      ...(remote ? { sessionToken: remote.session_token, iframeUrl: remote.iframe_url, remoteSession: remote } : {}),
    },
  }).returning();

  const checkout = await createCheckoutForPaymentSession(owner, created, input.metadata || {});
  return { ...serializePaymentSession(created), checkoutId: checkout?.id || null };
}
export async function updatePravaPaymentSession(owner: PravaOwner, id: string, patch: Partial<PravaPaymentSessionInput>) { const existing = await getPravaPaymentSession(owner, id); if (!existing) return null; const [updated] = await db.update(pravaPaymentSessions).set({ merchantName: patch.merchantName ?? existing.merchantName, merchantUrl: patch.merchantUrl ?? existing.merchantUrl, merchantCountry: patch.merchantCountry ?? existing.merchantCountry, totalAmount: patch.totalAmount !== undefined ? String(patch.totalAmount) : String(existing.totalAmount ?? 0), currency: patch.currency ?? existing.currency, status: patch.status ?? existing.status, approvalUrl: patch.approvalUrl ?? existing.approvalUrl ?? null, providerSessionId: patch.providerSessionId ?? existing.providerSessionId ?? null, providerCheckoutId: patch.providerCheckoutId ?? existing.providerCheckoutId ?? null, expiresAt: patch.expiresAt ?? existing.expiresAt ?? null, metadata: { ...(existing.metadata || {}), ...(patch.metadata || {}) }, updatedAt: new Date() }).where(eq(pravaPaymentSessions.id, id)).returning(); return serializePaymentSession(updated); }

export async function listPravaMandates(owner: PravaOwner) { const filter = mandateFilter(owner); if (!filter) return []; const rows = await db.select().from(pravaMandates).where(filter).orderBy(desc(pravaMandates.createdAt)); return rows.map(serializeMandate); }
export async function getPravaMandate(owner: PravaOwner, id: string) { const filter = mandateFilter(owner); if (!filter) return null; const [row] = await db.select().from(pravaMandates).where(and(filter, eq(pravaMandates.id, id))).limit(1); return serializeMandate(row); }
export async function createPravaMandate(owner: PravaOwner, input: PravaMandateInput) { if (!hasOwner(owner)) throw new Error("Missing Prava owner"); const [created] = await db.insert(pravaMandates).values({ userId: owner.userId || null, sessionId: owner.sessionId || null, scope: input.scope, frequency: input.frequency, merchantName: input.merchantName || null, merchantUrl: input.merchantUrl || null, merchantCountry: input.merchantCountry || null, amount: String(input.amount), currency: input.currency, status: input.status || "pending", approvalUrl: input.approvalUrl ?? null, providerMandateId: input.providerMandateId ?? null, validFrom: input.validFrom ?? new Date(), validUntil: input.validUntil ?? null, metadata: input.metadata || {} }).returning(); return serializeMandate(created); }
export async function updatePravaMandate(owner: PravaOwner, id: string, patch: Partial<PravaMandateInput>) { const existing = await getPravaMandate(owner, id); if (!existing) return null; const [updated] = await db.update(pravaMandates).set({ scope: patch.scope ?? existing.scope, frequency: patch.frequency ?? existing.frequency, merchantName: patch.merchantName ?? existing.merchantName ?? null, merchantUrl: patch.merchantUrl ?? existing.merchantUrl ?? null, merchantCountry: patch.merchantCountry ?? existing.merchantCountry ?? null, amount: patch.amount !== undefined ? String(patch.amount) : String(existing.amount ?? 0), currency: patch.currency ?? existing.currency, status: patch.status ?? existing.status, approvalUrl: patch.approvalUrl ?? existing.approvalUrl ?? null, providerMandateId: patch.providerMandateId ?? existing.providerMandateId ?? null, validFrom: patch.validFrom ?? existing.validFrom ?? new Date(), validUntil: patch.validUntil ?? existing.validUntil ?? null, metadata: { ...(existing.metadata || {}), ...(patch.metadata || {}) }, updatedAt: new Date() }).where(eq(pravaMandates.id, id)).returning(); return serializeMandate(updated); }

export async function listPravaTransactions(owner: PravaOwner) { const filter = transactionFilter(owner); if (!filter) return []; const rows = await db.select().from(pravaTransactions).where(filter).orderBy(desc(pravaTransactions.createdAt)); return rows.map(serializeTransaction); }
export async function getPravaTransaction(owner: PravaOwner, id: string) { const filter = transactionFilter(owner); if (!filter) return null; const [row] = await db.select().from(pravaTransactions).where(and(filter, eq(pravaTransactions.id, id))).limit(1); return serializeTransaction(row); }
export async function createPravaTransaction(owner: PravaOwner, input: PravaTransactionInput) { if (!hasOwner(owner)) throw new Error("Missing Prava owner"); const [created] = await db.insert(pravaTransactions).values({ userId: owner.userId || null, sessionId: owner.sessionId || null, paymentSessionId: input.paymentSessionId || null, mandateId: input.mandateId || null, merchantName: input.merchantName, merchantUrl: input.merchantUrl, merchantCountry: input.merchantCountry, amount: String(input.amount), currency: input.currency, status: input.status || "pending", providerTransactionId: input.providerTransactionId ?? null, approvalStatus: input.approvalStatus ?? null, authorizationCode: input.authorizationCode ?? null, errorCode: input.errorCode ?? null, errorMessage: input.errorMessage ?? null, metadata: input.metadata || {} }).returning(); return serializeTransaction(created); }
export async function updatePravaTransaction(owner: PravaOwner, id: string, patch: Partial<PravaTransactionInput> & { status?: string }) { const existing = await getPravaTransaction(owner, id); if (!existing) return null; const [updated] = await db.update(pravaTransactions).set({ paymentSessionId: patch.paymentSessionId ?? existing.paymentSessionId ?? null, mandateId: patch.mandateId ?? existing.mandateId ?? null, merchantName: patch.merchantName ?? existing.merchantName, merchantUrl: patch.merchantUrl ?? existing.merchantUrl, merchantCountry: patch.merchantCountry ?? existing.merchantCountry, amount: patch.amount !== undefined ? String(patch.amount) : String(existing.amount ?? 0), currency: patch.currency ?? existing.currency, status: patch.status ?? existing.status, providerTransactionId: patch.providerTransactionId ?? existing.providerTransactionId ?? null, approvalStatus: patch.approvalStatus ?? existing.approvalStatus ?? null, authorizationCode: patch.authorizationCode ?? existing.authorizationCode ?? null, errorCode: patch.errorCode ?? existing.errorCode ?? null, errorMessage: patch.errorMessage ?? existing.errorMessage ?? null, metadata: { ...(existing.metadata || {}), ...(patch.metadata || {}) }, updatedAt: new Date() }).where(eq(pravaTransactions.id, id)).returning(); return serializeTransaction(updated); }

export async function getPravaPaymentResult(owner: PravaOwner, paymentSessionId: string) {
  const local = await getPravaPaymentSession(owner, paymentSessionId);
  if (!local) return null;

  const remoteSessionId = local.providerSessionId || paymentSessionId;
  try {
    const remote = await getPravaRemotePaymentResult(remoteSessionId);
    return { local, remote: sanitizePravaPaymentResult(remote) };
  } catch (error) {
    return {
      local,
      remoteError: error instanceof Error ? error.message : "Failed to fetch remote payment result",
    };
  }
}

export async function reportPravaRemoteStatus(owner: PravaOwner, paymentSessionId: string, txnRefId: string, status: "APPROVED" | "DECLINED") {
  const local = await getPravaPaymentSession(owner, paymentSessionId);
  if (!local) {
    throw new Error("Payment session not found");
  }

  const remoteSessionId = local.providerSessionId || paymentSessionId;
  return pravaRequest(`/v1/sessions/${remoteSessionId}/report-status`, {
    method: "POST",
    body: JSON.stringify({ txn_ref_id: txnRefId, txn_status: status }),
  });
}

export async function getPravaPaymentStatus(owner: PravaOwner) {
  const [connection, sessions, mandates, transactions] = await Promise.all([
    getPravaConnection(owner),
    listPravaPaymentSessions(owner),
    listPravaMandates(owner),
    listPravaTransactions(owner),
  ]);

  return {
    connection,
    counts: {
      sessions: sessions.length,
      mandates: mandates.length,
      transactions: transactions.length,
    },
    sessions,
    mandates,
    transactions,
  };
}






