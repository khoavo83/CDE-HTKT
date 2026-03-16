import React from 'react';
import { Monitor, AlertTriangle, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface MobileWarningProps {
    title?: string;
    message?: string;
    showBackButton?: boolean;
}

export const MobileWarning: React.FC<MobileWarningProps> = ({ 
    title = "Tính năng này không hỗ trợ Mobile", 
    message = "Để có trải nghiệm tốt nhất và đầy đủ các công cụ quản lý, vui lòng truy cập trang này trên máy tính (Desktop).",
    showBackButton = true
}) => {
    const navigate = useNavigate();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200 m-4">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <Monitor className="w-10 h-10 text-amber-600" />
            </div>
            
            <h2 className="text-xl font-bold text-gray-900 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                {title}
            </h2>
            
            <p className="text-gray-600 max-w-sm mb-8 leading-relaxed">
                {message}
            </p>

            {showBackButton && (
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 rounded-xl font-bold text-gray-700 hover:bg-gray-50 transition-all shadow-sm active:scale-95"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Quay lại trang trước
                </button>
            )}
        </div>
    );
};
