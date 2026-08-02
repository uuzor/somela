import { createClient, type User } from '@supabase/supabase-js';
import type { Request } from 'express';
import { eq } from 'drizzle-orm';
import { db, users, sessions } from '../db/index.js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://xqfwcyodibmtzmfhjyqf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for auth verification');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

export type RequestIdentity = {
  authUser: User | null;
  userId: string | null;
  sessionId: string | null;
  isAuthenticated: boolean;
};

function readBearerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token || null;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}


async function ensureUserRecord(userId: string, email: string | null = null) {
  const [existing] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const resolvedEmail = email ?? existing?.email ?? null;

  await db
    .insert(users)
    .values({
      id: userId,
      email: resolvedEmail,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: resolvedEmail,
        updatedAt: new Date(),
      },
    });
}

async function ensureSessionRecord(sessionId: string, userId: string | null = null) {
  if (!isUuidLike(sessionId)) {
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await db
    .insert(sessions)
    .values({
      id: sessionId as any,
      userId,
      sessionToken: sessionId,
      isGuest: !userId,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        userId,
        sessionToken: sessionId,
        isGuest: !userId,
        expiresAt,
        lastActiveAt: new Date(),
      },
    });
}
export async function getVerifiedSupabaseUser(req: Request): Promise<User | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError = new Error(error?.message || 'Invalid or expired authorization token');
    (authError as any).status = 401;
    throw authError;
  }

  return data.user;
}

export async function resolveRequestIdentity(req: Request): Promise<RequestIdentity> {
  const authUser = await getVerifiedSupabaseUser(req);
  const sessionId = (req.body?.sessionId as string | undefined) || (req.query.sessionId as string | undefined) || null;
  const fallbackUserId = (req.header('x-user-id') as string | undefined) || null;

  const userId = authUser?.id || fallbackUserId;
  if (userId) {
    await ensureUserRecord(userId, authUser?.email || null);
  }
  if (sessionId) {
    await ensureSessionRecord(sessionId, userId);
  }

  return {
    authUser,
    userId,
    sessionId,
    isAuthenticated: Boolean(authUser),
  };
}

export async function requireSupabaseUser(req: Request): Promise<User> {
  const user = await getVerifiedSupabaseUser(req);
  if (!user) {
    const error = new Error('Missing authorization');
    (error as any).status = 401;
    throw error;
  }
  await ensureUserRecord(user.id, user.email || null);
  await ensureSessionRecord(user.id, user.id);
  return user;
}


export async function ensureUserExists(userId: string, email: string | null = null) {
  await ensureUserRecord(userId, email);
}