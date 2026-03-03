import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { CheckCircle2, Clock, CheckSquare, Edit3, Trash2, Send, ChevronDown, ChevronUp, UserPlus, Users } from 'lucide-react';
import { formatDateTime } from '../utils/formatVN';
import { AssignTaskModal } from './AssignTaskModal';
import { UpdateTaskModal } from './UpdateTaskModal';
import { GenericConfirmModal } from './GenericConfirmModal';
import toast from 'react-hot-toast';

interface DocumentTasksProps {
    vanBanId: string;
}

export const DocumentTasks: React.FC<DocumentTasksProps> = ({ vanBanId }) => {
    const { user } = useAuthStore();
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [selectedTaskToUpdate, setSelectedTaskToUpdate] = useState<any | null>(null);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

    // Delete confirm
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, taskId: '' });

    const fetchTasks = async () => {
        if (!vanBanId) {
            console.warn('[DocumentTasks] vanBanId is empty, skipping fetch');
            setLoading(false);
            return;
        }
        console.log('[DocumentTasks] Fetching tasks for vanBanId:', vanBanId);
        setLoading(true);
        setError(null);
        try {
            const q = query(
                collection(db, 'vanban_tasks'),
                where('vanBanId', '==', vanBanId)
            );
            const snap = await getDocs(q);
            console.log('[DocumentTasks] Found', snap.size, 'tasks');

            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            // Sort newest first
            data.sort((a: any, b: any) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

            setTasks(data);
        } catch (err: any) {
            console.error('[DocumentTasks] Error fetching tasks:', err);
            setError('Không thể tải danh sách phân công: ' + err.message);
            toast.error('Không thể tải danh sách phân công.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTasks();
    }, [vanBanId]);

    const canAssignTask = user?.role === 'admin' || user?.role === 'manager';

    const handleDeleteTask = async (taskId: string) => {
        try {
            await deleteDoc(doc(db, 'vanban_tasks', taskId));
            toast.success('Đã xóa phân công!');
            fetchTasks();
        } catch (err) {
            console.error('Lỗi xóa task:', err);
            toast.error('Lỗi khi xóa phân công.');
        }
        setDeleteModal({ isOpen: false, taskId: '' });
    };

    const handleAcceptTask = async (task: any) => {
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            await updateDoc(taskRef, {
                status: 'IN_PROGRESS'
            });
            toast.success('Đã nhận việc! Đang tiến hành.');
            fetchTasks(); // Reload bảng
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi nhận việc.');
        }
    };

    const StatusBadge = ({ status }: { status: string }) => {
        switch (status) {
            case 'COMPLETED':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3.5 h-3.5" /> Đã xong</span>;
            case 'IN_PROGRESS':
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Clock className="w-3.5 h-3.5" /> Đang làm</span>;
            default:
                return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"><Clock className="w-3.5 h-3.5" /> Chờ xử lý</span>;
        }
    };

    if (loading) {
        return (
            <div className="mt-6 border border-gray-200 rounded-lg bg-white">
                <div className="p-4 text-center text-gray-500 text-sm animate-pulse">
                    Đang tải lịch sử phân công...
                </div>
            </div>
        );
    }

    return (
        <div className="mt-6 border border-gray-200 rounded-lg bg-white overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-base font-semibold text-gray-800 flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                    Theo dõi Phân công Xử lý
                    {tasks.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 text-xs rounded-full bg-indigo-100 text-indigo-700 font-medium">
                            {tasks.length}
                        </span>
                    )}
                </h3>
                {canAssignTask && (
                    <button
                        onClick={() => setIsAssignModalOpen(true)}
                        className="flex items-center gap-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
                    >
                        <Send className="w-4 h-4" /> Giao việc
                    </button>
                )}
            </div>

            {error && (
                <div className="p-4 text-center text-red-500 text-sm bg-red-50 border-b border-red-100">
                    ⚠️ {error}
                    <button onClick={fetchTasks} className="ml-2 text-red-700 underline hover:no-underline">Thử lại</button>
                </div>
            )}

            {!error && tasks.length === 0 ? (
                <div className="p-6 text-center text-gray-500 italic text-sm">
                    Văn bản này chưa có phân công xử lý nào.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">STT</th>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28 text-nowrap">Đến ngày</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[25%]">Nội dung chỉ đạo</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P.Trách</th>
                                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P.Hợp</th>
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Trạng thái</th>
                                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-24">Tuỳ chọn</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                            {tasks.map((task, index) => {
                                const isAssignee = user?.uid === task.assigneeId;
                                const isCollaborator = task.collaborators?.some((c: any) => c.id === user?.uid);
                                const isAssigner = user?.uid === task.assignerId;
                                const isAdmin = user?.role === 'admin';
                                const canEdit = isAssignee || isCollaborator || isAdmin;
                                const canDelete = isAssigner || isAdmin;
                                const isExpanded = expandedTaskId === task.id;

                                return (
                                    <React.Fragment key={task.id}>
                                        <tr className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-4 text-sm text-center font-medium text-gray-500">
                                                {index + 1}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-center text-gray-600 font-medium">
                                                {task.createdAt ? formatDateTime(task.createdAt) : ''}
                                            </td>
                                            <td className="px-4 py-4 text-sm text-gray-900">
                                                <div className="line-clamp-2">{task.content}</div>
                                                <div className="text-gray-400 text-xs font-normal mt-1 flex justify-between items-center gap-2">
                                                    <span>Giao bởi: {task.assignerName}</span>
                                                </div>
                                                {task.result && (
                                                    <button
                                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                                        className="text-indigo-600 mt-2 text-xs font-medium flex items-center gap-1 hover:text-indigo-800"
                                                    >
                                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        {isExpanded ? 'Thu gọn kết quả' : 'Xem kết quả báo cáo'}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-sm">
                                                <span className="text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full inline-block w-fit whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]">{task.assigneeName}</span>
                                            </td>
                                            <td className="px-4 py-4 text-sm">
                                                {task.collaborators && task.collaborators.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {task.collaborators.map((c: any) => (
                                                            <span key={c.id} title={c.name} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-medium whitespace-nowrap">
                                                                {c.name}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 text-xs italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-center">
                                                <StatusBadge status={task.status} />
                                            </td>
                                            <td className="px-4 py-4 text-right text-sm font-medium space-x-2 whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {canEdit && task.status === 'PENDING' && (
                                                        <button
                                                            onClick={() => handleAcceptTask(task)}
                                                            className="text-green-700 hover:text-green-900 bg-green-50 p-1.5 rounded-md hover:bg-green-100 transition-colors"
                                                            title="Nhận việc"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canEdit && task.status === 'IN_PROGRESS' && (
                                                        <button
                                                            onClick={() => setSelectedTaskToUpdate(task)}
                                                            className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-md hover:bg-blue-100 transition-colors"
                                                            title="Báo cáo thay đổi tiến độ"
                                                        >
                                                            <Send className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canEdit && task.status === 'COMPLETED' && (
                                                        <button
                                                            onClick={() => setSelectedTaskToUpdate(task)}
                                                            className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                                                            title="Sửa báo cáo"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            onClick={() => setDeleteModal({ isOpen: true, taskId: task.id })}
                                                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                                                            title="Xóa phân công này"
                                                        >
                                                            <Trash2 className="w-4 h-4 ml-1" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Row showing result if expanded */}
                                        {isExpanded && task.result && (
                                            <tr className="bg-indigo-50/40">
                                                <td colSpan={6} className="px-6 py-4 text-sm">
                                                    <div className="pl-4 border-l-4 border-indigo-400 rounded-r-md py-2">
                                                        <p className="font-semibold text-indigo-900 text-xs mb-2 uppercase tracking-wide">
                                                            Kết quả xử lý (Hoàn thành lúc: {task.completedAt ? formatDateTime(task.completedAt) : 'Chưa rõ'})
                                                        </p>
                                                        <div className="text-gray-800 whitespace-pre-wrap leading-relaxed bg-white border border-indigo-100 p-3 rounded">{task.result}</div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {isAssignModalOpen && (
                <AssignTaskModal
                    isOpen={isAssignModalOpen}
                    vanBanId={vanBanId}
                    onClose={() => setIsAssignModalOpen(false)}
                    onSuccess={fetchTasks}
                />
            )}

            {selectedTaskToUpdate && (
                <UpdateTaskModal
                    isOpen={!!selectedTaskToUpdate}
                    task={selectedTaskToUpdate}
                    onClose={() => setSelectedTaskToUpdate(null)}
                    onSuccess={fetchTasks}
                />
            )}

            <GenericConfirmModal
                isOpen={deleteModal.isOpen}
                title="Xóa phân công"
                message="Bạn có chắc chắn muốn xóa phân công này không? Dữ liệu sẽ không thể khôi phục."
                confirmText="Xác nhận xóa"
                type="danger"
                onClose={() => setDeleteModal({ isOpen: false, taskId: '' })}
                onConfirm={() => handleDeleteTask(deleteModal.taskId)}
            />
        </div>
    );
};
