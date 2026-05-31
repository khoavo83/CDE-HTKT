import React from 'react';
import { useLocation } from 'react-router-dom';
import { CategoriesManagement } from './CategoriesManagement';
import { UsersManagement } from './UsersManagement';

export const AdminSettings = () => {
    const location = useLocation();
    const path = location.pathname;

    // Use CategoriesManagement as a base but force it to render specific tabs
    // We will pass a prop to CategoriesManagement to lock it into settings mode
    if (path.includes('/settings/users')) {
        return (
            <div className="h-full overflow-y-auto">
                <UsersManagement />
            </div>
        );
    }
    
    if (path.includes('/settings/menu')) {
        return <CategoriesManagement forcedTab="menuConfig" hideHeader={true} />;
    }

    if (path.includes('/settings/app')) {
        return <CategoriesManagement forcedTab="appSettings" hideHeader={true} />;
    }

    if (path.includes('/settings/drive')) {
        return <CategoriesManagement forcedTab="driveConfig" hideHeader={true} />;
    }

    return null;
};
