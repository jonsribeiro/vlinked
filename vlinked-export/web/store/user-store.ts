import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Profile } from '@/services/api-client';

interface UserState {
  user: Profile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: Profile | null) => void;
  setAuthenticated: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  logout: () => void;
  preferences: {
    autoplay: boolean;
    muted: boolean;
    theme: 'dark' | 'light';
  };
  setPreferences: (prefs: Partial<UserState['preferences']>) => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      preferences: {
        autoplay: true,
        muted: false,
        theme: 'dark',
      },
      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setLoading: (value) => set({ isLoading: value }),
      logout: () => set({ 
        user: null, 
        isAuthenticated: false,
        preferences: {
          autoplay: true,
          muted: false,
          theme: 'dark',
        },
      }),
      setPreferences: (prefs) => 
        set((state) => ({ 
          preferences: { ...state.preferences, ...prefs } 
        })),
    }),
    {
      name: 'vlinked-user-storage',
      partialize: (state) => ({ 
        user: state.user, 
        isAuthenticated: state.isAuthenticated,
        preferences: state.preferences,
      }),
    }
  )
);
