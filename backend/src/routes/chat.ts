import { Router } from "express";
import { db, conversations, products, userPreferences, sessions } from "../db/index.js";
import { eq, and, sql } from "drizzle-orm";
import { ChatRequestSchema } from "../types/api.js";
import { strictRateLimit } from "../middleware/rateLimit.js";
import { 
  runAgent, 
  runAgentStream, 
  isAgentAvailable, 
  type ShoppingState, 
  type AgentMessage,
  type StreamingEvent,
} from "../services/agent.js";
import { formatSSEMessage } from "../services/validation.js";
import { resolveRequestIdentity } from "../middleware/supabaseAuth.js";

export const chatRouter = Router();

const logChatFlow = (requestId: string, step: string, meta?: unknown) => {
  console.log(`[CHAT_FLOW ${requestId}] ${step}`, meta ?? "");
};

// Apply strict rate limiting (chat is expensive)
chatRouter.post("/", strictRateLimit);

/**
 * POST /api/chat - Send a chat message (non-streaming)
 */
chatRouter.post("/", async (req, res) => {
  try {
    const requestId = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logChatFlow(requestId, "request_received", { path: req.path, bodyKeys: Object.keys(req.body || {}) });
    const input = ChatRequestSchema.parse(req.body);
    logChatFlow(requestId, "request_validated", { sessionId: input.sessionId, userId: input.userId || null, hasImage: !!input.imageUrl });
    const identity = await resolveRequestIdentity(req);
    
    // Check for OpenAI or OpenRouter API key
    if (!isAgentAvailable()) {
      return res.status(503).json({
        error: "Chat not available",
        reason: "OPENAI_API_KEY or OPENROUTER_API_KEY not configured",
      });
    }
    
    // Get or create conversation
    const { sessionId, message, imageUrl } = input;
    const userId = identity.userId || input.userId || sessionId;
    logChatFlow(requestId, "identity_resolved", { userId, sessionId, messageLength: message.length, hasImage: !!imageUrl });
    
    logChatFlow(requestId, "db_history_load_start");
    // Load conversation history from DB
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userId, userId), eq(conversations.sessionId, sessionId)))
      .limit(1);
    
    // Convert DB messages to agent format
    const conversationHistory: AgentMessage[] = conversation?.messages 
      ? (conversation.messages as any[]) 
      : [];
    
    logChatFlow(requestId, "db_history_load_ok", { conversationFound: !!conversation, messageCount: conversationHistory.length });

    // Load shopping state
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    // Build shopping state from preferences
    logChatFlow(requestId, "db_preferences_load_ok", { hasPreferences: !!prefs });
    const shoppingState: ShoppingState = {
      activeFilters: {
        category: prefs?.preferredStyles?.[0],
        color: prefs?.preferredColors?.[0],
        minPrice: undefined,
        maxPrice: prefs?.maxPrice ? parseFloat(String(prefs.maxPrice)) : undefined,
      },
      visibleProductIds: [],
    };
    
    // Run the agent (pass imageUrl for visual search)
    logChatFlow(requestId, "agent_start");
    const result = await runAgent({
      sessionId,
      userId,
      message,
      imageUrl,
      conversationHistory,
      shoppingState,
    });
    
    // Save conversation to DB using full message history from agent
    logChatFlow(requestId, "agent_complete", { replyLength: result.chatReply?.length || 0, actionCount: result.actions?.length || 0, messageCount: (result.messages || []).length });
    const newHistory = result.messages || [];
    
    if (conversation) {
      await db.update(conversations)
        .set({ 
          messages: newHistory as any,
          lastPreferences: prefs as any,
          updatedAt: new Date(),
        })
        .where(eq(conversations.id, conversation.id));
    } else {
      await db.insert(conversations).values({
        userId,
        sessionId,
        messages: newHistory as any,
        lastPreferences: prefs as any,
      });
    }
    

    res.json({
      reply: result.chatReply,
      uiPayload: result.uiPayload,
      actions: result.actions,
      conversationId: result.conversationId,
      state: result.updatedState?.chatState || result.chatState || "chat",
    });
    
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ 
      error: "Chat processing failed", 
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/chat/stream - Send a chat message with streaming response
 * Uses Server-Sent Events (SSE) to stream updates to the frontend
 */
chatRouter.post("/stream", strictRateLimit, async (req, res) => {
  const requestId = `chat_stream_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  try {
    logChatFlow(requestId, "stream_request_received", { path: req.path, bodyKeys: Object.keys(req.body || {}) });
    const input = ChatRequestSchema.parse(req.body);
    logChatFlow(requestId, "stream_request_validated", { sessionId: input.sessionId, userId: input.userId || null, hasImage: !!input.imageUrl });

    if (!isAgentAvailable()) {
      return res.status(503).json({
        error: "Chat not available",
        reason: "OPENAI_API_KEY or OPENROUTER_API_KEY not configured",
      });
    }

    const { sessionId, message, imageUrl } = input;
    const userId = input.userId || sessionId;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    logChatFlow(requestId, "stream_sse_start");
    res.write(formatSSEMessage({
      event: "connected",
      data: { sessionId, conversationId: sessionId, hasImage: !!imageUrl, state: "chat" },
    }));

    let reply = "";
    let uiPayload: any = { type: "replace_catalog", products: [] };
    let actions: any[] = [];
    let chatState = "chat";

    const messages = await runAgentStream({
      sessionId,
      userId,
      message,
      imageUrl,
      conversationHistory: [],
      shoppingState: {
        activeFilters: {
          category: undefined,
          color: undefined,
          minPrice: undefined,
          maxPrice: undefined,
        },
        visibleProductIds: [],
      },
      onEvent: (event) => {
        if (event.event === "text") {
          reply += event.data;
        } else if (event.event === "ui_payload") {
          uiPayload = event.data;
        } else if (event.event === "ui_action") {
          actions.push(event.data);
        } else if (event.event === "ui_state") {
          chatState = event.data.state;
        }

        res.write(formatSSEMessage(event));
      },
    });

    logChatFlow(requestId, "stream_agent_complete", {
      replyLength: reply.length,
      actionCount: actions.length,
      messageCount: messages.length,
      state: chatState,
    });

    logChatFlow(requestId, "stream_end");
    res.end();
  } catch (error) {
    logChatFlow(requestId, "stream_error", error instanceof Error ? error.message : String(error));
    console.error("Chat stream error:", error);

    if (res.headersSent) {
      res.write(formatSSEMessage({
        event: "error",
        data: {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "An error occurred",
        },
      }));
      res.end();
    } else {
      res.status(500).json({
        error: "Chat processing failed",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// GET /api/chat/history - Get chat history
chatRouter.get("/history", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;
    
    if (!userId) {
      return res.status(401).json({ error: "Missing authorization" });
    }
    
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .limit(1);
    
    if (!conversation) {
      return res.json({ messages: [], preferences: null });
    }
    

    res.json({
      messages: conversation.messages,
      preferences: conversation.lastPreferences,
    });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
});

/**
 * GET /api/chat/sessions - List all conversation sessions for a user
 */
chatRouter.get("/sessions", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;

    if (!userId) {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const results = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, userId))
      .orderBy(conversations.updatedAt);

    const sessions = results.map((c) => {
      const messages = c.messages ?? [];
      return {
        id: c.id,
        sessionId: c.sessionId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: messages.length,
        lastMessage: messages.length > 0 ? messages[messages.length - 1].content || "" : "",
      };
    });

    res.json({ sessions });
  } catch (error) {
    console.error("Chat sessions list error:", error);
    res.status(500).json({ error: "Failed to list chat sessions" });
  }
});

/**
 * GET /api/chat/sessions/:id - Get full conversation including all messages
 */
chatRouter.get("/sessions/:id", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;

    if (!userId) {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, userId)))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Session not found" });
    }


    res.json({ conversation });
  } catch (error) {
    console.error("Chat session detail error:", error);
    res.status(500).json({ error: "Failed to fetch chat session" });
  }
});

/**
 * DELETE /api/chat/sessions/:id - Delete a conversation session
 */
chatRouter.delete("/sessions/:id", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const userId = identity.userId;

    if (!userId) {
      return res.status(401).json({ error: "Missing authorization" });
    }

    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, req.params.id), eq(conversations.userId, userId)))
      .limit(1);

    if (!conversation) {
      return res.status(404).json({ error: "Session not found" });
    }

    await db.delete(conversations).where(eq(conversations.id, req.params.id));
    res.status(204).send();
  } catch (error) {
    console.error("Chat session delete error:", error);
    res.status(500).json({ error: "Failed to delete chat session" });
  }
});









