import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { db, appFunctions } from '../firebase/config';
import { HardDrive, RefreshCcw, AlertTriangle, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';

export const DriveStorageStatus = () => {
    const [storageInfo, setStorageInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchStorageInfo = async () => {
        setLoading(true);
        try {
            const getStorageInfoCallable = httpsCallable(appFunctions, 'getDriveStorageInfo');
            const result = await getStorageInfoCallable();
            const data = result.data as any;

            if (data.success) {
                setStorageInfo(data.data);
            } else {
                toast.error(data.message || "Lỗi khi lấy thông tin Drive.");
                setStorageInfo(null);
            }
        } catch (error) {
            console.error("Error fetching drive storage info:", error);
            toast.error("Lỗi khi lấy thông tin Drive: " + (error as Error).message);
            setStorageInfo(null);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        fetchStorageInfo();
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    if (loading && !refreshing) {
        return (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[200px]">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                <p className="text-gray-500 text-sm">Đang tải thông tin bộ nhớ...</p>
            </div>
        );
    }

    if (!storageInfo) return null;

    const usedValue = parseFloat(storageInfo.used);
    const limitValue = parseFloat(storageInfo.limit);
    const percent = Math.min(100, Math.round((usedValue / limitValue) * 100));

    // Status colors
    let statusColor = 'bg-blue-600';
    let bgColor = 'bg-blue-50';
    let textColor = 'text-blue-700';
    let borderColor = 'border-blue-100';

    if (percent > 90) {
        statusColor = 'bg-red-600';
        bgColor = 'bg-red-50';
        textColor = 'text-red-700';
        borderColor = 'border-red-100';
    } else if (percent > 75) {
        statusColor = 'bg-amber-600';
        bgColor = 'bg-amber-50';
        textColor = 'text-amber-700';
        borderColor = 'border-amber-100';
    }

    return (
        <div className={`p-6 rounded-xl shadow-sm border transition-all ${bgColor} ${borderColor}`}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${percent > 90 ? 'bg-red-100' : 'bg-blue-100'}`}>
                        <HardDrive className={`w-5 h-5 ${percent > 90 ? 'text-red-600' : 'text-blue-600'}`} />
                    </div>
                    <div>
                        <h3 className={`font-bold ${textColor}`}>Dung lượng Google Drive</h3>
                        <p className="text-xs opacity-75">Tài khoản Google Cloud lưu trữ Hệ thống</p>
                    </div>
                </div>
                <button
                    onClick={() => { setRefreshing(true); fetchStorageInfo(); }}
                    disabled={refreshing}
                    className={`p-2 hover:bg-white/50 rounded-lg transition-colors ${textColor}`}
                >
                    <RefreshCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-3">
                <div className="flex justify-between text-sm font-medium">
                    <span className={textColor}>Đã dùng {storageInfo.usedFormatted}</span>
                    <span className="text-gray-500">Tổng {storageInfo.limitFormatted}</span>
                </div>

                <div className="h-3 w-full bg-black/5 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-1000 ${statusColor}`}
                        style={{ width: `${percent}%` }}
                    />
                </div>

                <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5">
                        {percent > 90 ? (
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                        ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        )}
                        <span className={`text-xs font-medium ${percent > 90 ? 'text-red-600' : 'text-emerald-700'}`}>
                            {percent > 90 ? 'Bộ nhớ sắp đầy!' : 'Trạng thái lưu trữ tốt'}
                        </span>
                    </div>
                    <span className={`text-xs font-bold ${textColor}`}>{percent}%</span>
                </div>
            </div>

            {percent > 80 && (
                <div className="mt-4 p-3 bg-white/60 rounded-lg border border-black/5">
                    <p className="text-[11px] text-gray-600 leading-relaxed">
                        <span className="font-bold">Lưu ý:</span> Dung lượng Drive sắp hết có thể ảnh hưởng đến việc tải lên tài liệu mới. Vui lòng dọn dẹp hoặc nâng cấp gói lưu trữ Google Cloud.
                    </p>
                </div>
            )}
        </div>
    );
};
