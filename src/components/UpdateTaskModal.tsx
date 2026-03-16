import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, appFunctions } from '../firebase/config';
import {
    Loader2, X, CheckSquare, Clock, Save, Upload, FileText,
    Sparkles, CheckCircle, AlertCircle, Plus, Trash2
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import toast from 'react-hot-toast';

interface ChecklistItem {
    id: string;
    text: string;
    isCompleted: boolean;
}

interface UpdateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    onSuccess: () => void;
    initialStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED';
}

// Convert File to Base64
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });

export const UpdateTaskModal: React.FC<UpdateTaskModalProps> = ({ isOpen, onClose, task, onSuccess, initialStatus }) => {
    const { user } = useAuthStore();
    const [status, setStatus] = useState(task?.status || 'PENDING');
    const [result, setResult] = useState(task?.result || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Checklist states
    const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist || []);
    const [newChecklistItem, setNewChecklistItem] = useState('');

    // Report completion states
    const [reportFile, setReportFile] = useState<File | null>(null);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [ocrStatus, setOcrStatus] = useState('');
    const [showReview, setShowReview] = useState(false);
    const [ocrData, setOcrData] = useState<any>(null);
    const [docId, setDocId] = useState<string>('');

    useEffect(() => {
        if (isOpen && task) {
            setStatus(initialStatus || task.status || 'PENDING');
            setResult(task.result || '');
            setChecklist(task.checklist || []);
            setReportFile(null);
            setShowReview(false);
            setDocId('');
            setOcrData(null);
            setNewChecklistItem('');
        }
    }, [isOpen, task]);

    if (!isOpen || !task) return null;

    // Checklist actions
    const handleAddChecklistItem = () => {
        if (!newChecklistItem.trim()) return;
        const newItem: ChecklistItem = {
            id: Date.now().toString(),
            text: newChecklistItem.trim(),
            isCompleted: false
        };
        setChecklist([...checklist, newItem]);
        setNewChecklistItem('');
        // Auto-switch to processing if we are pending and adding tasks
        if (status === 'PENDING') setStatus('PROCESSING');
    };

    const handleToggleChecklist = (id: string) => {
        setChecklist(checklist.map(item => 
            item.id === id ? { ...item, isCompleted: !item.isCompleted } : item
        ));
        if (status === 'PENDING') setStatus('PROCESSING');
    };

    const handleDeleteChecklist = (id: string) => {
        setChecklist(checklist.filter(item => item.id !== id));
    };

    // Calculate progress based on checklist
    const calculateProgress = (currentChecklist: ChecklistItem[]) => {
        if (!currentChecklist || currentChecklist.length === 0) {
            return status === 'COMPLETED' ? 100 : (status === 'PROCESSING' ? 50 : 0);
        }
        const completedCount = currentChecklist.filter(item => item.isCompleted).length;
        return Math.round((completedCount / currentChecklist.length) * 100);
    };

    // Handles normal save (without file upload)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (status === 'COMPLETED' && !result.trim() && !docId) {
            toast.error("Vui lòng nhập kết quả xử lý hoặc upload file báo cáo.");
            return;
        }

        setIsSubmitting(true);
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            const progress = calculateProgress(checklist);
            
            // Auto complete if all checklist items are done and user selects processing, suggest completion?
            // Actually, just save the status user selected.
            
            const updates: any = { 
                status, 
                result: result.trim(),
                checklist,
                progress: status === 'COMPLETED' ? 100 : progress
            };

            if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
                updates.completedAt = new Date().toISOString();
            }
            if (docId) {
                updates.bcDocId = docId;
            }

            await updateDoc(taskRef, updates);

            // Log activity
            if (user) {
                await logVanBanActivity({
                    vanBanId: task.vanBanId,
                    action: status === 'COMPLETED' ? 'TASK_COMPLETE' : 'TASK_UPDATE',
                    details: status === 'COMPLETED'
                        ? `Hoàn thành công việc. Kết quả: ${result.trim().substring(0, 100)}${result.length > 100 ? '...' : ''}`
                        : `Cập nhật tiến độ: ${status} (${progress}%). Ghi chú: ${result.trim().substring(0, 100)}${result.length > 100 ? '...' : ''}`,
                    userId: user.uid,
                    userName: user.hoTen || user.displayName || user.email || 'Người dùng'
                });
            }

            toast.success("Đã cập nhật tiến độ thành công!");
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Loi khi cap nhat task: ", error);
            toast.error("Lỗi khi cập nhật tiến độ.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle OCR processing for uploaded file
    const handleOcrProcess = async () => {
        if (!reportFile) {
            toast.error('Vui lòng chọn tệp báo cáo (PDF hoặc Ảnh)!');
            return;
        }

        setIsOcrProcessing(true);
        setOcrStatus('Đang chuẩn bị dữ liệu báo cáo...');

        try {
            const base64Data = await fileToBase64(reportFile);

            setOcrStatus('AI Gemini đang đọc văn bản và xử lý tệp...');
            const processOCR = httpsCallable(appFunctions, 'processDocumentOCR');

            const response: any = await processOCR({
                base64Data,
                mimeType: reportFile.type,
                fileNameOriginal: reportFile.name,
                totalSizeBytes: reportFile.size,
                dinhKem: [],
                nodeId: task.id
            });

            if (response.data.success) {
                setDocId(response.data.docId);
                const aiData = response.data.data;
                if (!aiData.phanLoaiVanBan) {
                    aiData.phanLoaiVanBan = 'OUTGOING';
                }
                setOcrData(aiData);
                setShowReview(true);
            } else {
                throw new Error('Xử lý OCR thất bại.');
            }
        } catch (error: any) {
            console.error('Loi bao cao hoan thanh:', error);
            const errorMessage = error?.message || '';
            if (errorMessage.includes('Invalid Credentials') || errorMessage.includes('unauthenticated')) {
                toast.error('Phiên làm việc Google đã hết hạn. Vui lòng Đăng xuất -> Đăng nhập lại.');
            } else {
                toast.error(errorMessage || 'Xử lý báo cáo thất bại. Vui lòng thử lại.');
            }
        } finally {
            setIsOcrProcessing(false);
            setOcrStatus('');
        }
    };

    // Handle final save after OCR review
    const handleFinalSave = async () => {
        setIsSubmitting(true);
        try {
            // 1. Update VB data with reviewed OCR info
            await updateDoc(doc(db, 'vanban', docId), {
                ...ocrData,
                trangThaiDuLieu: 'COMPLETED'
            });

            // 2. Update task status
            const taskRef = doc(db, 'vanban_tasks', task.id);
            await updateDoc(taskRef, {
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                result: result.trim() || ocrData.trichYeu || '',
                bcDocId: docId,
                checklist: checklist,
                progress: 100
            });

            // Log activity
            if (user) {
                await logVanBanActivity({
                    vanBanId: task.vanBanId,
                    action: 'TASK_COMPLETE',
                    details: `Hoàn thành công việc (có đính kèm báo cáo). Kết quả: ${(result.trim() || ocrData.trichYeu || '').substring(0, 100)}...`,
                    userId: user.uid,
                    userName: user.hoTen || user.displayName || user.email || 'Người dùng'
                });
            }

            toast.success('Đã báo cáo hoàn thành và lưu Văn bản đi thành công! 🎉');
            onSuccess();
            setTimeout(() => onClose(), 500);
        } catch (error: any) {
            console.error('Loi luu cuoi cung:', error);
            toast.error('Không thể lưu thông tin. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Progress bar calculations
    const progressValue = calculateProgress(checklist);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-green-600" />
                        {showReview ? 'Kiểm tra & Xác nhận thông tin AI' : 'Báo cáo Tiến độ Xử lý'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={isSubmitting || isOcrProcessing}
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 min-h-0">
                    {showReview ? (
                        /* ===== OCR REVIEW FORM ===== */
                        <div className="space-y-5">
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex items-start gap-3 text-sm text-amber-800">
                                <Sparkles className="w-5 h-5 shrink-0 text-amber-500" />
                                <div>
                                    <p className="font-bold">AI Gemini đã trích xuất dữ liệu!</p>
                                    <p className="opacity-90">Vui lòng kiểm tra lại các thông tin dưới đây từ tệp bạn vừa upload và chỉnh sửa nếu cần.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Số / Ký hiệu</label>
                                    <input
                                        type="text"
                                        value={ocrData.soKyHieu || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, soKyHieu: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                        placeholder="VD: 123/QĐ-BHTKT"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ngày ban hành</label>
                                    <input
                                        type="date"
                                        value={ocrData.ngayBanHanh || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, ngayBanHanh: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cơ quan ban hành</label>
                                    <input
                                        type="text"
                                        value={ocrData.coQuanBanHanh || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, coQuanBanHanh: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Loại văn bản</label>
                                    <input
                                        type="text"
                                        value={ocrData.loaiVanBan || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, loaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trích yếu nội dung</label>
                                    <textarea
                                        rows={3}
                                        value={ocrData.trichYeu || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, trichYeu: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium resize-none"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Người ký</label>
                                    <input
                                        type="text"
                                        value={ocrData.nguoiKy || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, nguoiKy: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Luồng Văn bản</label>
                                    <select
                                        value={ocrData.phanLoaiVanBan || 'OUTGOING'}
                                        onChange={(e) => setOcrData({ ...ocrData, phanLoaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white"
                                    >
                                        <option value="OUTGOING">Văn bản đi</option>
                                        <option value="INCOMING">Văn bản đến</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ===== ORIGINAL STATUS UPDATE FORM ===== */
                        <form id="taskForm" onSubmit={handleSubmit}>
                            <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-6 border border-blue-100">
                                <p className="text-sm font-semibold mb-1">Nội dung yêu cầu từ {task.assignerName}:</p>
                                <p className="text-sm italic">{task.content}</p>
                            </div>

                            <div className="space-y-6">
                                {/* Checklist Section */}
                                <div className="bg-white border rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                            <CheckSquare className="w-4 h-4 text-indigo-500" />
                                            Checklist công việc ({checklist.filter(i => i.isCompleted).length}/{checklist.length})
                                        </h4>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium text-gray-500">Tiến độ:</span>
                                            <span className="text-sm font-bold text-indigo-600">{progressValue}%</span>
                                        </div>
                                    </div>
                                    
                                    {/* Progress bar visual */}
                                    <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                                        <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressValue}%` }}></div>
                                    </div>

                                    <div className="space-y-2 mb-3 max-h-40 overflow-y-auto">
                                        {checklist.length === 0 ? (
                                            <p className="text-xs text-gray-400 italic text-center py-2">Chưa có đầu mục công việc nào. Thêm checklist bên dưới để theo dõi tiến độ dễ dàng hơn.</p>
                                        ) : (
                                            checklist.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between gap-2 p-2 hover:bg-gray-50 rounded-md group">
                                                    <label className="flex items-center gap-3 cursor-pointer select-none flex-1">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={item.isCompleted} 
                                                            onChange={() => handleToggleChecklist(item.id)}
                                                            className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                        <span className={`text-sm ${item.isCompleted ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                                            {item.text}
                                                        </span>
                                                    </label>
                                                    <button 
                                                        type="button" 
                                                        onClick={() => handleDeleteChecklist(item.id)}
                                                        className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="text"
                                            value={newChecklistItem}
                                            onChange={(e) => setNewChecklistItem(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                                            placeholder="Thêm mục công việc con..."
                                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none"
                                        />
                                        <button 
                                            type="button" 
                                            onClick={handleAddChecklistItem}
                                            disabled={!newChecklistItem.trim()}
                                            className="p-1.5 bg-indigo-50 text-indigo-600 rounded-md hover:bg-indigo-100 transition-colors disabled:opacity-50"
                                        >
                                            <Plus className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Trạng thái xử lý <span className="text-red-500">*</span>
                                    </label>
                                    <div className="grid grid-cols-3 gap-3">
                                        <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'PENDING' ? 'bg-gray-50 border-gray-400 ring-1 ring-gray-400' : 'hover:bg-gray-50'}`}>
                                            <input type="radio" className="sr-only" name="status" value="PENDING" checked={status === 'PENDING'} onChange={(e) => setStatus(e.target.value)} />
                                            <span className="text-xs font-medium text-gray-500">Chờ xử lý</span>
                                        </label>
                                        <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'PROCESSING' ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'hover:bg-blue-50'}`}>
                                            <input type="radio" className="sr-only" name="status" value="PROCESSING" checked={status === 'PROCESSING'} onChange={(e) => setStatus(e.target.value)} />
                                            <span className="text-xs font-medium text-blue-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Đang xử lý</span>
                                        </label>
                                        <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'COMPLETED' ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'hover:bg-green-50'}`}>
                                            <input type="radio" className="sr-only" name="status" value="COMPLETED" checked={status === 'COMPLETED'} onChange={(e) => setStatus(e.target.value)} />
                                            <span className="text-xs font-medium text-green-700">Hoàn thành</span>
                                        </label>
                                    </div>
                                </div>

                                {/* General update field */}
                                {status !== 'COMPLETED' && (
                                    <div className="animate-in slide-in-from-top-2 duration-300">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Cập nhật nội dung tiến độ (Tùy chọn)
                                        </label>
                                        <textarea
                                            className="w-full px-3 py-2 border border-blue-200 bg-blue-50/30 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow min-h-[80px] resize-y text-sm"
                                            placeholder="Bạn đang làm gì với văn bản này? Nhập thông tin để báo cáo nhanh cho quản lý..."
                                            value={result}
                                            onChange={(e) => setResult(e.target.value)}
                                            disabled={isSubmitting}
                                        />
                                    </div>
                                )}

                                {status === 'COMPLETED' && (
                                    <div className="animate-in slide-in-from-top-2 duration-300 space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Kết quả xử lý <span className="text-red-500">*</span>
                                            </label>
                                            <textarea
                                                className="w-full px-3 py-2 border border-green-300 bg-green-50/30 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow min-h-[100px] resize-y"
                                                placeholder="Ghi rõ kết quả để báo cáo lại người giao việc..."
                                                value={result}
                                                onChange={(e) => setResult(e.target.value)}
                                                disabled={isSubmitting}
                                                required={status === 'COMPLETED' && !docId}
                                            />
                                        </div>

                                        {/* Upload report file section */}
                                        <div className="border-t border-dashed pt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Upload className="w-4 h-4 text-indigo-600" />
                                                <span className="text-sm font-semibold text-gray-700">Báo cáo Hoàn thành (tùy chọn)</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                Upload file kết quả (PDF/Ảnh). AI sẽ đọc và tự động ghi vào Danh mục Văn bản đi.
                                            </p>

                                            {docId ? (
                                                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                                                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                                                    <span className="font-medium">Đã xử lý thành công! Văn bản đã được tạo (ID: {docId.slice(0, 8)}...)</span>
                                                </div>
                                            ) : (
                                                <div className="space-y-3">
                                                    <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative group">
                                                        <input
                                                            type="file"
                                                            accept=".pdf,image/*"
                                                            onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                            disabled={isOcrProcessing}
                                                        />
                                                        {reportFile ? (
                                                            <div className="space-y-1.5">
                                                                <FileText className="w-10 h-10 mx-auto text-blue-600" />
                                                                <p className="text-sm font-bold text-gray-800 truncate px-4">{reportFile.name}</p>
                                                                <p className="text-xs text-gray-500">{(reportFile.size / 1024).toFixed(1)} KB</p>
                                                            </div>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                <Upload className="w-10 h-10 mx-auto text-gray-300 group-hover:text-blue-400 transition-colors" />
                                                                <p className="text-sm text-gray-500">Chọn tệp PDF hoặc Hình Ảnh</p>
                                                                <p className="text-xs text-gray-400">(Bản scan hoặc ảnh chụp kết quả)</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {reportFile && (
                                                        <button
                                                            type="button"
                                                            onClick={handleOcrProcess}
                                                            disabled={isOcrProcessing}
                                                            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg hover:bg-indigo-700 transition font-bold shadow-md shadow-indigo-200 disabled:opacity-50"
                                                        >
                                                            {isOcrProcessing ? (
                                                                <><Loader2 className="w-4 h-4 animate-spin" /> {ocrStatus}</>
                                                            ) : (
                                                                <><Sparkles className="w-4 h-4" /> AI Đọc & Ghi Văn bản đi</>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </form>
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={isSubmitting || isOcrProcessing}
                    >
                        Hủy
                    </button>
                    {showReview ? (
                        <button
                            type="button"
                            onClick={handleFinalSave}
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-bold shadow-md shadow-green-200 disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <><Loader2 className="w-5 h-5 animate-spin" /> Đang lưu...</>
                            ) : (
                                <><CheckCircle className="w-5 h-5" /> Xác nhận & Hoàn thành</>
                            )}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            form="taskForm"
                            disabled={isSubmitting || isOcrProcessing}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Lưu Cập Nhật
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
