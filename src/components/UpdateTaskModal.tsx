import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Loader2, X, CheckSquare, Clock, Save } from 'lucide-react';
import toast from 'react-hot-toast';

interface UpdateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: any;
    onSuccess: () => void;
}

export const UpdateTaskModal: React.FC<UpdateTaskModalProps> = ({ isOpen, onClose, task, onSuccess }) => {
    const [status, setStatus] = useState(task?.status || 'PENDING');
    const [result, setResult] = useState(task?.result || '');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen || !task) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (status === 'COMPLETED' && !result.trim()) {
            toast.error("Vui lòng nhập kết quả xử lý trước khi đóng việc.");
            return;
        }

        setIsSubmitting(true);
        try {
            const taskRef = doc(db, 'vanban_tasks', task.id);
            const updates: any = { status, result: result.trim() };

            if (status === 'COMPLETED' && task.status !== 'COMPLETED') {
                updates.completedAt = new Date().toISOString();
            }

            await updateDoc(taskRef, updates);
            toast.success("Đã cập nhật tiến độ thành công!");
            onSuccess();
            onClose();
        } catch (error) {
            console.error("Lỗi khi cập nhật task: ", error);
            toast.error("Lỗi khi cập nhật tiến độ.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4 fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg transform transition-all scale-100 flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <CheckSquare className="w-5 h-5 text-green-600" />
                        Báo cáo Tiến độ Xử lý
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                        disabled={isSubmitting}
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto">
                    <div className="bg-blue-50 text-blue-800 p-4 rounded-lg mb-6 border border-blue-100">
                        <p className="text-sm font-semibold mb-1">Nội dung yêu cầu từ {task.assignerName}:</p>
                        <p className="text-sm italic">{task.content}</p>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                Trạng thái xử lý <span className="text-red-500">*</span>
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'PENDING' ? 'bg-gray-50 border-gray-400 ring-1 ring-gray-400' : 'hover:bg-gray-50'}`}>
                                    <input type="radio" className="sr-only" name="status" value="PENDING" checked={status === 'PENDING'} onChange={(e) => setStatus(e.target.value)} />
                                    <span className="text-xs font-medium text-gray-500">Chờ xử lý</span>
                                </label>
                                <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'IN_PROGRESS' ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'hover:bg-blue-50'}`}>
                                    <input type="radio" className="sr-only" name="status" value="IN_PROGRESS" checked={status === 'IN_PROGRESS'} onChange={(e) => setStatus(e.target.value)} />
                                    <span className="text-xs font-medium text-blue-700 flex items-center gap-1"><Clock className="w-3 h-3" /> Đang xử lý</span>
                                </label>
                                <label className={`flex flex-col items-center justify-center p-3 border rounded-lg cursor-pointer transition-colors ${status === 'COMPLETED' ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'hover:bg-green-50'}`}>
                                    <input type="radio" className="sr-only" name="status" value="COMPLETED" checked={status === 'COMPLETED'} onChange={(e) => setStatus(e.target.value)} />
                                    <span className="text-xs font-medium text-green-700">Hoàn thành</span>
                                </label>
                            </div>
                        </div>

                        {status === 'COMPLETED' && (
                            <div className="animate-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Kết quả xử lý <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    className="w-full px-3 py-2 border border-green-300 bg-green-50/30 rounded-md focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none transition-shadow min-h-[120px] resize-y"
                                    placeholder="Ghi rõ kết quả để báo cáo lại người giao việc..."
                                    value={result}
                                    onChange={(e) => setResult(e.target.value)}
                                    disabled={isSubmitting}
                                    required={status === 'COMPLETED'}
                                />
                            </div>
                        )}

                        {status === 'IN_PROGRESS' && (
                            <div className="animate-in slide-in-from-top-2 duration-300">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Cập nhật tiến độ (Tùy chọn)
                                </label>
                                <textarea
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow min-h-[80px] resize-y"
                                    placeholder="Bạn đang làm gì với văn bản này? (Có thể để trống nếu chưa có kết quả)"
                                    value={result}
                                    onChange={(e) => setResult(e.target.value)}
                                    disabled={isSubmitting}
                                />
                            </div>
                        )}
                    </div>

                    <div className="mt-8 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                            disabled={isSubmitting}
                        >
                            Hủy
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                            Lưu Cập Nhật
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
