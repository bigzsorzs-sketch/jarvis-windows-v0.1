import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { useUserStore } from '@/lib/appStore';

const AuthContext = createContext();

function normalizeAuthError(error) {
  const message = String(error?.message || error || 'Unknown authentication error');
  const status = Number(error?.status ?? error?.response?.status ?? error?.cause?.status);
  const code = String(error?.code || error?.cause?.code || '');

  if (status === 401 || status === 403 || /not authenticated|authentication required|unauthori[sz]ed/i.test(message)) {
    return { type:'auth_required', message, status:Number.isFinite(status) ? status : null, code:code || null };
  }
  if (/user[^\n]{0,40}(not registered|unregistered|not found)|USER_NOT_REGISTERED/i.test(message)) {
    return { type:'user_not_registered', message, status:Number.isFinite(status) ? status : null, code:code || null };
  }
  if (/ECONNABORTED|ETIMEDOUT|ENETUNREACH|ERR_NETWORK|network error|network request failed|fetch failed|timeout/i.test(`${code} ${message}`)) {
    return { type:'network_error', message, status:Number.isFinite(status) ? status : null, code:code || null };
  }
  return { type:'local_profile_error', message, status:Number.isFinite(status) ? status : null, code:code || null };
}

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
      if (!authenticated) {
        const missingProfile = new Error('LOCAL_OWNER_PROFILE_MISSING');
        missingProfile.code = 'LOCAL_OWNER_PROFILE_MISSING';
        throw missingProfile;
      }
      setUser(currentUser);
      setIsAuthenticated(true);
      setUserState({ user:currentUser, isAuthenticated:true, authError:null });
    } catch (error) {
      const nextError = normalizeAuthError(error);
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
  const navigateToLogin = useCallback(() => jarvis.auth.redirectToLogin?.() ?? null, []);

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
