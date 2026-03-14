import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface AppSettings {
    appName: string;
    agencyName: string;
    systemTitle: string;
    loginBgUrl?: string;
}

interface AppSettingsState {
    settings: AppSettings;
    isLoading: boolean;
    error: string | null;
    fetchSettings: () => Promise<void>;
    updateSettings: (newSettings: Partial<AppSettings>) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
    appName: 'CDE-HTKT',
    agencyName: 'Ban Hạ tầng kỹ thuật',
    systemTitle: 'HỆ THỐNG DỮ LIỆU DÙNG CHUNG',
    loginBgUrl: '',
};

const DOC_ID = 'general_config';

export const useAppSettingsStore = create<AppSettingsState>((set) => ({
    settings: DEFAULT_SETTINGS,
    isLoading: false,
    error: null,

    fetchSettings: async () => {
        set({ isLoading: true, error: null });
        try {
            const docRef = doc(db, 'app_settings', DOC_ID);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                set({ settings: docSnap.data() as AppSettings, isLoading: false });
            } else {
                // Chỉ tự động khởi tạo nếu là Admin hoặc đã đăng nhập (tránh lỗi Permission khi chưa Auth)
                const { auth } = await import('../firebase/config');
                if (auth.currentUser) {
                    await setDoc(docRef, DEFAULT_SETTINGS);
                }
                set({ settings: DEFAULT_SETTINGS, isLoading: false });
            }
        } catch (error: any) {
            console.group('🔴 Lỗi fetchSettings (Permission Debug)');
            console.error('Chi tiết lỗi:', error);
            try {
                const { auth } = await import('../firebase/config');
                const currentUser = auth.currentUser;
                console.table({
                    code: error.code,
                    message: error.message,
                    authenticated: !!currentUser,
                    uid: currentUser?.uid || 'anonymous',
                    email: currentUser?.email || 'N/A'
                });
            } catch (authErr) {
                console.warn('Không thể lấy info Auth để debug:', authErr);
            }
            console.groupEnd();
            set({ error: error.message, isLoading: false });
        }
    },

    updateSettings: async (newSettings: Partial<AppSettings>) => {
        set({ isLoading: true, error: null });
        try {
            const docRef = doc(db, 'app_settings', DOC_ID);
            await setDoc(docRef, { ...newSettings, updatedAt: new Date().toISOString() }, { merge: true });

            // Update local state after successful remote update
            set((state) => ({
                settings: { ...state.settings, ...newSettings } as AppSettings,
                isLoading: false
            }));
        } catch (error: any) {
            console.error('Error updating app settings:', error);
            set({ error: error.message, isLoading: false });
            throw error; // Re-throw to handle in UI
        }
    },
}));
