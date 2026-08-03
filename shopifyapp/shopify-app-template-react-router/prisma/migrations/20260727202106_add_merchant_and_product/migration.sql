-- CreateTable
CREATE TABLE "shopify_app_merchants" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'none',
    "subscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "syncStatus" TEXT NOT NULL DEFAULT 'never',
    "initialSyncComplete" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncAt" TIMESTAMP(3),
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_app_merchants_pkey" PRIMARY KEY ("id")
);

-- The referenced merchant key must be unique before PostgreSQL creates the FK.
CREATE UNIQUE INDEX "shopify_app_merchants_shop_key"
ON "shopify_app_merchants"("shop");

-- CreateTable
CREATE TABLE "shopify_app_products" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "vendor" TEXT,
    "productType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopify_app_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "shopify_app_products_shop_fkey" FOREIGN KEY ("shop")
      REFERENCES "shopify_app_merchants"("shop") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "shopify_app_products_shop_shopifyId_key"
ON "shopify_app_products"("shop", "shopifyId");

CREATE INDEX "shopify_app_products_shop_status_idx"
ON "shopify_app_products"("shop", "status");
