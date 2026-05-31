import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

interface TabItem {
    name: string;
    path: string;
    icon?: React.ElementType;
}

interface PageTabsLayoutProps {
    title: string;
    tabs: TabItem[];
}

export const PageTabsLayout: React.FC<PageTabsLayoutProps> = ({ title, tabs }) => {
    const location = useLocation();

    return (
        <div className="flex flex-col h-full bg-gray-50 overflow-hidden">
            {/* Header Area with Title and Tabs */}
            <div className="bg-white border-b border-gray-200 shrink-0">
                <div className="px-4 sm:px-6 py-4">
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{title}</h1>
                </div>
                
                <div className="px-4 sm:px-6">
                    {/* Mobile: Horizontal scrollable tabs. Desktop: Standard tabs */}
                    <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto overflow-y-hidden pb-px hide-scrollbar -mb-px">
                        {tabs.map((tab) => {
                            // Check exact match for root path, or starts-with for sub-paths, 
                            // to handle active state correctly.
                            const isActive = location.pathname === tab.path || 
                                             (tab.path !== '/' && tab.path.split('?')[0] !== '' && location.pathname.startsWith(tab.path) && tab.path.split('/').length > 1 && location.pathname !== '/');
                            
                            const Icon = tab.icon;

                            return (
                                <NavLink
                                    key={tab.path}
                                    to={tab.path}
                                    className={({ isActive }) =>
                                        `whitespace-nowrap py-3 sm:py-4 px-2 sm:px-3 border-b-2 font-medium text-sm transition-colors flex items-center gap-2 ${
                                            isActive
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`
                                    }
                                >
                                    {Icon && <Icon className="w-4 h-4 shrink-0" />}
                                    <span>{tab.name}</span>
                                </NavLink>
                            );
                        })}
                    </nav>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-w-0 overflow-auto relative">
                <Outlet />
            </div>
            
            {/* Custom CSS to hide scrollbar but keep functionality */}
            <style>{`
                .hide-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .hide-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    );
};
