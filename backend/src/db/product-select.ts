import { products } from "./index.js";

// Select only columns that exist in the currently deployed products table.
// The codebase can still carry richer future fields in TypeScript, but runtime
// queries must stay compatible with the live database until migrations land.
export const productSummarySelect = {
  id: products.id,
  shopId: products.shopId,
  shop: products.shop,
  title: products.title,
  description: products.description,
  category: products.category,
  images: products.images,
  processedImages: products.processedImages,
  variants: products.variants,
  minPrice: products.minPrice,
  maxPrice: products.maxPrice,
  tags: products.tags,
  url: products.url,
  fetchedAt: products.fetchedAt,
  createdAt: products.createdAt,
  updatedAt: products.updatedAt,
};
