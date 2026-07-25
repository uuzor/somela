import { z } from "zod";

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
  imageUrl: z.string().url().optional(),
  limit: z.number().min(1).max(50).default(12),
});

export type SemanticSearch = z.infer<typeof SemanticSearchSchema>;

// ============================================================================
// Chat API
// ============================================================================

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

export const ChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1).max(2000),
  history: z.array(ChatMessageSchema).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  products: z.array(z.object({
    id: z.string(),
    title: z.string(),
    images: z.array(z.string()),
    minPrice: z.number().nullable(),
    maxPrice: z.number().nullable(),
    category: z.string().nullable(),
    url: z.string().nullable(),
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
  imageUrl: z.string().url().optional(),
  text: z.string().optional(),
});

export const VisualSearchResponseSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  results: z.array(z.object({
    productId: z.string(),
    title: z.string(),
    images: z.array(z.string()),
    distance: z.number(),
    confidence: z.enum(["exact", "close", "similar", "low"]),
    minPrice: z.number().nullable(),
    url: z.string().nullable(),
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
