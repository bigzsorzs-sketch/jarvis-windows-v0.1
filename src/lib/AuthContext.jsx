import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { useUserStore } from '@/lib/appStore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState(null);
  const setUserState = useUserStore((state) => state.setUserState);

  const checkAppState = useCallback(async () => {
    setIsLoadingAuth(true);
    setAuthError(null);
    try {
      const currentUser = await jarvis.auth.me();
      const authenticated = Boolean(currentUser?.id);
      setUser(currentUser || null);
      setIsAuthenticated(authenticated);
      setUserState({ user:currentUser || null, isAuthenticated:authenticated, authError:null });
    } catch (error) {
      const nextError = { type:'local_profile_error', message:error?.message || String(error) };
      setUser(null);
      setIsAuthenticated(false);
      setAuthError(nextError);
      setUserState({ user:null, isAuthenticated:false, authError:nextError });
    } finally {
      setAuthChecked(true);
      setIsLoadingAuth(false);
    }
  }, [setUserState]);

  useEffect(() => { checkAppState(); }, [checkAppState]);

  const logout = useCallback(async () => jarvis.auth.logout(), []);
  const navigateToLogin = useCallback(() => null, []);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, authChecked, isLoadingPublicSettings:false,
      authError, appPublicSettings:{ id:'jarvis-desktop', public_settings:{ localSingleOwner:true } },
      logout, navigateToLogin, checkAppState, checkUserAuth:checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
