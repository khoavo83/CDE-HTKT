import React, { useEffect, useState, useRef, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc, where, getDocs, getDoc, updateDoc } from 'firebase/firestore';
import { db, appFunctions } from '../firebase/config';
import { Link, useNavigate } from 'react-router-dom';
import { Settings, Eye, Trash2, Search, Filter, Clock, FileCheck, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, UserCheck, CheckCircle2, AlertCircle, Trash, ArrowUpDown, Send, Download, Upload } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { UploadDocumentModal } from '../components/UploadDocumentModal';
import { AssignTaskFromManagerModal } from '../components/AssignTaskFromManagerModal';
import { AdminEditTaskModal } from '../components/AdminEditTaskModal';
import { UpdateTaskModal } from '../components/UpdateTaskModal';
import { GenericConfirmModal } from '../components/GenericConfirmModal';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { isoToVN, formatBytes, formatDateTime } from '../utils/formatVN';
import { getDocIconConfig, getDocFormattedTitle } from '../utils/docUtils';
import { useAuthStore } from '../store/useAuthStore';
import { utils, writeFile } from 'xlsx';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { logVanBanActivity } from '../utils/vanbanLogUtils';

const TaskFileLinks = ({ docId, onOpenPreview }: { docId: string, onOpenPreview: (doc: any) => void }) => {
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
                console.error('[TaskFileLinks] Error:', e);
            } finally {
                setLoading(false);
            }
        };
        fetchDoc();
    }, [docId]);

    if (loading) return <div className="text-[10px] text-gray-400 italic animate-pulse">Đang tải tệp...</div>;
    if (!docData) return null;

    const { Icon, color, bg } = getDocIconConfig(docData);
    const title = getDocFormattedTitle(docData);

    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenPreview(docData); }}
            className="flex items-center gap-1.5 text-[10px] text-blue-600 hover:text-blue-800 font-bold bg-blue-50 px-2 py-1.5 rounded border border-blue-100 transition-colors w-fit text-left"
        >
            <Icon className="w-3 h-3 flex-shrink-0" />
            <span className="truncate max-w-[180px]">{title}</span>
        </button>
    );
};

export const Documents = () => {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [docs, setDocs] = useState<any[]>([]);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>({ key: 'ngayBanHanh', direction: 'desc' });
    const [activeTab, setActiveTab] = useState<'ALL' | 'INCOMING' | 'OUTGOING' | 'UNSORTED' | 'SORTED' | 'PROCESSING'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [nodeLinks, setNodeLinks] = useState<any[]>([]);

    // Popup xác nhận xoá văn bản
    const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
        isOpen: boolean;
        docId: string | null;
    }>({ isOpen: false, docId: null });

    // State cho tab PROCESSING
    const [tasks, setTasks] = useState<any[]>([]);
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [adminEditTask, setAdminEditTask] = useState<any | null>(null);
    const [selectedTaskToUpdate, setSelectedTaskToUpdate] = useState<any | null>(null);
    const [deleteTaskModal, setDeleteTaskModal] = useState({ isOpen: false, taskId: '' });
    const [vanBanCache, setVanBanCache] = useState<Record<string, any>>({});
    const [previewDocData, setPreviewDocData] = useState<any | null>(null);
    const [loadingPreview, setLoadingPreview] = useState(false);

    // Kéo thả độ rộng cột
    const [colWidths, setColWidths] = useState({
        status: 90,
        type: 110,
        symbol: 150,
        date: 110,
        agency: 200,
        summary: 280,
        pages: 70,
        size: 80,
        action: 110
    });

    const resizingCol = useRef<string | null>(null);
    const startX = useRef<number>(0);
    const startWidth = useRef<number>(0);

    const handleMouseDown = (e: React.MouseEvent, colKey: keyof typeof colWidths) => {
        resizingCol.current = colKey;
        startX.current = e.pageX;
        startWidth.current = colWidths[colKey];

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        e.stopPropagation();
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!resizingCol.current) return;
        const diff = e.pageX - startX.current;
        const colKey = resizingCol.current as keyof typeof colWidths;

        setColWidths(prev => ({
            ...prev,
            [colKey]: Math.max(60, startWidth.current + diff)
        }));
    };

    const handleMouseUp = () => {
        resizingCol.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, []);

    useEffect(() => {
        const qDocs = query(collection(db, 'vanban'), orderBy('createdAt', 'desc'));
        const unsubscribeDocs = onSnapshot(qDocs, (snapshot) => {
            const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDocs(docsData);
        });

        // Tải danh sách các văn bản đã gắn với mục Dự án/Nhóm/Gói thầu
        const unsubscribeLinks = onSnapshot(collection(db, 'vanban_node_links'), (snapshot) => {
            const linksData = snapshot.docs.map(doc => doc.data());
            setNodeLinks(linksData);
        });

        return () => {
            unsubscribeDocs();
            unsubscribeLinks();
        };
    }, []);

    const fetchTasks = async () => {
        setLoadingTasks(true);
        try {
            const q = query(collection(db, 'vanban_tasks'));
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Sort newest first
            data.sort((a: any, b: any) => {
                const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return bTime - aTime;
            });

            setTasks(data);

            // Fetch VB info for display
            const vanBanIds = [...new Set(data.map((t: any) => t.vanBanId).filter(Boolean))];
            const newCache: Record<string, any> = { ...vanBanCache };
            for (const vbId of vanBanIds) {
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
            toast.error('Lỗi khi tải danh sách văn bản xử lý.');
        } finally {
            setLoadingTasks(false);
        }
    };

    const handleOpenPreview = async (docId: string) => {
        if (!docId) return;
        setLoadingPreview(true);
        try {
            const vbDoc = await getDoc(doc(db, 'vanban', docId));
            if (vbDoc.exists()) {
                setPreviewDocData({ id: vbDoc.id, ...vbDoc.data() });
            } else {
                toast.error('Không tìm thấy tệp đính kèm.');
            }
        } catch (error) {
            console.error('Error fetching preview doc:', error);
            toast.error('Lỗi khi tải thông tin tệp.');
        } finally {
            setLoadingPreview(false);
        }
    };

    const confirmDeleteTask = async () => {
        if (!deleteTaskModal.taskId) return;
        try {
            await deleteDoc(doc(db, 'vanban_tasks', deleteTaskModal.taskId));
            toast.success('Đã xóa phân công công việc.');
            setDeleteTaskModal({ isOpen: false, taskId: '' });
            fetchTasks();
        } catch (err) {
            toast.error('Lỗi khi xóa công việc.');
        }
    };

    useEffect(() => {
        if (activeTab === 'PROCESSING') {
            fetchTasks();
        }
    }, [activeTab]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    // Danh sách ID văn bản đã được đính kèm vào node
    const sortedDocIds = useMemo(() => {
        return new Set(nodeLinks.map(link => link.vanBanId));
    }, [nodeLinks]);

    const filteredTasks = useMemo(() => {
        if (activeTab !== 'PROCESSING') return [];
        let result = tasks;

        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(task => {
                const vb = vanBanCache[task.vanBanId];
                return (
                    (task.content && task.content.toLowerCase().includes(lowerTerm)) ||
                    (task.assigneeName && task.assigneeName.toLowerCase().includes(lowerTerm)) ||
                    (task.assignerName && task.assignerName.toLowerCase().includes(lowerTerm)) ||
                    (task.collaboratorNames && task.collaboratorNames.some((name: string) => name.toLowerCase().includes(lowerTerm))) ||
                    (task.result && task.result.toLowerCase().includes(lowerTerm)) ||
                    (vb && vb.soKyHieu && vb.soKyHieu.toLowerCase().includes(lowerTerm)) ||
                    (vb && vb.trichYeu && vb.trichYeu.toLowerCase().includes(lowerTerm))
                );
            });
        }
        return result;
    }, [tasks, activeTab, searchTerm, vanBanCache]);

    const filteredDocs = useMemo(() => {
        let result = docs;

        // B1: Lọc theo Tab loại trừ
        if (activeTab === 'ALL') {
            // Tổng hợp: Hiển thị tất cả
        } else if (activeTab === 'UNSORTED') {
            result = result.filter(doc => !sortedDocIds.has(doc.id)); // Chưa sắp xếp
        } else if (activeTab === 'SORTED') {
            result = result.filter(doc => sortedDocIds.has(doc.id)); // Đã sắp xếp
        } else if (activeTab === 'PROCESSING') {
            return []; // Hanled by filteredTasks
        } else {
            result = result.filter(doc => doc.phanLoaiVanBan === activeTab); // INCOMING hoặc OUTGOING
        }

        // B2: Lọc theo Từ khóa tìm kiếm đa năng
        if (searchTerm.trim()) {
            const lowerTerm = searchTerm.toLowerCase();
            result = result.filter(doc =>
                (doc.soKyHieu && doc.soKyHieu.toLowerCase().includes(lowerTerm)) ||
                (doc.trichYeu && doc.trichYeu.toLowerCase().includes(lowerTerm)) ||
                (doc.coQuanBanHanh && doc.coQuanBanHanh.toLowerCase().includes(lowerTerm)) ||
                (doc.loaiVanBan && doc.loaiVanBan.toLowerCase().includes(lowerTerm))
            );
        }

        return result;
    }, [docs, activeTab, sortedDocIds, searchTerm]);

    // Bắt thay đổi khi Tab/Search đổi để reset về trang 1
    useEffect(() => {
        setCurrentPage(1);
    }, [activeTab, searchTerm]);

    const sortedDocs = useMemo(() => {
        if (!sortConfig) return filteredDocs;
        return [...filteredDocs].sort((a, b) => {
            const valA = a[sortConfig.key] || '';
            const valB = b[sortConfig.key] || '';
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredDocs, sortConfig]);

    const totalPages = Math.ceil(sortedDocs.length / pageSize);
    const paginatedDocs = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sortedDocs.slice(start, start + pageSize);
    }, [sortedDocs, currentPage]);

    const handleDeleteClick = (id: string) => {
        setConfirmDeleteModal({ isOpen: true, docId: id });
    };

    const confirmDelete = async () => {
        if (!confirmDeleteModal.docId) return;
        try {
            await deleteDoc(doc(db, 'vanban', confirmDeleteModal.docId));
            setConfirmDeleteModal({ isOpen: false, docId: null });
        } catch (error) {
            console.error("Lỗi khi xóa tài liệu: ", error);
            toast.error("Không thể xóa văn bản này. Vui lòng thử lại sau.");
        }
    };

    const exportToExcel = () => {
        const dataToExport = sortedDocs.map((d, index) => ({
            'STT': index + 1,
            'Loại văn bản': d.loaiVanBan || '',
            'Số ký hiệu': d.soKyHieu || '',
            'Ngày ban hành': d.ngayBanHanh ? isoToVN(d.ngayBanHanh) : '',
            'Cơ quan ban hành': d.coQuanBanHanh || '',
            'Trích yếu nội dung': d.trichYeu || '',
            'Số trang': d.soTrang || '',
            'Dung lượng': formatBytes(d.fileSize),
            'Trạng thái': d.trangThaiDuLieu === 'REVIEWING' ? 'Chưa sắp xếp' : 'Đã chuẩn hóa'
        }));

        const ws = utils.json_to_sheet(dataToExport);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, 'Danh sach Van ban');

        const fileName = `Danh_sach_Van_ban_${format(new Date(), 'ddMMyyyy_HHmm')}.xlsx`;
        writeFile(wb, fileName);
    };

    const renderSortIcon = (key: string) => {
        if (sortConfig?.key !== key) return <ArrowUpDown className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
        return sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-primary-600" /> : <ArrowDown className="w-3 h-3 text-primary-600" />;
    };

    return (
        <div className="p-4 md:p-6 lg:p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-6">
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900">Quản lý Văn bản</h1>
                    <p className="text-sm text-gray-500 mt-1 hidden md:block">Hệ thống xử lý văn bản AI OCR tự động + Đính kèm</p>
                </div>
                <div className="flex items-center gap-2 md:gap-3">
                    {activeTab === 'PROCESSING' && user?.role !== 'viewer' && (
                        <button
                            onClick={() => setIsAssignModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-sm shadow-blue-200"
                            title="Giao việc mới"
                        >
                            <Send className="w-4 h-4" />
                            <span className="hidden md:inline">Giao việc mới</span>
                        </button>
                    )}
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 md:px-4 py-2 rounded-lg hover:bg-emerald-100 transition font-bold shadow-sm"
                        title="Xuất Excel"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden md:inline">Xuất Excel</span>
                    </button>
                    {activeTab !== 'PROCESSING' && user?.role !== 'viewer' && (
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 text-white px-3 md:px-4 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-sm shadow-blue-200"
                            title="Tải Văn bản mới"
                        >
                            <Upload className="w-5 h-5" />
                            <span className="hidden md:inline">Tải Văn bản mới</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs Controller & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit border border-gray-200 shadow-sm overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'ALL' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Tổng hợp
                        <span className="ml-2 inline-flex items-center justify-center bg-gray-200 text-gray-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('INCOMING')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'INCOMING' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Văn bản đến
                        <span className="ml-2 inline-flex items-center justify-center bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => d.phanLoaiVanBan === 'INCOMING').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('OUTGOING')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'OUTGOING' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Văn bản đi
                        <span className="ml-2 inline-flex items-center justify-center bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => d.phanLoaiVanBan === 'OUTGOING').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('UNSORTED')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'UNSORTED' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Chưa sắp xếp
                        <span className="ml-2 inline-flex items-center justify-center bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => !sortedDocIds.has(d.id)).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('SORTED')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'SORTED' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Đã sắp xếp
                        <span className="ml-2 inline-flex items-center justify-center bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => sortedDocIds.has(d.id)).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('PROCESSING')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'PROCESSING' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'} `}
                    >
                        Xử lý Văn bản
                        <span className="ml-2 inline-flex items-center justify-center bg-blue-100 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {tasks.length}
                        </span>
                    </button>
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-72">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-400" />
                    </div>
                    <input
                        type="text"
                        placeholder="Tìm theo số KH, trích yếu, cơ quan..."
                        className="pl-9 pr-4 py-2 w-full border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow outline-none"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            <UploadDocumentModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
            />

            {activeTab === 'PROCESSING' ? (
                <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-3">
                    {loadingTasks ? (
                        <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
                    ) : filteredTasks.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Không tìm thấy phân công xử lý phù hợp.</div>
                    ) : (
                        filteredTasks.map((task) => {
                            const vb = vanBanCache[task.vanBanId];
                            return (
                                <div key={task.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${task.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : task.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {task.status === 'COMPLETED' ? 'Hoàn thành' : task.status === 'PROCESSING' ? 'Đang làm' : 'Chưa nhận'}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => setSelectedTaskToUpdate(task)} className="p-1.5 text-blue-600 bg-blue-50 rounded-lg" title="Cập nhật"><CheckCircle2 className="w-4 h-4" /></button>
                                            {user?.role === 'admin' && (
                                                <>
                                                    <button onClick={() => setAdminEditTask(task)} className="p-1.5 text-amber-600 bg-amber-50 rounded-lg" title="Sửa"><Settings className="w-4 h-4" /></button>
                                                    <button onClick={() => setDeleteTaskModal({ isOpen: true, taskId: task.id })} className="p-1.5 text-red-600 bg-red-50 rounded-lg" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    {vb && (
                                        <Link to={"/documents/" + vb.id} className="text-blue-600 font-bold text-sm hover:underline line-clamp-2 block">
                                            {vb.soKyHieu} {vb.ngayBanHanh && `ngày ${isoToVN(vb.ngayBanHanh)}`}
                                        </Link>
                                    )}
                                    <p className="text-sm text-gray-700 line-clamp-2">{task.content}</p>
                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium"><UserCheck className="w-3 h-3" />{task.assigneeName || 'N/A'}</span>
                                        {task.collaboratorNames?.map((name: string, i: number) => (
                                            <span key={i} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{name}</span>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-gray-400">
                                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Giao bởi: {task.assignerName || '--'}</span>
                                        <span>{task.createdAt ? isoToVN(task.createdAt.split('T')[0]) : '--'}</span>
                                    </div>
                                    {(task.result || task.bcDocId) && (
                                        <div className="pt-2 border-t border-gray-100 space-y-1">
                                            {task.result && <p className="text-xs text-gray-600 line-clamp-2">{task.result}</p>}
                                            {task.bcDocId && <TaskFileLinks docId={task.bcDocId} onOpenPreview={setPreviewDocData} />}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto table-responsive">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
                            <th className="p-4 border-r border-gray-200 w-16 text-center">STT</th>
                            <th className="p-4 border-r border-gray-200 w-64">Văn bản</th>
                            <th className="p-4 border-r border-gray-200 w-64">Nội dung xử lý</th>
                            <th className="p-4 border-r border-gray-200 w-32">Xử lý chính</th>
                            <th className="p-4 border-r border-gray-200 w-40">Phối hợp</th>
                            <th className="p-4 border-r border-gray-200 w-64">Kết quả xử lý</th>
                            <th className="p-4 border-r border-gray-200 w-28 text-center">Trạng thái</th>
                            <th className="p-4 text-center w-28">Thao tác</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-sm">
                        {loadingTasks ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500 bg-gray-50/50">
                                    Đang tải dữ liệu...
                                </td>
                            </tr>
                        ) : filteredTasks.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500 bg-gray-50/50">
                                    Không tìm thấy phân công xử lý phù hợp.
                                </td>
                            </tr>
                        ) : (
                            filteredTasks.map((task, index) => {
                                const vb = vanBanCache[task.vanBanId];
                                return (
                                    <tr key={task.id} className="even:bg-slate-50 odd:bg-white hover:bg-blue-50/50 transition-colors">
                                        <td className="p-4 text-center border-r border-gray-100 font-medium text-gray-400">{index + 1}</td>
                                        <td className="p-4 border-r border-gray-100">
                                            {vb ? (
                                                <div className="flex flex-col gap-1">
                                                    <Link to={"/documents/" + vb.id} className="text-blue-600 font-bold hover:underline line-clamp-1">
                                                        {vb.soKyHieu} {vb.ngayBanHanh && `ngày ${isoToVN(vb.ngayBanHanh)} `}
                                                    </Link>
                                                    <span className="text-xs text-gray-500 line-clamp-1">{vb.trichYeu}</span>
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic">Đang tải văn bản...</span>
                                            )}
                                        </td>
                                        <td className="p-4 border-r border-gray-100">
                                            <div className="text-[11px] font-bold text-gray-500 mb-1">
                                                Giao bởi: <span className="text-gray-900">{task.assignerName || '--'}</span>
                                            </div>
                                            <div className="text-gray-800 leading-relaxed line-clamp-2" title={task.content}>
                                                {task.content}
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400 italic">
                                                <Clock className="w-3 h-3" />
                                                {task.createdAt ? isoToVN(task.createdAt.split('T')[0]) : '--'}
                                            </div>
                                        </td>
                                        <td className="p-4 border-r border-gray-100">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
                                                    <UserCheck className="w-4 h-4" />
                                                </div>
                                                <span className="font-medium text-gray-700">{task.assigneeName || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 border-r border-gray-100">
                                            {task.collaboratorNames && task.collaboratorNames.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {task.collaboratorNames.map((name: string, i: number) => (
                                                        <span key={i} className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-[10px] font-medium border border-gray-100">
                                                            {name}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-gray-400 italic font-normal text-xs">Không có</span>
                                            )}
                                        </td>
                                        <td className="p-4 border-r border-gray-100">
                                            <div className="space-y-1.5 font-medium">
                                                {task.result && (
                                                    <p className="text-gray-700 line-clamp-2" title={task.result}>
                                                        {task.result}
                                                    </p>
                                                )}
                                                {task.bcDocId && (
                                                    <TaskFileLinks
                                                        docId={task.bcDocId}
                                                        onOpenPreview={setPreviewDocData}
                                                    />
                                                )}
                                                {!task.result && !task.bcDocId && (
                                                    <span className="text-xs text-gray-300 italic font-normal">Chưa có kết quả</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 border-r border-gray-100 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${task.status === 'COMPLETED' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                task.status === 'PROCESSING' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                                                    'bg-amber-100 text-amber-700 border border-amber-200'
                                                } `}>
                                                {task.status === 'COMPLETED' ? 'Hoàn thành' : task.status === 'PROCESSING' ? 'Đang làm' : 'Chưa nhận'}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => setSelectedTaskToUpdate(task)}
                                                    className="p-2 text-gray-400 hover:text-blue-600 bg-white hover:bg-blue-50 border border-gray-100 rounded-lg shadow-sm transition-colors"
                                                    title="Cập nhật trạng thái"
                                                >
                                                    <CheckCircle2 className="w-4 h-4" />
                                                </button>
                                                {user?.role === 'admin' && (
                                                    <>
                                                        <button
                                                            onClick={() => setAdminEditTask(task)}
                                                            className="p-2 text-gray-400 hover:text-amber-600 bg-white hover:bg-amber-50 border border-gray-100 rounded-lg shadow-sm transition-colors"
                                                            title="Sửa công việc"
                                                        >
                                                            <Settings className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTaskModal({ isOpen: true, taskId: task.id })}
                                                            className="p-2 text-gray-400 hover:text-red-600 bg-white hover:bg-red-50 border border-gray-100 rounded-lg shadow-sm transition-colors"
                                                            title="Xóa công việc"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
                </div>
                </>
            
            ) : (
                <>
                {/* Mobile Card View for Documents */}
                <div className="md:hidden space-y-3">
                    {paginatedDocs.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">Không tìm thấy văn bản phù hợp...</div>
                    ) : (
                        paginatedDocs.map((doc) => (
                            <div key={doc.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        {doc.trangThaiDuLieu === 'REVIEWING' ? (
                                            <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 border border-amber-200 flex items-center justify-center flex-shrink-0"><Clock className="w-4 h-4" /></div>
                                        ) : (
                                            <div className="w-7 h-7 rounded-full bg-green-100 text-green-600 border border-green-200 flex items-center justify-center flex-shrink-0"><FileCheck className="w-4 h-4" /></div>
                                        )}
                                        <div className="flex items-center gap-1.5">
                                            {doc.phanLoaiVanBan === 'OUTGOING' && <ArrowUp className={`w-3.5 h-3.5 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-green-600'}`} />}
                                            {doc.phanLoaiVanBan === 'INCOMING' && <ArrowDown className={`w-3.5 h-3.5 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-blue-600'}`} />}
                                            <span className="text-xs text-gray-500 font-medium">{doc.loaiVanBan || '--'}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Link to={"/documents/" + doc.id} className="p-1.5 text-blue-600 bg-blue-50 rounded-lg" title="Xem"><Eye className="w-4 h-4" /></Link>
                                        {user?.role === 'admin' && (
                                            <button onClick={() => handleDeleteClick(doc.id)} className="p-1.5 text-red-600 bg-red-50 rounded-lg" title="Xóa"><Trash2 className="w-4 h-4" /></button>
                                        )}
                                    </div>
                                </div>
                                <div className="font-bold text-gray-900 text-sm">{doc.soKyHieu || '--'}</div>
                                <p className="text-xs text-gray-600 line-clamp-2">{doc.trichYeu || '--'}</p>
                                <div className="flex items-center justify-between text-[10px] text-gray-400">
                                    <span>{isoToVN(doc.ngayBanHanh)}</span>
                                    <span>{doc.coQuanBanHanh || '--'}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto table-responsive">
                <table className="w-full text-left border-collapse table-auto min-w-[900px]">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">

                            <th style={{ width: colWidths.type }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('loaiVanBan')} className="flex items-center gap-2 cursor-pointer hover:text-gray-700 w-fit select-none">
                                    Loại Văn bản
                                    {renderSortIcon('loaiVanBan')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'type')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.symbol }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('soKyHieu')} className="flex items-center gap-2 cursor-pointer hover:text-gray-700 w-fit select-none">
                                    Số Ký hiệu
                                    {renderSortIcon('soKyHieu')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'symbol')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.date }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('ngayBanHanh')} className="flex items-center gap-2 cursor-pointer hover:text-gray-700 w-fit select-none">
                                    Ngày ban hành
                                    {renderSortIcon('ngayBanHanh')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'date')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.agency }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('coQuanBanHanh')} className="flex items-center gap-2 cursor-pointer hover:text-gray-700 w-fit select-none">
                                    Cơ quan ban hành
                                    {renderSortIcon('coQuanBanHanh')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'agency')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.summary }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('trichYeu')} className="flex items-center gap-2 cursor-pointer hover:text-gray-700 w-fit select-none">
                                    Trích yếu nội dung
                                    {renderSortIcon('trichYeu')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'summary')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.pages }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('soTrang')} className="flex justify-center items-center gap-2 cursor-pointer hover:text-gray-700 mx-auto w-fit select-none">
                                    Số trang
                                    {renderSortIcon('soTrang')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'pages')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.size }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('fileSize')} className="flex justify-center items-center gap-2 cursor-pointer hover:text-gray-700 mx-auto w-fit select-none">
                                    Dung lượng
                                    {renderSortIcon('fileSize')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'size')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                            <th style={{ width: colWidths.action }} className="p-4 text-center relative group">
                                <div className="flex justify-center items-center w-full select-none">
                                    Hành động
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'action')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-sm">
                        {paginatedDocs.map((doc) => (
                            <tr key={doc.id} className="even:bg-slate-50 odd:bg-white hover:bg-blue-50/50 transition-colors">

                                <td className="p-4 text-gray-800 leading-relaxed break-words border-r border-gray-100" title={doc.loaiVanBan}>
                                    <div className="flex items-center gap-2">
                                        {doc.phanLoaiVanBan === 'OUTGOING' && <ArrowUp className={`w - 4 h - 4 flex - shrink - 0 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-green-600'} `} />}
                                        {doc.phanLoaiVanBan === 'INCOMING' && <ArrowDown className={`w - 4 h - 4 flex - shrink - 0 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-blue-600'} `} />}
                                        <span>{doc.loaiVanBan || '--'}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-gray-800 leading-relaxed break-words border-r border-gray-100" title={doc.soKyHieu}>{doc.soKyHieu || '--'}</td>
                                <td className="p-4 text-gray-600 font-medium whitespace-nowrap border-r border-gray-100">{isoToVN(doc.ngayBanHanh)}</td>
                                <td className="p-4 text-gray-800 leading-relaxed break-words border-r border-gray-100" title={doc.coQuanBanHanh}>{doc.coQuanBanHanh || '--'}</td>
                                <td className="p-4 text-gray-800 leading-relaxed break-words border-r border-gray-100" title={doc.trichYeu}>{doc.trichYeu || '--'}</td>
                                <td className="p-4 text-gray-500 text-center font-medium border-r border-gray-100">{doc.soTrang || '--'}</td>
                                <td className="p-4 text-gray-500 text-center font-medium border-r border-gray-100">{formatBytes(doc.fileSize)}</td>
                                <td className="p-4 text-center">
                                    <div className="flex items-center justify-center gap-1">
                                        <Link
                                            to={"/documents/" + doc.id}
                                            className="text-gray-400 hover:text-blue-600 bg-white hover:bg-blue-50 p-2 rounded-lg transition-colors border border-gray-100 shadow-sm"
                                            title="Xem chi tiết"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Link>
                                        {user?.role === 'admin' && (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        const isDeep = window.confirm("CẢNH BÁO: Bạn có muốn XÓA VĨNH VIỄN văn bản này và TẤT CẢ TỆP trên Drive (Bao gồm cả tệp đính kèm và link cấu trúc)?\n\nHành động này không thể hoàn tác!");
                                                        if (isDeep) {
                                                            const toastId = toast.loading('Đang dọn dẹp Drive và xóa vĩnh viễn...');
                                                            const permanentlyDeleteDocument = httpsCallable(appFunctions, 'permanentlyDeleteDocument');
                                                            permanentlyDeleteDocument({ docId: doc.id, sourceCollection: 'vanban' })
                                                                .then(() => toast.success('Đã dọn dẹp và xóa sạch dữ liệu.', { id: toastId }))
                                                                .catch(err => toast.error('Lỗi khi xóa: ' + err.message, { id: toastId }));
                                                        }
                                                    }}
                                                    className="text-gray-400 hover:text-red-700 bg-white hover:bg-red-50 p-2 rounded-lg transition-colors border border-gray-100 shadow-sm"
                                                    title="Xóa vĩnh viễn & Dọn dẹp Drive"
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteClick(doc.id)}
                                                    className="text-gray-400 hover:text-red-600 bg-white hover:bg-red-50 p-2 rounded-lg transition-colors border border-gray-100 shadow-sm"
                                                    title="Bỏ vào thùng rác"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {paginatedDocs.length === 0 && (
                            <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-500 bg-gray-50/50">
                                    Không tìm thấy văn bản phù hợp...
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
                </>
            )
            }

            {/* Phân trang (Pagination) */}
            {
                activeTab !== 'PROCESSING' && totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
                        <div className="text-sm text-gray-500">
                            Hiển thị <span className="font-medium text-gray-900">{paginatedDocs.length}</span> trên tổng số <span className="font-medium text-gray-900">{filteredDocs.length}</span> văn bản
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 mr-1" /> Trước
                            </button>
                            <span className="text-sm text-gray-600 px-2 font-medium">Trang {currentPage} / {totalPages}</span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                Tiếp <ChevronRight className="w-4 h-4 ml-1" />
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Modal Quản lý Công việc */}
            <AssignTaskFromManagerModal
                isOpen={isAssignModalOpen}
                onClose={() => setIsAssignModalOpen(false)}
                onSuccess={() => {
                    setIsAssignModalOpen(false);
                    fetchTasks();
                }}
            />

            {
                adminEditTask && (
                    <AdminEditTaskModal
                        isOpen={!!adminEditTask}
                        onClose={() => setAdminEditTask(null)}
                        task={adminEditTask}
                        onSuccess={fetchTasks}
                    />
                )
            }

            {
                selectedTaskToUpdate && (
                    <UpdateTaskModal
                        isOpen={!!selectedTaskToUpdate}
                        onClose={() => setSelectedTaskToUpdate(null)}
                        task={selectedTaskToUpdate}
                        onSuccess={fetchTasks}
                    />
                )
            }

            {/* Modal xoá công việc */}
            <GenericConfirmModal
                isOpen={deleteTaskModal.isOpen}
                onClose={() => setDeleteTaskModal({ isOpen: false, taskId: '' })}
                onConfirm={confirmDeleteTask}
                title="Xác nhận xóa công việc"
                message="Bạn có chắc chắn muốn xóa công việc này không? Hành động này không thể hoàn tác."
                confirmText="Xác nhận xóa"
            />

            {/* Document Preview Modal */}
            {previewDocData && (
                <DocumentPreviewModal
                    doc={previewDocData}
                    onClose={() => setPreviewDocData(null)}
                />
            )}

            {/* Loading overlay for preview */}
            {loadingPreview && (
                <div className="fixed inset-0 z-[70] bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
                    <div className="bg-white p-4 rounded-xl shadow-xl flex items-center gap-3">
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span className="text-sm font-medium text-gray-700">Đang tải văn bản...</span>
                    </div>
                </div>
            )}
        </div >
    );
};
