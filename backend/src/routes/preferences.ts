import { Router } from "express";
import { db, userPreferences, sessions } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { UserPreferencesUpdateSchema } from "../types/api.js";

export const preferencesRouter = Router();

// Middleware to extract userId from session
async function getUserIdFromSession(req: any, res: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization" });
    return null;
  }
  
  const token = authHeader.slice(7);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionToken, token))
    .limit(1);
  
  if (!session) {
    res.status(401).json({ error: "Invalid session" });
    return null;
  }
  
  return session.userId;
}

// GET /api/preferences - Get current user preferences
preferencesRouter.get("/", async (req, res) => {
  try {
    const userId = await getUserIdFromSession(req, res);
    if (!userId) return;
    
    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    if (!prefs) {
      return res.json({
        category: null,
        colors: [],
        maxPrice: null,
        minPrice: null,
        styles: [],
        sizes: [],
      });
    }
    
    res.json({
      category: prefs.category,
      colors: prefs.preferredColors || [],
      maxPrice: prefs.maxPrice ? parseFloat(String(prefs.maxPrice)) : null,
      minPrice: prefs.minPrice ? parseFloat(String(prefs.minPrice)) : null,
      styles: prefs.preferredStyles || [],
      sizes: prefs.sizes || [],
    });
  } catch (error) {
    console.error("Preferences fetch error:", error);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// PUT /api/preferences - Update user preferences
preferencesRouter.put("/", async (req, res) => {
  try {
    const userId = await getUserIdFromSession(req, res);
    if (!userId) return;
    
    const updates = UserPreferencesUpdateSchema.parse(req.body);
    
    // Convert numeric fields to strings for DB storage
    const dbUpdates = {
      ...updates,
      maxPrice: updates.maxPrice !== undefined ? String(updates.maxPrice) : undefined,
      minPrice: updates.minPrice !== undefined ? String(updates.minPrice) : undefined,
    };
    
    // Check if preferences exist
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    
    if (existing) {
      // Update existing
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...dbUpdates,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, userId))
        .returning();
      
      res.json({
        category: updated.category,
        colors: updated.preferredColors || [],
        maxPrice: updated.maxPrice ? parseFloat(String(updated.maxPrice)) : null,
        minPrice: updated.minPrice ? parseFloat(String(updated.minPrice)) : null,
        styles: updated.preferredStyles || [],
        sizes: updated.sizes || [],
      });
    } else {
      // Create new
      const [created] = await db
        .insert(userPreferences)
        .values({
          userId,
          ...dbUpdates,
        })
        .returning();
      
      res.json({
        category: created.category,
        colors: created.preferredColors || [],
        maxPrice: created.maxPrice ? parseFloat(String(created.maxPrice)) : null,
        minPrice: created.minPrice ? parseFloat(String(created.minPrice)) : null,
        styles: created.preferredStyles || [],
        sizes: created.sizes || [],
      });
    }
  } catch (error) {
    console.error("Preferences update error:", error);
    res.status(400).json({ error: "Invalid preferences", details: error });
  }
});

// DELETE /api/preferences - Clear user preferences
preferencesRouter.delete("/", async (req, res) => {
  try {
    const userId = await getUserIdFromSession(req, res);
    if (!userId) return;
    
    await db
      .delete(userPreferences)
      .where(eq(userPreferences.userId, userId));
    
    res.status(204).send();
  } catch (error) {
    console.error("Preferences delete error:", error);
    res.status(500).json({ error: "Failed to delete preferences" });
  }
});
