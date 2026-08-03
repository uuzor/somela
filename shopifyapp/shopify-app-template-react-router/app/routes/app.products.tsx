import { useEffect, useRef } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { syncSingleProduct } from "../services/sync.server";

const PAGE_SIZE = 50;

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "indexed", label: "Indexed" },
  { value: "processing", label: "Processing" },
  { value: "outdated", label: "Out of date" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
  { value: "excluded", label: "Plan excluded" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") ?? "";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));

  const where = {
    shop,
    ...(statusFilter ? { status: statusFilter } : {}),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        shopifyId: true,
        title: true,
        handle: true,
        vendor: true,
        productType: true,
        status: true,
        errorMessage: true,
        lastSyncedAt: true,
        updatedAt: true,
      },
    }),
    prisma.product.count({ where }),
  ]);

  return {
    products: products.map((p) => ({
      ...p,
      lastSyncedAt: p.lastSyncedAt?.toISOString() ?? null,
      updatedAt: p.updatedAt.toISOString(),
    })),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    statusFilter,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");
  const shopifyId = formData.get("shopifyId") as string;

  if (intent === "resync-product" && shopifyId) {
    try {
      await syncSingleProduct(admin, shop, shopifyId);
      return { ok: true, shopifyId, message: "Product resynced successfully" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { ok: false, shopifyId, message };
    }
  }

  return { ok: false, message: "Unknown intent" };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(
  status: string
): "success" | "info" | "warning" | "critical" | "neutral" {
  switch (status) {
    case "indexed":
      return "success";
    case "processing":
      return "info";
    case "outdated":
      return "warning";
    case "failed":
      return "critical";
    default:
      return "neutral";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "indexed":
      return "Indexed";
    case "processing":
      return "Processing";
    case "outdated":
      return "Out of date";
    case "failed":
      return "Failed";
    case "pending":
      return "Pending";
    case "excluded":
      return "Plan excluded";
    default:
      return status;
  }
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Products() {
  const { products, total, page, totalPages, statusFilter } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const pendingProductId = useRef<string | null>(null);

  // Track which product is being resynced
  const resyncingId =
    fetcher.state !== "idle"
      ? (fetcher.formData?.get("shopifyId") as string | null)
      : null;

  useEffect(() => {
    if (fetcher.data?.ok === true) {
      shopify.toast.show("Product resynced successfully");
    } else if (fetcher.data?.ok === false) {
      shopify.toast.show(`Resync failed: ${fetcher.data.message}`, {
        isError: true,
      });
    }
  }, [fetcher.data, shopify]);

  function setFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("status", value);
    } else {
      next.delete("status");
    }
    next.delete("page");
    setSearchParams(next);
  }

  function goToPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
  }

  return (
    <s-page heading={`Products (${total})`}>
      {/* Filter bar */}
      <s-section>
        <s-stack direction="inline" gap="base">
          <s-text>Filter by status:</s-text>
          {STATUS_OPTIONS.map((opt) => (
            <s-button
              key={opt.value}
              variant={statusFilter === opt.value ? "primary" : "tertiary"}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </s-button>
          ))}
        </s-stack>
      </s-section>

      {/* Table */}
      <s-section>
        {products.length === 0 ? (
          <s-paragraph>
            No products found
            {statusFilter ? ` with status "${statusLabel(statusFilter)}"` : ""}.
          </s-paragraph>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "14px",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--s-color-border, #e1e3e5)",
                    textAlign: "left",
                  }}
                >
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>
                    Product
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>
                    Type / Vendor
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>
                    Status
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>
                    Last synced
                  </th>
                  <th style={{ padding: "8px 12px", fontWeight: 600 }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {products.map((product, i) => {
                  const isLoading = resyncingId === product.shopifyId;
                  return (
                    <tr
                      key={product.id}
                      style={{
                        borderBottom:
                          "1px solid var(--s-color-border, #e1e3e5)",
                        background:
                          i % 2 === 0
                            ? "transparent"
                            : "var(--s-color-bg-subdued, #f6f6f7)",
                      }}
                    >
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ fontWeight: 500 }}>{product.title}</div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--s-color-text-subdued, #6d7175)",
                          }}
                        >
                          {product.handle}
                        </div>
                        {product.status === "failed" && product.errorMessage && (
                          <div
                            style={{
                              fontSize: "11px",
                              color: "var(--s-color-text-critical, #d72c0d)",
                              marginTop: 2,
                            }}
                          >
                            {product.errorMessage}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div>{product.productType || "—"}</div>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "var(--s-color-text-subdued, #6d7175)",
                          }}
                        >
                          {product.vendor || ""}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <s-badge tone={statusTone(product.status)}>
                          {statusLabel(product.status)}
                        </s-badge>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        {formatDate(product.lastSyncedAt)}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <s-button
                          variant="tertiary"
                          {...(isLoading ? { loading: true } : {})}
                          onClick={() =>
                            fetcher.submit(
                              {
                                intent: "resync-product",
                                shopifyId: product.shopifyId,
                              },
                              { method: "POST" }
                            )
                          }
                        >
                          Resync
                        </s-button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </s-section>

      {/* Pagination */}
      {totalPages > 1 && (
        <s-section>
          <s-stack direction="inline" gap="base">
            <s-button
              variant="tertiary"
              onClick={() => goToPage(page - 1)}
              {...(page <= 1 ? { disabled: true } : {})}
            >
              ← Previous
            </s-button>
            <s-text>
              Page {page} of {totalPages}
            </s-text>
            <s-button
              variant="tertiary"
              onClick={() => goToPage(page + 1)}
              {...(page >= totalPages ? { disabled: true } : {})}
            >
              Next →
            </s-button>
          </s-stack>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
