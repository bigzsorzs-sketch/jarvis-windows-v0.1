import React, { createContext, useState, useContext, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { appParams } from '@/lib/app-params';
import { createAxiosClient } from '@jarvis/sdk/dist/utils/axios-client';
import { useUserStore } from '@/lib/appStore';
import { logger } from '@/lib/logger';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const setUserState = useUserStore((state) => state.setUserState);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null); // Contains only { id, public_settings }

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      
      // First, check app public settings (with token if available)
      // This will tell us if auth is required, user not registered, etc.
      const appClient = createAxiosClient({
        baseURL: `/api/apps/public`,
        headers: {
          'X-App-Id': appParams.appId
        },
        token: appParams.token, // Include token if available
        interceptResponses: true
      });
      
      try {
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
        
        // If we got the app public settings successfully, check if user is authenticated
        if (appParams.token) {
          await checkUserAuth();
        } else {
          setIsLoadingAuth(false);
          setIsAuthenticated(false);
        }
        setIsLoadingPublicSettings(false);
      } catch (appError) {
        logger.error('AuthContext', 'App state check failed', { status: appError?.status, message: appError?.message });

        // Handle app-level errors
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          if (reason === 'auth_required') {
            setAuthError({
              type: 'auth_required',
              message: 'Authentication required'
            });
          } else if (reason === 'user_not_registered') {
            setAuthError({
              type: 'user_not_registered',
              message: 'User not registered for this app'
            });
          } else {
            setAuthError({
              type: reason,
              message: 'Nem sikerült megnyitni az appot.'
            });
          }
        } else {
          setAuthError({
            type: 'unknown',
            message: 'Nem sikerült betölteni az appot.'
          });
        }
        setIsLoadingPublicSettings(false);
        setIsLoadingAuth(false);
      }
    } catch (error) {
      logger.error('AuthContext', 'Unexpected app bootstrap error', { message: error?.message });
      setAuthError({
        type: 'unknown',
        message: 'Valami hiba történt betöltés közben.'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await jarvis.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setUserState({ user: currentUser, isAuthenticated: true, authError: null });
      setIsLoadingAuth(false);
    } catch (error) {
      logger.warn('AuthContext', 'User auth check failed', { status: error?.status, message: error?.message });
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setUser(null);
      setUserState({ user: null, isAuthenticated: false, authError: error.status === 401 || error.status === 403 ? { type: 'auth_required', message: 'Authentication required' } : null });
      
      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    setAuthError(null);
    setUserState({ user: null, isAuthenticated: false, authError: null });
    
    if (shouldRedirect) {
      // Use the SDK's logout method which handles token cleanup and redirect
      jarvis.auth.logout(window.location.href);
    } else {
      // Just remove the token without redirect
      jarvis.auth.logout();
    }
  };

  const navigateToLogin = () => {
    // Use the SDK's redirectToLogin method
    jarvis.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated, 
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
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