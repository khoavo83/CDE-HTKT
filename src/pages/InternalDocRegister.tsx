import React, { useState, useEffect, useMemo } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { canEditOrDeleteData } from '../utils/authUtils';
import { useInternalDocStore, InternalDoc } from '../store/useInternalDocStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useUserStore } from '../store/useUserStore';
import {
    Plus, Search, FileText, Edit2, Trash2,
    User, ChevronDown, ChevronRight, BookOpen, Save, X, Download
} from 'lucide-react';
import { format } from 'date-fns';
import { utils, writeFile } from 'xlsx';
import { toast } from 'react-hot-toast';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { moveToTrash } from '../utils/trashUtils';

export const InternalDocRegister = () => {
    const { user } = useAuthStore();
    const { docs, isLoading, fetchDocs, addDoc, updateDoc } = useInternalDocStore();
    const { categories, fetchCategories } = useCategoryStore();
    const { users, fetchUsers } = useUserStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isReceiverOpen, setIsReceiverOpen] = useState(false);
    const [selectedYear] = useState(new Date().getFullYear());

    const [expandedMonths, setExpandedMonths] = useState<Record<number, boolean>>({});
    const [editingDoc, setEditingDoc] = useState<InternalDoc | null>(null);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [docToDelete, setDocToDelete] = useState<InternalDoc | null>(null);

    useEffect(() => {
        const unsubDocs = fetchDocs(selectedYear);
        const unsubCats = fetchCategories();
        fetchUsers();

        return () => {
            unsubDocs();
            unsubCats();
        };
    }, [selectedYear, fetchDocs, fetchCategories, fetchUsers]);

    const receivers = useMemo(() =>
        categories.filter(c => c.type === 'phongBan' && c.isActive),
        [categories]);

    // Form State
    const [formData, setFormData] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        content: '',
        suffix: 'HTKT',
        issueDocSuffix: 'CV',
        responseDocSuffix: '',
        receiverIds: [] as string[],
        leaderName: 'PGĐ Bình',
        isSaved: true,
        result: '',
        notes: '',
        specialist: ''
    });

    const toggleReceiver = (id: string) => {
        setFormData(prev => ({
            ...prev,
            receiverIds: prev.receiverIds.includes(id)
                ? prev.receiverIds.filter(r => r !== id)
                : [...prev.receiverIds, id]
        }));
    };

    // Cập nhật form khi vào chế độ edit
    useEffect(() => {
        if (editingDoc) {
            let currentReceiverIds: string[] = [];
            if (editingDoc.receiver) {
                const receiverNames = editingDoc.receiver.split(/,\s*/);
                currentReceiverIds = receivers
                    .filter(r => receiverNames.includes(r.value))
                    .map(r => r.id);
            }

            setFormData({
                date: editingDoc.date,
                content: editingDoc.content,
                suffix: editingDoc.docNumber.split('/')[1] || 'HTKT',
                issueDocSuffix: editingDoc.issueDocSuffix,
                responseDocSuffix: editingDoc.responseDocSuffix,
                receiverIds: currentReceiverIds,
                leaderName: editingDoc.leader,
                isSaved: editingDoc.isSaved,
                result: editingDoc.result,
                notes: editingDoc.notes,
                specialist: editingDoc.specialist || user?.hoTen || user?.displayName || user?.email || ''
            });
        } else {
            setFormData({
                date: format(new Date(), 'yyyy-MM-dd'),
                content: '',
                suffix: 'HTKT',
                issueDocSuffix: 'CV',
                responseDocSuffix: '',
                receiverIds: [],
                leaderName: 'PGĐ Bình',
                isSaved: true,
                result: '',
                notes: '',
                specialist: user?.hoTen || user?.displayName || user?.email || ''
            });
        }
    }, [editingDoc, receivers, user]);

    // Phân nhóm theo tháng
    const groupedDocs = useMemo(() => {
        const filtered = docs.filter(d =>
            d.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.docNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            d.specialist.toLowerCase().includes(searchTerm.toLowerCase())
        );

        const groups: Record<number, InternalDoc[]> = {};
        filtered.forEach(d => {
            const m = new Date(d.date).getMonth() + 1;
            if (!groups[m]) groups[m] = [];
            groups[m].push(d);
        });

        return groups;
    }, [docs, searchTerm]);

    // Luôn mở mặc định tất cả các tháng đang có dữ liệu khi danh sách docs thay đổi
    useEffect(() => {
        if (docs.length > 0) {
            const allMonths = Object.keys(groupedDocs).reduce((acc, month) => {
                acc[Number(month)] = true;
                return acc;
            }, {} as Record<number, boolean>);

            setExpandedMonths(prev => ({
                ...prev,
                ...allMonths
            }));
        }
    }, [groupedDocs, docs.length]);

    const nextSTT = useMemo(() => {
        const year = new Date(formData.date).getFullYear();
        const yearDocs = docs.filter(d => d.year === year);
        return yearDocs.length > 0 ? Math.max(...yearDocs.map(d => d.stt)) + 1 : 1;
    }, [docs, formData.date]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formData.receiverIds.length === 0) {
            toast.error('Vui lòng chọn ít nhất 1 Nơi nhận!');
            return;
        }

        try {
            const docData = {
                date: formData.date,
                content: formData.content,
                issueDocSuffix: formData.issueDocSuffix,
                responseDocSuffix: formData.responseDocSuffix,
                receiver: receivers.filter(r => formData.receiverIds.includes(r.id)).map(r => r.value).join(', '),
                specialist: formData.specialist || user?.hoTen || user?.displayName || user?.email || '',
                leader: formData.leaderName,
                isSaved: formData.isSaved,
                result: formData.result,
                notes: formData.notes,
                docNumber: `[AUTO]/${formData.suffix}`,
                createdBy: user?.uid || ''
            };

            if (editingDoc) {
                await updateDoc(editingDoc.id, docData);
                toast.success('Cập nhật văn bản thành công!');
            } else {
                await addDoc(docData);
                toast.success('Đăng ký văn bản thành công!');
            }

            setIsModalOpen(false);
            setEditingDoc(null);
            // Reset form
            setFormData(prev => ({ ...prev, content: '', responseDocSuffix: '', result: '', notes: '', receiverIds: [], specialist: user?.hoTen || user?.displayName || user?.email || '' }));
        } catch (error) {
            console.error('Lỗi khi lưu công văn:', error);
            toast.error('Lỗi khi lưu công văn: ' + (error as Error).message);
        }
    };

    const openDeleteModal = (doc: InternalDoc) => {
        setDocToDelete(doc);
        setDeleteModalOpen(true);
    };

    const confirmDelete = async (reason: string) => {
        if (!docToDelete) return;
        try {
            await moveToTrash(
                'internal_documents',
                docToDelete.id,
                docToDelete,
                user?.email || user?.uid || 'unknown',
                reason,
                `Văn bản Nội bộ STT ${docToDelete.stt}`
            );
            toast.success('Đã chuyển văn bản vào thùng rác');
        } catch (error) {
            toast.error('Lỗi khi xóa văn bản: ' + (error as Error).message);
        }
    };

    const openEdit = (doc: InternalDoc) => {
        setEditingDoc(doc);
        setIsModalOpen(true);
    };

    const openAdd = () => {
        setEditingDoc(null);
        setIsModalOpen(true);
    };

    const getShortName = (fullName: string) => {
        if (!fullName) return '';
        const userFound = users.find(u =>
            u.hoTen === fullName ||
            u.displayName === fullName ||
            u.email === fullName
        );
        return userFound?.displayName || fullName;
    };

    const handleExportExcel = () => {
        const dataToExport = docs.map(doc => ({
            'STT': doc.stt,
            'Số văn bản': `${doc.stt}/${doc.docNumber.split('/')[1] || 'HTKT'}`,
            'Ngày phát hành': format(new Date(doc.date), 'dd/MM/yyyy'),
            'Nội dung trích yếu': doc.content,
            'CV phát hành': doc.issueDocSuffix,
            'CV phản hồi': doc.responseDocSuffix || '',
            'Nơi nhận': doc.receiver,
            'Chuyên viên': getShortName(doc.specialist),
            'Lãnh đạo ký': doc.leader,
            'Bản lưu': doc.isSaved ? 'Đã lưu' : 'Chưa lưu',
            'Kết quả': doc.result || '',
            'Ghi chú': doc.notes || ''
        }));

        const worksheet = utils.json_to_sheet(dataToExport);
        const workbook = utils.book_new();
        utils.book_append_sheet(workbook, worksheet, "SoCongVanNoiBo");


        // Điều chỉnh độ rộng cột
        const maxWidths = [
            { wch: 5 },  // STT
            { wch: 15 }, // Số văn bản
            { wch: 15 }, // Ngày
            { wch: 50 }, // Nội dung
            { wch: 12 }, // CV phát hành
            { wch: 12 }, // CV phản hồi
            { wch: 20 }, // Nơi nhận
            { wch: 20 }, // Chuyên viên
            { wch: 15 }, // Lãnh đạo
            { wch: 10 }, // Bản lưu
            { wch: 20 }, // Kết quả
            { wch: 25 }  // Ghi chú
        ];
        worksheet['!cols'] = maxWidths;

        writeFile(workbook, `So_Cong_Van_Noi_Bo_${selectedYear}.xlsx`);
    };

    const toggleMonth = (m: number) => {
        setExpandedMonths(prev => ({ ...prev, [m]: !prev[m] }));
    };

    return (
        <div className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <BookOpen className="w-8 h-8 text-primary-600" />
                        Sổ Công văn Nội bộ
                    </h1>
                    <p className="text-gray-500 text-sm">Quản lý cấp số và theo dõi hồ sơ phát hành</p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm nội dung, số hiệu..."
                            className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent w-64 text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition shadow-sm font-medium mr-2"
                    >
                        <Download className="w-4 h-4" />
                        Xuất Excel
                    </button>
                    <button
                        onClick={openAdd}
                        className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition shadow-sm font-medium"
                    >
                        <Plus className="w-4 h-4" />
                        Tạo mới & Lấy số
                    </button>
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 border-r border-gray-200 w-12 text-center">STT</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-32">Số văn bản</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-28">Ngày</th>
                                <th className="px-4 py-3 border-r border-gray-200 min-w-[300px]">Nội dung</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-24 text-center leading-tight">CV phát hành</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-24 text-center leading-tight">CV phản hồi</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-32">Nơi nhận</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-32">Chuyên viên</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-32">Lãnh đạo</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-16 text-center">Bản lưu</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-32">Kết quả</th>
                                <th className="px-4 py-3 border-r border-gray-200 w-40">Ghi chú</th>
                                <th className="px-4 py-3 w-20 text-center">Tác vụ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Object.entries(groupedDocs).sort(([a], [b]) => Number(b) - Number(a)).map(([month, monthDocs]) => (
                                <React.Fragment key={month}>
                                    <tr
                                        className="bg-primary-50/50 cursor-pointer hover:bg-primary-100/50 transition-colors"
                                        onClick={() => toggleMonth(Number(month))}
                                    >
                                        <td colSpan={13} className="px-4 py-2 font-bold text-primary-700 border-b border-gray-200">
                                            <div className="flex items-center gap-2">
                                                {expandedMonths[Number(month)] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                THÁNG {month.padStart(2, '0')}
                                                <span className="text-xs font-normal text-gray-500 ml-2">({monthDocs.length} văn bản)</span>
                                            </div>
                                        </td>
                                    </tr>
                                    {expandedMonths[Number(month)] && monthDocs.map((doc) => (
                                        <tr key={doc.id} className="hover:bg-gray-50 transition-colors border-b border-gray-100 group">
                                            <td className="px-4 py-3 border-r border-gray-200 text-center text-gray-500">{doc.stt}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 font-medium text-blue-700 text-center">
                                                {doc.stt}/{doc.docNumber.split('/')[1] || 'HTKT'}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-600 whitespace-nowrap">
                                                {format(new Date(doc.date), 'dd/MM/yyyy')}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-800 leading-relaxed font-normal">
                                                {doc.content}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-center text-blue-600 font-bold">{doc.issueDocSuffix}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-center text-rose-600 font-medium">{doc.responseDocSuffix || '--'}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-700">{doc.receiver}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-700">{getShortName(doc.specialist)}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-700 font-medium">{doc.leader}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-center">
                                                {doc.isSaved && <div className="w-2 h-2 rounded-full bg-emerald-500 mx-auto" />}
                                            </td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-600">{doc.result || '--'}</td>
                                            <td className="px-4 py-3 border-r border-gray-200 text-gray-500 italic text-sm">{doc.notes || '--'}</td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-2">
                                                    {canEditOrDeleteData(user, doc.createdBy) && (
                                                        <>
                                                            <button onClick={() => openEdit(doc)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors" title="Chỉnh sửa">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                            <button onClick={() => openDeleteModal(doc)} className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition-colors" title="Xóa">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>

                {isLoading && (
                    <div className="p-12 text-center text-gray-400">
                        <div className="animate-spin w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full mx-auto mb-2" />
                        Đang lấy dữ liệu sổ công văn...
                    </div>
                )}

                {!isLoading && docs.length === 0 && (
                    <div className="p-12 text-center text-gray-400">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Chưa có công văn nào được đăng ký trong năm {selectedYear}</p>
                    </div>
                )}
            </div>

            {/* Modal Tạo mới */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden border border-gray-200 animate-in zoom-in duration-200">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-primary-50/30 sticky top-0 z-10 backdrop-blur-md">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">{editingDoc ? 'Chỉnh sửa Văn bản' : 'Đăng ký Số văn bản mới'}</h2>
                                <div className="flex items-center gap-2 mt-1">
                                    <p className="text-xs text-gray-500">
                                        {editingDoc ? `Đang sửa STT ${editingDoc.stt}` : 'Hệ thống tự động cấp số và gán chuyên viên phụ trách'}
                                    </p>
                                    {!editingDoc && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                                            Số dự kiến: {nextSTT}/{formData.suffix}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => { setIsModalOpen(false); setEditingDoc(null); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Ngày phát hành</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all text-sm"
                                        value={formData.date}
                                        onChange={e => setFormData({ ...formData, date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Ký hiệu HTKT</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all text-sm font-medium"
                                        value={formData.suffix}
                                        onChange={e => setFormData({ ...formData, suffix: e.target.value })}
                                        placeholder="Mặc định: HTKT"
                                    />
                                </div>
                            </div>

                            <div className="bg-primary-50/40 p-5 rounded-2xl border border-primary-100/50">
                                <div className="flex items-center gap-3 mb-4">
                                    <FileText className="w-5 h-5 text-primary-600" />
                                    <span className="font-bold text-gray-800">Thông tin Văn bản</span>
                                </div>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm uppercase tracking-wider font-bold text-primary-700 mb-1.5 ml-1">Nội dung trích yếu</label>
                                        <textarea
                                            required
                                            rows={4}
                                            className="w-full px-4 py-3 bg-white border border-primary-200 rounded-xl focus:ring-4 focus:ring-primary-100 transition-all text-sm leading-relaxed"
                                            placeholder="Nhập nội dung ngắn gọn của văn bản..."
                                            value={formData.content}
                                            onChange={e => setFormData({ ...formData, content: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-600 mb-1.5">Nơi nhận</label>
                                            <div className="relative">
                                                <div
                                                    className={`w-full px-4 py-2.5 bg-white border ${formData.receiverIds.length === 0 ? 'border-red-300' : 'border-gray-200'} rounded-xl cursor-pointer flex justify-between items-center focus-within:ring-2 focus-within:ring-primary-500`}
                                                    onClick={() => setIsReceiverOpen(!isReceiverOpen)}
                                                >
                                                    <span className="text-sm truncate mr-2" style={{ maxWidth: 'calc(100% - 20px)' }}>
                                                        {formData.receiverIds.length > 0
                                                            ? receivers.filter(r => formData.receiverIds.includes(r.id)).map(r => r.value).join(', ')
                                                            : '-- Chọn đơn vị --'}
                                                    </span>
                                                    <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                                </div>

                                                {isReceiverOpen && (
                                                    <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 flex flex-col">
                                                        <div className="sticky top-0 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100 z-10 flex justify-between items-center">
                                                            <span>Chọn nhiều đơn vị</span>
                                                            <button type="button" onClick={() => setIsReceiverOpen(false)} className="text-gray-400 hover:text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-full p-0.5 transition-colors">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <div className="overflow-auto max-h-40">
                                                            {receivers.map(r => (
                                                                <label key={r.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                                                        checked={formData.receiverIds.includes(r.id)}
                                                                        onChange={() => toggleReceiver(r.id)}
                                                                    />
                                                                    <span className="text-sm text-gray-700 font-medium">{r.value}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-bold text-gray-600 mb-1.5">Lãnh đạo ký</label>
                                            <select
                                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-sm font-medium"
                                                value={formData.leaderName}
                                                onChange={e => setFormData({ ...formData, leaderName: e.target.value })}
                                            >
                                                <option value="PGĐ Bình">PGĐ Bình</option>
                                                <option value="PTB-GĐ Huyền">PTB-GĐ Huyền</option>
                                                <option value="Giám đốc">Giám đốc</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2 italic">CV phản hồi (nếu có)</label>
                                    <input
                                        type="text"
                                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:bg-white transition-all text-sm"
                                        placeholder="VD: 19/VP..."
                                        value={formData.responseDocSuffix}
                                        onChange={e => setFormData({ ...formData, responseDocSuffix: e.target.value })}
                                    />
                                </div>
                                <div className="flex items-end pb-3">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            className="w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 transition-all pointer-events-auto"
                                            checked={formData.isSaved}
                                            onChange={e => setFormData({ ...formData, isSaved: e.target.checked })}
                                        />
                                        <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Đã lưu bản cứng</span>
                                    </label>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                                        <User className="w-5 h-5 text-gray-500" />
                                    </div>
                                    <div>
                                        {user?.role === 'admin' ? (
                                            <select
                                                value={formData.specialist}
                                                onChange={(e) => setFormData({ ...formData, specialist: e.target.value })}
                                                className="text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-primary-500"
                                            >
                                                <option value="">-- Chọn chuyên viên --</option>
                                                {users.map((u: any) => {
                                                    const name = u.hoTen || u.displayName || u.email;
                                                    return (
                                                        <option key={u.id} value={name}>{name}</option>
                                                    );
                                                })}
                                            </select>
                                        ) : (
                                            <p className="text-sm font-bold text-gray-700">{formData.specialist || user?.hoTen || user?.displayName || user?.email}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="px-6 py-2.5 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors font-medium text-gray-600"
                                    >
                                        Hủy
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-8 py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition shadow-lg shadow-primary-200 font-bold flex items-center gap-2"
                                    >
                                        <Save className="w-4 h-4" />
                                        {editingDoc ? 'Cập nhật' : 'Cấp số & Lưu'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                itemName={`Văn bản STT ${docToDelete?.stt}`}
            />
        </div>
    );
};
