import { Router } from "express";
import { db, conversations, products } from "../db/index.js";
import { eq } from "drizzle-orm";
import { ChatRequestSchema } from "../types/api.js";
import { strictRateLimit } from "../middleware/rateLimit.js";

export const chatRouter = Router();

// Apply strict rate limiting (chat is expensive)
chatRouter.post("/", strictRateLimit);

// Placeholder for AI-powered chat discovery - requires ANTHROPIC_API_KEY
// Full implementation in Phase 3

// POST /api/chat - Send a chat message
chatRouter.post("/", async (req, res) => {
  try {
    const input = ChatRequestSchema.parse(req.body);
    
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(503).json({
        error: "Chat not available",
        reason: "ANTHROPIC_API_KEY not configured",
      });
    }
    
    // TODO: Implement discovery agent with Claude SDK
    // For now, return placeholder
    res.json({
      reply: "AI chat discovery coming in Phase 3. Try /api/catalog for now!",
      message: "Discovery agent not yet implemented",
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(400).json({ error: "Invalid chat request", details: error });
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
