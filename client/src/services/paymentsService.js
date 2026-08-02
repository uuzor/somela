import { request, userHeaders } from "./apiClient";

function withSessionQuery(options = {}) {
  return options.sessionId ? { sessionId: options.sessionId } : undefined;
}

export async function getPravaPaymentStatus(options = {}) {
  return request("/api/payments/prava/status", {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function getPravaConnection(options = {}) {
  return request("/api/payments/prava/connection", {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function linkPravaConnection(payload, options = {}) {
  return request("/api/payments/prava/link", {
    method: "POST",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
    body: payload,
  });
}

export async function unlinkPravaConnection(options = {}) {
  return request("/api/payments/prava/link", {
    method: "DELETE",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function listPravaPaymentSessions(options = {}) {
  return request("/api/payments/prava/sessions", {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function createPravaPaymentSession(payload, options = {}) {
  return request("/api/payments/prava/sessions", {
    method: "POST",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
    body: {
      ...payload,
      sessionId: payload.sessionId || options.sessionId,
    },
  });
}

export async function getPravaPaymentSession(sessionId, options = {}) {
  return request(`/api/payments/prava/sessions/${encodeURIComponent(sessionId)}`, {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function getPravaPaymentResult(sessionId, options = {}) {
  return request(`/api/payments/prava/sessions/${encodeURIComponent(sessionId)}/result`, {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function reportPravaPaymentStatus(sessionId, payload, options = {}) {
  return request(`/api/payments/prava/sessions/${encodeURIComponent(sessionId)}/report-status`, {
    method: "POST",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
    body: payload,
  });
}

export async function listPravaMandates(options = {}) {
  return request("/api/payments/prava/mandates", {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function createPravaMandate(payload, options = {}) {
  return request("/api/payments/prava/mandates", {
    method: "POST",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
    body: {
      ...payload,
      sessionId: payload.sessionId || options.sessionId,
    },
  });
}

export async function getPravaMandate(mandateId, options = {}) {
  return request(`/api/payments/prava/mandates/${encodeURIComponent(mandateId)}`, {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function listPravaTransactions(options = {}) {
  return request("/api/payments/prava/transactions", {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}

export async function createPravaTransaction(payload, options = {}) {
  return request("/api/payments/prava/transactions", {
    method: "POST",
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
    body: {
      ...payload,
      sessionId: payload.sessionId || options.sessionId,
    },
  });
}

export async function getPravaTransaction(transactionId, options = {}) {
  return request(`/api/payments/prava/transactions/${encodeURIComponent(transactionId)}`, {
    query: withSessionQuery(options),
    headers: userHeaders(options.userId),
  });
}
