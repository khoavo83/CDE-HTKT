import { create } from 'zustand';
import { collection, query, onSnapshot, updateDoc, doc, setDoc, deleteDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export type MenuItemStatus = 'active' | 'inactive' | 'coming_soon';

export interface MenuConfigItem {
    id: string;
    key: string;
    name: string;
    path: string;
    icon: string;
    order: number;
    status: MenuItemStatus;
    adminOnly?: boolean;
}

// Dữ liệu mặc định để seed lần đầu
export const DEFAULT_MENU_ITEMS: Omit<MenuConfigItem, 'id'>[] = [
    { key: 'dashboard', name: 'Tổng quan', path: '/', icon: 'LayoutDashboard', order: 1, status: 'active', adminOnly: false },
    { key: 'projects', name: 'Quản lý Dự án', path: '/projects', icon: 'FolderTree', order: 2, status: 'active', adminOnly: false },
    { key: 'documents', name: 'Quản lý Văn bản', path: '/documents', icon: 'FileText', order: 3, status: 'active', adminOnly: false },
    { key: 'bim_gis', name: 'Quản lý BIM - GIS', path: '/bim-gis/bim', icon: 'Map', order: 4, status: 'active', adminOnly: false },
    { key: 'settings', name: 'Cấu hình Admin', path: '/settings/users', icon: 'Settings', order: 5, status: 'active', adminOnly: true },
    { key: 'admin', name: 'Quản trị Hệ thống', path: '/admin/categories', icon: 'ShieldAlert', order: 6, status: 'active', adminOnly: true },
];

interface MenuConfigState {
    menuItems: MenuConfigItem[];
    isLoading: boolean;
    fetchMenuConfig: () => () => void;
    updateMenuItemStatus: (id: string, status: MenuItemStatus) => Promise<void>;
    addMenuItem: (item: Omit<MenuConfigItem, 'id'>) => Promise<void>;
    updateMenuItem: (id: string, item: Partial<MenuConfigItem>) => Promise<void>;
    deleteMenuItem: (id: string) => Promise<void>;
    seedMenuConfig: () => Promise<void>;
}

export const useMenuConfigStore = create<MenuConfigState>((set, get) => ({
    menuItems: [],
    isLoading: true,

    fetchMenuConfig: () => {
        set({ isLoading: true });
        const q = query(collection(db, 'menu_config'), orderBy('order', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: MenuConfigItem[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as MenuConfigItem));
            
            // ONE-TIME CLEANUP: Delete obsolete menu items from Firestore
            const obsoleteKeys = ['gantt', 'tasks', 'mindmap', 'internal_docs', 'meetings', 'bim', 'map', 'users', 'categories', 'feedbacks', 'trash'];
            obsoleteKeys.forEach(async (key) => {
                const docRef = doc(db, 'menu_config', key);
                try {
                    await deleteDoc(docRef);
                } catch (e) {
                    // ignore
                }
            });

            const requiredKeys = ['dashboard', 'projects', 'documents', 'bim_gis', 'settings', 'admin'];
            const hasAllRequired = requiredKeys.every(key => list.some(item => item.key === key));
            
            if (!hasAllRequired) {
                get().seedMenuConfig();
            }
            
            // Filter out obsolete keys just in case they haven't been deleted from DB yet
            const filteredList = list.filter(item => !obsoleteKeys.includes(item.key));
            set({ menuItems: filteredList, isLoading: false });
        }, (err) => {
            console.error('Lỗi load menu_config:', err);
            set({ isLoading: false });
        });
        return unsubscribe;
    },

    updateMenuItemStatus: async (id, status) => {
        await updateDoc(doc(db, 'menu_config', id), { status });
    },

    addMenuItem: async (item) => {
        await setDoc(doc(db, 'menu_config', item.key), item);
    },

    updateMenuItem: async (id, item) => {
        await updateDoc(doc(db, 'menu_config', id), item);
    },

    deleteMenuItem: async (id) => {
        await deleteDoc(doc(db, 'menu_config', id));
    },

    seedMenuConfig: async () => {
        const items = DEFAULT_MENU_ITEMS;
        for (const item of items) {
            await setDoc(doc(db, 'menu_config', item.key), item, { merge: true });
        }
    },
}));
