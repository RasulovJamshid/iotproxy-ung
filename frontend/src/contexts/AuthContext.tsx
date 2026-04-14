import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { api, FORCE_LOGOUT_EVENT } from '../api/client';
import { disconnectSocket } from '../api/ws-client';
import { queryClient } from '../App';

interface UserOrg {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  role: string;
}

interface AuthState {
  accessToken: string | null;
  user: { id: string; email: string; organizationId: string; role: string } | null;
  orgs: UserOrg[];
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  switchOrg: (orgId: string) => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>(null!);

function decodeUser(token: string) {
  const payload = JSON.parse(atob(token.split('.')[1]));
  return { id: payload.sub, email: payload.email, organizationId: payload.orgId, role: payload.role };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem('accessToken');
    const userStr = localStorage.getItem('user');
    const orgsStr = localStorage.getItem('orgs');
    return {
      accessToken: token,
      user: userStr ? JSON.parse(userStr) : null,
      orgs: orgsStr ? JSON.parse(orgsStr) : [],
    };
  });

  const applyTokens = useCallback(async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    const user = decodeUser(accessToken);
    localStorage.setItem('user', JSON.stringify(user));

    // Fetch org list after token is stored (api client picks it up via localStorage)
    let orgs: UserOrg[] = [];
    try {
      const res = await api.get('/auth/my-orgs', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      orgs = res.data;
    } catch {
      // non-fatal — org switcher just won't show
    }
    localStorage.setItem('orgs', JSON.stringify(orgs));
    setState({ accessToken, user, orgs });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post('/auth/login', { email, password });
    await applyTokens(data.accessToken, data.refreshToken);
  }, [applyTokens]);

  const switchOrg = useCallback(async (orgId: string) => {
    const { data } = await api.post('/auth/switch-org', { orgId });
    await applyTokens(data.accessToken, data.refreshToken);
    // Flush all cached queries so every page refetches with the new org token.
    queryClient.invalidateQueries();
  }, [applyTokens]);

  const logout = useCallback(() => {
    localStorage.clear();
    disconnectSocket();
    setState({ accessToken: null, user: null, orgs: [] });
  }, []);

  // Listen for forced logout from the API interceptor (e.g. 401 after refresh failed)
  useEffect(() => {
    const onForceLogout = () => {
      disconnectSocket();
      setState({ accessToken: null, user: null, orgs: [] });
    };
    window.addEventListener(FORCE_LOGOUT_EVENT, onForceLogout);
    return () => window.removeEventListener(FORCE_LOGOUT_EVENT, onForceLogout);
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, switchOrg, isAuthenticated: !!state.accessToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
