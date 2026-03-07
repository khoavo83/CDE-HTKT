import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useUserStore } from '../store/useUserStore';
import { Loader2, X, Settings, Calendar, User, FileText, Users, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

interface AdminEditTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    onSuccess: () => void;
}

export const AdminEditTaskModal: React.FC<AdminEditTaskModalProps> = ({ isOpen, onClose, task, onSuccess }) => {
    const { users, fetchUsers } = useUserStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form fields
    const [createdAt, setCreatedAt] = useState('');
    const [assignerId, setAssignerId] = useState('');
    const [content, setContent] = useState('');
    const [assigneeId, setAssigneeId] = useState('');
    const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
    const [result, setResult] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        if (isOpen && task) {
            // Parse existing createdAt to datetime-local format
            if (task.createdAt) {
                const d = new Date(task.createdAt);
                const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString().slice(0, 16);
                setCreatedAt(local);
            }
            setAssignerId(task.assignerId || '');
            setContent(task.content || '');
            setAssigneeId(task.assigneeId || '');
            setCollaboratorIds(task.collaboratorIds || []);
            setResult(task.result || '');
            setStatus(task.status || 'PENDING');
            fetchUsers();
        }
    }, [isOpen, task]);

    if (!isOpen || !task) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            const updates: any = {};

            // Update createdAt
            if (createdAt) {
                updates.createdAt = new Date(createdAt).toISOString();
            }

            // Update content
            if (content !== task.content) {
                updates.content = content;
            }

            // Update resut
            if (result !== task.result) {
                updates.result = result;
            }

            // Update status
            if (status !== task.status) {
                updates.status = status;
            }

            // Update assigner
            if (assignerId && assignerId !== task.assignerId) {
                const selectedUser = users.find(u => u.uid === assignerId);
                if (selectedUser) {
                    updates.assignerId = selectedUser.uid;
                    updates.assignerName = selectedUser.displayName || selectedUser.email;
                }
            }

            // Update assignee
            if (assigneeId && assigneeId !== task.assigneeId) {
                const selectedUser = users.find(u => u.uid === assigneeId);
                if (selectedUser) {
                    updates.assigneeId = selectedUser.uid;
                    updates.assigneeName = selectedUser.displayName || selectedUser.email;
                }
            }

            // Update collaborators
            if (JSON.stringify(collaboratorIds) !== JSON.stringify(task.collaboratorIds || [])) {
                updates.collaboratorIds = collaboratorIds;
                updates.collaboratorNames = collaboratorIds.map(id => {
                    const u = users.find(user => user.uid === id);
                    return u ? (u.displayName || u.email) : 'N/A';
                });
            }

            if (Object.keys(updates).length === 0) {
                toast('Không có thay đổi nào.', { icon: 'ℹ️' });
                onClose();
                return;
            }

            await updateDoc(taskRef, updates);
            toast.success('Đã cập nhật thông tin phân công!');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Lỗi cập nhật task:', error);
            toast.error('Lỗi khi cập nhật: ' + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md transform transition-all scale-100">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-amber-600" />
                        Chỉnh sửa phân công (Admin)
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={isSubmitting}
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
                    {/* Nội dung giao việc */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <FileText className="w-4 h-4 text-blue-500" />
                            Nội dung giao việc
                        </label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow resize-none"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Thời gian giao */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Calendar className="w-4 h-4 text-blue-500" />
                                Thời gian giao
                            </label>
                            <input
                                type="datetime-local"
                                value={createdAt}
                                onChange={(e) => setCreatedAt(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-sm"
                            />
                        </div>

                        {/* Trạng thái */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <Settings className="w-4 h-4 text-gray-500" />
                                Trạng thái
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-white text-sm"
                            >
                                <option value="PENDING">Chưa nhận</option>
                                <option value="PROCESSING">Đang xử lý</option>
                                <option value="COMPLETED">Hoàn thành</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Người giao */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <User className="w-4 h-4 text-indigo-500" />
                                Người giao
                            </label>
                            <select
                                value={assignerId}
                                onChange={(e) => setAssignerId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-white text-sm"
                            >
                                <option value="">-- Chọn --</option>
                                {users.map((u: any) => (
                                    <option key={u.uid} value={u.uid}>
                                        {u.displayName || u.email}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {/* Người xử lý */}
                        <div>
                            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                <User className="w-4 h-4 text-green-500" />
                                Người xử lý
                            </label>
                            <select
                                value={assigneeId}
                                onChange={(e) => setAssigneeId(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow bg-white text-sm"
                            >
                                <option value="">-- Chọn --</option>
                                {users.map((u: any) => (
                                    <option key={u.uid} value={u.uid}>
                                        {u.displayName || u.email}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Người phối hợp */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <Users className="w-4 h-4 text-teal-500" />
                            Người phối hợp
                        </label>
                        <div className="grid grid-cols-2 gap-2 p-3 border border-gray-200 rounded-lg bg-gray-50 max-h-40 overflow-y-auto">
                            {users.map((u: any) => (
                                <label key={u.uid} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white p-1 rounded transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={collaboratorIds.includes(u.uid)}
                                        onChange={(e) => {
                                            if (e.target.checked) {
                                                setCollaboratorIds([...collaboratorIds, u.uid]);
                                            } else {
                                                setCollaboratorIds(collaboratorIds.filter(id => id !== u.uid));
                                            }
                                        }}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="truncate">{u.displayName || u.email}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    {/* Kết quả xử lý */}
                    <div>
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                            <MessageSquare className="w-4 h-4 text-amber-500" />
                            Kết quả xử lý
                        </label>
                        <textarea
                            value={result}
                            onChange={(e) => setResult(e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-shadow resize-none"
                            placeholder="Nhập kết quả xử lý..."
                        />
                    </div>

                    {/* Buttons */}
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
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 font-medium"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                            Lưu thay đổi
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
