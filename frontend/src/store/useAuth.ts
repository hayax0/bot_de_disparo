import { create } from 'zustand';

interface User {
  id: string;
  name?: string | null;
  email: string;
  role?: string | null;
  subscriptionStatus?: string | null;
  subscriptionExpiresAt?: string | null;
}

interface AuthState {
  token: string | null;
  user: User | null;
  isHydrated: boolean;
  hydrate: () => void;
  setAuth: (token: string | null, user?: User | null) => void;
  setToken: (token: string | null) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  isHydrated: false,
  hydrate: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      const rawUser = localStorage.getItem('user');
      let user: User | null = null;
      if (rawUser) {
        try {
          user = JSON.parse(rawUser);
        } catch {
          user = null;
        }
      }
      set({ token, user, isHydrated: true });
    }
  },
  setAuth: (token, user) => {
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem('token', token);
        if (user) localStorage.setItem('user', JSON.stringify(user));
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    set({ token, user: user || null, isHydrated: true });
  },
  setToken: (token) => {
    if (typeof window !== 'undefined') {
      if (token) localStorage.setItem('token', token);
      else localStorage.removeItem('token');
    }
    set({ token, isHydrated: true });
  },
  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    set({ token: null, user: null, isHydrated: true });
  },
}));
