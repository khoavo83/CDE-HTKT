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

            // Deduplicate: Lọc bỏ các bản ghi trùng lặp tuyệt đối (cùng title, date, startTime)
            // Giữ lại bản ghi có createdAt mới nhất (nếu có) hoặc bản ghi đầu tiên
            const uniqueMeetings = list.reduce((acc: Meeting[], current) => {
                const isDuplicate = acc.find(item =>
                    item.title === current.title &&
                    item.date === current.date &&
                    item.startTime === current.startTime
                );
                if (!isDuplicate) {
                    acc.push(current);
                }
                return acc;
            }, []);

            const sortedList = uniqueMeetings.sort((a, b) => {
                if (a.date !== b.date) return 0; // Đã sort bởi query theo ngày
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
