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
            const list = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            } as Meeting));

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
        const docRef = await addDoc(collection(db, 'meetings'), {
            ...meetingData,
            createdAt: serverTimestamp()
        });
        return docRef.id;
    },

    updateMeeting: async (id, meetingData) => {
        const meetingRef = doc(db, 'meetings', id);
        await updateDoc(meetingRef, meetingData);
    },

    deleteMeeting: async (id) => {
        await deleteDoc(doc(db, 'meetings', id));
    }
}));
