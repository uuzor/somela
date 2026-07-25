//Minimal typing of Shopify's public /products.json response.
// Shopify doesn't publish an official schema for this endpoint (it's the
// storefront theme's own JSON feed, not the Admin/Storefront GraphQL API),
// so this is reverse-engineered from real responses. Treat fields as
// optional/nullable more aggressively than you would for a documented API.
 
export interface ShopifyRawImage {
  src: string;
}
 
export interface ShopifyRawVariant {
  id: number;
  title: string;
  price: string;        // Shopify returns price as a string, e.g. "68.00"
  available: boolean;
  option1?: string | null;
  option2?: string | null;
}
 
export interface ShopifyRawProduct {
  id: number;
  title: string;
  body_html: string;
  product_type: string;
  tags: string[];
  handle: string;         // used to build the canonical URL: /products/{handle}
  images: ShopifyRawImage[];
  variants: ShopifyRawVariant[];
  options: { name: string; position: number }[];
}
 
export interface ShopifyProductsResponse {
  products: ShopifyRawProduct[];
}
 