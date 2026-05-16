import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { canEditOrDeleteData } from '../utils/authUtils';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { MobileWarning } from '../components/MobileWarning';
import { useCategoryStore, Category } from '../store/useCategoryStore';
import { useCategoryTabStore } from '../store/useCategoryTabStore';
import { useMenuConfigStore, MenuItemStatus, MenuConfigItem } from '../store/useMenuConfigStore';
import { ICON_MAP } from '../layout/MainLayout';
import {
    FolderTree, Plus, Edit2, Trash2, CheckCircle, XCircle, Save, X,
    ShieldAlert, Loader2, LayoutGrid, Zap, EyeOff, Eye, HardDrive, RefreshCw, Layers, Settings, AlertCircle, Upload, ArrowUpDown,
    Folder, ChevronRight, ChevronDown, Layout, Menu, FileSpreadsheet, Download, AlertTriangle, ListTree
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { db, auth, appFunctions } from '../firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { DeleteConfirmModal } from '../components/DeleteConfirmModal';
import { moveToTrash } from '../utils/trashUtils';


const STATUS_CONFIG: Record<MenuItemStatus, { label: string; badge: string; icon: React.ElementType }> = {
    active: { label: 'Đang hoạt động', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: Eye },
    coming_soon: { label: 'Coming Soon', badge: 'bg-amber-50  text-amber-700  border-amber-200', icon: Zap },
    inactive: { label: 'Ngừng hoạt động', badge: 'bg-red-50    text-red-700    border-red-200', icon: EyeOff },
};

export const CategoriesManagement = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isMobile) {
        return <MobileWarning />;
    }

    const { user } = useAuthStore();
    const { categories, isLoading, error, fetchCategories, addCategory, updateCategory } = useCategoryStore();
    const {
        menuItems, isLoading: menuLoading, fetchMenuConfig,
        updateMenuItemStatus, seedMenuConfig, addMenuItem,
        updateMenuItem, deleteMenuItem
    } = useMenuConfigStore();
    const { tabs, fetchTabs, seedInitialTabs, addTab, deleteTab } = useCategoryTabStore();

    const [activeTab, setActiveTab] = useState<string>('phongBan');
    const [isAdding, setIsAdding] = useState(false);
    const [isAddingTab, setIsAddingTab] = useState(false);
    const [newTabName, setNewTabName] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({ value: '', description: '', parentAgency: '', order: 0, isActive: true });

    // Manage Display Sorting
    const [sortMode, setSortMode] = useState<'order' | 'name'>('order');

    // Excel Import
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'menu' | 'tab' | 'all', id: string, name: string }>({ type: 'category', id: '', name: '' });

    // Menu Sidebar State
    const [isAddingMenu, setIsAddingMenu] = useState(false);
    const [editingMenuId, setEditingMenuId] = useState<string | null>(null);
    const [menuFormData, setMenuFormData] = useState({
        name: '',
        key: '',
        path: '',
        icon: 'BookOpen',
        order: 0,
        status: 'active' as MenuItemStatus,
        adminOnly: false
    });

    // Drive Settings State
    const [driveConfig, setDriveConfig] = useState<any>(null);
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        if (!user || user.role === 'viewer' || user.role === 'pending') return;

        // Fetch common data for all authorized users
        seedInitialTabs();
        const unsubTabs = fetchTabs();
        const unsub = fetchCategories();

        // Admin-only data
        let unsubMenu: any = null;
        let unsubDrive: any = null;

        if (user.role === 'admin') {
            unsubMenu = fetchMenuConfig();
            unsubDrive = onSnapshot(doc(db, 'settings', 'driveFolders'), (snap) => {
                if (snap.exists()) setDriveConfig(snap.data());
            });
        }

        return () => {
            if (typeof unsubTabs === 'function') unsubTabs();
            if (typeof unsub === 'function') unsub();
            if (typeof unsubMenu === 'function') unsubMenu();
            if (unsubDrive) unsubDrive();
        };
    }, [user, fetchCategories, fetchMenuConfig, fetchTabs, seedInitialTabs]);

    // State for sync result logs
    const [syncDebugLogs, setSyncDebugLogs] = useState<string[]>([]);
    const [showDebugModal, setShowDebugModal] = useState(false);

    const handleSyncDrive = async () => {
        setIsSyncing(true);
        setSyncDebugLogs([]);
        try {
            const syncFn = httpsCallable(appFunctions, 'syncDriveStructure', { timeout: 540000 });
            const result: any = await syncFn();
            console.log('Drive Sync Result:', result.data);

            if (result.data.debug && result.data.debug.length > 0) {
                setSyncDebugLogs(result.data.debug);
                setShowDebugModal(true);
            }
        } catch (error: any) {
            console.error('Lỗi đồng bộ Drive:', error);
            toast.error('Lỗi đồng bộ: ' + error.message);
        } finally {
            setIsSyncing(false);
        }
    };

    const [manualRootId, setManualRootId] = useState('');
    const [confirmAction, setConfirmAction] = useState<{
        title: string;
        message: string;
        onConfirm: () => void;
        type?: 'danger' | 'warning' | 'info';
        confirmText?: string;
    } | null>(null);

    const handleSaveRootId = async () => {
        if (!manualRootId.trim()) return;

        setConfirmAction({
            title: 'Xác nhận đổi Thư mục gốc',
            message: 'Khi đổi Thư mục gốc, hệ thống sẽ tạo lại cấu trúc mới (Văn bản đến/đi, Hồ sơ dự án) bên trong thư mục này. Bạn có chắc chắn?',
            type: 'warning',
            onConfirm: async () => {
                try {
                    const { setDoc, doc } = await import('firebase/firestore');
                    await setDoc(doc(db, 'settings', 'driveFolders'), {
                        rootId: manualRootId.trim(),
                        updatedAt: new Date().toISOString(),
                        manualConfig: true,
                        vanBanDenId: null,
                        vanBanDiId: null,
                        projectsRootId: null
                    }, { merge: true });

                    setManualRootId('');
                    toast.success('Đã cập nhật ID thư mục gốc mới. Hãy nhấn "Đồng bộ" để tạo cấu trúc con.');
                    setConfirmAction(null);
                } catch (e) {
                    toast.error('Lỗi: ' + (e as Error).message);
                }
            }
        });
    };

    const handleResetDrive = async () => {
        setConfirmAction({
            title: 'CẢNH BÁO NGUY HIỂM',
            message: 'Thao tác này sẽ XÓA VĨNH VIỄN toàn bộ thư mục CDE-ROOT cũ trên Google Drive và các liên kết trong hệ thống.\n\nFile vật lý của bạn sẽ bị đưa vào Thùng rác trên Drive. Bạn có chắc chắn muốn RESET TOÀN BỘ cấu trúc Drive không?',
            type: 'danger',
            confirmText: 'Tôi hiểu, hãy Reset ngay',
            onConfirm: async () => {
                setIsSyncing(true);
                setSyncDebugLogs([]);
                setConfirmAction(null);
                try {
                    // 1. Gọi hàm Reset
                    const resetFn = httpsCallable(appFunctions, 'resetDriveStructure', { timeout: 540000 });
                    const resetResult: any = await resetFn();
                    toast.success(resetResult.data.message || 'Đã làm sạch cấu trúc cũ.');

                    // 2. Tự động gọi Đồng bộ lại để xây dựng cấu trúc mới
                    const syncFn = httpsCallable(appFunctions, 'syncDriveStructure', { timeout: 540000 });
                    const syncResult: any = await syncFn();
                    toast.success('Đã xây dựng lại cấu trúc Drive mới thành công!');

                    if (syncResult.data.debug && syncResult.data.debug.length > 0) {
                        setSyncDebugLogs(syncResult.data.debug);
                        setShowDebugModal(true);
                    }
                } catch (error: any) {
                    console.error('Lỗi Reset Drive:', error);
                    toast.error('Lỗi Reset: ' + error.message);
                } finally {
                    setIsSyncing(false);
                }
            }
        });
    };

    const handleResetAllNodesDrive = async () => {
        setConfirmAction({
            title: 'Reset liên kết Dự án',
            message: 'CẢNH BÁO: Thao tác này sẽ xóa toàn bộ liên kết Drive cũ của các Dự án trên WebApp (không mất file). \n\nBạn chỉ làm việc này nếu muốn hệ thống TẠO LẠI TOÀN BỘ thư mục dự án trên Drive 2TB mới. Tiếp tục?',
            type: 'warning',
            onConfirm: async () => {
                setIsSyncing(true);
                setConfirmAction(null);
                try {
                    const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore');
                    const nodesSnap = await getDocs(collection(db, 'project_nodes'));
                    const batch = writeBatch(db);

                    nodesSnap.forEach((nodeDoc) => {
                        batch.update(doc(db, 'project_nodes', nodeDoc.id), {
                            driveFolderId: null,
                            driveFolderLink: null
                        });
                    });

                    await batch.commit();
                    toast.success('Đã xóa sạch liên kết cũ. Hãy nhấn "Đồng bộ" để tạo mới lên Drive 2TB.');
                } catch (e) {
                    toast.error('Lỗi: ' + (e as Error).message);
                } finally {
                    setIsSyncing(false);
                }
            }
        });
    };

    if (!user || user.role === 'viewer' || user.role === 'pending') {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                <ShieldAlert className="w-16 h-16 mx-auto mb-4" />
                Bạn không có quyền truy cập trang Quản lý Danh mục.
            </div>
        );
    }

    const filteredList = categories.filter(c => c.type === activeTab).sort((a, b) => {
        if (sortMode === 'name') {
            return a.value.localeCompare(b.value, 'vi');
        }
        return a.order - b.order;
    });

    const groupedCategories = filteredList.reduce((acc, current) => {
        if (activeTab === 'phongBan') {
            const agency = current.parentAgency?.trim() ? current.parentAgency.trim() : 'Khác';
            if (!acc[agency]) acc[agency] = [];
            acc[agency].push(current);
        } else {
            // Danh sách phẳng cho các tab khác
            const key = 'Danh sách';
            if (!acc[key]) acc[key] = [];
            acc[key].push(current);
        }
        return acc;
    }, {} as Record<string, typeof filteredList>);

    const groupKeys = Object.keys(groupedCategories).sort((a, b) => {
        if (a === 'Khác') return 1;
        if (b === 'Khác') return -1;
        return a.localeCompare(b);
    });

    const handleOpenAdd = () => {
        setFormData({ value: '', description: '', parentAgency: '', order: filteredList.length + 1, isActive: true });
        setIsAdding(true);
        setEditingId(null);
    };

    const handleOpenEdit = (item: Category) => {
        setFormData({ value: item.value, description: item.description || '', parentAgency: item.parentAgency || '', order: item.order, isActive: item.isActive });
        setEditingId(item.id);
        setIsAdding(false);
    };

    const handleCancel = () => {
        setIsAdding(false);
        setEditingId(null);
    };

    const handleDeleteAll = async () => {
        const activeTabName = tabs.find(t => t.id === activeTab)?.label || 'này';
        if (filteredList.length === 0) return;
        setDeleteTarget({ type: 'all', id: 'all', name: `TOÀN BỘ ${filteredList.length} danh mục trong tab "${activeTabName}"` });
        setDeleteModalOpen(true);
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const dataArray = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (dataArray.length < 2) {
                    toast.error("File Excel trống hoặc không đủ dữ liệu. Xin hãy đảm bảo có dòng tiêu đề và ít nhất 1 dòng dữ liệu.");
                    return;
                }

                let successCount = 0;
                // STT hiện tại để tính order
                let currentMaxOrder = filteredList.length;

                // Bỏ qua dòng tiêu đề đầu tiên (i = 0), duyệt từ i = 1
                for (let i = 1; i < dataArray.length; i++) {
                    const row = dataArray[i];
                    if (!row || row.length === 0) continue;

                    // Yêu cầu: Cột 2 (index 1) là Thuộc tính (Loại Văn bản), Cột 3 (index 2) là Ghi chú
                    const tenThuocTinh = row[1]?.toString().trim() || '';
                    if (!tenThuocTinh) continue;

                    const ghiChu = row[2]?.toString().trim() || '';
                    const nhomThuoc = row[3]?.toString().trim() || '';

                    currentMaxOrder++;
                    await addCategory({
                        type: activeTab as any,
                        value: tenThuocTinh,
                        description: ghiChu,
                        parentAgency: nhomThuoc,
                        order: currentMaxOrder,
                        isActive: true,
                        createdBy: user?.email || ''
                    });
                    successCount++;
                }

                toast.success(`Đã thêm ${successCount} thuộc tính thành công!`);
            } catch (error) {
                console.error("Lỗi parse file Excel:", error);
                toast.error("Đã xảy ra lỗi khi đọc file Excel.");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        reader.onerror = () => {
            toast.error("Lỗi đọc file");
            setIsImporting(false);
        };

        reader.readAsBinaryString(file);
    };

    const handleSavePrimary = async () => {
        if (!formData.value.trim()) {
            toast.error('Tên danh mục không được để trống!');
            return;
        }
        try {
            if (isAdding) {
                await addCategory({ type: activeTab as any, value: formData.value, description: formData.description, parentAgency: formData.parentAgency, order: Number(formData.order) || 1, isActive: formData.isActive, createdBy: user?.email || '' });
            } else if (editingId) {
                await updateCategory(editingId, { value: formData.value, description: formData.description, parentAgency: formData.parentAgency, order: Number(formData.order), isActive: formData.isActive });
            }
            handleCancel();
            toast.success('Đã lưu dữ liệu thành công');
        } catch (error) {
            toast.error('Có lỗi xảy ra khi lưu! ' + (error as Error).message);
        }
    };

    const handleDeleteClick = async (id: string, name: string) => {
        setDeleteTarget({ type: 'category', id, name });
        setDeleteModalOpen(true);
    };

    const handleMenuStatusChange = async (item: MenuConfigItem, newStatus: MenuItemStatus) => {
        try {
            await updateMenuItemStatus(item.id, newStatus);
            toast.success(`Đã cập nhật trạng thái menu: ${item.name}`);
        } catch (e) {
            toast.error('Lỗi cập nhật trạng thái: ' + (e as Error).message);
        }
    };

    const handleOpenAddMenu = () => {
        setMenuFormData({ name: '', key: '', path: '', icon: 'BookOpen', order: menuItems.length + 1, status: 'active', adminOnly: false });
        setIsAddingMenu(true);
        setEditingMenuId(null);
    };

    const handleOpenEditMenu = (item: MenuConfigItem) => {
        setMenuFormData({ name: item.name, key: item.key, path: item.path, icon: item.icon, order: item.order, status: item.status, adminOnly: item.adminOnly || false });
        setEditingMenuId(item.id);
        setIsAddingMenu(false);
    };

    const handleCancelMenu = () => {
        setIsAddingMenu(false);
        setEditingMenuId(null);
    };

    const handleSaveMenu = async () => {
        if (!menuFormData.name.trim() || !menuFormData.key.trim() || !menuFormData.path.trim()) {
            toast.error('Vui lòng điền đầy đủ Tên, Key và Đường dẫn!');
            return;
        }
        try {
            if (isAddingMenu) {
                await addMenuItem({
                    ...menuFormData,
                    order: Number(menuFormData.order) || menuItems.length + 1
                });
            } else if (editingMenuId) {
                await updateMenuItem(editingMenuId, {
                    name: menuFormData.name,
                    path: menuFormData.path,
                    icon: menuFormData.icon,
                    order: Number(menuFormData.order),
                    status: menuFormData.status,
                    adminOnly: menuFormData.adminOnly
                });
            }
            handleCancelMenu();
            toast.success('Đã lưu cấu hình Menu');
        } catch (e) {
            toast.error('Lỗi lưu Menu: ' + (e as Error).message);
        }
    };

    const handleDeleteMenuItem = async (id: string, name: string) => {
        setDeleteTarget({ type: 'menu', id, name });
        setDeleteModalOpen(true);
    };

    const handleAddTabConfig = async () => {
        if (!newTabName.trim()) {
            toast.error('Tên Tab không được để trống!');
            return;
        }
        try {
            const newId = await addTab({ label: newTabName, order: tabs.length + 1 });
            setNewTabName('');
            setIsAddingTab(false);
            setActiveTab(newId);
            toast.success(`Đã tạo Tab "${newTabName}" thành công`);
        } catch (error) {
            toast.error('Lỗi tạo Tab: ' + (error as Error).message);
        }
    };

    const handleDeleteTab = async (e: React.MouseEvent, tabId: string, tabLabel: string) => {
        e.stopPropagation();

        // Kiểm tra xem Tab có chứa Category nào không
        const hasChildren = categories.some(c => c.type === tabId);
        if (hasChildren) {
            toast.error(`Không thể xóa Tab "${tabLabel}" vì vẫn đang chứa các thuộc tính dữ liệu. Vui lòng xóa hết các thuộc tính bên trong trước khi xóa Tab.`);
            return;
        }

        setDeleteTarget({ type: 'tab', id: tabId, name: tabLabel });
        setDeleteModalOpen(true);
    };

    const confirmDelete = async (reason: string) => {
        try {
            if (deleteTarget.type === 'category') {
                const item = categories.find(c => c.id === deleteTarget.id);
                if (item) {
                    await moveToTrash('categories', item.id, item, user?.email || user?.uid || '', reason, `Danh mục: ${item.value}`);
                }
            } else if (deleteTarget.type === 'menu') {
                const item = menuItems.find(m => m.id === deleteTarget.id);
                if (item) {
                    await moveToTrash('menu_config', item.id, item, user?.email || user?.uid || '', reason, `Menu Item: ${item.name}`);
                }
            } else if (deleteTarget.type === 'tab') {
                const item = tabs.find(t => t.id === deleteTarget.id);
                if (item) {
                    await moveToTrash('category_tabs', item.id, item, user?.email || user?.uid || '', reason, `Tab Cấu hình: ${item.label}`);
                    // If the deleted tab was active, switch to the first remaining tab
                    if (activeTab === item.id) {
                        const remainingTabs = tabs.filter(t => t.id !== item.id);
                        if (remainingTabs.length > 0) {
                            setActiveTab(remainingTabs[0].id);
                        } else {
                            setActiveTab('menuConfig'); // Fallback if no tabs left
                        }
                    }
                }
            } else if (deleteTarget.type === 'all') {
                const toastId = toast.loading('Đang chuyển vào thùng rác...');
                await Promise.all(filteredList.map(item =>
                    moveToTrash('categories', item.id, item, user?.email || user?.uid || '', reason, `Danh mục: ${item.value}`)
                ));
                toast.success(`Đã chuyển thành công ${filteredList.length} danh mục vào thùng rác!`, { id: toastId });
            }

            setDeleteModalOpen(false);
            if (deleteTarget.type !== 'all') {
                toast.success('Đã chuyển dữ liệu vào thùng rác');
            }
        } catch (error) {
            toast.error('Lỗi khi xóa: ' + (error as Error).message);
        }
    };

    return (
        <div className="p-4 md:p-6 w-full mx-auto">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                        <ListTree className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Cấu hình Danh mục</h1>
                        <p className="text-sm text-gray-500">Từ điển Dữ liệu dùng chung toàn Hệ thống</p>
                    </div>
                </div>
                {activeTab === 'menuConfig' && user?.role === 'admin' && (
                    <button
                        onClick={seedMenuConfig}
                        className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors shadow-sm"
                    >
                        <LayoutGrid className="w-4 h-4" />
                        Khởi tạo (Seed) Menu
                    </button>
                )}
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-4 mb-6 border-b border-gray-100 overflow-x-auto whitespace-nowrap scrollbar-hide font-bold">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => { setActiveTab(tab.id); handleCancel(); }}
                        className={`group pb-3 px-2 text-sm font-bold border-b-2 transition-colors flex items-center shrink-0 ${activeTab === tab.id
                            ? 'border-indigo-600 text-indigo-700'
                            : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                            }`}
                    >
                        {tab.label}
                        <span className={`ml-2 py-0.5 px-2 rounded-full text-[10px] transition-colors ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'}`}>
                            {categories.filter(c => c.type === tab.id).length}
                        </span>

                        {user?.role === 'admin' && (
                            <div
                                onClick={(e) => handleDeleteTab(e, tab.id, tab.label)}
                                className="ml-2 w-5 h-5 flex items-center justify-center rounded-full text-gray-300 hover:bg-red-100 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                                title="Xóa Menu này"
                            >
                                <X className="w-3.5 h-3.5" />
                            </div>
                        )}
                    </button>
                ))}


                {/* Divider */}
                {user?.role === 'admin' && (
                    <>
                        <div className="w-px h-6 bg-gray-200 my-auto ml-2 mr-0 shrink-0"></div>

                        <button
                            onClick={() => { setActiveTab('menuConfig'); handleCancel(); }}
                            className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors shrink-0 ml-2 ${activeTab === 'menuConfig'
                                ? 'border-gray-800 text-gray-800'
                                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <LayoutGrid className="w-4 h-4" />
                                Menu Sidebar
                            </div>
                        </button>

                        {/* Tab Cấu hình chung mới */}
                        <button
                            onClick={() => { setActiveTab('appSettings'); handleCancel(); }}
                            className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors shrink-0 ml-2 ${activeTab === 'appSettings'
                                ? 'border-indigo-600 text-indigo-700'
                                : 'border-transparent text-gray-500 hover:text-indigo-600 hover:border-indigo-300'
                                }`}
                        >
                            <div className="flex items-center gap-1.5">
                                <Settings className="w-4 h-4" />
                                Cấu hình chung
                            </div>
                        </button>

                        <button
                            onClick={() => { setActiveTab('driveConfig'); handleCancel(); }}
                            className={`pb-3 px-2 text-sm font-bold border-b-2 transition-colors shrink-0 ml-2 ${activeTab === 'driveConfig'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                                }`}
                        >
                            ☁️ Cấu hình Drive
                        </button>
                    </>
                )}

                {/* Nút cộng thêm tab dạt vô lề phải */}
                <div className="flex-1 min-w-[20px]"></div>
                {user?.role === 'admin' && (
                    <button
                        onClick={() => setIsAddingTab(true)}
                        className="pb-3 px-2 text-sm font-bold border-b-2 border-transparent text-blue-600 hover:text-blue-800 hover:border-blue-300 transition-colors shrink-0 flex items-center justify-center font-bold"
                        title="Thêm Danh mục mở rộng mới"
                    >
                        <Plus className="w-5 h-5" />
                    </button>
                )}
            </div>

            {/* ===================== TAB: MENU CONFIG ===================== */}
            {activeTab === 'menuConfig' && user?.role === 'admin' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">DANH SÁCH MỤC MENU SIDEBAR</div>
                        <button
                            onClick={handleOpenAddMenu}
                            className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
                        >
                            <Plus className="w-4 h-4" />
                            Thêm mục Menu mới
                        </button>
                    </div>

                    {menuLoading ? (
                        <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 text-blue-600 animate-spin" /></div>
                    ) : menuItems.length === 0 ? (
                        <div className="text-center py-16 text-gray-500 bg-white border border-gray-200 rounded-xl font-bold">
                            <LayoutGrid className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                            <p className="font-semibold text-gray-700 mb-1">Chưa có cấu hình Menu</p>
                            <p className="text-sm">Nhấn nút "Khởi tạo (Seed) Menu" ở trên để tạo dữ liệu mặc định.</p>
                        </div>
                    ) : (
                        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-x-auto overflow-y-hidden">
                            <table className="w-full text-sm text-left text-gray-700 min-w-[800px]">
                                <thead className="bg-gray-50 font-bold border-b border-gray-200 uppercase text-[10px] tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-4 py-3 w-12 text-center text-gray-400">#</th>
                                        <th className="px-4 py-3">Tên hiển thị</th>
                                        <th className="px-4 py-3">Đường dẫn</th>
                                        <th className="px-4 py-3 w-40">Biểu tượng</th>
                                        <th className="px-4 py-3 w-28 text-center">Phân quyền</th>
                                        <th className="px-4 py-3 w-48 text-center">Trạng thái</th>
                                        <th className="px-4 py-3 w-20 text-center">Tác vụ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {isAddingMenu && (
                                        <tr className="bg-indigo-50/50">
                                            <td className="px-4 py-3 text-center">
                                                <input type="number" value={menuFormData.order} onChange={e => setMenuFormData({ ...menuFormData, order: Number(e.target.value) })} className="w-12 p-1 text-center bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input type="text" autoFocus placeholder="Tên hiển thị..." value={menuFormData.name} onChange={e => setMenuFormData({ ...menuFormData, name: e.target.value })} className="w-full p-1.5 mb-1 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                <input type="text" placeholder="Key định danh (VD: internal_docs)" value={menuFormData.key} onChange={e => setMenuFormData({ ...menuFormData, key: e.target.value })} className="w-full p-1 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[10px]" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input type="text" placeholder="Đường dẫn (VD: /docs)" value={menuFormData.path} onChange={e => setMenuFormData({ ...menuFormData, path: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px] font-bold" />
                                            </td>
                                            <td className="px-4 py-3">
                                                <input type="text" placeholder="Tên Icon (Lucide)..." value={menuFormData.icon} onChange={e => setMenuFormData({ ...menuFormData, icon: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-bold" />
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button onClick={() => setMenuFormData({ ...menuFormData, adminOnly: !menuFormData.adminOnly })} className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all ${menuFormData.adminOnly ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                    {menuFormData.adminOnly ? 'ADMIN ONLY' : 'PUBLIC'}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <select value={menuFormData.status} onChange={e => setMenuFormData({ ...menuFormData, status: e.target.value as MenuItemStatus })} className="appearance-none text-[11px] font-bold border border-gray-300 rounded-lg px-2 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-300 outline-none w-full">
                                                    <option value="active">✅ Đang hoạt động</option>
                                                    <option value="coming_soon">⚡ Coming Soon</option>
                                                    <option value="inactive">🚫 Ngừng hoạt động</option>
                                                </select>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={handleSaveMenu} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm" title="Lưu lại"><Save className="w-4 h-4" /></button>
                                                    <button onClick={handleCancelMenu} className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-sm" title="Hủy bỏ"><X className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {menuItems.map(item => {
                                        if (editingMenuId === item.id) {
                                            return (
                                                <tr key={item.id} className="bg-indigo-50/20">
                                                    <td className="px-4 py-3 text-center">
                                                        <input type="number" value={menuFormData.order} onChange={e => setMenuFormData({ ...menuFormData, order: Number(e.target.value) })} className="w-12 p-1 text-center bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="text" autoFocus placeholder="Tên hiển thị..." value={menuFormData.name} onChange={e => setMenuFormData({ ...menuFormData, name: e.target.value })} className="w-full p-1.5 mb-1 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                        <input type="text" value={item.key} disabled className="w-full p-1 bg-gray-100 border border-gray-200 rounded-lg outline-none font-mono text-[10px] text-gray-500 cursor-not-allowed" title="Key không thể thay đổi sau khi tạo" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="text" placeholder="Đường dẫn..." value={menuFormData.path} onChange={e => setMenuFormData({ ...menuFormData, path: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-mono text-[11px] font-bold" />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input type="text" placeholder="Tên Icon..." value={menuFormData.icon} onChange={e => setMenuFormData({ ...menuFormData, icon: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 text-sm font-bold" />
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <button onClick={() => setMenuFormData({ ...menuFormData, adminOnly: !menuFormData.adminOnly })} className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all ${menuFormData.adminOnly ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>
                                                            {menuFormData.adminOnly ? 'ADMIN ONLY' : 'PUBLIC'}
                                                        </button>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <select value={menuFormData.status} onChange={e => setMenuFormData({ ...menuFormData, status: e.target.value as MenuItemStatus })} className="appearance-none text-[11px] font-bold border border-gray-300 rounded-lg px-2 py-1.5 cursor-pointer focus:ring-2 focus:ring-indigo-300 outline-none w-full">
                                                            <option value="active">✅ Đang hoạt động</option>
                                                            <option value="coming_soon">⚡ Coming Soon</option>
                                                            <option value="inactive">🚫 Ngừng hoạt động</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex justify-center gap-2">
                                                            <button onClick={handleSaveMenu} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm" title="Lưu lại"><Save className="w-4 h-4" /></button>
                                                            <button onClick={handleCancelMenu} className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-sm" title="Hủy bỏ"><X className="w-4 h-4" /></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        }

                                        const statusCfg = STATUS_CONFIG[item.status];
                                        const StatusIcon = statusCfg.icon;
                                        const Icon = ICON_MAP[item.icon] || Layers;
                                        return (
                                            <tr key={item.id} className="hover:bg-gray-50 transition-colors group/row">
                                                <td className="px-4 py-3 text-center text-gray-400 font-bold italic">{item.order}</td>
                                                <td className="px-4 py-3">
                                                    <div className="font-bold text-gray-800">{item.name}</div>
                                                    <div className="text-[10px] text-gray-400 font-mono tracking-tight uppercase leading-none mt-0.5">{item.key}</div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-400 font-mono text-[11px] font-bold">{item.path}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-3 text-gray-600">
                                                        <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center border border-gray-100 shadow-sm transition-transform group-hover/row:scale-110">
                                                            <Icon className="w-5 h-5 text-indigo-600" />
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-400 truncate max-w-[80px]">{item.icon}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <button
                                                        onClick={() => updateMenuItem(item.id, { adminOnly: !item.adminOnly })}
                                                        className={`text-[9px] font-bold px-2 py-1 rounded-lg border transition-all ${item.adminOnly
                                                            ? 'bg-purple-100 text-purple-700 border-purple-200'
                                                            : 'bg-gray-50 text-gray-400 border-gray-100'
                                                            }`}
                                                    >
                                                        {item.adminOnly ? 'ADMIN ONLY' : 'PUBLIC'}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="relative inline-block">
                                                        <select
                                                            value={item.status}
                                                            onChange={e => handleMenuStatusChange(item, e.target.value as MenuItemStatus)}
                                                            className={`appearance-none text-[11px] font-bold border rounded-xl px-4 py-1.5 pr-8 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-colors ${statusCfg.badge}`}
                                                        >
                                                            <option value="active">✅ Đang hoạt động</option>
                                                            <option value="coming_soon">⚡ Coming Soon</option>
                                                            <option value="inactive">🚫 Ngừng hoạt động</option>
                                                        </select>
                                                        <StatusIcon className="w-3 h-3 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-center">
                                                    <div className="flex justify-center gap-2">
                                                        <button onClick={() => handleOpenEditMenu(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm" title="Sửa Menu"><Edit2 className="w-4 h-4" /></button>
                                                        <button
                                                            onClick={() => handleDeleteMenuItem(item.id, item.name)}
                                                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all transform hover:rotate-12"
                                                            title="Xóa Menu"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>

                            <div className="px-4 py-4 bg-gray-50 border-t border-gray-100 flex flex-wrap gap-x-8 gap-y-2 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span> Hiển thị bình thường</span>
                                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span> Hiển thị dạng Badge</span>
                                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span> Ẩn hoàn toàn</span>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ===================== TAB: DRIVE CONFIG ===================== */}
            {activeTab === 'driveConfig' && user?.role === 'admin' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 text-gray-700">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <HardDrive className="w-5 h-5 text-blue-600" />
                                    Kết nối Google Drive
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">Lấy cấu trúc dự án hiện tại và thiết lập thư mục tương ứng trên Drive.</p>
                            </div>
                            <button
                                onClick={handleSyncDrive}
                                disabled={isSyncing}
                                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2.5 rounded-lg text-sm font-bold hover:bg-blue-700 disabled:opacity-50 transition-all shadow-md shadow-blue-100"
                            >
                                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                {driveConfig?.rootId ? 'Đồng bộ cập nhật cấu trúc' : 'Thiết lập Drive & Đồng bộ'}
                            </button>
                        </div>

                        {/* Hướng dẫn dùng 2TB */}
                        <div className="mb-8 p-4 bg-indigo-50 rounded-xl border border-indigo-100 text-sm">
                            <h4 className="font-bold text-indigo-800 flex items-center gap-2 mb-2">
                                <ShieldAlert className="w-4 h-4" />
                                Cách sử dụng dung lượng 2TB của bạn
                            </h4>
                            <div className="space-y-3 text-indigo-700 font-bold">
                                <p>Để hệ thống dùng dung lượng 2TB của bạn thay vì 15GB mặc định, vui lòng làm theo 3 bước:</p>
                                <ol className="list-decimal ml-5 space-y-1">
                                    <li>Mở Drive của bạn, tạo một thư mục mới (ví dụ: "CDE_ROOT").</li>
                                    <li>Chia sẻ (Share) thư mục đó cho Email này với quyền <strong>Người chỉnh sửa (Editor)</strong>:
                                        <div className="mt-1 flex items-center gap-2">
                                            <code className="bg-white px-2 py-1 rounded border border-indigo-200 font-mono text-xs select-all">
                                                firebase-adminsdk-fbsvc@cde-htkt.iam.gserviceaccount.com
                                            </code>
                                        </div>
                                    </li>
                                    <li>Copy <strong>ID của thư mục</strong> đó (đoạn mã trên link trình duyệt) và dán vào ô dưới đây:</li>
                                </ol>
                                <div className="mt-4 flex gap-2">
                                    <input
                                        type="text"
                                        placeholder="Dán Folder ID tại đây..."
                                        value={manualRootId}
                                        onChange={e => setManualRootId(e.target.value)}
                                        className="flex-1 px-3 py-2 bg-white border border-indigo-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                    />
                                    <button
                                        onClick={handleSaveRootId}
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition-colors"
                                    >
                                        Lưu ID
                                    </button>
                                </div>
                            </div>
                        </div>

                        {driveConfig?.rootId && (
                            <div className="mb-8 space-y-3">
                                <div className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-red-800">Làm sạch dữ liệu đồng bộ cũ</p>
                                        <p className="text-xs text-red-600 mt-1 font-bold">Dùng khi bạn muốn hệ thống tạo lại toàn bộ thư mục Dự án trên Drive 2TB mới.</p>
                                    </div>
                                    <button
                                        onClick={handleResetAllNodesDrive}
                                        disabled={isSyncing}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-50 transition-colors"
                                    >
                                        Reset liên kết Dự án
                                    </button>
                                </div>

                                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-orange-800">NUCLEAR OPTION: Reset & Làm sạch toàn bộ Drive</p>
                                        <p className="text-xs text-orange-600 mt-1 font-bold">Xóa hẳn thư mục CDE-ROOT cũ khỏi Drive và xóa sạch liên kết trong Firestore để bắt đầu lại từ đầu.</p>
                                    </div>
                                    <button
                                        onClick={handleResetDrive}
                                        disabled={isSyncing}
                                        className="px-4 py-2 bg-orange-600 text-white rounded-lg text-xs font-bold hover:bg-orange-700 disabled:opacity-50 transition-colors shadow-lg"
                                    >
                                        Reset & Làm sạch DRIVE
                                    </button>
                                </div>
                            </div>
                        )}

                        {driveConfig ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Root Folder ID</p>
                                    <p className="text-sm font-mono text-gray-700 break-all font-bold">{driveConfig.rootId}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Cập nhật lần cuối</p>
                                    <p className="text-sm text-gray-700 font-bold">{driveConfig.updatedAt ? new Date(driveConfig.updatedAt).toLocaleString('vi-VN') : 'Chưa rõ'}</p>
                                </div>
                                <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 md:col-span-2">
                                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">Trạng thái hệ thống thư mục</p>
                                    <ul className="text-xs text-blue-700 space-y-1.5 mt-2 font-bold">
                                        <li className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                            Văn bản Đến: <span className="font-mono opacity-70 ml-auto">{driveConfig.vanBanDenId}</span>
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                            Văn bản Đi: <span className="font-mono opacity-70 ml-auto">{driveConfig.vanBanDiId}</span>
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                            Hồ sơ Dự án: <span className="font-mono opacity-70 ml-auto">{driveConfig.projectsRootId}</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            <div className="py-12 text-center bg-gray-50 rounded-xl border border-dashed border-gray-300 font-bold">
                                <HardDrive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 text-sm">Chưa có thông tin kết nối Drive.</p>
                                <p className="text-gray-400 text-xs mt-1">Nhấn nút "Thiết lập Drive" ở góc phải để bắt đầu kết nối.</p>
                            </div>
                        )}
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex gap-4">
                        <Zap className="w-6 h-6 text-amber-600 shrink-0" />
                        <div>
                            <h4 className="text-sm font-bold text-amber-800 uppercase tracking-tight">Cơ chế hoạt động</h4>
                            <p className="text-xs text-amber-700 mt-1 leading-relaxed font-bold">
                                Khi kích hoạt, hệ thống sẽ <strong>tạo và liên kết</strong> thư mục Drive cho từng nhánh công việc hiện có.
                                Sau đó, mọi hành động Thêm/Sửa/Xóa nhánh trên WebApp sẽ được Cloud Functions tự động đồng bộ hóa sang Drive theo thời gian thực.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ===================== TAB: APP SETTINGS ===================== */}
            {activeTab === 'appSettings' && user?.role === 'admin' && (
                <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <AppSettingsTab />
                </div>
            )}

            {/* ===================== TAB: DANH MỤC THÔNG THƯỜNG ===================== */}
            {activeTab !== 'menuConfig' && activeTab !== 'driveConfig' && activeTab !== 'appSettings' && (
                isLoading ? (
                    <div className="flex justify-center p-12">
                        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                                DANH SÁCH CHI TIẾT
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    onClick={() => setSortMode(prev => prev === 'order' ? 'name' : 'order')}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors shadow-sm border
                                        ${sortMode === 'name' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                                >
                                    <ArrowUpDown className="w-4 h-4" />
                                    {sortMode === 'name' ? 'Hủy Sort (Mặc định)' : 'Sắp xếp theo Tên'}
                                </button>
                                <input
                                    type="file"
                                    accept=".xlsx, .xls"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleImportExcel}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={isImporting}
                                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
                                >
                                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    Import Excel
                                </button>
                                {user?.role === 'admin' && (
                                    <button
                                        onClick={handleDeleteAll}
                                        disabled={filteredList.length === 0 || isImporting}
                                        className="flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors shadow-sm border border-red-200 disabled:opacity-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Xóa tất cả
                                    </button>
                                )}
                                <button
                                    onClick={handleOpenAdd}
                                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    Thêm Thuộc tính mới
                                </button>
                            </div>
                        </div>
                        <div className="bg-white border text-sm border-gray-200 rounded-xl shadow-sm overflow-x-auto overflow-y-hidden text-gray-700">
                            <table className="w-full text-left min-w-[700px]">
                                <thead className="bg-gray-50 font-bold uppercase text-[10px] tracking-wider text-gray-500">
                                    <tr>
                                        <th className="px-6 py-3 w-16 text-center">STT</th>
                                        <th className="px-6 py-3">Tên Thuộc tính</th>
                                        {activeTab === 'phongBan' && <th className="px-6 py-3">Nhóm / Cơ quan Cấp trên</th>}
                                        <th className="px-6 py-3">Ghi chú</th>
                                        <th className="px-6 py-3 w-32 text-center">Trạng thái</th>
                                        <th className="px-6 py-3 w-32 text-center">Tác vụ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-bold">
                                    {isAdding && (
                                        <tr className="bg-indigo-50/50">
                                            <td className="px-6 py-3 text-center">
                                                <input type="number" value={formData.order} onChange={e => setFormData({ ...formData, order: Number(e.target.value) })} className="w-12 p-1 text-center bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                            </td>
                                            <td className="px-6 py-3">
                                                <input type="text" autoFocus placeholder="Tên danh mục..." value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                            </td>
                                            {activeTab === 'phongBan' && (
                                                <td className="px-6 py-3">
                                                    <input type="text" placeholder="Trực thuộc..." value={formData.parentAgency} onChange={e => setFormData({ ...formData, parentAgency: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                </td>
                                            )}
                                            <td className="px-6 py-3">
                                                <input type="text" placeholder="Ghi chú ngắn..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <button onClick={() => setFormData({ ...formData, isActive: !formData.isActive })} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${formData.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {formData.isActive ? 'Bật hiển thị' : 'Đang ẩn đi'}
                                                </button>
                                            </td>
                                            <td className="px-6 py-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={handleSavePrimary} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm" title="Lưu lại"><Save className="w-4 h-4" /></button>
                                                    <button onClick={handleCancel} className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-sm" title="Hủy bỏ"><X className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}

                                    {filteredList.length === 0 && !isAdding && (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                                                Chưa có thành phần nào trong Từ điển "{tabs.find(t => t.id === activeTab)?.label}".
                                            </td>
                                        </tr>
                                    )}

                                    {!isAdding && groupKeys.map(agency => (
                                        <React.Fragment key={agency}>
                                            {activeTab === 'phongBan' && (
                                                <tr className="bg-gray-100/60 border-t-2 border-gray-200">
                                                    <td colSpan={6} className="px-6 py-2">
                                                        <div className="flex items-center gap-2">
                                                            <Layers className="w-4 h-4 text-indigo-500" />
                                                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">{agency}</span>
                                                            <span className="bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-[10px] ml-1">{groupedCategories[agency].length} mục</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                            {groupedCategories[agency].map((item) => {
                                                const isEdtingThis = editingId === item.id;
                                                if (isEdtingThis) {
                                                    return (
                                                        <tr key={item.id} className="bg-indigo-50/20">
                                                            <td className="px-6 py-3 text-center">
                                                                <input type="number" value={formData.order} onChange={e => setFormData({ ...formData, order: Number(e.target.value) })} className="w-12 p-1 text-center bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                            </td>
                                                            <td className="px-6 py-3">
                                                                <input type="text" autoFocus value={formData.value} onChange={e => setFormData({ ...formData, value: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                            </td>
                                                            {activeTab === 'phongBan' && (
                                                                <td className="px-6 py-3">
                                                                    <input type="text" value={formData.parentAgency} onChange={e => setFormData({ ...formData, parentAgency: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                                </td>
                                                            )}
                                                            <td className="px-6 py-3">
                                                                <input type="text" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-1.5 bg-white border border-gray-300 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 font-bold" />
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <button onClick={() => setFormData({ ...formData, isActive: !formData.isActive })} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${formData.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                                    {formData.isActive ? 'Hiển thị' : 'Đã Ẩn'}
                                                                </button>
                                                            </td>
                                                            <td className="px-6 py-3 text-center">
                                                                <div className="flex justify-center gap-2">
                                                                    <button onClick={handleSavePrimary} className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 shadow-sm" title="Lưu lại"><Save className="w-4 h-4" /></button>
                                                                    <button onClick={handleCancel} className="p-1.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 shadow-sm" title="Hủy bỏ"><X className="w-4 h-4" /></button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                }

                                                return (
                                                    <tr key={item.id} className="hover:bg-gray-50 transition-colors pl-4">
                                                        <td className="px-6 py-3 text-center text-gray-400 font-bold italic">#{item.order}</td>
                                                        <td className="px-6 py-3 font-bold text-gray-800">{item.value}</td>
                                                        {activeTab === 'phongBan' && (
                                                            <td className="px-6 py-3 font-bold text-indigo-600 text-sm">{item.parentAgency || '-'}</td>
                                                        )}
                                                        <td className="px-6 py-3 text-gray-500 font-bold">{item.description || '-'}</td>
                                                        <td className="px-6 py-3 text-center whitespace-nowrap">
                                                            {item.isActive
                                                                ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 whitespace-nowrap"><CheckCircle className="w-3 h-3" /> HOẠT ĐỘNG</span>
                                                                : <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 whitespace-nowrap"><XCircle className="w-3 h-3" /> ĐANG TẮT</span>
                                                            }
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <div className="flex justify-center gap-2">
                                                                <button onClick={() => handleOpenEdit(item)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shadow-sm" title="Sửa"><Edit2 className="w-4 h-4" /></button>
                                                                {user?.role === 'admin' && (
                                                                    <button onClick={() => handleDeleteClick(item.id, item.value)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors shadow-sm" title="Xóa vĩnh viễn"><Trash2 className="w-4 h-4" /></button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}



            {/* Modal: Tạo Tab mới */}
            {isAddingTab && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 text-gray-700 font-bold">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100 animate-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800 text-lg">Tạo Danh mục mới</h3>
                            <button onClick={() => setIsAddingTab(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 font-bold space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Tên hiển thị <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    autoFocus
                                    value={newTabName}
                                    onChange={e => setNewTabName(e.target.value)}
                                    placeholder="VD: Hình thức Đầu tư..."
                                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-sm font-bold mr-4"
                                />
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 text-xs text-blue-700 leading-relaxed font-bold">
                                <Zap className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                Nhóm danh mục này giúp bạn chuẩn hóa dữ liệu đầu vào. Sau khi tạo, bạn có thể thêm các giá trị thuộc tính bên trong Tab này.
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-3 font-bold">
                            <button onClick={() => setIsAddingTab(false)} className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800 transition-colors">Hủy bỏ</button>
                            <button onClick={handleAddTabConfig} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all flex items-center gap-2"><Plus className="w-4 h-4" /> Tạo Tab mới</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Debug Drive */}
            {showDebugModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-gray-700">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-blue-50/50">
                            <div className="flex items-center gap-2">
                                <HardDrive className="w-5 h-5 text-blue-600" />
                                <h3 className="font-bold text-gray-800 text-lg">Chi tiết Đồng bộ Drive</h3>
                            </div>
                            <button onClick={() => setShowDebugModal(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            <div className="bg-gray-900 rounded-xl p-5 max-h-[400px] overflow-y-auto font-mono text-xs leading-relaxed text-emerald-400 font-bold scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                                {syncDebugLogs.map((log, idx) => (
                                    <div key={idx} className="mb-1.5 border-b border-gray-800/50 pb-1.5 last:border-0 last:pb-0">
                                        <span className="text-gray-600 mr-2">[{idx + 1}]</span>
                                        {log}
                                    </div>
                                ))}
                                {syncDebugLogs.length === 0 && <div className="text-gray-500 py-8 text-center uppercase tracking-widest text-[10px]">Mọi thứ đang hoạt động tốt</div>}
                            </div>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t flex justify-end font-bold">
                            <button
                                onClick={() => setShowDebugModal(false)}
                                className="px-8 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-all font-bold"
                            >
                                Đóng nhật ký
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <DeleteConfirmModal
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={confirmDelete}
                itemName={deleteTarget.name}
            />

            {/* Generic Confirm Modal for Drive Actions */}
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
                                    {confirmAction.confirmText || 'Xác nhận'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Child Component: Cấu hình chung ---
const AppSettingsTab = () => {
    const { settings, updateSettings, fetchSettings, error } = useAppSettingsStore();
    const [localSettings, setLocalSettings] = useState(settings);
    const [isSaving, setIsSaving] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    console.log(">>> [AppSettingsTab] Components Rendering - Logic Cloud Function active");
    const [uploadingBg, setUploadingBg] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const handleUploadBg = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            toast.error('Kích thước ảnh không được vượt quá 5MB');
            return;
        }

        setUploadingBg(true);
        setUploadProgress(10);
        try {
            // Đọc file sang Base64
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const base64Data = await base64Promise;
            setUploadProgress(40);

            // Gọi Cloud Function
            const uploadFn = httpsCallable(appFunctions, 'uploadToStorageBase64');
            const result = await uploadFn({
                base64Data,
                fileName: file.name,
                contentType: file.type,
                folderPath: 'public_assets'
            });

            const data = result.data as any;
            if (data.success) {
                setUploadProgress(100);
                setLocalSettings(prev => ({ ...prev, loginBgUrl: data.downloadURL }));
                toast.success('Đã tải lên ảnh nền thành công. Hãy bấm Lưu Thay Đổi để áp dụng.');
            } else {
                throw new Error(data.message || 'Upload thất bại');
            }
        } catch (error: any) {
            console.error('Lỗi upload ảnh nền:', error);
            toast.error(`Lỗi upload ảnh nền: ${error.message || 'Vui lòng thử lại.'}`);
        } finally {
            setUploadingBg(false);
            e.target.value = ''; // Reset input
        }
    };

    const handleRemoveBg = () => {
        setLocalSettings(prev => ({ ...prev, loginBgUrl: '' }));
    };

    const handleSave = async () => {
        setIsSaving(true);
        setSuccessMsg('');
        try {
            await updateSettings(localSettings);
            setSuccessMsg('Đã lưu cấu hình chung thành công!');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (err: any) {
            console.error('Lỗi khi lưu cấu hình:', err);
            toast.error(`Không thể lưu cấu hình: ${err.message || 'Lỗi không xác định'}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 max-w-2xl">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">Cấu hình Hệ thống Chung</h3>

            {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-center gap-2">
                    <AlertCircle size={16} /> {error}
                </div>
            )}

            {successMsg && (
                <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-100 flex items-center gap-2">
                    <CheckCircle size={16} /> {successMsg}
                </div>
            )}

            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tên Viết tắt (Hiển thị Header)
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                        type="text"
                        value={localSettings.appName}
                        onChange={(e) => setLocalSettings({ ...localSettings, appName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        placeholder="VD: CDE-HTKT, BQLDA..."
                    />
                    <p className="text-xs text-gray-500 mt-1">Xuất hiện cạnh Logo và Tiêu đề Tab trình duyệt.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tên Cơ quan / Đơn vị (Hiển thị Header / Footer)
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                        type="text"
                        value={localSettings.agencyName}
                        onChange={(e) => setLocalSettings({ ...localSettings, agencyName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        placeholder="VD: Ban Hạ tầng kỹ thuật, Ban Quản lý DA..."
                    />
                    <p className="text-xs text-gray-500 mt-1">Sử dụng cho các chức năng in ấn, báo cáo hoặc text hiển thị bên dưới logo.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Tiêu đề Hệ thống (Hiển thị Giữa Header)
                        <span className="text-red-500 ml-1">*</span>
                    </label>
                    <input
                        type="text"
                        value={localSettings.systemTitle || ''}
                        onChange={(e) => setLocalSettings({ ...localSettings, systemTitle: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 uppercase"
                        placeholder="VD: HỆ THỐNG DỮ LIỆU DÙNG CHUNG..."
                    />
                    <p className="text-xs text-gray-500 mt-1">Xuất hiện ở vị trí trung tâm, chữ in hoa, màu xanh gradient nổi bật.</p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Hình nền màn hình Đăng nhập
                    </label>
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                        {localSettings.loginBgUrl ? (
                            <div className="relative w-48 h-28 rounded-lg overflow-hidden border border-gray-200 shadow-sm bg-gray-100 flex-shrink-0">
                                <img src={localSettings.loginBgUrl} alt="Login Background" className="w-full h-full object-cover" />
                                <button
                                    onClick={handleRemoveBg}
                                    className="absolute top-1.5 right-1.5 p-1 bg-red-600/90 hover:bg-red-700 text-white rounded-full transition shadow-sm backdrop-blur-sm"
                                    title="Xoá hình nền này"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="w-48 h-28 flex-shrink-0 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center text-gray-400">
                                <Upload size={24} className="mb-2 opacity-50" />
                                <span className="text-xs">Chưa có nền tùy chỉnh</span>
                            </div>
                        )}
                        <div className="flex-1">
                            <label className={`inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg transition-colors cursor-pointer ${uploadingBg ? 'bg-gray-50 cursor-not-allowed' : 'bg-white hover:bg-gray-50'}`}>
                                {uploadingBg ? <Loader2 size={16} className="animate-spin text-blue-600" /> : <Upload size={16} />}
                                <span className="text-sm font-medium">{uploadingBg ? `Đang tải... ${uploadProgress}%` : 'Chọn ảnh mới'}</span>
                                <input type="file" accept="image/png, image/jpeg, image/webp" className="hidden" onChange={handleUploadBg} disabled={uploadingBg} />
                            </label>
                            <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                                Hỗ trợ: JPG, PNG, WEBP.<br/>
                                Dung lượng tối đa: 5MB.<br/>
                                Kích thước khuyến nghị: 1920x1080px (Tỷ lệ 16:9).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !localSettings.appName || !localSettings.agencyName || !localSettings.systemTitle}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                        {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        Lưu Thay Đổi
                    </button>
                </div>
            </div>
        </div>
    );
};
