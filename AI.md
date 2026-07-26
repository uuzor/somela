Complete agent tool set
Discovery tools
search_catalog({
  query,
  category?,
  color?,
  minPrice?,
  maxPrice?,
  store?,
  limit?
})

Use hybrid search:

Vector similarity for semantic intent
Structured filters for price, colour, category, size and store
Inventory filtering so unavailable variants are excluded

Other useful tools:

get_product_details({ productId })
get_available_variants({ productId })
set_user_preferences({ category?, colors?, sizes?, maxPrice? })
get_user_preferences()
Try-on tools

I would not give the model a tool that immediately sends the user’s selfie to YouCam. Split it into two operations:

suggest_try_on({
  productId,
  reason
})

This returns a UI action card. After the user taps “Try it on,” your backend calls:

initiate_try_on({
  productId,
  variantId?,
  confirmationToken
})

The second tool validates:

Authenticated user
Stored selfie and consent
Valid product image
User confirmation
Usage/rate limit
Idempotency key

Then add:

get_try_on_status({ tryOnId })

This lets the agent handle asynchronous YouCam processing without blocking the entire chat turn.

Payment tools

Your current tool list is missing the functionality that makes the project relevant to Prava:

prepare_purchase({
  productId,
  variantId,
  quantity
})

This should resolve the current price, availability, merchant and shipping information and store an immutable purchase intent.

request_purchase_confirmation({
  purchaseIntentId
})

This renders a confirmation card containing:

Product
Size and colour
Merchant
Item price
Shipping
Taxes
Maximum approved total

Only after the user confirms:

execute_prava_checkout({
  purchaseIntentId,
  confirmationToken
})

Finally:

get_purchase_status({
  purchaseIntentId
})

The model should never supply an arbitrary payment amount directly to execute_prava_checkout.

Fix the /chat route

POST /chat should become the single conversational entry point:

{
  "sessionId": "session_123",
  "message": "Show me blue yoga clothes under $80"
}

Its response should separate conversation from UI state:

{
  "chatReply": "I found six blue yoga outfits under $80.",
  "uiPayload": {
    "type": "replace_catalog",
    "products": []
  },
  "actions": [
    {
      "type": "suggest_try_on",
      "productId": "product_123"
    }
  ],
  "conversationId": "conversation_456"
}

Possible uiPayload.type values:

type UIPayload =
  | { type: "replace_catalog"; products: ProductCard[] }
  | { type: "show_product"; product: ProductCard }
  | { type: "suggest_try_on"; product: ProductCard }
  | { type: "try_on_started"; tryOnId: string }
  | { type: "try_on_completed"; resultUrl: string }
  | { type: "confirm_purchase"; purchase: PurchaseSummary }
  | { type: "payment_pending"; purchaseIntentId: string }
  | { type: "order_confirmed"; order: OrderSummary }
  | { type: "error"; code: string; message: string };

Both tapping and chatting should cause these same UI state transitions.

Memory design

Use three separate stores rather than sending an unlimited transcript into every call.

Memory	Stores	Lifetime
Conversation	Recent user/assistant/tool messages	Current session
User preferences	Sizes, colours, styles, budget and disliked items	Across sessions
Commerce state	Selected product, variant, try-on and purchase intent	Until completed/expired

The conversation state might look like:

interface ShoppingState {
  activeFilters: CatalogFilters;
  visibleProductIds: string[];
  focusedProductId?: string;
  selectedVariantId?: string;
  activeTryOnId?: string;
  purchaseIntentId?: string;
  checkoutStatus?: CheckoutStatus;
}

This is necessary for follow-ups such as:

“Make it cheaper.”
“Try the third one.”
“I prefer the first outfit.”
“Buy it in medium.”
“Has my payment completed?”

Do not expect the model to infer “the third one” solely from a long transcript. Pass the current visible product IDs as structured context.

Yes—you can use an OpenAI model with tools. It can iteratively search, compare, refine, initiate try-on and complete a Prava transaction. You do not need Claude Agent SDK.

The important thing is to use an **agent loop**, not one ordinary model call.

```text
User request
   ↓
Model reasons and selects a tool
   ↓
Backend executes tool
   ↓
Tool result returns to model
   ↓
Model evaluates the result
   ↓
Calls another tool or answers
```

For example:

```text
User: Find me blue yoga clothes under $80 and help me buy one.

Agent → get_user_preferences
Agent ← size M, prefers leggings

Agent → search_catalog
Agent ← 12 products

Agent → get_available_variants
Agent ← 4 matching products available in M

Agent → compare_products
Agent ← best three candidates

Agent → update_product_grid
Agent ← grid updated

Agent: I found three suitable options. Would you like to try them on?

User: Try the second one.

Agent → request_try_on
Agent ← confirmation required

User confirms

Agent → initiate_try_on
Agent ← try-on job created

Agent → get_try_on_status
Agent ← completed

User: I like it. Buy it.

Agent → prepare_purchase
Agent ← total $76.50

Agent: Confirm buying size M for $76.50?

User confirms

Agent → execute_prava_checkout
Agent ← Prava approval URL

User completes Prava approval

Agent → get_purchase_status
Agent ← order completed
```

## Which OpenAI integration?

Use the **OpenAI Agents SDK** if you want the framework to manage:

* Iterative tool calling
* Multiple agent turns
* Sessions
* Streaming
* Human approvals
* Guardrails
* Tracing
* Agent handoffs

You can also use the lower-level **Responses API**, but then you must implement more of the loop and state handling yourself.

For your project, I recommend:

```text
OpenAI Agents SDK
        +
OpenAI reasoning model
        +
Your catalog/try-on tools
        +
Prava MCP or API-backed payment tools
```

## Tools to provide

```typescript
const tools = [
  searchCatalog,
  getProductDetails,
  getAvailableVariants,
  getUserPreferences,
  setUserPreferences,
  suggestTryOn,
  initiateTryOn,
  getTryOnStatus,
  preparePurchase,
  executePravaCheckout,
  getPurchaseStatus
];
```

The agent’s instructions should describe the workflow and safety rules:

```text
You are a clothing-shopping agent.

Help users discover, compare, try on and purchase clothes.

Use search_catalog instead of inventing products.
Respect the user's saved size, style, colour and budget.
Check availability before recommending a product.
Never initiate a try-on without explicit confirmation.
Never execute a purchase without showing the product, variant,
merchant, currency and final price and receiving explicit confirmation.
After confirmation, use execute_prava_checkout.
Never claim that a payment succeeded until get_purchase_status
returns a successful result.
```

## Will it “reason well”?

Yes, provided you give it good tools and structured state. The model’s capability is only one part of the system.

For reliable reasoning:

* Return structured JSON from tools, not paragraphs.
* Keep each tool narrowly defined.
* Include product IDs and variant IDs.
* Store the visible grid state in your backend.
* Pass saved preferences as context.
* Limit each agent run to perhaps 8–12 tool calls.
* Require confirmation for expensive or privacy-sensitive actions.
* Use idempotency keys for try-on and checkout.
* Do not ask the model to calculate payment totals itself.
* Do not let the model decide whether confirmation happened—your backend verifies a confirmation token.

A suitable tool result would be:

```json
{
  "products": [
    {
      "productId": "prod_123",
      "name": "Recharge Legging",
      "price": {
        "amount": 72,
        "currency": "USD"
      },
      "availableVariants": [
        {
          "variantId": "var_456",
          "color": "blue",
          "size": "M",
          "inStock": true
        }
      ],
      "similarityScore": 0.91
    }
  ]
}
```

That is much easier for the model to reason over than scraped prose.

## One agent is sufficient initially

You do not need separate discovery and checkout models for the hackathon. Use one shopping agent but enforce permissions at the tool layer:

| Operation        | Model may request | Backend requirement                 |
| ---------------- | ----------------: | ----------------------------------- |
| Search catalog   |               Yes | None                                |
| Save preference  |               Yes | Valid authenticated/session user    |
| Suggest try-on   |               Yes | None                                |
| Start try-on     |               Yes | User confirmation                   |
| Prepare purchase |               Yes | Authenticated user                  |
| Execute checkout |               Yes | Confirmation token + Prava approval |
| Report success   |               Yes | Verified Prava result               |

The agent can reason and iterate freely, while your backend remains the final authority over real actions.

So yes: **OpenAI + tools is sufficient and probably a cleaner fit for this product than Claude Agent SDK.**
