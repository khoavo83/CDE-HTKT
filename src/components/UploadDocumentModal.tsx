import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Paperclip, Loader2, Sparkles, FolderTree, Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { httpsCallable } from 'firebase/functions';
import { doc, updateDoc, arrayUnion, setDoc, collection } from 'firebase/firestore';
import { db, storage, auth, appFunctions } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { useUserStore } from '../store/useUserStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useCategoryTabStore } from '../store/useCategoryTabStore';
import { ProjectTreeSelectorModal } from './ProjectTreeSelectorModal';
import { format } from 'date-fns';
import { logVanBanActivity } from '../utils/vanbanLogUtils';

// Chuyển File sang Base64 string
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });

interface UploadDocumentModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UploadDocumentModal: React.FC<UploadDocumentModalProps> = ({ isOpen, onClose }) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [isOcrRunning, setIsOcrRunning] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const navigate = useNavigate();

    // States cho bước Review
    const [ocrData, setOcrData] = useState<any>({
        soKyHieu: '',
        ngayBanHanh: '',
        coQuanBanHanh: '',
        trichYeu: '',
        nguoiKy: '',
        soTrang: 1,
        fileSize: 0,
        fileNameStandardized: '',
        phanLoaiVanBan: '',
        mucDoKhan: 'THUONG'
    });
    const [docId, setDocId] = useState<string>('');
    const [isChecking, setIsChecking] = useState(false);

    // States cho Sắp xếp Dự án
    const [isProjectTreeOpen, setIsProjectTreeOpen] = useState(false);
    const [selectedProjectNodes, setSelectedProjectNodes] = useState<{ nodeId: string, projectId: string }[]>([]);

    // States cho Lịch họp (Giấy mời)
    const [showMeetingForm, setShowMeetingForm] = useState(false);
    const [meetingData, setMeetingData] = useState({
        diaDiemHop: '',
        ngayHop: '',
        thoiGianHop: '',
        endTime: '',
        title: '',
        selectedParticipants: [] as string[]
    });
    const { users, fetchUsers } = useUserStore();
    const { addMeeting } = useMeetingStore();
    const { user: currentUser } = useAuthStore();
    const { categories, fetchCategories } = useCategoryStore();
    const { tabs, fetchTabs } = useCategoryTabStore();
    const [mainFilePreviewUrl, setMainFilePreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            const unsub = fetchUsers();
            fetchCategories();
            fetchTabs();
            return () => unsub();
        }
    }, [isOpen, fetchUsers, fetchCategories, fetchTabs]);

    useEffect(() => {
        if (!mainFile) {
            setMainFilePreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(mainFile);
        setMainFilePreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [mainFile]);

    if (!isOpen) return null;

    const handleProcess = async () => {
        if (!mainFile) {
            toast.error('Vui lòng chọn Văn bản chính (PDF hoặc Ảnh)!');
            return;
        }

        setIsOcrRunning(true);
        try {
            const base64Data = await fileToBase64(mainFile);

            setUploadStatus('Đang chuẩn bị dữ liệu và upload lên hệ thống lưu trữ tập trung...');

            setUploadStatus('AI Gemini đang đọc văn bản và lưu hồ sơ gốc...');
            const processOCR = httpsCallable(appFunctions, 'processDocumentOCR');

            const ocrResult: any = await processOCR({
                base64Data,
                mimeType: mainFile.type,
                fileNameOriginal: mainFile.name,
                totalSizeBytes: mainFile.size,
                dinhKem: [] // Tạm thời để trống
            });

            if (!ocrResult.data.success) {
                throw new Error(ocrResult.data.message || 'Xử lý OCR thất bại');
            }

            const data = ocrResult.data.data;
            const newDocId = ocrResult.data.docId;

            const safeSoKyHieu = (data.soKyHieu || "NOSO").replace(/\//g, "-").replace(/\\/g, "-");
            const ngayBanHanhStr = data.ngayBanHanh || format(new Date(), 'yyyy-MM-dd'); // Fallback lấy ngày hiện tại nếu AI không đọc được

            const attachmentResults: any[] = [];

            setDocId(newDocId);

            const safeTrichYeu = (data.trichYeu || "KhongTrichYeu")
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[^a-zA-Z0-9 -]/g, "")
                .replace(/\s+/g, "_")
                .substring(0, 50);
            const initialStandardName = `${ngayBanHanhStr}_${safeSoKyHieu}`;

            setOcrData({
                ...data,
                mucDoKhan: data.mucDoKhan || 'THUONG', // Đảm bảo luôn có giá trị mặc định
                fileNameStandardized: initialStandardName,
                attachments: attachmentResults // Lưu mảng đính kèm vào OCR data để review
            });

            const loai = (data.loaiVanBan || '').toLowerCase();
            if (loai.includes('giấy mời') || loai.includes('thông báo họp') || loai.includes('lịch họp')) {
                setShowMeetingForm(true);
                setMeetingData(prev => ({
                    ...prev,
                    diaDiemHop: data.diaDiemHop || '',
                    ngayHop: data.ngayHop || '',
                    thoiGianHop: data.thoiGianHop || '',
                    title: data.trichYeu || ''
                }));
            }
        } catch (error: any) {
            console.error('Lỗi quá trình xử lý:', error);
            const errorMessage = error?.message || '';
            if (errorMessage.includes('Invalid Credentials') || errorMessage.includes('unauthenticated') || errorMessage.includes('Insufficient Permission')) {
                toast.error('Phiên làm việc Google của bạn đã hết hạn hoặc thiếu quyền (Insufficient Permission). Vui lòng Đăng xuất và Đăng nhập lại để cập nhật quyền truy cập Drive nhé!');
            } else {
                toast.error(`Xử lý thất bại: ${errorMessage || 'Không rõ lỗi. Kiểm tra Console.'}`);
            }
        } finally {
            setIsOcrRunning(false);
            setUploadStatus('');
        }
    };

    const handleRecheck = async () => {
        if (!mainFile || !docId) return;
        setIsChecking(true);
        try {
            const processOCR = httpsCallable(appFunctions, 'processDocumentOCR');

            const result: any = await processOCR({
                base64Data: await fileToBase64(mainFile),
                mimeType: mainFile.type,
                fileNameOriginal: mainFile.name,
                docId: docId // Truyền docId để cập nhật thay vì tạo mới
            });

            if (result.data.success) {
                setOcrData(result.data.data);
            }
        } catch (error) {
            console.error('Lỗi AI Recheck:', error);
            toast.error('AI Kiểm tra thất bại. Vui lòng thử lại.');
        } finally {
            setIsChecking(false);
        }
    };

    const handleFinalSave = async () => {
        if (!mainFile && !docId) {
            toast.error('Vui lòng chọn ít nhất Văn bản chính!');
            return;
        }

        setIsUploading(true);
        setUploadStatus('Đang lưu thông tin cuối cùng...');
        try {
            if (!ocrData.phanLoaiVanBan) {
                toast.error('Vui lòng chọn "Luồng văn bản" trước khi lưu!');
                setIsUploading(false);
                return;
            }
            if (!ocrData.mucDoKhan) {
                toast.error('Vui lòng chọn "Mức độ khẩn" trước khi lưu!');
                setIsUploading(false);
                return;
            }

            const user = JSON.parse(localStorage.getItem('user_cde') || '{}');
            const uploadFn = httpsCallable<{ fileName: string, mimeType: string, base64Data: string; targetParentId?: string }, any>(appFunctions, 'uploadFileToDriveBase64');

            const safeSoKyHieu = (ocrData.soKyHieu || "NOSO").replace(/\//g, "-").replace(/\\/g, "-");
            const ngayBanHanhStr = ocrData.ngayBanHanh || format(new Date(), 'yyyy-MM-dd');
            let safeTrichYeu = (ocrData.trichYeu || "KhongTrichYeu").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9 -]/g, "").replace(/\s+/g, "_").substring(0, 50);

            let targetDocId = docId;
            let driveFileId_Original = ocrData.driveFileId_Original || '';
            let webViewLink = ocrData.webViewLink || '';
            let fileNameStandardized = ocrData.fileNameStandardized || `${ngayBanHanhStr}_${safeSoKyHieu}`;
            if (mainFile && !fileNameStandardized.toLowerCase().endsWith('.pdf') && mainFile.name.toLowerCase().endsWith('.pdf')) {
                fileNameStandardized += '.pdf';
            }

            if (!targetDocId && mainFile) {
                setUploadStatus('Đang tải lên Văn bản chính...');
                const base64Data = await fileToBase64(mainFile);

                const uploadedMain = await uploadFn({
                    fileName: fileNameStandardized,
                    mimeType: mainFile.type,
                    base64Data: base64Data
                });

                driveFileId_Original = uploadedMain.data.file.id;
                webViewLink = uploadedMain.data.file.webViewLink;
                targetDocId = doc(collection(db, 'vanban')).id;
                setDocId(targetDocId);
            }

            let finalAttachments = [...(ocrData.attachments || [])];
            if (attachments.length > 0) {
                for (let i = 0; i < attachments.length; i++) {
                    const file = attachments[i];
                    setUploadStatus(`Đang tải tệp đính kèm ${i + 1}/${attachments.length}: ${file.name}...`);
                    const stt = (finalAttachments.length + 1).toString().padStart(2, '0');
                    const safeOriginalName = file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
                    const standardizedAttachName = `${ngayBanHanhStr}_${safeSoKyHieu}_DinhKem_${stt}_${safeOriginalName}`;

                    const base64 = await fileToBase64(file);
                    const uploaded = await uploadFn({
                        fileName: standardizedAttachName,
                        mimeType: file.type,
                        base64Data: base64
                    });

                    finalAttachments.push({
                        id: crypto.randomUUID(),
                        fileName: standardizedAttachName,
                        originalName: file.name,
                        fileSize: file.size,
                        mimeType: file.type,
                        driveFileId: uploaded.data.file.id,
                        webViewLink: uploaded.data.file.webViewLink,
                        uploadedAt: new Date().toISOString()
                    });
                }
            }

            const documentData = {
                ...ocrData,
                fileNameStandardized,
                driveFileId_Original,
                webViewLink,
                attachments: finalAttachments,
                trangThaiDuLieu: 'COMPLETED',
                updatedAt: new Date().toISOString()
            };

            if (!docId) { // Manual creation without AI
                const newDocInfo = {
                    ...documentData,
                    id: targetDocId,
                    fileNameOriginal: mainFile?.name || "",
                    createdAt: new Date().toISOString(),
                    history: arrayUnion({
                        action: "MANUAL_UPLOAD_AND_SAVE",
                        userId: user.uid || "Unknown",
                        userEmail: user.email || "Unknown",
                        timestamp: new Date().toISOString()
                    })
                };
                await setDoc(doc(db, 'vanban', targetDocId), newDocInfo, { merge: true });
            } else {
                await updateDoc(doc(db, 'vanban', targetDocId), {
                    ...documentData,
                    history: arrayUnion({
                        action: "REVIEW_AND_SAVE",
                        userId: user.uid || "Unknown",
                        userEmail: user.email || "Unknown",
                        timestamp: new Date().toISOString()
                    })
                });
            }

            await logVanBanActivity({
                vanBanId: targetDocId,
                userId: currentUser?.uid || "Unknown",
                userName: currentUser?.displayName || currentUser?.email || "Unknown",
                action: "ADD",
                details: `Tải lên văn bản mới: ${ocrData.soKyHieu || ''}`
            });

            if (showMeetingForm && meetingData.ngayHop) {
                try {
                    setUploadStatus('Đang tạo lịch họp...');
                    const driveFileId = driveFileId_Original || ocrData.driveFileId || '';
                    const attachmentUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '';
                    const attachmentName = fileNameStandardized
                        ? `${fileNameStandardized}`
                        : (mainFile?.name || 'Giấy mời họp');

                    await addMeeting({
                        title: meetingData.title || ocrData.trichYeu || 'Cuộc họp mới',
                        date: meetingData.ngayHop,
                        startTime: meetingData.thoiGianHop || '08:00',
                        endTime: meetingData.endTime || '09:00',
                        location: meetingData.diaDiemHop,
                        participants: meetingData.selectedParticipants,
                        documentId: targetDocId,
                        description: `Tự động tạo từ văn bản: ${ocrData.soKyHieu || ''}`,
                        creatorId: currentUser?.uid || '',
                        attachmentUrl,
                        attachmentName
                    });
                } catch (err) {
                    console.error('Lỗi tạo lịch họp:', err);
                }
            }

            if (selectedProjectNodes.length > 0) {
                setUploadStatus('Đang cấu hình liên kết thư mục Dự án...');
                const attachFn = httpsCallable(appFunctions, 'attachDocumentToNode');

                for (const node of selectedProjectNodes) {
                    try {
                        await attachFn({
                            nodeId: node.nodeId,
                            projectId: node.projectId,
                            vanBanId: targetDocId
                        });
                    } catch (error) {
                        console.error('Lỗi khi liên kết văn bản vào node:', node.nodeId, error);
                    }
                }
            }

            onClose();
            navigate("/documents/" + targetDocId);
        } catch (error: any) {
            console.error('Lỗi lưu cuối cùng:', error);
            toast.error('Không thể lưu thông tin. Vui lòng thử lại.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className={`bg-white rounded-xl shadow-xl w-full ${mainFile ? 'w-[95vw] max-w-[1600px] h-[95vh] flex-row' : 'max-w-2xl max-h-[90vh] flex-col'} overflow-hidden transform transition-all flex`}>
                
                {/* Cửa sổ đọc file (Bên trái) */}
                {mainFile && (
                    <div className="hidden lg:flex w-[55%] flex-col bg-gray-100 border-r border-gray-200">
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                            <span className="text-sm font-semibold text-gray-700 truncate flex items-center gap-2">
                                <FileText className="w-4 h-4 text-blue-600" />
                                Xem trước: {mainFile.name}
                            </span>
                        </div>
                        <div className="flex-1 w-full bg-gray-200 overflow-hidden flex items-center justify-center relative">
                            {mainFile.type.startsWith('image/') ? (
                                <img src={mainFilePreviewUrl || ''} alt="Preview" className="max-w-full max-h-full object-contain drop-shadow" />
                            ) : (
                                <iframe src={mainFilePreviewUrl || ''} className="w-full h-full border-0 bg-white" title="PDF Preview" />
                            )}
                        </div>
                    </div>
                )}

                {/* Form nhập liệu (Bên phải) */}
                <div className={`flex flex-col flex-1 h-full min-h-0 ${mainFile ? 'w-[45%]' : 'w-full'}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                        <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-blue-600" />
                            Tải Văn bản mới / Kiểm tra thông tin
                        </h3>
                        <button onClick={onClose} disabled={isUploading || isOcrRunning} className="text-gray-400 hover:text-gray-600 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="p-6 space-y-6 overflow-y-auto flex-1">
                    <div className="space-y-5">
                        {/* ═══════ PHẦN 1: Văn bản chính ═══════ */}
                        <div className="bg-white border border-blue-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">1</div>
                                <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                    <FileText className="w-4 h-4 text-blue-600" /> Văn bản chính <span className="text-red-500">*</span>
                                </label>
                            </div>
                            <div className="relative border-2 border-dashed border-blue-200 rounded-lg p-6 text-center hover:bg-blue-50 transition-colors cursor-pointer">
                                <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    onChange={(e) => {
                                        if (e.target.files?.[0]) {
                                            setMainFile(e.target.files[0]);
                                            const newSize = e.target.files[0].size;
                                            setOcrData((prev: any) => ({...prev, fileSize: newSize }));
                                        } else {
                                            setMainFile(null);
                                        }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isUploading || !!docId}
                                />
                                {mainFile ? (
                                    <div className="flex flex-col items-center">
                                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                                            <FileText className="w-5 h-5 text-blue-600" />
                                        </div>
                                        <p className="text-sm font-bold text-blue-600 truncate max-w-[90%]">✅ {mainFile.name}</p>
                                        <p className="text-xs text-gray-400 mt-1">{(mainFile.size / 1024).toFixed(1)} KB · {docId ? 'Đã tải lên' : 'Nhấn để thay đổi'}</p>
                                    </div>
                                ) : (
                                    <div>
                                        <Upload className="w-8 h-8 mx-auto text-blue-300 mb-2" />
                                        <p className="text-sm font-medium text-gray-500">Kéo thả hoặc nhấn để chọn PDF / Hình ảnh</p>
                                        <p className="text-xs text-gray-400 mt-1">AI sẽ tự động đọc và trích xuất thông tin</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══════ PHẦN 2: Các tài liệu đính kèm ═══════ */}
                        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs font-bold">2</div>
                                <label className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                    <Paperclip className="w-4 h-4 text-amber-600" /> Các tài liệu đính kèm <span className="text-gray-400 font-normal text-xs">(tuỳ chọn)</span>
                                </label>
                            </div>
                            <p className="text-xs text-gray-500 italic mb-3">Dự thảo Word, phụ lục, bảng vẽ... Hệ thống sẽ tự đổi tên theo Số ký hiệu sau khi duyệt.</p>
                            <div className="relative border-2 border-dashed border-amber-200 rounded-lg p-4 text-center hover:bg-amber-50/50 transition-colors cursor-pointer">
                                <input
                                    type="file"
                                    multiple
                                    onChange={(e) => {
                                        if (e.target.files) {
                                            const filesArray = Array.from(e.target.files);
                                            setAttachments((prev: any) => [...prev, ...filesArray]);
                                        }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isUploading}
                                />
                                <div className="flex flex-col items-center gap-1">
                                    <Upload className="w-6 h-6 text-amber-400" />
                                    <p className="text-xs text-gray-500 font-medium">Chọn nhiều file đính kèm từ máy tính</p>
                                </div>
                            </div>

                            {/* Danh sách file đã chọn */}
                            {attachments.length > 0 && (
                                <div className="mt-3 space-y-1.5">
                                    <p className="text-[10px] font-bold text-amber-600 uppercase">Đã chọn {attachments.length} tệp:</p>
                                    <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
                                        {attachments.map((file, idx) => (
                                            <div key={idx} className="flex items-center justify-between text-xs bg-amber-50/50 p-2 rounded border border-amber-100">
                                                <div className="flex items-center gap-2 truncate pr-3">
                                                    <FileText className="w-3 h-3 text-amber-500 shrink-0" />
                                                    <span className="truncate text-gray-600 font-medium">{file.name}</span>
                                                    <span className="text-gray-400 shrink-0">({(file.size / 1024).toFixed(0)} KB)</span>
                                                </div>
                                                <button
                                                    onClick={() => setAttachments(attachments.filter((_, i) => i !== idx))}
                                                    className="text-red-400 hover:text-red-600 font-bold px-1.5 py-0.5 text-[10px] bg-white border border-red-100 rounded shrink-0"
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {/* Danh sách đã có từ OCR */}
                            {ocrData.attachments && ocrData.attachments.length > 0 && (
                                <div className="mt-4 pt-4 border-t border-gray-100">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1.5 mb-2">
                                        <Paperclip className="w-3 h-3" /> Tệp đã có ({ocrData.attachments.length})
                                    </p>
                                    <div className="space-y-2">
                                        {ocrData.attachments.map((file: any, idx: number) => (
                                            <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 p-2 rounded border border-gray-100">
                                                <div className="flex items-center gap-2 truncate pr-4">
                                                    <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                                                    <span className="truncate text-gray-700">{file.fileName}</span>
                                                </div>
                                                <a href={file.webViewLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">Xem</a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ═══════ PHẦN 3: Thông tin Form / OCR ═══════ */}
                        {docId && (
                            <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex items-start justify-between gap-3 text-sm text-amber-800">
                                <div className="flex items-start gap-3">
                                    <Sparkles className="w-5 h-5 shrink-0 text-amber-500" />
                                    <div>
                                        <p className="font-bold">AI Gemini đã trích xuất dữ liệu!</p>
                                        <p className="opacity-90">Vui lòng kiểm tra lại thông tin hồ sơ bên dưới.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleRecheck}
                                    disabled={isChecking || isUploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors font-bold text-xs disabled:opacity-50"
                                >
                                    <Sparkles className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
                                    {isChecking ? 'Đang kiểm tra...' : 'AI Kiểm tra lại'}
                                </button>
                            </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Số / Ký hiệu</label>
                                <input
                                    type="text"
                                    value={ocrData.soKyHieu || ''}
                                    onChange={(e) => setOcrData({ ...ocrData, soKyHieu: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Ngày ban hành</label>
                                <input
                                    type="date"
                                    value={ocrData.ngayBanHanh || ''}
                                    onChange={(e) => setOcrData({ ...ocrData, ngayBanHanh: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                                />
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Cơ quan ban hành</label>
                                <input
                                    type="text"
                                    value={ocrData.coQuanBanHanh || ''}
                                    onChange={(e) => setOcrData({ ...ocrData, coQuanBanHanh: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                                />
                            </div>
                            <div className="space-y-1 col-span-2">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trích yếu nội dung</label>
                                <textarea
                                    rows={3}
                                    value={ocrData.trichYeu || ''}
                                    onChange={(e) => setOcrData({ ...ocrData, trichYeu: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4 col-span-2">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Người ký</label>
                                    <input
                                        type="text"
                                        value={ocrData.nguoiKy || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, nguoiKy: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-purple-600 flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" /> Loại Văn bản
                                    </label>
                                    <input
                                        type="text"
                                        list="loaiVanBanListUpload"
                                        value={ocrData.loaiVanBan || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, loaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-purple-200 bg-purple-50 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none font-medium text-sm text-purple-900 placeholder:text-purple-300"
                                        placeholder="Giấy mời, Quyết định..."
                                    />
                                    <datalist id="loaiVanBanListUpload">
                                        {categories
                                            .filter(c => c.type === tabs.find(t => t.label === 'Loại Văn bản')?.id)
                                            .sort((a, b) => a.order - b.order)
                                            .map(c => (
                                                <option key={c.id} value={c.value} />
                                            ))}
                                    </datalist>
                                </div>
                            </div>
                            <div className="space-y-1 col-span-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100 mt-2">
                                <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Tên file chuẩn hóa trên Drive (Có thể chỉnh sửa)</label>
                                <input
                                    type="text"
                                    value={ocrData.fileNameStandardized || ''}
                                    onChange={(e) => setOcrData({ ...ocrData, fileNameStandardized: e.target.value })}
                                    className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm text-blue-800"
                                    placeholder="yyyy-mm-dd_số ký hiệu"
                                />
                                <p className="text-[10px] text-blue-500 mt-1">* Hệ thống sẽ tự động thêm đuôi .pdf khi lưu</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4 col-span-2 mt-2">
                                <div className="space-y-1 bg-gray-50/50 p-2.5 rounded-lg border border-gray-200">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase flex justify-between">
                                        <span>Dung lượng Văn bản</span>
                                        <span className="text-gray-400 font-normal">{mainFile ? (mainFile.size / 1024 / 1024).toFixed(3) : 0} gốc</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={ocrData.fileSize ? (ocrData.fileSize / 1024 / 1024).toFixed(3) : (mainFile ? (mainFile.size / 1024 / 1024).toFixed(3) : 0)}
                                            onChange={(e) => {
                                                const valInMB = parseFloat(e.target.value) || 0;
                                                setOcrData({ ...ocrData, fileSize: Math.floor(valInMB * 1024 * 1024) });
                                            }}
                                            className="w-full px-3 py-2 pr-10 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-white text-gray-800"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">MB</span>
                                    </div>
                                </div>
                                <div className="space-y-1 bg-gray-50/50 p-2.5 rounded-lg border border-gray-200">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Số trang</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            min="1"
                                            value={ocrData.soTrang || 1}
                                            onChange={(e) => setOcrData({ ...ocrData, soTrang: parseInt(e.target.value) || 1 })}
                                            className="w-full px-3 py-2 pr-12 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm bg-white text-gray-800"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">trang</span>
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 col-span-2 mt-2 pt-3 border-t border-gray-100">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Luồng Văn bản <span className="text-red-500">*</span></label>
                                    <select
                                        value={ocrData.phanLoaiVanBan || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, phanLoaiVanBan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm bg-white"
                                    >
                                        <option value="">-- Chưa phân loại --</option>
                                        <option value="INCOMING">📥 Văn bản Đến</option>
                                        <option value="OUTGOING">📤 Văn bản Đi</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mức độ Khẩn <span className="text-red-500">*</span></label>
                                    <select
                                        value={ocrData.mucDoKhan}
                                        onChange={(e) => setOcrData({ ...ocrData, mucDoKhan: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm bg-white"
                                    >
                                        <option value="THUONG">🌿 Bình thường</option>
                                        <option value="KHAN">⚡ Khẩn</option>
                                        <option value="HOA_TOC">🔥 Hỏa tốc</option>
                                    </select>
                                </div>
                            </div>

                            {/* Form Lịch họp (hiện khi AI nhận diện Giấy mời) */}
                            <div className="col-span-2 mt-1 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowMeetingForm(!showMeetingForm)}
                                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border transition-colors font-medium text-sm ${showMeetingForm
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                                        }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <Calendar className="w-4 h-4" />
                                        📅 Đặt lịch họp (Giấy mời)
                                    </span>
                                    {showMeetingForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>

                                {showMeetingForm && (
                                    <div className="mt-3 p-4 bg-indigo-50/50 border border-indigo-100 rounded-lg space-y-3">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Tiêu đề cuộc họp</label>
                                            <input
                                                type="text"
                                                value={meetingData.title}
                                                onChange={(e) => setMeetingData({ ...meetingData, title: e.target.value })}
                                                placeholder="Vi dụ: Họp về phương án thi công..."
                                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                            />
                                        </div>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><Calendar className="w-3 h-3" /> Ngày họp</label>
                                                <input
                                                    type="date"
                                                    value={meetingData.ngayHop}
                                                    onChange={(e) => setMeetingData({ ...meetingData, ngayHop: e.target.value })}
                                                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Giờ bắt đầu</label>
                                                <input
                                                    type="time"
                                                    value={meetingData.thoiGianHop}
                                                    onChange={(e) => setMeetingData({ ...meetingData, thoiGianHop: e.target.value })}
                                                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><Clock className="w-3 h-3" /> Giờ kết thúc</label>
                                                <input
                                                    type="time"
                                                    value={meetingData.endTime}
                                                    onChange={(e) => setMeetingData({ ...meetingData, endTime: e.target.value })}
                                                    className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><MapPin className="w-3 h-3" /> Địa điểm họp</label>
                                            <input
                                                type="text"
                                                value={meetingData.diaDiemHop}
                                                onChange={(e) => setMeetingData({ ...meetingData, diaDiemHop: e.target.value })}
                                                className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                                                placeholder="Phòng họp A, Tầng 5..."
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1"><Users className="w-3 h-3" /> Người tham dự</label>
                                            <div className="relative">
                                                <div className="flex flex-wrap gap-1.5 p-2 border border-indigo-200 rounded-lg bg-white min-h-[40px]">
                                                    {meetingData.selectedParticipants.map(uid => {
                                                        const u = users.find(u => u.uid === uid);
                                                        return (
                                                            <span key={uid} className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 rounded-full px-2.5 py-0.5 text-xs font-medium">
                                                                {u?.displayName || u?.email || uid}
                                                                <button type="button" onClick={() => setMeetingData({ ...meetingData, selectedParticipants: meetingData.selectedParticipants.filter(id => id !== uid) })} className="hover:text-red-500">×</button>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                <select
                                                    value=""
                                                    onChange={(e) => {
                                                        if (e.target.value && !meetingData.selectedParticipants.includes(e.target.value)) {
                                                            setMeetingData({ ...meetingData, selectedParticipants: [...meetingData.selectedParticipants, e.target.value] });
                                                        }
                                                    }}
                                                    className="w-full mt-1 px-3 py-2 border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
                                                >
                                                    <option value="">-- Chọn thêm người tham dự --</option>
                                                    {users.filter(u => !meetingData.selectedParticipants.includes(u.uid)).map(u => (
                                                        <option key={u.uid} value={u.uid}>{u.displayName || u.email} {u.chucVu ? `(${u.chucVu})` : ''}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                    <div>
                        <button
                            onClick={() => setIsProjectTreeOpen(true)}
                            disabled={isUploading || isOcrRunning}
                            className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 font-medium transition"
                        >
                            <FolderTree className="w-4 h-4" />
                            Sắp xếp {selectedProjectNodes.length > 0 && <span className="bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded text-xs ml-1 font-bold">{selectedProjectNodes.length}</span>}
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            disabled={isUploading || isOcrRunning}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Hủy
                        </button>

                        <button
                            onClick={handleProcess}
                            disabled={isUploading || isOcrRunning || !mainFile || !!docId}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg flex items-center gap-2 ${!!docId ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white hover:bg-blue-700'} disabled:opacity-50`}
                        >
                            {isOcrRunning ? (
                                <><Loader2 className="w-4 h-4 animate-spin" />Đọc OCR...</>
                            ) : (
                                <><Sparkles className="w-4 h-4" />{docId ? 'Đã chạy AI' : 'AI Hỗ trợ điền form'}</>
                            )}
                        </button>

                        <button
                            onClick={handleFinalSave}
                            disabled={isUploading || isOcrRunning}
                            className="px-6 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-md shadow-green-100 disabled:opacity-50 flex items-center gap-2"
                        >
                            {isUploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus}</>
                            ) : (
                                <>Lưu & Xem văn bản</>
                            )}
                        </button>

                    </div>
                </div>
            </div>
            </div>

            <ProjectTreeSelectorModal
                isOpen={isProjectTreeOpen}
                onClose={() => setIsProjectTreeOpen(false)}
                initialSelectedNodeIds={selectedProjectNodes.map(n => n.nodeId)}
                onConfirm={(nodes) => {
                    setSelectedProjectNodes(nodes);
                    setIsProjectTreeOpen(false);
                }}
            />
        </div>
    );
};
