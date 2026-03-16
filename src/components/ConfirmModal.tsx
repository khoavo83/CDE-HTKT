import React from 'react';
import { X, AlertTriangle, LogOut } from 'lucide-react';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'info';
    icon?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Xác nhận',
    cancelText = 'Hủy',
    type = 'warning',
    icon
}) => {
    if (!isOpen) return null;

    const colors = {
        danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-200',
        warning: 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200',
        info: 'bg-primary-600 hover:bg-primary-700 text-white shadow-primary-200'
    };

    const iconBg = {
        danger: 'bg-red-50 text-red-600',
        warning: 'bg-amber-50 text-amber-600',
        info: 'bg-primary-50 text-primary-600'
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 h-screen w-screen overflow-hidden">
            {/* Backdrop with intense blur */}
            <div
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-md transition-opacity duration-300 animate-in fade-in"
                onClick={onClose}
            />

            {/* Modal Container */}
            <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all duration-300 animate-in zoom-in-95 slide-in-from-bottom-4">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors z-10"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-8">
                    {/* Icon section */}
                    <div className="flex justify-center mb-6">
                        <div className={`p-4 rounded-2xl ${iconBg[type]} transition-transform duration-500 hover:scale-110`}>
                            {icon || (type === 'danger' ? <AlertTriangle className="w-8 h-8" /> : <LogOut className="w-8 h-8" />)}
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="text-center space-y-3">
                        <h3 className="text-xl font-black text-gray-900 leading-tight">
                            {title}
                        </h3>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed px-2">
                            {message}
                        </p>
                    </div>

                    {/* Actions Section */}
                    <div className="mt-8 flex flex-col gap-3">
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all active:scale-[0.98] shadow-lg ${colors[type]}`}
                        >
                            {confirmText}
                        </button>
                        <button
                            onClick={onClose}
                            className="w-full py-3.5 rounded-2xl font-bold text-sm text-gray-600 hover:bg-gray-50 transition-all active:scale-[0.98] border border-transparent"
                        >
                            {cancelText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
