import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, appFunctions } from '../firebase/config';
import { useUserStore } from '../store/useUserStore';
import { useAuthStore } from '../store/useAuthStore';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import {
    Loader2, X, Settings, Calendar, User, FileText, Users, MessageSquare,
    Upload, Sparkles, CheckCircle, AlertCircle, CheckSquare, Plus, Trash2
} from 'lucide-react';
import toast from 'react-hot-toast';

interface ChecklistItem {
    id: string;
    text: string;
    isCompleted: boolean;
}

interface AdminEditTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    onSuccess: () => void;
}

// Convert File to Base64
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });

export const AdminEditTaskModal: React.FC<AdminEditTaskModalProps> = ({ isOpen, onClose, task, onSuccess }) => {
    const { users, fetchUsers } = useUserStore();
    const { user } = useAuthStore();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Form fields
    const [createdAt, setCreatedAt] = useState('');
    const [assignerId, setAssignerId] = useState('');
    const [content, setContent] = useState('');
    const [assigneeId, setAssigneeId] = useState('');
    const [collaboratorIds, setCollaboratorIds] = useState<string[]>([]);
    const [result, setResult] = useState('');
    const [status, setStatus] = useState('');

    // Checklist
    const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
    const [newChecklistItem, setNewChecklistItem] = useState('');

    // Report upload
    const [reportFile, setReportFile] = useState<File | null>(null);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [ocrStatus, setOcrStatus] = useState('');
    const [showReview, setShowReview] = useState(false);
    const [ocrData, setOcrData] = useState<any>(null);
    const [docId, setDocId] = useState<string>('');

    // completedAt
    const [completedAt, setCompletedAt] = useState('');

    useEffect(() => {
        if (isOpen && task) {
            // Parse existing createdAt to datetime-local format
            if (task.createdAt) {
                const d = new Date(task.createdAt);
                const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString().slice(0, 16);
                setCreatedAt(local);
            }
            if (task.completedAt) {
                const d = new Date(task.completedAt);
                const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
                    .toISOString().slice(0, 16);
                setCompletedAt(local);
            } else {
                setCompletedAt('');
            }
            setAssignerId(task.assignerId || '');
            setContent(task.content || '');
            setAssigneeId(task.assigneeId || '');
            setCollaboratorIds(task.collaboratorIds || []);
            setResult(task.result || '');
            setStatus(task.status || 'PENDING');
            setChecklist(task.checklist || []);
            setReportFile(null);
            setShowReview(false);
            setDocId(task.bcDocId || '');
            setOcrData(null);
            setNewChecklistItem('');
            fetchUsers();
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
    };

    const handleToggleChecklist = (id: string) => {
        setChecklist(checklist.map(item =>
            item.id === id ? { ...item, isCompleted: !item.isCompleted } : item
        ));
    };

    const handleDeleteChecklist = (id: string) => {
        setChecklist(checklist.filter(item => item.id !== id));
    };

    const calculateProgress = (currentChecklist: ChecklistItem[]) => {
        if (!currentChecklist || currentChecklist.length === 0) {
            return status === 'COMPLETED' ? 100 : (status === 'PROCESSING' ? 50 : 0);
        }
        const completedCount = currentChecklist.filter(item => item.isCompleted).length;
        return Math.round((completedCount / currentChecklist.length) * 100);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            const progress = calculateProgress(checklist);
            const updates: any = {};

            // Update createdAt
            if (createdAt) {
                updates.createdAt = new Date(createdAt).toISOString();
            }

            // Update content
            if (content !== task.content) {
                updates.content = content;
            }

            // Update result
            if (result !== task.result) {
                updates.result = result;
            }

            // Update status
            if (status !== task.status) {
                updates.status = status;
            }

            // Update completedAt
            if (status === 'COMPLETED' && completedAt) {
                updates.completedAt = new Date(completedAt).toISOString();
            } else if (status === 'COMPLETED' && !task.completedAt) {
                updates.completedAt = new Date().toISOString();
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

            // Update checklist & progress
            updates.checklist = checklist;
            updates.progress = status === 'COMPLETED' ? 100 : progress;

            // Update bcDocId if new file was uploaded
            if (docId && docId !== task.bcDocId) {
                updates.bcDocId = docId;
            }

            if (Object.keys(updates).length === 0) {
                toast('Không có thay đổi nào.', { icon: 'ℹ️' });
                onClose();
                return;
            }

            await updateDoc(taskRef, updates);

            // If we have OCR data and a new docId, also update that VB record
            if (ocrData && docId && docId !== task.bcDocId) {
                await updateDoc(doc(db, 'vanban', docId), {
                    ...ocrData,
                    trangThaiDuLieu: 'COMPLETED'
                });
            }

            // Log activity
            if (user) {
                await logVanBanActivity({
                    vanBanId: task.vanBanId,
                    action: 'TASK_UPDATE',
                    details: `Admin chỉnh sửa phân công. ${Object.keys(updates).join(', ')}`,
                    userId: user.uid,
                    userName: user.hoTen || user.displayName || user.email || 'Admin'
                });
            }

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

    // Handle final save after OCR review
    const handleFinalSave = async () => {
        setIsSubmitting(true);
        try {
            // 1. Update VB data with reviewed OCR info
            await updateDoc(doc(db, 'vanban', docId), {
                ...ocrData,
                trangThaiDuLieu: 'COMPLETED'
            });

            // 2. Save and go back to main form
            setShowReview(false);
            toast.success('Đã xử lý OCR thành công! Nhấn "Lưu thay đổi" để hoàn tất.');
        } catch (error: any) {
            console.error('Loi luu OCR:', error);
            toast.error('Không thể lưu thông tin OCR. Vui lòng thử lại.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const progressValue = calculateProgress(checklist);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-amber-600" />
                        {showReview ? 'Kiểm tra & Xác nhận thông tin AI' : 'Chỉnh sửa phân công (Admin)'}
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
                                    <p className="opacity-90">Vui lòng kiểm tra lại các thông tin dưới đây và chỉnh sửa nếu cần.</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Số / Ký hiệu</label>
                                    <input type="text" value={ocrData?.soKyHieu || ''} onChange={(e) => setOcrData({ ...ocrData, soKyHieu: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ngày ban hành</label>
                                    <input type="date" value={ocrData?.ngayBanHanh || ''} onChange={(e) => setOcrData({ ...ocrData, ngayBanHanh: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cơ quan ban hành</label>
                                    <input type="text" value={ocrData?.coQuanBanHanh || ''} onChange={(e) => setOcrData({ ...ocrData, coQuanBanHanh: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Loại văn bản</label>
                                    <input type="text" value={ocrData?.loaiVanBan || ''} onChange={(e) => setOcrData({ ...ocrData, loaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trích yếu nội dung</label>
                                    <textarea rows={3} value={ocrData?.trichYeu || ''} onChange={(e) => setOcrData({ ...ocrData, trichYeu: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium resize-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Người ký</label>
                                    <input type="text" value={ocrData?.nguoiKy || ''} onChange={(e) => setOcrData({ ...ocrData, nguoiKy: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Luồng Văn bản</label>
                                    <select value={ocrData?.phanLoaiVanBan || 'OUTGOING'} onChange={(e) => setOcrData({ ...ocrData, phanLoaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium bg-white">
                                        <option value="OUTGOING">Văn bản đi</option>
                                        <option value="INCOMING">Văn bản đến</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ===== MAIN EDIT FORM ===== */
                        <form id="adminEditForm" onSubmit={handleSubmit} className="space-y-5">
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

                            {/* Thời gian hoàn thành — chỉ hiện khi status = COMPLETED */}
                            {status === 'COMPLETED' && (
                                <div>
                                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                                        <CheckCircle className="w-4 h-4 text-green-500" />
                                        Thời gian hoàn thành
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={completedAt}
                                        onChange={(e) => setCompletedAt(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none transition-shadow text-sm"
                                    />
                                </div>
                            )}

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

                            {/* Checklist công việc */}
                            <div className="bg-white border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                        <CheckSquare className="w-4 h-4 text-indigo-500" />
                                        Checklist ({checklist.filter(i => i.isCompleted).length}/{checklist.length})
                                    </h4>
                                    <span className="text-xs font-bold text-indigo-600">{progressValue}%</span>
                                </div>

                                <div className="w-full bg-gray-200 rounded-full h-2 mb-3">
                                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500" style={{ width: `${progressValue}%` }}></div>
                                </div>

                                <div className="space-y-2 mb-3 max-h-32 overflow-y-auto">
                                    {checklist.length === 0 ? (
                                        <p className="text-xs text-gray-400 italic text-center py-2">Chưa có mục checklist nào.</p>
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

                                <div className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={newChecklistItem}
                                        onChange={(e) => setNewChecklistItem(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddChecklistItem())}
                                        placeholder="Thêm mục checklist..."
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

                            {/* Upload báo cáo hoàn thành */}
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
                                        <span className="font-medium">Đã có file báo cáo đính kèm (ID: {docId.slice(0, 8)}...)</span>
                                        <button
                                            type="button"
                                            onClick={() => { setDocId(''); setOcrData(null); }}
                                            className="ml-auto text-xs text-red-500 hover:text-red-700 underline"
                                        >
                                            Xóa / Upload lại
                                        </button>
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
                        </form>
                    )}
                </div>

                {/* Footer Buttons */}
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
                                <><CheckCircle className="w-5 h-5" /> Xác nhận OCR</>
                            )}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            form="adminEditForm"
                            disabled={isSubmitting || isOcrProcessing}
                            className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 font-medium"
                        >
                            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
                            Lưu thay đổi
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
