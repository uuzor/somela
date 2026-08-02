import { z } from "zod";

const optionalUrlSchema = z.preprocess((value) => {
  return value === null ? undefined : value;
}, z.string().url().optional());


const ProductVariantSchema = z.object({
  id: z.string(),
  title: z.string(),
  price: z.number(),
  compareAtPrice: z.number().nullable().optional(),
  available: z.boolean(),
  availableForSale: z.boolean().optional(),
  stockQuantity: z.number().nullable().optional(),
  color: z.string().optional(),
  size: z.string().optional(),
  barcode: z.string().nullable().optional(),
  requiresShipping: z.boolean().nullable().optional(),
  taxable: z.boolean().nullable().optional(),
  weight: z.number().nullable().optional(),
  weightUnit: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
});

const ProductCardSchema = z.object({
  id: z.string(),
  shopId: z.string(),
  handle: z.string().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  vendor: z.string().nullable().optional(),
  productType: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  images: z.array(z.string()),
  primaryImage: z.string().nullable().optional(),
  processedImages: z.array(z.string()).optional().default([]),
  variants: z.array(ProductVariantSchema).optional().default([]),
  options: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).optional().default([]),
  collections: z.array(z.string()).optional().default([]),
  seo: z.object({ title: z.string().nullable().optional(), description: z.string().nullable().optional() }).nullable().optional(),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
  compareAtPriceMin: z.number().nullable().optional(),
  compareAtPriceMax: z.number().nullable().optional(),
  onSale: z.boolean().optional(),
  totalInventory: z.number().nullable().optional(),
  requiresShipping: z.boolean().nullable().optional(),
  taxable: z.boolean().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  url: z.string().nullable().optional(),
});

// ============================================================================
// Catalog API
// ============================================================================

export const CatalogFiltersSchema = z.object({
  category: z.string().optional(),
  color: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  shopId: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  offset: z.number().min(0).default(0),
});

export type CatalogFilters = z.infer<typeof CatalogFiltersSchema>;

// ============================================================================
// Search API
// ============================================================================

export const SemanticSearchSchema = z.object({
  text: z.string().optional(),
  imageUrl: optionalUrlSchema,
  limit: z.number().min(1).max(50).default(12),
});

export type SemanticSearch = z.infer<typeof SemanticSearchSchema>;

// ============================================================================
// Chat API
// ============================================================================

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  imageUrl: optionalUrlSchema, // Optional image attachment
});

export const ChatRequestSchema = z.object({
  sessionId: z.string().default(() => `session_${Date.now()}`),
  message: z.string().min(1).max(2000),
  userId: z.string().optional(), // Optional user ID for authenticated users
  history: z.array(ChatMessageSchema).optional(),
  imageUrl: optionalUrlSchema, // Image URL for visual search
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  products: z.array(ProductCardSchema.pick({
    id: true,
    shopId: true,
    handle: true,
    title: true,
    images: true,
    primaryImage: true,
    minPrice: true,
    maxPrice: true,
    category: true,
    url: true,
    vendor: true,
    status: true,
  })),
  preferences: z.object({
    category: z.string().optional(),
    color: z.string().optional(),
    maxPrice: z.number().optional(),
  }).optional(),
});

export type ChatResponse = z.infer<typeof ChatResponseSchema>;

// ============================================================================
// Try-on API
// ============================================================================

export const TryonRequestSchema = z.object({
  productIds: z.array(z.string()).min(1).max(5),
});

export const TryonResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  resultImageUrl: z.string().optional(),
  errorMessage: z.string().optional(),
});

export type TryonRequest = z.infer<typeof TryonRequestSchema>;
export type TryonResponse = z.infer<typeof TryonResponseSchema>;

// ============================================================================
// Visual Search API
// ============================================================================

export const VisualSearchRequestSchema = z.object({
  imageUrl: optionalUrlSchema,
  text: z.string().optional(),
});

export const VisualSearchResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  results: z.array(ProductCardSchema.pick({
    id: true,
    shopId: true,
    handle: true,
    title: true,
    images: true,
    primaryImage: true,
    minPrice: true,
    maxPrice: true,
    category: true,
    url: true,
    vendor: true,
    status: true,
  })).optional(),
});

export type VisualSearchRequest = z.infer<typeof VisualSearchRequestSchema>;
export type VisualSearchResponse = z.infer<typeof VisualSearchResponseSchema>;

// ============================================================================
// User Preferences API
// ============================================================================

export const UserPreferencesUpdateSchema = z.object({
  category: z.string().optional(),
  color: z.string().optional(),
  maxPrice: z.number().optional(),
  minPrice: z.number().optional(),
  style: z.array(z.string()).optional(),
  size: z.string().optional(),
});

export type UserPreferencesUpdate = z.infer<typeof UserPreferencesUpdateSchema>;

// ============================================================================
// Cart API
// ============================================================================

export const AddCartItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().default(1),
});

export const UpdateCartItemSchema = z.object({
  quantity: z.number().int().positive(),
});

export type AddCartItem = z.infer<typeof AddCartItemSchema>;
export type UpdateCartItem = z.infer<typeof UpdateCartItemSchema>;


// ============================================================================
// Prava Payments API
// ============================================================================

export const PravaConnectionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  provider: z.string(),
  providerAccountId: z.string().nullable().optional(),
  providerSubject: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  status: z.string(),
  metadata: z.record(z.any()).optional().default({}),
  linkedAt: z.coerce.date(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const PravaPaymentSessionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  cartId: z.string().nullable().optional(),
  merchantName: z.string(),
  merchantUrl: z.string().url(),
  merchantCountry: z.string(),
  totalAmount: z.number(),
  currency: z.string(),
  status: z.string(),
  approvalUrl: z.string().url().nullable().optional(),
  providerSessionId: z.string().nullable().optional(),
  providerCheckoutId: z.string().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.any()).optional().default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const PravaMandateSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  scope: z.enum(["listed", "any"]),
  frequency: z.enum(["one_time", "weekly", "monthly", "yearly"]),
  merchantName: z.string().nullable().optional(),
  merchantUrl: z.string().url().nullable().optional(),
  merchantCountry: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  approvalUrl: z.string().url().nullable().optional(),
  providerMandateId: z.string().nullable().optional(),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date().nullable().optional(),
  metadata: z.record(z.any()).optional().default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const PravaTransactionSchema = z.object({
  id: z.string(),
  userId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
  paymentSessionId: z.string().nullable().optional(),
  mandateId: z.string().nullable().optional(),
  merchantName: z.string(),
  merchantUrl: z.string().url(),
  merchantCountry: z.string(),
  amount: z.number(),
  currency: z.string(),
  status: z.string(),
  providerTransactionId: z.string().nullable().optional(),
  approvalStatus: z.string().nullable().optional(),
  authorizationCode: z.string().nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  metadata: z.record(z.any()).optional().default({}),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});


