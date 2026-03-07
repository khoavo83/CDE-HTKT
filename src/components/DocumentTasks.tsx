import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { CheckCircle2, Clock, CheckSquare, Edit3, Trash2, Send, ChevronDown, ChevronUp, UserPlus, Users, Settings, FileText, ExternalLink } from 'lucide-react';
import { formatDateTime } from '../utils/formatVN';
import { AssignTaskModal } from './AssignTaskModal';
import { UpdateTaskModal } from './UpdateTaskModal';
import { AdminEditTaskModal } from './AdminEditTaskModal';
import { GenericConfirmModal } from './GenericConfirmModal';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { getDocIconConfig, getDocFormattedTitle } from '../utils/docUtils';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import toast from 'react-hot-toast';

interface DocumentTasksProps {
    vanBanId: string;
}

const TaskFileBadge = ({ docId, onOpenPreview }: { docId: string, onOpenPreview: (doc: any) => void }) => {
    const [docData, setDocData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDoc = async () => {
            try {
                const d = await getDoc(doc(db, 'vanban', docId));
                if (d.exists()) {
                    setDocData({ id: d.id, ...d.data() });
                }
            } catch (e) {
                console.error('[TaskFileBadge] Error:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchDoc();
    }, [docId]);

    if (loading) return <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-100 text-[10px] text-gray-400 animate-pulse"><div className="w-3 h-3 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin" /> Đang tải tệp...</div>;
    if (!docData) return null;

    const { Icon, color, bg } = getDocIconConfig(docData);
    const title = getDocFormattedTitle(docData);

    return (
        <button
            type="button"
            onClick={() => onOpenPreview(docData)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-indigo-100 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group max-w-full overflow-hidden"
        >
            <span className={`w-7 h-7 rounded-md ${bg} ${color} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
                <Icon className="w-4 h-4" />
            </span>
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-gray-900 truncate leading-tight mb-0.5">{title}</p>
                <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-gray-500 font-medium px-1.5 py-0.5 bg-gray-50 rounded border border-gray-100">Tệp báo cáo</span>
                    <span className="text-[9px] text-indigo-500 font-semibold group-hover:underline flex items-center gap-0.5">Click để xem chi tiết <ExternalLink className="w-2.5 h-2.5" /></span>
                </div>
            </div>
        </button>
    );
};

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
    const [adminEditTask, setAdminEditTask] = useState<any | null>(null);

    // Preview state
    const [previewDocData, setPreviewDocData] = useState<any | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

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
            // Get task info for logging before deletion
            const taskToDelete = tasks.find(t => t.id === taskId);

            await deleteDoc(doc(db, 'vanban_tasks', taskId));

            if (taskToDelete && user) {
                await logVanBanActivity({
                    vanBanId,
                    action: 'TASK_DELETE',
                    details: `Xóa phân công của ${taskToDelete.assigneeName}. Nội dung: ${taskToDelete.content.substring(0, 50)}...`,
                    userId: user.uid,
                    userName: user.hoTen || user.displayName || user.email || 'Người dùng'
                });
            }

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

            if (user) {
                await logVanBanActivity({
                    vanBanId,
                    action: 'TASK_ACCEPT',
                    details: `Chấp nhận thực hiện công việc: ${task.content.substring(0, 100)}${task.content.length > 100 ? '...' : ''}`,
                    userId: user.uid,
                    userName: user.hoTen || user.displayName || user.email || 'Người dùng'
                });
            }

            toast.success('Đã nhận việc! Đang tiến hành.');
            fetchTasks(); // Reload bảng
        } catch (error) {
            console.error(error);
            toast.error('Có lỗi xảy ra khi nhận việc.');
        }
    };

    const handleOpenPreview = async (docId: string) => {
        if (!docId) return;
        setLoadingPreview(true);
        try {
            const d = await getDoc(doc(db, 'vanban', docId));
            if (d.exists()) {
                setPreviewDocData({ id: d.id, ...d.data() });
            } else {
                toast.error('Không tìm thấy thông tin tệp đính kèm.');
            }
        } catch (e) {
            console.error('[DocumentTasks] Error fetching preview doc:', e);
            toast.error('Có lỗi xảy ra khi tải thông tin tệp.');
        } finally {
            setLoadingPreview(false);
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
                        type="button"
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
                    <button type="button" onClick={fetchTasks} className="ml-2 text-red-700 underline hover:no-underline">Thử lại</button>
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
                                <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Đến ngày</th>
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
                                            <td className="px-4 py-4 text-sm text-gray-900 break-words">
                                                <div>{task.content}</div>
                                                <div className="text-gray-400 text-xs font-normal mt-1 flex justify-between items-center gap-2">
                                                    <span>Giao bởi: {task.assignerName}</span>
                                                </div>
                                                {task.result && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                                        className="text-indigo-600 mt-2 text-xs font-medium flex items-center gap-1 hover:text-indigo-800"
                                                    >
                                                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                        {isExpanded ? 'Thu gọn kết quả' : 'Xem kết quả báo cáo'}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-sm">
                                                <span className="text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full inline-block w-fit break-words">{task.assigneeName}</span>
                                            </td>
                                            <td className="px-4 py-4 text-sm">
                                                {task.collaborators && task.collaborators.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {task.collaborators.map((c: any) => (
                                                            <span key={c.id} title={c.name} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-medium break-words">
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
                                                            type="button"
                                                            onClick={() => handleAcceptTask(task)}
                                                            className="text-green-700 hover:text-green-900 bg-green-50 p-1.5 rounded-md hover:bg-green-100 transition-colors"
                                                            title="Nhận việc"
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canEdit && task.status === 'IN_PROGRESS' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTaskToUpdate(task)}
                                                            className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-md hover:bg-blue-100 transition-colors"
                                                            title="Báo cáo thay đổi tiến độ"
                                                        >
                                                            <Send className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canEdit && task.status === 'COMPLETED' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedTaskToUpdate(task)}
                                                            className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md hover:bg-indigo-100 transition-colors"
                                                            title="Sửa báo cáo"
                                                        >
                                                            <Edit3 className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    {canDelete && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteModal({ isOpen: true, taskId: task.id })}
                                                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                                                            title="Xóa phân công này"
                                                        >
                                                            <Trash2 className="w-4 h-4 ml-1" />
                                                        </button>
                                                    )}
                                                    {user?.role === 'admin' && (
                                                        <button type="button" onClick={() => setAdminEditTask(task)} className="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-1.5 rounded-md transition-colors" title="Chỉnh sửa (Admin)">
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {/* Row showing result if expanded */}
                                        {isExpanded && task.result && (
                                            <tr className="bg-indigo-50/40">
                                                <td colSpan={7} className="px-6 py-4 text-sm">
                                                    <div className="pl-4 border-l-4 border-indigo-400 rounded-r-md py-2 flex flex-col gap-3">
                                                        <div className="flex flex-col gap-1.5">
                                                            <p className="font-semibold text-indigo-900 text-[10px] uppercase tracking-wide">
                                                                Kết quả xử lý (Hoàn thành lúc: {task.completedAt ? formatDateTime(task.completedAt) : 'Chưa rõ'})
                                                            </p>
                                                            <div className="text-gray-800 whitespace-pre-wrap leading-relaxed bg-white border border-indigo-100 p-3 rounded text-sm">{task.result}</div>
                                                        </div>
                                                        {task.bcDocId && (
                                                            <div className="mt-1">
                                                                <TaskFileBadge
                                                                    docId={task.bcDocId}
                                                                    onOpenPreview={setPreviewDocData}
                                                                />
                                                            </div>
                                                        )}
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

            {adminEditTask && (
                <AdminEditTaskModal
                    isOpen={!!adminEditTask}
                    onClose={() => setAdminEditTask(null)}
                    task={adminEditTask}
                    onSuccess={fetchTasks}
                />
            )}

            {previewDocData && (
                <DocumentPreviewModal
                    doc={previewDocData}
                    onClose={() => setPreviewDocData(null)}
                />
            )}
        </div>
    );
};
