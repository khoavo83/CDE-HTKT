import { create } from 'zustand';

type Theme = 'light' | 'dark';

interface ThemeStore {
    theme: Theme;
    toggleTheme: () => void;
    initTheme: () => void;
}

const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    if (theme === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
};

const getInitialTheme = (): Theme => {
    // Chỉ dùng localStorage — mặc định LUÔN là light nếu chưa có lựa chọn
    const saved = localStorage.getItem('theme') as Theme | null;
    if (saved === 'light' || saved === 'dark') return saved;
    return 'light'; // Mặc định light mode
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: 'light',

    initTheme: () => {
        const theme = getInitialTheme();
        applyTheme(theme);
        set({ theme });
    },

    toggleTheme: () => {
        const next: Theme = get().theme === 'light' ? 'dark' : 'light';
        applyTheme(next);
        set({ theme: next });
    },
}));
