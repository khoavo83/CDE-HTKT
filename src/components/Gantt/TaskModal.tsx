import React, { useState, useEffect } from 'react';
import { GanttTask } from './types';
import { X, Save, Trash2, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { DocAttachmentSelectorModal, VanBanItem } from '../DocAttachmentSelectorModal';
import { ganttService } from '../../services/ganttService';
import { isoToVN } from '../../utils/formatVN';

interface TaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: Partial<GanttTask>) => void;
    onDelete?: (taskId: string) => void;
    task?: GanttTask | null; // If null, we're creating a new top-level task
    parentId?: string | null; // Passing parentId explicitly if creating a subtask
}

export const TaskModal: React.FC<TaskModalProps> = ({
    isOpen,
    onClose,
    onSave,
    onDelete,
    task,
    parentId = null
}) => {
    const [name, setName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [actualStartDate, setActualStartDate] = useState('');
    const [actualEndDate, setActualEndDate] = useState('');
    
    // Linked documents state
    const [linkedDocs, setLinkedDocs] = useState<VanBanItem[]>([]);
    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (task) {
                setName(task.name);
                setStartDate(task.plannedStartDate.toISOString().split('T')[0]);
                setEndDate(task.plannedEndDate.toISOString().split('T')[0]);
                setActualStartDate(task.actualStartDate ? task.actualStartDate.toISOString().split('T')[0] : '');
                setActualEndDate(task.actualEndDate ? task.actualEndDate.toISOString().split('T')[0] : '');
                
                // Fetch linked documents if they exist
                if (task.linkedDocumentIds && task.linkedDocumentIds.length > 0) {
                    setIsLoadingDocs(true);
                    ganttService.getDocumentsByIds(task.linkedDocumentIds)
                        .then(docs => setLinkedDocs(docs))
                        .catch(err => console.error("Failed to load documents", err))
                        .finally(() => setIsLoadingDocs(false));
                } else {
                    setLinkedDocs([]);
                }
            } else {
                setName('');
                setStartDate(new Date().toISOString().split('T')[0]);
                const nextWeek = new Date();
                nextWeek.setDate(nextWeek.getDate() + 7);
                setEndDate(nextWeek.toISOString().split('T')[0]);
                setActualStartDate('');
                setActualEndDate('');
                setLinkedDocs([]);
            }
        }
    }, [isOpen, task]);

    // Auto-calculate logic when linked docs change
    useEffect(() => {
        if (linkedDocs.length > 0) {
            // Find min and max dates from linked docs
            const dates = linkedDocs
                .map(doc => doc.ngayBanHanh ? new Date(doc.ngayBanHanh).getTime() : 0)
                .filter(time => time > 0)
                .sort((a, b) => a - b);
            
            if (dates.length > 0) {
                const earliest = new Date(dates[0]);
                const latest = new Date(dates[dates.length - 1]);
                
                // Update actual dates automatically as a suggestion
                // (Only update if they were empty or user just added a doc, in a real scenario we might prompt, but autofill is friendly)
                setActualStartDate(earliest.toISOString().split('T')[0]);
                setActualEndDate(latest.toISOString().split('T')[0]);
            }
        }
    }, [linkedDocs]);

    if (!isOpen) return null;

    const handleAttachDoc = (docId: string, docData: VanBanItem) => {
        if (!linkedDocs.find(d => d.id === docId)) {
            setLinkedDocs([...linkedDocs, docData]);
        }
        setIsSelectorOpen(false);
    };

    const handleRemoveDoc = (docId: string) => {
        setLinkedDocs(linkedDocs.filter(d => d.id !== docId));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        onSave({
            id: task?.id, // undefined means it's a new task
            name,
            parentId: task ? task.parentId : parentId,
            plannedStartDate: new Date(startDate),
            plannedEndDate: new Date(endDate),
            actualStartDate: actualStartDate ? new Date(actualStartDate) : undefined,
            actualEndDate: actualEndDate ? new Date(actualEndDate) : undefined,
            linkedDocumentIds: linkedDocs.map(d => d.id),
        });
    };

    return (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/80">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {task ? 'Chi tiết công việc / Hạng mục' : 'Thêm công việc / Hạng mục mới'}
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200">
                    <form id="task-form" onSubmit={handleSubmit} className="space-y-6">
                        {/* Basic Info */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 border-b pb-1">1. Thông tin cơ bản</h3>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên công việc <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                                    placeholder="Nhập tên công việc..."
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Ngày bắt đầu dự kiến <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Ngày kết thúc dự kiến <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        min={startDate}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Actual Progress & Linked Docs */}
                        <div className="space-y-4 pt-2">
                            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 border-b pb-1">2. Thực tế triển khai</h3>
                            
                            {/* Linked Documents Area */}
                            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                                <div className="flex justify-between items-center mb-3">
                                    <label className="block text-sm font-medium text-gray-700">
                                        Văn bản liên kết
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setIsSelectorOpen(true)}
                                        className="text-xs flex items-center gap-1 bg-white border border-gray-300 px-3 py-1.5 rounded-md hover:bg-gray-50 text-indigo-600 font-medium shadow-sm transition-colors"
                                    >
                                        <LinkIcon className="w-3.5 h-3.5" /> Thêm văn bản
                                    </button>
                                </div>
                                
                                {isLoadingDocs ? (
                                    <div className="text-sm text-gray-500 text-center py-4 flex items-center justify-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-500"></div>
                                        Đang tải văn bản...
                                    </div>
                                ) : linkedDocs.length > 0 ? (
                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-300">
                                        {linkedDocs.map(doc => (
                                            <div key={doc.id} className="flex justify-between items-start bg-white border border-gray-200 p-2.5 rounded-md shadow-sm group">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-1.5 py-0.5 text-[9px] uppercase font-bold rounded ${doc.phanLoaiVanBan === 'INCOMING' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>
                                                            {doc.phanLoaiVanBan === 'INCOMING' ? 'Đến' : 'Đi'}
                                                        </span>
                                                        <span className="font-semibold text-sm text-gray-900 truncate">
                                                            {doc.soKyHieu || '(Chưa có SH)'}
                                                        </span>
                                                        <span className="text-xs text-gray-500">
                                                            • {doc.ngayBanHanh ? isoToVN(doc.ngayBanHanh) : 'Không có ngày'}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-600 line-clamp-1" title={doc.trichYeu}>
                                                        {doc.trichYeu}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDoc(doc.id)}
                                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
                                                    title="Gỡ văn bản"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-sm text-gray-500 text-center py-4 italic border border-dashed border-gray-300 rounded-md bg-white">
                                        Chưa có văn bản nào được liên kết. Liên kết văn bản để tự động tính ngày thực tế.
                                    </div>
                                )}
                            </div>

                            {/* Actual Dates */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                                        <span>Bắt đầu thực tế mới nhất</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={actualStartDate}
                                        onChange={(e) => setActualStartDate(e.target.value)}
                                        className="w-full px-3 py-2 border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                                    />
                                    <p className="text-[11px] text-gray-500 mt-1 italic">
                                        Tự động gợi ý từ Ngày Ban Hành nhỏ nhất
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1 flex justify-between">
                                        <span>Kết thúc thực tế mới nhất</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={actualEndDate}
                                        onChange={(e) => setActualEndDate(e.target.value)}
                                        min={actualStartDate}
                                        className="w-full px-3 py-2 border border-emerald-200 bg-emerald-50/30 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                                    />
                                     <p className="text-[11px] text-gray-500 mt-1 italic">
                                        Tự động gợi ý từ Ngày Ban Hành lớn nhất
                                    </p>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="flex justify-between items-center p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                    {task && onDelete ? (
                        <button
                            type="button"
                            onClick={() => onDelete(task.id)}
                            className="flex items-center gap-2 px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors font-medium text-sm border border-red-100"
                        >
                            <Trash2 className="w-4 h-4" />
                            Xóa hạng mục
                        </button>
                    ) : (
                        <div></div> // Spacer to keep save button on the right
                    )}
                    
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm shadow-sm"
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            form="task-form"
                            className="flex items-center gap-2 px-6 py-2 text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors font-medium text-sm shadow-sm"
                        >
                            <Save className="w-4 h-4" />
                            {task ? 'Lưu thay đổi' : 'Xác nhận tạo'}
                        </button>
                    </div>
                </div>
            </div>

            <DocAttachmentSelectorModal
                isOpen={isSelectorOpen}
                onClose={() => setIsSelectorOpen(false)}
                onAttach={handleAttachDoc}
            />
        </div>
    );
};
