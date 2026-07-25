// The shape every downstream consumer (search, ranking, try-on) codes against.
// A source (real scrape, real API, mock) never leaks its own shape past this.

export interface ProductVariant {
  id: string;
  title: string;       // e.g. "Blue / M"
  price: number;       // in the shop's currency, minor-unit-free (e.g. 68.00)
  available: boolean;
  color?: string;
  size?: string;
}

export interface Product {
  id: string;           // "{shopId}:{shopifyProductId}" — globally unique across shops
  shopId: string;        // "outdoor-voices", "apc-us"
  title: string;
  description: string;
  category?: string;     // best-effort guess from product_type / tags, see categorize()
  images: string[];
  variants: ProductVariant[];
  minPrice: number;
  maxPrice: number;
  tags: string[];
  url: string;           // canonical product page, for the "buy" stub link
  fetchedAt: string;      // ISO timestamp — used to decide when a shop is "stale"
}

export interface CatalogSource {
  shopId: string;
  fetchProducts(): Promise<Product[]>;
}