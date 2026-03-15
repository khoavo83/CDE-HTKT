import { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, deleteDoc } from 'firebase/firestore';
import { db, appFunctions } from '../firebase/config';
import { Trash, RefreshCw, Trash2, Search, Filter, AlertCircle } from 'lucide-react';
import { isoToVN } from '../utils/formatVN';
import { restoreFromTrash } from '../utils/trashUtils';
import { httpsCallable } from 'firebase/functions';
import toast from 'react-hot-toast';

interface TrashItem {
    id: string; // Original ID is the document ID in trash
    originalCollection: string;
    originalId: string;
    data: any;
    deletedBy: string;
    deletedAt: string;
    deleteReason: string;
    metaSummary: string;
}

export const TrashManagement = () => {
    const [trashItems, setTrashItems] = useState<TrashItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCollection, setFilterCollection] = useState('all');

    useEffect(() => {
        const q = query(collection(db, 'trash'), orderBy('deletedAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as TrashItem));
            setTrashItems(items);
            setLoading(false);
        }, (error) => {
            console.error('Lỗi tải thùng rác:', error);
            toast.error('Không thể tải dữ liệu thùng rác');
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const [confirmAction, setConfirmAction] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'danger' | 'warning' | 'info';
    } | null>(null);

    const handleRestore = async (item: TrashItem) => {
        setConfirmAction({
            title: 'Khôi phục dữ liệu',
            message: `Bạn có chắc muốn khôi phục dữ liệu: "${item.metaSummary}"?`,
            type: 'info',
            onConfirm: async () => {
                const toastId = toast.loading('Đang khôi phục...');
                setConfirmAction(null);
                try {
                    await restoreFromTrash(item);
                    toast.success('Đã khôi phục thành công', { id: toastId });
                } catch (error) {
                    toast.error('Lỗi khi khôi phục: ' + (error as Error).message, { id: toastId });
                }
            }
        });
    };

    const handlePermanentlyDelete = async (item: TrashItem) => {
        setConfirmAction({
            title: 'XÓA VĨNH VIỄN',
            message: `HÀNH ĐỘNG NGUY HIỂM: Bạn có chắc chắn muốn xóa VĨNH VIỄN dữ liệu này?\n\n"${item.metaSummary}"\n\nKhông thể phục hồi sau khi xóa!`,
            type: 'danger',
            onConfirm: async () => {
                const toastId = toast.loading('Đang dọn dẹp dữ liệu trên Drive và xóa vĩnh viễn...');
                setConfirmAction(null);
                try {
                    // Nếu là Văn bản, sử dụng Deep Delete Cloud Function
                    if (item.originalCollection === 'vanban' || item.originalCollection === 'internal_documents') {
                        const permanentlyDeleteDocument = httpsCallable(appFunctions, 'permanentlyDeleteDocument');
                        await permanentlyDeleteDocument({ docId: item.id, sourceCollection: 'trash' });
                    } else {
                        // Các loại dữ liệu khác vẫn xóa thông thường
                        await deleteDoc(doc(db, 'trash', item.id));
                    }
                    toast.success('Đã dọn dẹp và xóa vĩnh viễn thành công', { id: toastId });
                } catch (error) {
                    console.error('Lỗi khi xóa vĩnh viễn:', error);
                    toast.error('Lỗi khi xóa vĩnh viễn: ' + (error as Error).message, { id: toastId });
                }
            }
        });
    };

    const filteredItems = trashItems.filter(item => {
        const summaryMatch = item.metaSummary ? item.metaSummary.toLowerCase().includes(searchTerm.toLowerCase()) : false;
        const reasonMatch = item.deleteReason ? item.deleteReason.toLowerCase().includes(searchTerm.toLowerCase()) : false;
        const byMatch = item.deletedBy ? item.deletedBy.toLowerCase().includes(searchTerm.toLowerCase()) : false;

        const matchSearch = summaryMatch || reasonMatch || byMatch;
        const matchCol = filterCollection === 'all' || item.originalCollection === filterCollection;
        return matchSearch && matchCol;
    });

    const collections = Array.from(new Set(trashItems.map(i => i.originalCollection)));

    // Mapping collection names to user friendly names
    const colNameMap: Record<string, string> = {
        'internal_documents': 'Văn bản Nội bộ',
        'project_nodes': 'Công việc & Dự án',
        'categories': 'Danh mục',
        'category_tabs': 'Tab Danh mục',
        'menu_config': 'Cấu hình Menu'
    };

    return (
        <div className="p-4 md:p-6 w-full max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                        <Trash className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Thùng rác hệ thống</h1>
                        <p className="text-sm text-gray-500 mt-1">Nơi lưu trữ và phục hồi dữ liệu đã xóa</p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-12rem)]">
                <div className="p-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Tìm kiếm dữ liệu đã xóa..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <select
                                value={filterCollection}
                                onChange={e => setFilterCollection(e.target.value)}
                                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="all">Tất cả loại dữ liệu</option>
                                {collections.map(col => (
                                    <option key={col} value={col}>
                                        {colNameMap[col] || col}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                        Tổng cộng: {filteredItems.length} mục
                    </div>
                </div>

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <div className="p-8 text-center text-gray-500">Đang tải dữ liệu...</div>
                    ) : filteredItems.length === 0 ? (
                        <div className="p-16 flex flex-col items-center justify-center text-gray-400">
                            <Trash className="w-12 h-12 mb-4 text-gray-300" />
                            <p className="text-lg font-medium">Thùng rác trống</p>
                            <p className="text-sm mt-1">Không có dữ liệu nào bị xóa khớp với tìm kiếm.</p>
                        </div>
                    ) : (
                        <>
                            {/* Desktop View Table */}
                            <table className="hidden md:table w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Dữ liệu</th>
                                        <th className="px-4 py-3 font-semibold w-48">Nguồn</th>
                                        <th className="px-4 py-3 font-semibold w-48">Người xóa</th>
                                        <th className="px-4 py-3 font-semibold w-64">Lý do</th>
                                        <th className="px-4 py-3 font-semibold w-40 text-center">Thao tác</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredItems.map(item => (
                                        <tr key={item.id} className="hover:bg-blue-50/30 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-gray-800 break-words whitespace-normal line-clamp-2" title={item.metaSummary}>
                                                    {item.metaSummary}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-1">
                                                    ID: {item.originalId}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                                                    {colNameMap[item.originalCollection] || item.originalCollection}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col">
                                                    <span className="text-gray-900 truncate max-w-[150px]" title={item.deletedBy}>
                                                        {item.deletedBy}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {isoToVN(item.deletedAt)}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-gray-600 italic break-words whitespace-normal line-clamp-2 text-xs" title={item.deleteReason}>
                                                    "{item.deleteReason}"
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleRestore(item)}
                                                        className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                                                        title="Khôi phục"
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handlePermanentlyDelete(item)}
                                                        className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                                                        title="Xóa vĩnh viễn"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Mobile View Card List */}
                            <div className="md:hidden divide-y divide-gray-100">
                                {filteredItems.map(item => (
                                    <div key={item.id} className="p-4 space-y-3 bg-white hover:bg-gray-50 transition-colors">
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-bold text-gray-900 line-clamp-2 leading-tight">
                                                    {item.metaSummary}
                                                </div>
                                                <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
                                                    ID: {item.originalId}
                                                </div>
                                            </div>
                                            <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px] font-bold">
                                                {colNameMap[item.originalCollection] || item.originalCollection}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between text-xs py-2 border-y border-gray-50">
                                            <div className="flex flex-col">
                                                <span className="text-gray-500 text-[10px]">Người xóa</span>
                                                <span className="text-gray-900 font-medium">{item.deletedBy}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-gray-500 text-[10px]">Thời gian xóa</span>
                                                <span className="text-gray-900 font-medium">{isoToVN(item.deletedAt)}</span>
                                            </div>
                                        </div>

                                        {item.deleteReason && (
                                            <div className="bg-red-50/50 p-2 rounded text-xs text-red-700 italic border border-red-50">
                                                "{item.deleteReason}"
                                            </div>
                                        )}

                                        <div className="flex gap-2 pt-1">
                                            <button
                                                onClick={() => handleRestore(item)}
                                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors border border-blue-100"
                                            >
                                                <RefreshCw className="w-3.5 h-3.5" />
                                                Khôi phục
                                            </button>
                                            <button
                                                onClick={() => handlePermanentlyDelete(item)}
                                                className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-50 text-red-700 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors border border-red-100"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                                Xóa vĩnh viễn
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal Xác nhận Tùy chỉnh */}
            {confirmAction && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${confirmAction.type === 'danger' ? 'bg-red-100 text-red-600' :
                                confirmAction.type === 'warning' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                                }`}>
                                <AlertCircle className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                                {confirmAction.title}
                            </h3>
                            <p className="text-center text-sm text-gray-500 mb-6 whitespace-pre-wrap">
                                {confirmAction.message}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setConfirmAction(null)}
                                    className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-bold transition-all"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    onClick={confirmAction.onConfirm}
                                    className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-all shadow-lg ${confirmAction.type === 'danger' ? 'bg-red-600 hover:bg-red-700 shadow-red-100' :
                                        confirmAction.type === 'warning' ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                                        }`}
                                >
                                    Xác nhận
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
