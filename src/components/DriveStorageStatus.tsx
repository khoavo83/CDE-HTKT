import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Cloud, HardDrive, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const DriveStorageStatus = () => {
    const [driveSettings, setDriveSettings] = useState<any>(null);
    const [isSettingUp, setIsSettingUp] = useState(false);

    useEffect(() => {
        const fetchSettings = async () => {
            const snap = await getDoc(doc(db, "settings", "driveFolders"));
            if (snap.exists()) {
                setDriveSettings(snap.data());
            }

            const docSnap = await getDocs(query(collection(db, "vanban")));

            let totalBytes = 0;
            docSnap.forEach(doc => {
                totalBytes += doc.data().fileSize || 0;
            });

            if (snap.exists()) {
                const maxLimitBytes = 100 * 1024 * 1024 * 1024; // 100 GB
                const percent = (totalBytes / maxLimitBytes) * 100;
                setDriveSettings({
                    ...snap.data(),
                    usedStorageBytes: totalBytes,
                    usedStoragePercent: percent > 100 ? 100 : percent
                });
            }
        };
        fetchSettings();
    }, []);

    const handleSetupDrive = async () => {
        if (confirm("Tài khoản Service Account (bot) sẽ tự động tạo thư mục trên Google Drive của nó. Bạn có chắc chắn muốn khởi tạo?")) {
            setIsSettingUp(true);
            try {
                const functions = getFunctions();
                const setupFn = httpsCallable(functions, 'setupSystemFolders');
                const result = await setupFn();
                const data = result.data as any;
                if (data.success) {
                    toast.success("Đã khởi tạo thư mục Drive thành công!");
                    setDriveSettings(data.data);
                }
            } catch (error) {
                console.error(error);
                toast.error("Lỗi khi tạo thư mục: " + (error as Error).message);
            } finally {
                setIsSettingUp(false);
            }
        }
    };

    if (!driveSettings) {
        return (
            <div className="px-4 py-3 mx-2 mb-2 bg-amber-50 rounded-lg border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-900">Chưa cấu hình Drive</span>
                </div>
                <button
                    onClick={handleSetupDrive}
                    disabled={isSettingUp}
                    className="w-full bg-white border border-amber-300 text-amber-700 px-2 py-1.5 rounded text-[11px] font-medium hover:bg-amber-100 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                    <HardDrive className="w-3 h-3" />
                    {isSettingUp ? 'Đang tạo...' : 'Khởi tạo ngay'}
                </button>
            </div>
        );
    }

    const usedGB = driveSettings.usedStorageBytes ? (driveSettings.usedStorageBytes / (1024 * 1024 * 1024)).toFixed(4) : '0';
    const percent = driveSettings.usedStoragePercent || 0;

    return (
        <div className="px-5 py-4 pb-2 flex flex-col gap-1.5 relative group cursor-default border-t border-gray-200 mt-2">
            <div className="flex items-center gap-2 text-gray-700 hover:text-primary-600 transition-colors cursor-pointer mb-1">
                <Cloud className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium">Dung lượng bộ nhớ</span>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1 overflow-hidden">
                <div
                    className="bg-primary-500 h-1.5 rounded-full transition-all duration-1000"
                    style={{ width: `${percent}%` }}
                ></div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-medium mt-0.5">
                <p className="text-gray-500">
                    {usedGB} GB / 100 GB
                </p>
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-green-50 border-green-100 text-green-600`}>
                    <Cloud className="w-2.5 h-2.5" />
                    <span className="uppercase tracking-tighter font-bold text-[9px]">Master</span>
                </div>
            </div>

            {/* Nút re-share ẩn hiện khi hover để tiết kiệm diện tích */}
            <div className="absolute top-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                    onClick={handleSetupDrive}
                    disabled={isSettingUp}
                    title="Cấp quyền lại (Re-Share)"
                    className="text-gray-400 hover:text-primary-600 transition-colors bg-gray-50 rounded-md p-1 border border-gray-200"
                >
                    <HardDrive className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};
