import React from 'react';
import { PageTabsLayout } from './PageTabsLayout';
import { Settings, Users, MessageSquare, Trash } from 'lucide-react';

export const AdminLayout = () => {
    return (
        <PageTabsLayout
            title="Quản trị Hệ thống"
            tabs={[
                { name: 'Danh mục Hệ thống', path: '/admin/categories', icon: Settings },
                { name: 'Quản lý Người dùng', path: '/admin/users', icon: Users },
                { name: 'Quản lý Góp ý', path: '/admin/feedbacks', icon: MessageSquare },
                { name: 'Thùng rác Dữ liệu', path: '/admin/trash', icon: Trash },
            ]}
        />
    );
};
