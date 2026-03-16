import React, { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { FolderTree, Folder, FileCheck, Layers, Plus, Edit2, Trash2, ChevronRight, ChevronDown, CheckSquare, Square, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useAuthStore } from '../store/useAuthStore';
import { toast } from 'react-hot-toast';


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
    driveFolderId?: string;
    driveFolderLink?: string;
}

interface NodeTreeItem extends ProjectNode {
    children: NodeTreeItem[];
}

interface ProjectTreeSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (selectedNodes: { nodeId: string, projectId: string }[]) => void;
    initialSelectedNodeIds?: string[];
    title?: string;
}

export const ProjectTreeSelectorModal: React.FC<ProjectTreeSelectorModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    initialSelectedNodeIds = [],
    title = "Chọn Vị trí Dự án"
}) => {
    const [allNodes, setAllNodes] = useState<ProjectNode[]>([]);
    const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set(initialSelectedNodeIds));

    // Modal state for Node CRUD
    const [isNodeModalOpen, setIsNodeModalOpen] = useState(false);
    const [modalMode, setModalMode] = useState<'add' | 'edit'>('add');
    const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

    const { user } = useAuthStore();
    const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

    const { register, handleSubmit, reset, watch } = useForm<ProjectNode>();

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribeNodes = onSnapshot(collection(db, 'project_nodes'), (snapshot) => {
            const nodesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProjectNode[];
            setAllNodes(nodesData);

            // Auto expand if there are selected nodes initially
            if (initialSelectedNodeIds.length > 0) {
                const newExpanded = new Set<string>();
                initialSelectedNodeIds.forEach(id => {
                    let current = nodesData.find(n => n.id === id);
                    while (current?.parentId) {
                        newExpanded.add(current.parentId);
                        current = nodesData.find(n => n.id === current?.parentId);
                    }
                });
                if (newExpanded.size > 0) setExpandedKeys(newExpanded);
            }
        });

        setSelectedNodeIds(new Set(initialSelectedNodeIds));

        return () => {
            unsubscribeNodes();
        };
    }, [isOpen, initialSelectedNodeIds]);

    const treeData = useMemo(() => {
        const map = new Map<string, NodeTreeItem>();
        const roots: NodeTreeItem[] = [];

        allNodes.forEach(node => {
            map.set(node.id, { ...node, children: [] });
        });

        allNodes.forEach(node => {
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
    }, [allNodes]);

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setExpandedKeys(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const toggleSelectNode = (nodeId: string) => {
        const newSelected = new Set(selectedNodeIds);
        if (newSelected.has(nodeId)) {
            newSelected.delete(nodeId);
        } else {
            newSelected.add(nodeId);
        }
        setSelectedNodeIds(newSelected);
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

    // Node CRUD handlers
    const handleAddNode = (e: React.MouseEvent, parentId: string | null = null) => {
        e.stopPropagation();
        setModalMode('add');
        let defaultType = 'PROJECT';
        if (parentId) {
            const parent = allNodes.find(n => n.id === parentId);
            if (parent?.type === 'PROJECT') defaultType = 'CATEGORY';
            else if (parent?.type === 'CATEGORY') defaultType = 'PACKAGE';
            else defaultType = 'TASK';
            setExpandedKeys(prev => new Set(prev).add(parentId));
        }

        reset({
            name: '',
            parentId: parentId,
            description: '',
            type: defaultType as any,
            status: 'ACTIVE'
        });
        setIsNodeModalOpen(true);
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
            status: node.status || 'ACTIVE'
        });
        setIsNodeModalOpen(true);
    };

    const handleDeleteNode = async (e: React.MouseEvent, node: ProjectNode) => {
        e.stopPropagation();
        const children = allNodes.filter(n => n.parentId === node.id);
        if (children.length > 0) {
            toast.error('Không thể xóa mục này vì vẫn còn chứa các mục con bên trong.');
            return;
        }
        if (window.confirm(`Bạn có chắc chắn muốn xóa "${node.name}" không?`)) {
            await deleteDoc(doc(db, 'project_nodes', node.id));
            if (selectedNodeIds.has(node.id)) {
                const newSelected = new Set(selectedNodeIds);
                newSelected.delete(node.id);
                setSelectedNodeIds(newSelected);
            }
        }
    };

    const onSubmitNode = async (data: any) => {
        try {
            const payload = { ...data };
            if (!payload.parentId) payload.parentId = null;

            if (modalMode === 'add') {
                const newRef = doc(collection(db, 'project_nodes'));
                await setDoc(newRef, {
                    ...payload,
                    createdAt: Date.now(),
                    order: Date.now()
                });
            } else if (modalMode === 'edit' && editingNodeId) {
                await updateDoc(doc(db, 'project_nodes', editingNodeId), {
                    ...payload
                });
            }
            setIsNodeModalOpen(false);
        } catch (error) {
            console.error('Lỗi khi lưu dữ liệu:', error);
            toast.error('Có lỗi xảy ra, vui lòng thử lại.');
        }
    };

    const findRootProjectId = (nodeId: string): string => {
        let current = allNodes.find(n => n.id === nodeId);
        while (current && current.parentId) {
            const parent = allNodes.find(n => n.id === current?.parentId);
            if (!parent) break;
            current = parent;
        }
        return current?.id || nodeId;
    };

    const renderTree = (items: NodeTreeItem[], level: number = 0, prefix: string = '') => {
        return items.map((item, index) => {
            const isExpanded = expandedKeys.has(item.id);
            const isSelected = selectedNodeIds.has(item.id);
            const hasChildren = item.children.length > 0;
            // Nếu là con trực tiếp của Dự án gốc (level 1), đánh số 1., 2., 3.
            // Nếu là các cấp sâu hơn, nối tiếp prefix (1.1., 1.1.1.)
            const currentPrefix = level === 0 ? '' : (prefix ? `${prefix}${index + 1}.` : `${index + 1}.`);
            return (
                <div key={item.id}>
                    <div
                        className={`flex items-center group px-2 py-2 border-b border-gray-50 text-sm transition-colors hover:bg-blue-50/50 ${isSelected ? 'bg-blue-50/80' : ''}`}
                        style={{ paddingLeft: `${level * 24 + 12}px` }}
                    >
                        {/* Expand/Collapse Toggle */}
                        <div className="w-6 h-6 flex items-center justify-center mr-1 cursor-pointer" onClick={(e) => hasChildren ? toggleExpand(e, item.id) : null}>
                            {hasChildren ? (
                                isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />
                            ) : <span className="w-4 h-4" />}
                        </div>

                        {/* Checkbox for selection */}
                        <div
                            className="mr-3 cursor-pointer text-blue-600 hover:text-blue-700 transition flex items-center justify-center shrink-0 w-5 h-5"
                            onClick={() => toggleSelectNode(item.id)}
                        >
                            {isSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-gray-300 group-hover:text-blue-200" />}
                        </div>

                        {/* Node Icon */}
                        <div className="mr-2 opacity-80 cursor-pointer" onClick={() => toggleSelectNode(item.id)}>
                            {getTypeIcon(item.type)}
                        </div>

                        {/* Node Title */}
                        <span
                            className="flex-1 truncate select-none flex items-center gap-2 cursor-pointer"
                            onClick={() => toggleSelectNode(item.id)}
                        >
                            <span className="text-gray-400 font-medium mr-1.5 text-xs">{currentPrefix}</span>
                            <span className={`font-medium ${item.status === 'COMPLETED' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                {item.name}
                            </span>
                        </span>

                        {/* Actions On Hover - Only for Admin/Manager */}
                        {isAdminOrManager && (
                            <div className="hidden group-hover:flex bg-white rounded shadow-sm border border-gray-200 items-center justify-center ml-2 z-10 shrink-0">
                                <button onClick={(e) => handleAddNode(e, item.id)} className="p-1 px-1.5 text-gray-400 hover:text-green-600" title={`Thêm mục con vào ${item.name}`}>
                                    <Plus className="w-4 h-4" />
                                </button>
                                <button onClick={(e) => handleEditNode(e, item)} className="p-1 px-1.5 text-gray-400 hover:text-blue-600 border-l border-gray-100" title="Chỉnh sửa">
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={(e) => handleDeleteNode(e, item)} className="p-1 px-1.5 text-gray-400 hover:text-red-600 border-l border-gray-100" title="Xóa">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
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

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col h-[85vh]">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            <FolderTree className="w-5 h-5 text-blue-600" />
                            {title}
                        </h3>
                        <p className="text-sm text-gray-500 mt-0.5">Tick chọn vị trí lưu trữ văn bản trong cấu trúc phân cấp Dự án</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-white p-2 relative">
                    {allNodes.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                            <FolderTree className="w-12 h-12 text-gray-300 mb-3" />
                            <p className="text-gray-500 mb-4">Chưa có dữ liệu Dự án nào. Khởi tạo cấu trúc ngay?</p>
                            {isAdminOrManager && (
                                <button onClick={(e) => handleAddNode(e)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition shadow-sm">
                                    <Plus className="w-4 h-4" />
                                    Tạo thư mục Gốc đầu tiên
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="border border-gray-100 rounded-lg overflow-hidden pb-4">
                            {renderTree(treeData)}

                            {isAdminOrManager && (
                                <div className="mt-4 px-4">
                                    <button onClick={(e) => handleAddNode(e)} className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium py-2 rounded transition">
                                        <Plus className="w-4 h-4" />
                                        Tạo nhánh Dự án Gốc mới
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
                    <div className="text-sm text-gray-600">
                        Đã chọn <span className="font-bold text-blue-600 text-base">{selectedNodeIds.size}</span> thư mục vị trí
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-medium transition"
                        >
                            Hủy
                        </button>
                        <button
                            onClick={() => {
                                const result = Array.from(selectedNodeIds).map(id => ({
                                    nodeId: id,
                                    projectId: findRootProjectId(id)
                                }));
                                onConfirm(result);
                            }}
                            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-bold shadow-sm"
                        >
                            <CheckSquare className="w-4 h-4" />
                            Sắp xếp & Xác nhận ({selectedNodeIds.size})
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal CRUD Node */}
            {isNodeModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4">
                    <form onSubmit={handleSubmit(onSubmitNode)} className="bg-white rounded-xl shadow-xl w-full max-w-md flex flex-col max-h-[90vh] overflow-hidden transform transition-all scale-100">
                        <div className="px-6 py-4 border-b shrink-0">
                            <h3 className="text-lg font-bold text-gray-900">
                                {modalMode === 'add' ? 'Thêm mới' : 'Chỉnh sửa'}
                            </h3>
                        </div>
                        <div className="px-6 py-4 space-y-4 flex-1 overflow-y-auto">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Loại mục</label>
                                    <select
                                        {...register('type')}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="PROJECT">Dự án / Công trình</option>
                                        <option value="CATEGORY">Hạng mục</option>
                                        <option value="PACKAGE">Gói thầu</option>
                                        <option value="TASK">Công việc chi tiết</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium text-gray-700">Trạng thái</label>
                                    <select
                                        {...register('status')}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="ACTIVE">Đang thực hiện</option>
                                        <option value="PENDING">Chưa bắt đầu</option>
                                        <option value="COMPLETED">Đã hoàn thành</option>
                                        <option value="CANCELLED">Hủy bỏ</option>
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Tên mục / Hạng mục <span className="text-red-500">*</span></label>
                                <input
                                    {...register('name', { required: true })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                    placeholder="Ví dụ: Dự án A, Hạng mục Phần ngầm..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-gray-700">Mô tả thêm / Phạm vi</label>
                                <textarea
                                    {...register('description')}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                    placeholder="Nhập thông tin mô tả chi tiết nếu cần..."
                                />
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setIsNodeModalOpen(false)}
                                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 font-medium transition"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                type="submit"
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition"
                            >
                                Lưu lại
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
