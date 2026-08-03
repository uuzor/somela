import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  numeric,
  integer,
  serial,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { SessionKnowledge } from "../services/validation.js";

// Note: Use lakebase_vector extension in Neon
// Custom vector column type
type Vector1024 = string; // Stored as string "[1.0, 2.0, ...]"

// ============================================================================
// PRODUCTS
// ============================================================================

export const shops = pgTable("shops", {
  id: serial("id").primaryKey(),
  shopId: varchar("shop_id", { length: 100 }).notNull(), // e.g., "outdoor-voices"
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull(), // e.g., "outdoorvoices.com"
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  active: boolean("active").default(true).notNull(),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  shopIdUnique: uniqueIndex("shops_shop_id_key").on(table.shopId),
}));

// Product variants table
export const productVariants = pgTable("product_variants", {
  id: text("id").primaryKey(), // "{productId}:{variantId}"
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  shopVariantId: varchar("shop_variant_id", { length: 100 }),
  
  // Variant attributes
  title: varchar("title", { length: 255 }),
  color: varchar("color", { length: 50 }),
  size: varchar("size", { length: 20 }),
  
  // Pricing
  price: numeric("price", { precision: 10, scale: 2 }),
  
  // Stock
  stockQuantity: integer("stock_quantity"),
  available: boolean("available").default(true),
  
  // Image
  image: text("image"),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  productIdIdx: index("product_variants_product_idx").on(table.productId),
}));

export const products = pgTable("products", {
  id: text("id").primaryKey(), // "{shopId}:{shopifyProductId}"
  shopId: varchar("shop_id", { length: 100 }).notNull(),
  shop: text("shop").notNull().references(() => shops.shopId),
  handle: varchar("handle", { length: 255 }),
  
  // Core fields
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // yoga, top, bottom, dress, etc.
  vendor: varchar("vendor", { length: 255 }),
  productType: varchar("product_type", { length: 255 }),
  status: varchar("status", { length: 50 }).default("active"),
  
  // Images
  images: jsonb("images").$type<string[]>().default([]),
  processedImages: jsonb("processed_images").$type<string[]>().default([]), // After YouCam background removal
  
  // Variants (size/color combinations)
  variants: jsonb("variants").$type<ProductVariant[]>().default([]),
  options: jsonb("options").$type<ProductOption[]>().default([]),
  collections: jsonb("collections").$type<string[]>().default([]),
  seo: jsonb("seo").$type<ProductSeo | null>().default(null),
  
  // Pricing
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  compareAtPriceMin: numeric("compare_at_price_min", { precision: 10, scale: 2 }),
  compareAtPriceMax: numeric("compare_at_price_max", { precision: 10, scale: 2 }),
  onSale: boolean("on_sale").default(false),
  totalInventory: integer("total_inventory"),
  requiresShipping: boolean("requires_shipping"),
  taxable: boolean("taxable"),
  
  // Metadata
  tags: jsonb("tags").$type<string[]>().default([]),
  url: text("url"), // Canonical product page
  
  // Timestamps
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  shopIdIdx: index("products_shop_id_idx").on(table.shopId),
  categoryIdx: index("products_category_idx").on(table.category),
  vendorIdx: index("products_vendor_idx").on(table.vendor),
  statusIdx: index("products_status_idx").on(table.status),
  onSaleIdx: index("products_on_sale_idx").on(table.onSale),
  minPriceIdx: index("products_min_price_idx").on(table.minPrice),
}));

// ============================================================================
// ============================================================================
// PRODUCT EMBEDDINGS (Vector Search)
// ============================================================================

// Note: Embedding stored as text "[1.0, 2.0, ...]" for lakebase_vector compatibility
// Index creation handled separately via raw SQL in migrations
export const productEmbeddings = pgTable("product_embeddings", {
  productId: text("product_id").primaryKey().references(() => products.id, { onDelete: "cascade" }),
  embedding: text("embedding").notNull(), // Stored as vector string for lakebase_vector
  embeddedAt: timestamp("embedded_at", { withTimezone: true }).defaultNow().notNull(),
});

// SESSIONS (Guest + Authenticated)
// ============================================================================

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token", { length: 255 }).notNull(),
  
  // Auth type
  isGuest: boolean("is_guest").default(true).notNull(),
  
  // Timestamps
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
  sessionTokenIdx: uniqueIndex("sessions_session_token_key").on(table.sessionToken),
}));

// ============================================================================
// ============================================================================
// USERS
// ============================================================================

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Auth provider ID or generated
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  emailUnique: uniqueIndex("users_email_key").on(table.email),
}));

// USER PREFERENCES
// ============================================================================

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"), // Made optional for flexibility
  
  // Preference fields
  category: varchar("category", { length: 100 }),
  preferredColors: jsonb("preferred_colors").$type<string[]>().default([]),
  preferredStyles: jsonb("preferred_styles").$type<string[]>().default([]),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  
  // Additional preferences
  sizes: jsonb("sizes").$type<string[]>().default([]), // ["S", "M", "L"]
  dislikedItems: jsonb("disliked_items").$type<string[]>().default([]),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: uniqueIndex("user_preferences_user_id_idx").on(table.userId),
  sessionIdIdx: index("user_preferences_session_id_idx").on(table.sessionId),
}));

// ============================================================================
// USER SELFIE (For YouCam Try-on)
// ============================================================================

export const userSelfies = pgTable("user_selfies", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  processedImageUrl: text("processed_image_url"), // After YouCam prep
  isDefault: boolean("is_default").default(false),
  status: varchar("status", { length: 50 }).default("completed").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_selfies_user_id_idx").on(table.userId),
}));

// ============================================================================
// TRY-ON TASKS
// ============================================================================

export const tryonTasks = pgTable("tryon_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // Made nullable for flexibility
  sessionId: text("session_id"), // Made flexible
  
  // Products being tried on
  productId: text("product_id"), // Single product for AI try-on
  productIds: jsonb("product_ids").$type<string[]>().default([]), // Multiple products
  parentTaskId: uuid("parent_task_id"),
  sourceImageUrl: text("source_image_url"),
  garmentSlot: varchar("garment_slot", { length: 50 }),
  outfitState: jsonb("outfit_state").$type<Record<string, string>>().default({}),
  
  // Images
  garmentImageUrl: text("garment_image_url"),
  userSelfieUrl: text("user_selfie_url"),
  selfieId: uuid("selfie_id"),
  
  // Task status
  externalTaskId: text("external_task_id"), // YouCam task ID
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, completed, failed
  stage: varchar("stage", { length: 50 }).default("queued").notNull(),
  currentStep: integer("current_step").default(0).notNull(),
  totalSteps: integer("total_steps").default(1).notNull(),
  currentProductId: text("current_product_id"),
  
  // Results
  resultImageUrl: text("result_image_url"),
  errorMessage: text("error_message"),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  userIdIdx: index("tryon_tasks_user_id_idx").on(table.userId),
  statusIdx: index("tryon_tasks_status_idx").on(table.status),
  externalTaskIdIdx: index("tryon_tasks_external_idx").on(table.externalTaskId),
}));

// ============================================================================
// VISUAL SEARCH TASKS
// ============================================================================

export const visualSearchTasks = pgTable("visual_search_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").references(() => sessions.id),
  
  // Query
  queryImageUrl: text("query_image_url"),
  queryText: varchar("query_text", { length: 500 }),
  
  // Task status
  externalTaskId: text("external_task_id"), // YouCam task ID (for background removal)
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  
  // Results (cached after YouCam + embedding)
  results: jsonb("results").$type<VisualSearchResult[]>(),
  
  // Error
  errorMessage: text("error_message"),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  sessionIdIdx: index("visual_search_session_idx").on(table.sessionId),
  statusIdx: index("visual_search_status_idx").on(table.status),
}));

// ============================================================================
// CONVERSATIONS (Discovery Chat History)
// ============================================================================

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(), // Made nullable for flexibility
  sessionId: text("session_id"), // Made flexible, can be string or uuid
  
  // Messages stored as JSON for simplicity
  messages: jsonb("messages").$type<ChatMessage[]>().default([]),
  
  // State
  lastPreferences: jsonb("last_preferences").$type<Partial<UserPreferences>>(),
  sessionKnowledge: jsonb("session_knowledge").$type<SessionKnowledge>().default({}),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("conversations_user_id_idx").on(table.userId),
  sessionIdIdx: index("conversations_session_idx").on(table.sessionId),
}));

// ============================================================================
// CARTS (Shopping Cart)
// ============================================================================

export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("carts_user_id_idx").on(table.userId),
  sessionIdIdx: index("carts_session_id_idx").on(table.sessionId),
  statusIdx: index("carts_status_idx").on(table.status),
}));

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: text("variant_id"),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  cartIdIdx: index("cart_items_cart_id_idx").on(table.cartId),
  productIdIdx: index("cart_items_product_id_idx").on(table.productId),
}));

// ============================================================================
// TYPE EXPORTS (for use in application code)
// ============================================================================

// ============================================================================
// SAVED PRODUCTS / WISHLIST
// ============================================================================

export const savedProducts = pgTable("saved_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("saved_products_user_id_idx").on(table.userId),
  sessionIdIdx: index("saved_products_session_id_idx").on(table.sessionId),
  productIdIdx: index("saved_products_product_id_idx").on(table.productId),
  userProductUniqueIdx: uniqueIndex("saved_products_user_product_unique_idx").on(table.userId, table.productId),
  sessionProductUniqueIdx: uniqueIndex("saved_products_session_product_unique_idx").on(table.sessionId, table.productId),
}));

// ============================================================================
// PRAVA PAYMENTS
// ============================================================================

export const pravaConnections = pgTable("prava_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull().default("prava"),
  providerAccountId: text("provider_account_id"),
  providerSubject: text("provider_subject"),
  email: varchar("email", { length: 255 }),
  displayName: varchar("display_name", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("linked"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("prava_connections_user_id_idx").on(table.userId),
  sessionIdIdx: index("prava_connections_session_id_idx").on(table.sessionId),
  providerAccountIdx: index("prava_connections_provider_account_id_idx").on(table.providerAccountId),
}));

export const pravaPaymentSessions = pgTable("prava_payment_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
  merchantName: varchar("merchant_name", { length: 255 }).notNull(),
  merchantUrl: text("merchant_url").notNull(),
  merchantCountry: varchar("merchant_country", { length: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  approvalUrl: text("approval_url"),
  providerSessionId: text("provider_session_id"),
  providerCheckoutId: text("provider_checkout_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("prava_payment_sessions_user_id_idx").on(table.userId),
  sessionIdIdx: index("prava_payment_sessions_session_id_idx").on(table.sessionId),
  statusIdx: index("prava_payment_sessions_status_idx").on(table.status),
  providerSessionIdx: index("prava_payment_sessions_provider_session_id_idx").on(table.providerSessionId),
}));

export type CheckoutItemSnapshot = {
  productId?: string | null;
  cartItemId?: string | null;
  variantId?: string | null;
  name: string;
  image?: string | null;
  variant?: string | null;
  unitPrice: number;
  quantity: number;
};

export const checkouts = pgTable("checkouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  checkoutGroupId: uuid("checkout_group_id").notNull().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  cartId: uuid("cart_id").references(() => carts.id, { onDelete: "set null" }),
  paymentSessionId: uuid("payment_session_id").notNull().references(() => pravaPaymentSessions.id, { onDelete: "cascade" }),
  merchantName: varchar("merchant_name", { length: 255 }).notNull(),
  merchantUrl: text("merchant_url").notNull(),
  merchantCountry: varchar("merchant_country", { length: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
  shipping: numeric("shipping", { precision: 12, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  items: jsonb("items").$type<CheckoutItemSnapshot[]>().notNull().default([]),
  status: varchar("status", { length: 50 }).notNull().default("created"),
  providerSessionId: text("provider_session_id"),
  providerOrderId: text("provider_order_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureCode: text("failure_code"),
  failureMessage: text("failure_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("checkouts_user_id_idx").on(table.userId),
  sessionIdIdx: index("checkouts_session_id_idx").on(table.sessionId),
  groupIdIdx: index("checkouts_group_id_idx").on(table.checkoutGroupId),
  statusIdx: index("checkouts_status_idx").on(table.status),
  createdAtIdx: index("checkouts_created_at_idx").on(table.createdAt),
  paymentSessionUniqueIdx: uniqueIndex("checkouts_payment_session_id_key").on(table.paymentSessionId),
  providerSessionIdx: index("checkouts_provider_session_id_idx").on(table.providerSessionId),
  providerOrderIdx: index("checkouts_provider_order_id_idx").on(table.providerOrderId),
}));

export const pravaMandates = pgTable("prava_mandates", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  scope: varchar("scope", { length: 20 }).notNull().default("listed"),
  frequency: varchar("frequency", { length: 20 }).notNull().default("one_time"),
  merchantName: varchar("merchant_name", { length: 255 }),
  merchantUrl: text("merchant_url"),
  merchantCountry: varchar("merchant_country", { length: 2 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  approvalUrl: text("approval_url"),
  providerMandateId: text("provider_mandate_id"),
  validFrom: timestamp("valid_from", { withTimezone: true }).defaultNow().notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("prava_mandates_user_id_idx").on(table.userId),
  sessionIdIdx: index("prava_mandates_session_id_idx").on(table.sessionId),
  statusIdx: index("prava_mandates_status_idx").on(table.status),
  providerMandateIdx: index("prava_mandates_provider_mandate_id_idx").on(table.providerMandateId),
}));

export const pravaTransactions = pgTable("prava_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  paymentSessionId: uuid("payment_session_id").references(() => pravaPaymentSessions.id, { onDelete: "set null" }),
  mandateId: uuid("mandate_id").references(() => pravaMandates.id, { onDelete: "set null" }),
  merchantName: varchar("merchant_name", { length: 255 }).notNull(),
  merchantUrl: text("merchant_url").notNull(),
  merchantCountry: varchar("merchant_country", { length: 2 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  providerTransactionId: text("provider_transaction_id"),
  approvalStatus: varchar("approval_status", { length: 50 }),
  authorizationCode: text("authorization_code"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("prava_transactions_user_id_idx").on(table.userId),
  sessionIdIdx: index("prava_transactions_session_id_idx").on(table.sessionId),
  statusIdx: index("prava_transactions_status_idx").on(table.status),
  providerTransactionIdx: index("prava_transactions_provider_transaction_id_idx").on(table.providerTransactionId),
}));

export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  compareAtPrice?: number | null;
  available: boolean;
  availableForSale?: boolean;
  stockQuantity?: number | null;
  color?: string;
  size?: string;
  barcode?: string | null;
  requiresShipping?: boolean | null;
  taxable?: boolean | null;
  weight?: number | null;
  weightUnit?: string | null;
  image?: string | null;
}

export interface ProductOption {
  name: string;
  values: string[];
}

export interface ProductSeo {
  title?: string | null;
  description?: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

export interface VisualSearchResult {
  productId: string;
  distance: number;
  confidence: "exact" | "close" | "similar" | "low";
}

// User preferences type (for conversations.lastPreferences)
export interface UserPreferences {
  category?: string;
  color?: string;
  preferredColors?: string[];
  preferredStyles?: string[];
  maxPrice?: number;
  minPrice?: number;
  sizes?: string[];
  dislikedItems?: string[];
}

// ============================================================================
// RELATIONS
// ============================================================================

export const shopsRelations = relations(shops, ({ many }) => ({
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  shop: one(shops, {
    fields: [products.shopId],
    references: [shops.shopId],
  }),
  embedding: one(productEmbeddings, {
    fields: [products.id],
    references: [productEmbeddings.productId],
  }),
  variants: many(productVariants),
}));

export const productVariantsRelations = relations(productVariants, ({ one }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
}));

export const productEmbeddingsRelations = relations(productEmbeddings, ({ one }) => ({
  product: one(products, {
    fields: [productEmbeddings.productId],
    references: [products.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
  preferences: many(userPreferences),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  preferences: many(userPreferences),
  selfies: many(userSelfies),
  tryonTasks: many(tryonTasks),
  conversations: many(conversations),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [userPreferences.sessionId],
    references: [sessions.id],
  }),
}));

export const userSelfiesRelations = relations(userSelfies, ({ one, many }) => ({
  user: one(users, {
    fields: [userSelfies.userId],
    references: [users.id],
  }),
  tryonTasks: many(tryonTasks),
}));

export const tryonTasksRelations = relations(tryonTasks, ({ one }) => ({
  user: one(users, {
    fields: [tryonTasks.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [tryonTasks.sessionId],
    references: [sessions.id],
  }),
  selfie: one(userSelfies, {
    fields: [tryonTasks.selfieId],
    references: [userSelfies.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [conversations.sessionId],
    references: [sessions.id],
  }),
}));

export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, {
    fields: [carts.userId],
    references: [users.id],
  }),
  session: one(sessions, {
    fields: [carts.sessionId],
    references: [sessions.id],
  }),
  items: many(cartItems),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  cart: one(carts, {
    fields: [cartItems.cartId],
    references: [carts.id],
  }),
  product: one(products, {
    fields: [cartItems.productId],
    references: [products.id],
  }),
}));








