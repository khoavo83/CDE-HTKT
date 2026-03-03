import React, { useEffect, useState, useMemo } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Link } from 'react-router-dom';
import { FolderTree, Folder, FileCheck, Layers, Plus, Edit2, Trash2, ChevronRight, ChevronDown, CheckCircle, Clock, ArrowUp, ArrowDown, FileText, FileImage, FileSpreadsheet, X, Link as LinkIcon, Unlink, ExternalLink, HardDrive, Search, Calendar, Loader2, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/useAuthStore';
import { canEditOrDeleteData } from '../utils/authUtils';
import { ReportCompletionModal } from '../components/ReportCompletionModal';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { moveToTrash } from '../utils/trashUtils';
import { isoToVN } from '../utils/formatVN';

interface ProjectNode {
    id: string;
    name: string;
    type: 'PROJECT' | 'CATEGORY' | 'PACKAGE' | 'TASK';
    parentId: string | null;
    description: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: number;
    order?: number;
    // Các trường mới cho giao việc
    phuTrach?: string; // UID người phụ trách chính
    nguoiPhoiHop?: string[]; // Danh sách UID người phối hợp
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    notes?: string;
    completedAt?: string;
    bcDocId?: string; // ID văn bản báo cáo kết quả
    driveFolderId?: string;
    driveFolderLink?: string;
    createdBy?: string; // Nguời tạo
}

interface NodeTreeItem extends ProjectNode {
    children: NodeTreeItem[];
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
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [taskToReport, setTaskToReport] = useState<ProjectNode | null>(null);
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

    // Task management states
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    const [taskModalMode, setTaskModalMode] = useState<'add' | 'edit'>('add');
    const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
    const [taskForm, setTaskForm] = useState({ name: '', description: '', startDate: '', endDate: '', phuTrach: '', nguoiPhoiHop: [] as string[], priority: 'MEDIUM' as string, notes: '' });
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

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

    const previewDoc = previewDocId ? allDocs.find(d => d.id === previewDocId) || null : null;

    const { register, handleSubmit, reset, watch, setValue, formState: { } } = useForm<ProjectNode>();
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

        // Lấy danh sách ID của các Task trực thuộc selectedNodeId
        const childTaskIds = allNodes.filter(n => n.type === 'TASK' && n.parentId === selectedNodeId).map(n => n.id);

        // Lấy các link của selectedNodeId HOẶC các link của child tasks
        const relevantLinks = allLinks.filter(l => l.nodeId === selectedNodeId || childTaskIds.includes(l.nodeId));

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

    const handleAttachDoc = async (docId: string) => {
        if (!selectedNodeId || isAttachingId === docId) return;

        if (!confirm("Bạn có tin chắc muốn đính kèm văn bản này vào nhánh dự án hiện tại?")) return;

        setIsAttachingId(docId);
        try {
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../firebase/config');
            const attachFn = httpsCallable(functions, 'attachDocumentToNode');

            const result = await attachFn({
                nodeId: selectedNodeId,
                vanBanId: docId,
                projectId: findRootProjectId(selectedNodeId)
            });

            if ((result as any).data?.isDuplicate) {
                alert("Văn bản này đã được đính kèm vào nhánh này từ trước!");
            }

            setIsAttachDocModalOpen(false);
        } catch (error: any) {
            console.error(error);
            alert("Lỗi khi đính kèm văn bản: " + error.message);
        } finally {
            setIsAttachingId(null);
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
            const { httpsCallable } = await import('firebase/functions');
            const { functions } = await import('../firebase/config');
            const removeFn = httpsCallable(functions, 'removeDocumentLink');

            // Xóa qua Cloud Function để xóa trên Drive luôn
            await removeFn({ linkId: linkToRemove });
        } catch (error: any) {
            console.error(error);
            alert("Lỗi khi gỡ văn bản: " + error.message);

            // Fallback: Nếu lỗi Drive thì ít nhất xóa DB để UX mượt
            try {
                await deleteDoc(doc(db, "vanban_node_links", linkToRemove));
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
    const nonTaskNodes = useMemo(() => allNodes.filter(n => n.type !== 'TASK'), [allNodes]);
    const taskNodes = useMemo(() => allNodes.filter(n => n.type === 'TASK'), [allNodes]);

    // State cho Modal Delete (Thùng rác)
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [nodeToDelete, setNodeToDelete] = useState<ProjectNode | null>(null);

    // Tính toán lại cây thư mục khi allNodes thay đổi
    const treeData = useMemo(() => {
        const map = new Map<string, NodeTreeItem>();
        const roots: NodeTreeItem[] = [];

        nonTaskNodes.forEach(node => {
            map.set(node.id, { ...node, children: [] });
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

        const sortNodes = (items: NodeTreeItem[]) => {
            items.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
            items.forEach(item => sortNodes(item.children));
        };
        sortNodes(roots);

        return roots;
    }, [nonTaskNodes]);

    // Tasks của node đang chọn
    const selectedNodeTasks = useMemo(() => {
        if (!selectedNodeId) return [];
        return taskNodes.filter(t => t.parentId === selectedNodeId)
            .sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
    }, [selectedNodeId, taskNodes]);

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
            case 'TASK': return <FileCheck className="w-4 h-4 text-emerald-500" />;
            default: return <Folder className="w-4 h-4 text-gray-500" />;
        }
    };

    const getTypeName = (type: string) => {
        switch (type) {
            case 'PROJECT': return 'Dự án';
            case 'CATEGORY': return 'Hạng mục';
            case 'PACKAGE': return 'Gói thầu';
            case 'TASK': return 'Công việc';
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
        } catch (error) {
            console.error('Lỗi di chuyển:', error);
            alert('Không thể cập nhật thứ tự mới!');
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
            else defaultType = 'TASK';

            // Auto expand parent
            setExpandedKeys(prev => new Set(prev).add(parentId));
        }

        reset({
            name: '',
            parentId: parentId,
            description: '',
            type: defaultType as any,
            status: 'ACTIVE',
            startDate: '',
            endDate: '',
            phuTrach: '',
            nguoiPhoiHop: [],
            priority: 'MEDIUM',
            notes: '',
            completedAt: '',
            bcDocId: ''
        });
        setIsModalOpen(true);
    };

    const handleEditNode = (e: React.MouseEvent, node: ProjectNode) => {
        e.stopPropagation();
        setModalMode('edit');
        setEditingNodeId(node.id);
        reset({
            name: node.name,
            parentId: node.parentId,
            description: node.description || '',
            type: node.type,
            status: node.status || 'ACTIVE',
            startDate: node.startDate || '',
            endDate: node.endDate || '',
            phuTrach: node.phuTrach || '',
            nguoiPhoiHop: node.nguoiPhoiHop || [],
            priority: node.priority || 'MEDIUM',
            notes: node.notes || '',
            completedAt: node.completedAt || '',
            bcDocId: node.bcDocId || ''
        });
        setIsModalOpen(true);
    };

    const handleDeleteNode = async (e: React.MouseEvent, node: ProjectNode) => {
        e.stopPropagation();
        const children = allNodes.filter(n => n.parentId === node.id);
        if (children.length > 0) {
            alert('Không thể xóa mục này vì vẫn còn chứa các mục con bên trong.');
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
            if (expandedTaskId === nodeToDelete.id) setExpandedTaskId(null);
            setDeleteModalOpen(false);
            setNodeToDelete(null);
        } catch (error) {
            console.error('Lỗi khi xóa:', error);
            alert('Có lỗi xảy ra khi xóa dữ liệu');
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
        } catch (error) {
            console.error('Lỗi khi lưu dữ liệu:', error);
            alert('Có lỗi xảy ra, vui lòng thử lại.');
        }
    };

    const renderTree = (items: NodeTreeItem[], level: number = 0, prefix: string = '') => {
        return items.map((item, index) => {
            const isExpanded = expandedKeys.has(item.id);
            const isSelected = selectedNodeId === item.id;
            const hasChildren = item.children.length > 0;
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

                        <span className="flex-1 truncate select-none flex items-center gap-2">
                            <span className="text-gray-400 font-medium mr-1.5">{currentPrefix}</span>
                            <span className={item.status === 'COMPLETED' ? 'text-gray-400 line-through' : ''}>{item.name}</span>

                            {item.type === 'TASK' && (
                                <div className="flex items-center gap-1.5 ml-2">
                                    {item.phuTrach && (
                                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100 font-medium">
                                            {users.find(u => u.id === item.phuTrach)?.hoTen?.split(' ').pop() || users.find(u => u.id === item.phuTrach)?.displayName || '...'}
                                        </span>
                                    )}
                                    {item.priority === 'HIGH' && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Ưu tiên cao" />
                                    )}
                                </div>
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
                            {renderTree(item.children, level + 1, level === 0 ? "" : currentPrefix)}
                        </div>
                    )}
                </div>
            );
        });
    };

    const selectedNode = selectedNodeId ? allNodes.find(n => n.id === selectedNodeId) : null;

    const getPriorityColor = (priority: string | undefined) => {
        switch (priority) {
            case 'LOW': return 'bg-blue-100 text-blue-700';
            case 'MEDIUM': return 'bg-orange-100 text-orange-700';
            case 'HIGH': return 'bg-red-100 text-red-700';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    const getPriorityName = (priority: string | undefined) => {
        switch (priority) {
            case 'LOW': return 'Thấp';
            case 'MEDIUM': return 'Trung bình';
            case 'HIGH': return 'Cao';
            default: return 'Không xác định';
        }
    };

    return (
        <div className="h-full flex flex-col p-6 bg-gray-50 uppercase-fix">
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Quản lý Cấu trúc Dự án</h1>
                    <p className="text-sm text-gray-500 mt-1">Cấu hình cây phân cấp Dự án, Hạng mục, Gói thầu, Công việc</p>
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

                            {/* ======== THỜI GIAN THỰC HIỆN (tính từ Tasks) ======== */}
                            {selectedNodeTasks.length > 0 && (() => {
                                const parseD = (s: string | undefined) => s ? new Date(s) : null;
                                const startDates = selectedNodeTasks.map(t => parseD(t.startDate)).filter(Boolean) as Date[];
                                const endDates = selectedNodeTasks.map(t => parseD(t.completedAt) || parseD(t.endDate)).filter(Boolean) as Date[];
                                const minStart = startDates.length > 0 ? new Date(Math.min(...startDates.map(d => d.getTime()))) : null;
                                const maxEnd = endDates.length > 0 ? new Date(Math.max(...endDates.map(d => d.getTime()))) : null;
                                const fmt = (d: Date) => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
                                const completedCount = selectedNodeTasks.filter(t => t.status === 'COMPLETED').length;
                                const pct = Math.round((completedCount / selectedNodeTasks.length) * 100);
                                return (
                                    <div className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-lg px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                            <span className="text-blue-400">📅</span>
                                            <span className="text-gray-500 font-medium">Từ ngày:</span>
                                            <span className="font-semibold text-blue-700">{minStart ? fmt(minStart) : '—'}</span>
                                        </div>
                                        <span className="text-gray-300">→</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-gray-500 font-medium">Đến ngày:</span>
                                            <span className="font-semibold text-blue-700">{maxEnd ? fmt(maxEnd) : '—'}</span>
                                        </div>
                                        <div className="ml-auto flex items-center gap-2">
                                            <div className="w-24 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                                            </div>
                                            <span className="text-xs font-semibold text-blue-600">{completedCount}/{selectedNodeTasks.length} xong</span>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* ======== BẢNG CÔNG VIỆC ======== */}
                            <div className="mb-8">
                                <div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2">
                                    <h3 className="text-lg font-semibold text-gray-900">Công việc <span className="ml-2 text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{selectedNodeTasks.length}</span></h3>
                                    {isAdminOrManager && (
                                        <button
                                            onClick={() => {
                                                setTaskModalMode('add');
                                                setEditingTaskId(null);
                                                setTaskForm({ name: '', description: '', startDate: new Date().toISOString().split('T')[0], endDate: '', phuTrach: '', nguoiPhoiHop: [], priority: 'MEDIUM', notes: '' });
                                                setIsTaskModalOpen(true);
                                            }}
                                            className="flex items-center gap-1.5 bg-white border border-gray-200 text-green-600 hover:text-green-700 hover:border-green-300 font-medium px-3 py-1.5 rounded-md hover:bg-green-50 transition-colors text-sm shadow-sm"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> Giao việc
                                        </button>
                                    )}
                                </div>

                                {selectedNodeTasks.length > 0 ? (
                                    <div className="border border-gray-200 rounded-lg overflow-x-auto bg-white shadow-sm">
                                        <table className="w-full text-left text-sm text-gray-600 min-w-[700px]">
                                            <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                                                <tr>
                                                    <th className="px-3 py-2.5 w-10 text-center">STT</th>
                                                    <th className="px-3 py-2.5 w-24 text-center">Ngày giao</th>
                                                    <th className="px-3 py-2.5">Tên công việc</th>
                                                    <th className="px-3 py-2.5 w-32">Phụ trách</th>
                                                    <th className="px-3 py-2.5 w-16 text-center">Ưu tiên</th>
                                                    <th className="px-3 py-2.5 w-28 text-center">Trạng thái</th>
                                                    <th className="px-3 py-2.5 w-20 text-center">Hành động</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {selectedNodeTasks.map((task, idx) => {
                                                    const assignee = users.find(u => u.id === task.phuTrach);
                                                    const statusMap: Record<string, { label: string; cls: string }> = {
                                                        'ACTIVE': { label: 'Chưa làm', cls: 'bg-gray-100 text-gray-600' },
                                                        'PENDING': { label: 'Chưa làm', cls: 'bg-gray-100 text-gray-600' },
                                                        'IN_PROGRESS': { label: 'Đang làm', cls: 'bg-blue-100 text-blue-700' },
                                                        'REPORTED': { label: 'Đã báo cáo', cls: 'bg-amber-100 text-amber-700' },
                                                        'COMPLETED': { label: 'Hoàn thành', cls: 'bg-green-100 text-green-700' },
                                                        'RETURNED': { label: 'Làm lại', cls: 'bg-red-100 text-red-700' },
                                                    };
                                                    const st = statusMap[task.status] || statusMap['PENDING'];
                                                    const isExpTask = expandedTaskId === task.id;
                                                    const isMyTask = task.phuTrach === user?.uid || task.nguoiPhoiHop?.includes(user?.uid || '');
                                                    return (
                                                        <React.Fragment key={task.id}>
                                                            <tr className={`hover:bg-gray-50/80 transition-colors cursor-pointer ${isExpTask ? 'bg-blue-50/50' : ''}`}
                                                                onClick={() => setExpandedTaskId(isExpTask ? null : task.id)}>
                                                                <td className="px-3 py-2.5 text-center text-gray-400 font-medium">{idx + 1}</td>
                                                                <td className="px-3 py-2.5 text-center text-xs text-gray-500">{task.startDate ? task.startDate.split('-').reverse().join('/') : '--'}</td>
                                                                <td className="px-3 py-2.5 font-medium text-gray-900 truncate" title={task.name}>{task.name}</td>
                                                                <td className="px-3 py-2.5 truncate">
                                                                    {assignee ? (
                                                                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full border border-blue-100">
                                                                            {assignee.hoTen || assignee.displayName || '...'}
                                                                        </span>
                                                                    ) : <span className="text-gray-400">--</span>}
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${getPriorityColor(task.priority)}`}>
                                                                        {getPriorityName(task.priority)}
                                                                    </span>
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                                                                </td>
                                                                <td className="px-3 py-2.5 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        {isAdminOrManager && (
                                                                            <div className="flex items-center">
                                                                                {canEditOrDeleteData(user, task.createdBy) && (
                                                                                    <>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setTaskModalMode('edit'); setEditingTaskId(task.id); setTaskForm({ name: task.name, description: task.description || '', startDate: task.startDate || '', endDate: task.endDate || '', phuTrach: task.phuTrach || '', nguoiPhoiHop: task.nguoiPhoiHop || [], priority: task.priority || 'MEDIUM', notes: task.notes || '' }); setIsTaskModalOpen(true); }}
                                                                                            className="p-1 text-gray-400 hover:text-blue-600" title="Sửa">
                                                                                            <Edit2 className="w-3.5 h-3.5" />
                                                                                        </button>
                                                                                        <button onClick={(e) => { e.stopPropagation(); setNodeToDelete(task); setDeleteModalOpen(true); }}
                                                                                            className="p-1 text-gray-400 hover:text-red-600" title="Xóa">
                                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                            {/* Expanded task details */}
                                                            {isExpTask && (
                                                                <tr><td colSpan={7} className="p-0">
                                                                    <div className="bg-gray-50 px-6 py-4 border-t border-gray-100">
                                                                        <div className="grid grid-cols-2 gap-4 mb-4">
                                                                            <div><p className="text-xs text-gray-500 mb-0.5">Ngày giao</p><p className="text-sm font-medium">{task.startDate ? task.startDate.split('-').reverse().join('/') : '--'}</p></div>
                                                                            <div><p className="text-xs text-gray-500 mb-0.5">Hạn chót</p><p className="text-sm font-medium">{task.endDate ? task.endDate.split('-').reverse().join('/') : '--'}</p></div>
                                                                        </div>
                                                                        {task.description && <div className="mb-3"><p className="text-xs text-gray-500 mb-0.5">Mô tả</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p></div>}
                                                                        {task.notes && <div className="mb-3"><p className="text-xs text-gray-500 mb-0.5">Ghi chú</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{task.notes}</p></div>}
                                                                        {task.nguoiPhoiHop && task.nguoiPhoiHop.length > 0 && (
                                                                            <div className="mb-3"><p className="text-xs text-gray-500 mb-1">Người phối hợp</p>
                                                                                <div className="flex flex-wrap gap-1.5">{task.nguoiPhoiHop.map(uid => { const u = users.find(x => x.id === uid); return u ? <span key={uid} className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{u.hoTen || u.displayName}</span> : null; })}</div>
                                                                            </div>
                                                                        )}
                                                                        {task.status === 'COMPLETED' && task.completedAt && (
                                                                            <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                                                                                <p className="text-sm font-medium text-green-700">✅ Hoàn thành lúc: {isoToVN(task.completedAt)}</p>
                                                                                {task.bcDocId && (() => {
                                                                                    const bcDoc = allDocs.find(d => d.id === task.bcDocId);
                                                                                    const fileName = bcDoc?.standardName || bcDoc?.fileNameOriginal || 'văn bản kết quả';
                                                                                    return (
                                                                                        <Link to={`/documents/${task.bcDocId}`} className="text-blue-600 hover:underline text-sm flex items-center gap-1 mt-1" title={fileName}>
                                                                                            <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                                            <span className="truncate max-w-xs">Xem: {fileName}</span>
                                                                                        </Link>
                                                                                    );
                                                                                })()}
                                                                            </div>
                                                                        )}
                                                                        {/* Workflow buttons */}
                                                                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-200">
                                                                            {(task.status === 'ACTIVE' || task.status === 'PENDING' || task.status === 'RETURNED') && (isMyTask || isAdminOrManager) && (
                                                                                <button onClick={async (e) => { e.stopPropagation(); await updateDoc(doc(db, 'project_nodes', task.id), { status: 'IN_PROGRESS' }); }}
                                                                                    className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-blue-700 transition">
                                                                                    ▶ Bắt đầu làm
                                                                                </button>
                                                                            )}
                                                                            {task.status === 'IN_PROGRESS' && (isMyTask || isAdminOrManager) && (
                                                                                <button onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setTaskToReport(task);
                                                                                    setIsReportModalOpen(true);
                                                                                }}
                                                                                    className="flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-700 transition">
                                                                                    📤 Báo cáo hoàn thành
                                                                                </button>
                                                                            )}
                                                                            {task.status === 'REPORTED' && isAdminOrManager && (
                                                                                <>
                                                                                    <button onClick={async (e) => { e.stopPropagation(); await updateDoc(doc(db, 'project_nodes', task.id), { status: 'COMPLETED', completedAt: new Date().toISOString() }); }}
                                                                                        className="flex items-center gap-1.5 bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-green-700 transition">
                                                                                        ✅ Duyệt hoàn thành
                                                                                    </button>
                                                                                    <button onClick={async (e) => { e.stopPropagation(); await updateDoc(doc(db, 'project_nodes', task.id), { status: 'RETURNED' }); }}
                                                                                        className="flex items-center gap-1.5 bg-red-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-600 transition">
                                                                                        🔄 Yêu cầu làm lại
                                                                                    </button>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </td></tr>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-gray-50 border border-dashed border-gray-200 rounded-lg text-gray-500 text-sm flex flex-col items-center">
                                        <CheckCircle className="w-8 h-8 text-gray-300 mb-2" />
                                        Chưa có công việc nào. Hãy giao việc mới.
                                    </div>
                                )}
                            </div>

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
                                            <LinkIcon className="w-3.5 h-3.5" /> Thêm Văn bản
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
                                            <option value="PACKAGE">📦 Gói thầu</option>
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

                                {watchType === 'TASK' && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách</label>
                                                <select
                                                    {...register('phuTrach')}
                                                    disabled={!isAdminOrManager}
                                                    className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
                                                >
                                                    <option value="">-- Chưa chọn --</option>
                                                    {users.map(u => (
                                                        <option key={u.id} value={u.id}>{u.hoTen || u.displayName || u.email}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Mức độ ưu tiên</label>
                                                <select
                                                    {...register('priority')}
                                                    className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none"
                                                >
                                                    <option value="LOW">Thấp</option>
                                                    <option value="MEDIUM">Trung bình</option>
                                                    <option value="HIGH">Cao</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Người phối hợp</label>
                                            <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                                                {users.map(u => (
                                                    <label key={u.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm">
                                                        <input
                                                            type="checkbox"
                                                            value={u.id}
                                                            checked={(watch('nguoiPhoiHop') || []).includes(u.id)}
                                                            disabled={!isAdminOrManager}
                                                            onChange={(e) => {
                                                                const current = watch('nguoiPhoiHop') || [];
                                                                if (e.target.checked) {
                                                                    setValue('nguoiPhoiHop', [...current, u.id]);
                                                                } else {
                                                                    setValue('nguoiPhoiHop', current.filter((id: string) => id !== u.id));
                                                                }
                                                            }}
                                                            className="rounded text-blue-600 focus:ring-blue-500"
                                                        />
                                                        {u.hoTen || u.displayName || u.email}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú công việc</label>
                                            <textarea {...register('notes')} rows={2} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" placeholder="Nhập ghi chú thêm..." />
                                        </div>
                                    </>
                                )}

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
            {isTaskModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center shrink-0">
                            <h3 className="text-xl font-bold text-gray-800">
                                {taskModalMode === 'add' ? '📝 Giao việc mới' : '✏️ Sửa công việc'}
                            </h3>
                            <button onClick={() => setIsTaskModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <div className="overflow-y-auto p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc <span className="text-red-500">*</span></label>
                                <input value={taskForm.name} onChange={e => setTaskForm(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" placeholder="VD: Rà soát hồ sơ thiết kế..." autoFocus />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Người phụ trách</label>
                                    <select value={taskForm.phuTrach} onChange={e => setTaskForm(p => ({ ...p, phuTrach: e.target.value }))} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none">
                                        <option value="">-- Chưa chọn --</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.hoTen || u.displayName || u.email}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mức độ ưu tiên</label>
                                    <select value={taskForm.priority} onChange={e => setTaskForm(p => ({ ...p, priority: e.target.value }))} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none">
                                        <option value="LOW">Thấp</option>
                                        <option value="MEDIUM">Trung bình</option>
                                        <option value="HIGH">Cao</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ngày bắt đầu</label>
                                    <input type="date" value={taskForm.startDate} onChange={e => setTaskForm(p => ({ ...p, startDate: e.target.value }))} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Hạn chót</label>
                                    <input type="date" value={taskForm.endDate} onChange={e => setTaskForm(p => ({ ...p, endDate: e.target.value }))} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Người phối hợp</label>
                                <div className="border rounded-md p-2 max-h-32 overflow-y-auto space-y-1">
                                    {users.map(u => (
                                        <label key={u.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm">
                                            <input type="checkbox" value={u.id} checked={taskForm.nguoiPhoiHop.includes(u.id)}
                                                onChange={e => { const cur = taskForm.nguoiPhoiHop; setTaskForm(p => ({ ...p, nguoiPhoiHop: e.target.checked ? [...cur, u.id] : cur.filter(id => id !== u.id) })); }}
                                                className="rounded text-blue-600 focus:ring-500" />
                                            {u.hoTen || u.displayName || u.email}
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả / Nội dung giao</label>
                                <textarea value={taskForm.description} onChange={e => setTaskForm(p => ({ ...p, description: e.target.value }))} rows={3} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none resize-none" placeholder="Nội dung chi tiết..." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                                <textarea value={taskForm.notes} onChange={e => setTaskForm(p => ({ ...p, notes: e.target.value }))} rows={2} className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none resize-none" placeholder="Ghi chú thêm..." />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3 shrink-0">
                            <button type="button" onClick={() => setIsTaskModalOpen(false)} className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-100">Hủy bỏ</button>
                            <button type="button" onClick={async () => {
                                if (!taskForm.name.trim()) return;
                                const taskData: any = {
                                    name: taskForm.name,
                                    type: 'TASK',
                                    parentId: selectedNodeId,
                                    description: taskForm.description,
                                    status: 'PENDING',
                                    startDate: taskForm.startDate,
                                    endDate: taskForm.endDate,
                                    phuTrach: taskForm.phuTrach,
                                    nguoiPhoiHop: taskForm.nguoiPhoiHop,
                                    priority: taskForm.priority,
                                    notes: taskForm.notes,
                                };
                                if (taskModalMode === 'add') {
                                    const newId = `task_${Date.now()}`;
                                    taskData.createdAt = Date.now();
                                    taskData.order = Date.now();
                                    await setDoc(doc(db, 'project_nodes', newId), taskData);
                                } else if (editingTaskId) {
                                    await updateDoc(doc(db, 'project_nodes', editingTaskId), taskData);
                                }
                                setIsTaskModalOpen(false);
                            }} className="px-6 py-2 bg-primary-600 text-white rounded-md font-medium hover:bg-primary-700 shadow-sm">
                                {taskModalMode === 'add' ? 'Giao việc' : 'Lưu thay đổi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Đính kèm Văn bản */}
            {isAttachDocModalOpen && (
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
                                                onClick={() => handleAttachDoc(d.id)}
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
                                                {isAttachingId === d.id ? 'Đang gắn...' : 'Chọn'}
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
            )}

            {/* Document Preview Modal */}
            {previewDocId && (
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
                                {previewDoc?.storageUrl && (
                                    <a
                                        href={previewDoc.storageUrl} target="_blank" rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium"
                                    >
                                        <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                                    </a>
                                )}
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
            )}
            {
                isReportModalOpen && taskToReport && (() => {
                    // Tìm node cha của task để lấy driveFolderId (Task không có folder riêng)
                    const parentNode = allNodes.find(n => n.id === taskToReport.parentId);
                    const parentDriveFolderId = parentNode?.driveFolderId || undefined;
                    return (
                        <ReportCompletionModal
                            isOpen={isReportModalOpen}
                            onClose={() => setIsReportModalOpen(false)}
                            task={taskToReport}
                            parentDriveFolderId={parentDriveFolderId}
                        />
                    );
                })()
            }

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDeleteNode}
                itemName={nodeToDelete?.name || ''}
            />

            {/* Modal Gỡ Văn bản */}
            {removeModalOpen && (
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
            )}
        </div>
    );
};
