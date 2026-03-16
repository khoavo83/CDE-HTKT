import { create } from 'zustand';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface CategoryTab {
    id: string; // The Firestore document ID, also used as the 'type' in Categories
    label: string;
    order: number;
}

interface CategoryTabState {
    tabs: CategoryTab[];
    isLoading: boolean;
    isSeeding: boolean;
    error: string | null;
    fetchTabs: () => () => void;
    addTab: (data: Omit<CategoryTab, 'id'>) => Promise<string>;
    updateTab: (id: string, data: Partial<CategoryTab>) => Promise<void>;
    deleteTab: (id: string) => Promise<void>;
    seedInitialTabs: () => Promise<void>;
}

const DEFAULT_TABS = [
    { id: 'phongBan', label: 'Phòng ban / Đơn vị', order: 1 },
    { id: 'chucVu', label: 'Chức vụ', order: 2 },
    { id: 'loaiVanBan', label: 'Loại Văn bản', order: 3 },
];

export const useCategoryTabStore = create<CategoryTabState>((set) => ({
    tabs: [],
    isLoading: true,
    isSeeding: false,
    error: null,

    fetchTabs: () => {
        set({ isLoading: true });
        const q = query(collection(db, 'category_tabs'), orderBy('order', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: CategoryTab[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as CategoryTab);
            });
            set({ tabs: list, isLoading: false, error: null });
        }, (error) => {
            console.error('Error fetching category tabs:', error);
            set({ error: error.message, isLoading: false });
        });

        return unsubscribe;
    },

    addTab: async (data) => {
        try {
            const docRef = await addDoc(collection(db, 'category_tabs'), data);
            return docRef.id;
        } catch (error) {
            console.error('Lỗi khi thêm tab:', error);
            throw error;
        }
    },

    updateTab: async (id, data) => {
        try {
            const ref = doc(db, 'category_tabs', id);
            await updateDoc(ref, data);
        } catch (error) {
            console.error('Lỗi cập nhật tab:', error);
            throw error;
        }
    },

    deleteTab: async (id) => {
        try {
            await deleteDoc(doc(db, 'category_tabs', id));
        } catch (error) {
            console.error('Lỗi xóa tab:', error);
            throw error;
        }
    },

    seedInitialTabs: async () => {
        // Prevent multiple simultaneous seed calls
        if (useCategoryTabStore.getState().isSeeding) return;

        try {
            useCategoryTabStore.setState({ isSeeding: true });
            const snapshot = await getDocs(collection(db, 'category_tabs'));
            if (snapshot.empty) {
                const { setDoc } = await import('firebase/firestore');
                const promises = DEFAULT_TABS.map(tab => {
                    const { id, ...data } = tab;
                    return setDoc(doc(db, 'category_tabs', id as string), data);
                });
                await Promise.all(promises);
            }
        } catch (error) {
            console.error('Error seeding initial category tabs:', error);
        } finally {
            useCategoryTabStore.setState({ isSeeding: false });
        }
    }
}));
