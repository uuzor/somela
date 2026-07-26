# Cart & AI Session Persistence Plan

## Current State
- No cart tables or routes exist.
- `conversations` table exists but chat endpoints only save user/assistant text; tool calls and tool results are stripped out.
- `agent.ts` builds full OpenAI message history internally but never returns it to the caller.
- No API endpoints exist to list, fetch, or delete AI sessions/conversations.

## Goals
1. Implement a shopping cart supporting both guest (session) and authenticated (user) contexts.
2. Persist full AI session history including tool calls and tool results.
3. Expose AI session management via REST API.

---

## 1. Cart Implementation

### Schema Changes (`backend/src/db/schema.ts`)
Add two new tables:

```typescript
export const carts = pgTable("carts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  sessionId: text("session_id"),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cartItems = pgTable("cart_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  cartId: uuid("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
  productId: text("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  variantId: text("variant_id"),
  quantity: serial("quantity").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Add relations:
- `cartsRelations`: user, session, items
- `cartItemsRelations`: cart, product

### Cart Routes (`backend/src/routes/cart.ts`)
New router with these endpoints:

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/cart` | `x-user-id` header or `sessionId` query | Return active cart with items |
| `POST` | `/api/cart/items` | `x-user-id` header or `sessionId` query | Add item (`productId`, optional `variantId`, optional `quantity`) |
| `PUT` | `/api/cart/items/:itemId` | `x-user-id` header or `sessionId` query | Update item quantity |
| `DELETE` | `/api/cart/items/:itemId` | `x-user-id` header or `sessionId` query | Remove item |

**Resolution logic:** If `x-user-id` header is present, resolve cart by `userId`. Otherwise resolve by `sessionId` from query param. If no cart exists, create one on first write.

### Validation Schemas (`backend/src/types/api.ts`)
Add Zod schemas:
- `CartItemSchema`: `productId` (string, required), `variantId` (string, optional), `quantity` (number, min 1, default 1)
- `CartResponseSchema`: `cartId`, `items` array with product/variant/quantity/price info

---

## 2. Full AI Session Persistence

### Problem
`chat.ts` saves only:
```typescript
{ role: "user", content: message }
{ role: "assistant", content: result.chatReply }
```
Tool calls, tool results, and intermediate assistant messages with `tool_calls` are lost.

### Changes

#### `backend/src/services/agent.ts`
- Add `messages` field to `AgentResponse`:
  ```typescript
  export interface AgentResponse {
    chatReply: string;
    uiPayload: UIPayload;
    actions: UIAction[];
    conversationId: string;
    messages: AgentMessage[]; // full history including tool_calls
  }
  ```
- In `runAgentStream`, collect the full `messages` array alongside `finalReply`, `actions`, and `uiPayload`.
- In `runAgent`, pass `messages` through in the return value.

#### `backend/src/routes/chat.ts`
- Replace the hand-rolled `newHistory` save with the full `result.messages` array from the agent.
- Preserve existing `conversationHistory` loading behavior.
- Ensure `tool_calls` and `tool_call_id` are preserved in saved JSONB.

#### `backend/src/types/api.ts`
- Update `AgentMessageSchema` to allow `tool_calls` (array) and `tool_call_id` (string, optional).

---

## 3. AI Session Management API

### New Endpoints (`backend/src/routes/chat.ts` or separate `backend/src/routes/sessions.ts`)

| Method | Path | Auth | Behavior |
|--------|------|------|----------|
| `GET` | `/api/chat/sessions` | `x-user-id` header | List all sessions for user with metadata |
| `GET` | `/api/chat/sessions/:id` | `x-user-id` header | Get full session including messages |
| `DELETE` | `/api/chat/sessions/:id` | `x-user-id` header | Delete session and its messages |

**Response shape for list:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "sessionId": "string",
      "createdAt": "...",
      "updatedAt": "...",
      "messageCount": 12,
      "lastMessage": "..."
    }
  ]
}
```

**Response shape for detail:**
```json
{
  "id": "uuid",
  "sessionId": "string",
  "messages": [ /* full AgentMessage[] including tool_calls */ ],
  "lastPreferences": { ... },
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## 4. Tests

### Cart Tests (`backend/src/routes/cart.test.ts`)
- Guest cart: create via sessionId, add item, update quantity, delete item, get cart
- Auth cart: create via userId, add item, ensure session cart is isolated
- Edge cases: adding same product twice increases quantity, deleting nonexistent item returns 404

### AI Session Persistence Tests (`backend/src/routes/chat.test.ts`)
- Tool call round-trip: mock agent response containing `tool_calls`, verify saved messages include them
- Tool result round-trip: mock agent response containing `tool_call_id`, verify saved messages include them
- Session list: create multiple sessions, verify list returns correct metadata
- Session detail: verify full message array returned
- Session delete: verify messages removed

### Validation Tests (`backend/src/services/validation.test.ts`)
- `AgentMessageSchema` accepts `tool_calls` and `tool_call_id`

---

## 5. Implementation Order
1. Schema: add `carts`, `cart_items`, and relations
2. Cart routes + validation schemas
3. Agent response: add `messages` field
4. Chat routes: persist full message history
5. Session management endpoints
6. Tests
7. Typecheck + test run

---

## Open Questions
None. Ready to finalize.
