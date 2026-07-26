import { Router } from "express";
import { db, conversations, products, userPreferences, sessions } from "../db/index.js";
import { eq, and } from "drizzle-orm";
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

export const chatRouter = Router();

// Apply strict rate limiting (chat is expensive)
chatRouter.post("/", strictRateLimit);

/**
 * POST /api/chat - Send a chat message (non-streaming)
 */
chatRouter.post("/", async (req, res) => {
  try {
    const input = ChatRequestSchema.parse(req.body);
    
    // Check for OpenAI or OpenRouter API key
    if (!isAgentAvailable()) {
      return res.status(503).json({
        error: "Chat not available",
        reason: "OPENAI_API_KEY or OPENROUTER_API_KEY not configured",
      });
    }
    
    // Get or create conversation
    const { sessionId, message } = input;
    const userId = input.userId || sessionId;
    
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
    
    // Load shopping state
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    // Build shopping state from preferences
    const shoppingState: ShoppingState = {
      activeFilters: {
        category: prefs?.preferredStyles?.[0],
        color: prefs?.preferredColors?.[0],
        minPrice: undefined,
        maxPrice: prefs?.maxPrice ? parseFloat(String(prefs.maxPrice)) : undefined,
      },
      visibleProductIds: [],
    };
    
    // Run the agent
    const result = await runAgent({
      sessionId,
      userId,
      message,
      conversationHistory,
      shoppingState,
    });
    
    // Save conversation to DB
    const newHistory: AgentMessage[] = [
      ...conversationHistory,
      { role: "user", content: message },
      { role: "assistant", content: result.chatReply },
    ];
    
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
  try {
    const input = ChatRequestSchema.parse(req.body);
    
    // Check for OpenAI or OpenRouter API key
    if (!isAgentAvailable()) {
      res.status(503).json({
        error: "Chat not available",
        reason: "OPENAI_API_KEY or OPENROUTER_API_KEY not configured",
      });
      return;
    }
    
    // Get or create conversation
    const { sessionId, message } = input;
    const userId = input.userId || sessionId;
    
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
    
    // Load shopping state
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    // Build shopping state from preferences
    const shoppingState: ShoppingState = {
      activeFilters: {
        category: prefs?.preferredStyles?.[0],
        color: prefs?.preferredColors?.[0],
        minPrice: undefined,
        maxPrice: prefs?.maxPrice ? parseFloat(String(prefs.maxPrice)) : undefined,
      },
      visibleProductIds: [],
    };
    
    // Set up SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    
    // Flush headers
    res.flushHeaders();
    
    // Send initial connection event
    res.write(formatSSEMessage({
      event: "connected",
      data: { sessionId, conversationId: sessionId },
    }));
    
    // Collect final state
    let finalReply = "";
    let finalUIPayload: any = null;
    let finalActions: any[] = [];
    
    // Streaming callback
    const sendEvent = (event: StreamingEvent) => {
      // Send event to client
      res.write(formatSSEMessage(event));
      
      // Collect final state
      if (event.event === "text") {
        finalReply += event.data;
      } else if (event.event === "ui_payload") {
        finalUIPayload = event.data;
      } else if (event.event === "ui_action") {
        finalActions.push(event.data);
      }
    };
    
    // Run the agent with streaming
    await runAgentStream({
      sessionId,
      userId,
      message,
      conversationHistory,
      shoppingState,
      onEvent: sendEvent,
    });
    
    // Save conversation to DB after streaming completes
    const newHistory: AgentMessage[] = [
      ...conversationHistory,
      { role: "user", content: message },
      { role: "assistant", content: finalReply },
    ];
    
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
    
    // End the stream
    res.end();
    
  } catch (error) {
    console.error("Chat stream error:", error);
    
    // Send error event
    res.write(formatSSEMessage({
      event: "error",
      data: {
        code: "CHAT_ERROR",
        message: error instanceof Error ? error.message : "An error occurred",
      },
    }));
    res.end();
  }
});

// GET /api/chat/history - Get chat history
chatRouter.get("/history", async (req, res) => {
  try {
    const userId = req.headers["x-user-id"] as string;
    
    if (!userId) {
      return res.status(401).json({ error: "Missing x-user-id header" });
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
