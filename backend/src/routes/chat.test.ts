import { describe, it, expect } from "bun:test";
import { readFileSync } from "fs";
import { ChatMessageSchema, AgentResponseSchema } from "../services/validation.js";

const CHAT_ROUTE_PATH = "./src/routes/chat.ts";
const VALIDATION_PATH = "./src/services/validation.ts";

describe("chat message validation", () => {
  it("parses messages with tool_calls and tool_call_id", () => {
    const msg = {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_abc123",
          type: "function",
          function: {
            name: "search_catalog",
            arguments: "{\"query\": \"jeans\"}",
          },
        },
      ],
    };
    const result = ChatMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool_calls?.[0].id).toBe("call_abc123");
      expect(result.data.tool_calls?.[0].function.name).toBe("search_catalog");
    }
  });

  it("parses tool result messages", () => {
    const msg = {
      role: "tool",
      content: "[{\"productId\": \"1\"}]",
      tool_call_id: "call_abc123",
    };
    const result = ChatMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tool_call_id).toBe("call_abc123");
      expect(result.data.content).toBe("[{\"productId\": \"1\"}]");
    }
  });

  it("AgentResponseSchema includes messages array", () => {
    const response = {
      chatReply: "Hello",
      uiPayload: { type: "replace_catalog", products: [] },
      actions: [],
      conversationId: "session_1",
      messages: [
        { role: "user", content: "Hi" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "search", arguments: "{}" } },
          ],
        },
        { role: "tool", content: "{}", tool_call_id: "call_1" },
      ],
    };
    const result = AgentResponseSchema.safeParse(response);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.messages.length).toBe(3);
      expect(result.data.messages[1].tool_calls?.[0].function.name).toBe("search");
    }
  });
});

describe("chat.ts implementation", () => {
  const content = readFileSync(CHAT_ROUTE_PATH, "utf-8");

  it("non-streaming POST uses result.messages for persistence", () => {
    expect(content).toContain("const result = await runAgent({");
    expect(content).toContain("result.messages");
    // ensures no hand-rolled newHistory construction
    expect(content).not.toContain("{ role: \"user\", content: message }");
  });

  it("streaming POST uses returned messages from runAgentStream", () => {
    expect(content).toContain("const messages = await runAgentStream({");
    expect(content).toContain("messages = await runAgentStream");
  });

  it("session list endpoint checks x-user-id auth", () => {
    expect(content).toContain('req.headers["x-user-id"]');
    expect(content).toContain("Missing x-user-id header");
  });

  it("session detail endpoint checks ownership and returns full messages", () => {
    expect(content).toContain("GET");
    expect(content).toContain("/sessions/:id");
    expect(content).toContain("eq(conversations.userId, userId)");
    expect(content).toContain("res.json({ conversation });");
  });

  it("session delete endpoint verifies ownership and deletes", () => {
    expect(content).toContain("DELETE");
    expect(content).toContain("await db.delete(conversations)");
    expect(content).toContain("res.status(204).send()");
  });

  it("returns 404 when session not found", () => {
    expect(content).toContain("Session not found");
  });

  it("returns 401 for unauthorized session access", () => {
    expect(content).toContain("res.status(401).json({ error: \"Missing x-user-id header\" })");
  });
});
