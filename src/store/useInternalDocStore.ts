import { create } from 'zustand';
import {
    collection, query, onSnapshot, addDoc, updateDoc,
    deleteDoc, doc, getDocs, where
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface InternalDoc {
    id: string;
    stt: number;
    docNumber: string;
    date: string;
    content: string;
    issueDocSuffix: string; // CV phát hành
    responseDocSuffix: string; // CV phản hồi
    receiver: string;
    specialist: string;
    leader: string;
    isSaved: boolean; // Bản lưu
    result: string;
    notes: string;
    createdAt: string;
    createdBy: string;
    year: number;
}

interface InternalDocState {
    docs: InternalDoc[];
    isLoading: boolean;
    fetchDocs: (year?: number) => () => void;
    addDoc: (data: Omit<InternalDoc, 'id' | 'stt' | 'year' | 'createdAt'>) => Promise<void>;
    updateDoc: (id: string, data: Partial<InternalDoc>) => Promise<void>;
    deleteDoc: (id: string) => Promise<void>;
    getNextSTT: (year: number) => Promise<number>;
}

export const useInternalDocStore = create<InternalDocState>((set) => ({
    docs: [],
    isLoading: true,

    fetchDocs: (year = new Date().getFullYear()) => {
        set({ isLoading: true });
        const q = query(
            collection(db, 'internal_documents'),
            where('year', '==', year)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InternalDoc));
            // Sắt xếp thủ công ở client để tránh yêu cầu index phức hợp (composite index)
            list.sort((a, b) => b.stt - a.stt);
            set({ docs: list, isLoading: false });
        }, (err) => {
            console.error('Lỗi fetch internal docs:', err);
            set({ isLoading: false });
        });

        return unsubscribe;
    },

    getNextSTT: async (year: number) => {
        const q = query(
            collection(db, 'internal_documents'),
            where('year', '==', year)
        );
        const snapshot = await getDocs(q);
        if (snapshot.empty) return 1;

        // Tìm STT lớn nhất thủ công
        const maxSTT = Math.max(...snapshot.docs.map(d => d.data().stt || 0));
        return maxSTT + 1;
    },

    addDoc: async (data) => {
        const year = new Date(data.date).getFullYear();
        let nextSTT = 1;

        // Ưu tiên lấy STT từ docs đang có trong store để tránh lỗi index khi query server
        const { docs } = useInternalDocStore.getState();
        const yearDocs = docs.filter(d => d.year === year);

        if (yearDocs.length > 0) {
            nextSTT = Math.max(...yearDocs.map(d => d.stt)) + 1;
        } else {
            // Nếu store trống, thử gọi getNextSTT (vẫn có thể lỗi index nếu chưa tạo)
            try {
                nextSTT = await useInternalDocStore.getState().getNextSTT(year);
            } catch (e) {
                console.warn('Lỗi getNextSTT từ server (có thể thiếu Index), mặc định dùng 1:', e);
                nextSTT = 1;
            }
        }

        await addDoc(collection(db, 'internal_documents'), {
            ...data,
            stt: nextSTT,
            year,
            createdAt: new Date().toISOString()
        });
    },

    updateDoc: async (id, data) => {
        await updateDoc(doc(db, 'internal_documents', id), data);
    },

    deleteDoc: async (id) => {
        await deleteDoc(doc(db, 'internal_documents', id));
    }
}));
