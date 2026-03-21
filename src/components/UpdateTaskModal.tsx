import React, { useState, useEffect } from 'react';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { format } from 'date-fns';
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
    const [isUploadingReport, setIsUploadingReport] = useState(false);

    useEffect(() => {
        if (isOpen && task) {
            setStatus(initialStatus || task.status || 'PENDING');
            setResult(task.result || '');
            setChecklist(task.checklist || []);
            setReportFile(null);
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

        if (status === 'COMPLETED' && !result.trim() && !reportFile) {
            toast.error("Vui lòng nhập kết quả xử lý hoặc upload file báo cáo.");
            return;
        }

        setIsSubmitting(true);
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            const progress = calculateProgress(checklist);
            
            const updates: any = { 
                status, 
                result: result.trim(),
                checklist,
                progress: status === 'COMPLETED' ? 100 : progress
            };

            if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
                updates.completedAt = new Date().toISOString();
            }

            // Xử lý upload reportFile thẳng lên Drive nếu có (cho "Công việc khác")
            if (status === 'COMPLETED' && reportFile) {
                setIsUploadingReport(true);
                const base64Data = await fileToBase64(reportFile);
                const uploadFn = httpsCallable<{ fileName: string, mimeType: string, base64Data: string }, any>(appFunctions, 'uploadFileToDriveBase64');
                
                const safeOriginalName = reportFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
                const standardizedAttachName = `${format(new Date(), 'yyyyMMdd_HHmmss')}_TaskResult_${safeOriginalName}`;

                const uploaded = await uploadFn({
                    fileName: standardizedAttachName,
                    mimeType: reportFile.type,
                    base64Data: base64Data
                });

                if (!uploaded.data || !uploaded.data.file) {
                    throw new Error('Upload báo cáo thất bại');
                }

                updates.resultFiles = arrayUnion({
                    id: crypto.randomUUID(),
                    fileName: standardizedAttachName,
                    originalName: reportFile.name,
                    fileSize: reportFile.size,
                    mimeType: reportFile.type,
                    driveFileId: uploaded.data.file.id,
                    webViewLink: uploaded.data.file.webViewLink,
                    uploadedAt: new Date().toISOString()
                });
                setIsUploadingReport(false);
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
            setIsUploadingReport(false);
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
                        Báo cáo Tiến độ Xử lý
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={isSubmitting || isUploadingReport}
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 min-h-0">
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
                                                disabled={isSubmitting || isUploadingReport}
                                                required={status === 'COMPLETED'}
                                            />
                                        </div>

                                        {/* Upload report file section */}
                                        <div className="border-t border-dashed pt-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <Upload className="w-4 h-4 text-indigo-600" />
                                                <span className="text-sm font-semibold text-gray-700">Báo cáo Hoàn thành (tùy chọn)</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-3">
                                                Đính kèm file kết quả (PDF/Ảnh) nếu có. File sẽ được lưu cùng với báo cáo này.
                                            </p>

                                            <div className="space-y-3">
                                                <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative group">
                                                    <input
                                                        type="file"
                                                        accept=".pdf,image/*"
                                                        onChange={(e) => setReportFile(e.target.files?.[0] || null)}
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        disabled={isSubmitting || isUploadingReport}
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
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </form>
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        disabled={isSubmitting || isUploadingReport}
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        form="taskForm"
                        disabled={isSubmitting || isUploadingReport}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {(isSubmitting || isUploadingReport) ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                        {isUploadingReport ? "Đang tải file..." : "Lưu Cập Nhật"}
                    </button>
                </div>
            </div>
        </div>
    );
};
