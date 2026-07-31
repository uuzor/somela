import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

const normalizeSession = (sessionLike) => sessionLike?.data?.sessionId ? sessionLike.data : sessionLike;

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      setIsLoadingAuth(true);
      // Check for existing session in localStorage
      const storedSession = localStorage.getItem('opencommercelens_session');
      
      if (storedSession) {
        const sessionData = normalizeSession(JSON.parse(storedSession));
        // Verify session is still valid
        const response = await apiClient.get(`/sessions/${sessionData.sessionToken}`);
        setSession(response);
        setUser({ id: response.userId });
        setIsAuthenticated(true);
      } else {
        // Create a new guest session
        const response = await apiClient.post('/sessions', { isGuest: true });
        setSession(response);
        localStorage.setItem('opencommercelens_session', JSON.stringify(response));
        setIsAuthenticated(true);
      }
      setAuthChecked(true);
    } catch (error) {
      console.error('Session initialization failed:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'Failed to initialize session'
      });
      // Create guest session even if verification fails
      try {
        const response = await apiClient.post('/sessions', { isGuest: true });
        setSession(response);
        localStorage.setItem('opencommercelens_session', JSON.stringify(response));
        setIsAuthenticated(true);
        setAuthChecked(true);
      } catch (e) {
        setAuthChecked(true);
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = useCallback(() => {
    if (session?.sessionToken) {
      apiClient.delete(`/sessions/${session.sessionToken}`).catch(console.error);
    }
    setUser(null);
    setSession(null);
    setIsAuthenticated(false);
    localStorage.removeItem('opencommercelens_session');
  }, [session]);

  const login = useCallback(async (userData) => {
    setUser(userData);
    setIsAuthenticated(true);
  }, []);

  const getSession = useCallback(() => session, [session]);

  const getSessionToken = useCallback(() => session?.sessionToken, [session]);

  return (
    <AuthContext.Provider value={{ 
      user, 
      session,
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      logout,
      login,
      getSession,
      getSessionToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


