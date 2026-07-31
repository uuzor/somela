import { Router } from "express";
import { db, sessions, users } from "../db/index.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { defaultRateLimit } from "../middleware/rateLimit.js";
import { resolveRequestIdentity, requireSupabaseUser } from "../middleware/supabaseAuth.js";

export const sessionsRouter = Router();

// Apply rate limiting
sessionsRouter.use(defaultRateLimit);

// POST /api/sessions - Create a new session (guest or authenticated)
sessionsRouter.post("/", async (req, res) => {
  try {
    const identity = await resolveRequestIdentity(req);
    const bodyUserId = typeof req.body?.userId === "string" ? req.body.userId : null;
    const isGuest = Boolean(req.body?.isGuest ?? true);

    // Generate session token
    const sessionToken = randomUUID();

    // Session expires in 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    let finalUserId = identity.authUser?.id || bodyUserId;
    let finalIsGuest = isGuest && !identity.authUser;

    if (identity.authUser) {
      finalUserId = identity.authUser.id;
      finalIsGuest = false;
      await db
        .insert(users)
        .values({
          id: identity.authUser.id,
          email: identity.authUser.email || null,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            email: identity.authUser.email || null,
            updatedAt: new Date(),
          },
        });
    }

    if (!finalUserId) {
      // Create anonymous user for guest
      finalUserId = `guest_${randomUUID().slice(0, 8)}`;
      finalIsGuest = true;

      await db.insert(users).values({
        id: finalUserId,
        email: null,
      }).onConflictDoNothing();
    }

    // Create session
    const [session] = await db.insert(sessions).values({
      userId: finalUserId,
      sessionToken,
      isGuest: finalIsGuest,
      expiresAt,
    }).returning();

    res.status(201).json({
      sessionId: session.id,
      sessionToken: session.sessionToken,
      userId: finalUserId,
      isGuest: finalIsGuest,
      expiresAt: session.expiresAt,
    });
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("Session create error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Failed to create session" });
  }
});

// GET /api/sessions/:token - Get session by token
sessionsRouter.get("/:token", async (req, res) => {
  try {
    const authUser = await requireSupabaseUser(req).catch(() => null);

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, req.params.token))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (authUser && session.userId !== authUser.id) {
      return res.status(403).json({ error: "Session does not belong to the authenticated user" });
    }

    if (new Date(session.expiresAt) < new Date()) {
      return res.status(401).json({ error: "Session expired" });
    }

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
    const status = (error as any)?.status || 500;
    console.error("Session fetch error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Failed to fetch session" });
  }
});

// DELETE /api/sessions/:token - Invalidate session
sessionsRouter.delete("/:token", async (req, res) => {
  try {
    const authUser = await requireSupabaseUser(req).catch(() => null);

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.sessionToken, req.params.token))
      .limit(1);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (authUser && session.userId !== authUser.id) {
      return res.status(403).json({ error: "Session does not belong to the authenticated user" });
    }

    await db
      .delete(sessions)
      .where(eq(sessions.sessionToken, req.params.token));

    res.status(204).send();
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("Session delete error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Failed to delete session" });
  }
});
