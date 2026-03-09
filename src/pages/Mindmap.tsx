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
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { getDocIconConfig, getDocFormattedTitle } from '../utils/docUtils';

const nodeWidth = 280;

// Bỏ getDocIconConfig nội bộ, sử dụng từ docUtils

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
            {data.totalDocCount > 0 && (
                <div className="absolute -top-2 -right-2 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                    {data.totalDocCount}
                </div>
            )}
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
        case 'FOLDER': return { ...base, backgroundColor: '#f0fdf4', border: '1.5px solid #10b981', color: '#064e3b' };
        case 'TASK': return { ...base, backgroundColor: '#ecfdf5', border: '1.5px solid #10b981', color: '#064e3b' };
        default: return { ...base, backgroundColor: '#ffffff', border: '1px solid #cbd5e1', color: '#334155' };
    }
};

const getNodeEmoji = (type: string) => {
    switch (type) {
        case 'PROJECT': return '📁';
        case 'CATEGORY': return '📂';
        case 'PACKAGE': return '📦';
        case 'FOLDER': return '📁';
        case 'TASK': return '📝';
        case 'DOCUMENT': return '📄';
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
    const allLinksRef = useRef<Map<string, any[]>>(new Map()); // nodeId -> links[]

    // Set các node đã expanded (đã fetch children)
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    // Set các node đang loading children
    const [loadingChildrenIds, setLoadingChildrenIds] = useState<Set<string>>(new Set());
    // Map nodeId -> childCount (để biết có con hay không)
    const childCountRef = useRef<Map<string, number>>(new Map());
    // Tăng counter này mỗi khi load xong Docs mới -> trigger lại buildGraph
    const [docRevision, setDocRevision] = useState(0);

    const [nodeLayouts, setNodeLayouts] = useState<Record<string, string>>({});
    const nodeTypes = useMemo(() => ({ custom: CustomMindmapNode }), []);

    // Menu Settings & Preview State
    const [selectedNode, setSelectedNode] = useState<Node | null>(null);
    const [selectedNodeDescendants, setSelectedNodeDescendants] = useState<Set<string>>(new Set());
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

        // Tính toán tổng số văn bản (DOCUMENT) cho TẤT CẢ các Node từ Root xuống
        // Điều này đảm bảo những node CHƯA EXPAND cũng có tổng số văn bản đúng (KHÔNG tính thư mục)
        const calculateTotalDocs = (node: any): number => {
            if (!node || node.type === 'DOCUMENT') return 0;
            const directLinks = allLinksRef.current.get(node.id) || [];
            const directCount = directLinks.length;

            const subNodes = Array.from(loadedNodesRef.current.values()).filter(n => n.parentId === node.id);
            const childrenCount = subNodes.reduce((sum, sn) => sum + calculateTotalDocs(sn), 0);

            node.totalDocCount = directCount + childrenCount;
            return node.totalDocCount;
        };
        const rootsToCount = Array.from(loadedNodesRef.current.values()).filter(n => !n.parentId);
        rootsToCount.forEach(r => calculateTotalDocs(r));

        const addNodeToGraph = (dbNode: any) => {
            const isHighlight = targetNodeId === dbNode.id;
            const prefix = getPrefix(dbNode.id);
            const emoji = getNodeEmoji(dbNode.type);
            const hasKids = (childCountRef.current.get(dbNode.id) || 0) > 0;
            const isExp = expandedIds.has(dbNode.id);
            const isLoadingKids = loadingChildrenIds.has(dbNode.id);

            // Document nodes CAN be added to the graph directly
            // Removed filter return; for Document


            let label = '';
            let style = getNodeStyle(dbNode.type, isHighlight);

            if (dbNode.type === 'DOCUMENT') {
                label = getDocFormattedTitle(dbNode);
                style = { ...style, backgroundColor: '#f8fafc', border: '1px dashed #64748b', color: '#334155' };
            } else {
                label = `${emoji} ${prefix} ${dbNode.name || 'Chưa đặt tên'}`;
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
                    onToggleExpand: handleToggleExpand,
                    nodeType: dbNode.type,
                    totalDocCount: dbNode.type === 'DOCUMENT' ? 0 : (dbNode.totalDocCount || 0),
                    _rawDoc: dbNode.type === 'DOCUMENT' ? dbNode : null,
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

            children.forEach(child => {
                addNodeToGraph(child);

                if (expandedIds.has(child.id)) {
                    traverse(child.id);

                    // Thêm Document nodes thuộc nhánh child này
                    const docs = Array.from(loadedDocsRef.current.values()).filter(d => d.parentId === child.id);
                    docs.forEach(doc => {
                        addNodeToGraph(doc);
                    });
                }
            });
        };

        traverse(null);

        // Thêm Document nodes thuộc nhánh system-root (nếu có)
        if (expandedIds.has('system-root')) {
            const rootDocs = Array.from(loadedDocsRef.current.values()).filter(d => d.parentId === 'system-root' || !d.parentId);
            rootDocs.forEach(doc => {
                addNodeToGraph(doc);
            });
        }

        // Sử dụng Đệ quy Layout để bóc tách toạ độ và hướng cho từng nhánh
        const direction = nodeLayouts['__global'] || 'LR';
        const { nodes: laidNodes, edges: laidEdges } = computeRecursiveLayout(rfNodes, rfEdges, nodeLayouts, direction);
        setNodes(laidNodes);
        setEdges(laidEdges);
    }, [expandedIds, loadingChildrenIds, nodeLayouts, targetNodeId, setNodes, setEdges, getPrefix, settings.appName, docRevision]);

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
                        // Trigger buildGraph rebuild vì Ref không tự re-render
                        setDocRevision(prev => prev + 1);
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
                // 1. Fetch tất cả project_nodes (folders, projects, etc.)
                const allSnap = await getDocs(query(collection(db, 'project_nodes')));
                const allNodes = allSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));
                const nonTaskNodes = allNodes.filter(n => n.type !== 'TASK');

                // Track everything in Ref
                nonTaskNodes.forEach(n => {
                    loadedNodesRef.current.set(n.id, n);
                    if (n.mindmapLayout) setNodeLayouts(prev => ({ ...prev, [n.id]: n.mindmapLayout }));
                });

                // Tìm parentIdSet của các thư mục (để biết cái nào là cha của folder khác)
                const folderParentIds = new Set(nonTaskNodes.filter(n => n.parentId).map(n => n.parentId));

                // Roots
                const roots = nonTaskNodes.filter(n => !n.parentId || !loadedNodesRef.current.has(n.parentId));
                roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

                // Expand everything by default as requested
                const initialExpanded = new Set<string>();
                nonTaskNodes.forEach(n => {
                    initialExpanded.add(n.id);
                });
                roots.forEach(r => {
                    r.parentId = null; // Normalize
                });

                // 2. Đếm con (thư mục) từ dữ liệu local để hiển thị nút +/-
                const localCounts: Record<string, number> = {};
                nonTaskNodes.forEach(n => {
                    if (n.parentId) {
                        localCounts[n.parentId] = (localCounts[n.parentId] || 0) + 1;
                    }
                });
                Object.entries(localCounts).forEach(([pid, count]) => {
                    childCountRef.current.set(pid, count as number);
                });

                setExpandedIds(initialExpanded);

                // 3. Fetch vanban and links to filter out folders from count
                const [linksSnap, docsSnap] = await Promise.all([
                    getDocs(collection(db, 'vanban_node_links')),
                    getDocs(collection(db, 'vanban'))
                ]);

                const allDocsMap = new Map<string, any>();
                docsSnap.docs.forEach(d => {
                    allDocsMap.set(d.id, { id: d.id, ...d.data() });
                });

                const linksMap = new Map<string, any[]>();
                const validLinkDocs = new Set<string>();

                linksSnap.docs.forEach(d => {
                    const data = d.data();
                    const nodeId = data.nodeId;
                    const docData = allDocsMap.get(data.vanBanId);

                    // Bỏ qua nếu là thư mục
                    const isFolder = docData && (docData.fileMimeType?.toLowerCase().includes('folder') || docData.loaiVanBan?.toLowerCase().includes('thư mục'));

                    if (!isFolder) {
                        validLinkDocs.add(d.id);
                        if (!linksMap.has(nodeId)) linksMap.set(nodeId, []);
                        linksMap.get(nodeId)!.push({ id: d.id, ...data });
                    }
                });
                allLinksRef.current = linksMap;

                // 4. Cộng thêm số links vào childCountRef để nút + xuất hiện đúng trên node lá có văn bản
                const allTaskNodes = allNodes.filter(n => n.type === 'TASK');
                const taskParentMap = new Map<string, string>();
                allTaskNodes.forEach(t => { if (t.parentId) taskParentMap.set(t.id, t.parentId); });

                linksSnap.docs.forEach(d => {
                    if (!validLinkDocs.has(d.id)) return; // Bỏ qua link folder
                    const data = d.data();
                    const linkNodeId: string = data.nodeId;
                    const targetNodeId = taskParentMap.has(linkNodeId) ? taskParentMap.get(linkNodeId)! : linkNodeId;
                    const currentCount = childCountRef.current.get(targetNodeId) || 0;
                    childCountRef.current.set(targetNodeId, currentCount + 1);
                });

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

        if (node.data?.nodeType === 'DOCUMENT' && node.data._rawDoc) {
            setPreviewDoc(node.data._rawDoc);
            return;
        }

        setSelectedNode(node);
        setIsSidebarOpen(true);

        // Fetch Documents của toàn bộ nhánh (chọn node nào hiện hết file của nhánh đó)
        if (!loadedDocsNodeIds.current.has(node.id)) {
            try {
                // Lấy tất cả node ID thuộc nhánh này (bao gồm node hiện tại và tất cả con cháu)
                const getAllDescendantIds = (pid: string): string[] => {
                    const children = Array.from(loadedNodesRef.current.values()).filter(n => n.parentId === pid);
                    let ids = [pid];
                    children.forEach(c => {
                        ids = [...ids, ...getAllDescendantIds(c.id)];
                    });
                    return ids;
                };

                const queryIds = getAllDescendantIds(node.id);
                setSelectedNodeDescendants(new Set(queryIds));

                for (let i = 0; i < queryIds.length; i += 30) {
                    const batch = queryIds.slice(i, i + 30);
                    const snapLinks = await getDocs(query(collection(db, 'vanban_node_links'), where('nodeId', 'in', batch)));
                    const linkData = snapLinks.docs.map(d => ({ id: d.id, ...d.data() as any }));

                    for (const link of linkData) {
                        try {
                            const { getDoc: getDocFn, doc: docRef } = await import('firebase/firestore');
                            const vbDoc = await getDocFn(docRef(db, 'vanban', link.vanBanId));
                            if (vbDoc.exists()) {
                                loadedDocsRef.current.set(vbDoc.id, {
                                    id: vbDoc.id,
                                    ...vbDoc.data(),
                                    _linkId: link.id,
                                    parentId: node.id, // Gán parentId là node được click để Sidebar dễ filter
                                    _realNodeId: link.nodeId,
                                    type: 'DOCUMENT'
                                });
                            }
                        } catch (e) { /* skip */ }
                    }
                }
                setSelectedNodeDescendants(new Set(getAllDescendantIds(node.id)));
                // Trigger re-render để sidebar cập nhật
                setSelectedNode({ ...node });
            } catch (e) {
                console.error('Fetch docs error on click:', e);
            }
        }
    }, [setSelectedNode]);

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
                                        className={`p-2 rounded-lg border text-left transition-all ${(nodeLayouts[selectedNode?.id || ''] || 'LR') === type.id
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                                            : 'bg-white border-gray-200 text-gray-700 hover:border-blue-400'
                                            }`}
                                    >
                                        <div className="text-xs font-bold uppercase">{type.label}</div>
                                        <div className={`text-[10px] ${(nodeLayouts[selectedNode?.id || ''] || 'LR') === type.id ? 'text-blue-100' : 'text-gray-400'}`}>{type.desc}</div>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 text-[10px] text-blue-500 italic">
                                * Loại sơ đồ áp dụng cho toàn bộ đồ thị.
                            </div>
                        </div>

                        {/* Danh sách Văn bản đính kèm */}
                        <div className="mb-8">
                            <h4 className="font-semibold text-gray-800 flex items-center gap-2 mb-3 border-b pb-2">
                                <FileText className="w-4 h-4" /> Danh sách Văn bản ({
                                    Array.from(loadedDocsRef.current.values())
                                        .filter(d => selectedNodeDescendants.has(d._realNodeId))
                                        .length
                                })
                            </h4>
                            <div className="space-y-3">
                                {Array.from(loadedDocsRef.current.values())
                                    .filter(d => selectedNodeDescendants.has(d._realNodeId))
                                    .sort((a, b) => {
                                        const dateA = a.ngayBanHanh ? new Date(a.ngayBanHanh).getTime() : 0;
                                        const dateB = b.ngayBanHanh ? new Date(b.ngayBanHanh).getTime() : 0;
                                        return dateA - dateB;
                                    })
                                    .map(doc => {
                                        const { Icon, bg, color } = getDocIconConfig(doc);
                                        return (
                                            <div
                                                key={`${doc.id}-${doc._realNodeId}`}
                                                className="p-3 bg-white border border-gray-100 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all group flex gap-3 items-start relative"
                                            >
                                                <div
                                                    onClick={() => setPreviewDoc(doc)}
                                                    className={`p-2 rounded-lg ${bg} ${color} shrink-0 cursor-pointer mt-1`}
                                                >
                                                    <Icon className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div onClick={() => setPreviewDoc(doc)} className="cursor-pointer">
                                                        <div className="text-sm font-medium text-gray-800 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                                                            {getDocFormattedTitle(doc)}
                                                        </div>
                                                        {doc.ngayBanHanh && (
                                                            <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                                                                <Clock className="w-3 h-3" /> {doc.ngayBanHanh.split('-').reverse().join('/')}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Danh sách file đính kèm */}
                                                    {(doc.attachments?.length > 0 || doc.dinhKem?.length > 0) && (
                                                        <div className="mt-2 space-y-1.5 border-t border-gray-100 pt-2">
                                                            {doc.attachments?.map((att: any, idx: number) => (
                                                                <a
                                                                    key={`att-${idx}`}
                                                                    href={att.webViewLink}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate">{att.fileName || att.originalName}</span>
                                                                </a>
                                                            ))}
                                                            {doc.dinhKem?.map((att: any, idx: number) => (
                                                                <div
                                                                    key={`dk-${idx}`}
                                                                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:bg-gray-50 px-2 py-1 rounded transition-colors cursor-pointer"
                                                                >
                                                                    <FileText className="w-3.5 h-3.5 shrink-0" />
                                                                    <span className="truncate">{att.fileName || att.name}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <button
                                                        onClick={() => setPreviewDoc(doc)}
                                                        className="text-gray-400 hover:text-blue-600" title="Xem nhanh"
                                                    >
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            navigate("/documents/" + doc.id);
                                                        }}
                                                        className="text-gray-400 hover:text-green-600" title="Xem chi tiết"
                                                    >
                                                        <Search className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                {Array.from(loadedDocsRef.current.values()).filter(d => selectedNodeDescendants.has(d._realNodeId)).length === 0 && (
                                    <div className="text-center py-8 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                        <p className="text-sm text-gray-400">Chưa có văn bản đính kèm</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Document Preview Modal */}
            {previewDoc && (
                <DocumentPreviewModal
                    doc={previewDoc}
                    onClose={() => setPreviewDoc(null)}
                />
            )}
        </div>
    );
};

