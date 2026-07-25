import Anthropic from "@anthropic-ai/sdk";
import { searchCatalog, type CatalogFilters } from "./catalog-query.js";
import { setUserPreferences } from "./user-preferences.js";
import type { Product } from "./types.js";

const anthropic = new Anthropic();

// Tool schemas the model can call. Note what's NOT here: there is no
// "userId" parameter on set_user_preference — the model never gets to
// choose whose row it writes to. The orchestrator injects the authenticated
// session's userId when it executes the tool call below. This is the
// concrete version of the "scoped write, not superuser" point from the
// architecture discussion — enforced in code, not just in a prompt.
const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_catalog",
    description: "Search the product catalog by category, color, and price range.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "e.g. yoga, denim, dress, outerwear, top, bottom" },
        color: { type: "string" },
        minPrice: { type: "number" },
        maxPrice: { type: "number" },
      },
    },
  },
  {
    name: "set_user_preference",
    description: "Save the user's current search preference for future sessions.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string" },
        color: { type: "string" },
      },
    },
  },
  {
    name: "respond_to_user",
    description:
      "Call this last, exactly once, to deliver the final answer: a short chat reply plus the ids of matching products to show in the UI.",
    input_schema: {
      type: "object",
      properties: {
        chatReply: { type: "string", description: "1-2 sentence conversational reply" },
        productIds: { type: "array", items: { type: "string" } },
      },
      required: ["chatReply", "productIds"],
    },
  },
];

export interface DiscoveryTurnResult {
  chatReply: string;
  uiPayload: Product[];
}

export async function runDiscoveryTurn(
  userId: string,
  userMessage: string
): Promise<DiscoveryTurnResult> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];

  // Every search_catalog call's results get held here so that when the
  // model finally calls respond_to_user with a list of productIds, we can
  // resolve those ids back to full Product objects for the UI payload
  // without trusting the model to echo product data back verbatim.
  let lastSearchResults: Product[] = [];

  for (let turn = 0; turn < 5; turn++) {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are a shopping discovery assistant. Parse the user's request into a " +
        "structured filter, save it as their preference, search the catalog, then " +
        "call respond_to_user exactly once with a short reply and the matching product ids.",
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolUses.length === 0) break; // model stopped without calling respond_to_user

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const use of toolUses) {
      if (use.name === "search_catalog") {
        const filters = use.input as CatalogFilters;
        lastSearchResults = await searchCatalog(filters);
        toolResults.push({
          type: "tool_result",
          tool_use_id: use.id,
          content: JSON.stringify(
            lastSearchResults.map((p) => ({ id: p.id, title: p.title, category: p.category }))
          ),
        });
      } else if (use.name === "set_user_preference") {
        const input = use.input as { category?: string; color?: string };
        // userId comes from the function argument (the authenticated caller),
        // never from the model's tool input — this is the enforcement point.
        await setUserPreferences(userId, input);
        toolResults.push({ type: "tool_result", tool_use_id: use.id, content: "saved" });
      } else if (use.name === "respond_to_user") {
        const input = use.input as { chatReply: string; productIds: string[] };
        const idSet = new Set(input.productIds);
        return {
          chatReply: input.chatReply,
          uiPayload: lastSearchResults.filter((p) => idSet.has(p.id)),
        };
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  throw new Error("Discovery turn did not resolve to a respond_to_user call within 5 tool turns");
}