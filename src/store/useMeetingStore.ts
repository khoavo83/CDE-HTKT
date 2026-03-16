import { create } from 'zustand';
import {
    collection,
    query,
    onSnapshot,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';

export interface Meeting {
    id: string;
    title: string;
    date: string; // ISO format: YYYY-MM-DD
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    location?: string;
    locationType?: 'maur' | 'internal' | 'external';
    participants: string[]; // Array context: UIDs of users
    documentId?: string; // Linked document ID
    description?: string;
    attachmentUrl?: string; // Google Drive link giấy mời họp
    attachmentName?: string; // Tên file đính kèm
    creatorId: string;
    createdAt: any;
}

interface MeetingState {
    meetings: Meeting[];
    isLoading: boolean;
    fetchMeetings: () => () => void;
    addMeeting: (meeting: Omit<Meeting, 'id' | 'createdAt'>) => Promise<string>;
    updateMeeting: (id: string, meeting: Partial<Meeting>) => Promise<void>;
    deleteMeeting: (id: string) => Promise<void>;
}

export const useMeetingStore = create<MeetingState>((set) => ({
    meetings: [],
    isLoading: false,

    fetchMeetings: () => {
        set({ isLoading: true });
        const q = query(
            collection(db, 'meetings'),
            orderBy('date', 'asc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    ...data,
                    id: d.id // Đảm bảo ID được gán sau cùng để không bị ghi đè bởi data
                } as Meeting;
            });

            // Sắp xếp theo thời gian bắt đầu (ngày đã được sort bởi query)
            const sortedList = [...list].sort((a, b) => {
                if (a.date !== b.date) return 0;
                return a.startTime.localeCompare(b.startTime);
            });

            set({ meetings: sortedList, isLoading: false });
        }, (error) => {
            console.error('Lỗi fetchMeetings:', error);
            set({ isLoading: false });
        });

        return unsubscribe;
    },

    addMeeting: async (meetingData) => {
        // Sanitization: Loại bỏ id nếu vô tình lọt vào (Firestore tự tạo ID mới)
        const { id, ...cleanData } = meetingData as any;

        console.log('[useMeetingStore] Đang tạo lịch họp mới:', cleanData.title);
        const docRef = await addDoc(collection(db, 'meetings'), {
            ...cleanData,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    },

    updateMeeting: async (id, meetingData) => {
        // Sanitization: Chắc chắn không gửi 'id' và 'createdAt' vào lệnh update
        const { id: _id, createdAt, ...updateData } = meetingData as any;

        console.log(`[useMeetingStore] Đang cập nhật lịch họp ID: ${id}`);
        const meetingRef = doc(db, 'meetings', id);
        await updateDoc(meetingRef, updateData);
    },

    deleteMeeting: async (id) => {
        await deleteDoc(doc(db, 'meetings', id));
    }
}));
