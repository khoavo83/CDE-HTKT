import React from 'react';
import { PageTabsLayout } from './PageTabsLayout';
import { FolderTree, MessageSquare, Trash2 } from 'lucide-react';

export const AdminLayout = () => {
    return (
        <PageTabsLayout
            title="Quản lý Danh mục"
            tabs={[
                { name: 'Danh mục Hệ thống', path: '/admin/categories', icon: FolderTree },
                { name: 'Quản lý Góp ý', path: '/admin/feedbacks', icon: MessageSquare },
                { name: 'Thùng rác Dữ liệu', path: '/admin/trash', icon: Trash2 },
            ]}
        />
    );
};
