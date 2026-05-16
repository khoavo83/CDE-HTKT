import React from 'react';
import { X, FileText, ExternalLink, Paperclip, Edit } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDocIconConfig, getDocFormattedTitle } from '../utils/docUtils';

interface DocumentPreviewModalProps {
    doc: any;
    onClose: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ doc: previewDoc, onClose }) => {
    if (!previewDoc) return null;

    const { Icon, bg, color } = getDocIconConfig(previewDoc);
    const previewUrl = previewDoc.storageUrl || null;
    const drivePreviewUrl = previewDoc.driveFileId_Original
        ? `https://drive.google.com/file/d/${previewDoc.driveFileId_Original}/preview`
        : null;

    // Gom cả attachments và dinhKem thành 1 danh sách
    const allAttachments = [
        ...(previewDoc.attachments || []),
        ...(previewDoc.dinhKem || []),
    ];

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-none md:rounded-2xl shadow-2xl w-full md:max-w-6xl h-full md:h-[92vh] md:mx-4 flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
                    <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}>
                            <Icon className="w-5 h-5" />
                        </span>
                        <div className="min-w-0">
                            <h3 className="font-bold text-gray-900 truncate text-sm leading-tight" title={getDocFormattedTitle(previewDoc)}>
                                {getDocFormattedTitle(previewDoc)}
                            </h3>
                            <p className="text-[10px] text-gray-500 truncate mt-0.5">
                                {previewDoc.coQuanBanHanh}{previewDoc.ngayBanHanh ? ` • ${previewDoc.ngayBanHanh}` : ''}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-4">
                        {previewDoc.storageUrl ? (
                            <a href={previewDoc.storageUrl} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                                <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                            </a>
                        ) : previewDoc.driveFileId_Original ? (
                            <a href={`https://drive.google.com/file/d/${previewDoc.driveFileId_Original}/view`} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                                <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                            </a>
                        ) : null}
                        <Link to={`/documents/${previewDoc.id}`}
                            className="flex items-center gap-1.5 text-sm text-indigo-600 border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors font-medium">
                            <Edit className="w-3.5 h-3.5" /> Chỉnh sửa
                        </Link>
                        <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg transition-colors ml-1">
                            <X className="w-5 h-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Left: Metadata - hidden on mobile */}
                    <div className="hidden md:block w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-5 space-y-4 bg-white">
                        {[
                            { label: 'Loại Văn bản', value: previewDoc.loaiVanBan },
                            { label: 'Số Ký hiệu', value: previewDoc.soKyHieu },
                            { label: 'Ngày ban hành', value: previewDoc.ngayBanHanh },
                            { label: 'Cơ quan BH', value: previewDoc.coQuanBanHanh },
                            { label: 'Người ký', value: previewDoc.nguoiKy },
                            { label: 'Số trang', value: previewDoc.soTrang },
                        ].map(({ label, value }) => value ? (
                            <div key={label}>
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                                <p className="text-sm text-gray-800 font-medium">{value}</p>
                            </div>
                        ) : null)}
                        {previewDoc.trichYeu && (
                            <div className="pt-3 border-t border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Trích yếu</p>
                                <p className="text-sm text-gray-700 leading-relaxed">{previewDoc.trichYeu}</p>
                            </div>
                        )}

                        {/* Tệp đính kèm (Attachments + dinhKem) */}
                        {allAttachments.length > 0 && (
                            <div className="pt-4 border-t border-gray-100">
                                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                                    <Paperclip className="w-3 h-3 text-gray-500" /> Tệp đính kèm ({allAttachments.length})
                                </p>
                                <div className="space-y-2">
                                    {allAttachments.map((file: any, idx: number) => {
                                        const fileUrl = file.webViewLink || file.storageUrl;
                                        const fileName = file.originalName || file.fileName || file.name || 'Tệp đính kèm';
                                        return fileUrl ? (
                                            <a
                                                key={file.id || file.driveFileId || `att-${idx}`}
                                                href={fileUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100 hover:bg-blue-50 hover:border-blue-200 hover:shadow-sm transition-all group"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 group-hover:border-blue-100 shadow-sm">
                                                    <FileText className="w-4 h-4 text-blue-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] text-gray-700 font-bold truncate group-hover:text-blue-700" title={fileName}>
                                                        {fileName}
                                                    </p>
                                                    {file.fileSize && (
                                                        <p className="text-[9px] text-gray-400 mt-0.5">{(file.fileSize / 1024).toFixed(0)} KB</p>
                                                    )}
                                                </div>
                                                <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-blue-400 shrink-0" />
                                            </a>
                                        ) : (
                                            <div
                                                key={`dk-${idx}`}
                                                className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100"
                                            >
                                                <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0 shadow-sm">
                                                    <FileText className="w-4 h-4 text-gray-400" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-[11px] text-gray-600 font-bold truncate" title={fileName}>
                                                        {fileName}
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                    </div>

                    {/* Right: Preview */}
                    <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
                        {previewUrl ? (
                            previewDoc.fileNameOriginal?.toLowerCase().endsWith('.pdf')
                                ? <iframe src={previewUrl} className="flex-1 border-none w-full h-full" title="PDF Preview" />
                                : <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                                    <img src={previewUrl} alt="Xem trước" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
                                </div>
                        ) : drivePreviewUrl ? (
                            <iframe src={drivePreviewUrl} className="w-full h-full flex-1 border-none" allow="autoplay" title="Drive Preview" />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
                                <FileText className="w-16 h-16 text-gray-300" />
                                <div className="text-center">
                                    <p className="font-semibold text-gray-700">{previewDoc.fileNameOriginal || 'Không rõ tên file'}</p>
                                    <p className="text-sm text-gray-400 mt-1">Văn bản này chưa có tệp đính kèm để xem trước</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
