import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs, deleteDoc, doc, updateDoc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import {
    CheckCircle2, Clock, Loader2, Trash2, Send, ChevronDown, ChevronUp,
    Edit3, FileText, ExternalLink, Upload, Paperclip, Download, ListChecks,
    UserCheck, Users, ClipboardList, Filter, Settings
} from 'lucide-react';
import { formatDateTime } from '../utils/formatVN';
import { UpdateTaskModal } from '../components/UpdateTaskModal';
import { AdminEditTaskModal } from '../components/AdminEditTaskModal';
import { GenericConfirmModal } from '../components/GenericConfirmModal';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

type TabType = 'my_tasks' | 'collaborating' | 'assigned_by_me' | 'all_tasks';

const StatusBadge = ({ status }: { status: string }) => {
    switch (status) {
        case 'COMPLETED':
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"><CheckCircle2 className="w-3.5 h-3.5" /> Hoàn thành</span>;
        case 'IN_PROGRESS':
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"><Clock className="w-3.5 h-3.5" /> Đang xử lý</span>;
        default:
            return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800"><Clock className="w-3.5 h-3.5" /> Chờ xử lý</span>;
    }
};

export const TasksManagement = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('my_tasks');
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [selectedTaskToUpdate, setSelectedTaskToUpdate] = useState<any | null>(null);
    const [deleteModal, setDeleteModal] = useState({ isOpen: false, taskId: '' });
    const [adminEditTask, setAdminEditTask] = useState<any | null>(null);

    // Upload file state
    const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);

    // Cache VB info
    const [vanBanCache, setVanBanCache] = useState<Record<string, any>>({});
    // Filter user for all_tasks tab
    const [filterUser, setFilterUser] = useState<string>('');

    const fetchTasks = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        try {
            let q;
            if (activeTab === 'all_tasks') {
                // Admin/Manager: fetch ALL tasks
                q = query(collection(db, 'vanban_tasks'));
            } else if (activeTab === 'my_tasks') {
                q = query(collection(db, 'vanban_tasks'), where('assigneeId', '==', user.uid));
            } else if (activeTab === 'collaborating') {
                q = query(collection(db, 'vanban_tasks'), where('collaboratorIds', 'array-contains', user.uid));
            } else {
                q = query(collection(db, 'vanban_tasks'), where('assignerId', '==', user.uid));
            }

            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Sort: PENDING & IN_PROGRESS first (newest first), then COMPLETED (newest first)
            const statusOrder = (s: string) => s === 'COMPLETED' ? 1 : 0;
            data.sort((a: any, b: any) => {
                const aDone = statusOrder(a.status);
                const bDone = statusOrder(b.status);
                if (aDone !== bDone) return aDone - bDone;
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

            setTasks(data);

            // Fetch VB info for display (vanBanId + bcDocId)
            const vanBanIds = [...new Set(data.map((t: any) => t.vanBanId).filter(Boolean))];
            const bcDocIds = [...new Set(data.map((t: any) => t.bcDocId).filter(Boolean))];
            const allIds = [...new Set([...vanBanIds, ...bcDocIds])];
            const newCache: Record<string, any> = { ...vanBanCache };
            for (const vbId of allIds) {
                if (!newCache[vbId]) {
                    try {
                        const vbDoc = await getDoc(doc(db, 'vanban', vbId));
                        if (vbDoc.exists()) {
                            newCache[vbId] = { id: vbDoc.id, ...vbDoc.data() };
                        }
                    } catch { /* skip */ }
                }
            }
            setVanBanCache(newCache);
        } catch (err: any) {
            console.error('Error fetching tasks:', err);
            toast.error('Lỗi khi tải danh sách công việc.');
        } finally {
            setLoading(false);
        }
    }, [user?.uid, activeTab]);

    useEffect(() => {
        fetchTasks();
    }, [fetchTasks]);

    const handleAcceptTask = async (task: any) => {
        try {
            await updateDoc(doc(db, 'vanban_tasks', task.id), { status: 'IN_PROGRESS' });
            toast.success('Đã nhận việc! Đang xử lý.');
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error('Có lỗi xảy ra khi nhận việc.');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            await deleteDoc(doc(db, 'vanban_tasks', taskId));
            toast.success('Đã xóa phân công!');
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error('Lỗi khi xóa phân công.');
        }
        setDeleteModal({ isOpen: false, taskId: '' });
    };

    const handleUploadReport = async (taskId: string, files: FileList) => {
        if (!files || files.length === 0) return;
        setUploadingTaskId(taskId);
        try {
            const uploadedFiles: any[] = [];
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const storageRef = ref(storage, `task_reports/${taskId}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                uploadedFiles.push({
                    name: file.name,
                    url,
                    size: file.size,
                    uploadedAt: new Date().toISOString()
                });
            }

            // Get existing reportFiles
            const taskDoc = await getDoc(doc(db, 'vanban_tasks', taskId));
            const existing = (taskDoc.data()?.reportFiles || []) as any[];

            await updateDoc(doc(db, 'vanban_tasks', taskId), {
                reportFiles: [...existing, ...uploadedFiles]
            });

            toast.success(`Đã upload ${uploadedFiles.length} file báo cáo!`);
            fetchTasks();
        } catch (err) {
            console.error(err);
            toast.error('Lỗi khi upload file.');
        } finally {
            setUploadingTaskId(null);
        }
    };

    const getVanBanLabel = (vanBanId: string) => {
        const vb = vanBanCache[vanBanId];
        if (!vb) return vanBanId;
        return `${vb.loaiVanBan || ''} ${vb.soKyHieu || ''}`.trim() || vb.fileNameOriginal || vanBanId;
    };

    const tabs: { key: TabType; label: string; icon: React.ElementType }[] = [
        { key: 'my_tasks', label: 'Tôi phụ trách', icon: UserCheck },
        { key: 'collaborating', label: 'Tôi phối hợp', icon: Users },
        { key: 'assigned_by_me', label: 'Tôi đã giao', icon: ClipboardList },
        { key: 'all_tasks', label: 'Quản lý toàn bộ', icon: Filter },
    ];

    const canManage = user?.role === 'admin' || user?.role === 'manager';

    // Filtered tasks for all_tasks tab
    const displayTasks = activeTab === 'all_tasks' && filterUser
        ? tasks.filter(t => t.assigneeId === filterUser || t.assigneeName === filterUser)
        : tasks;

    // Get unique assignees for filter dropdown
    const uniqueAssignees = activeTab === 'all_tasks'
        ? [...new Map(tasks.map((t: any) => [t.assigneeId, { id: t.assigneeId, name: t.assigneeName || t.assigneeId }])).values()]
        : [];

    // Group tasks by assignee for all_tasks tab
    const groupedTasks = activeTab === 'all_tasks'
        ? displayTasks.reduce((groups: Record<string, any[]>, task: any) => {
            const key = task.assigneeName || task.assigneeId || 'Không xác định';
            if (!groups[key]) groups[key] = [];
            groups[key].push(task);
            return groups;
        }, {} as Record<string, any[]>)
        : null;

    const statusCounts = {
        pending: displayTasks.filter(t => t.status === 'PENDING').length,
        inProgress: displayTasks.filter(t => t.status === 'IN_PROGRESS').length,
        completed: displayTasks.filter(t => t.status === 'COMPLETED').length,
    };

    return (
        <div className="h-full bg-gray-50 p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                            <ListChecks className="w-5 h-5 text-indigo-600" />
                        </div>
                        Công việc của tôi
                    </h1>
                    <p className="text-sm text-gray-500 mt-1 ml-[52px]">Theo dõi, nhận việc, báo cáo tiến độ và hoàn thành công việc được giao</p>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-amber-700">Chờ xử lý</p>
                            <Clock className="w-5 h-5 text-amber-500" />
                        </div>
                        <p className="text-2xl font-bold text-amber-900 mt-1">{statusCounts.pending}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-blue-700">Đang xử lý</p>
                            <Loader2 className="w-5 h-5 text-blue-500" />
                        </div>
                        <p className="text-2xl font-bold text-blue-900 mt-1">{statusCounts.inProgress}</p>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-green-700">Hoàn thành</p>
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                        </div>
                        <p className="text-2xl font-bold text-green-900 mt-1">{statusCounts.completed}</p>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="flex border-b border-gray-200">
                        {tabs.map(tab => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.key;
                            // Only show "assigned by me" tab for admin/manager
                            if (tab.key === 'assigned_by_me' && !canManage) return null;
                            // Only show "all_tasks" tab for admin/manager
                            if (tab.key === 'all_tasks' && !canManage) return null;
                            return (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${isActive
                                        ? 'border-indigo-500 text-indigo-600 bg-indigo-50/50'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                                        }`}
                                >
                                    <Icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Filter bar for all_tasks */}
                    {activeTab === 'all_tasks' && (
                        <div className="flex items-center gap-3 px-5 py-3 bg-amber-50/70 border-b">
                            <Filter className="w-4 h-4 text-amber-600" />
                            <span className="text-sm font-medium text-gray-700">Lọc theo người dùng:</span>
                            <select
                                value={filterUser}
                                onChange={(e) => setFilterUser(e.target.value)}
                                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none min-w-[180px]"
                            >
                                <option value="">Tất cả ({tasks.length} công việc)</option>
                                {uniqueAssignees.map((a: any) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                            {filterUser && (
                                <button onClick={() => setFilterUser('')} className="text-xs text-amber-700 hover:text-amber-900 font-medium underline">Bỏ lọc</button>
                            )}
                        </div>
                    )}

                    {/* Table */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        </div>
                    ) : displayTasks.length === 0 ? (
                        <div className="text-center py-20 text-gray-400">
                            <ListChecks className="w-12 h-12 mx-auto mb-3 opacity-40" />
                            <p className="text-sm">Không có công việc nào trong mục này.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">STT</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Ngày giao</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nội dung chỉ đạo</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Văn bản</th>
                                        {activeTab === 'all_tasks' ? (
                                            <>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phụ trách</th>
                                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Người giao</th>
                                            </>
                                        ) : (
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                {activeTab === 'assigned_by_me' ? 'P. Trách' : 'Người giao'}
                                            </th>
                                        )}
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P. Hợp</th>
                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-28">Trạng thái</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-32">Tùy chọn</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {activeTab === 'all_tasks' && groupedTasks ? (
                                        // Grouped view for admin/manager
                                        Object.entries(groupedTasks).map(([assigneeName, groupTasks]: [string, any[]]) => {
                                            const groupPending = groupTasks.filter(t => t.status === 'PENDING').length;
                                            const groupInProgress = groupTasks.filter(t => t.status === 'IN_PROGRESS').length;
                                            const groupCompleted = groupTasks.filter(t => t.status === 'COMPLETED').length;
                                            return (
                                                <React.Fragment key={assigneeName}>
                                                    {/* Group header */}
                                                    {!filterUser && (
                                                        <tr className="bg-indigo-50/80 border-t-2 border-indigo-200">
                                                            <td colSpan={10} className="px-4 py-2.5">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-7 h-7 rounded-full bg-indigo-200 flex items-center justify-center text-xs font-bold text-indigo-700">
                                                                            {assigneeName.charAt(0).toUpperCase()}
                                                                        </div>
                                                                        <span className="font-semibold text-sm text-indigo-900">{assigneeName}</span>
                                                                        <span className="text-xs text-indigo-500">({groupTasks.length} công việc)</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-3 text-xs">
                                                                        {groupPending > 0 && <span className="text-amber-700 font-medium">⏳ {groupPending} chờ</span>}
                                                                        {groupInProgress > 0 && <span className="text-blue-700 font-medium">🔄 {groupInProgress} đang xử lý</span>}
                                                                        {groupCompleted > 0 && <span className="text-green-700 font-medium">✅ {groupCompleted} hoàn thành</span>}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                    {groupTasks.map((task: any, index: number) => {
                                                        const isAdmin = user?.role === 'admin';
                                                        const canEdit = isAdmin || user?.role === 'manager';
                                                        const canDelete = isAdmin;
                                                        const isExpanded = expandedTaskId === task.id;
                                                        return (
                                                            <React.Fragment key={task.id}>
                                                                <tr className={`hover:bg-gray-50 transition-colors ${task.status === 'COMPLETED' ? 'opacity-60' : ''}`}>
                                                                    <td className="px-4 py-4 text-sm text-center font-medium text-gray-500">{index + 1}</td>
                                                                    <td className="px-4 py-4 text-sm text-center text-gray-600 font-medium">
                                                                        {task.createdAt ? formatDateTime(task.createdAt) : ''}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-sm text-gray-900">
                                                                        <div className="flex items-start gap-2">
                                                                            <button onClick={() => setExpandedTaskId(isExpanded ? null : task.id)} className="shrink-0 mt-0.5 text-gray-400 hover:text-indigo-600">
                                                                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                                            </button>
                                                                            <span className="line-clamp-2">{task.content}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-4 text-sm">
                                                                        {task.vanBanId ? (
                                                                            <button onClick={() => navigate(`/documents/${task.vanBanId}`)} className="inline-flex items-center gap-1.5 text-blue-700 hover:text-blue-900 bg-blue-50 px-2 py-1 rounded-md hover:bg-blue-100 text-xs font-medium transition-colors">
                                                                                <FileText className="w-3.5 h-3.5" />
                                                                                {getVanBanLabel(task.vanBanId)}
                                                                            </button>
                                                                        ) : <span className="text-gray-400 text-xs">—</span>}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-sm">
                                                                        <span className="font-medium text-gray-800">{task.assigneeName || '—'}</span>
                                                                    </td>
                                                                    <td className="px-4 py-4 text-sm text-gray-600">{task.assignerName || '—'}</td>
                                                                    <td className="px-4 py-4 text-sm">
                                                                        {task.collaborators && task.collaborators.length > 0 ? (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {task.collaborators.map((c: any) => (
                                                                                    <span key={c.id} className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">{c.name}</span>
                                                                                ))}
                                                                            </div>
                                                                        ) : <span className="text-gray-400 text-xs">—</span>}
                                                                    </td>
                                                                    <td className="px-4 py-4 text-center">
                                                                        <StatusBadge status={task.status} />
                                                                    </td>
                                                                    <td className="px-4 py-4 text-right text-sm font-medium whitespace-nowrap">
                                                                        <div className="flex items-center justify-end gap-1.5">
                                                                            {canDelete && (
                                                                                <button onClick={() => setDeleteModal({ isOpen: true, taskId: task.id })} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors" title="Xóa phân công">
                                                                                    <Trash2 className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                            {user?.role === 'admin' && (
                                                                                <button onClick={() => setAdminEditTask(task)} className="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-1.5 rounded-md transition-colors" title="Chỉnh sửa (Admin)">
                                                                                    <Settings className="w-4 h-4" />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                {isExpanded && (
                                                                    <tr>
                                                                        <td colSpan={10} className="px-6 py-4 bg-slate-50 border-t">
                                                                            {task.result && (
                                                                                <div className="mb-3">
                                                                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Kết quả báo cáo:</p>
                                                                                    <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded-lg border">{task.result}</p>
                                                                                </div>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </React.Fragment>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })
                                    ) : (
                                        // Normal view
                                        displayTasks.map((task: any, index: number) => {
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
                                                        <td className="px-4 py-4 text-sm text-center font-medium text-gray-500">{index + 1}</td>
                                                        <td className="px-4 py-4 text-sm text-center text-gray-600 font-medium">
                                                            {task.createdAt ? formatDateTime(task.createdAt) : ''}
                                                        </td>
                                                        <td className="px-4 py-4 text-sm text-gray-900">
                                                            <div className="line-clamp-2">{task.content}</div>
                                                            {(task.result || (task.reportFiles && task.reportFiles.length > 0)) && (
                                                                <button
                                                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                                                    className="text-indigo-600 mt-2 text-xs font-medium flex items-center gap-1 hover:text-indigo-800"
                                                                >
                                                                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                                                    {isExpanded ? 'Thu gọn' : 'Xem kết quả / file báo cáo'}
                                                                </button>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-sm">
                                                            <button
                                                                onClick={() => task.vanBanId && navigate(`/documents/${task.vanBanId}`)}
                                                                className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium flex items-center gap-1"
                                                                title="Mở văn bản"
                                                            >
                                                                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                                                <span className="line-clamp-1">{getVanBanLabel(task.vanBanId)}</span>
                                                            </button>
                                                        </td>
                                                        <td className="px-4 py-4 text-sm">
                                                            {activeTab === 'assigned_by_me' ? (
                                                                <span className="text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded-full text-xs">{task.assigneeName}</span>
                                                            ) : (
                                                                <span className="text-gray-600 text-xs">{task.assignerName}</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-sm">
                                                            {task.collaborators && task.collaborators.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1">
                                                                    {task.collaborators.map((c: any) => (
                                                                        <span key={c.id} className="px-2 py-0.5 text-xs bg-purple-100 text-purple-800 rounded-full font-medium">{c.name}</span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400 text-xs italic">&#8212;</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-4 text-center">
                                                            <StatusBadge status={task.status} />
                                                        </td>
                                                        <td className="px-4 py-4 text-right text-sm font-medium whitespace-nowrap">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                {canEdit && task.status === 'PENDING' && (
                                                                    <button onClick={() => handleAcceptTask(task)} className="text-green-700 hover:text-green-900 bg-green-50 p-1.5 rounded-md hover:bg-green-100 transition-colors" title="Nhận việc">
                                                                        <CheckCircle2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {canEdit && task.status === 'IN_PROGRESS' && (
                                                                    <button onClick={() => setSelectedTaskToUpdate(task)} className="text-blue-600 hover:text-blue-900 bg-blue-50 p-1.5 rounded-md hover:bg-blue-100 transition-colors" title="Báo cáo tiến độ">
                                                                        <Send className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {canEdit && task.status === 'IN_PROGRESS' && (
                                                                    <label className="text-orange-600 hover:text-orange-900 bg-orange-50 p-1.5 rounded-md hover:bg-orange-100 transition-colors cursor-pointer" title="Upload file báo cáo">
                                                                        {uploadingTaskId === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                                                        <input type="file" className="hidden" multiple accept=".pdf,.docx,.xlsx,.jpg,.png,.jpeg" onChange={e => e.target.files && handleUploadReport(task.id, e.target.files)} disabled={uploadingTaskId === task.id} />
                                                                    </label>
                                                                )}
                                                                {canEdit && task.status === 'COMPLETED' && (
                                                                    <button onClick={() => setSelectedTaskToUpdate(task)} className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 p-1.5 rounded-md hover:bg-indigo-100 transition-colors" title="Sửa báo cáo">
                                                                        <Edit3 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {canDelete && (
                                                                    <button onClick={() => setDeleteModal({ isOpen: true, taskId: task.id })} className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors" title="Xóa phân công">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                                {user?.role === 'admin' && (
                                                                    <button onClick={() => setAdminEditTask(task)} className="text-amber-600 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 p-1.5 rounded-md transition-colors" title="Chỉnh sửa (Admin)">
                                                                        <Settings className="w-4 h-4" />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {/* Expanded: result + VB đi + files */}
                                                    {isExpanded && (
                                                        <tr>
                                                            <td colSpan={8} className="px-6 py-4 bg-slate-50 border-t">
                                                                {task.result && (
                                                                    <div className="mb-3">
                                                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Kết quả báo cáo:</p>
                                                                        <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white p-3 rounded-lg border">{task.result}</p>
                                                                    </div>
                                                                )}
                                                                {/* Hiển thị VB đi đã tạo từ Báo cáo Hoàn thành */}
                                                                {task.bcDocId && vanBanCache[task.bcDocId] && (() => {
                                                                    const bcVb = vanBanCache[task.bcDocId];
                                                                    const vbLabel = [
                                                                        bcVb.loaiVanBan || '',
                                                                        bcVb.soKyHieu ? `số ${bcVb.soKyHieu}` : '',
                                                                        bcVb.ngayBanHanh ? `ngày ${new Date(bcVb.ngayBanHanh).toLocaleDateString('vi-VN')}` : '',
                                                                        bcVb.coQuanBanHanh ? `của ${bcVb.coQuanBanHanh}` : '',
                                                                        bcVb.trichYeu ? bcVb.trichYeu : ''
                                                                    ].filter(Boolean).join(' ');
                                                                    return (
                                                                        <div className="mb-3">
                                                                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Văn bản kết quả:</p>
                                                                            <div
                                                                                onClick={() => navigate(`/documents/${task.bcDocId}`)}
                                                                                className="flex items-start gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer group"
                                                                            >
                                                                                <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                                                                                    <FileText className="w-5 h-5 text-red-600" />
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <p className="text-sm text-gray-900 group-hover:text-blue-700 transition-colors leading-relaxed">
                                                                                        {vbLabel || bcVb.fileNameOriginal || 'Văn bản đi'}
                                                                                    </p>
                                                                                    {bcVb.phanLoaiVanBan && (
                                                                                        <span className={`inline-flex items-center gap-1 mt-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${bcVb.phanLoaiVanBan === 'OUTGOING' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                                                                                            }`}>
                                                                                            {bcVb.phanLoaiVanBan === 'OUTGOING' ? '📤 Văn bản đi' : '📥 Văn bản đến'}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <ExternalLink className="w-4 h-4 text-gray-400 group-hover:text-blue-500 shrink-0 mt-1" />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })()}
                                                                {task.reportFiles && task.reportFiles.length > 0 && (
                                                                    <div>
                                                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">File đính kèm:</p>
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {task.reportFiles.map((f: any, idx: number) => (
                                                                                <a
                                                                                    key={idx}
                                                                                    href={f.url}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                                                                                >
                                                                                    <Paperclip className="w-3.5 h-3.5" />
                                                                                    <span className="max-w-[200px] truncate">{f.name}</span>
                                                                                    <Download className="w-3.5 h-3.5 text-gray-400" />
                                                                                </a>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {selectedTaskToUpdate && (
                <UpdateTaskModal
                    isOpen={!!selectedTaskToUpdate}
                    onClose={() => setSelectedTaskToUpdate(null)}
                    task={selectedTaskToUpdate}
                    onSuccess={fetchTasks}
                />
            )}

            {adminEditTask && (
                <AdminEditTaskModal
                    isOpen={!!adminEditTask}
                    onClose={() => setAdminEditTask(null)}
                    task={adminEditTask}
                    onSuccess={fetchTasks}
                />
            )}

            <GenericConfirmModal
                isOpen={deleteModal.isOpen}
                onClose={() => setDeleteModal({ isOpen: false, taskId: '' })}
                onConfirm={() => handleDeleteTask(deleteModal.taskId)}
                title="Xóa phân công"
                message="Bạn có chắc chắn muốn xóa phân công này? Hành động này không thể hoàn tác."
                confirmText="Xóa"
                type="danger"
            />
        </div>
    );
};
