import { useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher, useLoaderData, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  syncErrorMessage,
  triggerInitialSync,
  triggerFullResync,
} from "../services/sync.server";
import {
  getProductWebhookQueueStats,
  retryFailedProductWebhookJobs,
  startProductWebhookWorker,
} from "../services/webhook-queue.server";
import { getCatalogueEntitlement } from "../services/entitlements.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  startProductWebhookWorker();
  const shop = session.shop;

  // Ensure merchant row exists
  let merchant = await prisma.merchant.findUnique({ where: { shop } });
  if (!merchant) {
    merchant = await prisma.merchant.create({ data: { shop } });
  }

  // Kick off initial sync in background if it's never been run
  if (!merchant.initialSyncComplete && merchant.syncStatus === "never") {
    await prisma.merchant.update({
      where: { shop },
      data: { syncStatus: "in_progress" },
    });
    // Fire-and-forget — does not block the page response
    triggerInitialSync(admin, shop).catch((err) =>
      console.error("[OCL_SYNC] background_initial_sync_task_rejected", {
        shop,
        errorMessage: syncErrorMessage(err),
      })
    );
  }

  // Stats
  const [
    total,
    indexed,
    processing,
    outdated,
    failed,
    excluded,
    entitlement,
    queue,
  ] = await Promise.all([
    prisma.product.count({ where: { shop } }),
    prisma.product.count({ where: { shop, status: "indexed" } }),
    prisma.product.count({ where: { shop, status: "processing" } }),
    prisma.product.count({ where: { shop, status: "outdated" } }),
    prisma.product.count({ where: { shop, status: "failed" } }),
    prisma.product.count({ where: { shop, status: "excluded" } }),
    getCatalogueEntitlement(shop),
    getProductWebhookQueueStats(shop),
  ]);

  return {
    shop,
    merchant: {
      plan: merchant.plan,
      subscriptionStatus: merchant.subscriptionStatus,
      syncStatus: merchant.syncStatus,
      initialSyncComplete: merchant.initialSyncComplete,
      lastSyncAt: merchant.lastSyncAt?.toISOString() ?? null,
    },
    stats: { total, indexed, processing, outdated, failed, excluded },
    queue: {
      ...queue,
      lastCompletedAt: queue.lastCompletedAt?.toISOString() ?? null,
    },
    entitlement: {
      ...entitlement,
      productLimit: Number.isFinite(entitlement.productLimit)
        ? entitlement.productLimit
        : null,
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "resync-all") {
    console.info("[OCL_SYNC] dashboard_resync_request_accepted", { shop });
    // Fire-and-forget full resync
    triggerFullResync(admin, shop).catch((err) =>
      console.error("[OCL_SYNC] dashboard_resync_task_rejected", {
        shop,
        errorMessage: syncErrorMessage(err),
      })
    );
    return { ok: true, message: "Full resync started" };
  }

  if (intent === "retry-webhooks") {
    const count = await retryFailedProductWebhookJobs(shop);
    return {
      ok: true,
      message:
        count > 0
          ? `${count} failed webhook job${count === 1 ? "" : "s"} queued for retry`
          : "No failed webhook jobs to retry",
    };
  }

  return { ok: false, message: "Unknown intent" };
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function planLabel(plan: string) {
  if (plan === "none" || !plan) return "No active plan";
  return plan;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { merchant, stats, shop, entitlement, queue } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const retryFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const shopify = useAppBridge();

  const isResyncing =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "resync-all";

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Full resync started — products will update shortly");
    }
  }, [fetcher.data, shopify]);

  useEffect(() => {
    if (retryFetcher.data?.message) {
      shopify.toast.show(retryFetcher.data.message);
    }
  }, [retryFetcher.data, shopify]);

  const isSyncing =
    merchant.syncStatus === "in_progress" ||
    merchant.syncStatus === "never" ||
    !merchant.initialSyncComplete;
  const hasActiveWork =
    isSyncing ||
    stats.processing > 0 ||
    queue.pending > 0 ||
    queue.processing > 0;
  const indexedUsage = Math.max(0, stats.total - stats.excluded);
  const usageLabel =
    entitlement.productLimit === null
      ? `${indexedUsage} products indexed - unlimited plan`
      : `${indexedUsage} of ${entitlement.productLimit} catalogue slots used`;

  useEffect(() => {
    if (!hasActiveWork) return;
    const timer = window.setInterval(() => {
      if (revalidator.state === "idle") revalidator.revalidate();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [hasActiveWork, revalidator]);

  return (
    <s-page heading="OpenCommerceLens Catalogue Dashboard">
      {/* Primary action */}
      <s-button
        slot="primary-action"
        onClick={() =>
          fetcher.submit({ intent: "resync-all" }, { method: "POST" })
        }
        {...(isResyncing ? { loading: true } : {})}
      >
        Sync All Products
      </s-button>

      {/* Syncing banner */}
      {isSyncing && (
        <s-section>
          <s-paragraph>
            ⏳ <s-text>Initial sync is in progress. Product counts will update as items are indexed.</s-text>
          </s-paragraph>
        </s-section>
      )}

      {!entitlement.active && (
        <s-section>
          <s-paragraph>
            Your free catalogue preview indexes up to {entitlement.productLimit} products.
            Upgrade to publish a larger catalogue to AI shopping agents.
          </s-paragraph>
        </s-section>
      )}

      <s-section heading="Catalogue usage">
        <s-paragraph>
          <s-text>{usageLabel}</s-text>
        </s-paragraph>
        {stats.excluded > 0 && (
          <s-paragraph>
            <s-text>
              {stats.excluded} product{stats.excluded === 1 ? "" : "s"} remain
              excluded by the current catalogue limit.
            </s-text>
          </s-paragraph>
        )}
      </s-section>

      {/* Stats row */}
      <s-section heading="Catalogue Overview">
        <s-stack direction="inline" gap="base">
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.total}</s-heading>
              <s-text>Total products</s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.excluded}</s-heading>
              <s-text>
                <s-badge tone="neutral">Plan excluded</s-badge>
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.indexed}</s-heading>
              <s-text>
                <s-badge tone="success">Indexed</s-badge>
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.processing}</s-heading>
              <s-text>
                <s-badge tone="info">Processing</s-badge>
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.outdated}</s-heading>
              <s-text>
                <s-badge tone="warning">Out of date</s-badge>
              </s-text>
            </s-stack>
          </s-box>

          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
            background="subdued"
          >
            <s-stack direction="block" gap="base">
              <s-heading>{stats.failed}</s-heading>
              <s-text>
                <s-badge tone="critical">Failed</s-badge>
              </s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Sync info + plan aside */}
      <s-section slot="aside" heading="Sync status">
        <s-paragraph>
          <s-text>Last complete sync: </s-text>
          <s-text>{formatDate(merchant.lastSyncAt)}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Status: </s-text>
          <s-badge
            tone={
              merchant.syncStatus === "complete"
                ? "success"
                : merchant.syncStatus === "in_progress"
                ? "info"
                : merchant.syncStatus === "failed"
                ? "critical"
                : "caution"
            }
          >
            {merchant.syncStatus === "never" ? "Not started" : merchant.syncStatus}
          </s-badge>
        </s-paragraph>
        <s-paragraph>
          <s-text>Store: </s-text>
          <s-text>{shop}</s-text>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Subscription">
        <s-paragraph>
          <s-text>{planLabel(merchant.plan)}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-link href="/app/billing">Manage billing →</s-link>
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Webhook queue">
        <s-paragraph>
          <s-text>Waiting: {queue.pending}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Processing: {queue.processing}</s-text>
        </s-paragraph>
        <s-paragraph>
          <s-text>Failed: </s-text>
          <s-badge tone={queue.failed > 0 ? "critical" : "success"}>
            {queue.failed}
          </s-badge>
        </s-paragraph>
        <s-paragraph>
          <s-text>Last product update: </s-text>
          <s-text>{formatDate(queue.lastCompletedAt)}</s-text>
        </s-paragraph>
      </s-section>

      {queue.failed > 0 && (
        <s-section heading="Webhook updates need attention">
          <s-paragraph>
            {queue.failed} product update{queue.failed === 1 ? "" : "s"} could
            not be indexed after automatic retries.
          </s-paragraph>
          <s-button
            onClick={() =>
              retryFetcher.submit(
                { intent: "retry-webhooks" },
                { method: "POST" }
              )
            }
            {...(retryFetcher.state !== "idle"
              ? { loading: true }
              : {})}
          >
            Retry failed updates
          </s-button>
        </s-section>
      )}

      {/* Failed products callout */}
      {stats.failed > 0 && (
        <s-section heading="Action needed">
          <s-paragraph>
            <s-text>
              {stats.failed} product{stats.failed === 1 ? "" : "s"} failed to
              sync.{" "}
            </s-text>
            <s-link href="/app/products?status=failed">
              View failed products →
            </s-link>
          </s-paragraph>
        </s-section>
      )}

      {/* Quick links */}
      <s-section heading="Resources">
        <s-unordered-list>
          <s-list-item>
            <s-link href="/app/products">View all products</s-link>
          </s-list-item>
          <s-list-item>
            <s-link href="/app/billing">Billing &amp; plan</s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="/support"
              target="_blank"
            >
              Documentation
            </s-link>
          </s-list-item>
          <s-list-item>
            <s-link
              href="/support"
              target="_blank"
            >
              Support
            </s-link>
          </s-list-item>
        </s-unordered-list>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
