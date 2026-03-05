import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../firebase/config';
import { doc, updateDoc, collection, setDoc } from 'firebase/firestore';

interface ReportCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    parentDriveFolderId?: string; // Folder của node cha (Task không có folder riêng)
}


// Chuyển File sang Base64 string
const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
    });

export const ReportCompletionModal: React.FC<ReportCompletionModalProps> = ({ isOpen, onClose, task, parentDriveFolderId }) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState<string>('');

    // Toast notification
    const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    // States cho bước Review
    const [showReview, setShowReview] = useState(false);
    const [ocrData, setOcrData] = useState<any>(null);
    const [docId, setDocId] = useState<string>('');

    if (!isOpen) return null;

    const handleReport = async () => {
        if (!mainFile) {
            showToast('error', 'Vui lòng chọn Tệp báo cáo (PDF hoặc Ảnh)!');
            return;
        }

        setIsUploading(true);
        setUploadStatus('Đang khởi tạo quá trình upload...');

        try {
            setUploadStatus('Đang chuẩn bị dữ liệu báo cáo...');
            const base64Data = await fileToBase64(mainFile);

            setUploadStatus('AI Gemini đang đọc văn bản và xử lý tệp...');
            const processOCR = httpsCallable(functions, 'processDocumentOCR');

            const response: any = await processOCR({
                base64Data,
                mimeType: mainFile.type,
                fileNameOriginal: mainFile.name,
                totalSizeBytes: mainFile.size,
                dinhKem: [],
                folderId: parentDriveFolderId || undefined,
                nodeId: task.id
            });

            if (response.data.success) {
                // Thay vì đóng modal, chuyển sang mode Review
                setDocId(response.data.docId);
                const aiData = response.data.data;
                // Mặc định Luồng Văn bản là "Văn bản đi" nếu AI chưa xác định
                if (!aiData.phanLoaiVanBan) {
                    aiData.phanLoaiVanBan = 'OUTGOING';
                }
                setOcrData(aiData); // Chứa soKyHieu, trichYeu... từ AI
                setShowReview(true);
            } else {
                throw new Error('Xử lý OCR thất bại.');
            }
        } catch (error: any) {
            console.error('Lỗi báo cáo hoàn thành:', error);
            const errorMessage = error?.message || '';
            if (errorMessage.includes('Invalid Credentials') || errorMessage.includes('unauthenticated')) {
                showToast('error', 'Phiên làm việc Google đã hết hạn (sau 1 giờ). Vui lòng Đăng xuất -> Đăng nhập lại hệ thống bằng Google Workspace để tiếp tục.');
            } else {
                showToast('error', errorMessage || 'Xử lý báo cáo thất bại. Vui lòng thử lại.');
            }
        } finally {
            setIsUploading(false);
            setUploadStatus('');
        }
    };

    const handleFinalSave = async () => {
        setIsUploading(true);
        setUploadStatus('Đang lưu thông tin cuối cùng...');
        try {
            // 1. Cập nhật thông tin văn bản đã chỉnh sửa
            await updateDoc(doc(db, 'vanban', docId), {
                ...ocrData,
                trangThaiDuLieu: 'COMPLETED' // Đánh dấu đã review xong
            });

            // 2. Cập nhật trạng thái Task
            await updateDoc(doc(db, 'project_nodes', task.id), {
                status: 'COMPLETED',
                completedAt: new Date().toISOString(),
                bcDocId: docId
            });

            // 3. Link văn bản vào Task
            const linkRef = doc(collection(db, 'vanban_node_links'));
            await setDoc(linkRef, {
                id: linkRef.id,
                vanBanId: docId,
                nodeId: task.id,
                projectId: task.parentId || 'ROOT',
                createdAt: new Date().toISOString()
            });

            showToast('success', 'Đã báo cáo hoàn thành thành công! 🎉');
            setTimeout(() => onClose(), 1500);
        } catch (error: any) {
            console.error('Lỗi lưu cuối cùng:', error);
            showToast('error', 'Không thể lưu thông tin. Vui lòng thử lại.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto">

            {/* Toast Notification */}
            {toast && (
                <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-4 rounded-xl shadow-2xl text-white text-sm font-medium
                    transition-all duration-300 animate-[slideDown_0.3s_ease-out]
                    ${toast.type === 'success'
                        ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                        : 'bg-gradient-to-r from-red-500 to-rose-600'}
                `}>
                    {toast.type === 'success'
                        ? <CheckCircle className="w-5 h-5 shrink-0" />
                        : <AlertCircle className="w-5 h-5 shrink-0" />}
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 transition">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl my-8 overflow-hidden transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50 flex-shrink-0">
                    <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        {showReview ? 'Kiểm tra & Xác nhận thông tin AI' : 'Báo cáo Hoàn thành'}
                    </h3>
                    <button onClick={onClose} disabled={isUploading} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto">
                    {showReview ? (
                        // GIAO DIỆN REVIEW OCR
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
                        // GIAO DIỆN UPLOAD GỐC
                        <>
                            <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg flex items-start gap-2 text-sm text-blue-700">
                                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>Vui lòng tải lên tài liệu chứng minh kết quả công việc. Hệ thống sẽ tự động trích xuất thông tin bằng AI.</span>
                            </div>

                            <div>
                                <p className="text-xs font-medium text-gray-500 mb-1 uppercase tracking-wider">Công việc hiện tại:</p>
                                <p className="text-sm font-semibold text-gray-900 bg-gray-100 p-2 rounded truncate">{task.name}</p>
                            </div>

                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer relative group">
                                <input
                                    type="file"
                                    accept=".pdf,image/*"
                                    onChange={(e) => setMainFile(e.target.files?.[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    disabled={isUploading}
                                />
                                {mainFile ? (
                                    <div className="space-y-2">
                                        <FileText className="w-12 h-12 mx-auto text-blue-600" />
                                        <p className="text-sm font-bold text-gray-800 truncate px-4">{mainFile.name}</p>
                                        <p className="text-xs text-gray-500">{(mainFile.size / 1024).toFixed(1)} KB</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <Upload className="w-12 h-12 mx-auto text-gray-300 group-hover:text-blue-400 transition-colors" />
                                        <p className="text-sm text-gray-500">Chọn tệp PDF hoặc Hình Ảnh</p>
                                        <p className="text-xs text-gray-400">(Bản scan hoặc ảnh chụp kết quả)</p>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3 flex-shrink-0">
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
                    >
                        Hủy
                    </button>
                    {showReview ? (
                        <button
                            onClick={handleFinalSave}
                            disabled={isUploading}
                            className="flex items-center gap-2 bg-green-600 text-white px-8 py-2 rounded-lg hover:bg-green-700 transition font-bold shadow-md shadow-green-200 disabled:opacity-50"
                        >
                            {isUploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus}</>
                            ) : (
                                <>Xác nhận & Hoàn thành</>
                            )}
                        </button>
                    ) : (
                        <button
                            onClick={handleReport}
                            disabled={isUploading || !mainFile}
                            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-md shadow-blue-200 disabled:opacity-50"
                        >
                            {isUploading ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> {uploadStatus}</>
                            ) : (
                                <>Gửi báo cáo</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
