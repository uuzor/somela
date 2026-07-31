import { Router } from "express";
import { db, userPreferences } from "../db/index.js";
import { eq } from "drizzle-orm";
import { UserPreferencesUpdateSchema } from "../types/api.js";
import { requireSupabaseUser } from "../middleware/supabaseAuth.js";

export const preferencesRouter = Router();

function formatPreferences(prefs: any) {
  return {
    category: prefs?.category ?? null,
    colors: prefs?.preferredColors || [],
    maxPrice: prefs?.maxPrice ? parseFloat(String(prefs.maxPrice)) : null,
    minPrice: prefs?.minPrice ? parseFloat(String(prefs.minPrice)) : null,
    styles: prefs?.preferredStyles || [],
    sizes: prefs?.sizes || [],
  };
}

function buildPreferenceRecord(updates: any, existing?: any) {
  return {
    category: updates.category !== undefined ? updates.category : existing?.category ?? null,
    preferredColors: updates.color !== undefined ? [updates.color] : existing?.preferredColors || [],
    preferredStyles: updates.style !== undefined ? updates.style : existing?.preferredStyles || [],
    maxPrice: updates.maxPrice !== undefined ? String(updates.maxPrice) : existing?.maxPrice ?? null,
    minPrice: updates.minPrice !== undefined ? String(updates.minPrice) : existing?.minPrice ?? null,
    sizes: updates.size !== undefined ? [updates.size] : existing?.sizes || [],
  };
}

// GET /api/preferences - Get current user preferences
preferencesRouter.get("/", async (req, res) => {
  try {
    const user = await requireSupabaseUser(req);

    const [prefs] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
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

    res.json(formatPreferences(prefs));
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("Preferences fetch error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Failed to fetch preferences" });
  }
});

// PUT /api/preferences - Update user preferences
preferencesRouter.put("/", async (req, res) => {
  try {
    const user = await requireSupabaseUser(req);
    const updates = UserPreferencesUpdateSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id))
      .limit(1);

    const record = buildPreferenceRecord(updates, existing);

    if (existing) {
      const [updated] = await db
        .update(userPreferences)
        .set({
          ...record,
          updatedAt: new Date(),
        })
        .where(eq(userPreferences.userId, user.id))
        .returning();

      return res.json(formatPreferences(updated));
    }

    const [created] = await db
      .insert(userPreferences)
      .values({
        userId: user.id,
        ...record,
      })
      .returning();

    res.json(formatPreferences(created));
  } catch (error) {
    const status = (error as any)?.status || 400;
    console.error("Preferences update error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Invalid preferences", details: error });
  }
});

// DELETE /api/preferences - Clear user preferences
preferencesRouter.delete("/", async (req, res) => {
  try {
    const user = await requireSupabaseUser(req);

    await db
      .delete(userPreferences)
      .where(eq(userPreferences.userId, user.id));

    res.status(204).send();
  } catch (error) {
    const status = (error as any)?.status || 500;
    console.error("Preferences delete error:", error);
    res.status(status).json({ error: status === 401 ? "Missing authorization" : "Failed to delete preferences" });
  }
});
