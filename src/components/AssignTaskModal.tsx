import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import { db, auth } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, X, Send, Users, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { GenericConfirmModal } from './GenericConfirmModal';
import { logVanBanActivity } from '../utils/vanbanLogUtils';


interface UserItem {
    id: string;
    displayName: string;
    email: string;
    role: string;
    department?: string;
}

interface AssignTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    vanBanId: string;
    onSuccess: () => void;
}

export const AssignTaskModal: React.FC<AssignTaskModalProps> = ({ isOpen, onClose, vanBanId, onSuccess }) => {
    const { user } = useAuthStore();
    const [users, setUsers] = useState<UserItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Form State
    const [selectedAssigner, setSelectedAssigner] = useState('');
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

                const defaultAssignerUser = fetchedUsers.find(u =>
                    u.email === 'hoduongbinh32@gmail.com' ||
                    (u.displayName && u.displayName.toLowerCase().includes('bình'))
                );
                const defaultId = defaultAssignerUser ? defaultAssignerUser.id : (user?.uid || '');
                setSelectedAssigner(defaultId);
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

    // Danh sách người có thể phối hợp (không phải người phụ trách)
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
        const assignerUser = users.find(u => u.id === selectedAssigner);

        const firestoreUser = auth.currentUser;
        const currentUserId = assignerUser?.id || firestoreUser?.uid || user?.uid;
        const currentUserName = assignerUser?.displayName || assignerUser?.email || firestoreUser?.displayName || user?.displayName || user?.email || firestoreUser?.email || 'Người dùng ẩn danh';

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
                vanBanId,
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

            // Log activity
            await logVanBanActivity({
                vanBanId,
                action: 'TASK_ASSIGN',
                details: `Giao việc cho ${taskData.assigneeName}. Nội dung: ${taskData.content.substring(0, 100)}${taskData.content.length > 100 ? '...' : ''}`,
                userId: currentUserId,
                userName: currentUserName
            });

            toast.success('Đã giao công việc thành công!');

            // Reset states
            setContent('');
            setSelectedAssignee('');
            setSelectedCollaborators([]);

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
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Send className="w-5 h-5 text-blue-600" />
                        Phân công Xử lý Văn bản
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={isSubmitting}
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0">
                    {/* Người Giao Việc */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <UserCheck className="w-4 h-4 text-indigo-600" />
                            Người giao việc <span className="text-red-500">*</span>
                        </label>
                        {loadingUsers ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 p-2 border rounded-md bg-gray-50">
                                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách...
                            </div>
                        ) : (
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                value={selectedAssigner}
                                onChange={(e) => setSelectedAssigner(e.target.value)}
                                disabled={isSubmitting || (user?.role !== 'admin' && user?.role !== 'manager')}
                                required
                            >
                                <option value="">-- Chọn người giao việc --</option>
                                {users.map(u => (
                                    <option key={`assigner-${u.id}`} value={u.id}>
                                        {u.displayName || u.email} {u.department ? `(${u.department})` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                        {(!user || (user.role !== 'admin' && user.role !== 'manager')) && (
                            <p className="text-xs text-gray-500 mt-1.5 italic">
                                Chỉ Admin hoặc Ban Giám Đốc mới có quyền thay đổi người giao việc.
                            </p>
                        )}
                    </div>

                    {/* Người phụ trách chính */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                            <UserCheck className="w-4 h-4 text-blue-600" />
                            Người phụ trách chính <span className="text-red-500">*</span>
                        </label>
                        {loadingUsers ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 p-2 border rounded-md bg-gray-50">
                                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách...
                            </div>
                        ) : (
                            <select
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                                value={selectedAssignee}
                                onChange={(e) => handleAssigneeChange(e.target.value)}
                                disabled={isSubmitting}
                                required
                            >
                                <option value="">-- Chọn người sẽ tiếp nhận xử lý --</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.displayName || u.email} {u.department ? `(${u.department})` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Người phối hợp */}
                    {!loadingUsers && users.length > 0 && (
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Users className="w-4 h-4 text-purple-600" />
                                Phối hợp thực hiện <span className="text-gray-400 text-xs font-normal">(Tùy chọn, có thể chọn nhiều người)</span>
                            </label>
                            <div className="border border-gray-200 rounded-md divide-y max-h-44 overflow-y-auto">
                                {collaboratorCandidates.length === 0 ? (
                                    <p className="p-3 text-xs text-gray-400 italic text-center">
                                        {selectedAssignee ? 'Không còn người dùng khác để phối hợp.' : 'Chọn người phụ trách trước.'}
                                    </p>
                                ) : (
                                    collaboratorCandidates.map(u => {
                                        const isChecked = selectedCollaborators.includes(u.id);
                                        return (
                                            <label
                                                key={u.id}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isChecked ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleCollaborator(u.id)}
                                                    className="rounded text-purple-600 focus:ring-purple-500"
                                                    disabled={isSubmitting}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-700 truncate">{u.displayName || u.email}</p>
                                                    {u.department && (
                                                        <p className="text-xs text-gray-400 truncate">{u.department}</p>
                                                    )}
                                                </div>
                                                {isChecked && (
                                                    <span className="text-xs text-purple-600 font-medium shrink-0">✓ Đã chọn</span>
                                                )}
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                            {selectedCollaborators.length > 0 && (
                                <p className="text-xs text-purple-600 mt-1.5 font-medium">
                                    Đã chọn {selectedCollaborators.length} người phối hợp
                                </p>
                            )}
                        </div>
                    )}

                    {/* Nội dung chỉ đạo */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Nội dung yêu cầu/chỉ đạo <span className="text-red-500">*</span>
                        </label>
                        <textarea
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow min-h-[120px] resize-y"
                            placeholder="Ghi rõ nội dung yêu cầu, thời hạn xử lý nếu có..."
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            disabled={isSubmitting}
                            required
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            disabled={isSubmitting}
                        >
                            Hủy
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !selectedAssignee || !content.trim()}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            Giao Việc
                        </button>
                    </div>
                </div>
            </div>

            <GenericConfirmModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={executeSubmit}
                title="Xác nhận Giao việc"
                message="Bạn có chắc chắn muốn giao công việc này không?"
                confirmText="Giao việc"
            />
        </div>
    );
};
