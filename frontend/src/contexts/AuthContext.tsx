import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import axios from 'axios';

export type UserRole = 'candidate' | 'faculty' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCandidate: boolean;
  isFaculty: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, name: string, role?: UserRole) => Promise<User>;
  logout: () => Promise<void>;
  getToken: () => string | null;
}

interface AuthProviderProps { children: ReactNode; }
interface AuthTokens { access_token: string; refresh_token: string; user: User; }

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'aia_access_token';
const REFRESH_TOKEN_KEY = 'aia_refresh_token';
const USER_KEY = 'aia_user';

const API_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000';

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadUser = async () => {
      let storedUser = localStorage.getItem(USER_KEY);
      let storedToken = localStorage.getItem(ACCESS_TOKEN_KEY);

      // Support direct token handover when launching Safe Exam Browser
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('auth_token') || urlParams.get('token');
        const urlUserRaw = urlParams.get('auth_user');

        if (urlToken) {
          storedToken = urlToken;
          localStorage.setItem(ACCESS_TOKEN_KEY, urlToken);

          if (urlUserRaw) {
            try {
              storedUser = decodeURIComponent(urlUserRaw);
              localStorage.setItem(USER_KEY, storedUser);
            } catch {
              // fallback
            }
          }
          if (!storedUser) {
            const fallbackUser: User = {
              id: 'candidate',
              email: 'candidate@assessment.com',
              name: 'Examination Candidate',
              role: 'candidate',
            };
            storedUser = JSON.stringify(fallbackUser);
            localStorage.setItem(USER_KEY, storedUser);
          }
        }
      }

      if (storedUser && storedToken) {
        const parsed: User = JSON.parse(storedUser);
        // Default role to candidate for older tokens without role field
        if (!parsed.role) parsed.role = 'candidate';
        setUser(parsed);
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
        try {
          const { data } = await axios.get<User>(`${API_URL}/auth/me`);
          const resolvedRole: UserRole = (data.role && data.role !== 'candidate')
            ? data.role
            : (parsed.role && parsed.role !== 'candidate' ? parsed.role : data.role || 'candidate');
          const updated = { ...parsed, ...data, role: resolvedRole };
          setUser(updated);
          localStorage.setItem(USER_KEY, JSON.stringify(updated));
        } catch (err: any) {
          const isSEB = typeof window !== 'undefined' && (/SEB|SafeExamBrowser/i.test(navigator.userAgent || '') || !!(window as any).SafeExamBrowser);
          if (!isSEB && err?.response && (err.response.status === 401 || err.response.status === 403)) {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
            setUser(null);
            delete axios.defaults.headers.common['Authorization'];
          }
        }
      }
      setIsLoading(false);
    };
    loadUser();
  }, []);

  const register = async (email: string, password: string, name: string, role: UserRole = 'candidate'): Promise<User> => {
    setIsLoading(true);
    try {
      const { data } = await axios.post<AuthTokens>(`${API_URL}/auth/register`, { email, password, name, role });
      const u: User = { ...data.user, role: data.user.role || role };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
      return u;
    } catch (e) { throw e; }
    finally { setIsLoading(false); }
  };

  const login = async (email: string, password: string): Promise<User> => {
    setIsLoading(true);
    try {
      const { data } = await axios.post<AuthTokens>(`${API_URL}/auth/login`, { email, password });
      const u: User = { ...data.user, role: data.user.role || (email.toLowerCase().includes('admin') ? 'admin' : email.toLowerCase().includes('faculty') ? 'faculty' : 'candidate') };
      localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      setUser(u);
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`;
      return u;
    } catch (e) { throw e; }
    finally { setIsLoading(false); }
  };

  const logout = async () => {
    try { await axios.post(`${API_URL}/auth/logout`); } catch {}
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const getToken = () => localStorage.getItem(ACCESS_TOKEN_KEY);

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated: !!user, isLoading,
      isCandidate: user?.role === 'candidate',
      isFaculty: user?.role === 'faculty',
      isAdmin: user?.role === 'admin',
      login, register, logout, getToken,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
