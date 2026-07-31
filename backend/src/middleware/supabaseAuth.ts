import { createClient, type User } from '@supabase/supabase-js';
import type { Request } from 'express';

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

  return {
    authUser,
    userId: authUser?.id || fallbackUserId,
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
  return user;
}
