import { and, eq } from "drizzle-orm";
import { db, products, savedProducts } from "../db/index.js";
import { productSummarySelect } from "../db/product-select.js";

export type SavedProductOwner = {
  userId?: string | null;
  sessionId?: string | null;
};

export type SavedProductItem = {
  savedId: string;
  productId: string;
  createdAt: unknown;
  updatedAt: unknown;
  product: any;
};

function ownerFilter(owner: SavedProductOwner) {
  if (owner.userId) {
    return eq(savedProducts.userId, owner.userId);
  }
  if (owner.sessionId) {
    return eq(savedProducts.sessionId, owner.sessionId);
  }
  return null;
}

function normalizeProductRow(product: any) {
  if (!product) return null;
  return {
    id: product.id,
    shopId: product.shopId,
    shop: product.shop,
    title: product.title,
    description: product.description ?? null,
    category: product.category ?? null,
    images: Array.isArray(product.images) ? product.images : [],
    processedImages: Array.isArray(product.processedImages) ? product.processedImages : [],
    variants: Array.isArray(product.variants) ? product.variants : [],
    minPrice: product.minPrice ?? null,
    maxPrice: product.maxPrice ?? null,
    tags: Array.isArray(product.tags) ? product.tags : [],
    url: product.url ?? null,
    fetchedAt: product.fetchedAt,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

export function hasSavedProductsOwner(owner: SavedProductOwner) {
  return Boolean(owner.userId || owner.sessionId);
}

export async function listSavedProducts(owner: SavedProductOwner): Promise<SavedProductItem[]> {
  const filter = ownerFilter(owner);
  if (!filter) return [];

  const rows = await db
    .select({
      savedId: savedProducts.id,
      productId: savedProducts.productId,
      createdAt: savedProducts.createdAt,
      updatedAt: savedProducts.updatedAt,
      product: productSummarySelect,
    })
    .from(savedProducts)
    .innerJoin(products, eq(savedProducts.productId, products.id))
    .where(filter)
    .orderBy(savedProducts.createdAt);

  return rows
    .map((row) => ({
      savedId: row.savedId,
      productId: row.productId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      product: normalizeProductRow(row.product),
    }))
    .filter((item) => Boolean(item.product)) as SavedProductItem[];
}

export async function getSavedProduct(owner: SavedProductOwner, productId: string) {
  const filter = ownerFilter(owner);
  if (!filter) return null;

  const [row] = await db
    .select()
    .from(savedProducts)
    .where(and(filter, eq(savedProducts.productId, productId)))
    .limit(1);

  return row || null;
}

export async function saveProduct(owner: SavedProductOwner, productId: string) {
  const filter = ownerFilter(owner);
  if (!filter) {
    throw new Error('Missing saved product owner');
  }

  const [product] = await db.select(productSummarySelect).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) {
    return { savedProduct: null, created: false, product: null };
  }

  const existing = await getSavedProduct(owner, productId);
  if (existing) {
    return {
      savedProduct: existing,
      created: false,
      product: normalizeProductRow(product),
    };
  }

  const [created] = await db
    .insert(savedProducts)
    .values({
      userId: owner.userId || null,
      sessionId: owner.sessionId || null,
      productId,
    })
    .returning();

  return {
    savedProduct: created,
    created: true,
    product: normalizeProductRow(product),
  };
}

export async function removeSavedProduct(owner: SavedProductOwner, productId: string) {
  const filter = ownerFilter(owner);
  if (!filter) {
    throw new Error('Missing saved product owner');
  }

  const existing = await getSavedProduct(owner, productId);
  if (!existing) {
    return false;
  }

  await db.delete(savedProducts).where(and(filter, eq(savedProducts.productId, productId)));
  return true;
}
