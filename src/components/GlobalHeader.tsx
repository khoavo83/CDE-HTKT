import React, { useState, useEffect } from 'react';
import logoUrl from '../assets/hcmc-metro-logo.jpg';
import { Bell, Database, MessageSquare, Menu } from 'lucide-react';
import { FeedbackModal } from './FeedbackModal';
import { useAppSettingsStore } from '../store/useAppSettingsStore';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

interface GlobalHeaderProps {
    onMenuClick?: () => void;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ onMenuClick }) => {
    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const { settings } = useAppSettingsStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        if (user?.role !== 'admin') {
            setPendingCount(0);
            return;
        }

        // Lắng nghe realtime số lượng user pending
        const q = query(collection(db, 'users'), where('role', '==', 'pending'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingCount(snapshot.size);
        });

        return () => unsubscribe();
    }, [user]);

    return (
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100 px-6 py-2 grid grid-cols-3 items-center shadow-sm select-none transition-all">
            {/* Left Section: Logo & Brand */}
            <div className="flex items-center gap-2 md:gap-4">
                {onMenuClick && (
                    <button
                        onClick={onMenuClick}
                        className="md:hidden p-1.5 -ml-2 text-gray-600 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                )}
                <div className="flex-shrink-0 hidden xs:block sm:block">
                    <img
                        src={logoUrl}
                        alt="HCMC Metro Logo"
                        className="h-9 md:h-12 w-auto object-contain hover:scale-105 transition-transform duration-300"
                    />
                </div>
                <div className="flex flex-col border-l border-gray-200 pl-2 md:pl-4 py-0.5 max-w-[110px] md:max-w-none">
                    <h2 className="text-[9px] md:text-[11px] font-bold text-gray-500 uppercase tracking-tight leading-tight opacity-80 truncate">
                        {settings.appName}
                    </h2>
                    <h2 className="text-[9px] md:text-[11px] font-black text-blue-800 uppercase tracking-tight leading-tight truncate">
                        {settings.agencyName}
                    </h2>
                </div>
            </div>

            {/* Middle Section: Centered Title */}
            <div className="flex flex-col items-center justify-center text-center overflow-hidden min-w-0 px-2 lg:px-4">
                <div className="flex flex-col md:flex-row items-center gap-1 md:gap-3">
                    <Database className="hidden md:block w-5 h-5 text-blue-700 shrink-0" />
                    <h1 className="text-[11px] sm:text-sm md:text-xl font-black bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-800 bg-clip-text text-transparent uppercase tracking-tight truncate w-full">
                        {settings.systemTitle}
                    </h1>
                </div>
            </div>

            {/* Right Section: Drive Status & Notifications */}


            <div className="flex items-center justify-end gap-3 md:gap-6 text-xs font-semibold">
                {/* Feedback Button */}
                <button
                    onClick={() => setIsFeedbackOpen(true)}
                    className="relative group p-2 hover:bg-gray-100 rounded-full transition-all duration-300"
                    title="Góp ý & Báo lỗi"
                >
                    <MessageSquare className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </button>

                {/* Notification Bell */}
                <button
                    onClick={() => navigate('/users')}
                    className="relative group p-2 hover:bg-gray-100 rounded-full transition-all duration-300"
                    title={pendingCount > 0 ? `Có ${pendingCount} người dùng chờ phê duyệt` : "Thông báo"}
                >
                    <Bell className={`w-5 h-5 ${pendingCount > 0 ? 'text-primary-600 animate-bounce' : 'text-gray-400'} group-hover:text-blue-600 transition-colors`} />
                    {pendingCount > 0 && (
                        <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center bg-red-500 text-[10px] text-white rounded-full border border-white font-bold">
                            {pendingCount}
                        </span>
                    )}
                </button>

                <div className="hidden sm:flex flex-col items-end border-l border-gray-200 pl-4 h-8 justify-center">
                    <span className="text-[9px] text-gray-400 uppercase tracking-widest font-bold">Ngày làm việc</span>
                    <span className="text-gray-700 font-bold">{new Date().toLocaleDateString('vi-VN')}</span>
                </div>
            </div>

            <FeedbackModal
                isOpen={isFeedbackOpen}
                onClose={() => setIsFeedbackOpen(false)}
            />
        </header>
    );
};
