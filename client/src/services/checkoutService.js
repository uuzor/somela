import { request, userHeaders } from "./apiClient";

export const ACTIVE_CHECKOUT_STATUSES = new Set(["awaiting_approval", "approved"]);
export const TERMINAL_CHECKOUT_STATUSES = new Set(["paid", "failed", "expired", "cancelled"]);

export function normalizeCheckoutStatus(value) {
  const status = String(value || "created").toLowerCase();
  if (status === "pending" || status === "pending_approval") return "awaiting_approval";
  if (status === "awaiting_result") return "approved";
  if (status === "completed" || status === "captured") return "paid";
  if (status === "declined") return "failed";
  return status;
}

export function groupCheckoutsByGroupId(checkouts = []) {
  const groups = new Map();

  for (const checkout of Array.isArray(checkouts) ? checkouts : []) {
    if (!checkout?.id) continue;
    const groupId = checkout.checkoutGroupId || checkout.id;
    const normalized = {
      ...checkout,
      status: normalizeCheckoutStatus(checkout.status),
    };
    const current = groups.get(groupId) || {
      id: groupId,
      checkouts: [],
      createdAt: checkout.createdAt || null,
    };

    current.checkouts.push(normalized);
    if (!current.createdAt || (checkout.createdAt && new Date(checkout.createdAt) > new Date(current.createdAt))) {
      current.createdAt = checkout.createdAt;
    }
    groups.set(groupId, current);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      checkouts: group.checkouts.sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0)),
    }))
    .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
}

export async function listCheckouts(options = {}) {
  return request("/api/checkouts", {
    query: {
      status: options.status,
      limit: options.limit || 50,
    },
    headers: userHeaders(options.userId),
  });
}

export async function getCheckout(checkoutId, options = {}) {
  return request(`/api/checkouts/${encodeURIComponent(checkoutId)}`, {
    headers: userHeaders(options.userId),
  });
}

export async function syncCheckout(checkoutId, options = {}) {
  return request(`/api/checkouts/${encodeURIComponent(checkoutId)}/sync`, {
    method: "POST",
    headers: userHeaders(options.userId),
  });
}
