import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { request, setActiveUserId } from '@/services/apiClient';
import { supabase } from './supabase';

const AuthContext = createContext(null);
const APP_SESSION_STORAGE_PREFIX = 'opencommercelens_app_session';

function getStorageKey(userId) {
  return `${APP_SESSION_STORAGE_PREFIX}:${userId || 'anonymous'}`;
}

function readStoredAppSession(userId) {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredAppSession(userId, session) {
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(session));
    setActiveUserId(userId);
  } catch {
    // Ignore storage failures.
  }
}

function clearStoredAppSession(userId) {
  try {
    localStorage.removeItem(getStorageKey(userId));
    setActiveUserId(null);
  } catch {
    // Ignore storage failures.
  }
}

async function createBackendSession(userId) {
  const response = await request('/api/sessions', {
    method: 'POST',
    body: {
      userId,
      isGuest: false,
    },
  });

  const session = {
    sessionId: response.sessionId,
    sessionToken: response.sessionToken,
    userId: response.userId || userId,
    isGuest: Boolean(response.isGuest),
    expiresAt: response.expiresAt,
  };

  writeStoredAppSession(userId, session);
  return session;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState(null);
  const [isSessionSyncing, setIsSessionSyncing] = useState(false);

  const syncAppSession = useCallback(async (nextUser) => {
    if (!nextUser?.id) {
      setSession(null);
      return null;
    }

    setIsSessionSyncing(true);
    try {
      const stored = readStoredAppSession(nextUser.id);
      if (stored?.sessionId && stored?.userId === nextUser.id) {
        setSession(stored);
        setActiveUserId(nextUser.id);
        return stored;
      }

      const created = await createBackendSession(nextUser.id);
      setSession(created);
      setActiveUserId(nextUser.id);
      return created;
    } catch (error) {
      const fallback = {
        sessionId: nextUser.id,
        sessionToken: null,
        userId: nextUser.id,
        isGuest: false,
        expiresAt: null,
      };
      setSession(fallback);
      writeStoredAppSession(nextUser.id, fallback);
      setAuthError({
        type: 'session_sync_failed',
        message: error instanceof Error ? error.message : 'Failed to bind session',
      });
      return fallback;
    } finally {
      setIsSessionSyncing(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return;

      if (error) {
        setAuthError({ type: 'auth_error', message: error.message });
      }

      const nextSession = data?.session || null;
      setSupabaseSession(nextSession);
      setUser(nextSession?.user || null);
      setIsAuthenticated(Boolean(nextSession));

      if (nextSession?.user?.id) {
        const stored = readStoredAppSession(nextSession.user.id);
        if (stored?.sessionId) {
          setSession(stored);
          setActiveUserId(nextSession.user.id);
        } else {
          await syncAppSession(nextSession.user);
        }
      }

      setIsLoadingAuth(false);
      setAuthChecked(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, nextSession) => {
      if (!alive) return;

      setSupabaseSession(nextSession || null);
      setUser(nextSession?.user || null);
      setIsAuthenticated(Boolean(nextSession));
      setAuthError(null);

      if (event === 'SIGNED_OUT' || !nextSession?.user?.id) {
        setSession(null);
        setActiveUserId(null);
        return;
      }

      await syncAppSession(nextSession.user);
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [syncAppSession]);

  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (error) {
      setAuthError({
        type: 'auth_error',
        message: error.message,
      });
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    const currentUserId = user?.id;
    const currentSessionToken = session?.sessionToken;

    if (currentSessionToken) {
      request(`/api/sessions/${encodeURIComponent(currentSessionToken)}`, { method: 'DELETE' }).catch(() => {});
    }

    clearStoredAppSession(currentUserId);
    setSession(null);
    setUser(null);
    setSupabaseSession(null);
    setIsAuthenticated(false);
    setActiveUserId(null);
    await supabase.auth.signOut();
  }, [session?.sessionToken, user?.id]);

  const navigateToLogin = useCallback(() => {
    window.location.href = '/';
  }, []);

  const checkUserAuth = useCallback(async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setAuthError({ type: 'auth_error', message: error.message });
    }

    const nextSession = data?.session || null;
    setSupabaseSession(nextSession);
    setUser(nextSession?.user || null);
    setIsAuthenticated(Boolean(nextSession));
    setAuthChecked(true);

    if (nextSession?.user?.id) {
      const stored = readStoredAppSession(nextSession.user.id);
      if (stored?.sessionId) {
        setSession(stored);
        setActiveUserId(nextSession.user.id);
      } else {
        await syncAppSession(nextSession.user);
      }
    }
  }, [syncAppSession]);

  const value = useMemo(() => ({
    user,
    session,
    supabaseSession,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    authChecked,
    isSessionSyncing,
    logout,
    navigateToLogin,
    checkUserAuth,
    checkAppState: checkUserAuth,
    signInWithGoogle,
  }), [
    user,
    session,
    supabaseSession,
    isAuthenticated,
    isLoadingAuth,
    isLoadingPublicSettings,
    authError,
    appPublicSettings,
    authChecked,
    isSessionSyncing,
    logout,
    navigateToLogin,
    checkUserAuth,
    signInWithGoogle,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
