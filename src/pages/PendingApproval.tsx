import { useEffect } from 'react';
import { LogOut, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { auth } from '../firebase/config';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/useThemeStore';
import { GlobalFooter } from '../components/GlobalFooter';

export const PendingApproval = () => {
    const { user, setUser } = useAuthStore();
    const navigate = useNavigate();
    const { initTheme } = useThemeStore();

    useEffect(() => {
        initTheme();
    }, [initTheme]);

    const handleLogout = async () => {
        await auth.signOut();
        setUser(null);
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center border border-gray-200 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-2 bg-amber-500"></div>

                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <ShieldAlert className="w-10 h-10 text-amber-600" />
                </div>

                <h1 className="text-2xl font-bold mb-2">Chờ Phê Duyệt</h1>
                <p className="mb-6 text-sm">
                    Tài khoản <strong>{user?.email}</strong> của bạn đã được ghi nhận vào hệ thống CDE Ban HTKT. Admin đang xem xét quyền truy cập của bạn! Trường hợp khẩn cấp vui lòng liên hệ Khoa 0902.040.020
                </p>

                <button
                    onClick={handleLogout}
                    className="w-full flex justify-center items-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 font-semibold py-3 px-4 rounded-xl transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    Đăng xuất
                </button>
            </div>
            <div className="w-full max-w-md mt-8">
                <GlobalFooter />
            </div>
        </div>
    );
};
