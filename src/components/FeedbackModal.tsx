import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, MessageSquare, Clock, CheckCircle, AlertCircle, Loader2, Send } from 'lucide-react';
import { useFeedbackStore, FeedbackStatus } from '../store/useFeedbackStore';
import { useAuthStore } from '../store/useAuthStore';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface FeedbackModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
    const { user } = useAuthStore();
    const { submitFeedback, fetchUserFeedbacks, userFeedbacks, loading, error } = useFeedbackStore();
    const [activeTab, setActiveTab] = useState<'SEND' | 'HISTORY'>('SEND');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        if (isOpen && activeTab === 'HISTORY' && user) {
            fetchUserFeedbacks(user.uid);
        }
    }, [isOpen, activeTab, user, fetchUserFeedbacks]);

    // Đóng hoàn toàn, reset cache UI
    const handleClose = () => {
        setContent('');
        setSuccessMessage('');
        setActiveTab('SEND');
        onClose();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !content.trim()) return;

        setIsSubmitting(true);
        setSuccessMessage('');
        try {
            await submitFeedback({
                content: content.trim(),
                uid: user.uid,
                userName: user.displayName || 'Người dùng',
                userEmail: user.email || 'Không có email'
            });
            setSuccessMessage('Cảm ơn bạn đã gửi góp ý! Chúng tôi sẽ xem xét sớm nhất.');
            setContent('');
            // Tự động chuyển sag tab lịch sử sau 2s
            setTimeout(() => {
                setActiveTab('HISTORY');
                setSuccessMessage('');
            }, 2000);
        } catch (err: any) {
            console.error('Lỗi gửi góp ý:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatusInfo = (status: FeedbackStatus) => {
        switch (status) {
            case 'PENDING': return { label: 'Đã tiếp nhận', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Clock };
            case 'IN_PROGRESS': return { label: 'Đang xử lý', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2 };
            case 'RESOLVED': return { label: 'Đã xử lý', color: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle };
            case 'REJECTED': return { label: 'Từ chối / Không khả thi', color: 'bg-gray-50 text-gray-700 border-gray-200', icon: AlertCircle };
            default: return { label: 'Không xác định', color: 'bg-gray-50 text-gray-700 border-gray-200', icon: Clock };
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <div className="bg-blue-100 p-2 rounded-lg">
                            <MessageSquare className="w-5 h-5 text-blue-600" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-800">Góp ý & Báo lỗi</h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 px-6">
                    <button
                        onClick={() => setActiveTab('SEND')}
                        className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${activeTab === 'SEND' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Gửi góp ý
                    </button>
                    <button
                        onClick={() => setActiveTab('HISTORY')}
                        className={`py-3 px-4 font-medium text-sm border-b-2 transition-colors ${activeTab === 'HISTORY' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                    >
                        Lịch sử góp ý
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 bg-gray-50/30">
                    {activeTab === 'SEND' ? (
                        <form onSubmit={handleSubmit} className="flex flex-col h-full">
                            <div className="mb-4 p-3.5 bg-blue-50/50 border border-blue-100/60 rounded-xl text-sm text-blue-800 leading-relaxed">
                                <strong>Admin rất cần các anh chị em phản hồi - góp ý - đề xuất.</strong> Đặc biệt nếu thấy webapp chưa sát thực tế, chưa hợp lý với các trường hợp cụ thể, hoặc còn thiếu công cụ nào hữu ích nào, mong mọi người tích cực góp ý trên cơ sở xây dựng để tốt hơn. <br /><span className="italic mt-1 block opacity-90">Xin cám ơn mọi góp ý quý giá của các anh chị!</span>
                            </div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Nội dung góp ý hoặc mô tả lỗi
                            </label>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="Ví dụ: Trang dự án tải chậm, tôi muốn thêm chức năng xuất Excel ở phần Báo cáo..."
                                className="w-full flex-1 min-h-[150px] p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none outline-none text-gray-700 text-base"
                                required
                            />

                            {error && (
                                <div className="mt-4 p-3 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {successMessage && (
                                <div className="mt-4 p-3 bg-green-50 text-green-700 border border-green-200 rounded-lg text-sm font-medium flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" />
                                    {successMessage}
                                </div>
                            )}

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="px-5 py-2.5 text-gray-600 bg-white border border-gray-300 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                                    disabled={isSubmitting}
                                >
                                    Khép lại
                                </button>
                                <button
                                    type="submit"
                                    disabled={!content.trim() || isSubmitting}
                                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 min-w-[120px]"
                                >
                                    {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Gửi đi
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div className="flex flex-col gap-4">
                            {loading ? (
                                <div className="flex justify-center items-center py-10">
                                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                                </div>
                            ) : userFeedbacks.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">
                                    <MessageSquare className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                                    <p>Bạn chưa gửi góp ý nào.</p>
                                </div>
                            ) : (
                                userFeedbacks.map((fb) => {
                                    const { label, color, icon: StatusIcon } = getStatusInfo(fb.status);
                                    return (
                                        <div key={fb.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs text-gray-500">
                                                    {fb.createdAt?.seconds
                                                        ? format(new Date(fb.createdAt.seconds * 1000), 'HH:mm - dd/MM/yyyy', { locale: vi })
                                                        : 'Gần đây'}
                                                </span>
                                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${color}`}>
                                                    <StatusIcon className="w-3 h-3" />
                                                    {label}
                                                </span>
                                            </div>
                                            <p className="text-gray-800 text-sm whitespace-pre-wrap">{fb.content}</p>

                                            {/* Phản hồi từ Admin */}
                                            {fb.adminNote && (
                                                <div className="mt-3 pt-3 border-t border-gray-100 bg-blue-50/50 -mx-4 -mb-4 px-4 py-3">
                                                    <p className="text-xs font-semibold text-blue-800 mb-1 flex items-center gap-1.5">
                                                        <MessageSquare className="w-3.5 h-3.5" /> Phản hồi từ BQT:
                                                    </p>
                                                    <p className="text-sm text-blue-900 leading-relaxed">{fb.adminNote}</p>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
