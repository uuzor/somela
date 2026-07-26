import { Router } from "express";
import { db, sessions, users } from "../db/index.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { defaultRateLimit } from "../middleware/rateLimit.js";

export const sessionsRouter = Router();

// Apply rate limiting
sessionsRouter.use(defaultRateLimit);

// POST /api/sessions - Create a new session (guest or authenticated)
sessionsRouter.post("/", async (req, res) => {
  try {
    const { userId, isGuest = true } = req.body;
    
    // Generate session token
    const sessionToken = randomUUID();
    
    // Session expires in 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    // If userId provided, use/create user
    let finalUserId = userId;
    if (!userId) {
      // Create anonymous user for guest
      finalUserId = `guest_${randomUUID().slice(0, 8)}`;
      
      // Create guest user
      await db.insert(users).values({
        id: finalUserId,
        email: null,
      }).onConflictDoNothing();
    }
    
    // Create session
    const [session] = await db.insert(sessions).values({
      userId: finalUserId,
      sessionToken,
      isGuest,
      expiresAt,
    }).returning();
    
    res.status(201).json({
      sessionId: session.id,
      sessionToken: session.sessionToken,
      userId: finalUserId,
      isGuest,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Session create error:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

// GET /api/sessions/:token - Get session by token
sessionsRouter.get("/:token", async (req, res) => {
  try {
    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, req.params.token))
      .limit(1);
    
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }
    
    // Update last active
    await db
      .update(sessions)
      .set({ lastActiveAt: new Date() })
      .where(eq(sessions.sessionToken, req.params.token));
    
    res.json({
      sessionId: session.id,
      userId: session.userId,
      isGuest: session.isGuest,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    console.error("Session fetch error:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// DELETE /api/sessions/:token - Invalidate session
sessionsRouter.delete("/:token", async (req, res) => {
  try {
    await db
      .delete(sessions)
      .where(eq(sessions.sessionToken, req.params.token));
    
    res.status(204).send();
  } catch (error) {
    console.error("Session delete error:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});
