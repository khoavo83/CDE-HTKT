import React, { useEffect } from 'react';
import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { auth } from '../firebase/config';
import {
    LayoutDashboard, FileText, Share2, Box, LogOut, Users, Settings,
    Map as MapIcon, FolderTree, Zap, Sun, Moon, BookOpen, Layers, Database,
    Calendar as CalendarIcon, MessageSquare, Trash2, X, ListChecks, Menu
} from 'lucide-react';
import { useMenuConfigStore } from '../store/useMenuConfigStore';
import { useThemeStore } from '../store/useThemeStore';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { UserProfileModal } from '../components/UserProfileModal';
import { DriveStorageStatus } from '../components/DriveStorageStatus';
import { GlobalHeader } from '../components/GlobalHeader';
import { GlobalFooter } from '../components/GlobalFooter';
import { ConfirmModal } from '../components/ConfirmModal';

// Map icon string → component
export const ICON_MAP: Record<string, React.ElementType> = {
    LayoutDashboard, FolderTree, Share2, FileText, Box, Calendar: CalendarIcon,
    Map: MapIcon, Users, Settings, Zap, BookOpen, Layers, Database, MessageSquare, Trash: Trash2, ListChecks
};

export const MainLayout = () => {
    const { user, setUser } = useAuthStore();
    const location = useLocation();
    const { menuItems, isLoading, fetchMenuConfig, seedMenuConfig } = useMenuConfigStore();
    const { theme, toggleTheme, initTheme } = useThemeStore();
    const [isProfileModalOpen, setIsProfileModalOpen] = React.useState(false);
    const [isLogoutModalOpen, setIsLogoutModalOpen] = React.useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);
    const [isDesktopMenuCollapsed, setIsDesktopMenuCollapsed] = React.useState(false);
    const [pendingCount, setPendingCount] = React.useState(0);

    // Lắng nghe số lượng user pending cho badge ở Menu
    useEffect(() => {
        if (user?.role !== 'admin') {
            setPendingCount(0);
            return;
        }
        const q = query(collection(db, 'users'), where('role', '==', 'pending'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingCount(snapshot.size);
        });
        return () => unsubscribe();
    }, [user]);

    // Khởi tạo theme từ localStorage / prefers-color-scheme
    useEffect(() => {
        initTheme();
    }, [initTheme]);

    useEffect(() => {
        const unsub = fetchMenuConfig();
        return unsub;
    }, [fetchMenuConfig]);

    // Nếu collection rỗng hoặc thiếu mục quan trọng → seed dữ liệu mặc định
    useEffect(() => {
        if (!isLoading) {
            if (menuItems.length === 0) {
                seedMenuConfig();
            } else {
                // Kiểm tra xem đã có mục Sổ công văn, Lịch họp hoặc Góp ý chưa, nếu chưa thì seed thêm
                const hasInternalDocs = menuItems.some(item => item.key === 'internal_docs');
                const hasMeetings = menuItems.some(item => item.key === 'meetings');
                const hasFeedbacks = menuItems.some(item => item.key === 'feedbacks');
                const hasTrash = menuItems.some(item => item.key === 'trash');
                const hasTasks = menuItems.some(item => item.key === 'tasks');
                if (!hasInternalDocs || !hasMeetings || !hasFeedbacks || !hasTrash || !hasTasks) {
                    seedMenuConfig();
                }
            }
        }
    }, [isLoading, menuItems, seedMenuConfig]);

    if (!user) {
        return <Navigate to="/login" replace />;
    }

    if (user.role === 'pending') {
        return <Navigate to="/pending-approval" replace />;
    }

    const handleLogout = async () => {
        await auth.signOut();
        setUser(null);
    };

    // Lọc + sắp xếp menu dựa trên config Firestore
    const visibleItems = menuItems
        .filter(item => {
            if (item.status === 'inactive') return false;          // Ẩn hoàn toàn
            // Danh mục Hệ thống (categories) được phép hiển thị cho mọi người dùng (đã qua lớp bảo mật Tab bên trong)
            if (item.key === 'categories') return true;
            if (item.adminOnly && user.role !== 'admin') return false; // Admin-only
            return true;
        })
        .sort((a, b) => a.order - b.order);

    return (
        <div className="flex h-screen bg-gray-50 transition-colors duration-300 overflow-hidden relative">
            {/* Mobile Overlay */}
            {isMobileMenuOpen && (
                <div
                    className="fixed inset-0 bg-gray-900/50 z-40 md:hidden transition-opacity"
                    onClick={() => setIsMobileMenuOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`fixed md:relative flex flex-col h-full bg-white border-r border-gray-200 z-50 transition-all duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0 w-60' : '-translate-x-full md:translate-x-0'} ${isDesktopMenuCollapsed ? 'md:w-20' : 'md:w-60'}`}>
                <div className={`p-4 flex items-center ${isDesktopMenuCollapsed ? 'md:justify-center justify-between' : 'justify-between'}`}>
                    <div className={`${isDesktopMenuCollapsed ? 'md:hidden' : ''}`}>
                        <h2 className="text-xl font-bold text-primary-600">CDE - HTKT</h2>
                        <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-widest font-bold">Quản lý Dữ liệu</p>
                    </div>
                    <button
                        onClick={() => setIsDesktopMenuCollapsed(!isDesktopMenuCollapsed)}
                        className="hidden md:flex p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                        title="Thu gọn/Mở rộng Menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden p-2 text-gray-500 bg-gray-100 rounded-lg"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                    {visibleItems.map((item) => {
                        const Icon = ICON_MAP[item.icon] || FileText;
                        const isActive = location.pathname === item.path;
                        const isComingSoon = item.status === 'coming_soon';

                        if (isComingSoon) {
                            if (user.role === 'admin') {
                                return (
                                    <Link
                                        key={item.key}
                                        to={item.path}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors ${isActive
                                            ? 'bg-primary-50 text-primary-600'
                                            : 'text-gray-600 hover:bg-gray-100'
                                            } ${isDesktopMenuCollapsed ? 'justify-center' : ''}`}
                                        title={`${item.name} (Coming soon - Admin test)`}
                                    >
                                        <Icon className="w-5 h-5 shrink-0" />
                                        {!isDesktopMenuCollapsed && (
                                            <>
                                                <span className="flex-1">{item.name}</span>
                                                <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Test</span>
                                            </>
                                        )}
                                    </Link>
                                );
                            }

                            return (
                                <div
                                    key={item.key}
                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-gray-400 cursor-not-allowed select-none ${isDesktopMenuCollapsed ? 'justify-center' : ''}`}
                                    title={`${item.name} (Coming soon)`}
                                >
                                    <Icon className="w-5 h-5 opacity-50 shrink-0" />
                                    {!isDesktopMenuCollapsed && (
                                        <>
                                            <span className="flex-1 opacity-70">{item.name}</span>
                                            <span className="text-[9px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full opacity-70">Soon</span>
                                        </>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Link
                                key={item.key}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium transition-colors relative ${isActive
                                    ? 'bg-primary-50 text-primary-600'
                                    : 'text-gray-600 hover:bg-gray-100'
                                    } ${isDesktopMenuCollapsed ? 'justify-center' : ''}`}
                                title={isDesktopMenuCollapsed ? item.name : undefined}
                            >
                                <Icon className="w-5 h-5 shrink-0" />
                                {!isDesktopMenuCollapsed && <span className="flex-1">{item.name}</span>}
                                {item.key === 'users' && pendingCount > 0 && (
                                    <span className={`flex items-center justify-center bg-red-500 text-[10px] text-white rounded-full font-bold animate-pulse ${isDesktopMenuCollapsed ? 'absolute top-1 right-1 w-4 h-4 text-[8px]' : 'h-5 w-5'}`}>
                                        {pendingCount}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className={isDesktopMenuCollapsed ? 'hidden' : 'px-4 mb-2'}>
                    <DriveStorageStatus />
                </div>

                {/* User profile & Logout */}
                <div className={`p-4 border-t border-gray-200 mt-2 flex flex-col ${isDesktopMenuCollapsed ? 'items-center gap-4' : 'gap-3'}`}>
                    <div className={`flex items-center ${isDesktopMenuCollapsed ? 'justify-center w-full' : 'gap-3 w-full'}`}>
                        <button
                            title="Nhấp để thay đổi Thông tin & Ảnh đại diện"
                            onClick={() => setIsProfileModalOpen(true)}
                            className={`flex items-center gap-3 text-left hover:bg-gray-50 p-1.5 rounded-lg transition-colors overflow-hidden shrink min-w-0 ${isDesktopMenuCollapsed ? '' : '-ml-1.5 flex-1'}`}
                        >
                            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-bold shrink-0 overflow-hidden border border-primary-200">
                                {user.photoURL ? (
                                    <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    (user.hoTen || user.displayName).charAt(0).toUpperCase()
                                )}
                            </div>
                            {!isDesktopMenuCollapsed && (
                                <div className="flex-1 min-w-0 pr-1">
                                    <p className="text-sm font-bold text-gray-900 truncate hover:text-primary-600 transition-colors">
                                        {user.hoTen || user.displayName}
                                    </p>
                                    <p className="text-[11px] font-medium text-gray-500 truncate capitalize bg-gray-100 px-1.5 py-0.5 rounded-md inline-block mt-0.5">{user.role}</p>
                                </div>
                            )}
                        </button>

                        {!isDesktopMenuCollapsed && (
                            <button
                                onClick={toggleTheme}
                                title={theme === 'light' ? 'Chuyển sang Dark mode' : 'Chuyển sang Light mode'}
                                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors flex-shrink-0"
                            >
                                {theme === 'light' ? (
                                    <Moon className="w-4 h-4" />
                                ) : (
                                    <Sun className="w-4 h-4" />
                                )}
                            </button>
                        )}
                    </div>

                    <button
                        onClick={() => setIsLogoutModalOpen(true)}
                        title="Đăng xuất"
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold text-red-600 rounded-xl hover:bg-red-50 hover:text-red-700 transition-all active:scale-95 border border-transparent hover:border-red-100 ${isDesktopMenuCollapsed ? 'w-10 h-10 p-0 rounded-lg' : 'w-full'}`}
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        {!isDesktopMenuCollapsed && <span>Đăng xuất</span>}
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 overflow-hidden bg-gray-50 transition-colors duration-300 flex flex-col w-full main-content">
                <GlobalHeader onMenuClick={() => setIsMobileMenuOpen(true)} />
                <div className="flex-1 min-w-0 overflow-auto flex flex-col w-full">
                    <div className="flex-1 min-w-0">
                        <Outlet />
                    </div>
                    <GlobalFooter />
                </div>
            </main>

            <UserProfileModal
                isOpen={isProfileModalOpen}
                onClose={() => setIsProfileModalOpen(false)}
            />

            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                onConfirm={handleLogout}
                title="Xác nhận Đăng xuất"
                message="Bạn có chắc chắn muốn rời khỏi hệ thống? Mọi phiên làm việc chưa lưu có thể bị gián đoạn."
                confirmText="Đăng xuất ngay"
                cancelText="Quay lại"
                type="danger"
                icon={<LogOut className="w-8 h-8" />}
            />
        </div>
    );
};
