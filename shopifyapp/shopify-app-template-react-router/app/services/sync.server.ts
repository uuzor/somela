/**
 * OpenCommerceLens Sync Service
 *
 * Orchestrates product synchronisation: fetches from Shopify, then writes
 * directly to the shared PostgreSQL + pgvector database via vector.server.ts.
 *
 * Called from:
 *   - Dashboard loader (initial sync)
 *   - app.api.resync-all route
 *   - app.api.resync.$productId route
 *   - Webhook handlers (products/create, products/update)
 */

import prisma from "../db.server";
import {
  indexProduct,
  inferProductCategory,
  productDbId,
  removeProductFromIndex,
  variantDbId,
  type ProductToIndex,
  type ProductVariant,
  type ProductOption,
} from "./vector.server";
import {
  canIndexAnotherProduct,
  getCatalogueEntitlement,
} from "./entitlements.server";

type SyncLogData = Record<string, unknown>;

interface SyncContext {
  runId: string;
  shop: string;
  source: "initial" | "manual" | "full";
  startedAt: number;
}

function createSyncContext(
  shop: string,
  source: SyncContext["source"],
  runId?: string
): SyncContext {
  return {
    runId: runId ?? "sync_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    shop,
    source,
    startedAt: Date.now(),
  };
}

function syncLog(context: SyncContext, event: string, data: SyncLogData = {}) {
  console.info("[OCL_SYNC " + context.runId + "] " + event, {
    shop: context.shop,
    source: context.source,
    ...data,
  });
}

function syncErrorDetails(error: unknown): SyncLogData {
  if (!(error instanceof Error)) {
    return { error: String(error) };
  }

  const graphQLErrors = (
    error as Error & {
      body?: { errors?: { graphQLErrors?: Array<{ message?: string }> } };
    }
  ).body?.errors?.graphQLErrors
    ?.map((item) => item.message)
    .filter(Boolean);

  return {
    errorName: error.name,
    errorMessage: error.message,
    ...(graphQLErrors?.length ? { graphQLErrors } : {}),
  };
}

export function syncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─── GraphQL Queries ──────────────────────────────────────────────────────────

const PRODUCT_FIELDS = `#graphql
  id title handle vendor productType status
  description tags totalInventory
  seo { title description }
  options { name values }
  collections(first: 20) { nodes { id title handle } }
  images(first: 5) { nodes { url altText } }
  variants(first: 100) {
    nodes {
      id title price compareAtPrice sku barcode
      availableForSale inventoryQuantity taxable
      inventoryItem {
        requiresShipping
        measurement { weight { value unit } }
      }
      selectedOptions { name value }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query OpenCommerceLensGetProducts($first: Int!, $after: String) {
    products(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { ${PRODUCT_FIELDS} }
    }
  }
`;

const SINGLE_PRODUCT_QUERY = `#graphql
  query OpenCommerceLensGetProduct($id: ID!) {
    product(id: $id) { ${PRODUCT_FIELDS} }
  }
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toNumber(value: unknown, fallback: number | null = null): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function selectedOption(
  options: Array<{ name: string; value: string }>,
  target: "color" | "size"
): string | undefined {
  return options.find((option) => {
    const name = option.name.toLowerCase();
    return target === "color"
      ? name.includes("color") || name.includes("colour")
      : name.includes("size");
  })?.value;
}

function webhookOptionValue(
  options: Array<{ name?: string }> | undefined,
  variant: Record<string, unknown>,
  target: "color" | "size"
): string | undefined {
  const optionIndex = (options ?? []).findIndex((option) => {
    const name = option.name ?? "";
    return target === "color" ? /colou?r/i.test(name) : /size/i.test(name);
  });
  if (optionIndex < 0) return undefined;
  const value = variant["option" + (optionIndex + 1)];
  return value ? String(value) : undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVariant(
  v: any,
  productId: string,
  primaryImage: string | null
): ProductVariant {
  const packagedWeight = v.inventoryItem?.measurement?.weight;
  const selectedOptions = (v.selectedOptions ?? []).map(
    (option: { name: string; value: string }) => ({
      name: option.name,
      value: option.value,
    })
  );
  const available = Boolean(v.availableForSale);
  const stockQuantity = toNumber(v.inventoryQuantity);

  return {
    id:                variantDbId(productId, v.id ?? ""),
    shopVariantId:     String(v.id ?? "").split("/").pop() ?? "",
    title:             v.title ?? "",
    price:             toNumber(v.price, 0) ?? 0,
    compareAtPrice:    toNumber(v.compareAtPrice),
    available,
    availableForSale:  available,
    stockQuantity,
    color:             selectedOption(selectedOptions, "color"),
    size:              selectedOption(selectedOptions, "size"),
    sku:               v.sku ?? null,
    barcode:           v.barcode ?? null,
    weight:            toNumber(packagedWeight?.value),
    weightUnit:        packagedWeight?.unit ?? null,
    image:              primaryImage,
    inventoryQuantity: stockQuantity,
    requiresShipping:  v.inventoryItem?.requiresShipping ?? true,
    taxable:           v.taxable ?? false,
    selectedOptions,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNode(node: any, shop: string): ProductToIndex {
  const images = (node.images?.nodes ?? []).map((image: { url: string }) => image.url);
  const tags = node.tags ?? [];
  const productId = productDbId(shop, node.id);
  const variants: ProductVariant[] = (node.variants?.nodes ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (variant: any) => mapVariant(variant, productId, images[0] ?? null)
  );
  const options: ProductOption[] = (node.options ?? []).map(
    (o: { name: string; values: string[] }) => ({ name: o.name, values: o.values })
  );
  const collections: string[] = (node.collections?.nodes ?? []).map(
    (collection: { title: string }) => collection.title
  );

  return {
    shopifyId:      node.id,
    shop,
    title:          node.title,
    handle:         node.handle,
    description:    node.description ?? null,
    category:       inferProductCategory(node.productType, tags),
    vendor:         node.vendor ?? null,
    productType:    node.productType ?? null,
    status:         node.status ?? null,
    tags,
    images,
    variants,
    options,
    collections,
    seo:            node.seo
                      ? { title: node.seo.title ?? null, description: node.seo.description ?? null }
                      : null,
    totalInventory: node.totalInventory ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllProducts(
  admin: any,
  shop: string,
  productLimit: number,
  context: SyncContext
): Promise<ProductToIndex[]> {
  const products: ProductToIndex[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;
  let page = 0;

  while (hasNextPage) {
    const remaining = productLimit - products.length;
    if (remaining <= 0) break;

    page++;
    const pageSize = Number.isFinite(productLimit) ? Math.min(50, remaining) : 50;
    syncLog(context, "shopify_page_request", {
      page,
      pageSize,
      fetchedSoFar: products.length,
      hasCursor: Boolean(cursor),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: {
        first: pageSize,
        after: cursor,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    const data = json.data?.products;
    if (!data) {
      syncLog(context, "shopify_page_empty", {
        page,
        responseHasErrors: Boolean(json.errors),
      });
      break;
    }

    for (const node of data.nodes) {
      products.push(mapNode(node, shop));
    }

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
    syncLog(context, "shopify_page_received", {
      page,
      received: data.nodes.length,
      fetchedTotal: products.length,
      hasNextPage,
    });
  }

  syncLog(context, "shopify_fetch_complete", {
    pages: page,
    productCount: products.length,
  });
  return products;
}

/**
 * Index a single ProductToIndex record:
 *   - Mark as "processing" in local SQLite
 *   - Call Voyage AI + write to shared Postgres
 *   - Update local status to "indexed" or "failed"
 */
async function indexOne(product: ProductToIndex): Promise<void> {
  const { shop, shopifyId } = product;

  await prisma.product.upsert({
    where: { shop_shopifyId: { shop, shopifyId } },
    create: {
      shop,
      shopifyId,
      title:       product.title,
      handle:      product.handle,
      vendor:      product.vendor,
      productType: product.productType,
      status:      "processing",
    },
    update: {
      title:        product.title,
      handle:       product.handle,
      vendor:       product.vendor,
      productType:  product.productType,
      status:       "processing",
      errorMessage: null,
    },
  });

  const result = await indexProduct(product);

  await prisma.product.update({
    where: { shop_shopifyId: { shop, shopifyId } },
    data: result.success
      ? {
          status: result.excluded ? "excluded" : "indexed",
          lastSyncedAt: new Date(),
          errorMessage: result.message ?? null,
        }
      : { status: "failed", errorMessage: result.message ?? "Unknown error" },
  });

  if (!result.success) {
    throw new Error(result.message ?? "Product indexing failed");
  }
}

async function excludeProduct(
  shop: string,
  product: Pick<ProductToIndex, "shopifyId" | "title" | "handle" | "vendor" | "productType">
) {
  await removeProductFromIndex(shop, product.shopifyId);
  await prisma.product.upsert({
    where: { shop_shopifyId: { shop, shopifyId: product.shopifyId } },
    create: {
      shop,
      shopifyId: product.shopifyId,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      status: "excluded",
      errorMessage: "Catalogue plan limit reached",
    },
    update: {
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      status: "excluded",
      errorMessage: "Catalogue plan limit reached",
    },
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Initial catalogue sync — runs after merchant installs the app.
 * Fetches all Shopify products, embeds them, writes to shared DB.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function triggerInitialSync(
  admin: any,
  shop: string,
  options: { runId?: string; source?: SyncContext["source"] } = {}
) {
  const context = createSyncContext(shop, options.source ?? "initial", options.runId);
  syncLog(context, "sync_started");

  await prisma.merchant.update({
    where: { shop },
    data: { syncStatus: "in_progress" },
  });
  syncLog(context, "merchant_status_updated", { syncStatus: "in_progress" });

  try {
    const entitlement = await getCatalogueEntitlement(shop);
    const { productLimit } = entitlement;
    syncLog(context, "entitlement_resolved", {
      plan: entitlement.plan,
      active: entitlement.active,
      productLimit: Number.isFinite(productLimit) ? productLimit : "unlimited",
    });

    const products = await fetchAllProducts(admin, shop, productLimit, context);
    const selectedIds = products.map((product) => product.shopifyId);

    const productsOutsideLimit = await prisma.product.findMany({
      where: {
        shop,
        status: { not: "excluded" },
        ...(selectedIds.length > 0 ? { shopifyId: { notIn: selectedIds } } : {}),
      },
      select: {
        shopifyId: true,
        title: true,
        handle: true,
        vendor: true,
        productType: true,
      },
    });
    syncLog(context, "plan_exclusions_resolved", {
      excludedProductCount: productsOutsideLimit.length,
    });
    for (const product of productsOutsideLimit) {
      await excludeProduct(shop, product);
      syncLog(context, "product_excluded", {
        productId: product.shopifyId,
        title: product.title,
      });
    }

    // Upsert all to local tracker as "processing" first so the UI shows counts
    await Promise.all(
      products.map((p) =>
        prisma.product.upsert({
          where: { shop_shopifyId: { shop, shopifyId: p.shopifyId } },
          create: {
            shop,
            shopifyId:   p.shopifyId,
            title:       p.title,
            handle:      p.handle,
            vendor:      p.vendor,
            productType: p.productType,
            status:      "processing",
          },
          update: { status: "processing", errorMessage: null },
        })
      )
    );
    syncLog(context, "local_tracker_staged", {
      productCount: products.length,
      status: "processing",
    });

    // Embed and index one at a time (Voyage API rate limits)
    let failed = 0;
    let indexed = 0;
    let excluded = 0;
    for (const [index, product] of products.entries()) {
      const productStartedAt = Date.now();
      syncLog(context, "product_index_started", {
        position: index + 1,
        total: products.length,
        productId: product.shopifyId,
        title: product.title,
        imageCount: product.images.length,
        variantCount: product.variants.length,
      });

      const result = await indexProduct(product);
      if (result.success) {
        if (result.excluded) excluded++;
        else indexed++;
        await prisma.product.update({
          where: { shop_shopifyId: { shop, shopifyId: product.shopifyId } },
          data: {
            status: result.excluded ? "excluded" : "indexed",
            lastSyncedAt: new Date(),
            errorMessage: result.message ?? null,
          },
        });
        syncLog(context, "product_index_completed", {
          position: index + 1,
          total: products.length,
          productId: product.shopifyId,
          title: product.title,
          status: result.excluded ? "excluded" : "indexed",
          durationMs: Date.now() - productStartedAt,
          message: result.message ?? null,
        });
      } else {
        failed++;
        await prisma.product.update({
          where: { shop_shopifyId: { shop, shopifyId: product.shopifyId } },
          data: { status: "failed", errorMessage: result.message ?? "Unknown error" },
        });
        syncLog(context, "product_index_failed", {
          position: index + 1,
          total: products.length,
          productId: product.shopifyId,
          title: product.title,
          durationMs: Date.now() - productStartedAt,
          errorMessage: result.message ?? "Unknown error",
        });
      }
    }

    const finalStatus = failed === 0 ? "complete" : "partial";
    await prisma.merchant.update({
      where: { shop },
      data: {
        syncStatus:          finalStatus,
        lastSyncAt:          new Date(),
        initialSyncComplete: true,
      },
    });
    syncLog(context, "sync_completed", {
      syncStatus: finalStatus,
      fetched: products.length,
      indexed,
      excluded,
      failed,
      durationMs: Date.now() - context.startedAt,
    });
  } catch (err) {
    console.error("[OCL_SYNC " + context.runId + "] sync_failed", {
      shop,
      source: context.source,
      durationMs: Date.now() - context.startedAt,
      ...syncErrorDetails(err),
    });
    await prisma.merchant.update({
      where: { shop },
      data: { syncStatus: "failed" },
    });
    syncLog(context, "merchant_status_updated", { syncStatus: "failed" });
    throw err;
  }
}

/**
 * Re-sync every product — marks indexed ones as outdated first so the UI
 * shows progress, then runs triggerInitialSync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function triggerFullResync(admin: any, shop: string) {
  const context = createSyncContext(shop, "full");
  syncLog(context, "full_resync_requested");
  const outdated = await prisma.product.updateMany({
    where: { shop, status: "indexed" },
    data: { status: "outdated" },
  });
  syncLog(context, "indexed_products_marked_outdated", { count: outdated.count });
  await triggerInitialSync(admin, shop, {
    runId: context.runId,
    source: context.source,
  });
}

/**
 * Re-sync a single product by its Shopify GID.
 * Used by the per-product resync button and product-update webhooks.
 */
export async function syncSingleProduct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  shop: string,
  shopifyProductId: string // Shopify GID
) {
  if (!(await canIndexAnotherProduct(shop, shopifyProductId))) {
    throw new Error("Catalogue plan limit reached. Upgrade the plan to index this product.");
  }

  await prisma.product.upsert({
    where: { shop_shopifyId: { shop, shopifyId: shopifyProductId } },
    create: {
      shop,
      shopifyId: shopifyProductId,
      title:     "Unknown",
      handle:    "",
      status:    "processing",
    },
    update: { status: "processing", errorMessage: null },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await admin.graphql(SINGLE_PRODUCT_QUERY, {
    variables: { id: shopifyProductId },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  const node = json.data?.product;
  if (!node) throw new Error("Product not found in Shopify");

  await indexOne(mapNode(node, shop));
}

/**
 * Handle a products/create or products/update webhook.
 *
 * The webhook REST payload has a different shape from the GraphQL response —
 * we map every available field here so no data is lost.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleProductWebhook(shop: string, payload: any) {
  const shopifyId = `gid://shopify/Product/${payload.id}`;
  const productId = productDbId(shop, shopifyId);
  const startedAt = Date.now();
  console.info("[OCL_WEBHOOK] product_sync_started", {
    shop,
    productId,
    shopifyId,
    title: payload.title ?? null,
  });
  const images = (payload.images ?? []).map((image: { src: string }) => image.src);
  const tags = typeof payload.tags === "string"
    ? payload.tags.split(",").map((tag: string) => tag.trim()).filter(Boolean)
    : Array.isArray(payload.tags) ? payload.tags : [];

  // Map REST variants → rich ProductVariant shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: ProductVariant[] = (payload.variants ?? []).map((v: any): ProductVariant => ({
    id:                variantDbId(productId, String(v.id ?? "")),
    shopVariantId:     String(v.id ?? ""),
    title:             v.title ?? "",
    price:             toNumber(v.price, 0) ?? 0,
    compareAtPrice:    toNumber(v.compare_at_price),
    available:         v.inventory_management == null || v.inventory_policy === "continue" || Number(v.inventory_quantity ?? 0) > 0,
    availableForSale:  v.inventory_management == null || v.inventory_policy === "continue" || Number(v.inventory_quantity ?? 0) > 0,
    stockQuantity:     toNumber(v.inventory_quantity),
    color:             webhookOptionValue(payload.options, v, "color"),
    size:              webhookOptionValue(payload.options, v, "size"),
    sku:               v.sku ?? null,
    barcode:           v.barcode ?? null,
    weight:            toNumber(v.weight),
    weightUnit:        v.weight_unit ?? null,
    image:              images[0] ?? null,
    inventoryQuantity: toNumber(v.inventory_quantity),
    requiresShipping:  v.requires_shipping ?? true,
    taxable:           v.taxable ?? false,
    // Webhook payload doesn't include selectedOptions — derive from option fields
    selectedOptions: [
      v.option1 ? { name: payload.options?.[0]?.name ?? "Option1", value: v.option1 } : null,
      v.option2 ? { name: payload.options?.[1]?.name ?? "Option2", value: v.option2 } : null,
      v.option3 ? { name: payload.options?.[2]?.name ?? "Option3", value: v.option3 } : null,
    ].filter(Boolean) as { name: string; value: string }[],
  }));

  // Map REST options → ProductOption shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: ProductOption[] = (payload.options ?? []).map((o: any): ProductOption => ({
    name:   o.name ?? "",
    values: o.values ?? [],
  }));

  const product: ProductToIndex = {
    shopifyId,
    shop,
    title:          payload.title ?? "Unknown",
    handle:         payload.handle ?? "",
    description:    payload.body_html ?? null,
    category:       inferProductCategory(payload.product_type, tags),
    vendor:         payload.vendor ?? null,
    productType:    payload.product_type ?? null,
    status:         payload.status ? String(payload.status).toUpperCase() : null,
    tags,
    images,
    variants,
    options,
    collections:    [], // webhooks don't include collections — will be populated on next full sync
    seo:            null,
    totalInventory: variants.reduce((sum, variant) => sum + (variant.stockQuantity ?? 0), 0),
  };

  if (!(await canIndexAnotherProduct(shop, shopifyId))) {
    await excludeProduct(shop, product);
    console.info("[OCL_WEBHOOK] product_sync_excluded", {
      shop,
      productId,
      reason: "catalogue_plan_limit",
    });
    return;
  }

  await indexOne(product);
  console.info("[OCL_WEBHOOK] product_sync_completed", {
    shop,
    productId,
    durationMs: Date.now() - startedAt,
  });
}

/**
 * Handle a products/delete webhook.
 * Removes the product from both the local tracker and the shared DB.
 */
export async function handleProductDeleted(
  shop: string,
  shopifyProductId: string
) {
  await prisma.product.deleteMany({
    where: { shop, shopifyId: shopifyProductId },
  });
  await removeProductFromIndex(shop, shopifyProductId);
}
