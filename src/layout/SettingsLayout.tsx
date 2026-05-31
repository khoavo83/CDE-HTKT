import { Outlet } from 'react-router-dom';
import { PageTabsLayout } from './PageTabsLayout';
import { useAuthStore } from '../store/useAuthStore';
import { Navigate } from 'react-router-dom';
import { Users, LayoutGrid, Settings, HardDrive } from 'lucide-react';

export function SettingsLayout() {
    const { user } = useAuthStore();
    
    if (user?.role !== 'admin') {
        return <Navigate to="/" replace />;
    }

    const tabs = [
        { name: 'Quản lý Người dùng', path: '/settings/users', icon: Users },
        { name: 'Menu Sidebar', path: '/settings/menu', icon: LayoutGrid },
        { name: 'Cấu hình chung', path: '/settings/app', icon: Settings },
        { name: 'Cấu hình Drive', path: '/settings/drive', icon: HardDrive },
    ];

    return (
        <PageTabsLayout
            title="Cấu hình Admin"
            tabs={tabs}
        />
    );
}
