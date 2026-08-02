/**
 * Validation Schemas for AI-Generated Data
 * 
 * Since AI can return inconsistent data, all responses must be validated
 * before being used in the UI. These Zod schemas ensure type safety.
 */

import { z } from "zod";

// ============================================================================
// Core Types
// ============================================================================

export const ProductCardSchema = z.object({
  productId: z.string(),
  title: z.string(),
  images: z.array(z.string().url()).default([]),
  minPrice: z.number().nullable(),
  maxPrice: z.number().nullable(),
  category: z.string().nullable(),
  url: z.string().url().nullable(),
  availableVariants: z.array(z.object({
    variantId: z.string(),
    color: z.string().optional(),
    size: z.string().optional(),
    inStock: z.boolean(),
  })).optional(),
});

export type ProductCard = z.infer<typeof ProductCardSchema>;

export interface CatalogFilters {
  query?: string;
  category?: string;
  color?: string;
  minPrice?: number;
  maxPrice?: number;
  store?: string;
  limit?: number;
}

export interface ShoppingState {
  activeFilters: CatalogFilters;
  visibleProductIds: string[];
  focusedProductId?: string;
  activeTryOnId?: string;
  purchaseIntentId?: string;
}

export interface SessionKnowledge {
  lastMessage?: string;
  lastChatState?: ChatState;
  lastAssistantIntent?: string;
  pendingConfirmation?: "checkout" | "try_on" | "cart" | "none";
  purchaseIntentId?: string | null;
  paymentSessionId?: string | null;
  approvalUrl?: string | null;
  cartSummary?: {
    cartId?: string | null;
    itemCount?: number;
    totalPrice?: number;
    currency?: string;
    updatedAt?: string;
  } | null;
  savedSummary?: {
    itemCount?: number;
    updatedAt?: string;
  } | null;
  lastProductIds?: string[];
}

export const ChatStateSchema = z.enum([
  "chat",
  "clarify",
  "show_catalog",
  "show_product",
  "comparison",
  "tryon",
  "checkout",
  "processing",
  "confirmation",
]);

export type ChatState = z.infer<typeof ChatStateSchema>;

export const ChatStateEventSchema = z.object({
  state: ChatStateSchema,
  reason: z.string().optional(),
  hasProducts: z.boolean().optional(),
  productCount: z.number().int().nonnegative().optional(),
  requiresInput: z.boolean().optional(),
});

export type ChatStateEvent = z.infer<typeof ChatStateEventSchema>;

export const VariantInfoSchema = z.object({
  variantId: z.string(),
  color: z.string().optional(),
  size: z.string().optional(),
  inStock: z.boolean(),
});

export type VariantInfo = z.infer<typeof VariantInfoSchema>;

export const PurchaseSummarySchema = z.object({
  productId: z.string(),
  variantId: z.string(),
  productName: z.string(),
  variant: z.string(),
  merchant: z.string(),
  itemPrice: z.number().min(0),
  shipping: z.number().min(0),
  taxes: z.number().min(0),
  total: z.number().min(0),
  currency: z.string().length(3), // ISO currency code
  purchaseIntentId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  providerSessionId: z.string().optional(),
  approvalUrl: z.string().url().nullable().optional(),
});

export type PurchaseSummary = z.infer<typeof PurchaseSummarySchema>;

export const OrderSummarySchema = z.object({
  orderId: z.string(),
  productName: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed", "refunded"]),
  total: z.number().min(0),
});

export type OrderSummary = z.infer<typeof OrderSummarySchema>;

// ============================================================================
// UIPayload Union - Strictly Validated
// ============================================================================

export const UIPayloadReplaceCatalogSchema = z.object({
  type: z.literal("replace_catalog"),
  products: z.array(ProductCardSchema),
});

export const UIPayloadShowProductSchema = z.object({
  type: z.literal("show_product"),
  product: ProductCardSchema,
});

export const UIPayloadSuggestTryOnSchema = z.object({
  type: z.literal("suggest_try_on"),
  product: ProductCardSchema,
});

export const UIPayloadTryOnStartedSchema = z.object({
  type: z.literal("try_on_started"),
  tryOnId: z.string().min(1),
});

export const UIPayloadTryOnCompletedSchema = z.object({
  type: z.literal("try_on_completed"),
  resultUrl: z.string().url(),
});

export const UIPayloadConfirmPurchaseSchema = z.object({
  type: z.literal("confirm_purchase"),
  purchase: PurchaseSummarySchema,
});

export const UIPayloadPaymentPendingSchema = z.object({
  type: z.literal("payment_pending"),
  purchaseIntentId: z.string().min(1),
  approvalUrl: z.string().url().nullable().optional(),
  providerSessionId: z.string().optional(),
});

export const UIPayloadOrderConfirmedSchema = z.object({
  type: z.literal("order_confirmed"),
  order: OrderSummarySchema,
});

export const UIPayloadErrorSchema = z.object({
  type: z.literal("error"),
  code: z.string(),
  message: z.string(),
});

// Union of all UIPayload types
export const UIPayloadSchema = z.discriminatedUnion("type", [
  UIPayloadReplaceCatalogSchema,
  UIPayloadShowProductSchema,
  UIPayloadSuggestTryOnSchema,
  UIPayloadTryOnStartedSchema,
  UIPayloadTryOnCompletedSchema,
  UIPayloadConfirmPurchaseSchema,
  UIPayloadPaymentPendingSchema,
  UIPayloadOrderConfirmedSchema,
  UIPayloadErrorSchema,
]);

export type UIPayload = z.infer<typeof UIPayloadSchema>;

// ============================================================================
// UIAction Validation
// ============================================================================

export const UIActionSchema = z.object({
  type: z.enum(["suggest_try_on", "confirm_checkout", "dismiss", "view_product"]),
  productId: z.string().optional(),
  tryOnId: z.string().optional(),
  purchaseIntentId: z.string().optional(),
});

export type UIAction = z.infer<typeof UIActionSchema>;

// ============================================================================
// Chat Message Validation (OpenAI Message Format)
// ============================================================================

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string().optional(),
  tool_calls: z.array(z.object({
    id: z.string(),
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
      arguments: z.string(),
    }),
  })).optional(),
  tool_call_id: z.string().optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

// ============================================================================
// Agent Response Validation
// ============================================================================

export const AgentResponseSchema = z.object({
  chatReply: z.string(),
  uiPayload: UIPayloadSchema,
  actions: z.array(UIActionSchema).default([]),
  conversationId: z.string(),
  messages: z.array(ChatMessageSchema),
  chatState: ChatStateSchema.default("chat"),
  updatedState: z.record(z.unknown()).optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

// ============================================================================
// Tool Result Validation (from AI function calls)
// ============================================================================

export const SearchCatalogResultSchema = z.object({
  products: z.array(z.object({
    productId: z.string(),
    title: z.string(),
    images: z.array(z.string()).default([]),
    minPrice: z.number().nullable().optional(),
    maxPrice: z.number().nullable().optional(),
    category: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    similarityScore: z.number().optional(),
  })),
});

export const GetProductDetailsResultSchema = z.object({
  productId: z.string().optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  images: z.array(z.string()).default([]),
  minPrice: z.number().nullable().optional(),
  maxPrice: z.number().nullable().optional(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  url: z.string().nullable().optional(),
});

export const GetAvailableVariantsResultSchema = z.object({
  variants: z.array(z.object({
    variantId: z.string(),
    color: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    price: z.number().nullable().optional(),
    inStock: z.boolean(),
  })),
});

export const SuggestTryOnResultSchema = z.object({
  suggestion: z.object({
    productId: z.string(),
    title: z.string(),
    images: z.array(z.string()),
    minPrice: z.number().nullable(),
    maxPrice: z.number().nullable(),
    category: z.string().nullable(),
    url: z.string().nullable(),
  }).nullable(),
  message: z.string().optional(),
});

export const PreparePurchaseResultSchema = z.object({
  purchaseIntentId: z.string().optional(),
  paymentSessionId: z.string().optional(),
  providerSessionId: z.string().optional(),
  approvalUrl: z.string().url().nullable().optional(),
  productId: z.string().optional(),
  productName: z.string().optional(),
  variant: z.string().optional(),
  merchant: z.string().optional(),
  itemPrice: z.number().optional(),
  shipping: z.number().optional(),
  taxes: z.number().optional(),
  total: z.number().optional(),
  currency: z.string().optional(),
  requiresConfirmation: z.boolean().optional(),
  message: z.string().optional(),
});

export const InitiateTryOnResultSchema = z.object({
  success: z.boolean().optional(),
  tryOnId: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  message: z.string().optional(),
});

export const ExecuteCheckoutResultSchema = z.object({
  success: z.boolean().optional(),
  orderId: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  message: z.string().optional(),
  approvalRequired: z.boolean().optional(),
});

export const GetPurchaseStatusResultSchema = z.object({
  purchaseIntentId: z.string().optional(),
  status: z.enum(["pending", "processing", "completed", "failed"]).optional(),
  message: z.string().optional(),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Safely validate and transform data with fallback
 */
export function validateOrDefault<T>(
  schema: z.ZodType<T>,
  data: unknown,
  defaultValue: T
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.warn("Validation failed, using default:", result.error.issues);
  return defaultValue;
}

/**
 * Validate UIPayload with error fallback
 */
export function safeValidateUIPayload(data: unknown): UIPayload {
  const result = UIPayloadSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  console.error("UIPayload validation failed:", result.error.issues);
  return {
    type: "error",
    code: "VALIDATION_ERROR",
    message: "Failed to validate UI payload. Please try again.",
  };
}

/**
 * Validate array of products with filtering
 */
export function safeValidateProducts(data: unknown): ProductCard[] {
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((p) => validateOrDefault(ProductCardSchema, p, null))
    .filter((p): p is ProductCard => p !== null);
}

/**
 * Validate tool result with error handling
 */
export function safeValidateToolResult<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return {
    success: false,
    error: result.error.issues.map(i => i.message).join(", "),
  };
}

// ============================================================================
// Streaming Event Types
// ============================================================================

export const StreamingEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("connected"),
    data: z.object({
      sessionId: z.string(),
      conversationId: z.string(),
      hasImage: z.boolean(),
      state: ChatStateSchema,
    }),
  }),
  z.object({
    event: z.literal("text"),
    data: z.string(),
  }),
  z.object({
    event: z.literal("tool_call"),
    data: z.object({
      name: z.string(),
      arguments: z.record(z.unknown()),
    }),
  }),
  z.object({
    event: z.literal("tool_result"),
    data: z.object({
      name: z.string(),
      result: z.unknown(),
    }),
  }),
  z.object({
    event: z.literal("ui_action"),
    data: UIActionSchema,
  }),
  z.object({
    event: z.literal("ui_state"),
    data: ChatStateEventSchema,
  }),
  z.object({
    event: z.literal("ui_payload"),
    data: UIPayloadSchema,
  }),
  z.object({
    event: z.literal("done"),
    data: z.object({
      reply: z.string(),
      uiPayload: UIPayloadSchema,
      actions: z.array(UIActionSchema),
      messages: z.array(ChatMessageSchema),
      chatState: ChatStateSchema,
    }),
  }),
  z.object({
    event: z.literal("error"),
    data: z.object({
      code: z.string(),
      message: z.string(),
    }),
  }),
]);

export type StreamingEvent = z.infer<typeof StreamingEventSchema>;

// ============================================================================
// Stream Format (SSE)
// ============================================================================

export type SSEMessage = {
  event: StreamingEvent["event"];
  data: string;
};

export function formatSSEMessage(event: StreamingEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}


