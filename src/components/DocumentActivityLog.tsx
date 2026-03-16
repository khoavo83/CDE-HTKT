import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { formatDateTime } from '../utils/formatVN';
import { History, User, FileEdit, Plus, Trash2, Sparkles, FolderTree, RotateCcw, UserPlus, CheckCircle2, Clock, FileCheck, XCircle, AlertCircle } from 'lucide-react';

interface LogItem {
    id: string;
    vanBanId: string;
    action: string;
    details: string;
    userId: string;
    userName: string;
    timestamp: any;
}

interface Props {
    vanBanId: string;
}

export const DocumentActivityLog = ({ vanBanId }: Props) => {
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!vanBanId) return;

        setLoading(true);
        setError(null);

        const q = query(
            collection(db, 'vanban_logs'),
            where('vanBanId', '==', vanBanId)
            // Removed orderBy('timestamp', 'desc') to avoid composite index requirement
        );

        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const logItems = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as LogItem));

                // Client-side sorting
                logItems.sort((a, b) => {
                    const timeA = a.timestamp?.seconds || 0;
                    const timeB = b.timestamp?.seconds || 0;
                    return timeB - timeA;
                });

                setLogs(logItems);
                setLoading(false);
            },
            (err) => {
                console.error("Error fetching logs:", err);
                setError("Không thể tải nhật ký hoạt động.");
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [vanBanId]);

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'ADD': return <Plus className="w-3.5 h-3.5 text-green-500" />;
            case 'EDIT': return <FileEdit className="w-3.5 h-3.5 text-blue-500" />;
            case 'DELETE': return <Trash2 className="w-3.5 h-3.5 text-red-500" />;
            case 'AI_RECHECK': return <Sparkles className="w-3.5 h-3.5 text-purple-500" />;
            case 'LINK_STORAGE': return <FolderTree className="w-3.5 h-3.5 text-amber-500" />;
            case 'UNLINK_STORAGE': return <FolderTree className="w-3.5 h-3.5 text-orange-500" />;
            case 'RESTORE': return <RotateCcw className="w-3.5 h-3.5 text-teal-500" />;
            case 'TASK_ASSIGN': return <UserPlus className="w-3.5 h-3.5 text-blue-600" />;
            case 'TASK_ACCEPT': return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />;
            case 'TASK_UPDATE': return <Clock className="w-3.5 h-3.5 text-yellow-600" />;
            case 'TASK_COMPLETE': return <FileCheck className="w-3.5 h-3.5 text-emerald-600" />;
            case 'TASK_DELETE': return <XCircle className="w-3.5 h-3.5 text-red-600" />;
            default: return <History className="w-3.5 h-3.5 text-gray-400" />;
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'ADD': return <span className="text-green-600 font-medium">Thêm mới</span>;
            case 'EDIT': return <span className="text-blue-600 font-medium">Chỉnh sửa</span>;
            case 'DELETE': return <span className="text-red-600 font-medium">Xóa</span>;
            case 'AI_RECHECK': return <span className="text-purple-600 font-medium">AI Rà soát</span>;
            case 'LINK_STORAGE': return <span className="text-amber-600 font-medium">Lưu vào dự án</span>;
            case 'UNLINK_STORAGE': return <span className="text-orange-600 font-medium">Gỡ khỏi dự án</span>;
            case 'RESTORE': return <span className="text-teal-600 font-medium">Khôi phục</span>;
            case 'TASK_ASSIGN': return <span className="text-blue-700 font-medium">Giao việc</span>;
            case 'TASK_ACCEPT': return <span className="text-green-700 font-medium">Nhận việc</span>;
            case 'TASK_UPDATE': return <span className="text-yellow-700 font-medium">Cập nhật tiến độ</span>;
            case 'TASK_COMPLETE': return <span className="text-emerald-700 font-medium">Hoàn thành</span>;
            case 'TASK_DELETE': return <span className="text-red-700 font-medium">Xóa phân công</span>;
            default: return action;
        }
    };

    if (loading) return <div className="p-12 text-center text-gray-500 text-sm italic flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        Đang tải lịch sử...
    </div>;

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-red-600">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm font-medium">{error}</p>
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="bg-white border border-gray-100 rounded-xl p-6 text-center">
                <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Chưa có bản ghi hoạt động nào cho văn bản này.</p>
            </div>
        );
    }

    return (
        <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden">
            <div className="bg-red-50 px-4 py-3 border-b border-red-100 flex items-center gap-2">
                <History className="w-4 h-4 text-red-600" />
                <h3 className="text-sm font-bold text-red-800">Theo dõi trạng thái dữ liệu</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-red-50/50 text-red-500 text-[11px] uppercase tracking-wider">
                        <tr>
                            <th className="px-4 py-2 font-semibold">Thời gian</th>
                            <th className="px-4 py-2 font-semibold">Người thực hiện</th>
                            <th className="px-4 py-2 font-semibold">Hành động</th>
                            <th className="px-4 py-2 font-semibold">Chi tiết</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-red-50/30 transition-colors border-b border-red-50">
                                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                                    {log.timestamp ? formatDateTime(log.timestamp) : '...'}
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200">
                                            <User className="w-3 h-3 text-gray-400" />
                                        </div>
                                        <span className="font-medium text-gray-700">{log.userName || 'Hệ thống'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                        {getActionIcon(log.action)}
                                        {getActionLabel(log.action)}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs italic break-words min-w-[200px]" title={log.details}>
                                    {log.details}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
