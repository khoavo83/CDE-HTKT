import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, X, Send, Search, FileText, UserCheck, Users, Link as LinkIcon, Paperclip } from 'lucide-react';
import toast from 'react-hot-toast';
import { GenericConfirmModal } from './GenericConfirmModal';
import { DocAttachmentSelectorModal } from './DocAttachmentSelectorModal';


interface UserItem {
    id: string;
    displayName: string;
    email: string;
    role: string;
    department?: string;
}

interface VanBanItem {
    id: string;
    soKyHieu: string;
    trichYeu: string;
    ngayBanHanh: string;
    coQuanBanHanh: string;
    loaiVanBan: string;
    dinhKem?: any[];
}

interface AssignTaskFromManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export const AssignTaskFromManagerModal: React.FC<AssignTaskFromManagerModalProps> = ({
    isOpen,
    onClose,
    onSuccess
}) => {
    const { user } = useAuthStore();
    const [users, setUsers] = useState<UserItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Search VanBan State
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [selectedVanBan, setSelectedVanBan] = useState<VanBanItem | null>(null);

    // Form State
    const [selectedAssignee, setSelectedAssignee] = useState('');
    const [selectedCollaborators, setSelectedCollaborators] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);


    useEffect(() => {
        if (!isOpen) return;
        const fetchUsers = async () => {
            setLoadingUsers(true);
            try {
                const q = query(collection(db, 'users'), where('role', '!=', 'unclaimed'));
                const snap = await getDocs(q);
                const fetchedUsers: UserItem[] = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    fetchedUsers.push({ id: doc.id, ...data } as UserItem);
                });
                fetchedUsers.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
                setUsers(fetchedUsers);
            } catch (error) {
                console.error('Lỗi khi fetch users:', error);
                toast.error('Không thể lấy danh sách người dùng.');
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, [isOpen]);



    if (!isOpen) return null;

    const collaboratorCandidates = users.filter(u => u.id !== selectedAssignee);

    const toggleCollaborator = (userId: string) => {
        setSelectedCollaborators(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleAssigneeChange = (newAssigneeId: string) => {
        setSelectedAssignee(newAssigneeId);
        // Remove from collaborators if they are now the assignee
        setSelectedCollaborators(prev => prev.filter(id => id !== newAssigneeId));
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e && e.preventDefault) e.preventDefault();

        if (!selectedAssignee || !content.trim()) {
            toast.error('Vui lòng chọn người phụ trách và nhập nội dung chỉ đạo.');
            return;
        }

        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        const assigneeUser = users.find(u => u.id === selectedAssignee);
        const firestoreUser = auth.currentUser;
        const currentUserId = firestoreUser?.uid || user?.uid;
        const currentUserName = firestoreUser?.displayName || user?.displayName || user?.email || firestoreUser?.email || 'Người dùng ẩn danh';

        if (!assigneeUser) {
            toast.error('Lỗi dữ liệu hệ thống: Không xác định được người phụ trách.');
            return;
        }

        if (!currentUserId) {
            toast.error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
            return;
        }

        // Build collaborators list
        const collaboratorsData = selectedCollaborators
            .map(id => {
                const u = users.find(u => u.id === id);
                return u ? { id: u.id, name: u.displayName || u.email } : null;
            })
            .filter(Boolean);

        setIsSubmitting(true);
        try {
            const taskData: any = {
                vanBanId: selectedVanBan?.id || null, // Optional connection
                assignerId: currentUserId,
                assignerName: currentUserName,
                assigneeId: assigneeUser.id,
                assigneeName: assigneeUser.displayName || assigneeUser.email,
                content: content.trim(),
                status: 'PENDING',
                createdAt: new Date().toISOString(),
            };

            if (collaboratorsData.length > 0) {
                taskData.collaborators = collaboratorsData;
            }

            await addDoc(collection(db, 'vanban_tasks'), taskData);

            toast.success('Đã giao công việc thành công!');

            // Reset states
            setContent('');
            setSelectedAssignee('');
            setSelectedCollaborators([]);
            setSelectedVanBan(null);

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Lỗi khi addDoc:', error);
            toast.error('Đã xảy ra lỗi khi lưu vào database: ' + error.message);
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 md:p-6 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
                            Giao Việc Mới
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">Phân công công việc (có thể đính kèm văn bản đầu vào)</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 md:p-6 overflow-y-auto custom-scrollbar flex-1 relative">
                    <div className="space-y-6">
                        {/* 1. Chọn Văn Bản Đầu Vào (Optional) */}
                        <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-xl space-y-3">
                            <label className="block text-sm font-semibold text-blue-900 border-b border-blue-200 pb-2">
                                1. Văn bản đầu vào đính kèm (Ví dụ: VB đến từ sở KHCN...)
                            </label>

                            {!selectedVanBan ? (
                                <button
                                    onClick={() => setIsDocModalOpen(true)}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-8 bg-white border-2 border-dashed border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-400 font-medium transition-all group"
                                >
                                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                        <LinkIcon className="w-5 h-5 text-blue-600" />
                                    </div>
                                    <div className="flex flex-col items-start ml-2 text-left">
                                        <span className="font-semibold text-gray-800 group-hover:text-blue-700">Đính kèm Văn bản</span>
                                        <span className="text-xs text-gray-500 font-normal">Mở danh sách văn bản và chọn 1 tệp cần đính kèm</span>
                                    </div>
                                </button>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">
                                                    {selectedVanBan.loaiVanBan} {selectedVanBan.soKyHieu && `số ${selectedVanBan.soKyHieu}`}
                                                </div>
                                                <div className="text-xs text-gray-600 mt-1 line-clamp-2">{selectedVanBan.trichYeu}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedVanBan(null)}
                                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                                        >
                                            Gỡ bỏ
                                        </button>
                                    </div>

                                    {selectedVanBan.dinhKem && selectedVanBan.dinhKem.length > 0 && (
                                        <div className="pl-11 space-y-1.5">
                                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tight">Tệp phụ lục đính kèm ({selectedVanBan.dinhKem.length})</p>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedVanBan.dinhKem.map((file: any, index: number) => (
                                                    <a
                                                        key={index}
                                                        href={file.webViewLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                                    >
                                                        <Paperclip className="w-3 h-3" />
                                                        <span className="max-w-[150px] truncate">{file.fileName || file.originalName || 'Đính kèm'}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. Nội dung chỉ đạo */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Nội dung công việc <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all resize-none"
                                placeholder="Nhập nội dung yêu cầu, chỉ đạo thực hiện..."
                            />
                        </div>

                        {/* 3. Phân công người dùng */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Phụ trách chính */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                                    <UserCheck className="w-4 h-4" />
                                    Người phụ trách <span className="text-red-500">*</span>
                                </label>
                                {loadingUsers ? (
                                    <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-100 animate-pulse">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
                                    </div>
                                ) : (
                                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                                        {users.map(u => (
                                            <label
                                                key={`assignee-${u.id}`}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${selectedAssignee === u.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                                    }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="assignee_manager"
                                                    value={u.id}
                                                    checked={selectedAssignee === u.id}
                                                    onChange={() => handleAssigneeChange(u.id)}
                                                    className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                                />
                                                <div className="flex flex-col">
                                                    <span className={`text-sm ${selectedAssignee === u.id ? 'font-semibold text-indigo-900' : 'font-medium text-gray-700'}`}>
                                                        {u.displayName || u.email}
                                                    </span>
                                                    {u.role && u.role !== 'user' && (
                                                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{u.role}</span>
                                                    )}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Người phối hợp */}
                            <div className="space-y-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                                    <Users className="w-4 h-4" />
                                    Người phối hợp
                                </label>
                                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                                    {collaboratorCandidates.length === 0 ? (
                                        <div className="p-3 text-sm text-gray-500 text-center italic">
                                            Không có người dùng nào khác
                                        </div>
                                    ) : (
                                        collaboratorCandidates.map(u => (
                                            <label
                                                key={`collab-${u.id}`}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${selectedCollaborators.includes(u.id) ? 'bg-purple-50' : 'hover:bg-gray-50'
                                                    }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedCollaborators.includes(u.id)}
                                                    onChange={() => toggleCollaborator(u.id)}
                                                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                />
                                                <div className="flex flex-col">
                                                    <span className={`text-sm ${selectedCollaborators.includes(u.id) ? 'font-semibold text-purple-900' : 'font-medium text-gray-700'}`}>
                                                        {u.displayName || u.email}
                                                    </span>
                                                    {u.role && u.role !== 'user' && (
                                                        <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{u.role}</span>
                                                    )}
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 italic px-1 pt-1">(Có thể chọn nhiều)</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !selectedAssignee || !content.trim()}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm inline-flex justify-center items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                Giao việc mới
                            </>
                        )}
                    </button>
                </div>
            </div >

            <GenericConfirmModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={executeSubmit}
                title="Xác nhận Giao việc"
                message="Bạn có chắc chắn muốn giao công việc mới này không?"
                confirmText="Giao việc"
            />

            <DocAttachmentSelectorModal
                isOpen={isDocModalOpen}
                onClose={() => setIsDocModalOpen(false)}
                onAttach={(docId, docData) => {
                    setSelectedVanBan(docData);
                    setIsDocModalOpen(false);
                }}
            />
        </div >
    );
};
