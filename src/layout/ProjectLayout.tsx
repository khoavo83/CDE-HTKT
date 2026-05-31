import React from 'react';
import { PageTabsLayout } from './PageTabsLayout';
import { FolderTree, ListChecks, Share2, Calendar } from 'lucide-react';

export const ProjectLayout = () => {
    return (
        <PageTabsLayout
            title="Quản lý Dự án"
            tabs={[
                { name: 'Danh sách Dự án', path: '/projects', icon: FolderTree },
                { name: 'Quản lý Công việc', path: '/projects/tasks', icon: ListChecks },
                { name: 'Sơ đồ Mindmap', path: '/projects/mindmap', icon: Share2 },
                { name: 'Lịch họp & Điều hành', path: '/projects/meetings', icon: Calendar },
            ]}
        />
    );
};
