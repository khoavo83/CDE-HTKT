import { create } from 'zustand';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Category {
    id: string;
    type: string;
    value: string;
    description?: string;
    parentAgency?: string; // Cơ quan cấp trên
    order: number;
    isActive: boolean;
    createdBy?: string; // Bổ sung người tạo để phân quyền Ownership
}

interface CategoryState {
    categories: Category[];
    isLoading: boolean;
    error: string | null;
    fetchCategories: () => () => void;
    addCategory: (data: Omit<Category, 'id'>) => Promise<void>;
    updateCategory: (id: string, data: Partial<Category>) => Promise<void>;
    deleteCategory: (id: string) => Promise<void>;
}

export const useCategoryStore = create<CategoryState>((set) => ({
    categories: [],
    isLoading: true,
    error: null,

    fetchCategories: () => {
        set({ isLoading: true });
        const q = query(collection(db, 'categories'), orderBy('order', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: Category[] = [];
            snapshot.forEach((doc) => {
                list.push({ id: doc.id, ...doc.data() } as Category);
            });
            set({ categories: list, isLoading: false, error: null });
        }, (error) => {
            console.error('Error fetching categories:', error);
            set({ error: error.message, isLoading: false });
        });

        // Trả về hàm hủy đăng ký để component có thể gọi khi unmount
        // (Tuy nhiên Zustand thường dùng global store nên có thể để listener chạy ngầm liên tục)
        return unsubscribe;
    },

    addCategory: async (data) => {
        try {
            await addDoc(collection(db, 'categories'), data);
        } catch (error) {
            console.error('Lỗi khi thêm danh mục:', error);
            throw error;
        }
    },

    updateCategory: async (id, data) => {
        try {
            const ref = doc(db, 'categories', id);
            await updateDoc(ref, data);
        } catch (error) {
            console.error('Lỗi cập nhật danh mục:', error);
            throw error;
        }
    },

    deleteCategory: async (id) => {
        try {
            await deleteDoc(doc(db, 'categories', id));
        } catch (error) {
            console.error('Lỗi xóa danh mục:', error);
            throw error;
        }
    }
}));
