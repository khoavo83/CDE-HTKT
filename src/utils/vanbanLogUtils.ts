import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

export type VanBanAction =
    | 'ADD'
    | 'EDIT'
    | 'DELETE'
    | 'AI_RECHECK'
    | 'LINK_STORAGE'
    | 'UNLINK_STORAGE'
    | 'RESTORE'
    | 'TASK_ASSIGN'
    | 'TASK_ACCEPT'
    | 'TASK_UPDATE'
    | 'TASK_COMPLETE'
    | 'TASK_DELETE';

interface LogData {
    vanBanId: string;
    action: VanBanAction;
    details: string;
    userId: string;
    userName: string;
}

/**
 * Records an activity log for a document.
 */
export const logVanBanActivity = async (data: LogData) => {
    try {
        await addDoc(collection(db, 'vanban_logs'), {
            ...data,
            timestamp: serverTimestamp()
        });
    } catch (error) {
        console.error('Error logging document activity:', error);
    }
};
