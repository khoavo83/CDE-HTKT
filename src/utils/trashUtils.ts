import { collection, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface TrashItem {
    id: string; // ID của document gốc
    originalCollection: string; // Tên collection gốc (vd: 'users', 'project_nodes', 'vanban')
    originalId: string;
    data: any; // Toàn bộ dữ liệu của document
    deletedBy: string; // Email hoặc UID người xóa
    deletedAt: string; // ISO date string
    deleteReason: string; // Lý do xóa
    metaSummary: string; // Tóm tắt nội dung để hiển thị (vd: Tên văn bản, tên dự án)
}

/**
 * Di chuyển một document sang collection `trash` và xóa khỏi collection hiện tại.
 */
export const moveToTrash = async (
    originalCollection: string,
    originalId: string,
    data: any,
    deletedBy: string,
    deleteReason: string,
    metaSummary: string
) => {
    try {
        // 1. Lưu vào trash
        const trashRef = doc(collection(db, 'trash'));
        const trashData: TrashItem = {
            id: trashRef.id,
            originalCollection,
            originalId,
            data,
            deletedBy,
            deletedAt: new Date().toISOString(),
            deleteReason,
            metaSummary
        };
        await setDoc(trashRef, trashData);

        // 2. Xóa khỏi collection gốc
        await deleteDoc(doc(db, originalCollection, originalId));
        return true;
    } catch (error) {
        console.error("Lỗi khi chuyển vào thùng rác:", error);
        throw error;
    }
};

/**
 * Phục hồi document từ thùng rác về collection gốc
 */
export const restoreFromTrash = async (trashItem: TrashItem) => {
    try {
        // 1. Ghi lại vào collection gốc với originalId
        const originalRef = doc(db, trashItem.originalCollection, trashItem.originalId);
        await setDoc(originalRef, trashItem.data);

        // 2. Xóa khỏi thùng rác
        await deleteDoc(doc(db, 'trash', trashItem.id));
        return true;
    } catch (error) {
        console.error("Lỗi khi phục hồi từ thùng rác:", error);
        throw error;
    }
};
