import React, { useState, useEffect } from 'react';
import { X, Upload, FileText, Paperclip, Loader2, Sparkles, FolderTree, Calendar, MapPin, Clock, Users, ChevronDown, ChevronUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useUserStore } from '../store/useUserStore';
import { useMeetingStore } from '../store/useMeetingStore';
import { ProjectTreeSelectorModal } from './ProjectTreeSelectorModal';


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
    const [uploadStatus, setUploadStatus] = useState<string>('');
    const navigate = useNavigate();

    // States cho bước Review
    const [showReview, setShowReview] = useState(false);
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

    useEffect(() => {
        if (isOpen) {
            const unsub = fetchUsers();
            return () => unsub();
        }
    }, [isOpen, fetchUsers]);

    if (!isOpen) return null;

    const handleProcess = async () => {
        if (!mainFile) {
            alert('Vui lòng chọn Văn bản chính (PDF hoặc Ảnh)!');
            return;
        }

        setIsUploading(true);
        try {
            const base64Data = await fileToBase64(mainFile);

            setUploadStatus('Đang chuẩn bị dữ liệu và upload lên hệ thống lưu trữ tập trung...');
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../firebase/config');

            // 1. Upload các tệp đính kèm thông qua Cloud Function (Tập trung)
            if (attachments.length > 0) {
                setUploadStatus(`Đang upload ${attachments.length} tệp đính kèm...`);
            }
            const attachmentResults = await Promise.all(attachments.map(async (file) => {
                const uploadFn = httpsCallable<{ fileName: string, mimeType: string, base64Data: string }, any>(functions, 'uploadFileToDriveBase64');
                const uploaded = await uploadFn({
                    fileName: file.name,
                    mimeType: file.type,
                    base64Data: await fileToBase64(file)
                });

                return {
                    fileName: file.name,
                    mimeType: file.type,
                    driveFileId: uploaded.data.file.id,
                    webViewLink: uploaded.data.file.webViewLink
                };
            }));

            // 2. Gọi Cloud Function để xử lý OCR và upload file chính
            const processOCR = httpsCallable(functions, 'processDocumentOCR');
            setUploadStatus('AI Gemini đang đọc văn bản và lưu hồ sơ gốc...');

            const result: any = await processOCR({
                base64Data, // Gửi dữ liệu file chính cho AI và để upload
                mimeType: mainFile.type,
                fileNameOriginal: mainFile.name,
                totalSizeBytes: mainFile.size,
                dinhKem: attachmentResults
            });

            if (result.data.success) {
                const data = result.data.data;
                setDocId(result.data.docId);

                // Chuẩn hóa tên file ban đầu
                const safeSoKyHieu = (data.soKyHieu || "NOSO").replace(/\//g, "_");
                const safeTrichYeu = (data.trichYeu || "KhongTrichYeu")
                    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                    .replace(/[^a-zA-Z0-9 ]/g, "")
                    .replace(/\s+/g, "_")
                    .substring(0, 50);
                const initialStandardName = `${data.ngayBanHanh || "NODATE"}_${safeSoKyHieu}_${safeTrichYeu}`;

                setOcrData({
                    ...data,
                    fileNameStandardized: initialStandardName
                });

                // Tự động bật form lịch họp nếu là Giấy mời
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
                setShowReview(true);
            } else {
                throw new Error(result.data.message || 'Xử lý thất bại');
            }
        } catch (error: any) {
            console.error('Lỗi quá trình xử lý:', error);
            alert(`Xử lý thất bại: ${error?.message || 'Không rõ lỗi. Kiểm tra Console.'}`);
        } finally {
            setIsUploading(false);
            setUploadStatus('');
        }
    };

    const handleRecheck = async () => {
        if (!mainFile || !docId) return;
        setIsChecking(true);
        try {
            const { functions: functionsInstance } = await import('../firebase/config');
            const { httpsCallable } = await import('firebase/functions');
            const processOCR = httpsCallable(functionsInstance, 'processDocumentOCR');

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
            alert('AI Kiểm tra thất bại. Vui lòng thử lại.');
        } finally {
            setIsChecking(false);
        }
    };

    const handleFinalSave = async () => {
        setIsUploading(true);
        setUploadStatus('Đang lưu thông tin cuối cùng...');
        try {
            const { db } = await import('../firebase/config');
            const { doc, updateDoc } = await import('firebase/firestore');

            // Cập nhật thông tin văn bản đã chỉnh sửa
            const { arrayUnion } = await import('firebase/firestore');
            const user = JSON.parse(localStorage.getItem('user_cde') || '{}');

            await updateDoc(doc(db, 'vanban', docId), {
                ...ocrData,
                trangThaiDuLieu: 'COMPLETED',
                history: arrayUnion({
                    action: "REVIEW_AND_SAVE",
                    userId: user.uid || "Unknown",
                    userEmail: user.email || "Unknown",
                    timestamp: new Date().toISOString()
                })
            });

            // Tạo lịch họp nếu được chọn
            if (showMeetingForm && meetingData.ngayHop) {
                try {
                    setUploadStatus('Đang tạo lịch họp...');
                    // Lấy link file giấy mời từ data OCR (driveFileId_Original)
                    const driveFileId = ocrData.driveFileId_Original || ocrData.driveFileId || '';
                    const attachmentUrl = driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : '';
                    const attachmentName = ocrData.fileNameStandardized
                        ? `${ocrData.fileNameStandardized}.pdf`
                        : (mainFile?.name || 'Giấy mời họp');

                    await addMeeting({
                        title: meetingData.title || ocrData.trichYeu || 'Cuộc họp mới',
                        date: meetingData.ngayHop,
                        startTime: meetingData.thoiGianHop || '08:00',
                        endTime: meetingData.endTime || '09:00',
                        location: meetingData.diaDiemHop,
                        participants: meetingData.selectedParticipants,
                        documentId: docId,
                        description: `Tự động tạo từ văn bản: ${ocrData.soKyHieu || ''}`,
                        creatorId: currentUser?.uid || '',
                        attachmentUrl,
                        attachmentName
                    });
                    console.log('Đã tạo lịch họp thành công!');
                } catch (err) {
                    console.error('Lỗi tạo lịch họp:', err);
                }
            }

            // Gắn văn bản vào các nhánh Dự án đã chọn
            if (selectedProjectNodes.length > 0) {
                setUploadStatus('Đang cấu hình liên kết thư mục Dự án...');
                const { functions: functionsInstance } = await import('../firebase/config');
                const { httpsCallable } = await import('firebase/functions');
                const attachFn = httpsCallable(functionsInstance, 'attachDocumentToNode');

                for (const node of selectedProjectNodes) {
                    try {
                        await attachFn({
                            nodeId: node.nodeId,
                            projectId: node.projectId,
                            vanBanId: docId
                        });
                    } catch (error) {
                        console.error('Lỗi khi liên kết văn bản vào node:', node.nodeId, error);
                    }
                }
            }

            onClose();
            navigate(`/documents/${docId}`);
        } catch (error: any) {
            console.error('Lỗi lưu cuối cùng:', error);
            alert('Không thể lưu thông tin. Vui lòng thử lại.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden transform transition-all flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Upload className="w-5 h-5 text-blue-600" />
                        {showReview ? 'Kiểm tra thông tin trích xuất' : 'Tải Văn bản mới'}
                    </h3>
                    <button onClick={onClose} disabled={isUploading} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {showReview ? (
                        <div className="space-y-5">
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
                                <div className="space-y-1 col-span-2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Người ký</label>
                                    <input
                                        type="text"
                                        value={ocrData.nguoiKy || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, nguoiKy: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm"
                                    />
                                </div>
                                <div className="space-y-1 col-span-2 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                    <label className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">Tên file chuẩn hóa trên Drive (Có thể chỉnh sửa)</label>
                                    <input
                                        type="text"
                                        value={ocrData.fileNameStandardized || ''}
                                        onChange={(e) => setOcrData({ ...ocrData, fileNameStandardized: e.target.value })}
                                        className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-sm text-blue-800"
                                        placeholder="yyyy-mm-dd_số hiệu_trích yếu"
                                    />
                                    <p className="text-[10px] text-blue-500 mt-1">* Hệ thống sẽ tự động thêm đuôi .pdf khi lưu</p>
                                </div>
                                <div className="grid grid-cols-2 gap-4 col-span-2 mt-2">
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Dung lượng</p>
                                        <p className="text-sm font-medium text-gray-600">{(ocrData.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                    </div>
                                    <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase">Số trang</p>
                                        <p className="text-sm font-medium text-gray-600">{ocrData.soTrang} trang</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 col-span-2 mt-1 pt-3 border-t border-gray-100">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Luồng Văn bản</label>
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
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Mức độ Khẩn</label>
                                        <select
                                            value={ocrData.mucDoKhan || 'THUONG'}
                                            onChange={(e) => setOcrData({ ...ocrData, mucDoKhan: e.target.value })}
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium text-sm bg-white"
                                        >
                                            <option value="THUONG">Thường</option>
                                            <option value="KHAN">Khẩn / Hỏa tốc</option>
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
                    ) : (
                        <>
                            {/* AI Notice */}
                            <div className="flex items-start gap-2 text-sm text-blue-700 bg-blue-50 p-3 rounded-lg border border-blue-100">
                                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>AI Gemini sẽ tự động đọc và trích xuất thông tin từ file của bạn.</span>
                            </div>

                            <div className="space-y-5">
                                {/* Văn bản chính */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                                        <FileText className="w-4 h-4" /> Văn bản chính (Bắt buộc)
                                    </label>
                                    <div className="relative border-2 border-dashed border-blue-200 rounded-lg p-5 text-center hover:bg-blue-50 transition-colors cursor-pointer">
                                        <input
                                            type="file"
                                            accept="application/pdf,image/*"
                                            onChange={(e) => setMainFile(e.target.files?.[0] || null)}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={isUploading}
                                        />
                                        {mainFile ? (
                                            <div>
                                                <p className="text-sm font-semibold text-blue-600 truncate">✅ {mainFile.name}</p>
                                                <p className="text-xs text-gray-400 mt-1">{(mainFile.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        ) : (
                                            <div>
                                                <Upload className="w-8 h-8 mx-auto text-blue-300 mb-2" />
                                                <p className="text-sm text-gray-500">Kéo thả hoặc nhấn để chọn PDF / Hình ảnh</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Đính kèm */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1.5">
                                        <Paperclip className="w-4 h-4" /> Tệp đính kèm (tuỳ chọn)
                                    </label>
                                    <p className="text-xs text-gray-500 font-normal italic mb-3">Hỗ trợ tải lên file Word dự thảo - Hệ thống sẽ tự động đồng bộ tên trên Drive với tệp PDF gốc</p>
                                    <div className="relative border-2 border-dashed border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                                        <input
                                            type="file"
                                            multiple
                                            onChange={(e) => { if (e.target.files) setAttachments(Array.from(e.target.files)); }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={isUploading}
                                        />
                                        {attachments.length > 0 ? (
                                            <p className="text-sm font-medium text-gray-600">📎 Đã chọn {attachments.length} tệp</p>
                                        ) : (
                                            <p className="text-sm text-gray-400">Chọn nhiều tệp đính kèm...</p>
                                        )}
                                    </div>
                                    {attachments.length > 0 && (
                                        <ul className="mt-2 text-xs text-gray-500 max-h-20 overflow-y-auto space-y-0.5 px-2">
                                            {attachments.map((f, i) => <li key={i} className="truncate">• {f.name}</li>)}
                                        </ul>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
                    <div>
                        {showReview && (
                            <button
                                onClick={() => setIsProjectTreeOpen(true)}
                                disabled={isUploading}
                                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 font-medium transition"
                            >
                                <FolderTree className="w-4 h-4" />
                                Sắp xếp Dự án {selectedProjectNodes.length > 0 && <span className="bg-purple-200 text-purple-800 px-1.5 py-0.5 rounded text-xs ml-1 font-bold">{selectedProjectNodes.length}</span>}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            disabled={isUploading}
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Hủy
                        </button>
                        {showReview ? (
                            <button
                                onClick={handleFinalSave}
                                disabled={isUploading}
                                className="px-6 py-2 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 shadow-md shadow-green-100 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isUploading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus}</>
                                ) : (
                                    <>Lưu & Xem văn bản</>
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleProcess}
                                disabled={isUploading || !mainFile}
                                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isUploading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" />{uploadStatus || 'Đang xử lý...'}</>
                                ) : (
                                    <><Sparkles className="w-4 h-4" />Đọc OCR bằng AI</>
                                )}
                            </button>
                        )}
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
