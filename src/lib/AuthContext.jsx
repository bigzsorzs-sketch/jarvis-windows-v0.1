import React, { createContext, useState, useContext, useEffect } from 'react';
import { jarvis } from '@/api/jarvisClient';
import { useUserStore } from '@/lib/appStore';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const setUserState = useUserStore((state) => state.setUserState);

  const checkAppState = async () => {
    setIsLoadingAuth(true);
    try {
      const currentUser = await jarvis.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
      setUserState({ user:currentUser, isAuthenticated:true, authError:null });
    } finally { setIsLoadingAuth(false); }
  };

  useEffect(() => { checkAppState(); }, []);

  const logout = () => {};
  const navigateToLogin = () => {};

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings:false,
      authError:null, appPublicSettings:{ id:'jarvis-desktop', public_settings:{} },
      logout, navigateToLogin, checkAppState
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
