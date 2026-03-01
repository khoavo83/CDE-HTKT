import { create } from 'zustand';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

interface AppSettings {
    appName: string;
    agencyName: string;
    systemTitle: string;
}

interface AppSettingsState {
    settings: AppSettings;
    isLoading: boolean;
    error: string | null;
    fetchSettings: () => Promise<void>;
    updateSettings: (newSettings: AppSettings) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
    appName: 'CDE-HTKT',
    agencyName: 'Ban Hạ tầng kỹ thuật',
    systemTitle: 'HỆ THỐNG DỮ LIỆU DÙNG CHUNG',
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
                // Initialize default if not exists
                await setDoc(docRef, DEFAULT_SETTINGS);
                set({ settings: DEFAULT_SETTINGS, isLoading: false });
            }
        } catch (error: any) {
            console.error('Error fetching app settings:', error);
            set({ error: error.message, isLoading: false });
        }
    },

    updateSettings: async (newSettings: AppSettings) => {
        set({ isLoading: true, error: null });
        try {
            const docRef = doc(db, 'app_settings', DOC_ID);
            await setDoc(docRef, { ...newSettings, updatedAt: new Date().toISOString() }, { merge: true });

            // Update local state after successful remote update
            set((state) => ({
                settings: { ...state.settings, ...newSettings },
                isLoading: false
            }));
        } catch (error: any) {
            console.error('Error updating app settings:', error);
            set({ error: error.message, isLoading: false });
            throw error; // Re-throw to handle in UI
        }
    },
}));
