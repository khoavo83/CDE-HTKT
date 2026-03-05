import React, { useState, useEffect } from 'react';
import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    updateProfile,
    GoogleAuthProvider
} from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '../store/useThemeStore';
import logoUrl from '../assets/hcmc-metro-logo.jpg';
import loginBgUrl from '../assets/login-bg.png';
import {
    Mail,
    Lock,
    Loader2,
    ArrowLeft,
    User as UserIcon
} from 'lucide-react';
import { GlobalFooter } from '../components/GlobalFooter';
import { toast } from 'react-hot-toast';


type AuthView = 'login' | 'register' | 'forgot' | 'claim_profile';

export const Login = () => {
    const navigate = useNavigate();
    const { setUser } = useAuthStore();
    const { initTheme } = useThemeStore();

    // [MỚI] Hàm tự động kiểm tra và liên kết theo Email
    const checkAndAutoLink = async (userAuth: any) => {
        if (!userAuth.email) return null;

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', userAuth.email));
        const snapshot = await getDocs(q);

        // Tìm bản ghi có Email trùng khớp nhưng CHƯA có UID (nghĩa là chưa được claim)
        const unclaimedDoc = snapshot.docs.find(d => !d.data().uid);

        if (unclaimedDoc) {
            const unclaimedData = unclaimedDoc.data();
            const docId = unclaimedDoc.id;

            // Loại bỏ các ID thừa nếu có
            const { id: oldId, uid: oldUid, ...cleanData } = unclaimedData;

            const newUserData = {
                ...cleanData,
                uid: userAuth.uid,
                email: userAuth.email,
                // Giữ nguyên role mà Admin đã gán (unclaimed, editor, manager, v.v.)
                // Nếu role đang là 'unclaimed' thì nâng lên 'editor' mặc định
                role: cleanData.role === 'unclaimed' ? 'editor' : cleanData.role,
                updatedAt: new Date().toISOString(),
                lastLoginAt: new Date().toISOString()
            };

            // Tạo bản ghi mới theo UID của Auth
            await setDoc(doc(db, 'users', userAuth.uid), newUserData);

            // Xóa bản ghi cũ (vì bản ghi mới đã được tạo với ID là UID)
            if (docId !== userAuth.uid) {
                await deleteDoc(doc(db, 'users', docId));
            }

            return newUserData;
        }
        return null;
    };

    const [view, setView] = useState<AuthView>('login');
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Form states
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [rememberMe, setRememberMe] = useState(true);

    // Claim Profile states
    const [unclaimedUsers, setUnclaimedUsers] = useState<any[]>([]);
    const [selectedUnclaimedUid, setSelectedUnclaimedUid] = useState<string>('');
    const [tempGoogleUser, setTempGoogleUser] = useState<any>(null);

    useEffect(() => {
        initTheme();
    }, [initTheme]);

    // Chuyển tab reset lỗi
    useEffect(() => {
        setErrorMsg("");
    }, [view]);

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        setErrorMsg("");
        try {
            // Bật lưu phiên làm việc lâu dài cho Google Login
            await setPersistence(auth, browserLocalPersistence);
            const result = await signInWithPopup(auth, googleProvider);
            const user = result.user;

            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            let userData;
            if (!userSnap.exists()) {
                // [MỚI] Tự động kiểm tra Email trong danh sách cán bộ
                const autoLinkedData = await checkAndAutoLink(user);

                if (autoLinkedData) {
                    setUser(autoLinkedData as any);
                    navigate('/');
                    return;
                }

                // [CŨ] Nếu không tự khớp được Email, kiểm tra xem có ai unclaimed (không có email) để show list claim không
                const unclaimedQuery = query(collection(db, 'users'), where('role', '==', 'unclaimed'));
                const unclaimedSnapshot = await getDocs(unclaimedQuery);
                const list = unclaimedSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

                // Chỉ hiện màn hình Claim nếu có danh sách những người CHƯA CÓ EMAIL trùng khớp
                if (list.length > 0) {
                    setUnclaimedUsers(list);
                    setTempGoogleUser(user);
                    setView('claim_profile');
                    setIsLoading(false);
                    return;
                }

                // Nếu không có ai unclaimed, tạo bình thường với role pending
                userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName,
                    role: 'pending',
                    department: 'Chưa có'
                };
                await setDoc(userRef, userData);
            } else {
                userData = userSnap.data();
            }

            setUser(userData as any);

            if (userData.role !== 'pending') {
                navigate('/');
            } else {
                navigate('/pending-approval');
            }
        } catch (error: any) {
            console.error('Error Google login:', error);
            setErrorMsg(error.message || 'Đăng nhập Google thất bại');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        try {
            await setPersistence(auth, rememberMe ? browserLocalPersistence : browserSessionPersistence);
            const result = await signInWithEmailAndPassword(auth, email, password);
            const user = result.user;

            const userRef = doc(db, 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                // Đề phòng lỗi thiếu dữ liệu, khởi tạo role pending
                const userData = {
                    uid: user.uid,
                    email: user.email,
                    displayName: user.displayName || email.split('@')[0],
                    role: 'pending',
                    department: 'Chưa có'
                };
                await setDoc(userRef, userData);
                setUser(userData as any);
                navigate('/pending-approval');
            } else {
                const userData = userSnap.data();
                setUser(userData as any);
                if (userData.role !== 'pending') {
                    navigate('/');
                } else {
                    navigate('/pending-approval');
                }
            }
        } catch (error: any) {
            console.error('Login error:', error);
            setErrorMsg("Email hoặc mật khẩu không chính xác.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        if (password !== confirmPassword) {
            setErrorMsg("Mật khẩu nhập lại không khớp.");
            setIsLoading(false);
            return;
        }

        try {
            const result = await createUserWithEmailAndPassword(auth, email, password);
            const user = result.user;

            // Update Auth Profile
            await updateProfile(user, { displayName });

            // [MỚI] Tự động kiểm tra Email trong danh sách cán bộ
            const autoLinkedData = await checkAndAutoLink(user);

            if (autoLinkedData) {
                setUser(autoLinkedData as any);
                navigate('/');
                setIsLoading(false);
                return;
            }

            // [CŨ] Kiểm tra xem có user nào chưa được claim (unclaimed) không
            const unclaimedQuery = query(collection(db, 'users'), where('role', '==', 'unclaimed'));
            const unclaimedSnapshot = await getDocs(unclaimedQuery);
            const list = unclaimedSnapshot.docs.map(d => ({ ...d.data(), id: d.id }));

            if (list.length > 0) {
                setUnclaimedUsers(list);
                setTempGoogleUser(user); // Dùng chung state tạm để claim
                setView('claim_profile');
                setIsLoading(false);
                return;
            }

            // Create Firestore Document (Nếu không có ai để claim)
            const userData = {
                uid: user.uid,
                email: user.email,
                displayName: displayName,
                role: 'pending',
                department: 'Chưa có'
            };
            await setDoc(doc(db, 'users', user.uid), userData);

            setUser(userData as any);
            navigate('/pending-approval');

        } catch (error: any) {
            console.error('Register error:', error);
            if (error.code === 'auth/email-already-in-use') {
                setErrorMsg('Email này đã được sử dụng.');
            } else if (error.code === 'auth/weak-password') {
                setErrorMsg('Mật khẩu quá yếu (cần ít nhất 6 ký tự).');
            } else {
                setErrorMsg(error.message || 'Đăng ký thất bại.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrorMsg("");

        if (!email) {
            setErrorMsg("Vui lòng nhập email của bạn.");
            setIsLoading(false);
            return;
        }

        try {
            await sendPasswordResetEmail(auth, email);
            toast.success("Đường dẫn khôi phục mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư (và thư mục rác).");
            setView('login');
        } catch (error: any) {
            console.error('Reset password error:', error);
            setErrorMsg("Không thể gửi email khôi phục hoặc email chưa được đăng ký.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleClaimProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!tempGoogleUser || !selectedUnclaimedUid) {
            setErrorMsg("Vui lòng chọn thông tin của bạn từ danh sách.");
            return;
        }
        setIsLoading(true);
        setErrorMsg("");

        try {
            // Lấy thông tin tài khoản unclaimed
            const unclaimedData = unclaimedUsers.find(u => (u.uid === selectedUnclaimedUid || u.id === selectedUnclaimedUid));
            if (!unclaimedData) throw new Error("Không tìm thấy thông tin cán bộ.");

            // Dữ liệu mới gắn vào Auth UID
            const { id: oldId, uid: oldUid, ...cleanUnclaimedData } = unclaimedData;

            const newUserData = {
                ...cleanUnclaimedData,
                uid: tempGoogleUser.uid,
                email: tempGoogleUser.email,
                role: 'pending', // BUỘC PHẢI CHỜ DUYỆT - Không cho bypass
            };

            // Lưu doc mới với UID của Auth
            await setDoc(doc(db, 'users', tempGoogleUser.uid), newUserData);

            // Xóa doc unclaimed cũ
            const docIdToDelete = unclaimedData.id || unclaimedData.uid;
            if (docIdToDelete && docIdToDelete !== tempGoogleUser.uid) {
                await deleteDoc(doc(db, 'users', docIdToDelete));
            }

            setUser(newUserData as any);
            navigate('/pending-approval');
        } catch (error: any) {
            console.error('Lỗi claim profile:', error);
            setErrorMsg("Không thể xác nhận thông tin. Vui lòng thử lại.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center p-4 transition-colors duration-300 relative bg-gray-900"
            style={{
                backgroundImage: `url(${loginBgUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundAttachment: 'fixed',
            }}
        >
            {/* Overlay tạo hiệu ứng lung linh, hiện đại */}
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/60 via-blue-900/40 to-black/70 backdrop-blur-[2px] z-0"></div>

            <div className="relative w-full max-w-[400px] bg-white/85 backdrop-blur-xl rounded-3xl shadow-[0_8px_32px_0_rgba(31,38,135,0.37)] border border-white/40 p-8 z-10 animate-in fade-in zoom-in-95 duration-500">

                <div className="text-center mb-8 flex flex-col items-center">
                    <h1 className="text-[22px] font-black text-gray-900 mb-4 leading-tight uppercase drop-shadow-sm">Hệ thống <br /> dữ liệu dùng chung</h1>

                    <div className="bg-white/90 p-3 rounded-2xl shadow-md mb-4 backdrop-blur-sm border border-white/50">
                        <img src={logoUrl} alt="HCMC Metro Logo" className="h-[52px] w-auto object-contain" />
                    </div>

                    <div className="flex flex-col items-center gap-1">
                        <p className="text-sm font-black text-gray-800 uppercase tracking-widest">Ban Quản lý Đường sắt đô thị</p>
                        <p className="text-[11px] font-black text-primary-700 uppercase tracking-widest bg-primary-50/80 px-4 py-1.5 rounded-full mt-1.5 border border-primary-100/50 shadow-sm">Ban Hạ tầng Kỹ thuật</p>
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-6 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm text-center font-medium animate-in fade-in slide-in-from-top-2">
                        {errorMsg}
                    </div>
                )}

                {/* VIEW: LOGIN */}
                {view === 'login' && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <form onSubmit={handleEmailLogin} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="Tài khoản email"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm mt-2">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={rememberMe}
                                        onChange={(e) => setRememberMe(e.target.checked)}
                                        className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
                                    />
                                    <span className="text-gray-600 group-hover:text-gray-900 transition-colors">Nhớ mật khẩu</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setView('forgot')}
                                    className="font-medium text-primary-600 hover:text-primary-700 transition-colors"
                                >
                                    Quên mật khẩu?
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full mt-6 bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Đăng nhập"}
                            </button>
                        </form>

                        <div className="mt-6 flex items-center gap-3">
                            <div className="h-px flex-1 bg-gray-200"></div>
                            <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">Hoặc sử dụng</span>
                            <div className="h-px flex-1 bg-gray-200"></div>
                        </div>

                        <button
                            onClick={handleGoogleLogin}
                            disabled={isLoading}
                            className="w-full mt-6 bg-white border border-gray-200 text-gray-700 font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                <path fill="none" d="M1 1h22v22H1z" />
                            </svg>
                            Tài khoản Google
                        </button>

                        <p className="mt-8 text-center text-sm text-gray-500">
                            Chưa có tài khoản?{' '}
                            <button onClick={() => setView('register')} className="font-semibold text-primary-600 hover:text-primary-700">Đăng ký ngay</button>
                        </p>
                    </div>
                )}

                {/* VIEW: REGISTER */}
                {view === 'register' && (
                    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800">Tạo tài khoản mới</h2>
                        </div>
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Họ và Tên</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <UserIcon className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="text"
                                        required
                                        value={displayName}
                                        onChange={(e) => setDisplayName(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="Ví dụ: Nguyễn Văn A"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="name@company.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mật khẩu</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="Ít nhất 6 ký tự"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Xác nhận mật khẩu</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Lock className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="password"
                                        required
                                        minLength={6}
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="Nhập lại mật khẩu"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full mt-6 bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Đăng ký tải khoản"}
                            </button>
                        </form>

                        <button
                            onClick={() => setView('login')}
                            className="mt-6 w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> Quay lại Đăng nhập
                        </button>
                    </div>
                )}

                {/* VIEW: FORGOT PASSWORD */}
                {view === 'forgot' && (
                    <div className="animate-in fade-in slide-in-from-left-2 duration-300">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Khôi phục mật khẩu</h2>
                            <p className="text-sm text-gray-500">Nhập email đăng ký, chúng tôi sẽ gửi liên kết tạo mới mật khẩu cho bạn.</p>
                        </div>

                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Mail className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none"
                                        placeholder="address@website.com"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full mt-4 bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Gửi yêu cầu khôi phục"}
                            </button>
                        </form>

                        <button
                            onClick={() => setView('login')}
                            className="mt-6 w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> Quay lại Đăng nhập
                        </button>
                    </div>
                )}

                {/* VIEW: CLAIM PROFILE */}
                {view === 'claim_profile' && (
                    <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                        <div className="text-center mb-6">
                            <h2 className="text-xl font-bold text-gray-800 mb-2">Xác nhận thông tin</h2>
                            <p className="text-sm text-gray-500">
                                Xin chào <b>{tempGoogleUser?.displayName}</b>, hệ thống tìm thấy một số hồ sơ cán bộ chưa liên kết tài khoản. Vui lòng chọn đúng tên và chức vụ của bạn để tiếp tục.
                            </p>
                        </div>

                        <form onSubmit={handleClaimProfile} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">Chọn tên của bạn</label>
                                <div className="relative">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <UserIcon className="h-5 w-5 text-gray-400" />
                                    </div>
                                    <select
                                        required
                                        value={selectedUnclaimedUid}
                                        onChange={(e) => setSelectedUnclaimedUid(e.target.value)}
                                        className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all text-sm outline-none appearance-none cursor-pointer"
                                    >
                                        <option value="" disabled>-- Chọn đúng tên của bạn --</option>
                                        {unclaimedUsers.map(u => (
                                            <option key={u.id || u.uid} value={u.id || u.uid}>
                                                {u.hoTen || u.displayName} - {u.chucVu || u.role}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-400">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading || !selectedUnclaimedUid}
                                className="w-full mt-6 bg-primary-600 text-white font-semibold py-2.5 px-4 rounded-xl shadow-sm hover:bg-primary-700 focus:ring-4 focus:ring-primary-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                            >
                                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Xác nhận và Vào hệ thống"}
                            </button>
                        </form>

                        <button
                            onClick={() => {
                                setView('login');
                                setTempGoogleUser(null);
                                setUnclaimedUsers([]);
                            }}
                            className="mt-6 w-full flex items-center justify-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4" /> Bỏ qua và quay lại
                        </button>
                    </div>
                )}

            </div>
            <div className="w-full max-w-[420px] mt-8">
                <GlobalFooter />
            </div>
        </div>
    );
};
