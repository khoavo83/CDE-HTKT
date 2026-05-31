import { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, appFunctions } from '../firebase/config';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, ChevronDown, ChevronUp, Zap, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

interface SyncLog {
    id: string;
    startedAt: string;
    completedAt: string;
    trigger: 'scheduled' | 'manual' | 'retry';
    status: 'completed' | 'partial' | 'failed' | 'skipped';
    stats: {
        foldersCreated: number;
        foldersRenamed: number;
        foldersSkipped: number;
        foldersRecreated: number;
        shortcutsCreated: number;
        shortcutsSkipped: number;
        errors: number;
    };
    details: string[];
    errorDetails: string[];
}

export function SyncDashboard() {
    const [logs, setLogs] = useState<SyncLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'sync_logs'),
            orderBy('startedAt', 'desc'),
            limit(10)
        );
        const unsub = onSnapshot(q, (snap) => {
            const list: SyncLog[] = snap.docs.map(d => ({ id: d.id, ...d.data() } as SyncLog));
            setLogs(list);
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleManualSync = async () => {
        if (syncing) return;
        setSyncing(true);
        const toastId = toast.loading('Đang đồng bộ Drive (Delta Sync)... Có thể mất vài phút.');
        try {
            const fn = httpsCallable(appFunctions, 'manualTriggerDriveSync');
            const result: any = await fn();
            toast.dismiss(toastId);
            if (result.data?.status === 'completed') {
                toast.success(`Đồng bộ thành công! ${result.data.stats.foldersCreated} folder, ${result.data.stats.shortcutsCreated} shortcut.`);
            } else if (result.data?.status === 'partial') {
                toast(`Đồng bộ hoàn tất nhưng có ${result.data.stats.errors} lỗi. Kiểm tra chi tiết bên dưới.`, { icon: '⚠️' });
            } else {
                toast.error('Đồng bộ thất bại. Kiểm tra chi tiết bên dưới.');
            }
        } catch (err: any) {
            toast.dismiss(toastId);
            toast.error(`Lỗi: ${err.message}`);
        } finally {
            setSyncing(false);
        }
    };

    const getStatusConfig = (status: string) => {
        switch (status) {
            case 'completed': return { icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Thành công' };
            case 'partial': return { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Có lỗi' };
            case 'failed': return { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Thất bại' };
            case 'skipped': return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', label: 'Bỏ qua' };
            default: return { icon: Clock, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200', label: status };
        }
    };

    const getTriggerLabel = (trigger: string) => {
        switch (trigger) {
            case 'scheduled': return '⏰ Tự động (1:00 AM)';
            case 'manual': return '👤 Thủ công';
            case 'retry': return '🔄 Retry (1:30 AM)';
            default: return trigger;
        }
    };

    const formatDate = (iso: string) => {
        if (!iso) return '--';
        return new Date(iso).toLocaleString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const latestLog = logs[0];
    const latestStatus = latestLog ? getStatusConfig(latestLog.status) : null;

    return (
        <div className="space-y-6 mt-6">
            {/* Header + Nút chạy thủ công */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        Đồng bộ Tự động (Delta Sync)
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        Hệ thống tự động chạy lúc <strong>1:00 AM</strong> mỗi ngày. Chỉ đồng bộ những thay đổi mới.
                    </p>
                </div>
                <button
                    onClick={handleManualSync}
                    disabled={syncing}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md ${
                        syncing
                            ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:shadow-indigo-300'
                    }`}
                >
                    {syncing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    {syncing ? 'Đang đồng bộ...' : 'Chạy ngay'}
                </button>
            </div>

            {/* Trạng thái lần sync gần nhất */}
            {latestLog && latestStatus && (
                <div className={`p-5 rounded-xl border-2 ${latestStatus.border} ${latestStatus.bg}`}>
                    <div className="flex items-center gap-3 mb-3">
                        <latestStatus.icon className={`w-6 h-6 ${latestStatus.color}`} />
                        <div>
                            <p className={`font-bold ${latestStatus.color}`}>{latestStatus.label}</p>
                            <p className="text-xs text-gray-500">{getTriggerLabel(latestLog.trigger)} — {formatDate(latestLog.startedAt)}</p>
                        </div>
                    </div>
                    {latestLog.stats && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                            <div className="bg-white/80 rounded-lg p-3 text-center">
                                <p className="text-xl font-bold text-emerald-600">{latestLog.stats.foldersCreated}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-bold">Folder mới</p>
                            </div>
                            <div className="bg-white/80 rounded-lg p-3 text-center">
                                <p className="text-xl font-bold text-blue-600">{latestLog.stats.foldersRenamed}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-bold">Đổi tên</p>
                            </div>
                            <div className="bg-white/80 rounded-lg p-3 text-center">
                                <p className="text-xl font-bold text-indigo-600">{latestLog.stats.shortcutsCreated}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-bold">Shortcut</p>
                            </div>
                            <div className="bg-white/80 rounded-lg p-3 text-center">
                                <p className={`text-xl font-bold ${latestLog.stats.errors > 0 ? 'text-red-600' : 'text-gray-400'}`}>{latestLog.stats.errors}</p>
                                <p className="text-[10px] text-gray-500 uppercase font-bold">Lỗi</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Lịch sử Sync */}
            <div>
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Lịch sử Đồng bộ (10 lần gần nhất)
                </h4>

                {loading ? (
                    <div className="flex justify-center p-8">
                        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                    </div>
                ) : logs.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                        <RefreshCw className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm font-bold">Chưa có lịch sử đồng bộ nào.</p>
                        <p className="text-xs mt-1">Nhấn "Chạy ngay" hoặc chờ lịch tự động 1:00 AM.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {logs.map(log => {
                            const cfg = getStatusConfig(log.status);
                            const isExpanded = expandedLogId === log.id;
                            return (
                                <div key={log.id} className={`border rounded-xl overflow-hidden transition-all ${cfg.border}`}>
                                    <button
                                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                                        className={`w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <cfg.icon className={`w-5 h-5 ${cfg.color} shrink-0`} />
                                            <div>
                                                <p className="text-sm font-bold text-gray-700">
                                                    {cfg.label}
                                                    <span className="ml-2 text-xs font-normal text-gray-400">{getTriggerLabel(log.trigger)}</span>
                                                </p>
                                                <p className="text-xs text-gray-400">{formatDate(log.startedAt)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            {log.stats && (
                                                <div className="hidden sm:flex items-center gap-3 text-xs text-gray-500">
                                                    <span className="text-emerald-600 font-bold">+{log.stats.foldersCreated}F</span>
                                                    <span className="text-indigo-600 font-bold">+{log.stats.shortcutsCreated}S</span>
                                                    {log.stats.errors > 0 && (
                                                        <span className="text-red-600 font-bold">⚠{log.stats.errors}</span>
                                                    )}
                                                </div>
                                            )}
                                            {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                                        </div>
                                    </button>

                                    {isExpanded && (
                                        <div className="px-4 pb-4 border-t border-gray-100">
                                            {/* Error details */}
                                            {log.errorDetails && log.errorDetails.length > 0 && (
                                                <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
                                                    <p className="text-xs font-bold text-red-600 mb-2">Lỗi ({log.errorDetails.length}):</p>
                                                    <div className="max-h-32 overflow-y-auto space-y-1">
                                                        {log.errorDetails.map((err, i) => (
                                                            <p key={i} className="text-xs text-red-700 font-mono">{err}</p>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            {/* Detail logs */}
                                            {log.details && log.details.length > 0 && (
                                                <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                                    <p className="text-xs font-bold text-gray-500 mb-2">Chi tiết ({log.details.length} dòng):</p>
                                                    <div className="max-h-48 overflow-y-auto space-y-0.5 font-mono">
                                                        {log.details.map((line, i) => (
                                                            <p key={i} className={`text-[11px] ${
                                                                line.startsWith('[+]') ? 'text-emerald-700' :
                                                                line.startsWith('[~]') ? 'text-blue-700' :
                                                                line.startsWith('[!]') ? 'text-red-700' :
                                                                line.startsWith('[DELTA]') || line.startsWith('[FULL]') ? 'text-indigo-700 font-bold' :
                                                                line.startsWith('---') || line.startsWith('===') ? 'text-gray-800 font-bold' :
                                                                'text-gray-600'
                                                            }`}>{line}</p>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
