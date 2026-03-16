import React, { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { appFunctions } from '../firebase/config';
import toast from 'react-hot-toast';

interface AddUserModalProps {
    isOpen: boolean;
    onClose: () => void;
    categories: any[];
}

export const AddUserModal: React.FC<AddUserModalProps> = ({ isOpen, onClose, categories }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        hoTen: '',
        displayName: '',
        chucVu: '',
        department: '',
        phone: '',
        role: 'viewer'
    });

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.email || !formData.hoTen) {
            toast.error('Vui lòng nhập đầy đủ Email và Họ Tên');
            return;
        }

        setIsLoading(true);
        try {
            const adminCreateUser = httpsCallable(appFunctions, 'adminCreateUser');
            await adminCreateUser(formData);

            toast.success('Thêm người dùng thành công (Mật khẩu mặc định: 123456)');
            onClose();
        } catch (error: any) {
            console.error('Lỗi thêm người dùng:', error);
            toast.error(error.message || 'Lỗi không xác định khi thêm người dùng');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 bg-gray-50/80">
                    <h3 className="text-lg font-bold text-gray-800">Thêm Người dùng Mới</h3>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <form id="addUserForm" onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email (Tên đăng nhập) *</label>
                            <input
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="nguyenvana@gmail.com"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Họ và Tên *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.hoTen}
                                    onChange={(e) => {
                                        const hoTen = e.target.value;
                                        const parts = hoTen.split(' ');
                                        const displayName = parts[parts.length - 1]; // Giả định tên gọi là chữ cuối
                                        setFormData({ ...formData, hoTen, displayName });
                                    }}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="Nguyễn Văn A"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Tên gọi hệ thống</label>
                                <input
                                    type="text"
                                    value={formData.displayName}
                                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    placeholder="A"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Chức vụ</label>
                                <select
                                    value={formData.chucVu}
                                    onChange={(e) => setFormData({ ...formData, chucVu: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="">-- Chọn Chức vụ --</option>
                                    {categories.filter(c => c.type === 'chucVu' && c.isActive).map(c => (
                                        <option key={c.id} value={c.value}>{c.value}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phòng ban</label>
                                <select
                                    value={formData.department}
                                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                                    className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value="">-- Chọn Phòng ban --</option>
                                    {categories.filter(c => c.type === 'phongBan' && c.isActive).map(c => (
                                        <option key={c.id} value={c.value}>{c.value}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                            <input
                                type="text"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="09xxxx..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phân quyền</label>
                            <select
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-indigo-700"
                            >
                                <option value="viewer">Viewer (Chỉ xem)</option>
                                <option value="editor">Editor (Chỉnh sửa)</option>
                                <option value="manager">Manager (Quản trị sơ cấp)</option>
                                <option value="admin">Admin (Quản trị hệ thống)</option>
                            </select>
                        </div>

                        <div className="p-3 bg-blue-50 text-blue-800 rounded-lg text-sm flex gap-2">
                            <span>ℹ️</span>
                            <span>Mật khẩu mặc định sau khi tạo sẽ là <strong>123456</strong>. Người dùng có thể tự đổi sau.</span>
                        </div>
                    </form>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
                    >
                        Hủy bỏ
                    </button>
                    <button
                        form="addUserForm"
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        {isLoading ? 'Đang tạo...' : 'Tạo Tài Khoản'}
                    </button>
                </div>
            </div>
        </div>
    );
};
