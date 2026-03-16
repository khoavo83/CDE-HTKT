import React from 'react';
import { AlertCircle } from 'lucide-react';

interface GenericConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    confirmText?: string;
    cancelText?: string;
}

export const GenericConfirmModal: React.FC<GenericConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    type = 'info',
    confirmText = 'Xác nhận',
    cancelText = 'Hủy bỏ'
}) => {
    if (!isOpen) return null;

    const getTypeStyles = () => {
        switch (type) {
            case 'danger':
                return {
                    iconBg: 'bg-red-100 text-red-600',
                    btnConfirm: 'bg-red-600 hover:bg-red-700 shadow-red-100'
                };
            case 'warning':
                return {
                    iconBg: 'bg-amber-100 text-amber-600',
                    btnConfirm: 'bg-amber-500 hover:bg-amber-600 shadow-amber-100'
                };
            default:
                return {
                    iconBg: 'bg-blue-100 text-blue-600',
                    btnConfirm: 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
                };
        }
    };

    const styles = getTypeStyles();

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 mx-auto ${styles.iconBg}`}>
                        <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="text-lg font-bold text-center text-gray-900 mb-2">
                        {title}
                    </h3>
                    <p className="text-center text-sm text-gray-500 mb-6 whitespace-pre-wrap leading-relaxed">
                        {message}
                    </p>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 font-bold transition-all"
                        >
                            {cancelText}
                        </button>
                        <button
                            onClick={() => {
                                onConfirm();
                                onClose();
                            }}
                            className={`flex-1 px-4 py-2.5 text-white rounded-xl font-bold transition-all shadow-lg ${styles.btnConfirm}`}
                        >
                            {confirmText}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
