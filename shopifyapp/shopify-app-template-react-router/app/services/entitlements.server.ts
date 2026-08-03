import prisma from "../db.server";

export const PLAN_PRODUCT_LIMITS: Record<string, number> = {
  none: 50,
  "Starter Plan": 500,
  "Growth Plan": 5_000,
  "Pro Plan": Number.POSITIVE_INFINITY,
};

export interface CatalogueEntitlement {
  active: boolean;
  plan: string;
  productLimit: number;
}

export async function getCatalogueEntitlement(
  shop: string
): Promise<CatalogueEntitlement> {
  const merchant = await prisma.merchant.findUnique({ where: { shop } });
  const hasPaidPlan = merchant?.subscriptionStatus === "active";
  const plan = hasPaidPlan ? merchant?.plan ?? "none" : "none";

  return {
    active: hasPaidPlan,
    plan,
    productLimit: PLAN_PRODUCT_LIMITS[plan] ?? PLAN_PRODUCT_LIMITS.none,
  };
}

export async function canIndexAnotherProduct(
  shop: string,
  shopifyId: string
): Promise<boolean> {
  const existing = await prisma.product.findUnique({
    where: { shop_shopifyId: { shop, shopifyId } },
    select: { status: true },
  });
  if (existing && existing.status !== "excluded") return true;

  const { productLimit } = await getCatalogueEntitlement(shop);
  if (!Number.isFinite(productLimit)) return true;

  const indexedCount = await prisma.product.count({
    where: { shop, status: { not: "excluded" } },
  });
  return indexedCount < productLimit;
}
