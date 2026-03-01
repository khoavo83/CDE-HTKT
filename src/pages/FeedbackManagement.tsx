import React, { useEffect, useState } from 'react';
import { useFeedbackStore, FeedbackStatus } from '../store/useFeedbackStore';
import { useAuthStore } from '../store/useAuthStore';
import { MessageSquare, Search, Filter, Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

export const FeedbackManagement: React.FC = () => {
    const { user } = useAuthStore();
    const { feedbacks, fetchAllFeedbacks, updateFeedbackStatus, loading } = useFeedbackStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [filterStatus, setFilterStatus] = useState<FeedbackStatus | 'ALL'>('ALL');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [editNoteId, setEditNoteId] = useState<string | null>(null);
    const [tempNote, setTempNote] = useState('');

    useEffect(() => {
        if (user?.role === 'admin') {
            fetchAllFeedbacks();
        }
    }, [user, fetchAllFeedbacks]);

    if (user?.role !== 'admin') {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[60vh]">
                <AlertCircle className="w-16 h-16 text-red-400 mb-4" />
                <h2 className="text-xl font-bold text-gray-800">Truy cập bị từ chối</h2>
                <p className="text-gray-500 mt-2">Bạn không có quyền truy cập trang Quản lý Góp ý.</p>
            </div>
        );
    }

    const filteredFeedbacks = feedbacks.filter(fb => {
        const matchesSearch =
            fb.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
            fb.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            fb.userEmail.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = filterStatus === 'ALL' || fb.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const handleStatusChange = async (id: string, newStatus: FeedbackStatus) => {
        setUpdatingId(id);
        try {
            await updateFeedbackStatus(id, newStatus);
        } catch (error) {
            console.error(error);
        } finally {
            setUpdatingId(null);
        }
    };

    const handleSaveNote = async (id: string, currentStatus: FeedbackStatus) => {
        setUpdatingId(id);
        try {
            await updateFeedbackStatus(id, currentStatus, tempNote);
            setEditNoteId(null);
            setTempNote('');
        } catch (error) {
            console.error(error);
        } finally {
            setUpdatingId(null);
        }
    };

    const StatusBadge = ({ status }: { status: FeedbackStatus }) => {
        switch (status) {
            case 'PENDING': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700 border border-yellow-200"><Clock className="w-3 h-3" /> Chờ xử lý</span>;
            case 'IN_PROGRESS': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200"><Loader2 className="w-3 h-3 animate-spin" /> Đang xử lý</span>;
            case 'RESOLVED': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3" /> Đã xử lý</span>;
            case 'REJECTED': return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200"><AlertCircle className="w-3 h-3" /> Từ chối</span>;
            default: return null;
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <MessageSquare className="w-6 h-6 text-blue-600" />
                        Quản lý Góp ý & Báo lỗi
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Duyệt và phản hồi lại các ý kiến đóng góp từ người dùng ({feedbacks.length})</p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Tìm nội dung, tên, email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                        />
                    </div>
                    <div className="relative">
                        <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as FeedbackStatus | 'ALL')}
                            className="pl-9 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                        >
                            <option value="ALL">Tất cả trạng thái</option>
                            <option value="PENDING">Chờ xử lý</option>
                            <option value="IN_PROGRESS">Đang xử lý</option>
                            <option value="RESOLVED">Đã xử lý</option>
                            <option value="REJECTED">Từ chối</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto min-h-[400px]">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                            <tr>
                                <th className="px-6 py-4 rounded-tl-2xl">Thời gian</th>
                                <th className="px-6 py-4">Người gửi</th>
                                <th className="px-6 py-4">Nội dung</th>
                                <th className="px-6 py-4">Trạng thái</th>
                                <th className="px-6 py-4 rounded-tr-2xl w-64">Phản hồi (Admin Note)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {loading && feedbacks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center">
                                        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                                        <p className="text-gray-500 mt-2">Đang tải dữ liệu...</p>
                                    </td>
                                </tr>
                            ) : filteredFeedbacks.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-gray-500">
                                        Không tìm thấy góp ý nào phù hợp.
                                    </td>
                                </tr>
                            ) : (
                                filteredFeedbacks.map((fb) => (
                                    <tr key={fb.id} className="hover:bg-gray-50/50 transition-colors group">
                                        <td className="px-6 py-4 text-gray-500 w-32 whitespace-nowrap">
                                            {format(new Date(fb.createdAt.seconds * 1000), 'HH:mm dd/MM/y', { locale: vi })}
                                        </td>
                                        <td className="px-6 py-4 w-48 whitespace-nowrap">
                                            <div className="font-medium text-gray-800">{fb.userName}</div>
                                            <div className="text-xs text-gray-500">{fb.userEmail}</div>
                                        </td>
                                        <td className="px-6 py-4 min-w-[300px] whitespace-normal">
                                            <p className="text-gray-700 line-clamp-3 group-hover:line-clamp-none transition-all" title={fb.content}>
                                                {fb.content}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4 w-40 whitespace-nowrap">
                                            <div className="flex flex-col gap-2">
                                                <StatusBadge status={fb.status} />
                                                <select
                                                    value={fb.status}
                                                    onChange={(e) => handleStatusChange(fb.id, e.target.value as FeedbackStatus)}
                                                    disabled={updatingId === fb.id}
                                                    className="px-2 py-1 text-xs border border-gray-200 rounded bg-white text-gray-600 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 cursor-pointer"
                                                >
                                                    <option value="PENDING">🔄 Đổi sang Chờ</option>
                                                    <option value="IN_PROGRESS">⚙️ Đổi sang Đang xử lý</option>
                                                    <option value="RESOLVED">✅ Đổi sang Hoàn thành</option>
                                                    <option value="REJECTED">❌ Đổi sang Từ chối</option>
                                                </select>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 min-w-[250px] whitespace-normal">
                                            {editNoteId === fb.id ? (
                                                <div className="flex flex-col gap-2">
                                                    <textarea
                                                        value={tempNote}
                                                        onChange={(e) => setTempNote(e.target.value)}
                                                        placeholder="Nhập ghi chú gửi cho người dùng..."
                                                        className="w-full text-xs p-2 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 bg-blue-50 resize-none h-16"
                                                    />
                                                    <div className="flex gap-2 justify-end">
                                                        <button
                                                            onClick={() => setEditNoteId(null)}
                                                            className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700"
                                                        >Hủy</button>
                                                        <button
                                                            onClick={() => handleSaveNote(fb.id, fb.status)}
                                                            disabled={updatingId === fb.id}
                                                            className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                                        >Lưu</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div
                                                    onClick={() => {
                                                        setEditNoteId(fb.id);
                                                        setTempNote(fb.adminNote || '');
                                                    }}
                                                    className={`cursor-text min-h-[40px] p-2 rounded border border-transparent hover:border-gray-200 hover:bg-white text-xs ${fb.adminNote ? 'text-blue-700 bg-blue-50/50' : 'text-gray-400 italic'}`}
                                                    title="Click để ghi chú"
                                                >
                                                    {fb.adminNote || 'Chưa có phản hồi (Click để thêm)'}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
