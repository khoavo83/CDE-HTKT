import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from './firebase/config';
import { useAuthStore } from './store/useAuthStore';
import { useAppSettingsStore } from './store/useAppSettingsStore';
import { Toaster } from 'react-hot-toast';

// Pages
import { MainLayout } from './layout/MainLayout';
import { Login } from './pages/Login';
import { Documents } from './pages/Documents';
import { DocumentReview } from './pages/DocumentReview';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { Mindmap } from './pages/Mindmap';
import { BimViewer } from './pages/BimViewer';
import { MapViewer } from './pages/MapViewer';
import { PendingApproval } from './pages/PendingApproval';
import { UsersManagement } from './pages/UsersManagement';
import { CategoriesManagement } from './pages/CategoriesManagement';
import { InternalDocRegister } from './pages/InternalDocRegister';
import { MeetingCalendar } from './pages/MeetingCalendar';
import { FeedbackManagement } from './pages/FeedbackManagement';
import { TrashManagement } from './pages/TrashManagement';

function App() {
    const { setUser, setLoading, isLoading } = useAuthStore();
    const { fetchSettings } = useAppSettingsStore();

    useEffect(() => {
        // Load app configuration first
        fetchSettings();

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Fetch user role from Firestore
                const userRef = doc(db, 'users', firebaseUser.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    setUser(userSnap.data() as any);
                } else {
                    const newData = {
                        uid: firebaseUser.uid,
                        email: firebaseUser.email || '',
                        displayName: firebaseUser.displayName || 'User',
                        role: 'pending' // Hợp lệ hóa: Phải chờ duyệt
                    };
                    await setDoc(userRef, newData);
                    setUser(newData as any);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUser, setLoading]);

    if (isLoading) {
        return <div className="flex h-screen items-center justify-center bg-gray-50">Đang tải cấu hình hệ thống...</div>;
    }

    return (
        <BrowserRouter>
            <Toaster position="top-right" />
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/pending-approval" element={<PendingApproval />} />

                <Route element={<MainLayout />}>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/projects" element={<Projects />} />
                    <Route path="/mindmap" element={<Mindmap />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/documents/:id" element={<DocumentReview />} />
                    <Route path="/bim" element={<BimViewer />} />
                    <Route path="/map" element={<MapViewer />} />
                    <Route path="/internal-docs" element={<InternalDocRegister />} />
                    <Route path="/meetings" element={<MeetingCalendar />} />
                    <Route path="/users" element={<UsersManagement />} />
                    <Route path="/categories" element={<CategoriesManagement />} />
                    <Route path="/feedbacks" element={<FeedbackManagement />} />
                    <Route path="/trash" element={<TrashManagement />} />
                </Route>
            </Routes>
        </BrowserRouter>
    );
}

export default App;
