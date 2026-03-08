import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { Link } from 'react-router-dom';
import { FolderTree, Folder, FileCheck, Layers, Plus, Edit2, Trash2, ChevronRight, ChevronDown, CheckCircle, Clock, ArrowUp, ArrowDown, FileText, FileImage, FileSpreadsheet, X, Link as LinkIcon, Unlink, ExternalLink, HardDrive, Search, Calendar, Loader2, ArrowUpDown, AlertTriangle, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/useAuthStore';
import { canEditOrDeleteData } from '../utils/authUtils';
import { toast } from 'react-hot-toast';
import { ReportCompletionModal } from '../components/ReportCompletionModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { moveToTrash } from '../utils/trashUtils';
import { isoToVN } from '../utils/formatVN';
import { GenericConfirmModal } from '../components/GenericConfirmModal';


interface ProjectNode {
    id: string;
    name: string;
    type: 'PROJECT' | 'CATEGORY' | 'PACKAGE' | 'FOLDER'; // Added 'FOLDER'
    parentId: string | null;
    description: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: number;
    order?: number;
    driveFolderId?: string;
    driveFolderLink?: string;
    createdBy?: string;
}

interface NodeTreeItem extends ProjectNode {
    children: NodeTreeItem[];
    totalDocCount: number; // Tổng số văn bản bao gồm cả của con cháu
}


// Hàm trả về cấu hình icon dựa vào định dạng file thực tế
const getDocIconConfig = (doc: any): { Icon: React.ElementType; bg: string; color: string } => {
    // Ưu tiên phân loại theo định dạng file thực tế
    const mime = (doc.fileMimeType || '').toLowerCase();
    const name = (doc.standardName || doc.fileNameOriginal || '').toLowerCase();
    const ext = name.split('.').pop() || '';

    // PDF - màu đỏ
    if (mime.includes('pdf') || ext === 'pdf')
        return { Icon: FileCheck, bg: 'bg-red-50', color: 'text-red-600' };
    // Word - màu xanh dương
    if (mime.includes('word') || mime.includes('document') || ext === 'doc' || ext === 'docx')
        return { Icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' };
    // Excel - màu xanh lá
    if (mime.includes('sheet') || mime.includes('excel') || ext === 'xls' || ext === 'xlsx' || ext === 'csv')
        return { Icon: FileSpreadsheet, bg: 'bg-green-50', color: 'text-green-600' };
    // Image - màu tím
    if (mime.includes('image') || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp')
        return { Icon: FileImage, bg: 'bg-purple-50', color: 'text-purple-600' };

    // Fallback: dùng loại văn bản nếu không xác định được định dạng file
    const loai = (doc.loaiVanBan || '').toLowerCase();
    if (loai.includes('quyết định') || loai.includes('qd'))
        return { Icon: FileCheck, bg: 'bg-red-50', color: 'text-red-600' };
    if (loai.includes('nghị quyết'))
        return { Icon: Layers, bg: 'bg-purple-50', color: 'text-purple-600' };
    if (loai.includes('thông báo'))
        return { Icon: FileText, bg: 'bg-orange-50', color: 'text-orange-600' };
    if (loai.includes('hợp đồng'))
        return { Icon: FileCheck, bg: 'bg-green-50', color: 'text-green-700' };
    if (loai.includes('công văn') || loai.includes('cv'))
        return { Icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' };
    if (loai.includes('báo cáo') || loai.includes('bc'))
        return { Icon: FileSpreadsheet, bg: 'bg-teal-50', color: 'text-teal-600' };

    return { Icon: FileText, bg: 'bg-gray-50', color: 'text-gray-500' };
};

export const Projects = () => {
    const [allNodes, setAllNodes] = useState<ProjectNode[]>([]);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [users, setUsers] = useState<any[]>([]);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);


    const { user } = useAuthStore();
    const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';
    const [allDocs, setAllDocs] = useState<any[]>([]);
    const [allLinks, setAllLinks] = useState<any[]>([]);

    // State chặn gửi đính kèm / gỡ dính kềm liên tục
    const [isAttachingId, setIsAttachingId] = useState<string | null>(null);
    const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

    const [isAttachDocModalOpen, setIsAttachDocModalOpen] = useState(false);
    const [attachSearchTerm, setAttachSearchTerm] = useState('');
    const [previewDocId, setPreviewDocId] = useState<string | null>(null);

    // State sắp xếp và gỡ văn bản
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [removeModalOpen, setRemoveModalOpen] = useState(false);
    const [linkToRemove, setLinkToRemove] = useState<string | null>(null);

    // State xác nhận đính kèm
    const [isAttachConfirmModalOpen, setIsAttachConfirmModalOpen] = useState(false);
    const [docToAttach, setDocToAttach] = useState<any | null>(null);

    const previewDoc = previewDocId ? allDocs.find(d => d.id === previewDocId) || null : null;

    const { register, handleSubmit, reset, watch, formState: { } } = useForm<ProjectNode>();
    const watchType = watch('type');

    useEffect(() => {
        const unsubDocs = onSnapshot(query(collection(db, 'vanban')), (snap) => {
            setAllDocs(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        const unsubLinks = onSnapshot(query(collection(db, 'vanban_node_links')), (snap) => {
            setAllLinks(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => { unsubDocs(); unsubLinks(); };
    }, []);

    const unassignedDocs = useMemo(() => {
        const assignedIds = allLinks.map(l => l.vanBanId);
        let docs = allDocs.filter(d => !assignedIds.includes(d.id));

        if (attachSearchTerm) {
            const lowerTerm = attachSearchTerm.toLowerCase();
            docs = docs.filter(d =>
                (d.soKyHieu || '').toLowerCase().includes(lowerTerm) ||
                (d.trichYeu || '').toLowerCase().includes(lowerTerm) ||
                (d.loaiVanBan || '').toLowerCase().includes(lowerTerm)
            );
        }
        return docs;
    }, [allDocs, allLinks, attachSearchTerm]);

    const nodeLinksWithDocs = useMemo(() => {
        if (!selectedNodeId) return [];

        // Lấy danh sách tất cả node con cháu (đệ quy)
        const getAllDescendantIds = (parentId: string): string[] => {
            const children = allNodes.filter(n => n.parentId === parentId);
            let ids = children.map(c => c.id);
            children.forEach(c => {
                ids = [...ids, ...getAllDescendantIds(c.id)];
            });
            return ids;
        };

        const targetNodeIds = [selectedNodeId, ...getAllDescendantIds(selectedNodeId)];

        // Lấy các link của các node trong targetNodeIds
        const relevantLinks = allLinks.filter(l => targetNodeIds.includes(l.nodeId));

        const unsortedDocs = relevantLinks.map(link => {
            const docData = allDocs.find(d => d.id === link.vanBanId);
            return docData ? { ...docData, linkId: link.id } : null;
        }).filter((item): item is any => item !== null);

        return unsortedDocs.sort((a, b) => {
            const dateA = a.ngayBanHanh ? new Date(a.ngayBanHanh).getTime() : 0;
            const dateB = b.ngayBanHanh ? new Date(b.ngayBanHanh).getTime() : 0;
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [selectedNodeId, allDocs, allLinks, allNodes, sortOrder]);

    const findRootProjectId = (nodeId: string): string => {
        let current = allNodes.find(n => n.id === nodeId);
        while (current && current.parentId) {
            const parent = allNodes.find(n => n.id === current?.parentId);
            if (!parent) break;
            current = parent;
        }
        return current?.id || nodeId;
    };

    const handleAttachDoc = async (doc: any) => {
        if (!selectedNodeId || isAttachingId === doc.id) return;
        setDocToAttach(doc);
        setIsAttachConfirmModalOpen(true);
    };

    const executeAttachDoc = async () => {
        if (!docToAttach || !selectedNodeId) return;
        const docId = docToAttach.id;

        setIsAttachingId(docId);
        setIsAttachConfirmModalOpen(false);
        try {
            const attachFn = httpsCallable(functions, 'attachDocumentToNode');

            const result = await attachFn({
                nodeId: selectedNodeId,
                vanBanId: docId,
                projectId: findRootProjectId(selectedNodeId)
            });

            if ((result as any).data?.isDuplicate) {
                toast.error("Văn bản này đã được đính kèm vào nhánh này từ trước!");
            } else {
                toast.success("Đã đính kèm văn bản thành công.");
            }

            setIsAttachDocModalOpen(false);
        } catch (error: any) {
            console.error(error);
            toast.error("Lỗi khi đính kèm văn bản: " + error.message);
        } finally {
            setIsAttachingId(null);
            setDocToAttach(null);
        }
    };

    const handleRemoveDocLink = (linkId: string) => {
        setLinkToRemove(linkId);
        setRemoveModalOpen(true);
    };

    const executeRemoveDocLink = async () => {
        if (!linkToRemove) return;
        setIsRemovingId(linkToRemove);
        setRemoveModalOpen(false); // Đóng modal ngay
        try {
            const removeFn = httpsCallable(functions, 'removeDocumentLink');

            // Xóa qua Cloud Function để xóa trên Drive luôn
            await removeFn({ linkId: linkToRemove });
        } catch (error: any) {
            console.error(error);
            toast.error("Lỗi khi gỡ văn bản: " + error.message);

            // Fallback: Nếu lỗi Drive thì ít nhất xóa DB để UX mượt
            try {
                await deleteDoc(doc(db, "vanban_node_links", linkToRemove));
                toast.success("Đã gỡ liên kết trong cơ sở dữ liệu.");
            } catch (err) {
                console.error("Fallback delete failed:", err);
            }
        } finally {
            setIsRemovingId(null);
            setLinkToRemove(null);
        }
    };

    useEffect(() => {
        const unsubscribeNodes = onSnapshot(collection(db, 'project_nodes'), (snapshot) => {
            const nodesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProjectNode[];
            setAllNodes(nodesData);
        });

        // Lấy danh sách users
        const unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
            const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(usersData);
        });

        return () => {
            unsubscribeNodes();
            unsubscribeUsers();
        };
    }, []);

    // Lọc TASK ra khỏi cây thư mục
    const nonTaskNodes = useMemo(() => allNodes, [allNodes]);

    // State cho Modal Delete (Thùng rác)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<ProjectNode | null>(null);

    // Tính toán lại cây thư mục khi allNodes thay đổi
    const treeData = useMemo(() => {
        const map = new Map<string, NodeTreeItem>();
        const roots: NodeTreeItem[] = [];

        nonTaskNodes.forEach(node => {
            const nodeItem: NodeTreeItem = { ...node, children: [], totalDocCount: 0 };
            map.set(node.id, nodeItem);
        });

        nonTaskNodes.forEach(node => {
            if (node.parentId) {
                const parent = map.get(node.parentId);
                if (parent) {
                    parent.children.push(map.get(node.id)!);
                } else {
                    roots.push(map.get(node.id)!);
                }
            } else {
                roots.push(map.get(node.id)!);
            }
        });

        const buildTreeData = (items: NodeTreeItem[]) => {
            items.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
            items.forEach(item => {
                // Đếm số văn bản đính kèm trực tiếp vào node này (chỉ đếm các file thực sự, không đếm folder nếu có)
                const directDocIds = new Set(allLinks
                    .filter(l => l.nodeId === item.id)
                    .map(l => {
                        const docData = allDocs.find(d => d.id === l.vanBanId);
                        // Chỉ bỏ qua nếu là folder rõ ràng, còn lại đều tính là văn bản
                        if (docData && !docData.fileMimeType?.toLowerCase().includes('folder') && !docData.loaiVanBan?.toLowerCase().includes('thư mục')) {
                            return docData.id;
                        }
                        return null;
                    })
                    .filter(id => id !== null));

                const directDocs = directDocIds.size;

                // Đệ quy tính cho các con
                buildTreeData(item.children);

                // Tổng = trực tiếp + tổng của các con
                const childrenTotal = item.children.reduce((sum, child) => sum + (child.totalDocCount || 0), 0);
                item.totalDocCount = directDocs + childrenTotal;
            });
        };

        buildTreeData(roots);
        return roots;
    }, [nonTaskNodes, allLinks, allDocs]);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'PROJECT': return <FolderTree className="w-4 h-4 text-blue-600" />;
            case 'CATEGORY': return <Folder className="w-4 h-4 text-amber-500" />;
            case 'PACKAGE': return <Layers className="w-4 h-4 text-purple-500" />;
            case 'FOLDER': return <Folder className="w-4 h-4 text-emerald-500" />;
            default: return <Folder className="w-4 h-4 text-gray-500" />;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'PROJECT': return 'Dự án';
            case 'CATEGORY': return 'Hạng mục';
            case 'PACKAGE': return 'Gói thầu';
            case 'FOLDER': return 'Thư mục con';
            default: return 'Khác';
        }
    };

    // Movement Handler
    const handleMoveNode = async (e: React.MouseEvent, targetItem: NodeTreeItem, direction: 'up' | 'down') => {
        e.stopPropagation();

        const siblings = allNodes
            .filter(n => n.parentId === targetItem.parentId)
            .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

        const currentIndex = siblings.findIndex(n => n.id === targetItem.id);
        if (currentIndex === -1) return;

        if (direction === 'up' && currentIndex === 0) return;
        if (direction === 'down' && currentIndex === siblings.length - 1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

        const newSiblings = [...siblings];
        const [movedItem] = newSiblings.splice(currentIndex, 1);
        newSiblings.splice(targetIndex, 0, movedItem);

        const promises = newSiblings.map((node, index) => {
            const newOrder = Date.now() + index * 100;
            return updateDoc(doc(db, 'project_nodes', node.id), { order: newOrder });
        });

        try {
            await Promise.all(promises);
            toast.success('Đã cập nhật thứ tự.');
        } catch (error) {
            console.error('Lỗi di chuyển:', error);
            toast.error('Không thể cập nhật thứ tự mới!');
        }
    };

    const handleAddNode = (e: React.MouseEvent, parentId: string | null = null) => {
        e.stopPropagation();
        setModalMode('add');

        let defaultType = 'PROJECT';
        if (parentId) {
            const parent = allNodes.find(n => n.id === parentId);
            if (parent?.type === 'PROJECT') defaultType = 'CATEGORY';
            else if (parent?.type === 'CATEGORY') defaultType = 'PACKAGE';
            else defaultType = 'FOLDER';

            // Auto expand parent
            setExpandedKeys(prev => new Set(prev).add(parentId));
        }

        reset({
            name: '',
            parentId: parentId,
            type: defaultType as any,
            description: '',
            status: 'ACTIVE',
            startDate: '',
            endDate: '',
        });
        setIsModalOpen(true);
    };

    const handleEditNode = (e: React.MouseEvent, node: ProjectNode) => {
        e.stopPropagation();
        setModalMode('edit');
        setEditingNodeId(node.id);
        reset({
            name: node.name,
            parentId: node.parentId || null,
            type: node.type as any,
            description: node.description || '',
            status: node.status || 'ACTIVE',
            startDate: node.startDate || '',
            endDate: node.endDate || '',
        });
        setIsModalOpen(true);
    };

    const handleDeleteNode = async (e: React.MouseEvent, node: ProjectNode) => {
        e.stopPropagation();
        const children = allNodes.filter(n => n.parentId === node.id);
        if (children.length > 0) {
            toast.error('Không thể xóa mục này vì vẫn còn chứa các mục con bên trong.');
            return;
        }
        setNodeToDelete(node);
        setDeleteModalOpen(true);
    };

    const confirmDeleteNode = async (reason: string) => {
        if (!nodeToDelete) return;
        try {
            await moveToTrash(
                'project_nodes',
                nodeToDelete.id,
                nodeToDelete,
                user?.email || user?.uid || 'unknown',
                reason,
                `Mục dự án/công việc: ${nodeToDelete.name}`
            );
            if (selectedNodeId === nodeToDelete.id) setSelectedNodeId(null);
            setDeleteModalOpen(false);
            setNodeToDelete(null);
            toast.success('Đã xóa dữ liệu thành công.');
        } catch (error) {
            console.error('Lỗi khi xóa:', error);
            toast.error('Có lỗi xảy ra khi xóa dữ liệu');
        }
    };


    const onSubmit = async (data: Omit<ProjectNode, 'id' | 'createdAt'>) => {
        try {
            const payload = { ...data };
            if (!payload.parentId) payload.parentId = null;

            if (modalMode === 'add') {
                const newRef = doc(collection(db, 'project_nodes'));
                await setDoc(newRef, {
                    ...payload,
                    createdAt: Date.now(),
                    order: Date.now(),
                    createdBy: user?.email || user?.uid || ''
                });
            } else if (modalMode === 'edit' && editingNodeId) {
                await updateDoc(doc(db, 'project_nodes', editingNodeId), {
                    ...payload
                });
            }
            setIsModalOpen(false);
            toast.success(modalMode === 'add' ? 'Đã thêm thành công.' : 'Đã cập nhật thành công.');
        } catch (error) {
            console.error('Lỗi khi lưu dữ liệu:', error);
            toast.error('Có lỗi xảy ra, vui lòng thử lại.');
        }
    };

    const renderTree = (items: NodeTreeItem[], level: number = 0, prefix: string = '') => {
        return items.map((item, index) => {
            const isExpanded = expandedKeys.has(item.id);
            const isSelected = selectedNodeId === item.id;
            const hasChildren = item.children.length > 0;
            // Nếu là con trực tiếp của Dự án gốc (level 1), đánh số 1., 2., 3.
            // Nếu là các cấp sâu hơn, nối tiếp prefix (1.1., 1.1.1.)
            // Lưu ý: Dự án gốc ở level 0 không hiển thị prefix số nếu nó là gốc duy nhất, 
            // nhưng ở đây ta đánh số cho tất cả các mục hiển thị.
            // Theo yêu cầu: Dự án gốc -> Hạng mục (1.) -> Mục cha (1.1.)
            const currentPrefix = prefix ? `${prefix}${index + 1}.` : `${index + 1}.`;
            return (
                <div key={item.id}>
                    <div
                        className={`flex items-center group cursor-pointer px-2 py-1.5 rounded-md text-sm transition-colors ${isSelected ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-100 text-gray-700'}`}
                        style={{ paddingLeft: `${level * 20 + 8}px` }}
                        onClick={() => setSelectedNodeId(item.id)}
                    >
                        <div className="w-5 h-5 flex items-center justify-center mr-1" onClick={(e) => hasChildren ? toggleExpand(e, item.id) : null}>
                            {hasChildren ? (
                                isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
                            ) : <span className="w-4 h-4" />}
                        </div>

                        <div className="mr-2">
                            {getTypeIcon(item.type)}
                        </div>

                        <span className="flex-1 truncate select-none flex items-center gap-2 overflow-hidden">
                            <span className="text-gray-400 font-medium mr-1.5 shrink-0">{currentPrefix}</span>
                            <span className={`truncate ${item.status === 'COMPLETED' ? 'text-gray-400 line-through' : ''}`}>
                                {item.name}
                            </span>
                            {item.totalDocCount > 0 && (
                                <span className="ml-auto mr-2 px-1.5 py-0.5 text-[10px] font-bold bg-blue-50 text-blue-600 rounded-full shrink-0">
                                    {item.totalDocCount}
                                </span>
                            )}
                        </span>

                        {/* Actions On Hover - Only for Admin/Manager */}
                        {isAdminOrManager && (
                            <div className="hidden group-hover:flex bg-white/80 rounded shadow-sm border border-gray-100 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                                <button onClick={(e) => handleMoveNode(e, item, 'up')} className="p-1 text-gray-400 hover:text-gray-800" title="Đẩy lên trên">
                                    <ArrowUp className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleMoveNode(e, item, 'down')} className="p-1 text-gray-400 hover:text-gray-800" title="Đẩy xuống dưới">
                                    <ArrowDown className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleAddNode(e, item.id)} className="p-1 text-gray-400 hover:text-green-600" title={`Thêm mục con vào ${item.name} `}>
                                    <Plus className="w-3.5 h-3.5" />
                                </button>
                                {canEditOrDeleteData(user, item.createdBy) && (
                                    <>
                                        <button onClick={(e) => handleEditNode(e, item)} className="p-1 text-gray-400 hover:text-blue-600" title="Chỉnh sửa">
                                            <Edit2 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={(e) => handleDeleteNode(e, item)} className="p-1 text-gray-400 hover:text-red-600" title="Xóa">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>

                    {isExpanded && hasChildren && (
                        <div className="mt-1">
                            {/* Nếu đang ở level 0 (Dự án gốc), không truyền prefix xuống con để con bắt đầu từ 1., 2. */}
                            {renderTree(item.children, level + 1, level === 0 ? '' : currentPrefix)}
                        </div>
                    )}
                </div>
            );
        });
    };

    const selectedNode = selectedNodeId ? allNodes.find(n => n.id === selectedNodeId) : null;

    return (
        <div className="h-full flex flex-col p-6 bg-gray-50 uppercase-fix">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Cấu trúc Dự án</h1>
                    <p className="text-sm text-gray-500 mt-1">Cấu hình cây phân cấp Dự án, Hạng mục, Gói thầu</p>
                </div>
                {isAdminOrManager && (
                    <button
                        onClick={(e) => handleAddNode(e, null)}
                        className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Thêm Dự án gốc
                    </button>
                )}
            </div>

            <div className="flex-1 flex gap-6 min-h-0">
                {/* Left Pane: Tree View */}
                <div className="w-1/3 min-w-[300px] bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                        <h2 className="font-semibold text-gray-800">Cây Thư mục</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {treeData.length > 0 ? (
                            renderTree(treeData)
                        ) : (
                            <div className="text-center p-8 text-gray-400 text-sm">
                                Chưa có dữ liệu. Hãy tạo Dự án đầu tiên.
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Pane: Details View */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-y-auto">
                    {selectedNode ? (
                        <div className="p-8">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-blue-50 rounded-lg shrink-0">
                                        {getTypeIcon(selectedNode.type)}
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900">{selectedNode.name}</h2>
                                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                                            <span className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                                                {getTypeName(selectedNode.type)}
                                            </span>
                                            {selectedNode.status === 'ACTIVE' ? (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                                                    <CheckCircle className="w-3.5 h-3.5" /> Đang hoạt động
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                                                    <Clock className="w-3.5 h-3.5" /> {selectedNode.status === 'COMPLETED' ? 'Đã hoàn thành' : 'Tạm dừng'}
                                                </span>
                                            )}
                                            <span className="text-gray-300 mx-0.5">|</span>
                                            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                                <Calendar className="w-3 h-3" /> {selectedNode.startDate ? selectedNode.startDate.split('-').reverse().join('/') : '--'} → {selectedNode.endDate ? selectedNode.endDate.split('-').reverse().join('/') : '--'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-2 shrink-0">
                                    {selectedNode.driveFolderLink && (
                                        <a
                                            href={selectedNode.driveFolderLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 font-medium px-4 py-2 rounded-md hover:bg-emerald-100 transition-colors"
                                        >
                                            <HardDrive className="w-4 h-4" />
                                            Mở trên Drive
                                        </a>
                                    )}
                                    {isAdminOrManager && (
                                        <button
                                            onClick={(e) => handleAddNode(e, selectedNode.id)}
                                            className="flex items-center gap-2 bg-blue-50 text-blue-700 font-medium px-4 py-2 rounded-md hover:bg-blue-100 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Tạo mục con
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="mb-8">
                                <h3 className="text-lg font-semibold text-gray-900 mb-3 block border-b border-gray-100 pb-2">Mô tả thông tin</h3>
                                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                                    {selectedNode.description || <span className="text-gray-400 italic">Không có nội dung mô tả...</span>}
                                </p>
                            </div>

                            {/* ======== THỜI GIAN THỰC HIỆN (tính từ Văn bản đính kèm) ======== */}
                            {(() => {
                                const nodeDocs = allLinks.filter(l => l.nodeId === selectedNodeId).map(link => allDocs.find(d => d.id === link.vanBanId)).filter(Boolean);
                                if (nodeDocs.length === 0) return null;

                                const parseD = (s: any) => {
                                    if (!s) return null;
                                    if (s instanceof Date) return s;
                                    const d = new Date(s);
                                    return isNaN(d.getTime()) ? null : d;
                                };

                                const dates = nodeDocs.map(d => parseD(d.ngayBanHanh)).filter(Boolean) as Date[];
                                if (dates.length === 0) return null;

                                const minStart = new Date(Math.min(...dates.map(d => d.getTime())));
                                const maxEnd = new Date(Math.max(...dates.map(d => d.getTime())));
                                const fmt = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

                                return (
                                    <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-400">📅</span>
                                            <span className="text-gray-500 font-medium">Từ ngày:</span>
                                            <span className="font-semibold text-blue-700">{fmt(minStart)}</span>
                                        </div>
                                        <span className="text-gray-300">→</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500 font-medium">Đến ngày:</span>
                                            <span className="font-semibold text-blue-700">{fmt(maxEnd)}</span>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2">
                                            <span className="text-xs font-semibold text-blue-600">{nodeDocs.length} văn bản</span>
                                        </div>
                                    </div>
                                );
                            })()}


                            {/* Danh sách Văn bản */}
                            <div className="mb-8">
                                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                                    <h3 className="text-lg font-semibold text-gray-900">Danh sách Văn bản <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{nodeLinksWithDocs.length}</span></h3>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                                            className="flex items-center gap-1.5 bg-white border border-gray-200 text-gray-600 hover:text-gray-900 hover:border-gray-300 font-medium px-3 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-sm shadow-sm"
                                            title="Sắp xếp theo ngày ban hành"
                                        >
                                            <ArrowUpDown className="w-3.5 h-3.5" /> Sắp xếp {sortOrder === 'asc' ? 'cũ nhất' : 'mới nhất'}
                                        </button>
                                        <button
                                            onClick={() => setIsAttachDocModalOpen(true)}
                                            className="flex items-center gap-1.5 bg-white border border-gray-200 text-blue-600 hover:text-blue-700 hover:border-blue-300 font-medium px-3 py-1.5 rounded-md hover:bg-blue-50 transition-colors text-sm shadow-sm"
                                        >
                                            <LinkIcon className="w-3.5 h-3.5" /> Đính kèm Văn bản
                                        </button>
                                    </div>
                                </div>

                                {nodeLinksWithDocs.length > 0 ? (
                                    <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
                                        <table className="w-full text-left text-sm text-gray-600 table-fixed min-w-[500px]">
                                            <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                                                <tr>
                                                    <th className="px-3 py-2.5 w-12 text-center"></th>
                                                    <th className="px-4 py-2.5 min-w-[250px]">Văn bản pháp lý</th>
                                                    <th className="px-3 py-2.5 w-10 text-center"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {nodeLinksWithDocs.map(d => {
                                                    const { Icon, bg, color } = getDocIconConfig(d);
                                                    // Tạo câu pháp lý đầy đủ
                                                    const parts: string[] = [];
                                                    if (d.loaiVanBan) parts.push(d.loaiVanBan);
                                                    if (d.soKyHieu) parts.push(`số ${d.soKyHieu}`);
                                                    if (d.ngayBanHanh) {
                                                        const [y, m, dd] = d.ngayBanHanh.split('-');
                                                        parts.push(`ngày ${dd} tháng ${m} năm ${y}`);
                                                    }
                                                    if (d.coQuanBanHanh) parts.push(`của ${d.coQuanBanHanh}`);
                                                    if (d.trichYeu) parts.push(`${d.trichYeu}`);
                                                    const phapLy = parts.join(' ');
                                                    return (
                                                        <tr key={d.linkId} className="hover:bg-gray-50/80 transition-colors group">
                                                            <td className="px-3 py-3 text-center">
                                                                <button
                                                                    onClick={() => setPreviewDocId(d.id)}
                                                                    title="Xem nội dung văn bản"
                                                                    className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${bg} ${color} hover:ring-2 hover:ring-offset-1 hover:ring-current transition-all shadow-sm`}
                                                                >
                                                                    <Icon className="w-5 h-5" />
                                                                </button>
                                                            </td>
                                                            <td className="px-4 py-3 leading-relaxed text-gray-700" title={phapLy}>
                                                                <p className="line-clamp-2 text-sm">{phapLy || '--'}</p>
                                                            </td>
                                                            <td className="px-3 py-3 text-center">
                                                                <button
                                                                    onClick={() => handleRemoveDocLink(d.linkId)}
                                                                    disabled={!!isRemovingId}
                                                                    className="text-gray-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50 transition-colors disabled:opacity-50"
                                                                    title="Gỡ văn bản khỏi mục này"
                                                                >
                                                                    {isRemovingId === d.linkId ? (
                                                                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                                                                    ) : (
                                                                        <Unlink className="w-4 h-4 mx-auto" />
                                                                    )}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-gray-500 text-sm flex flex-col items-center">
                                        <FileText className="w-8 h-8 text-gray-300 mb-2" />
                                        Chưa có thông tin / hồ sơ nào được đính kèm.
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6">
                                <div className="text-[10px] text-gray-400">
                                    ID: {selectedNode.id}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400">
                            <FolderTree className="w-16 h-16 mb-4 text-gray-200" />
                            <p>Chọn một mục bên cây thư mục để xem chi tiết</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Modal Add/Edit */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold text-gray-800">
                                {modalMode === 'add' ? (
                                    <>
                                        Thêm mới vào <span className="text-primary-600">
                                            {watch('parentId') ? allNodes.find(n => n.id === watch('parentId'))?.name : 'Dự án gốc'}
                                        </span>
                                    </>
                                ) : (
                                    <>Chỉnh sửa: <span className="text-primary-600">{watch('name')}</span></>
                                )}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit(onSubmit)} className="overflow-y-auto">
                            <div className="p-6 space-y-4">
                                <input type="hidden" {...register('parentId')} />

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên mục / Tiêu đề <span className="text-red-500">*</span></label>
                                    <input
                                        {...register('name', { required: true })}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                        placeholder="VD: Tuyến đường sắt số 1..."
                                        autoFocus
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phân loại <span className="text-red-500">*</span></label>
                                        <select
                                            {...register('type')}
                                            className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="PROJECT">📁 Dự án</option>
                                            <option value="CATEGORY">📂 Hạng mục</option>
                                            <option value="PACKAGE">📦 Gói thầu / Nhóm</option>
                                            <option value="FOLDER">📂 Thư mục con</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái</label>
                                        <select
                                            {...register('status')}
                                            className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="ACTIVE">Đang hoạt động</option>
                                            <option value="PENDING">Tạm dừng</option>
                                            <option value="COMPLETED">Đã hoàn thành</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                                        <input type="date" {...register('startDate')} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngày kết thúc (Hạn chót)</label>
                                        <input type="date" {...register('endDate')} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" />
                                    </div>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả thêm</label>
                                    <textarea
                                        {...register('description')}
                                        rows={3}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none resize-none"
                                        placeholder="Nội dung tóm tắt..."
                                    />
                                </div>
                            </div>

                            <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                                >
                                    Hủy bỏ
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 transition-colors shadow-sm"
                                >
                                    {modalMode === 'add' ? 'Thêm mới' : 'Lưu thay đổi'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Giao việc / Sửa task */}
            {/* isTaskModalOpen and related states/logic removed as per instruction */}

            {/* GenericConfirmModal for Task (if still needed, but task modal removed) */}
            {/* isTaskConfirmOpen and related states/logic removed as per instruction */}


            {/* Modal Đính kèm Văn bản */}
            {
                isAttachDocModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
                            <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 shrink-0">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        <LinkIcon className="w-5 h-5 text-blue-600" /> Chọn Văn bản Đính kèm
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        Gắn vào: <span className="font-semibold text-gray-700">{allNodes.find(n => n.id === selectedNodeId)?.name}</span>
                                    </p>
                                </div>
                                <button onClick={() => setIsAttachDocModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="px-6 py-3 border-b border-gray-100 shrink-0 bg-white">
                                <div className="relative">
                                    <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                    <input
                                        type="text"
                                        placeholder="Tìm kiếm theo Số ký hiệu, Loại văn bản hoặc Trích yếu..."
                                        value={attachSearchTerm}
                                        onChange={(e) => setAttachSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="p-4 overflow-y-auto bg-gray-50 flex-1">
                                {unassignedDocs.length > 0 ? (
                                    <div className="grid grid-cols-1 gap-3">
                                        {unassignedDocs.map(d => (
                                            <div key={d.id} className="bg-white rounded-xl p-4 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all flex justify-between items-center gap-4 group">
                                                <div className="flex-1 min-w-0 pr-4">
                                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                                        <span className={`px - 2 py - 0.5 text - [10px] uppercase font - bold tracking - wider rounded - md ${d.phanLoaiVanBan === 'INCOMING' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'} `}>
                                                            {d.phanLoaiVanBan === 'INCOMING' ? 'Đến' : 'Đi'}
                                                        </span>
                                                        {d.loaiVanBan && (
                                                            <span className="text-xs font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{d.loaiVanBan}</span>
                                                        )}
                                                        {d.soKyHieu && (
                                                            <span className="font-bold text-gray-900">{d.soKyHieu}</span>
                                                        )}
                                                        {d.ngayBanHanh && (
                                                            <span className="text-xs text-gray-500">• {d.ngayBanHanh.split('-').reverse().join('/')}</span>
                                                        )}
                                                        {d.coQuanBanHanh && (
                                                            <span className="text-xs text-gray-500 italic">{d.coQuanBanHanh}</span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed" title={d.trichYeu}>
                                                        {d.trichYeu}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleAttachDoc(d)}
                                                    disabled={isAttachingId === d.id}
                                                    className={`shrink-0 border px-4 py-2 rounded-lg text-sm font-semibold transition-all shadow-sm flex items-center gap-1.5 ${isAttachingId === d.id
                                                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                        : 'bg-white border-gray-200 text-blue-600 hover:bg-blue-600 hover:text-white hover:border-blue-600'
                                                        }`}
                                                >
                                                    {isAttachingId === d.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                                    ) : (
                                                        <LinkIcon className="w-3.5 h-3.5" />
                                                    )}
                                                    {isAttachingId === d.id ? 'Đang gắn...' : 'Đính kèm'}
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-12 flex flex-col items-center justify-center">
                                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4">
                                            <FileCheck className="w-8 h-8 text-blue-500" />
                                        </div>
                                        <p className="font-bold text-gray-900 text-lg mb-1">Tất cả văn bản đã được sắp xếp!</p>
                                        <p className="text-sm text-gray-500 max-w-sm">Không còn văn bản chưa phân bổ nào trong kho. Hãy tải lên văn bản mới bên mục Quản lý Văn bản.</p>
                                    </div>
                                )}
                            </div>

                            {unassignedDocs.length > 0 && (
                                <div className="px-6 py-3 border-t border-gray-100 bg-white shrink-0">
                                    <span className="text-sm text-gray-500">Đang hiển thị <b>{unassignedDocs.length}</b> văn bản chưa được phân bổ vào hệ thống.</span>
                                </div>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Document Preview Modal */}
            {
                previewDocId && (
                    <div
                        className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm"
                        onClick={(e) => { if (e.target === e.currentTarget) setPreviewDocId(null); }}
                    >
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] mx-4 flex flex-col overflow-hidden">

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    {previewDoc && (() => {
                                        const { Icon, bg, color } = getDocIconConfig(previewDoc);
                                        return (
                                            <span className={`w - 9 h - 9 rounded - lg ${bg} ${color} flex items - center justify - center shrink - 0`}>
                                                <Icon className="w-5 h-5" />
                                            </span>
                                        );
                                    })()}
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-900 truncate">
                                            {previewDoc?.loaiVanBan || ''} {previewDoc?.soKyHieu || previewDoc?.fileNameOriginal || 'Văn bản'}
                                        </h3>
                                        <p className="text-xs text-gray-500 truncate">
                                            {previewDoc?.coQuanBanHanh && <span>{previewDoc.coQuanBanHanh}</span>}
                                            {previewDoc?.ngayBanHanh && <span> • {previewDoc.ngayBanHanh.split('-').reverse().join('/')}</span>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0 ml-4">
                                    {previewDoc?.storageUrl ? (
                                        <a
                                            href={previewDoc.storageUrl} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                                        </a>
                                    ) : previewDoc?.driveFileId_Original ? (
                                        <a
                                            href={`https://drive.google.com/file/d/${previewDoc.driveFileId_Original}/view`} target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                        >
                                            <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                                        </a>
                                    ) : null}
                                    <button
                                        onClick={() => setPreviewDocId(null)}
                                        className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
                                        title="Đóng"
                                    >
                                        <X className="w-5 h-5 text-gray-500" />
                                    </button>
                                </div>
                            </div>

                            {/* Body: Meta Left + Preview Right */}
                            <div className="flex flex-1 overflow-hidden">

                                {/* Left: Metadata */}
                                <div className="w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-5 space-y-4 bg-white">
                                    {[
                                        { label: 'Loại Văn bản', value: previewDoc?.loaiVanBan },
                                        { label: 'Số Ký hiệu', value: previewDoc?.soKyHieu },
                                        { label: 'Ngày ban hành', value: previewDoc?.ngayBanHanh },
                                        { label: 'Cơ quan BH', value: previewDoc?.coQuanBanHanh },
                                        { label: 'Người ký', value: previewDoc?.nguoiKy },
                                        { label: 'Số trang', value: previewDoc?.soTrang },
                                    ].map(({ label, value }) => value ? (
                                        <div key={label}>
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                                            <p className="text-sm text-gray-800 font-medium">{value}</p>
                                        </div>
                                    ) : null)}
                                    {previewDoc?.trichYeu && (
                                        <div className="pt-3 border-t border-gray-100">
                                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Trích yếu</p>
                                            <p className="text-sm text-gray-700 leading-relaxed">{previewDoc.trichYeu}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Right: File Preview */}
                                <div className="flex-1 flex flex-col bg-gray-100 overflow-hidden">
                                    {(() => {
                                        const previewUrl = previewDoc?.storageUrl || null;
                                        const drivePreviewUrl = previewDoc?.driveFileId_Original
                                            ? `https://drive.google.com/file/d/${previewDoc.driveFileId_Original}/preview`
                                            : null;

                                        if (previewUrl) {
                                            if (previewDoc?.fileNameOriginal?.toLowerCase().endsWith('.pdf')) {
                                                return <iframe src={previewUrl} className="flex-1 border-none w-full h-full" title="PDF Preview" />;
                                            }
                                            return (
                                                <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                                                    <img src={previewUrl} alt="Xem trước" className="max-w-full max-h-full object-contain shadow-lg rounded-lg" />
                                                </div>
                                            );
                                        }
                                        if (drivePreviewUrl) {
                                            return (
                                                <iframe
                                                    src={drivePreviewUrl}
                                                    className="w-full h-full flex-1 border-none"
                                                    allow="autoplay"
                                                    title="Google Drive Preview"
                                                />
                                            );
                                        }
                                        return (
                                            <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
                                                <FileText className="w-16 h-16 text-gray-300" />
                                                <div className="text-center">
                                                    <p className="font-semibold text-gray-700">{previewDoc?.fileNameOriginal || 'Không rõ tên file'}</p>
                                                    <p className="text-sm text-gray-400 mt-1">Văn bản này chưa có tệp đính kèm để xem trước</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* isReportModalOpen and taskToReport related logic removed as per instruction */}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDeleteNode}
                itemName={nodeToDelete?.name || ''}
            />

            {/* Modal Gỡ Văn bản */}
            {
                removeModalOpen && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
                            <div className="p-6">
                                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-100 mb-4 mx-auto">
                                    <AlertTriangle className="w-6 h-6 text-red-600" />
                                </div>
                                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                                    Gỡ bỏ Văn bản
                                </h3>
                                <p className="text-center text-sm text-gray-500 mb-6">
                                    Bạn có chắc muốn gỡ văn bản này khỏi Hệ thống phân cấp? Hệ thống sẽ tự động tìm và xóa TẤT CẢ các Lối tắt (Shortcut) của văn bản này trong thư mục dự án hiện tại trên Google Drive để đảm bảo không còn tệp rác.
                                </p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            setRemoveModalOpen(false);
                                            setLinkToRemove(null);
                                        }}
                                        className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        onClick={executeRemoveDocLink}
                                        className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors"
                                    >
                                        Gỡ bỏ
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Modal Xác nhận Đính kèm Văn bản */}
            {
                isAttachConfirmModalOpen && docToAttach && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
                        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden transform transition-all">
                            <div className="p-6">
                                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 mb-4 mx-auto">
                                    <LinkIcon className="w-6 h-6 text-blue-600" />
                                </div>
                                <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                                    Xác nhận Đính kèm
                                </h3>
                                <p className="text-center text-sm text-gray-500 mb-6">
                                    Bạn có chắc chắn muốn đính kèm văn bản <b>{docToAttach.soKyHieu || docToAttach.fileNameOriginal}</b> vào nhánh dự án hiện tại?
                                    <br /><span className="text-xs italic text-gray-400 mt-2 block">(Hệ thống sẽ tạo lối tắt văn bản trên Google Drive)</span>
                                </p>
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            setIsAttachConfirmModalOpen(false);
                                            setDocToAttach(null);
                                        }}
                                        className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
                                    >
                                        Hủy bỏ
                                    </button>
                                    <button
                                        onClick={executeAttachDoc}
                                        className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                                    >
                                        Đính kèm
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
