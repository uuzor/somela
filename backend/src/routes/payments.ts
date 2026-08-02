import { Router } from "express";
import { z } from "zod";
import { defaultRateLimit } from "../middleware/rateLimit.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";
import {
  createPravaMandate,
  createPravaPaymentSession,
  createPravaTransaction,
  deletePravaConnection,
  getPravaConnection,
  getPravaMandate,
  getPravaPaymentResult,
  getPravaPaymentSession,
  getPravaPaymentStatus,
  getPravaTransaction,
  hasPravaOwner,
  listPravaMandates,
  listPravaPaymentSessions,
  listPravaTransactions,
  reportPravaRemoteStatus,
  upsertPravaConnection,
} from "../services/prava.js";
import { getCheckoutByPaymentSession, syncCheckoutStatus } from "../services/checkouts.js";

export const paymentsRouter = Router();
paymentsRouter.use(defaultRateLimit);

const LinkSchema = z.object({
  providerAccountId: z.string().optional(),
  providerSubject: z.string().optional(),
  email: z.string().email().optional(),
  displayName: z.string().optional(),
  status: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const PaymentSessionCreateSchema = z.object({
  merchantName: z.string().min(1),
  merchantUrl: z.string().url(),
  merchantCountry: z.string().length(2),
  totalAmount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  status: z.string().optional(),
  approvalUrl: z.string().url().optional(),
  providerSessionId: z.string().optional(),
  providerCheckoutId: z.string().optional(),
  cartId: z.string().optional(),
  sessionId: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const MandateCreateSchema = z.object({
  scope: z.enum(["listed", "any"]),
  frequency: z.enum(["one_time", "weekly", "monthly", "yearly"]),
  merchantName: z.string().optional(),
  merchantUrl: z.string().url().optional(),
  merchantCountry: z.string().length(2).optional(),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  status: z.string().optional(),
  approvalUrl: z.string().url().optional(),
  providerMandateId: z.string().optional(),
  sessionId: z.string().optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  metadata: z.record(z.any()).optional(),
});

const ReportStatusSchema = z.object({
  txnRefId: z.string().min(1),
  status: z.enum(["APPROVED", "DECLINED"]),
});
const TransactionCreateSchema = z.object({
  paymentSessionId: z.string().optional(),
  mandateId: z.string().optional(),
  merchantName: z.string().min(1),
  merchantUrl: z.string().url(),
  merchantCountry: z.string().length(2),
  amount: z.number().positive(),
  currency: z.string().length(3).default("USD"),
  status: z.string().optional(),
  providerTransactionId: z.string().optional(),
  approvalStatus: z.string().optional(),
  authorizationCode: z.string().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

function requireOwner(identity: Awaited<ReturnType<typeof resolveRequestIdentity>>) {
  return hasPravaOwner({ userId: identity.userId, sessionId: identity.sessionId });
}

paymentsRouter.get("/prava/status", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) {
      return res.json({ connection: null, counts: { sessions: 0, mandates: 0, transactions: 0 }, sessions: [], mandates: [], transactions: [] });
    }
    return res.json(await getPravaPaymentStatus({ userId: identity.userId, sessionId: identity.sessionId }));
  } catch (error) {
    console.error("Prava status error:", error);
    res.status(500).json({ error: "Failed to load Prava payment status" });
  }
});

paymentsRouter.get("/prava/connection", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.json({ connection: null });
    return res.json({ connection: await getPravaConnection({ userId: identity.userId, sessionId: identity.sessionId }) });
  } catch (error) {
    console.error("Prava connection fetch error:", error);
    res.status(500).json({ error: "Failed to fetch Prava connection" });
  }
});

paymentsRouter.post("/prava/link", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!identity.userId) return res.status(401).json({ error: "Authentication required to link Prava" });
    const body = LinkSchema.parse(req.body);
    return res.status(201).json({ connection: await upsertPravaConnection({ userId: identity.userId, sessionId: identity.sessionId }, body) });
  } catch (error) {
    console.error("Prava link error:", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.errors });
    res.status(500).json({ error: "Failed to link Prava account" });
  }
});

paymentsRouter.delete("/prava/link", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!identity.userId && !identity.sessionId) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const removed = await deletePravaConnection({ userId: identity.userId, sessionId: identity.sessionId });
    if (!removed) return res.status(404).json({ error: "Prava connection not found" });
    return res.status(204).send();
  } catch (error) {
    console.error("Prava unlink error:", error);
    res.status(500).json({ error: "Failed to unlink Prava account" });
  }
});

paymentsRouter.get("/prava/sessions", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.json({ sessions: [] });
    return res.json({ sessions: await listPravaPaymentSessions({ userId: identity.userId, sessionId: identity.sessionId }) });
  } catch (error) {
    console.error("Prava payment sessions fetch error:", error);
    res.status(500).json({ error: "Failed to fetch payment sessions" });
  }
});

paymentsRouter.post("/prava/sessions", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const body = PaymentSessionCreateSchema.parse(req.body);
    const session = await createPravaPaymentSession({ userId: identity.userId, sessionId: body.sessionId || identity.sessionId }, {
      merchantName: body.merchantName,
      merchantUrl: body.merchantUrl,
      merchantCountry: body.merchantCountry,
      totalAmount: body.totalAmount,
      currency: body.currency,
      status: body.status,
      approvalUrl: body.approvalUrl,
      providerSessionId: body.providerSessionId,
      providerCheckoutId: body.providerCheckoutId,
      cartId: body.cartId,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      metadata: body.metadata,
    });
    return res.status(201).json({ paymentSession: session });
  } catch (error) {
    console.error("Prava payment session create error:", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.errors });
    res.status(500).json({ error: "Failed to create payment session" });
  }
});

paymentsRouter.get("/prava/sessions/:sessionId", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const session = await getPravaPaymentSession({ userId: identity.userId, sessionId: identity.sessionId }, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Payment session not found" });
    return res.json({ paymentSession: session });
  } catch (error) {
    console.error("Prava payment session fetch error:", error);
    res.status(500).json({ error: "Failed to fetch payment session" });
  }
});

paymentsRouter.get("/prava/mandates", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.json({ mandates: [] });
    return res.json({ mandates: await listPravaMandates({ userId: identity.userId, sessionId: identity.sessionId }) });
  } catch (error) {
    console.error("Prava mandates fetch error:", error);
    res.status(500).json({ error: "Failed to fetch mandates" });
  }
});

paymentsRouter.post("/prava/mandates", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const body = MandateCreateSchema.parse(req.body);
    const mandate = await createPravaMandate({ userId: identity.userId, sessionId: body.sessionId || identity.sessionId }, {
      scope: body.scope,
      frequency: body.frequency,
      merchantName: body.merchantName,
      merchantUrl: body.merchantUrl,
      merchantCountry: body.merchantCountry,
      amount: body.amount,
      currency: body.currency,
      status: body.status,
      approvalUrl: body.approvalUrl,
      providerMandateId: body.providerMandateId,
      validFrom: body.validFrom ? new Date(body.validFrom) : undefined,
      validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
      metadata: body.metadata,
    });
    return res.status(201).json({ mandate });
  } catch (error) {
    console.error("Prava mandate create error:", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.errors });
    res.status(500).json({ error: "Failed to create mandate" });
  }
});

paymentsRouter.get("/prava/mandates/:mandateId", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const mandate = await getPravaMandate({ userId: identity.userId, sessionId: identity.sessionId }, req.params.mandateId);
    if (!mandate) return res.status(404).json({ error: "Mandate not found" });
    return res.json({ mandate });
  } catch (error) {
    console.error("Prava mandate fetch error:", error);
    res.status(500).json({ error: "Failed to fetch mandate" });
  }
});

paymentsRouter.get("/prava/transactions", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.json({ transactions: [] });
    return res.json({ transactions: await listPravaTransactions({ userId: identity.userId, sessionId: identity.sessionId }) });
  } catch (error) {
    console.error("Prava transactions fetch error:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

paymentsRouter.post("/prava/transactions", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const body = TransactionCreateSchema.parse(req.body);
    const transaction = await createPravaTransaction({ userId: identity.userId, sessionId: body.sessionId || identity.sessionId }, {
      paymentSessionId: body.paymentSessionId,
      mandateId: body.mandateId,
      merchantName: body.merchantName,
      merchantUrl: body.merchantUrl,
      merchantCountry: body.merchantCountry,
      amount: body.amount,
      currency: body.currency,
      status: body.status,
      providerTransactionId: body.providerTransactionId,
      approvalStatus: body.approvalStatus,
      authorizationCode: body.authorizationCode,
      errorCode: body.errorCode,
      errorMessage: body.errorMessage,
      metadata: body.metadata,
    });
    return res.status(201).json({ transaction });
  } catch (error) {
    console.error("Prava transaction create error:", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.errors });
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

paymentsRouter.get("/prava/sessions/:sessionId/result", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const owner = { userId: identity.userId, sessionId: identity.sessionId };
    const result = await getPravaPaymentResult(owner, req.params.sessionId);
    if (!result) return res.status(404).json({ error: "Payment session not found" });
    const checkout = await getCheckoutByPaymentSession(owner, req.params.sessionId);
    if (!checkout || !result.remote) return res.json(result);
    const synced = await syncCheckoutStatus(owner, checkout.id, async () => result.remote as any);
    return res.json({ ...result, checkout: synced?.checkout || checkout });
  } catch (error) {
    console.error("Prava payment result fetch error:", error);
    res.status(500).json({ error: "Failed to fetch payment result" });
  }
});

paymentsRouter.post("/prava/sessions/:sessionId/report-status", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const body = ReportStatusSchema.parse(req.body);
    const session = await getPravaPaymentSession({ userId: identity.userId, sessionId: identity.sessionId }, req.params.sessionId);
    if (!session) return res.status(404).json({ error: "Payment session not found" });
    const txnRefId = body.txnRefId;
    const report = await reportPravaRemoteStatus({ userId: identity.userId, sessionId: identity.sessionId }, req.params.sessionId, txnRefId, body.status);
    return res.json({ ok: true, report });
  } catch (error) {
    console.error("Prava report status error:", error);
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid request", details: error.errors });
    res.status(500).json({ error: "Failed to report payment status" });
  }
});
paymentsRouter.get("/prava/transactions/:transactionId", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    if (!requireOwner(identity)) return res.status(401).json({ error: "Missing authorization or sessionId" });
    const transaction = await getPravaTransaction({ userId: identity.userId, sessionId: identity.sessionId }, req.params.transactionId);
    if (!transaction) return res.status(404).json({ error: "Transaction not found" });
    return res.json({ transaction });
  } catch (error) {
    console.error("Prava transaction fetch error:", error);
    res.status(500).json({ error: "Failed to fetch transaction" });
  }
});







