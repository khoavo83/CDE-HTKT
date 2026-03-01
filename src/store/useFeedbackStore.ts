import { create } from 'zustand';
import {
    collection,
    addDoc,
    updateDoc,
    doc,
    query,
    where,
    orderBy,
    getDocs,
    serverTimestamp,
    Timestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';

export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface Feedback {
    id: string;
    content: string;
    uid: string;
    userName: string;
    userEmail: string;
    status: FeedbackStatus;
    adminNote?: string;
    createdAt: any;
    updatedAt: any;
}

interface FeedbackState {
    feedbacks: Feedback[];
    userFeedbacks: Feedback[];
    loading: boolean;
    error: string | null;

    // Actions
    submitFeedback: (data: { content: string; uid: string; userName: string; userEmail: string }) => Promise<void>;
    fetchUserFeedbacks: (uid: string) => Promise<void>;
    fetchAllFeedbacks: () => Promise<void>;
    updateFeedbackStatus: (id: string, status: FeedbackStatus, adminNote?: string) => Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set) => ({
    feedbacks: [],
    userFeedbacks: [],
    loading: false,
    error: null,

    submitFeedback: async (data) => {
        set({ loading: true, error: null });
        try {
            const docRef = await addDoc(collection(db, 'feedbacks'), {
                ...data,
                status: 'PENDING',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            // Cập nhật local state
            const newFeedback: Feedback = {
                id: docRef.id,
                ...data,
                status: 'PENDING',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now()
            };

            set((state) => ({
                userFeedbacks: [newFeedback, ...state.userFeedbacks]
            }));
        } catch (error: any) {
            console.error('Lỗi khi gửi góp ý:', error);
            set({ error: error.message });
            throw error;
        } finally {
            set({ loading: false });
        }
    },

    fetchUserFeedbacks: async (uid: string) => {
        set({ loading: true, error: null });
        try {
            const q = query(
                collection(db, 'feedbacks'),
                where('uid', '==', uid),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const userFeedbacks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Feedback[];
            set({ userFeedbacks });
        } catch (error: any) {
            console.error('Lỗi khi tải góp ý của user:', error);
            set({ error: error.message });
        } finally {
            set({ loading: false });
        }
    },

    fetchAllFeedbacks: async () => {
        set({ loading: true, error: null });
        try {
            const q = query(
                collection(db, 'feedbacks'),
                orderBy('createdAt', 'desc')
            );
            const snapshot = await getDocs(q);
            const feedbacks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as Feedback[];
            set({ feedbacks });
        } catch (error: any) {
            console.error('Lỗi khi tải tất cả góp ý:', error);
            set({ error: error.message });
        } finally {
            set({ loading: false });
        }
    },

    updateFeedbackStatus: async (id: string, status: FeedbackStatus, adminNote?: string) => {
        set({ loading: true, error: null });
        try {
            const updateData: any = {
                status,
                updatedAt: serverTimestamp()
            };
            if (adminNote !== undefined) {
                updateData.adminNote = adminNote;
            }

            await updateDoc(doc(db, 'feedbacks', id), updateData);

            // Cập nhật local list
            set((state) => ({
                feedbacks: state.feedbacks.map(f =>
                    f.id === id ? {
                        ...f,
                        status,
                        ...(adminNote !== undefined ? { adminNote } : {}),
                        updatedAt: Timestamp.now()
                    } : f
                )
            }));
        } catch (error: any) {
            console.error('Lỗi khi cập nhật trạng thái góp ý:', error);
            set({ error: error.message });
            throw error;
        } finally {
            set({ loading: false });
        }
    }
}));
