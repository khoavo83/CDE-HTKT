import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { X, Search, FileText, Link as LinkIcon, AlertCircle } from 'lucide-react';
import { isoToVN } from '../utils/formatVN';

export interface VanBanItem {
    id: string;
    loaiVanBan: string;
    soKyHieu: string;
    trichYeu: string;
    ngayBanHanh: string;
    coQuanBanHanh: string;
    nguoiKy?: string;
    kyHieuLuuTru?: string;
    phanLoaiVanBan: 'INCOMING' | 'OUTGOING';
    dinhKem?: any[];
}

interface DocAttachmentSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAttach: (docId: string, docData: VanBanItem) => void;
}

export const DocAttachmentSelectorModal: React.FC<DocAttachmentSelectorModalProps> = ({ isOpen, onClose, onAttach }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [allDocs, setAllDocs] = useState<VanBanItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!isOpen) return;

        const q = query(collection(db, 'vanban'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VanBanItem));
            setAllDocs(docsData);
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [isOpen]);

    const filteredDocs = useMemo(() => {
        if (!searchTerm.trim()) return allDocs;
        const lowerTerm = searchTerm.toLowerCase();
        return allDocs.filter(doc =>
            (doc.soKyHieu && doc.soKyHieu.toLowerCase().includes(lowerTerm)) ||
            (doc.trichYeu && doc.trichYeu.toLowerCase().includes(lowerTerm)) ||
            (doc.coQuanBanHanh && doc.coQuanBanHanh.toLowerCase().includes(lowerTerm)) ||
            (doc.loaiVanBan && doc.loaiVanBan.toLowerCase().includes(lowerTerm))
        );
    }, [allDocs, searchTerm]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col transform transition-all scale-100">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0 bg-gray-50/80">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <LinkIcon className="w-5 h-5 text-blue-600" /> Chọn Văn bản Đính kèm
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                            Tìm kiếm và chọn một văn bản từ CSDL để đính kèm vào công việc.
                        </p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Search Bar */}
                <div className="px-6 py-4 border-b border-gray-100 shrink-0 bg-white shadow-sm z-10">
                    <div className="relative">
                        <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                            type="text"
                            placeholder="Tìm kiếm theo Số ký hiệu, Loại văn bản, Cơ quan ban hành hoặc Trích yếu..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                            autoFocus
                        />
                    </div>
                </div>

                {/* Body Content */}
                <div className="p-4 overflow-y-auto bg-gray-50/50 flex-1 scrollbar-thin scrollbar-thumb-gray-300">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                            <p>Đang tải danh sách văn bản...</p>
                        </div>
                    ) : filteredDocs.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3">
                            {filteredDocs.map(d => (
                                <div key={d.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 group">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                            <span className={`px-2 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-md ${d.phanLoaiVanBan === 'INCOMING' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                }`}>
                                                {d.phanLoaiVanBan === 'INCOMING' ? 'Đến' : 'Đi'}
                                            </span>
                                            {d.loaiVanBan && (
                                                <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded shadow-sm">
                                                    {d.loaiVanBan}
                                                </span>
                                            )}
                                            {d.soKyHieu && (
                                                <span className="font-bold text-gray-900 border-l-2 border-gray-300 pl-2">
                                                    {d.soKyHieu}
                                                </span>
                                            )}
                                            {d.ngayBanHanh && (
                                                <span className="text-xs text-gray-500 font-medium">
                                                    • {isoToVN(d.ngayBanHanh)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-700 leading-relaxed font-medium line-clamp-2 mb-1" title={d.trichYeu}>
                                            {d.trichYeu || 'Không có trích yếu'}
                                        </p>
                                        <div className="flex items-center gap-4 mt-1">
                                            {d.coQuanBanHanh && (
                                                <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded border border-gray-100">
                                                    🏛️ {d.coQuanBanHanh}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => onAttach(d.id, d)}
                                        className="shrink-0 w-full sm:w-auto px-4 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center justify-center gap-2 hover:bg-blue-600 hover:text-white hover:border-blue-600"
                                    >
                                        <LinkIcon className="w-4 h-4" />
                                        Chọn Văn bản
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 border border-gray-200">
                                <AlertCircle className="w-8 h-8 text-gray-400" />
                            </div>
                            <h4 className="text-lg font-bold text-gray-900 mb-1">Không tìm thấy kết quả</h4>
                            <p className="text-sm text-gray-500 max-w-sm">
                                Không có văn bản nào khớp với từ khóa "{searchTerm}". Vui lòng thử lại với từ khóa khác.
                            </p>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="mt-4 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg shadow-sm hover:bg-gray-50 font-medium text-sm transition-colors"
                                >
                                    Xóa bộ lọc
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer Status */}
                {!isLoading && filteredDocs.length > 0 && (
                    <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex items-center justify-between">
                        <span className="text-xs font-medium text-gray-500">
                            Hiển thị {filteredDocs.length} kết quả {searchTerm ? '(Đã lọc)' : ''}
                        </span>
                        <div className="flex gap-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Đến</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Đi</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
