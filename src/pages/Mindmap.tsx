import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    Connection,
    Edge,
    Node,
    Position,
    Handle,
    NodeProps
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, updateDoc, doc } from 'firebase/firestore';
import { Loader2, X, FileText, FileCheck, FileSpreadsheet, FileImage, Layers, ExternalLink, ChevronDown, Plus, Send, ArrowLeft, ZoomIn, ZoomOut, Maximize2, Clock, Search, Briefcase, FileSignature, Target, MessageSquare } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { useAppSettingsStore } from '../store/useAppSettingsStore';

const nodeWidth = 280;

// Hàm icon theo loại văn bản
const getDocIconConfig = (doc: any): { Icon: React.ElementType; bg: string; color: string } => {
    const ext = (doc?.fileNameOriginal || '').toLowerCase();
    if (ext.endsWith('.xls') || ext.endsWith('.xlsx')) return { Icon: FileSpreadsheet, bg: 'bg-green-100', color: 'text-green-600' };
    if (ext.endsWith('.doc') || ext.endsWith('.docx')) return { Icon: FileText, bg: 'bg-blue-100', color: 'text-blue-600' };
    if (ext.endsWith('.jpg') || ext.endsWith('.png') || ext.endsWith('.jpeg')) return { Icon: FileImage, bg: 'bg-pink-100', color: 'text-pink-600' };
    if (ext.endsWith('.pdf')) return { Icon: FileCheck, bg: 'bg-red-100', color: 'text-red-600' };
    return { Icon: FileText, bg: 'bg-gray-100', color: 'text-gray-600' };
};

// ===== Custom Node Component =====
const CustomMindmapNode = ({ data, id }: NodeProps) => {
    const style = data.style || {};
    const hasChildren = data.hasChildren;
    const isExpanded = data.isExpanded;
    const isLoading = data.isLoadingChildren;

    return (
        <div style={style} className="relative group cursor-pointer select-none">
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
            <div className="text-sm leading-snug break-words whitespace-pre-wrap">
                {data.label}
            </div>
            {hasChildren && (
                <button
                    onClick={(e) => { e.stopPropagation(); data.onToggleExpand?.(id); }}
                    className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center shadow-sm hover:border-blue-500 hover:bg-blue-50 transition-all z-10"
                    title={isExpanded ? 'Thu gọn' : 'Mở rộng'}
                >
                    {isLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
                    ) : isExpanded ? (
                        <ChevronDown className="w-3 h-3 text-gray-500" />
                    ) : (
                        <Plus className="w-3 h-3 text-gray-500" />
                    )}
                </button>
            )}
            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
};

// ===== Node style helpers =====
const getNodeStyle = (type: string, isHighlight = false): any => {
    const base: any = { width: nodeWidth, padding: 10, borderRadius: 8, fontWeight: 400 };
    if (isHighlight) {
        return { ...base, backgroundColor: '#fef08a', border: '2px solid #eab308', boxShadow: '0 0 15px rgba(234,179,8,0.5)', color: '#854d0e', fontWeight: 700 };
    }
    switch (type) {
        case 'PROJECT': return { ...base, backgroundColor: '#eff6ff', border: '2px solid #3b82f6', color: '#1e3a8a', fontWeight: 600 };
        case 'CATEGORY': return { ...base, backgroundColor: '#fffbeb', border: '1.5px solid #f59e0b', color: '#78350f' };
        case 'PACKAGE': return { ...base, backgroundColor: '#faf5ff', border: '1.5px solid #a855f7', color: '#581c87' };
        case 'TASK': return { ...base, backgroundColor: '#ecfdf5', border: '1.5px solid #10b981', color: '#064e3b' };
        default: return { ...base, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#334155' };
    }
};

const getNodeEmoji = (type: string) => {
    switch (type) {
        case 'PROJECT': return '📁';
        case 'CATEGORY': return '📂';
        case 'PACKAGE': return '📦';
        case 'TASK': return '📝';
        default: return '📄';
    }
};

// ===== RECURSIVE LAYOUT BUILDER =====

// Tính chiều cao node dựa vào độ dài label
const calcNodeHeight = (label: string): number => {
    const len = (label || '').length;
    // Mỗi ~35 ký tự = 1 dòng, mỗi dòng ~22px, tối thiểu 46px
    return Math.max(46, Math.ceil(len / 35) * 22 + 16);
};

const computeRecursiveLayout = (
    rfNodes: Node[],
    rfEdges: Edge[],
    nodeLayouts: Record<string, string>,
    globalLayoutDir: string
): { nodes: Node[], edges: Edge[] } => {
    if (rfNodes.length === 0) return { nodes: [], edges: [] };

    const adjacency: Record<string, string[]> = {};
    const nodeMap = new Map<string, Node>();

    rfNodes.forEach(n => {
        nodeMap.set(n.id, n);
        adjacency[n.id] = [];
    });

    const hasParent = new Set<string>();
    rfEdges.forEach(e => {
        if (adjacency[e.source]) {
            adjacency[e.source].push(e.target);
            hasParent.add(e.target);
        }
    });

    // Tìm các node gốc (root)
    const roots = rfNodes.filter(n => !hasParent.has(n.id)).map(n => n.id);
    const resultNodes: Node[] = [];

    // Hàm layout đệ quy cho từng nhánh (Bottom-up)
    const layoutSubtree = (nodeId: string, inheritedLayout?: string): { nodes: Node[], minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } => {
        let layoutType = nodeLayouts[nodeId] || inheritedLayout || globalLayoutDir;
        let effectiveLayout = layoutType;
        let passDownLayout = layoutType;

        if (layoutType === 'TIMELINE') {
            effectiveLayout = 'TIMELINE';
            passDownLayout = 'LIST'; // Con của timeline sẽ ở dạng list dọc
        }

        const children = adjacency[nodeId] || [];
        const n = nodeMap.get(nodeId)!;
        const labelLen = (n.data.label || '').length;
        const nW = nodeWidth;
        const nH = Math.max(46, Math.ceil(labelLen / 30) * 22 + 20);

        const childLayouts = children.map(childId => layoutSubtree(childId, passDownLayout));

        const localNodes: Node[] = [];

        // Luôn đặt root của nhánh này tại (0,0)
        localNodes.push({
            ...n,
            position: { x: 0, y: 0 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
        });

        if (effectiveLayout === 'TIMELINE') {
            let currentX = nW + 60;
            children.forEach((childId, idx) => {
                const cLayout = childLayouts[idx];
                const childRootX = currentX - cLayout.minX;
                const childRootY = 0;

                cLayout.nodes.forEach(cn => {
                    localNodes.push({
                        ...cn,
                        position: { x: cn.position.x + childRootX, y: cn.position.y + childRootY },
                        targetPosition: cn.id === childId ? Position.Left : cn.targetPosition
                    });
                });

                currentX = childRootX + cLayout.maxX + 60;
            });
        }
        else if (effectiveLayout === 'LIST') {
            let currentY = Math.max(nH + 20, 60);
            children.forEach((childId, idx) => {
                const cLayout = childLayouts[idx];
                const childRootX = 30; // Thụt lề
                const childRootY = currentY - cLayout.minY;

                cLayout.nodes.forEach(cn => {
                    localNodes.push({
                        ...cn,
                        position: { x: cn.position.x + childRootX, y: cn.position.y + childRootY },
                        targetPosition: cn.id === childId ? Position.Left : cn.targetPosition
                    });
                });

                currentY = childRootY + cLayout.maxY + 20;
            });
        }
        else {
            const g = new dagre.graphlib.Graph();
            g.setGraph({
                rankdir: effectiveLayout,
                nodesep: 60,
                ranksep: 140,
                edgesep: 20,
            });
            g.setDefaultEdgeLabel(() => ({}));

            g.setNode(nodeId, { width: nW, height: nH });
            children.forEach((childId, idx) => {
                const cLayout = childLayouts[idx];
                // Thêm padding dọc để DOCUMENT nodes không chồng nhau
                g.setNode(`subtree_${childId}`, { width: cLayout.width, height: cLayout.height + 20 });
                g.setEdge(nodeId, `subtree_${childId}`);
            });

            dagre.layout(g);
            const rootOut = g.node(nodeId);

            children.forEach((childId, idx) => {
                const cLayout = childLayouts[idx];
                const subOut = g.node(`subtree_${childId}`);

                // Căn chỉnh tâm của cLayout vào đúng toạ độ subOut (so với rootOut)
                let childRootX = subOut.x - rootOut.x - (cLayout.minX + cLayout.maxX) / 2;
                let childRootY = subOut.y - rootOut.y - (cLayout.minY + cLayout.maxY) / 2;

                if (effectiveLayout === 'LR') childRootX = nW + 120 - cLayout.minX; // 120 là ranksep
                else if (effectiveLayout === 'RL') childRootX = -nW - 120 - cLayout.maxX;
                else if (effectiveLayout === 'TB') childRootY = nH + 120 - cLayout.minY;
                else if (effectiveLayout === 'BT') childRootY = -nH - 120 - cLayout.maxY;

                cLayout.nodes.forEach(cn => {
                    localNodes.push({
                        ...cn,
                        position: { x: cn.position.x + childRootX, y: cn.position.y + childRootY },
                        targetPosition: cn.id === childId ?
                            (effectiveLayout === 'LR' ? Position.Left : effectiveLayout === 'RL' ? Position.Right : effectiveLayout === 'TB' ? Position.Top : Position.Bottom)
                            : cn.targetPosition
                    });
                });
            });
        }

        // Tính bounding box MỚI của toàn bộ localNodes, dựa trên root (0,0)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        localNodes.forEach(rn => {
            const h = rn.id === nodeId ? nH : calcNodeHeight(rn.data.label || '');
            minX = Math.min(minX, rn.position.x);
            minY = Math.min(minY, rn.position.y);
            maxX = Math.max(maxX, rn.position.x + nodeWidth);
            maxY = Math.max(maxY, rn.position.y + h);
        });

        if (minX === Infinity) { minX = 0; minY = 0; maxX = nW; maxY = nH; }

        return { nodes: localNodes, minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    };

    // Ghép các Root độc lập lại với nhau theo chiều dọc
    let currentY = 0;
    roots.forEach(rootId => {
        const layout = layoutSubtree(rootId);
        layout.nodes.forEach(n => {
            resultNodes.push({
                ...n,
                position: { x: n.position.x, y: n.position.y + currentY }
            });
        });
        currentY += layout.maxY + 80; // Khoảng cách giữa các cây cha
    });

    return { nodes: resultNodes, edges: rfEdges };
};

// ========================================
// ===== MAIN COMPONENT =====
// ========================================
export const Mindmap = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { settings } = useAppSettingsStore();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [loading, setLoading] = useState(true);

    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const targetNodeId = queryParams.get('nodeId');
    const targetDocId = queryParams.get('docId');

    const [rfInstance, setRfInstance] = useState<any>(null);
    const [hasZoomed, setHasZoomed] = useState(false);

    // Lưu dữ liệu thô đã fetch (node DB data)
    const loadedNodesRef = useRef<Map<string, any>>(new Map());
    const loadedDocsRef = useRef<Map<string, any>>(new Map()); // Mới: Lưu Docs
    const loadedDocsNodeIds = useRef<Set<string>>(new Set()); // Track: node nào đã fetch docs rồi

    // Set các node đã expanded (đã fetch children)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    // Set các node đang loading children
    const [loadingChildrenIds, setLoadingChildrenIds] = useState<Set<string>>(new Set());
    // Map nodeId -> childCount (để biết có con hay không)
    const childCountRef = useRef<Map<string, number>>(new Map());

    const [nodeLayouts, setNodeLayouts] = useState<Record<string, string>>({});
    const nodeTypes = useMemo(() => ({ custom: CustomMindmapNode }), []);

    // Menu Settings & Preview State
    const [selectedNode, setSelectedNode] = useState<any>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [previewDoc, setPreviewDoc] = useState<any | null>(null);

    // ===== Hàm tính prefix số thứ tự =====
    const getPrefix = useCallback((nodeId: string): string => {
        const node = loadedNodesRef.current.get(nodeId);
        if (!node || !node.parentId) {
            // Node gốc (Dự án) → tìm thứ tự trong siblings
            return ''; // Dự án gốc không có prefix
        }
        // Tìm siblings
        const siblings = Array.from(loadedNodesRef.current.values())
            .filter(n => n.parentId === node.parentId)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const idx = siblings.findIndex(s => s.id === nodeId);
        const parentPrefix = getPrefix(node.parentId);
        // Nếu parent là Dự án gốc (level 0) → bỏ prefix cha
        const parent = loadedNodesRef.current.get(node.parentId);
        if (parent && !parent.parentId) {
            return `${idx + 1}.`;
        }
        return parentPrefix ? `${parentPrefix}${idx + 1}.` : `${idx + 1}.`;
    }, []);

    // ===== Fetch children của 1 node =====
    const fetchChildren = useCallback(async (parentId: string): Promise<any[]> => {
        const snap = await getDocs(query(collection(db, 'project_nodes'), where('parentId', '==', parentId)));
        // Không lọc bỏ TASK ở đây để ta có thể dùng ID của TASK tìm văn bản đính kèm
        const children = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
        children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        children.forEach(c => {
            loadedNodesRef.current.set(c.id, c);
            if (c.mindmapLayout) setNodeLayouts(prev => ({ ...prev, [c.id]: c.mindmapLayout }));
        });
        return children;
    }, []);

    // ===== Đếm children (không fetch full data, chỉ count) =====
    const countChildren = useCallback(async (nodeIds: string[]) => {
        if (nodeIds.length === 0) return;

        // Firestore 'in' limitation
        const batches: string[][] = [];
        for (let i = 0; i < nodeIds.length; i += 30) {
            batches.push(nodeIds.slice(i, i + 30));
        }

        for (const batch of batches) {
            // Lấy tất cả children (bao gồm cả TASK)
            const snap = await getDocs(query(collection(db, 'project_nodes'), where('parentId', 'in', batch)));
            const allNodesInBatch = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

            // Tìm tất cả TASK IDs trong batch này để đếm văn bản gắn vào TASK
            const taskIds = allNodesInBatch.filter(n => n.type === 'TASK').map(n => n.id);
            const nonTaskNodes = allNodesInBatch.filter(n => n.type !== 'TASK');

            // Query links cho tất cả node trong batch + các TASK con (nếu đã biết)
            const nodeAndTaskIds = [...batch, ...taskIds];
            const linkBatches: string[][] = [];
            for (let i = 0; i < nodeAndTaskIds.length; i += 30) {
                linkBatches.push(nodeAndTaskIds.slice(i, i + 30));
            }

            const counts: Record<string, number> = {};

            // Đếm các node con không phải TASK
            nonTaskNodes.forEach(n => {
                counts[n.parentId] = (counts[n.parentId] || 0) + 1;
            });

            // Đếm văn bản (Links)
            for (const lb of linkBatches) {
                const snapLinks = await getDocs(query(collection(db, 'vanban_node_links'), where('nodeId', 'in', lb)));
                snapLinks.docs.forEach(d => {
                    const lData = d.data() as any;
                    const directNodeId = lData.nodeId;

                    // Nếu link gắn vào TASK, ta tính cho parent của TASK đó
                    const taskNode = allNodesInBatch.find(n => n.id === directNodeId);
                    const targetId = (taskNode && taskNode.type === 'TASK') ? taskNode.parentId : directNodeId;

                    if (batch.includes(targetId)) {
                        counts[targetId] = (counts[targetId] || 0) + 1;
                    }
                });
            }

            batch.forEach(id => {
                childCountRef.current.set(id, counts[id] || 0);
            });
        }
    }, []);

    // ===== Build ReactFlow nodes+edges từ loaded data =====
    const buildGraph = useCallback(() => {
        const rfNodes: Node[] = [];
        const rfEdges: Edge[] = [];

        // Root node
        rfNodes.push({
            id: 'system-root',
            type: 'custom',
            position: { x: 0, y: 0 },
            data: {
                label: `🏗️ ${settings.appName}`,
                style: { backgroundColor: '#e0f2fe', fontWeight: 'bold', width: nodeWidth, padding: 12, borderRadius: 10, border: '2px solid #0284c7', color: '#0c4a6e', fontSize: 14 },
                hasChildren: true,
                isExpanded: true,
            }
        });

        const addNodeToGraph = (dbNode: any) => {
            const isHighlight = targetNodeId === dbNode.id;
            const prefix = getPrefix(dbNode.id);
            const emoji = getNodeEmoji(dbNode.type);
            const hasKids = (childCountRef.current.get(dbNode.id) || 0) > 0;
            const isExp = expandedIds.has(dbNode.id);
            const isLoadingKids = loadingChildrenIds.has(dbNode.id);

            const isDoc = dbNode.type === 'DOCUMENT';

            let label = `${emoji} ${prefix} ${dbNode.name || 'Chưa đặt tên'}`;
            let style = getNodeStyle(dbNode.type, isHighlight);

            if (isDoc) {
                const docLabelParts = [
                    `${dbNode.loaiVanBan || 'Văn bản'}`,
                    dbNode.soKyHieu ? `số ${dbNode.soKyHieu}` : '',
                    dbNode.ngayBanHanh ? `ngày ${dbNode.ngayBanHanh}` : '',
                    dbNode.coQuanBanHanh ? `của ${dbNode.coQuanBanHanh.toUpperCase()}` : '',
                    (dbNode.trichYeu || dbNode.fileNameOriginal) ? `- ${dbNode.trichYeu || dbNode.fileNameOriginal}` : ''
                ];
                label = `📄 ${docLabelParts.filter(Boolean).join(' ')}`;
                style = {
                    backgroundColor: 'transparent',
                    border: 'none',
                    color: '#334155',
                    textDecoration: 'none',
                    width: nodeWidth,
                    padding: '4px 8px',
                    fontSize: 13,
                    boxShadow: 'none',
                    fontWeight: 500
                };
            }

            rfNodes.push({
                id: dbNode.id,
                type: 'custom',
                position: { x: 0, y: 0 },
                data: {
                    label: label,
                    style: style,
                    hasChildren: hasKids,
                    isExpanded: isExp,
                    isLoadingChildren: isLoadingKids,
                    onToggleExpand: isDoc ? undefined : handleToggleExpand, // Document không thể Mở rộng nhánh con
                    nodeType: dbNode.type,
                    _rawDoc: isDoc ? dbNode : null, // Lưu trực tiếp payload Văn bản
                }
            });

            const parentId = dbNode.parentId || 'system-root';
            rfEdges.push({
                id: `e-${parentId}-${dbNode.id}`,
                source: parentId,
                target: dbNode.id,
                type: 'smoothstep',
                animated: dbNode.type === 'PROJECT',
                style: { stroke: dbNode.type === 'PROJECT' ? '#94a3b8' : '#cbd5e1', strokeWidth: dbNode.type === 'PROJECT' ? 2 : 1.5 }
            });
        };


        const traverse = (parentId: string | null) => {
            const children = Array.from(loadedNodesRef.current.values())
                .filter(n => (n.parentId || null) === parentId)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

            const docs = Array.from(loadedDocsRef.current.values())
                .filter(d => (d.parentId || null) === parentId)
                .sort((a, b) => {
                    // Sắp xếp theo ngày ban hành: cũ nhất → mới nhất (trên → dưới)
                    const dateA = a.ngayBanHanh || '';
                    const dateB = b.ngayBanHanh || '';
                    return dateA.localeCompare(dateB);
                });

            children.forEach(child => {
                if (child.type !== 'TASK') {
                    addNodeToGraph(child);
                }
                if (expandedIds.has(child.id)) {
                    traverse(child.id);
                }
            });

            // Render docs as leaf nodes - sorted by date oldest first
            docs.forEach(doc => {
                addNodeToGraph(doc);
            });
        };

        traverse(null); // Start from roots (parentId === null)

        // Sử dụng Đệ quy Layout để bóc tách toạ độ và hướng cho từng nhánh
        const direction = nodeLayouts['__global'] || 'LR';
        const { nodes: laidNodes, edges: laidEdges } = computeRecursiveLayout(rfNodes, rfEdges, nodeLayouts, direction);
        setNodes(laidNodes);
        setEdges(laidEdges);
    }, [expandedIds, loadingChildrenIds, nodeLayouts, targetNodeId, setNodes, setEdges, getPrefix, settings.appName]);

    // ===== Toggle Expand =====
    const handleToggleExpand = useCallback(async (nodeId: string) => {
        if (expandedIds.has(nodeId)) {
            // Collapse: remove from expanded
            setExpandedIds(prev => {
                const next = new Set(prev);
                next.delete(nodeId);
                // Cũng collapse tất cả con cháu
                const removeDescendants = (pid: string) => {
                    Array.from(loadedNodesRef.current.values())
                        .filter(n => n.parentId === pid)
                        .forEach(child => {
                            next.delete(child.id);
                            removeDescendants(child.id);
                        });
                };
                removeDescendants(nodeId);
                return next;
            });
        } else {
            // Expand: fetch children nếu chưa có
            const existingChildren = Array.from(loadedNodesRef.current.values()).filter(n => n.parentId === nodeId);
            const needsFetchChildren = existingChildren.length === 0;
            const needsFetchDocs = !loadedDocsNodeIds.current.has(nodeId);

            if (needsFetchChildren || needsFetchDocs) {
                setLoadingChildrenIds(prev => new Set(prev).add(nodeId));
                try {
                    let children: any[] = existingChildren;
                    if (needsFetchChildren) {
                        children = await fetchChildren(nodeId);
                        // Count grandchildren
                        await countChildren(children.map(c => c.id));
                    }

                    // Fetch Documents của Node này và của các TASK con của nó
                    if (needsFetchDocs) {
                        loadedDocsNodeIds.current.add(nodeId);

                        // Tìm các TASK IDs thuộc nodeId này
                        const childTaskIds = children.filter(c => c.type === 'TASK').map(c => c.id);
                        const queryIds = [nodeId, ...childTaskIds];

                        const dl: any[] = [];
                        // Query links theo từng batch 30
                        for (let i = 0; i < queryIds.length; i += 30) {
                            const batch = queryIds.slice(i, i + 30);
                            const snapLinks = await getDocs(query(collection(db, 'vanban_node_links'), where('nodeId', 'in', batch)));
                            const linkData = snapLinks.docs.map(d => ({ id: d.id, ...d.data() as any }));

                            for (const link of linkData) {
                                try {
                                    const { getDoc: getDocFn, doc: docRef } = await import('firebase/firestore');
                                    const vbDoc = await getDocFn(docRef(db, 'vanban', link.vanBanId));
                                    if (vbDoc.exists()) {
                                        // Gán parentId là nodeId hiện tại (Hạng mục) để hiển thị trên Mindmap tại đây
                                        dl.push({
                                            id: vbDoc.id,
                                            ...vbDoc.data(),
                                            _linkId: link.id,
                                            parentId: nodeId,
                                            _realNodeId: link.nodeId, // Lưu lại ID gốc (có thể là TASK)
                                            type: 'DOCUMENT'
                                        });
                                    }
                                } catch (e) { /* skip */ }
                            }
                        }
                        dl.forEach(d => loadedDocsRef.current.set(d.id, d));
                    }
                } finally {
                    setLoadingChildrenIds(prev => {
                        const next = new Set(prev);
                        next.delete(nodeId);
                        return next;
                    });
                }
            }
            setExpandedIds(prev => new Set(prev).add(nodeId));
        }
    }, [expandedIds, fetchChildren, countChildren]);

    // ===== Initial Load =====
    useEffect(() => {
        const init = async () => {
            setLoading(true);
            try {
                // 1. Fetch tất cả project_nodes
                const allSnap = await getDocs(query(collection(db, 'project_nodes')));
                const allNodes = allSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const nonTaskNodes = allNodes.filter(n => n.type !== 'TASK');
                const parentIdSet = new Set(nonTaskNodes.map(n => n.id));

                // Roots = nodes không có parentId HOẶC parentId không tồn tại
                const roots = nonTaskNodes.filter(n => !n.parentId || !parentIdSet.has(n.parentId));
                roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                roots.forEach(r => {
                    r.parentId = null; // Normalize
                    loadedNodesRef.current.set(r.id, r);
                    if (r.mindmapLayout) setNodeLayouts(prev => ({ ...prev, [r.id]: r.mindmapLayout }));
                });

                // 2. Fetch children cấp 1 (Hạng mục lớn) cho mỗi Dự án
                const rootIds = roots.map(r => r.id);
                await countChildren(rootIds);

                // Auto-expand roots và fetch cấp 1
                const initialExpanded = new Set<string>();
                for (const root of roots) {
                    initialExpanded.add(root.id);
                    const children = allNodes.filter(n => n.parentId === root.id);
                    children.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
                    children.forEach(c => {
                        loadedNodesRef.current.set(c.id, c);
                        if (c.mindmapLayout) setNodeLayouts(prev => ({ ...prev, [c.id]: c.mindmapLayout }));
                    });
                }

                // Count grandchildren (cấp 2)
                const level1Ids = Array.from(loadedNodesRef.current.values())
                    .filter(n => n.parentId && rootIds.includes(n.parentId))
                    .map(n => n.id);
                await countChildren(level1Ids);

                // ====== FETCH DOCS cho tất cả nodes đã được auto-load ======
                // Batch fetch vanban_node_links cho roots + level1 nodes + các TASK con của chúng
                const autoLoadedCategoryIds = [...rootIds, ...level1Ids];
                const autoLoadedAllIds = [...autoLoadedCategoryIds];

                // Bao gồm cả các TASK con để lấy files
                allNodes.forEach(n => {
                    if (n.type === 'TASK' && autoLoadedCategoryIds.includes(n.parentId)) {
                        autoLoadedAllIds.push(n.id);
                    }
                });

                const batchSize = 30;
                for (let i = 0; i < autoLoadedAllIds.length; i += batchSize) {
                    const batchIds = autoLoadedAllIds.slice(i, i + batchSize);
                    const snapLinks = await getDocs(
                        query(collection(db, 'vanban_node_links'), where('nodeId', 'in', batchIds))
                    );
                    const linkData = snapLinks.docs.map(d => ({ id: d.id, ...d.data() as any }));

                    // Mark các CAT nodes đã fetch docs (chỉ mark Category, không cần mark Task riêng)
                    batchIds.forEach(id => {
                        if (autoLoadedCategoryIds.includes(id)) {
                            loadedDocsNodeIds.current.add(id);
                        }
                    });

                    // Fetch từng văn bản song song
                    const { getDoc: getDocFn, doc: docRef } = await import('firebase/firestore');
                    const docPromises = linkData.map(async (link) => {
                        try {
                            const vbDoc = await getDocFn(docRef(db, 'vanban', link.vanBanId));
                            if (vbDoc.exists()) {
                                // Nếu link là của TASK, thì parentId thực tế trên mindmap là parent của TASK đó
                                const nodeInfo = allNodes.find(n => n.id === link.nodeId);
                                const vParentId = (nodeInfo && nodeInfo.type === 'TASK') ? nodeInfo.parentId : link.nodeId;

                                return {
                                    id: vbDoc.id,
                                    ...vbDoc.data(),
                                    _linkId: link.id,
                                    parentId: vParentId,
                                    _realNodeId: link.nodeId,
                                    type: 'DOCUMENT'
                                };
                            }
                        } catch (e) { /* skip */ }
                        return null;
                    });
                    const docResults = await Promise.all(docPromises);
                    docResults.filter(Boolean).forEach((d: any) => loadedDocsRef.current.set(d.id, d));
                }

                setExpandedIds(initialExpanded);

            } catch (error) {
                console.error('Mindmap init error:', error);
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [countChildren]);

    // ===== Rebuild graph khi data thay đổi =====
    useEffect(() => {
        if (!loading) {
            buildGraph();
        }
    }, [expandedIds, loadingChildrenIds, nodeLayouts, loading, buildGraph]);

    // ===== Auto-zoom tới target =====
    useEffect(() => {
        if (rfInstance && nodes.length > 0 && !hasZoomed && (targetNodeId || targetDocId)) {
            const focusId = targetNodeId || null;
            if (focusId && nodes.find(n => n.id === focusId)) {
                setHasZoomed(true);
                setTimeout(() => {
                    rfInstance.fitView({ nodes: [{ id: focusId }], duration: 1500, maxZoom: 1.2 });
                }, 600);
            }
        }
    }, [rfInstance, nodes, targetNodeId, targetDocId, hasZoomed]);

    // ===== Node Click → Document Preview hoặc Settings =====
    const onNodeClick = useCallback(async (_: React.MouseEvent, node: Node) => {
        if (node.id === 'system-root') return;

        if (node.data.nodeType === 'DOCUMENT') {
            setPreviewDoc(node.data._rawDoc);
        } else {
            setSelectedNode(node);
            setIsSidebarOpen(true);
        }
    }, []);

    const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    // ===== Map Type =====
    const handleUpdateLayoutType = async (type: string) => {
        if (!selectedNode?.id) return;
        try {
            await updateDoc(doc(db, 'project_nodes', selectedNode.id), { mindmapLayout: type });
            setNodeLayouts(prev => ({ ...prev, [selectedNode.id]: type }));
        } catch (e) {
            console.error('Layout update error:', e);
        }
    };

    // ===== RENDER =====
    return (
        <div className="h-full bg-gray-50 p-4">
            <div className="bg-white w-full h-full rounded-xl shadow-inner border overflow-hidden relative">
                {loading && (
                    <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
                    </div>
                )}
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onNodeClick={onNodeClick}
                    fitView
                    attributionPosition="bottom-right"
                    onInit={setRfInstance}
                >
                    <Controls />
                    <MiniMap />
                    <Background gap={16} size={1} color="#e5e7eb" />
                </ReactFlow>

                {/* Node Details Sidebar */}
                <div className={`absolute top-0 right-0 h-full w-96 bg-white shadow-2xl border-l border-gray-200 transform transition-transform duration-300 ease-in-out z-20 flex flex-col ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
                    <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                        <h3 className="font-bold text-gray-800 text-lg truncate pr-4">
                            {selectedNode?.data?.label?.replace(/[📂📄📁📦📝🏗️]\s*/g, '') || 'Chi tiết Node'}
                        </h3>
                        <button onClick={() => setIsSidebarOpen(false)} className="p-1.5 hover:bg-gray-200 rounded-md text-gray-500 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4">
                        {/* Chọn loại bản đồ */}
                        <div className="mb-8 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                            <h4 className="font-semibold text-blue-800 flex items-center gap-2 mb-3">
                                <Layers className="w-4 h-4" /> Loại Sơ đồ (Map Type)
                            </h4>
                            <div className="grid grid-cols-2 gap-2">
                                {[
                                    { id: 'LR', label: 'Radial Map', desc: 'Tỏa Phải' },
                                    { id: 'TIMELINE', label: 'Timeline', desc: 'Dọc ngang (Dự án)' },
                                    { id: 'TB', label: 'Tree Map', desc: 'Dọc (Cây)' },
                                    { id: 'RL', label: 'Left Map', desc: 'Tỏa Trái' },
                                    { id: 'BT', label: 'Org-Chart', desc: 'Từ dưới lên' },
                                ].map(type => (
                                    <button
                                        key={type.id}
                                        onClick={() => handleUpdateLayoutType(type.id)}
                                        className={`p-2 rounded-lg border text-left transition-all ${(nodeLayouts[selectedNode?.id] || 'LR') === type.id
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400'
                                            }`}
                                    >
                                        <p className="font-bold text-xs">{type.label}</p>
                                        <p className={`text-[10px] ${(nodeLayouts[selectedNode?.id] || 'LR') === type.id ? 'text-blue-100' : 'text-gray-400'}`}>
                                            {type.desc}
                                        </p>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 text-[10px] text-blue-500 italic">
                                * Loại sơ đồ áp dụng cho toàn bộ đồ thị.
                            </div>
                        </div>

                        {/* Bỏ mục Văn bản do đã đưa lên nhánh cây chung */}
                    </div>
                </div>
            </div>

            {/* Document Preview Modal */}
            {previewDoc && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setPreviewDoc(null); }}
                >
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[92vh] mx-4 flex flex-col overflow-hidden">
                        {(() => {
                            const { Icon, bg, color } = getDocIconConfig(previewDoc);
                            const previewUrl = previewDoc.storageUrl || null;
                            const drivePreviewUrl = previewDoc.driveFileId_Original
                                ? `https://drive.google.com/file/d/${previewDoc.driveFileId_Original}/preview`
                                : null;
                            return (
                                <>
                                    {/* Header */}
                                    <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50 shrink-0">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className={`w-9 h-9 rounded-lg ${bg} ${color} flex items-center justify-center shrink-0`}>
                                                <Icon className="w-5 h-5" />
                                            </span>
                                            <div className="min-w-0">
                                                <h3 className="font-bold text-gray-900 truncate">
                                                    {previewDoc.loaiVanBan} {previewDoc.soKyHieu || previewDoc.fileNameOriginal || 'Văn bản'}
                                                </h3>
                                                <p className="text-xs text-gray-500 truncate">
                                                    {previewDoc.coQuanBanHanh}{previewDoc.ngayBanHanh ? ` • ${previewDoc.ngayBanHanh}` : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                            {previewDoc.storageUrl && (
                                                <a href={previewDoc.storageUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-1.5 text-sm text-blue-600 border border-blue-200 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors font-medium">
                                                    <ExternalLink className="w-3.5 h-3.5" /> Mở gốc
                                                </a>
                                            )}
                                            <button onClick={() => setPreviewDoc(null)} className="p-2 hover:bg-gray-200 rounded-lg transition-colors">
                                                <X className="w-5 h-5 text-gray-500" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Body */}
                                    <div className="flex flex-1 overflow-hidden">
                                        {/* Left: Metadata */}
                                        <div className="w-72 shrink-0 border-r border-gray-200 overflow-y-auto p-5 space-y-4 bg-white">
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
                                </>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
};

