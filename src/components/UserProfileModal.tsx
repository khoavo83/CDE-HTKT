import React, { useState, useRef } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { X, Camera, Save, Loader2 } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';

interface UserProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ isOpen, onClose }) => {
    const { user, setUser } = useAuthStore();
    const [isLoading, setIsLoading] = useState(false);
    const [isHoveringAvatar, setIsHoveringAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form state
    const [formData, setFormData] = useState({
        displayName: user?.displayName || '',
        hoTen: user?.hoTen || '',
        ngaySinh: user?.ngaySinh || '',
        department: user?.department || '',
        chucVu: user?.chucVu || '',
        photoURL: user?.photoURL || ''
    });

    if (!isOpen || !user) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleAvatarClick = () => {
        if (!isLoading) {
            fileInputRef.current?.click();
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Chỉ cho phép ảnh
        if (!file.type.startsWith('image/')) {
            alert('Vui lòng chọn file hình ảnh hợp lệ (jpg, png, webp...)');
            return;
        }

        // Validate size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            alert('File ảnh quá lớn, vui lòng chọn file <= 5MB.');
            return;
        }

        setIsLoading(true);
        try {
            // Timestamp để tránh trùng cache ảnh
            const fileExt = file.name.split('.').pop();
            const fileName = `avatar_${user.uid}_${Date.now()}.${fileExt}`;
            const avatarRef = ref(storage, `avatars/${user.uid}/${fileName}`);

            await uploadBytes(avatarRef, file);
            const downloadURL = await getDownloadURL(avatarRef);

            // Cập nhật lại form preview lập tức
            setFormData(prev => ({ ...prev, photoURL: downloadURL }));

            // Nếu muốn ảnh tự lưu luôn sau khi chọn, ta có thể cập nhật db luôn
            await updateDoc(doc(db, 'users', user.uid), { photoURL: downloadURL });
            setUser({ ...user, photoURL: downloadURL });

            alert("Đã cập nhật ảnh đại diện thành công!");

        } catch (error) {
            console.error("Lỗi khi upload ảnh:", error);
            alert("Đã xảy ra lỗi khi cập nhật ảnh. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
            // Reset input file
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!confirm("Bạn có chắc chắn muốn lưu thông tin này?")) {
            return;
        }

        setIsLoading(true);
        try {
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, {
                displayName: formData.displayName,
                hoTen: formData.hoTen,
                ngaySinh: formData.ngaySinh,
                // Cho phép sửa nhưng thực tế trong production có thể bộ phận nhân sự quản lý department/chucVu.
                // Tuỳ requirements, ở đây mở cho người dùng tự sửa.
                department: formData.department,
                chucVu: formData.chucVu,
            });

            // Update local Zustand state
            setUser({
                ...user,
                displayName: formData.displayName,
                hoTen: formData.hoTen,
                ngaySinh: formData.ngaySinh,
                department: formData.department,
                chucVu: formData.chucVu
            });

            alert("Đã lưu thông tin cá nhân!");
            onClose();

        } catch (error) {
            console.error("Lỗi cập nhật profile:", error);
            alert("Lỗi khi lưu thông tin. Kiểm tra lại kết nối mạng.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-900">Thông tin Cá nhân</h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Body */}
                <div className="p-6 overflow-y-auto custom-scrollbar">

                    {/* Avatar Selection */}
                    <div className="flex flex-col items-center justify-center mb-8">
                        <div
                            className="relative w-24 h-24 rounded-full bg-primary-100 border-4 border-white shadow-sm flex items-center justify-center cursor-pointer group"
                            onMouseEnter={() => setIsHoveringAvatar(true)}
                            onMouseLeave={() => setIsHoveringAvatar(false)}
                            onClick={handleAvatarClick}
                        >
                            {formData.photoURL ? (
                                <img
                                    src={formData.photoURL}
                                    alt="Avatar"
                                    className="w-full h-full object-cover rounded-full"
                                />
                            ) : (
                                <span className="text-3xl font-bold text-primary-600">
                                    {formData.displayName.charAt(0).toUpperCase()}
                                </span>
                            )}

                            {/* Hover Overlay */}
                            <div className={`absolute inset-0 rounded-full bg-black/50 flex flex-col items-center justify-center transition-opacity duration-200 ${isHoveringAvatar ? 'opacity-100' : 'opacity-0'}`}>
                                {isLoading ? (
                                    <Loader2 className="w-6 h-6 text-white animate-spin" />
                                ) : (
                                    <>
                                        <Camera className="w-6 h-6 text-white mb-1" />
                                        <span className="text-[10px] text-white font-medium uppercase tracking-wider">Chọn ảnh</span>
                                    </>
                                )}
                            </div>

                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/png, image/jpeg, image/webp"
                                className="hidden"
                            />
                        </div>
                        <p className="mt-3 text-sm font-medium text-gray-900">{user.email}</p>
                        <span className="mt-1 px-2.5 py-0.5 bg-gray-100 border border-gray-200 rounded-full text-xs font-medium text-gray-600 capitalize">
                            Vai trò: {user.role}
                        </span>
                    </div>

                    <form id="profile-form" onSubmit={handleSubmit} className="space-y-4">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Tên hiển thị <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    name="displayName"
                                    required
                                    value={formData.displayName}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                                    placeholder="Ví dụ: Admin, Tuấn Lê..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Họ và tên
                                </label>
                                <input
                                    type="text"
                                    name="hoTen"
                                    value={formData.hoTen}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                                    placeholder="Điền đầy đủ họ và tên"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Ngày sinh
                            </label>
                            <input
                                type="date"
                                name="ngaySinh"
                                value={formData.ngaySinh}
                                onChange={handleChange}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Bộ phận / Phòng ban
                                </label>
                                <input
                                    type="text"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                                    placeholder="Ban Hạ Tầng Kỹ Thuật"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Chức vụ
                                </label>
                                <input
                                    type="text"
                                    name="chucVu"
                                    value={formData.chucVu}
                                    onChange={handleChange}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all text-sm"
                                    placeholder="Trưởng phòng, Chuyên viên..."
                                />
                            </div>
                        </div>

                    </form>
                </div>

                {/* Footer Buttons */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        Hủy
                    </button>
                    <button
                        type="submit"
                        form="profile-form"
                        disabled={isLoading}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Lưu thông tin
                    </button>
                </div>

            </div>
        </div>
    );
};
