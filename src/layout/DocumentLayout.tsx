import React from 'react';
import { PageTabsLayout } from './PageTabsLayout';
import { FileText, BookOpen } from 'lucide-react';

export const DocumentLayout = () => {
    return (
        <PageTabsLayout
            title="Quản lý Văn bản"
            tabs={[
                { name: 'Văn bản & Hồ sơ', path: '/documents', icon: FileText },
                { name: 'Sổ Công văn Nội bộ', path: '/documents/internal-docs', icon: BookOpen },
            ]}
        />
    );
};
