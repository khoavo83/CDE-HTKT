import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db, appFunctions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { useForm } from 'react-hook-form';
import { ArrowLeft, Clock, Save, Trash2, FileEdit, Folder, ArrowUpDown, ExternalLink, Sparkles, Loader2, CheckCircle, FileText, Image as ImageIcon, FolderTree } from 'lucide-react';
import { isoToVN, formatDateTime, formatBytes } from '../utils/formatVN';
import { useAuthStore } from '../store/useAuthStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useCategoryTabStore } from '../store/useCategoryTabStore';
import { ProjectTreeSelectorModal } from '../components/ProjectTreeSelectorModal';
import { DocumentTasks } from '../components/DocumentTasks';
import { DocumentActivityLog } from '../components/DocumentActivityLog';
import { logVanBanActivity } from '../utils/vanbanLogUtils';
import toast from 'react-hot-toast';

interface DocumentForm {
    soKyHieu: string;
    ngayBanHanh: string;
    coQuanBanHanh: string;
    loaiVanBan: string;
    trichYeu: string;
    nguoiKy: string;
    soTrang: string;
    trangThaiDuLieu: string;
    phanLoaiVanBan: string;
    mucDoKhan: string;
    fileNameOriginal: string;
}

export const DocumentReview = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuthStore();
    const [docData, setDocData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [isChecking, setIsChecking] = useState(false);
    const [linkedNodes, setLinkedNodes] = useState<{ id: string, name: string }[]>([]);
    const [isProjectTreeOpen, setIsProjectTreeOpen] = useState(false);
    const [isSavingProjectNodes, setIsSavingProjectNodes] = useState(false);

    const { categories, addCategory, fetchCategories } = useCategoryStore();
    const { tabs, fetchTabs } = useCategoryTabStore();

    useEffect(() => {
        const unsubCat = fetchCategories();
        const unsubTab = fetchTabs();
        return () => {
            if (unsubCat) unsubCat();
            if (unsubTab) unsubTab();
        };
    }, [fetchCategories, fetchTabs]);

    // Kéo dãn khung
    const [leftWidth, setLeftWidth] = useState(50); // percentage
    const isDragging = useRef(false);

    // Popup xác nhận
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        type: 'save' | 'delete' | null;
        data?: any;
    }>({ isOpen: false, type: null });

    // Phân quyền
    const canEdit = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'editor';

    const { register, handleSubmit, reset, setValue, watch } = useForm<DocumentForm>();

    useEffect(() => {
        const fetchDoc = async () => {
            if (!id) return;
            const docRef = doc(db, 'vanban', id);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setDocData(data);
                reset({
                    soKyHieu: data.soKyHieu || '',
                    ngayBanHanh: data.ngayBanHanh || '',
                    coQuanBanHanh: data.coQuanBanHanh || '',
                    loaiVanBan: data.loaiVanBan || '',
                    trichYeu: data.trichYeu || '',
                    nguoiKy: data.nguoiKy || '',
                    soTrang: data.soTrang || '',
                    trangThaiDuLieu: data.trangThaiDuLieu || 'REVIEWING',
                    phanLoaiVanBan: data.phanLoaiVanBan || '',
                    mucDoKhan: data.mucDoKhan || 'THUONG',
                    fileNameOriginal: data.fileNameOriginal || '',
                });
            }
            setLoading(false);
        };
        fetchDoc();
    }, [id, reset]);

    const fetchLinkedNodes = async () => {
        if (!id) return;
        try {
            const qLinks = query(collection(db, 'vanban_node_links'), where('vanBanId', '==', id));
            const linksSnap = await getDocs(qLinks);
            const nodeIds = linksSnap.docs.map(d => d.data().nodeId);

            if (nodeIds.length > 0) {
                // Fetch all project nodes to build path hierarchy
                const allNodesSnap = await getDocs(collection(db, 'project_nodes'));
                const allNodes = allNodesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() as any }));

                const map = new Map<string, any>();
                const roots: any[] = [];

                allNodes.forEach(node => {
                    map.set(node.id, { ...node, children: [], fullPath: '' });
                });

                allNodes.forEach(node => {
                    if (node.parentId) {
                        const parent = map.get(node.parentId);
                        if (parent) {
                            parent.children.push(map.get(node.id));
                        } else {
                            roots.push(map.get(node.id)); // Fallback if parent missing
                        }
                    } else {
                        roots.push(map.get(node.id));
                    }
                });

                const sortNodes = (items: any[]) => {
                    items.sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
                    items.forEach(item => sortNodes(item.children));
                };
                sortNodes(roots);

                const computePaths = (items: any[], prefix = '', rootName = '') => {
                    items.forEach((item, index) => {
                        // Nếu là con trực tiếp của Dự án gốc (prefix rỗng), đánh số 1., 2., 3.
                        // Nếu sâu hơn, nối tiếp prefix
                        const currentPrefix = prefix ? `${prefix}${index + 1}.` : `${index + 1}.`;
                        const currentRootName = rootName || item.name;

                        if (!prefix) {
                            item.fullPath = item.name;
                        } else {
                            item.fullPath = `${currentRootName} - ${currentPrefix} ${item.name}`;
                        }

                        // Nếu item hiện tại là level 0 (không có prefix truyền vào), 
                        // con của nó sẽ bắt đầu từ prefix trống để đánh số 1., 2.
                        const nextPrefix = prefix ? currentPrefix : '';
                        computePaths(item.children, nextPrefix, currentRootName);
                    });
                };
                computePaths(roots);

                const nodes: { id: string, name: string }[] = [];
                for (const nId of nodeIds) {
                    const nodeInTree = map.get(nId);
                    if (nodeInTree) {
                        nodes.push({ id: nId, name: nodeInTree.fullPath });
                    }
                }
                setLinkedNodes(nodes);
            } else {
                setLinkedNodes([]);
            }
        } catch (error) {
            console.error("Lỗi lấy danh sách node liên kết:", error);
        }
    };

    // Lấy danh sách vị trí lưu trữ
    useEffect(() => {
        fetchLinkedNodes();
    }, [id]);

    const handleProjectNodesConfirm = async (selectedNodes: { nodeId: string, projectId: string }[]) => {
        if (!id) return;
        setIsSavingProjectNodes(true);
        const loadingToast = toast.loading('Đang cập nhật liên kết Dự án...');
        try {
            const attachFn = httpsCallable(appFunctions, 'attachDocumentToNode');

            // Do logic ở Backend attachDocumentToNode có kiểm tra trùng lặp
            // Chúng ta chỉ cần gọi cho các node mới được chọn
            for (const node of selectedNodes) {
                await attachFn({
                    nodeId: node.nodeId,
                    projectId: node.projectId,
                    vanBanId: id
                });
            }

            await fetchLinkedNodes();

            // LOG HOẠT ĐỘNG
            await logVanBanActivity({
                vanBanId: id,
                action: 'LINK_STORAGE',
                details: `Cập nhật vị trí lưu trữ dự án (${selectedNodes.length} vị trí).`,
                userId: user?.uid || '',
                userName: user?.hoTen || user?.displayName || 'User'
            });

            toast.success('Đã cập nhật vị trí lưu trữ dự án thành công!', { id: loadingToast });
            setIsProjectTreeOpen(false);
        } catch (error: any) {
            console.error('Lỗi khi đính kèm dự án:', error);
            toast.error('Lỗi khi đính kèm dự án: ' + error.message, { id: loadingToast });
        } finally {
            setIsSavingProjectNodes(false);
        }
    };

    // Handle Kéo dãn Pane
    const handleMouseDown = (e: React.MouseEvent) => {
        isDragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const newLeftWidth = (e.clientX / window.innerWidth) * 100;
        // Giới hạn tỉ lệ drag từ 20% đến 80% màn hình
        if (newLeftWidth > 20 && newLeftWidth < 80) {
            setLeftWidth(newLeftWidth);
        }
    };

    const handleMouseUp = () => {
        isDragging.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    useEffect(() => {
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    }, []);

    const onSubmit = (data: DocumentForm) => {
        // Mở popup lưu thay vì lưu ngay
        setConfirmModal({ isOpen: true, type: 'save', data });
    };

    const confirmSave = async () => {
        if (!id || confirmModal.type !== 'save' || !confirmModal.data) return;
        try {
            const formData = confirmModal.data;
            const docRef = doc(db, 'vanban', id);

            // AUTO LEARNING & CHUẨN HOÁ CATEGORY
            if (formData.loaiVanBan) {
                // Title Case Pattern
                formData.loaiVanBan = formData.loaiVanBan
                    .toLowerCase()
                    .split(' ')
                    .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')
                    .trim();

                const loaiVanBanTab = tabs.find(t => t.label === 'Loại Văn bản');
                if (loaiVanBanTab) {
                    const existing = categories.find(
                        c => c.type === loaiVanBanTab.id && c.value.toLowerCase() === formData.loaiVanBan.toLowerCase()
                    );
                    if (!existing) {
                        const count = categories.filter(c => c.type === loaiVanBanTab.id).length;
                        await addCategory({
                            type: loaiVanBanTab.id as any,
                            value: formData.loaiVanBan,
                            isActive: true,
                            order: count + 1
                        });
                        console.log("Auto-learned Category:", formData.loaiVanBan);
                    }
                }
            }

            await updateDoc(docRef, {
                ...formData
            });

            // LOG HOẠT ĐỘNG
            await logVanBanActivity({
                vanBanId: id,
                action: 'EDIT',
                details: `Chỉnh sửa thông tin văn bản: ${formData.soKyHieu || 'N/A'}. Nội dung: ${formData.trichYeu?.substring(0, 50)}...`,
                userId: user?.uid || '',
                userName: user?.hoTen || user?.displayName || 'User'
            });

            setConfirmModal({ isOpen: false, type: null });
            setIsEditing(false); // Đóng form về chế độ xem
            // Optional: Hiển thị toast notice thay vì alert
        } catch (error) {
            console.error(error);
            toast.error('Lỗi lưu dữ liệu');
        }
    };

    const handleDeleteClick = () => {
        setConfirmModal({ isOpen: true, type: 'delete' });
    };

    const confirmDelete = async () => {
        if (!id || confirmModal.type !== 'delete') return;
        try {
            // LOG HOẠT ĐỘNG TRƯỚC KHI XÓA
            await logVanBanActivity({
                vanBanId: id,
                action: 'DELETE',
                details: `Xóa văn bản: ${docData.fileNameOriginal}`,
                userId: user?.uid || '',
                userName: user?.hoTen || user?.displayName || 'User'
            });

            await deleteDoc(doc(db, 'vanban', id));
            setConfirmModal({ isOpen: false, type: null });
            navigate('/documents');
        } catch (error) {
            console.error("Lỗi khi xóa tài liệu: ", error);
            toast.error("Không thể xóa văn bản này. Vui lòng thử lại sau.");
        }
    };

    const handleAIRecheck = async () => {
        if (!id || !docData) return;

        // Hỗ trợ tương thích ngược: các file cũ dùng driveFileId, file mới dùng driveFileId_Original
        const driveId = docData.driveFileId_Original || docData.driveFileId;

        if (!driveId) {
            toast.error('Lỗi: Không tìm thấy ID tệp Drive của văn bản này. Có thể văn bản được tải lên trước khi hệ thống tích hợp Drive.');
            return;
        }

        setIsChecking(true);
        try {
            const processOCR = httpsCallable(appFunctions, 'processDocumentOCR');

            const result: any = await processOCR({
                docId: id,
                driveFileId: driveId,
                mimeType: docData.mimeType || 'application/pdf',
                fileNameOriginal: docData.fileNameOriginal,
            });

            if (result.data) {
                const newData = result.data;
                // Cập nhật các trường vào form nếu trường đó đang trống hoặc muốn ghi đè
                if (newData.soKyHieu) setValue('soKyHieu', newData.soKyHieu);
                if (newData.ngayBanHanh) setValue('ngayBanHanh', newData.ngayBanHanh);
                if (newData.coQuanBanHanh) setValue('coQuanBanHanh', newData.coQuanBanHanh);
                if (newData.loaiVanBan) setValue('loaiVanBan', newData.loaiVanBan);
                if (newData.trichYeu) setValue('trichYeu', newData.trichYeu);
                if (newData.nguoiKy) setValue('nguoiKy', newData.nguoiKy);
                if (newData.soTrang) setValue('soTrang', newData.soTrang.toString());

                // Cập nhật docData cục bộ để đồng bộ UI
                setDocData((prev: any) => ({ ...prev, ...newData }));

                // LOG HOẠT ĐỘNG
                await logVanBanActivity({
                    vanBanId: id,
                    action: 'AI_RECHECK',
                    details: 'AI (Gemini) rà soát lại và cập nhật thông tin trích xuất.',
                    userId: user?.uid || '',
                    userName: user?.hoTen || user?.displayName || 'User'
                });

                toast.success('AI đã rà soát và cập nhật thông tin thành công!');
            }
        } catch (error) {
            console.error('Lỗi AI Recheck:', error);
            toast.error('Không thể thực hiện AI Recheck. Vui lòng thử lại sau.');
        } finally {
            setIsChecking(false);
        }
    };

    if (loading) return <div className="p-8">Đang tải...</div>;
    if (!docData) return <div className="p-8 text-red-500">Không tìm thấy tài liệu</div>;

    // Xác định icon định dạng file
    const getFileIcon = () => {
        const ext = docData.fileNameOriginal?.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return <FileText className="w-5 h-5 text-red-500" />;
        if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return <ImageIcon className="w-5 h-5 text-purple-500" />;
        if (['doc', 'docx'].includes(ext)) return <FileText className="w-5 h-5 text-blue-500" />;
        if (['xls', 'xlsx'].includes(ext)) return <FileText className="w-5 h-5 text-green-500" />;
        return <FileText className="w-5 h-5 text-gray-400" />;
    };

    // Xác định nguồn preview: Firebase Storage URL hoặc Google Drive
    const previewUrl = docData.storageUrl || null;
    const drivePreviewUrl = docData.driveFileId_Original
        ? `https://drive.google.com/file/d/${docData.driveFileId_Original}/preview`
        : null;

    return (
        <div className="h-full flex flex-col bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b px-6 py-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4 overflow-hidden">
                    <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-full transition-colors shrink-0">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                            <span
                                title={docData.trangThaiDuLieu === 'COMPLETED' ? 'Đã hoàn tất' : 'Chờ xác nhận'}
                                className={`flex items-center justify-center w-7 h-7 rounded-full shrink-0 ${docData.trangThaiDuLieu === 'COMPLETED'
                                    ? 'bg-green-100 text-green-600 border border-green-200 shadow-sm'
                                    : 'bg-amber-100 text-amber-600 border border-amber-200 shadow-sm'
                                    }`}>
                                {docData.trangThaiDuLieu === 'COMPLETED' ? <CheckCircle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                            </span>
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="shrink-0">{getFileIcon()}</span>
                                <h1 className="text-xl font-bold text-gray-900 truncate" title={watch('fileNameOriginal') || docData.fileNameOriginal}>
                                    {watch('fileNameOriginal') || docData.fileNameOriginal}
                                </h1>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 mt-1">
                            <p className="text-xs text-gray-500">
                                Tải lên lúc: {formatDateTime(docData.createdAt)}
                            </p>


                        </div>
                    </div>
                </div>
            </div>

            {/* Split View Content */}
            <div className="flex-1 overflow-hidden flex">

                {/* Left Side: Data Form */}
                <div style={{ width: `${leftWidth}%` }} className="bg-white overflow-y-auto p-8 h-full">
                    <div className="mb-6 flex items-start gap-3 text-blue-700 bg-blue-50 p-4 rounded-lg border border-blue-100">
                        <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">
                            Dữ liệu đã được AI (Gemini) tự động trích xuất. Vui lòng kiểm tra và sửa nếu cần trước khi lưu.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                        <fieldset disabled={!isEditing} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên file hiển thị</label>
                                <input
                                    {...register('fileNameOriginal')}
                                    className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    autoComplete="off"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Số Ký hiệu</label>
                                    <input
                                        {...register('soKyHieu')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Ngày Ban hành
                                        {docData.ngayBanHanh && (
                                            <span className="ml-2 text-blue-600 text-xs font-normal">
                                                ({isoToVN(docData.ngayBanHanh)})
                                            </span>
                                        )}
                                    </label>
                                    <input
                                        type="date"
                                        {...register('ngayBanHanh')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Cơ quan Ban hành</label>
                                    <input
                                        {...register('coQuanBanHanh')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Loại Văn bản</label>
                                    <input
                                        {...register('loaiVanBan')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Người ký</label>
                                    <input
                                        {...register('nguoiKy')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Số trang</label>
                                    <input
                                        {...register('soTrang')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Dung lượng gốc</label>
                                    <input
                                        type="text"
                                        value={docData.fileSize ? formatBytes(docData.fileSize) : 'N/A'}
                                        disabled
                                        className="w-full px-3 py-2 border rounded-md disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Luồng Văn bản</label>
                                    <select
                                        {...register('phanLoaiVanBan')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors bg-white"
                                    >
                                        <option value="">-- Chưa phân loại --</option>
                                        <option value="INCOMING">📥 Văn bản Đến</option>
                                        <option value="OUTGOING">📤 Văn bản Đi</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Mức độ Khẩn</label>
                                    <select
                                        {...register('mucDoKhan')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors bg-white"
                                    >
                                        <option value="THUONG">🌿 Bình thường</option>
                                        <option value="KHAN">⚡ Khẩn</option>
                                        <option value="HOA_TOC">🔥 Hỏa tốc</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Trạng thái Dữ liệu</label>
                                    <select
                                        {...register('trangThaiDuLieu')}
                                        className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors bg-white"
                                    >
                                        <option value="REVIEWING">⏳ Chờ duyệt (Reviewing)</option>
                                        <option value="COMPLETED">✓ Đã hoàn tất (Completed)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Trích yếu nội dung</label>
                                <textarea
                                    {...register('trichYeu')}
                                    rows={4}
                                    className="w-full px-3 py-2 border rounded-md focus:ring-1 focus:ring-blue-500 outline-none resize-none disabled:bg-gray-50 disabled:text-gray-600 disabled:border-transparent transiton-colors"
                                />
                            </div>

                            {/* Nơi lưu trữ */}
                            {linkedNodes.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Nơi lưu trữ</label>
                                    <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg">
                                        <table className="min-w-[500px] w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                                                        STT
                                                    </th>
                                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        Vị trí lưu trữ
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {linkedNodes.map((node, index) => (
                                                    <tr key={node.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center border-r border-gray-100">
                                                            {index + 1}
                                                        </td>
                                                        <td className="px-4 py-3 text-sm font-medium whitespace-normal">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="cursor-pointer hover:underline text-blue-700 hover:text-blue-900 transition-colors flex items-center gap-2"
                                                                    onClick={() => navigate(`/mindmap?nodeId=${node.id}&docId=${id}`)}
                                                                    title="Tới giao diện Quản lý Phân bổ lưu trữ"
                                                                >
                                                                    <Folder className="w-4 h-4 text-blue-500 shrink-0" />
                                                                    <span>{node.name}</span>
                                                                </span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </fieldset>

                        {/* Tệp hồ sơ đính kèm */}
                        {((docData.attachments && docData.attachments.length > 0) || (docData.dinhKem && docData.dinhKem.length > 0)) && (
                            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center gap-2">
                                    <span className="text-blue-600">📎</span>
                                    <h3 className="text-sm font-bold text-gray-700">
                                        Tệp hồ sơ đính kèm ({(docData.attachments?.length || 0) + (docData.dinhKem?.length || 0)} tệp)
                                    </h3>
                                </div>
                                <div className="divide-y divide-gray-100">
                                    {/* Hiển thị attachments mới (có link Drive) */}
                                    {docData.attachments?.map((att: any, idx: number) => (
                                        <div key={`att-${idx}`} className="px-4 py-3 flex items-center justify-between hover:bg-blue-50/50 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                                                    <FileText className="w-4 h-4 text-blue-600" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-medium text-gray-800 truncate" title={att.fileName || att.originalName}>
                                                        {att.fileName || att.originalName}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        {att.originalName && att.fileName !== att.originalName && (
                                                            <span className="text-[10px] text-gray-400 italic truncate max-w-[200px]" title={att.originalName}>Gốc: {att.originalName}</span>
                                                        )}
                                                        {att.fileSize && (
                                                            <span className="text-[10px] text-gray-400">{(att.fileSize / 1024).toFixed(0)} KB</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {att.webViewLink && (
                                                <a
                                                    href={att.webViewLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors shrink-0 ml-3"
                                                >
                                                    <ExternalLink className="w-3 h-3" /> Xem
                                                </a>
                                            )}
                                        </div>
                                    ))}

                                    {/* Hiển thị dinhKem legacy (không có link Drive) */}
                                    {docData.dinhKem?.map((att: any, idx: number) => (
                                        <div key={`dk-${idx}`} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
                                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                                                    <FileText className="w-4 h-4 text-gray-500" />
                                                </div>
                                                <p className="text-sm text-gray-600 truncate" title={att.fileName || att.name}>
                                                    {att.fileName || att.name}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Tracking Tác vụ */}
                        {!isEditing && id && (
                            <div className="space-y-6">
                                <DocumentTasks vanBanId={id} />
                                <DocumentActivityLog vanBanId={id} />
                            </div>
                        )}

                        <div className="pt-4 border-t border-gray-100 flex justify-end gap-3">
                            {!isEditing && (
                                <button
                                    type="button"
                                    onClick={() => navigate('/documents')}
                                    className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition font-medium"
                                    title="Quay về danh sách văn bản"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Quay về
                                </button>
                            )}

                            {isEditing && (
                                <button
                                    type="button"
                                    onClick={() => setIsProjectTreeOpen(true)}
                                    disabled={isSavingProjectNodes}
                                    className="flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-md hover:bg-blue-200 transition font-medium"
                                    title="Sắp xếp/Đính kèm vào cây thư mục Dự án"
                                >
                                    {isSavingProjectNodes ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderTree className="w-4 h-4" />}
                                    Sắp xếp Dự án
                                </button>
                            )}

                            {canEdit && !isEditing && (
                                <button
                                    type="button"
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-md hover:bg-amber-200 transition font-medium"
                                    title="Chỉnh sửa văn bản"
                                >
                                    <FileEdit className="w-4 h-4" />
                                    Chỉnh sửa
                                </button>
                            )}

                            {user?.role === 'admin' && (
                                <button
                                    type="button"
                                    onClick={handleDeleteClick}
                                    className="flex items-center gap-2 bg-red-100 text-red-700 px-4 py-2 rounded-md hover:bg-red-200 transition font-medium"
                                    title="Xóa văn bản này"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Xóa
                                </button>
                            )}

                            {isEditing && (
                                <button
                                    type="button"
                                    onClick={handleAIRecheck}
                                    disabled={isChecking}
                                    className="flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-md hover:bg-purple-200 transition font-medium disabled:opacity-50"
                                    title="Yêu cầu AI rà soát và điền nốt các thông tin còn thiếu"
                                >
                                    {isChecking ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Sparkles className="w-4 h-4" />
                                    )}
                                    AI Kiểm tra lại
                                </button>
                            )}

                            {isEditing && (
                                <button
                                    type="submit"
                                    className="flex items-center gap-2 bg-green-100 text-green-700 px-4 py-2 rounded-md hover:bg-green-200 transition font-medium"
                                    title="Kiểm tra và Lưu cập nhật hệ thống"
                                >
                                    <Save className="w-4 h-4" />
                                    Lưu
                                </button>
                            )}
                        </div>
                    </form>
                </div>

                {/* Resizer Divider */}
                <div
                    onMouseDown={handleMouseDown}
                    className="w-1.5 bg-gray-200 hover:bg-blue-400 cursor-col-resize transition-colors flex items-center justify-center relative active:bg-blue-500 z-10"
                >
                    <div className="flex flex-col gap-0.5">
                        <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                        <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                        <div className="w-0.5 h-1 bg-gray-400 rounded-full"></div>
                    </div>
                </div>

                {/* Right Side: File Preview */}
                <div style={{ width: `${100 - leftWidth}%` }} className="bg-gray-100 relative flex flex-col h-full">
                    {previewUrl ? (
                        <>
                            <div className="bg-gray-800 text-white text-xs px-4 py-2 flex items-center justify-between">
                                <span className="truncate">{docData.fileNameOriginal}</span>
                                <a href={previewUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-blue-300 hover:text-blue-100 shrink-0 ml-2">
                                    <ExternalLink className="w-3 h-3" /> Mở gốc
                                </a>
                            </div>
                            {docData.fileNameOriginal?.toLowerCase().endsWith('.pdf') ? (
                                <iframe
                                    src={previewUrl}
                                    className="flex-1 border-none w-full h-full"
                                    title="PDF Preview"
                                />
                            ) : (
                                <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                                    <img
                                        src={previewUrl}
                                        alt="Xem trước"
                                        className="max-w-full max-h-full object-contain shadow-lg rounded"
                                    />
                                </div>
                            )}
                        </>
                    ) : drivePreviewUrl ? (
                        <>
                            <div className="bg-gray-800 text-white text-xs px-4 py-2 flex items-center justify-between">
                                <span className="truncate">{docData.fileNameOriginal}</span>
                                <a href={`https://drive.google.com/file/d/${docData.driveFileId_Original}/view`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-blue-300 hover:text-blue-100 shrink-0 ml-2">
                                    <ExternalLink className="w-3 h-3" /> Mở trên Drive
                                </a>
                            </div>
                            <iframe
                                src={drivePreviewUrl}
                                className="w-full h-full border-none flex-1"
                                allow="autoplay"
                                title="Google Drive Preview"
                            />
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-500">
                            <FileText className="w-16 h-16 text-gray-300" />
                            <div className="text-center">
                                <p className="font-medium">{docData.fileNameOriginal}</p>
                                <p className="text-sm mt-1">Không có URL xem trước file</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Popup Xác nhận */}
            {confirmModal.isOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center fade-in">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden transform transition-all scale-100">
                        <div className={`px-6 py-4 border-b ${confirmModal.type === 'delete' ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                            <h3 className={`text-lg font-bold ${confirmModal.type === 'delete' ? 'text-red-800' : 'text-green-800'} flex items-center gap-2`}>
                                {confirmModal.type === 'delete' ? <Trash2 className="w-5 h-5" /> : <Save className="w-5 h-5" />}
                                {confirmModal.type === 'delete' ? 'Xác nhận xóa tài liệu' : 'Xác nhận cập nhật dữ liệu'}
                            </h3>
                        </div>
                        <div className="px-6 py-6 text-gray-600">
                            {confirmModal.type === 'delete'
                                ? 'Bạn có thật sự muốn xóa vĩnh viễn văn bản này khỏi hệ thống? Hành động này không thể hoàn tác.'
                                : 'Bạn có chắc chắn những thông tin chỉnh sửa đã chính xác và muốn lưu vào hệ thống?'
                            }
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3">
                            <button
                                onClick={() => setConfirmModal({ isOpen: false, type: null })}
                                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                            >
                                Hủy bỏ
                            </button>
                            <button
                                onClick={confirmModal.type === 'delete' ? confirmDelete : confirmSave}
                                className={`px-6 py-2 text-white rounded-lg transition-colors font-medium ${confirmModal.type === 'delete'
                                    ? 'bg-red-600 hover:bg-red-700'
                                    : 'bg-green-600 hover:bg-green-700'
                                    }`}
                            >
                                {confirmModal.type === 'delete' ? 'Chắc chắn Xóa' : 'Xác nhận Lưu'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ProjectTreeSelectorModal
                isOpen={isProjectTreeOpen}
                onClose={() => setIsProjectTreeOpen(false)}
                initialSelectedNodeIds={linkedNodes.map(n => n.id)}
                onConfirm={handleProjectNodesConfirm}
            />
        </div>
    );
};
