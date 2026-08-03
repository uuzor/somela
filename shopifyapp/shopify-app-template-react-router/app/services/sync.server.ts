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
  removeProductFromIndex,
  type ProductToIndex,
  type ProductVariant,
  type ProductOption,
  type ProductCollection,
} from "./vector.server";
import {
  canIndexAnotherProduct,
  getCatalogueEntitlement,
} from "./entitlements.server";

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
      weight weightUnit availableForSale inventoryQuantity
      requiresShipping taxable
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapVariant(v: any): ProductVariant {
  return {
    id:                v.id ?? "",
    title:             v.title ?? "",
    price:             v.price ?? "0",
    compareAtPrice:    v.compareAtPrice ?? null,
    sku:               v.sku ?? null,
    barcode:           v.barcode ?? null,
    weight:            v.weight ?? null,
    weightUnit:        v.weightUnit ?? null,
    availableForSale:  v.availableForSale ?? false,
    inventoryQuantity: v.inventoryQuantity ?? null,
    requiresShipping:  v.requiresShipping ?? true,
    taxable:           v.taxable ?? false,
    selectedOptions:   (v.selectedOptions ?? []).map(
      (o: { name: string; value: string }) => ({ name: o.name, value: o.value })
    ),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapNode(node: any, shop: string): ProductToIndex {
  const variants: ProductVariant[] = (node.variants?.nodes ?? []).map(mapVariant);
  const options: ProductOption[] = (node.options ?? []).map(
    (o: { name: string; values: string[] }) => ({ name: o.name, values: o.values })
  );
  const collections: ProductCollection[] = (node.collections?.nodes ?? []).map(
    (c: { id: string; title: string; handle: string }) => ({
      id: c.id, title: c.title, handle: c.handle,
    })
  );

  return {
    shopifyId:      node.id,
    shop,
    title:          node.title,
    handle:         node.handle,
    description:    node.description ?? null,
    vendor:         node.vendor ?? null,
    productType:    node.productType ?? null,
    status:         node.status ?? null,
    tags:           node.tags ?? [],
    images:         (node.images?.nodes ?? []).map((img: { url: string }) => img.url),
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
  productLimit: number
): Promise<ProductToIndex[]> {
  const products: ProductToIndex[] = [];
  let hasNextPage = true;
  let cursor: string | null = null;

  while (hasNextPage) {
    const remaining = productLimit - products.length;
    if (remaining <= 0) break;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response = await admin.graphql(PRODUCTS_QUERY, {
      variables: {
        first: Number.isFinite(productLimit) ? Math.min(50, remaining) : 50,
        after: cursor,
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json: any = await response.json();
    const data = json.data?.products;
    if (!data) break;

    for (const node of data.nodes) {
      products.push(mapNode(node, shop));
    }

    hasNextPage = data.pageInfo.hasNextPage;
    cursor = data.pageInfo.endCursor;
  }

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
export async function triggerInitialSync(admin: any, shop: string) {
  await prisma.merchant.update({
    where: { shop },
    data: { syncStatus: "in_progress" },
  });

  try {
    const { productLimit } = await getCatalogueEntitlement(shop);
    const products = await fetchAllProducts(admin, shop, productLimit);
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
    for (const product of productsOutsideLimit) {
      await excludeProduct(shop, product);
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

    // Embed and index one at a time (Voyage API rate limits)
    let failed = 0;
    for (const product of products) {
      const result = await indexProduct(product);
      if (result.success) {
        await prisma.product.update({
          where: { shop_shopifyId: { shop, shopifyId: product.shopifyId } },
          data: {
            status: result.excluded ? "excluded" : "indexed",
            lastSyncedAt: new Date(),
            errorMessage: result.message ?? null,
          },
        });
      } else {
        failed++;
        await prisma.product.update({
          where: { shop_shopifyId: { shop, shopifyId: product.shopifyId } },
          data: { status: "failed", errorMessage: result.message ?? "Unknown error" },
        });
      }
    }

    await prisma.merchant.update({
      where: { shop },
      data: {
        syncStatus:          failed === 0 ? "complete" : "partial",
        lastSyncAt:          new Date(),
        initialSyncComplete: true,
      },
    });
  } catch (err) {
    console.error(`[OpenCommerceLens] Initial sync failed for ${shop}:`, err);
    await prisma.merchant.update({
      where: { shop },
      data: { syncStatus: "failed" },
    });
    throw err;
  }
}

/**
 * Re-sync every product — marks indexed ones as outdated first so the UI
 * shows progress, then runs triggerInitialSync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function triggerFullResync(admin: any, shop: string) {
  await prisma.product.updateMany({
    where: { shop, status: "indexed" },
    data: { status: "outdated" },
  });
  await triggerInitialSync(admin, shop);
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

  // Map REST variants → rich ProductVariant shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: ProductVariant[] = (payload.variants ?? []).map((v: any): ProductVariant => ({
    id:                `gid://shopify/ProductVariant/${v.id}`,
    title:             v.title ?? "",
    price:             v.price ?? "0",
    compareAtPrice:    v.compare_at_price ?? null,
    sku:               v.sku ?? null,
    barcode:           v.barcode ?? null,
    weight:            v.weight ?? null,
    weightUnit:        v.weight_unit ?? null,
    availableForSale:  v.inventory_management == null || v.inventory_policy === "continue" || v.inventory_quantity > 0,
    inventoryQuantity: v.inventory_quantity ?? null,
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
    vendor:         payload.vendor ?? null,
    productType:    payload.product_type ?? null,
    status:         payload.status ? String(payload.status).toUpperCase() : null,
    tags:           typeof payload.tags === "string"
                      ? payload.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
                      : [],
    images:         (payload.images ?? []).map((img: { src: string }) => img.src),
    variants,
    options,
    collections:    [], // webhooks don't include collections — will be populated on next full sync
    seo:            null,
    totalInventory: variants.reduce((sum, v) => sum + (v.inventoryQuantity ?? 0), 0),
  };

  if (!(await canIndexAnotherProduct(shop, shopifyId))) {
    await excludeProduct(shop, product);
    return;
  }

  await indexOne(product);
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
