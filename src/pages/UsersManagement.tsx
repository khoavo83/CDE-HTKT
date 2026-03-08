import { useEffect, useState, useRef } from 'react';
import { isoToVN } from '../utils/formatVN';
import { collection, query, doc, updateDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { canManageUser } from '../utils/authUtils';
import { useCategoryStore } from '../store/useCategoryStore';
import { Users, ShieldAlert, Loader2, CheckCircle, Edit2, Save, X, Upload, Trash2, UserPlus, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { GenericConfirmModal } from '../components/GenericConfirmModal';
import { AddUserModal } from '../components/AddUserModal';
import { httpsCallable } from 'firebase/functions';
import { appFunctions } from '../firebase/config';

export const UsersManagement = () => {
    const { user } = useAuthStore();
    const { categories, fetchCategories } = useCategoryStore();
    const [usersList, setUsersList] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [editFormData, setEditFormData] = useState<any>({});
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [userToDelete, setUserToDelete] = useState<any>(null);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!['admin', 'manager'].includes(user?.role || '')) {
            setLoading(false);
            return;
        }

        // Tải danh mục tĩnh
        const unsubCat = fetchCategories();

        // Lắng nghe thay đổi User thời gian thực
        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list: any[] = [];
            snapshot.forEach((doc) => {
                list.push({ ...doc.data(), id: doc.id });
            });
            setUsersList(list);
            setLoading(false);
        }, (error) => {
            console.error("Lỗi lấy danh sách user:", error);
            setLoading(false);
        });

        return () => {
            unsubscribe();
            if (typeof unsubCat === 'function') unsubCat();
        };
    }, [user, fetchCategories]);

    const handleEditClick = (userToEdit: any) => {
        setEditingUserId(userToEdit.id);
        setEditFormData({
            displayName: userToEdit.displayName || '',
            hoTen: userToEdit.hoTen || '',
            chucVu: userToEdit.chucVu || '',
            department: userToEdit.department || '',
            ngaySinh: userToEdit.ngaySinh || '',
            email: userToEdit.email || '',
            role: userToEdit.role || 'pending'
        });
    };

    const handleCancelEdit = () => {
        setEditingUserId(null);
        setEditFormData({});
    };

    const handleFormChange = (field: string, value: string) => {
        setEditFormData((prev: any) => ({ ...prev, [field]: value }));
    };

    const handleSaveClick = async (userId: string) => {
        try {
            await updateDoc(doc(db, 'users', userId), {
                ...editFormData
            });
            setEditingUserId(null); // Tắt chế độ sửa
            toast.success('Đã lưu thông tin người dùng');
        } catch (error) {
            toast.error('Lỗi khi lưu thông tin: ' + (error as Error).message);
        }
    };

    const handleDeleteClick = (userToDel: any) => {
        setUserToDelete(userToDel);
        setIsDeleteModalOpen(true);
    };

    const handleConfirmDelete = async () => {
        if (!userToDelete) return;
        if (!canManageUser(user, userToDelete.role)) {
            toast.error('Bạn không có quyền xóa người dùng này!');
            return;
        }
        try {
            await deleteDoc(doc(db, 'users', userToDelete.id));
            toast.success('Xóa người dùng thành công!');
        } catch (error) {
            toast.error('Lỗi khi xóa người dùng: ' + (error as Error).message);
        } finally {
            setIsDeleteModalOpen(false);
            setUserToDelete(null);
        }
    };

    const handleSyncPasswords = async () => {
        if (!confirm('Bạn có chắc chắn muốn CHẠY ĐỒNG BỘ MẬT KHẨU?\n\nToàn bộ người dùng chưa liên kết hoặc tài khoản cũ sẽ được ép mật khẩu mặc định là 123456. Chỉ Admin mới thực hiện điều này.')) return;

        setIsSyncing(true);
        const loadingToast = toast.loading('Đang chạy đồng bộ mật khẩu, vui lòng chờ...');
        try {
            const adminSyncAllUsersPassword = httpsCallable(appFunctions, 'adminSyncAllUsersPassword');
            const result = await adminSyncAllUsersPassword();
            const data = result.data as any;
            toast.success(data.message || 'Đồng bộ hoàn tất', { id: loadingToast });
        } catch (error: any) {
            console.error('Lỗi đồng bộ:', error);
            toast.error(error.message || 'Lệnh đồng bộ thất bại', { id: loadingToast });
        } finally {
            setIsSyncing(false);
        }
    };

    const parseExcelDate = (excelDate: any) => {
        if (!excelDate) return '';
        if (typeof excelDate === 'number') {
            const date = new Date((excelDate - (25567 + 1)) * 86400 * 1000); // 25567 là epoch Unix, +1 lỗi leap year Excel
            return date.toISOString().split('T')[0];
        }
        if (typeof excelDate === 'string') {
            // VD: "01/10/1976" -> "1976-10-01"
            const parts = excelDate.split('/');
            if (parts.length === 3) {
                return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
            return excelDate;
        }
        return '';
    };

    const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        const reader = new FileReader();

        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    toast.error("File Excel trống");
                    return;
                }

                let successCount = 0;

                for (const row of data as any[]) {
                    // Mapping thông tin theo các header có thể có
                    const hoTen = row['Họ và tên'] || row['Họ tên'] || row['Name'] || '';
                    if (!hoTen) continue; // Bỏ qua nếu không có tên

                    const chucVu = row['Chức vụ'] || row['Chức danh'] || '';
                    const phone = row['Số điện thoại'] || row['Điện thoại'] || row['SĐT'] || '';
                    const ngaySinh = parseExcelDate(row['Ngày sinh'] || row['DOB']);
                    const email = row['Email'] || '';
                    const noiDung = row['Phòng ban'] || row['Phòng Ban'] || row['Department'] || '';
                    const ghiChu = row['Ghi chú'] || '';

                    let displayName = hoTen;
                    const parts = hoTen.split(' ');
                    if (parts.length > 0) {
                        displayName = parts[parts.length - 1]; // Lấy Tên
                    }

                    // Khởi tạo một Document Ref mới (Tạo ID ngẫu nhiên)
                    const newUserRef = doc(collection(db, 'users'));

                    const userData = {
                        displayName: displayName,
                        hoTen: hoTen,
                        chucVu: chucVu,
                        department: noiDung,
                        ngaySinh: ngaySinh,
                        phone: phone,
                        email: email,
                        note: ghiChu,
                        role: 'unclaimed',
                        createdAt: new Date().toISOString(),
                    };

                    await setDoc(newUserRef, userData);
                    successCount++;
                }

                toast.success(`Đã thêm ${successCount} cán bộ thành công!`);
            } catch (error) {
                console.error("Lỗi parse file Excel:", error);
                toast.error("Đã xảy ra lỗi khi đọc file Excel.");
            } finally {
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = ''; // Reset
            }
        };

        reader.onerror = () => {
            toast.error("Lỗi đọc file");
            setIsImporting(false);
        };

        reader.readAsBinaryString(file);
    };

    if (!['admin', 'manager'].includes(user?.role || '')) {
        return (
            <div className="p-8 text-center text-red-600 font-bold">
                <ShieldAlert className="w-16 h-16 mx-auto mb-4" />
                Bạn không có quyền truy cập trang Quản lý Người dùng.
            </div>
        );
    }

    return (
        <div className="p-6 w-full max-w-[98%] mx-auto">
            <div className="flex items-center justify-between gap-3 mb-8 border-b pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-100 rounded-xl flex items-center justify-center">
                        <Users className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Quản lý Người dùng</h1>
                        <p className="text-sm text-gray-500">Phê duyệt và Phân quyền truy cập hệ thống CDE</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {user?.role === 'admin' && (
                        <>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleImportExcel}
                                accept=".xlsx, .xls"
                                className="hidden"
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                disabled={isImporting}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                {isImporting ? 'Đang tải...' : 'Import Danh sách'}
                            </button>

                            <div className="h-6 w-px bg-gray-200 mx-1"></div>

                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                            >
                                <UserPlus className="w-4 h-4" />
                                Thêm người dùng
                            </button>

                            <button
                                onClick={handleSyncPasswords}
                                disabled={isSyncing}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                                {isSyncing ? 'Đang xử lý...' : 'Đồng bộ Mật khẩu'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center p-12">
                    <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto w-full inline-block min-w-full">
                    <table className="w-full text-left text-sm text-gray-600">
                        <thead className="bg-gray-50 text-gray-700 font-medium border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 w-16 text-center">STT</th>
                                <th className="px-4 py-3">Tài khoản (Email)</th>
                                <th className="px-4 py-3 min-w-[140px]">Họ và Tên</th>
                                <th className="px-4 py-3">Tên gọi</th>
                                <th className="px-4 py-3 min-w-[160px]">Chức vụ</th>
                                <th className="px-4 py-3 min-w-[200px]">Phòng ban</th>
                                <th className="px-4 py-3">Ngày sinh</th>
                                <th className="px-4 py-3 w-32">Trạng thái</th>
                                <th className="px-4 py-3 w-40">Phân Quyền</th>
                                <th className="px-4 py-3 w-24 text-center">Thao tác</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {(() => {
                                const renderUserRow = (u: any, index: number) => {
                                    const isEditing = editingUserId === u.id;
                                    return (
                                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                                            <td className="px-4 py-3 text-center text-sm font-semibold text-gray-500">
                                                {index}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <input type="email" value={editFormData.email} onChange={(e) => handleFormChange('email', e.target.value)} className="bg-white border border-indigo-300 text-xs rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500" placeholder="example@gmail.com" />
                                                ) : (
                                                    <div className="text-xs text-gray-500 font-medium">{u.email || <span className="text-gray-300 italic">Trống</span>}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <input type="text" value={editFormData.hoTen} onChange={(e) => handleFormChange('hoTen', e.target.value)} className="bg-white border border-indigo-300 text-sm rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Nguyễn Văn A" />
                                                ) : (
                                                    <div className="font-semibold text-gray-900">{u.hoTen || <span className="text-gray-400 italic">Chưa có</span>}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <input type="text" value={editFormData.displayName} onChange={(e) => handleFormChange('displayName', e.target.value)} className="bg-white border border-indigo-300 text-sm rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500" />
                                                ) : (
                                                    <div className="text-gray-700">{u.displayName}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <select
                                                        value={editFormData.chucVu}
                                                        onChange={(e) => handleFormChange('chucVu', e.target.value)}
                                                        className="bg-white border text-gray-800 border-indigo-300 text-sm rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500"
                                                    >
                                                        <option value="">-- Chọn Chức vụ --</option>
                                                        {categories.filter(c => c.type === 'chucVu' && c.isActive).map(c => (
                                                            <option key={c.id} value={c.value}>{c.value}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div className="text-gray-700">{u.chucVu || '-'}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <select
                                                        value={editFormData.department}
                                                        onChange={(e) => handleFormChange('department', e.target.value)}
                                                        className="bg-white border text-gray-800 border-indigo-300 text-sm rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500"
                                                    >
                                                        <option value="">-- Chọn Phòng ban --</option>
                                                        {categories.filter(c => c.type === 'phongBan' && c.isActive).map(c => (
                                                            <option key={c.id} value={c.value}>{c.value}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div className="text-gray-700">{u.department || '-'}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <input type="date" value={editFormData.ngaySinh} onChange={(e) => handleFormChange('ngaySinh', e.target.value)} className="bg-white border border-indigo-300 text-sm rounded-md p-1.5 w-full outline-none focus:ring-1 focus:ring-indigo-500" />
                                                ) : (
                                                    <div className="text-gray-700">{isoToVN(u.ngaySinh)}</div>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {u.role === 'pending' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                                                        <ShieldAlert className="w-3 h-3" /> Chờ duyệt
                                                    </span>
                                                ) : u.role === 'unclaimed' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                                                        <Users className="w-3 h-3" /> Chờ liên kết
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                                                        <CheckCircle className="w-3 h-3" /> Hoạt động
                                                    </span>
                                                )}
                                            </td>

                                            <td className="px-4 py-3">
                                                {isEditing ? (
                                                    <select
                                                        value={editFormData.role}
                                                        onChange={(e) => handleFormChange('role', e.target.value)}
                                                        className="bg-white border border-indigo-300 text-gray-900 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block w-full p-1.5 outline-none"
                                                    >
                                                        <option value="pending">Chờ (Khóa)</option>
                                                        <option value="unclaimed">Chờ liên kết Google</option>
                                                        <option value="viewer">Viewer</option>
                                                        <option value="editor">Editor</option>
                                                        <option value="manager">Manager</option>
                                                        <option value="admin">Admin</option>
                                                    </select>
                                                ) : (
                                                    (() => {
                                                        const roleConfig: Record<string, { label: string; cls: string; icon: string }> = {
                                                            admin: { label: 'Admin', cls: 'bg-rose-100 text-rose-700', icon: '👑' },
                                                            manager: { label: 'Manager', cls: 'bg-amber-100 text-amber-700', icon: '🛡️' },
                                                            editor: { label: 'Editor', cls: 'bg-blue-100 text-blue-700', icon: '✏️' },
                                                            viewer: { label: 'Viewer', cls: 'bg-gray-100 text-gray-600', icon: '👁' },
                                                            pending: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700', icon: '⏳' },
                                                            unclaimed: { label: 'Chờ liên kết Google', cls: 'bg-gray-100 text-gray-600', icon: '🔗' },
                                                        };
                                                        const r = roleConfig[u.role] || { label: u.role, cls: 'bg-gray-100 text-gray-600', icon: '?' };
                                                        return (
                                                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${r.cls}`}>
                                                                <span>{r.icon}</span> {r.label}
                                                            </span>
                                                        );
                                                    })()
                                                )}
                                            </td>

                                            <td className="px-4 py-3 text-center">
                                                {isEditing ? (
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => handleSaveClick(u.id)} className="p-1.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 transition-colors" title="Lưu">
                                                            <Save className="w-4 h-4" />
                                                        </button>
                                                        <button onClick={handleCancelEdit} className="p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors" title="Hủy">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-center gap-2">
                                                        {canManageUser(user, u.role) && (
                                                            <button onClick={() => handleEditClick(u)} className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-indigo-100 hover:text-indigo-600 transition-colors" title="Sửa thông tin">
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {canManageUser(user, u.role) && u.id !== user?.uid && u.email !== user?.email && (
                                                            <button onClick={() => handleDeleteClick(u)} className="p-1.5 bg-gray-100 text-gray-600 rounded hover:bg-rose-100 hover:text-rose-600 transition-colors" title="Xóa người dùng">
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                };

                                const getSortName = (u: any) => {
                                    const name = u.displayName || u.hoTen || '';
                                    if (!name) return '';
                                    const parts = name.trim().split(' ');
                                    const lastName = parts[parts.length - 1].toLowerCase();
                                    const middleName = parts.slice(0, -1).join(' ').toLowerCase();
                                    return `${lastName} ${middleName}`;
                                };

                                const sortedUsers = [...usersList].sort((a, b) => getSortName(a).localeCompare(getSortName(b), 'vi'));

                                const banGiamDoc = sortedUsers.filter(u => u.chucVu?.toLowerCase().includes('giám đốc') || u.chucVu?.toLowerCase().includes('trưởng ban'));
                                const chuyenVien = sortedUsers.filter(u => u.chucVu?.toLowerCase().includes('chuyên viên'));
                                const khac = sortedUsers.filter(u => !banGiamDoc.includes(u) && !chuyenVien.includes(u));

                                let currentStt = 1;

                                return (
                                    <>
                                        {banGiamDoc.length > 0 && (
                                            <>
                                                <tr className="bg-indigo-50/50">
                                                    <td colSpan={10} className="px-4 py-2.5 text-sm font-bold text-indigo-800 border-y border-indigo-100 uppercase tracking-wider">
                                                        Ban Giám đốc
                                                    </td>
                                                </tr>
                                                {banGiamDoc.map((u) => renderUserRow(u, currentStt++))}
                                            </>
                                        )}
                                        {chuyenVien.length > 0 && (
                                            <>
                                                <tr className="bg-emerald-50/50">
                                                    <td colSpan={10} className="px-4 py-2.5 text-sm font-bold text-emerald-800 border-y border-emerald-100 uppercase tracking-wider">
                                                        Chuyên viên
                                                    </td>
                                                </tr>
                                                {chuyenVien.map((u) => renderUserRow(u, currentStt++))}
                                            </>
                                        )}
                                        {khac.length > 0 && (
                                            <>
                                                <tr className="bg-gray-50">
                                                    <td colSpan={10} className="px-4 py-2.5 text-sm font-bold text-gray-800 border-y border-gray-200 uppercase tracking-wider">
                                                        Phân loại khác
                                                    </td>
                                                </tr>
                                                {khac.map((u) => renderUserRow(u, currentStt++))}
                                            </>
                                        )}
                                    </>
                                );
                            })()}
                        </tbody>
                    </table>

                    {usersList.length === 0 && (
                        <div className="p-8 text-center text-gray-500 italic">
                            Chưa có dữ liệu người dùng nào trong hệ thống.
                        </div>
                    )}
                </div>
            )}

            <GenericConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setUserToDelete(null);
                }}
                onConfirm={handleConfirmDelete}
                title="Xác nhận xóa người dùng"
                message={`Bạn có chắc chắn muốn xóa người dùng "${userToDelete?.displayName || userToDelete?.hoTen || userToDelete?.email}"?\n\nHành động này không thể hoàn tác.`}
                type="danger"
                confirmText="Xóa người dùng"
            />

            <AddUserModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
                categories={categories}
            />
        </div>
    );
};
