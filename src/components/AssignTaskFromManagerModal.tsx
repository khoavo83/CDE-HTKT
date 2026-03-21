import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, addDoc, doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db, auth, appFunctions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { useAuthStore } from '../store/useAuthStore';
import { Loader2, X, Send, Search, FileText, UserCheck, Users, Link as LinkIcon, Paperclip, Upload, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { GenericConfirmModal } from './GenericConfirmModal';
import { DocAttachmentSelectorModal } from './DocAttachmentSelectorModal';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import { format } from 'date-fns';

// Utilities
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });


interface UserItem {
    id: string;
    displayName: string;
    email: string;
    role: string;
    department?: string;
}

interface VanBanItem {
    id: string;
    soKyHieu: string;
    trichYeu: string;
    ngayBanHanh: string;
    coQuanBanHanh: string;
    loaiVanBan: string;
    dinhKem?: any[];
}

interface AssignTaskFromManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    initialAssigneeId?: string;
    isSelfAssign?: boolean;
}

export const AssignTaskFromManagerModal: React.FC<AssignTaskFromManagerModalProps> = ({
    isOpen,
    onClose,
    onSuccess,
    initialAssigneeId = '',
    isSelfAssign = false
}) => {
    const { user } = useAuthStore();
    const [users, setUsers] = useState<UserItem[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);

    // Search VanBan State
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [selectedVanBan, setSelectedVanBan] = useState<VanBanItem | null>(null);

    // Form State
    const [selectedAssigner, setSelectedAssigner] = useState('');
    const [selectedAssignee, setSelectedAssignee] = useState(initialAssigneeId);
    const [selectedCollaborators, setSelectedCollaborators] = useState<string[]>([]);
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    // Upload & OCR State for New Input File
    const [isUploadingInputMode, setIsUploadingInputMode] = useState(false);
    const [inputFile, setInputFile] = useState<File | null>(null);
    const [isProcessingInputOcr, setIsProcessingInputOcr] = useState(false);
    const [inputOcrStatus, setInputOcrStatus] = useState('');

    useEffect(() => {
        if (isOpen) {
            setSelectedAssigner('');
            setSelectedAssignee(initialAssigneeId || (isSelfAssign && user?.uid ? user.uid : ''));
            setSelectedCollaborators([]);
            setContent('');
            setSelectedVanBan(null);
            setIsUploadingInputMode(false);
            setInputFile(null);
            setIsProcessingInputOcr(false);
            setInputOcrStatus('');
        }
    }, [isOpen, initialAssigneeId, isSelfAssign, user?.uid]);

    useEffect(() => {
        if (users.length > 0 && isOpen) {
            const defaultAssignerUser = users.find(u =>
                u.email === 'hoduongbinh32@gmail.com' ||
                (u.displayName && u.displayName.toLowerCase().includes('bình'))
            );
            const defaultId = defaultAssignerUser ? defaultAssignerUser.id : (user?.uid || '');
            if (!selectedAssigner) {
                setSelectedAssigner(defaultId);
            }
        }
    }, [users, isOpen, user?.uid, selectedAssigner]);


    useEffect(() => {
        if (!isOpen) return;
        const fetchUsers = async () => {
            setLoadingUsers(true);
            try {
                const q = query(collection(db, 'users'), where('role', '!=', 'unclaimed'));
                const snap = await getDocs(q);
                const fetchedUsers: UserItem[] = [];
                snap.forEach(doc => {
                    const data = doc.data();
                    fetchedUsers.push({ id: doc.id, ...data } as UserItem);
                });
                fetchedUsers.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || ''));
                setUsers(fetchedUsers);
            } catch (error) {
                console.error('Lỗi khi fetch users:', error);
                toast.error('Không thể lấy danh sách người dùng.');
            } finally {
                setLoadingUsers(false);
            }
        };
        fetchUsers();
    }, [isOpen]);



    if (!isOpen) return null;

    const collaboratorCandidates = users.filter(u => u.id !== selectedAssignee);

    const toggleCollaborator = (userId: string) => {
        setSelectedCollaborators(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleAssigneeChange = (newAssigneeId: string) => {
        setSelectedAssignee(newAssigneeId);
        // Remove from collaborators if they are now the assignee
        setSelectedCollaborators(prev => prev.filter(id => id !== newAssigneeId));
    };

    const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
        if (e && e.preventDefault) e.preventDefault();

        if (!selectedAssignee || !content.trim()) {
            toast.error('Vui lòng chọn người phụ trách và nhập nội dung chỉ đạo.');
            return;
        }

        setShowConfirm(true);
    };

    const executeSubmit = async () => {
        const assigneeUser = users.find(u => u.id === selectedAssignee);
        const assignerUser = users.find(u => u.id === selectedAssigner);

        const firestoreUser = auth.currentUser;
        const currentUserId = assignerUser?.id || firestoreUser?.uid || user?.uid;
        const currentUserName = assignerUser?.displayName || assignerUser?.email || firestoreUser?.displayName || user?.displayName || user?.email || firestoreUser?.email || 'Người dùng ẩn danh';

        if (!assigneeUser) {
            toast.error('Lỗi dữ liệu hệ thống: Không xác định được người phụ trách.');
            return;
        }

        if (!currentUserId) {
            toast.error('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
            return;
        }

        // Build collaborators list
        const collaboratorsData = selectedCollaborators
            .map(id => {
                const u = users.find(u => u.id === id);
                return u ? { id: u.id, name: u.displayName || u.email } : null;
            })
            .filter(Boolean);

        setIsSubmitting(true);
        try {
            let finalVanBanId = selectedVanBan?.id || null;
            let inputFilesData: any[] = [];

            // Xử lý Upload đẩy thẳng lên Drive cho "Công việc khác"
            if (isUploadingInputMode && inputFile && !finalVanBanId) {
                setIsProcessingInputOcr(true);
                setInputOcrStatus('Đang upload tệp đính kèm...');

                const base64Data = await fileToBase64(inputFile);
                const uploadFn = httpsCallable<{ fileName: string, mimeType: string, base64Data: string }, any>(appFunctions, 'uploadFileToDriveBase64');
                
                const safeOriginalName = inputFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
                const standardizedAttachName = `${format(new Date(), 'yyyyMMdd_HHmmss')}_TaskInput_${safeOriginalName}`;

                const uploaded = await uploadFn({
                    fileName: standardizedAttachName,
                    mimeType: inputFile.type,
                    base64Data: base64Data
                });

                if (!uploaded.data || !uploaded.data.file) {
                    throw new Error('Upload file thất bại');
                }

                inputFilesData.push({
                    id: crypto.randomUUID(),
                    fileName: standardizedAttachName,
                    originalName: inputFile.name,
                    fileSize: inputFile.size,
                    mimeType: inputFile.type,
                    driveFileId: uploaded.data.file.id,
                    webViewLink: uploaded.data.file.webViewLink,
                    uploadedAt: new Date().toISOString()
                });

                setInputOcrStatus('');
                setIsProcessingInputOcr(false);
            }

            const taskData: any = {
                vanBanId: finalVanBanId,
                assignerId: currentUserId,
                assignerName: currentUserName,
                assigneeId: assigneeUser.id,
                assigneeName: assigneeUser.displayName || assigneeUser.email,
                content: content.trim(),
                status: 'PENDING',
                createdAt: new Date().toISOString(),
            };

            if (inputFilesData.length > 0) {
                taskData.inputFiles = inputFilesData;
            }

            if (collaboratorsData.length > 0) {
                taskData.collaborators = collaboratorsData;
            }

            await addDoc(collection(db, 'vanban_tasks'), taskData);

            toast.success('Đã giao công việc thành công!');

            // Reset states
            setContent('');
            setSelectedAssignee('');
            setSelectedCollaborators([]);
            setSelectedVanBan(null);

            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Lỗi khi addDoc:', error);
            toast.error('Đã xảy ra lỗi khi lưu vào database: ' + error.message);
        } finally {
            setIsSubmitting(false);
            setShowConfirm(false);
        }
    };


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl border border-gray-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-5 md:p-6 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl shrink-0">
                    <div>
                        <h3 className="text-xl font-bold bg-gradient-to-r from-indigo-700 to-indigo-500 bg-clip-text text-transparent">
                            {isSelfAssign ? 'Tự Giao Việc' : 'Giao Việc Mới'}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {isSelfAssign ? 'Tự giao nhiệm vụ cho bản thân' : 'Phân công công việc (có thể đính kèm văn bản đầu vào)'}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 md:p-6 overflow-y-auto custom-scrollbar flex-1 min-h-0 relative">
                    <div className="space-y-6">
                        {/* 1. Chọn Văn Bản Đầu Vào (Optional) */}
                        <div className="bg-blue-50/50 p-4 border border-blue-100 rounded-xl space-y-3">
                            <div className="flex flex-wrap items-center justify-between border-b border-blue-200 pb-2 gap-2">
                                <label className="block text-sm font-semibold text-blue-900">
                                    1. Văn bản đầu vào đính kèm (Tuỳ chọn)
                                </label>
                                {!selectedVanBan && (
                                    <div className="flex flex-wrap bg-blue-100 p-1 rounded-lg gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsUploadingInputMode(false)}
                                            className={`px-3 py-1.5 text-xs font-semibold transition-all rounded-md ${!isUploadingInputMode ? 'bg-white shadow text-blue-700' : 'text-blue-600 hover:bg-blue-200'}`}
                                        >
                                            Chọn VB có sẵn
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIsUploadingInputMode(true)}
                                            className={`px-3 py-1.5 text-xs font-semibold transition-all rounded-md ${isUploadingInputMode ? 'bg-white shadow text-blue-700' : 'text-blue-600 hover:bg-blue-200'}`}
                                        >
                                            Upload File Mới
                                        </button>
                                    </div>
                                )}
                            </div>

                            {!selectedVanBan ? (
                                <>
                                    {!isUploadingInputMode ? (
                                        <button
                                            onClick={() => setIsDocModalOpen(true)}
                                            className="w-full flex items-center justify-center gap-2 px-4 py-8 bg-white border-2 border-dashed border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 hover:border-blue-400 font-medium transition-all group"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                                                <LinkIcon className="w-5 h-5 text-blue-600" />
                                            </div>
                                            <div className="flex flex-col items-start ml-2 text-left">
                                                <span className="font-semibold text-gray-800 group-hover:text-blue-700">Đính kèm Văn bản đã lưu</span>
                                                <span className="text-xs text-gray-500 font-normal">Mở danh sách văn bản và chọn 1 tệp cần đính kèm</span>
                                            </div>
                                        </button>
                                    ) : (
                                        <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-5 text-center relative group hover:bg-blue-50 transition-colors cursor-pointer">
                                            <input
                                                type="file"
                                                accept="application/pdf,image/*"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        setInputFile(e.target.files[0]);
                                                    }
                                                }}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            />
                                            {inputFile ? (
                                                <div className="flex flex-col items-center">
                                                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                                                        <FileText className="w-5 h-5 text-blue-600" />
                                                    </div>
                                                    <p className="text-sm font-bold text-blue-700">✅ {inputFile.name}</p>
                                                    <p className="text-xs text-gray-400 mt-1">
                                                        {(inputFile.size / 1024).toFixed(1)} KB - Nhấn để thay file khác<br/>
                                                        <span className="text-indigo-600 flex items-center justify-center gap-1 mt-1 font-medium">
                                                            File này sẽ được ghim làm Tài liệu tham khảo cho công việc.
                                                        </span>
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col items-center">
                                                    <Upload className="w-8 h-8 mx-auto text-blue-400 mb-2 group-hover:text-blue-500 transition-colors" />
                                                    <p className="text-sm font-semibold text-gray-700">Chọn hoặc kéo thả file TÀI LIỆU GỐC (PDF/Ảnh) vào đây</p>
                                                    <p className="text-xs text-gray-500 mt-1 max-w-[80%]">
                                                        File tải lên sẽ được đính kèm vào <span className="font-bold text-blue-600">Nhiệm vụ này</span> làm tài liệu đầu vào để người xử lý tham khảo.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-start justify-between bg-white p-3 rounded-lg border border-blue-200 shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className="mt-0.5 w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                                <FileText className="w-4 h-4 text-blue-600" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-gray-800">
                                                    {selectedVanBan.loaiVanBan} {selectedVanBan.soKyHieu && `số ${selectedVanBan.soKyHieu}`}
                                                </div>
                                                <div className="text-xs text-gray-600 mt-1 line-clamp-2">{selectedVanBan.trichYeu}</div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setSelectedVanBan(null)}
                                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                                        >
                                            Gỡ bỏ
                                        </button>
                                    </div>

                                    {selectedVanBan.dinhKem && selectedVanBan.dinhKem.length > 0 && (
                                        <div className="pl-11 space-y-1.5">
                                            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-tight">Tệp phụ lục đính kèm ({selectedVanBan.dinhKem.length})</p>
                                            <div className="flex flex-wrap gap-2">
                                                {selectedVanBan.dinhKem.map((file: any, index: number) => (
                                                    <a
                                                        key={index}
                                                        href={file.webViewLink}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-600 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 transition-colors"
                                                    >
                                                        <Paperclip className="w-3 h-3" />
                                                        <span className="max-w-[150px] truncate">{file.fileName || file.originalName || 'Đính kèm'}</span>
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* 2. Nội dung chỉ đạo */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">
                                Nội dung công việc <span className="text-red-500">*</span>
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white outline-none transition-all resize-none"
                                placeholder="Nhập nội dung yêu cầu, chỉ đạo thực hiện..."
                            />
                        </div>

                        {/* 3. Phân công người dùng */}
                        {!isSelfAssign && (
                            <div className="space-y-6">
                                {/* Người Giao Việc */}
                                <div className="space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-teal-700">
                                        <UserCheck className="w-4 h-4" />
                                        Người giao việc <span className="text-red-500">*</span>
                                    </label>
                                    {loadingUsers ? (
                                        <div className="flex items-center gap-2 text-sm text-gray-500 p-2 border rounded-md bg-gray-50">
                                            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh sách...
                                        </div>
                                    ) : (
                                        <select
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-shadow disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed"
                                            value={selectedAssigner}
                                            onChange={(e) => setSelectedAssigner(e.target.value)}
                                            disabled={isSubmitting || (user?.role !== 'admin' && user?.role !== 'manager')}
                                            required
                                        >
                                            <option value="">-- Chọn người giao việc --</option>
                                            {users.map(u => (
                                                <option key={`assigner-${u.id}`} value={u.id}>
                                                    {u.displayName || u.email} {u.department ? `(${u.department})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                    {(!user || (user.role !== 'admin' && user.role !== 'manager')) && (
                                        <p className="text-xs text-gray-500 px-1 pt-1 italic">
                                            Chỉ Admin hoặc Ban Giám Đốc mới có quyền thay đổi người giao việc.
                                        </p>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Phụ trách chính */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-indigo-700">
                                            <UserCheck className="w-4 h-4" />
                                            Người phụ trách <span className="text-red-500">*</span>
                                        </label>
                                        {loadingUsers ? (
                                            <div className="flex items-center gap-2 px-3 py-2 text-sm text-gray-500 bg-gray-50 rounded-lg border border-gray-100 animate-pulse">
                                                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải...
                                            </div>
                                        ) : (
                                            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                                                {users.map(u => (
                                                    <label
                                                        key={`assignee-${u.id}`}
                                                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${selectedAssignee === u.id ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="assignee_manager"
                                                            value={u.id}
                                                            checked={selectedAssignee === u.id}
                                                            onChange={() => handleAssigneeChange(u.id)}
                                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className={`text-sm ${selectedAssignee === u.id ? 'font-semibold text-indigo-900' : 'font-medium text-gray-700'}`}>
                                                                {u.displayName || u.email}
                                                            </span>
                                                            {u.role && u.role !== 'user' && (
                                                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{u.role}</span>
                                                            )}
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Người phối hợp */}
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 text-sm font-semibold text-purple-700">
                                            <Users className="w-4 h-4" />
                                            Người phối hợp
                                        </label>
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-48 overflow-y-auto">
                                            {collaboratorCandidates.length === 0 ? (
                                                <div className="p-3 text-sm text-gray-500 text-center italic">
                                                    Không có người dùng nào khác
                                                </div>
                                            ) : (
                                                collaboratorCandidates.map(u => (
                                                    <label
                                                        key={`collab-${u.id}`}
                                                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${selectedCollaborators.includes(u.id) ? 'bg-purple-50' : 'hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedCollaborators.includes(u.id)}
                                                            onChange={() => toggleCollaborator(u.id)}
                                                            className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                                                        />
                                                        <div className="flex flex-col">
                                                            <span className={`text-sm ${selectedCollaborators.includes(u.id) ? 'font-semibold text-purple-900' : 'font-medium text-gray-700'}`}>
                                                                {u.displayName || u.email}
                                                            </span>
                                                            {u.role && u.role !== 'user' && (
                                                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{u.role}</span>
                                                            )}
                                                        </div>
                                                    </label>
                                                ))
                                            )}
                                        </div>
                                        <p className="text-xs text-gray-500 italic px-1 pt-1">(Có thể chọn nhiều)</p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 border-t border-gray-100 bg-gray-50/80 rounded-b-2xl flex items-center gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-xl hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !selectedAssignee || !content.trim()}
                        className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-xl hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm inline-flex justify-center items-center gap-2"
                    >
                        {isSubmitting || isProcessingInputOcr ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {inputOcrStatus || 'Đang xử lý...'}
                            </>
                        ) : (
                            <>
                                <Send className="w-4 h-4" />
                                {isSelfAssign ? 'Lưu công việc' : 'Giao việc mới'}
                            </>
                        )}
                    </button>
                </div>
            </div >

            <GenericConfirmModal
                isOpen={showConfirm}
                onClose={() => setShowConfirm(false)}
                onConfirm={executeSubmit}
                title="Xác nhận Giao việc"
                message="Bạn có chắc chắn muốn giao công việc mới này không?"
                confirmText="Giao việc"
            />

            <DocAttachmentSelectorModal
                isOpen={isDocModalOpen}
                onClose={() => setIsDocModalOpen(false)}
                onAttach={(docId, docData) => {
                    setSelectedVanBan(docData);
                    setIsDocModalOpen(false);
                }}
            />
        </div >
    );
};
