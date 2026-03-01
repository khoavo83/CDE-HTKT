import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface User {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'manager' | 'editor' | 'viewer' | 'pending';
    department?: string;
    chucVu?: string;
    ngaySinh?: string;
    hoTen?: string;
    photoURL?: string;
}

interface AuthState {
    user: User | null;
    googleAccessToken: string | null;
    isLoading: boolean;
    setUser: (user: User | null) => void;
    setGoogleAccessToken: (token: string | null) => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            googleAccessToken: null,
            isLoading: true,
            setUser: (user) => set({ user }),
            setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
            setLoading: (isLoading) => set({ isLoading }),
        }),
        {
            name: 'auth-storage', // lưu vào localStorage
            storage: createJSONStorage(() => localStorage),
        }
    )
);
