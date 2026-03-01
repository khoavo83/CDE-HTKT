import React, { useEffect, useState, useRef, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Link } from 'react-router-dom';
import { Clock, FileCheck, Eye, Trash2, ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight, Upload, Download } from 'lucide-react';
import { UploadDocumentModal } from '../components/UploadDocumentModal';
import { isoToVN, formatBytes } from '../utils/formatVN';
import { useAuthStore } from '../store/useAuthStore';
import { utils, writeFile } from 'xlsx';
import { format } from 'date-fns';

export const Documents = () => {
    const { user } = useAuthStore();
    const [docs, setDocs] = useState<any[]>([]);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [activeTab, setActiveTab] = useState<'ALL' | 'INCOMING' | 'OUTGOING' | 'UNSORTED' | 'SORTED'>('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [nodeLinks, setNodeLinks] = useState<any[]>([]);

    // Popup xác nhận xoá
    const [confirmDeleteModal, setConfirmDeleteModal] = useState<{
        isOpen: boolean;
        docId: string | null;
    }>({ isOpen: false, docId: null });

    // Kéo thả độ rộng cột
    const [colWidths, setColWidths] = useState({
        status: 120,
        type: 140,
        symbol: 180,
        date: 140,
        agency: 300,
        summary: 400,
        pages: 100,
        size: 100,
        action: 140
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

    const filteredDocs = useMemo(() => {
        let result = docs;

        // B1: Lọc theo Tab loại trừ
        if (activeTab === 'ALL') {
            // Tổng hợp: Hiển thị tất cả
        } else if (activeTab === 'UNSORTED') {
            result = result.filter(doc => !sortedDocIds.has(doc.id)); // Chưa sắp xếp
        } else if (activeTab === 'SORTED') {
            result = result.filter(doc => sortedDocIds.has(doc.id)); // Đã sắp xếp
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
            alert("Không thể xóa văn bản này. Vui lòng thử lại sau.");
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
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Văn bản</h1>
                    <p className="text-sm text-gray-500 mt-1">Hệ thống xử lý văn bản AI OCR tự động + Đính kèm</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={exportToExcel}
                        className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg hover:bg-emerald-100 transition font-bold shadow-sm"
                    >
                        <Download className="w-4 h-4" />
                        Xuất Excel
                    </button>
                    {user?.role !== 'viewer' && (
                        <button
                            onClick={() => setIsUploadModalOpen(true)}
                            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-sm shadow-blue-200"
                        >
                            <Upload className="w-5 h-5" />
                            Tải Văn bản mới
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs Controller & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg w-fit border border-gray-200 shadow-sm overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveTab('ALL')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'ALL' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Tổng hợp
                        <span className="ml-2 inline-flex items-center justify-center bg-gray-200 text-gray-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('INCOMING')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'INCOMING' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Văn bản đến
                        <span className="ml-2 inline-flex items-center justify-center bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => d.phanLoaiVanBan === 'INCOMING').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('OUTGOING')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'OUTGOING' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Văn bản đi
                        <span className="ml-2 inline-flex items-center justify-center bg-orange-100 text-orange-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => d.phanLoaiVanBan === 'OUTGOING').length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('UNSORTED')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'UNSORTED' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Chưa sắp xếp
                        <span className="ml-2 inline-flex items-center justify-center bg-red-100 text-red-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => !sortedDocIds.has(d.id)).length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('SORTED')}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition-colors shrink-0 ${activeTab === 'SORTED' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                    >
                        Đã sắp xếp
                        <span className="ml-2 inline-flex items-center justify-center bg-teal-100 text-teal-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                            {docs.filter(d => sortedDocIds.has(d.id)).length}
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-300">
                <table className="w-full text-left border-collapse table-fixed min-w-max">
                    <thead>
                        <tr className="bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-500">
                            <th style={{ width: colWidths.status }} className="p-4 relative group border-r border-gray-200">
                                <div onClick={() => handleSort('trangThaiDuLieu')} className="flex justify-center items-center gap-2 cursor-pointer hover:text-gray-700 mx-auto w-fit select-none">
                                    Trạng thái
                                    {renderSortIcon('trangThaiDuLieu')}
                                </div>
                                <div onMouseDown={(e) => handleMouseDown(e, 'status')} className="absolute right-0 top-0 h-full w-2 cursor-col-resize hover:bg-primary-400 z-10 transition-colors" />
                            </th>
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
                                <td className="p-4 text-center border-r border-gray-100">
                                    {doc.trangThaiDuLieu === 'REVIEWING' ? (
                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 border border-amber-200 shadow-sm" title="Chờ phân loại và sắp xếp">
                                            <Clock className="w-5 h-5" />
                                        </div>
                                    ) : (
                                        <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 border border-green-200 shadow-sm" title="Đã được chuấn hóa và có link Drive">
                                            <FileCheck className="w-5 h-5" />
                                        </div>
                                    )}
                                </td>
                                <td className="p-4 text-gray-800 leading-relaxed break-words border-r border-gray-100" title={doc.loaiVanBan}>
                                    <div className="flex items-center gap-2">
                                        {doc.phanLoaiVanBan === 'OUTGOING' && <ArrowUp className={`w-4 h-4 flex-shrink-0 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-green-600'}`} />}
                                        {doc.phanLoaiVanBan === 'INCOMING' && <ArrowDown className={`w-4 h-4 flex-shrink-0 ${doc.mucDoKhan === 'KHAN' ? 'text-red-600' : 'text-blue-600'}`} />}
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
                                            to={`/documents/${doc.id}`}
                                            className="text-gray-400 hover:text-blue-600 bg-white hover:bg-blue-50 p-2 rounded-lg transition-colors border border-gray-100 shadow-sm"
                                            title="Xem chi tiết"
                                        >
                                            <Eye className="w-4 h-4" />
                                        </Link>
                                        {user?.role === 'admin' && (
                                            <button
                                                onClick={() => handleDeleteClick(doc.id)}
                                                className="text-gray-400 hover:text-red-600 bg-white hover:bg-red-50 p-2 rounded-lg transition-colors border border-gray-100 shadow-sm"
                                                title="Xóa văn bản"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
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

                {/* Phân trang (Pagination) */}
                {totalPages > 1 && (
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
                )}
            </div>

            {/* Popup Xác nhận Xóa */}
            {confirmDeleteModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center fade-in">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                        <div className="px-6 py-4 border-b bg-red-50 border-red-100">
                            <h3 className="text-lg font-bold text-red-800 flex items-center gap-2">
                                <Trash2 className="w-5 h-5" />
                                Xác nhận xóa tài liệu
                            </h3>
                        </div>
                        <div className="px-6 py-6 text-gray-600">
                            Bạn có thật sự muốn xóa vĩnh viễn văn bản này khỏi hệ thống? Tuyệt đối không thể hoàn tác nếu đã xóa!
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmDeleteModal({ isOpen: false, docId: null })}
                                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-6 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors font-medium"
                            >
                                Chắc chắn Xóa
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <UploadDocumentModal
                isOpen={isUploadModalOpen}
                onClose={() => setIsUploadModalOpen(false)}
            />
        </div>
    );
};
