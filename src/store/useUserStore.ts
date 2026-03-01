import { create } from 'zustand';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    hoTen?: string;
    chucVu?: string;
    department?: string;
    role: string;
    photoURL?: string;
}

interface UserState {
    users: UserProfile[];
    isLoading: boolean;
    fetchUsers: () => () => void;
}

export const useUserStore = create<UserState>((set) => ({
    users: [],
    isLoading: false,

    fetchUsers: () => {
        set({ isLoading: true });
        const q = query(collection(db, 'users'), orderBy('displayName', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({
                uid: doc.id,
                ...doc.data()
            } as UserProfile));
            set({ users: list, isLoading: false });
        }, (error) => {
            console.error('Lỗi fetchUsers:', error);
            set({ isLoading: false });
        });

        return unsubscribe;
    }
}));
