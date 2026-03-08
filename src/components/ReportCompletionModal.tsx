import React, { useState } from 'react';
import { X, Upload, FileText, Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { db, storage, auth, appFunctions } from '../firebase/config';
import { doc, updateDoc, collection, setDoc } from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

interface ReportCompletionModalProps {
    isOpen: boolean;
    onClose: () => void;
    taskId: string;
    taskTitle: string;
    onSuccess: () => void;
}

export const ReportCompletionModal: React.FC<ReportCompletionModalProps> = ({
    isOpen,
    onClose,
    taskId,
    taskTitle,
    onSuccess
}) => {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadStatus, setUploadStatus] = useState('');
    const { user } = useAuthStore();

    if (!isOpen) return null;

    const fileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64String = reader.result as string;
                const base64Data = base64String.split(',')[1];
                resolve(base64Data);
            };
            reader.onerror = (error) => reject(error);
        });
    };

    const handleUpload = async () => {
        if (!mainFile || !user) {
            toast.error('Vui lòng chọn tệp báo cáo.');
            return;
        }

        setIsUploading(true);
        setUploadStatus('Đang chuẩn bị tệp...');

        try {
            const base64Data = await fileToBase64(mainFile);

            setUploadStatus('AI Gemini đang đọc văn bản và xử lý tệp...');
            const processOCR = httpsCallable(appFunctions, 'processDocumentOCR');

            const response: any = await processOCR({
                base64Data,
                fileName: mainFile.name,
                mimeType: mainFile.type,
                context: 'report_completion'
            });

            if (!response.data.success) {
                throw new Error(response.data.message || 'Lỗi khi xử lý OCR');
            }

            const ocrData = response.data.data;
            setUploadStatus('Đang lưu thông tin báo cáo...');

            // Lưu vào Firestore
            const reportId = `REP-${Date.now()}`;
            const reportData = {
                id: reportId,
                taskId,
                taskTitle,
                title: ocrData.trichYeu || `Báo cáo hoàn thành: ${taskTitle}`,
                soKyHieu: ocrData.soKyHieu || '',
                ngayBanHanh: ocrData.ngayBanHanh || format(new Date(), 'yyyy-MM-dd'),
                fileUrl: ocrData.fileUrl,
                driveFileId: ocrData.driveFileId,
                createdBy: user.uid,
                createdByName: user.displayName || user.email,
                createdAt: new Date().toISOString(),
                status: 'completed',
                type: 'report'
            };

            await setDoc(doc(db, 'reports', reportId), reportData);

            // Cập nhật trạng thái Task
            await updateDoc(doc(db, 'tasks', taskId), {
                status: 'completed',
                completedAt: new Date().toISOString(),
                reportId: reportId
            });

            // Ghi log
            await logVanBanActivity({
                docId: taskId,
                action: 'report_completion',
                userId: user.uid,
                userName: user.displayName || user.email || 'Unknown',
                details: `Đã hoàn thành nhiệm vụ: ${taskTitle}. Báo cáo số: ${reportData.soKyHieu}`
            });

            toast.success('Gửi báo cáo hoàn thành thành công!');
            onSuccess();
            onClose();
        } catch (error: any) {
            console.error('Upload report error:', error);
            toast.error('Lỗi khi gửi báo cáo: ' + error.message);
        } finally {
            setIsUploading(false);
            setUploadStatus('');
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                <div className="flex items-center justify-between p-6 border-b">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">Báo cáo hoàn thành</h2>
                        <p className="text-sm text-gray-500 mt-1">{taskTitle}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-gray-700">Tệp báo cáo (PDF/Ảnh)</label>
                        <div className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${mainFile ? 'border-emerald-200 bg-emerald-50' : 'border-gray-200 hover:border-blue-400 bg-gray-50'}`}>
                            <input
                                type="file"
                                accept=".pdf,image/*"
                                onChange={(e) => setMainFile(e.target.files?.[0] || null)}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={isUploading}
                            />
                            <div className="flex flex-col items-center text-center">
                                {mainFile ? (
                                    <>
                                        <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mb-3">
                                            <FileText className="w-6 h-6 text-emerald-600" />
                                        </div>
                                        <p className="text-sm font-medium text-emerald-900">{mainFile.name}</p>
                                        <p className="text-xs text-emerald-600 mt-1">Sẵn sàng để gửi</p>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
                                            <Upload className="w-6 h-6 text-blue-600" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-900">Nhấn để chọn hoặc kéo thả tệp</p>
                                        <p className="text-xs text-gray-500 mt-1">Hỗ trợ PDF, JPG, PNG (Tối đa 20MB)</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {isUploading && (
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-3">
                            <div className="flex items-center gap-3">
                                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                                <span className="text-sm font-medium text-blue-900">{uploadStatus}</span>
                            </div>
                            <div className="h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 animate-progress" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isUploading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                        Hủy
                    </button>
                    <button
                        onClick={handleUpload}
                        disabled={isUploading || !mainFile}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-200 transition-all active:scale-95"
                    >
                        {isUploading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Đang xử lý...
                            </>
                        ) : (
                            <>
                                <Sparkles className="w-4 h-4" />
                                Gửi báo cáo
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
