import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// This is a filesystem stand-in for what should be a Postgres row scoped by
// RLS in production: `user_preferences where user_id = :userId`. The
// function signatures below are deliberately shaped like a scoped DB client
// (every call takes userId, every call only ever touches that user's row) —
// swapping the implementation for real Supabase/Postgres calls later
// shouldn't require touching the agent code that calls these.

export interface UserPreferences {
  category?: string;
  color?: string;
  updatedAt: string;
}

const STORE_DIR = "src/fixtures/preferences";

function pathFor(userId: string): string {
  // userId is never interpolated into a query string anywhere in this repo —
  // it only ever selects a file/row scoped to itself. Still worth sanitizing
  // before this touches a real filesystem or path-based store.
  const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(STORE_DIR, `${safeId}.json`);
}

export async function getUserPreferences(userId: string): Promise<UserPreferences | null> {
  try {
    const raw = await readFile(pathFor(userId), "utf-8");
    return JSON.parse(raw) as UserPreferences;
  } catch {
    return null; // no row yet — not an error
  }
}

export async function setUserPreferences(
  userId: string,
  prefs: Partial<Omit<UserPreferences, "updatedAt">>
): Promise<UserPreferences> {
  await mkdir(STORE_DIR, { recursive: true });
  const existing = (await getUserPreferences(userId)) ?? {};
  const merged: UserPreferences = {
    ...existing,
    ...prefs,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(pathFor(userId), JSON.stringify(merged, null, 2));
  return merged;
}