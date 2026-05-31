const fs = require('fs');
let code = fs.readFileSync('src/pages/Projects.tsx', 'utf8');

// 1. Add state
const stateToAdd = `
    const [isSyncingNode, setIsSyncingNode] = useState(false);
    const [syncDebugLogs, setSyncDebugLogs] = useState<string[]>([]);
    const [showDebugModal, setShowDebugModal] = useState(false);
`;
code = code.replace(/const \[deleteModalOpen, setDeleteModalOpen\] = useState\(false\);\r?\n/, "const [deleteModalOpen, setDeleteModalOpen] = useState(false);\n" + stateToAdd);

// 2. Add handleSyncSingleNode function
const handleFunc = `
    const handleSyncSingleNode = async (nodeId: string) => {
        setIsSyncingNode(true);
        setSyncDebugLogs([]);
        try {
            const syncFn = httpsCallable(functions, 'syncSingleNodeDrive');
            const result = await syncFn({ nodeId }) as any;
            if (result.data.success) {
                toast.success(result.data.message || 'Đồng bộ thư mục thành công!');
                if (result.data.debug && result.data.debug.length > 0) {
                    setSyncDebugLogs(result.data.debug);
                    setShowDebugModal(true);
                }
            } else {
                toast.error('Có lỗi xảy ra: ' + result.data.message);
            }
        } catch (error: any) {
            console.error('Lỗi đồng bộ thư mục:', error);
            toast.error('Lỗi: ' + error.message);
        } finally {
            setIsSyncingNode(false);
        }
    };
`;
code = code.replace(/const handleExportExcel = async \(\) => \{/, handleFunc + "\n    const handleExportExcel = async () => {");

// 3. Add import for Cloud, RefreshCw
if (!code.includes('RefreshCw')) {
    code = code.replace(/HardDrive,/, "HardDrive, RefreshCw,");
}
if (!code.includes('Cloud,')) {
    code = code.replace(/HardDrive,/, "HardDrive, Cloud,");
}
if (!code.includes('httpsCallable')) {
    code = code.replace(/import \{ db/g, "import { functions, db");
    code = code.replace(/import \{ collection/g, "import { httpsCallable } from 'firebase/functions';\nimport { collection");
}

// 4. Add button to UI
const btnTarget = `{selectedNode.driveFolderLink && (
                                        <a
                                            href={selectedNode.driveFolderLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 bg-emerald-50 text-emerald-700 font-medium px-3 md:px-4 py-2 rounded-md hover:bg-emerald-100 transition-colors text-sm whitespace-nowrap"
                                            title="Mở trên Drive"
                                        >
                                            <HardDrive className="w-4 h-4" />
                                            <span className="hidden md:inline">Mở trên Drive</span>
                                        </a>
                                    )}`;

const newBtn = btnTarget + `
                                    {isAdminOrManager && (
                                        <button
                                            onClick={() => handleSyncSingleNode(selectedNode.id)}
                                            disabled={isSyncingNode}
                                            className={\`flex items-center gap-2 bg-purple-50 text-purple-700 font-medium px-3 md:px-4 py-2 rounded-md hover:bg-purple-100 transition-colors text-sm whitespace-nowrap \${isSyncingNode ? 'opacity-50 cursor-not-allowed' : ''}\`}
                                            title="Đồng bộ thư mục này"
                                        >
                                            <RefreshCw className={\`w-4 h-4 \${isSyncingNode ? 'animate-spin' : ''}\`} />
                                            <span className="hidden md:inline">{isSyncingNode ? 'Đang đồng bộ...' : 'Đồng bộ thư mục'}</span>
                                        </button>
                                    )}`;

// Handle potential \r\n vs \n
let currentBtnTarget = btnTarget;
if (!code.includes(currentBtnTarget)) {
    currentBtnTarget = currentBtnTarget.replace(/\r\n/g, '\n');
}
if (!code.includes(currentBtnTarget)) {
    console.log("Could not find button target exactly, trying fuzzy replace");
    // Just replace "Sơ đồ Gantt" link end
    code = code.replace(/<\/Link>\s*\{selectedNode\.driveFolderLink/, "</Link>\n" + newBtn.replace(btnTarget, "") + "\n{selectedNode.driveFolderLink");
} else {
    code = code.replace(currentBtnTarget, newBtn);
}


// 5. Add Modal to UI
const modalUI = `
            {/* Modal: Debug Drive */}
            {showDebugModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                                    <Cloud className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">Nhật ký Đồng bộ Drive</h3>
                                    <p className="text-sm text-gray-500 mt-1">Chi tiết quá trình tạo cấu trúc thư mục và liên kết tệp</p>
                                </div>
                            </div>
                            <button onClick={() => setShowDebugModal(false)} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Body - Logs Terminal Style */}
                        <div className="flex-1 overflow-auto p-6 bg-gray-900 text-gray-300 font-mono text-sm leading-relaxed">
                            <div className="space-y-1.5">
                                {syncDebugLogs.map((log, idx) => (
                                    <div key={idx} className={\`\${log.includes('[+]') ? 'text-green-400 font-medium' : log.includes('[!]') ? 'text-red-400 font-medium' : log.includes('===') ? 'text-blue-400 font-bold mt-4 mb-2' : log.includes('[~]') ? 'text-yellow-400' : 'text-gray-300'}\`}>
                                        {log}
                                    </div>
                                ))}
                                {syncDebugLogs.length === 0 && <div className="text-gray-500 py-8 text-center uppercase tracking-widest text-[10px]">Mọi thứ đang hoạt động tốt</div>}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <button
                                onClick={() => setShowDebugModal(false)}
                                className="px-6 py-2.5 bg-gray-900 text-white font-medium rounded-xl hover:bg-gray-800 transition-colors shadow-sm"
                            >
                                Đóng
                            </button>
                        </div>
                    </div>
                </div>
            )}
`;

code = code.replace(/\{isModalOpen && \(/, modalUI + "\n            {isModalOpen && (");

fs.writeFileSync('src/pages/Projects.tsx', code);
console.log("Updated Projects.tsx");
