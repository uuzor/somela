import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  numeric,
  serial,
  boolean,
  uuid,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// Note: Use lakebase_vector extension in Neon
// Custom vector column type
type Vector1024 = string; // Stored as string "[1.0, 2.0, ...]"

// ============================================================================
// PRODUCTS
// ============================================================================

export const shops = pgTable("shops", {
  id: serial("id").primaryKey(),
  shopId: varchar("shop_id", { length: 100 }).notNull().unique(), // e.g., "outdoor-voices"
  name: varchar("name", { length: 255 }).notNull(),
  domain: varchar("domain", { length: 255 }).notNull(), // e.g., "outdoorvoices.com"
  baseUrl: varchar("base_url", { length: 500 }).notNull(),
  active: boolean("active").default(true).notNull(),
  lastFetchedAt: timestamp("last_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const products = pgTable("products", {
  id: text("id").primaryKey(), // "{shopId}:{shopifyProductId}"
  shopId: varchar("shop_id", { length: 100 }).notNull(),
  shop: text("shop").notNull().references(() => shops.shopId),
  
  // Core fields
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }), // yoga, top, bottom, dress, etc.
  
  // Images
  images: jsonb("images").$type<string[]>().default([]),
  processedImages: jsonb("processed_images").$type<string[]>().default([]), // After YouCam background removal
  
  // Variants (size/color combinations)
  variants: jsonb("variants").$type<ProductVariant[]>().default([]),
  
  // Pricing
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  
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
  minPriceIdx: index("products_min_price_idx").on(table.minPrice),
}));

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

// ============================================================================
// SESSIONS (Guest + Authenticated)
// ============================================================================

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionToken: varchar("session_token", { length: 255 }).notNull().unique(),
  
  // Auth type
  isGuest: boolean("is_guest").default(true).notNull(),
  
  // Timestamps
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("sessions_user_id_idx").on(table.userId),
  sessionTokenIdx: uniqueIndex("sessions_token_idx").on(table.sessionToken),
}));

// ============================================================================
// USERS
// ============================================================================

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Auth provider ID or generated
  email: varchar("email", { length: 255 }).unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ============================================================================
// USER PREFERENCES
// ============================================================================

export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
  
  // Preference fields
  category: varchar("category", { length: 100 }),
  color: varchar("color", { length: 50 }),
  maxPrice: numeric("max_price", { precision: 10, scale: 2 }),
  minPrice: numeric("min_price", { precision: 10, scale: 2 }),
  
  // Additional preferences
  style: jsonb("style").$type<string[]>().default([]), // boho, minimalist, etc.
  size: varchar("size", { length: 20 }),
  
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
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  imageUrl: text("image_url").notNull(),
  processedImageUrl: text("processed_image_url"), // After YouCam prep
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("user_selfies_user_id_idx").on(table.userId),
}));

// ============================================================================
// TRY-ON TASKS
// ============================================================================

export const tryonTasks = pgTable("tryon_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id),
  
  // Products being tried on
  productIds: jsonb("product_ids").$type<string[]>().notNull(),
  
  // Selfie used
  selfieId: uuid("selfie_id").references(() => userSelfies.id),
  
  // Task status
  externalTaskId: text("external_task_id"), // YouCam task ID
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, completed, failed
  
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
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sessionId: uuid("session_id").references(() => sessions.id),
  
  // Messages stored as JSON for simplicity
  messages: jsonb("messages").$type<ChatMessage[]>().default([]),
  
  // State
  lastPreferences: jsonb("last_preferences").$type<Partial<UserPreferences>>(),
  
  // Timestamps
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("conversations_user_id_idx").on(table.userId),
}));

// ============================================================================
// TYPE EXPORTS (for use in application code)
// ============================================================================

export interface ProductVariant {
  id: string;
  title: string;
  price: number;
  available: boolean;
  color?: string;
  size?: string;
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
  maxPrice?: number;
  minPrice?: number;
  style?: string[];
  size?: string;
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
