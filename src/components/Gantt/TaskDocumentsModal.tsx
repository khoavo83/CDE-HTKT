import React, { useState, useEffect } from 'react';
import { X, Loader2, FileText } from 'lucide-react';
import { GanttTask } from './types';
import { ganttService } from '../../services/ganttService';
import { DocumentPreviewModal } from '../DocumentPreviewModal';
import { getDocIconConfig, getDocFormattedTitle } from '../../utils/docUtils';

interface TaskDocumentsModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: GanttTask | null;
}

export const TaskDocumentsModal: React.FC<TaskDocumentsModalProps> = ({ isOpen, onClose, task }) => {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [previewDoc, setPreviewDoc] = useState<any | null>(null);

    useEffect(() => {
        const fetchDocs = async () => {
            if (isOpen && task && task.linkedDocumentIds && task.linkedDocumentIds.length > 0) {
                setLoading(true);
                try {
                    const docs = await ganttService.getDocumentsByIds(task.linkedDocumentIds);
                    // Cố gắng sắp xếp theo ngày phát hành nếu có
                    docs.sort((a,b) => {
                        const dateA = a.ngayBanHanh ? new Date(a.ngayBanHanh).getTime() : 0;
                        const dateB = b.ngayBanHanh ? new Date(b.ngayBanHanh).getTime() : 0;
                        return dateB - dateA; // Mới nhất lên đầu
                    });
                    setDocuments(docs);
                } catch (error) {
                    console.error('Error fetching task documents:', error);
                } finally {
                    setLoading(false);
                }
            } else {
                setDocuments([]);
            }
        };
        fetchDocs();
    }, [isOpen, task]);

    if (!isOpen || !task) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-lg font-semibold text-gray-800">
                        Văn bản đính kèm
                    </h2>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 flex-1 overflow-y-auto min-h-[300px]">
                    <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                        <p className="text-sm text-gray-600">Hạng mục công việc:</p>
                        <p className="font-medium text-gray-800">{task.name}</p>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-40 space-y-3">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                            <p className="text-gray-500">Đang tải danh sách tài liệu...</p>
                        </div>
                    ) : documents.length > 0 ? (
                        <div className="space-y-2">
                            {documents.map(doc => {
                                const { Icon, color, bg } = getDocIconConfig(doc);
                                return (
                                    <div
                                        key={doc.id}
                                        onClick={() => setPreviewDoc(doc)}
                                        className="flex items-start gap-3 p-3 border rounded-lg hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors group"
                                    >
                                        <div className={`p-2 rounded-lg ${bg} ${color} flex-shrink-0`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-medium text-gray-900 group-hover:text-blue-700 line-clamp-2">
                                                {getDocFormattedTitle(doc)}
                                            </h4>
                                            {doc.trichYeu && (
                                                <p className="text-sm text-gray-500 line-clamp-1 mt-0.5">
                                                    {doc.trichYeu}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-40 text-gray-500 space-y-2">
                            <FileText className="w-10 h-10 text-gray-300" />
                            <p>Chưa có văn bản nào được đính kèm</p>
                        </div>
                    )}
                </div>
            </div>

            {previewDoc && (
                <DocumentPreviewModal
                    onClose={() => setPreviewDoc(null)}
                    doc={previewDoc}
                />
            )}
        </div>
    );
};
