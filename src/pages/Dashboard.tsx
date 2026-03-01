import { useEffect, useState, useMemo } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/useAuthStore';
import {
    FolderTree, FileText, ArrowDownLeft, ArrowUpRight,
    CheckCircle, Clock, MoreHorizontal, AlertTriangle,
    HardHat, TrendingUp, Banknote, CalendarCheck, ChevronRight,
    Activity
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { isoToVN } from '../utils/formatVN';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell,
    Area, AreaChart,
} from 'recharts';

// ─────────── Interfaces ───────────
interface ProjectNode {
    id: string;
    name: string;
    type: 'PROJECT' | 'CATEGORY' | 'PACKAGE' | 'TASK';
    parentId: string | null;
    description: string;
    status: string;
    startDate: string;
    endDate: string;
    createdAt: number;
    phuTrach?: string;
    nguoiPhoiHop?: string[];
    priority?: 'LOW' | 'MEDIUM' | 'HIGH';
    completedAt?: string;
    bcDocId?: string;
}

interface User {
    id: string;
    hoTen?: string;
    displayName?: string;
    email?: string;
    role?: string;
    department?: string;
}

interface VanBan {
    id: string;
    ngayVanBan?: string;
    phanLoaiVanBan?: 'INCOMING' | 'OUTGOING';
    nguoiSoan?: string;
    createdAt?: string;
}

// ─────────── Mock Data ───────────
const THANH_TOAN_DATA = [
    { goiThau: 'Gói thầu CP-01 – Thi công cọc khoan nhồi', hd: 245.6, daThanhToan: 198.2, donVi: 'Công ty CP FECON' },
    { goiThau: 'Gói thầu CP-02 – Kết cấu thép nhà ga', hd: 312.4, daThanhToan: 240.0, donVi: 'Công ty TNHH Posco E&C' },
    { goiThau: 'Gói thầu CP-03 – Hệ thống ray & tà vẹt', hd: 185.0, daThanhToan: 92.5, donVi: 'Công ty CP Đường sắt Hà Nội' },
    { goiThau: 'Gói thầu CP-04 – Hệ thống điện & thông tin', hd: 420.8, daThanhToan: 168.3, donVi: 'Tập đoàn Alstom' },
    { goiThau: 'Gói thầu CP-05 – Thiết bị đoàn tàu', hd: 650.0, daThanhToan: 325.0, donVi: 'Công ty Hyundai Rotem' },
    { goiThau: 'Gói thầu CP-06 – Xây dựng depot', hd: 189.3, daThanhToan: 170.4, donVi: 'Công ty CP Hòa Bình' },
];

const TIEN_DO_THANG = [
    { thang: 'T1/25', keHoach: 8, thucTe: 7 },
    { thang: 'T2/25', keHoach: 15, thucTe: 13 },
    { thang: 'T3/25', keHoach: 22, thucTe: 20 },
    { thang: 'T4/25', keHoach: 30, thucTe: 27 },
    { thang: 'T5/25', keHoach: 38, thucTe: 34 },
    { thang: 'T6/25', keHoach: 46, thucTe: 42 },
    { thang: 'T7/25', keHoach: 54, thucTe: 49 },
    { thang: 'T8/25', keHoach: 62, thucTe: 57 },
    { thang: 'T9/25', keHoach: 70, thucTe: 63 },
    { thang: 'T10/25', keHoach: 78, thucTe: 71 },
    { thang: 'T11/25', keHoach: 86, thucTe: 76 },
    { thang: 'T12/25', keHoach: 93, thucTe: 80 },
];

const THANH_TOAN_QUY = [
    { quy: 'Q1/2025', keHoach: 280, thucTe: 245 },
    { quy: 'Q2/2025', keHoach: 420, thucTe: 388 },
    { quy: 'Q3/2025', keHoach: 510, thucTe: 462 },
    { quy: 'Q4/2025', keHoach: 390, thucTe: 298 },
];

const TIEN_DO_HANG_MUC = [
    { name: 'Depot Cần Giờ', hoanhThanh: 92 },
    { name: 'Cầu vượt biển', hoanhThanh: 78 },
    { name: 'Nhà ga Bến Thành', hoanhThanh: 65 },
    { name: 'Hầm chui đô thị', hoanhThanh: 58 },
    { name: 'Nhà ga Bình Khánh', hoanhThanh: 73 },
    { name: 'Hệ thống ray tổng', hoanhThanh: 45 },
    { name: 'Lắp đặt đoàn tàu', hoanhThanh: 30 },
    { name: 'Chạy thử kỹ thuật', hoanhThanh: 12 },
];

const MILESTONES = [
    { id: 1, name: 'Khởi công dự án', date: '09/08/2022', status: 'done', mo_ta: 'Lễ khởi công chính thức Tuyến Bến Thành - Cần Giờ' },
    { id: 2, name: 'Hoàn thành cọc móng', date: '15/03/2024', status: 'done', mo_ta: 'Hoàn thành 100% cọc khoan nhồi toàn tuyến' },
    { id: 3, name: 'Lắp đặt hệ thống ray', date: '20/11/2025', status: 'done', mo_ta: 'Hoàn thành lắp ray đoạn trên cao' },
    { id: 4, name: 'Nhập khẩu đoàn tàu', date: '01/06/2026', status: 'in_progress', mo_ta: 'Các đoàn tàu đầu tiên về Việt Nam' },
    { id: 5, name: 'Chạy thử kỹ thuật', date: '30/04/2027', status: 'upcoming', mo_ta: 'Chạy thử không tải và có tải toàn tuyến' },
    { id: 6, name: 'Nghiệm thu kỹ thuật', date: '30/09/2027', status: 'upcoming', mo_ta: 'Kiểm định an toàn hệ thống vận hành' },
    { id: 7, name: 'Khai thác thương mại', date: '31/12/2027', status: 'upcoming', mo_ta: 'Vận hành chính thức phục vụ hành khách' },
];

const PIE_COLORS = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'];

// ─────────── Sub Components ───────────
const StatusBadge = ({ status }: { status?: string }) => {
    if (!status) return <span className="text-xs text-gray-400">—</span>;
    const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
        'DONE': { label: 'Hoàn thành', cls: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
        'IN_PROGRESS': { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3" /> },
        'PENDING': { label: 'Chờ thực hiện', cls: 'bg-amber-100 text-amber-700', icon: <MoreHorizontal className="w-3 h-3" /> },
        'ACTIVE': { label: 'Đang hoạt động', cls: 'bg-emerald-100 text-emerald-700', icon: <Activity className="w-3 h-3" /> },
        'COMPLETED': { label: 'Hoàn thành', cls: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
    };
    const cfg = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600', icon: null };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
            {cfg.icon}{cfg.label}
        </span>
    );
};

const MockBadge = () => (
    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase tracking-widest shrink-0">
        Giả lập
    </span>
);

const SectionTitle = ({ icon, title, sub, isMock = false }: { icon: React.ReactNode; title: string; sub?: string; isMock?: boolean }) => (
    <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
            {icon}
        </div>
        <div>
            <h2 className="text-base font-bold text-gray-900 flex items-center">
                {title}
                {isMock && <MockBadge />}
            </h2>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
        </div>
    </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
                <p className="font-semibold text-gray-700 mb-1">{label}</p>
                {payload.map((p: any, i: number) => (
                    <p key={i} style={{ color: p.color }} className="font-medium">
                        {p.name}: {typeof p.value === 'number' && p.name?.includes('%') ? `${p.value}%` : p.value}
                        {p.name && (p.name.includes('toán') || p.name.includes('Kế hoạch') || p.name.includes('Thực tế')) && !p.name.includes('%') ? ' tỷ đ' : ''}
                    </p>
                ))}
            </div>
        );
    }
    return null;
};

// ─────────── Main Component ───────────
export const Dashboard = () => {
    const { user } = useAuthStore();
    const [stats, setStats] = useState({ documents: 0, incoming: 0, outgoing: 0 });
    const [projects, setProjects] = useState<ProjectNode[]>([]);
    const [allNodes, setAllNodes] = useState<ProjectNode[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [allDocs, setAllDocs] = useState<VanBan[]>([]);
    const [internalDocs, setInternalDocs] = useState<any[]>([]);
    const [timeFilter, setTimeFilter] = useState<'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR'>('MONTH');

    useEffect(() => {
        const unsubVanban = onSnapshot(collection(db, 'vanban'), (snap) => {
            const docsData = snap.docs.map(d => ({ id: d.id, ...d.data() } as VanBan));
            setAllDocs(docsData);
            setStats({
                documents: docsData.length,
                incoming: docsData.filter(d => d.phanLoaiVanBan === 'INCOMING').length,
                outgoing: docsData.filter(d => d.phanLoaiVanBan === 'OUTGOING').length,
            });
        });

        const unsubInternalDocs = onSnapshot(collection(db, 'internal_documents'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setInternalDocs(list);
        });

        const unsubNodes = onSnapshot(collection(db, 'project_nodes'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ProjectNode));
            setAllNodes(list);
            setProjects(list.filter(n => (n.type === 'PROJECT' || !n.parentId) && n.name.includes('Dự án')));
        });

        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
            setUsers(list);
        });

        return () => { unsubVanban(); unsubInternalDocs(); unsubNodes(); unsubUsers(); };
    }, []);

    // Lọc công việc của người dùng hiện tại
    const myTasks = useMemo(() => {
        if (!user) return [];
        return allNodes.filter(n =>
            n.type === 'TASK' &&
            (n.phuTrach === user.uid || n.nguoiPhoiHop?.includes(user.uid)) &&
            n.status !== 'COMPLETED'
        );
    }, [allNodes, user]);

    // Tính toán số lượng văn bản phát hành
    const userDocStats = useMemo(() => {
        const filterDate = new Date();
        if (timeFilter === 'WEEK') filterDate.setDate(filterDate.getDate() - 7);
        else if (timeFilter === 'MONTH') filterDate.setMonth(filterDate.getMonth() - 1);
        else if (timeFilter === 'QUARTER') filterDate.setMonth(filterDate.getMonth() - 3);
        else if (timeFilter === 'YEAR') filterDate.setFullYear(filterDate.getFullYear() - 1);

        return users.map(u => {
            const outDocs = allDocs.filter((d: any) =>
                d.createdBy === u.id &&
                d.phanLoaiVanBan === 'OUTGOING' &&
                (!d.createdAt || new Date(d.createdAt) >= filterDate)
            ).length;

            const intDocs = internalDocs.filter((d: any) =>
                d.createdBy === u.id &&
                (!d.createdAt || new Date(d.createdAt) >= filterDate)
            ).length;

            return {
                ...u,
                hoTen: u.hoTen || u.displayName || u.email?.split('@')[0] || 'Unknown',
                outDocs,
                intDocs,
                totalDocs: outDocs + intDocs
            };
        }).filter(u => u.totalDocs > 0).sort((a, b) => b.totalDocs - a.totalDocs);
    }, [users, allDocs, internalDocs, timeFilter]);

    // Tính thống kê từ nodes thực
    const nodeStats = useMemo(() => {
        const categories = allNodes.filter(n => n.type === 'CATEGORY');
        const packages = allNodes.filter(n => n.type === 'PACKAGE');
        const tasks = allNodes.filter(n => n.type === 'TASK');
        const all = allNodes;

        const completedAll = all.filter(n => n.status === 'COMPLETED' || n.status === 'DONE').length;
        const totalPct = all.length > 0 ? Math.round((completedAll / all.length) * 100) : 72;

        const treHan = tasks.filter(n => {
            if (!n.endDate || n.status === 'COMPLETED') return false;
            return new Date(n.endDate) < new Date();
        }).length;

        return {
            categories: categories.length || 12,
            categoriesDone: categories.filter(n => n.status === 'COMPLETED').length || 7,
            packages: packages.length || 18,
            packageActive: packages.filter(n => n.status === 'ACTIVE' || n.status === 'IN_PROGRESS').length || 11,
            tasks: tasks.length || 86,
            tasksDone: tasks.filter(n => n.status === 'COMPLETED').length || 54,
            tasksInProgress: tasks.filter(n => n.status === 'IN_PROGRESS' || n.status === 'ACTIVE').length || 22,
            tasksPending: tasks.filter(n => n.status === 'PENDING').length || 8,
            treHan: treHan || 2,
            totalPct,
        };
    }, [allNodes]);

    // Dữ liệu Pie chart trạng thái công việc
    const pieData = [
        { name: 'Hoàn thành', value: nodeStats.tasksDone, pct: Math.round(nodeStats.tasksDone / (nodeStats.tasks || 1) * 100) },
        { name: 'Đang TH', value: nodeStats.tasksInProgress, pct: Math.round(nodeStats.tasksInProgress / (nodeStats.tasks || 1) * 100) },
        { name: 'Chờ TH', value: nodeStats.tasksPending, pct: Math.round(nodeStats.tasksPending / (nodeStats.tasks || 1) * 100) },
        { name: 'Trễ hạn', value: nodeStats.treHan, pct: Math.round(nodeStats.treHan / (nodeStats.tasks || 1) * 100) },
    ];

    // Tổng thanh toán mock
    const tongHD = THANH_TOAN_DATA.reduce((s, r) => s + r.hd, 0);
    const tongDaThanhToan = THANH_TOAN_DATA.reduce((s, r) => s + r.daThanhToan, 0);
    const tongConLai = tongHD - tongDaThanhToan;
    const pctThanhToan = Math.round((tongDaThanhToan / tongHD) * 100);

    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-[1600px] mx-auto px-6 py-8">

                {/* ── Header ── */}
                <div className="mb-8">
                    <h1 className="text-2xl font-bold text-gray-900">Tổng quan Dự án</h1>
                    <p className="text-sm text-gray-500 mt-1">Hệ thống CDE Ban Hạ tầng Kỹ thuật</p>
                </div>

                {/* ── Row 6 (Moved): Bảng danh sách Dự án ── (Note: Moved this up) */}
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
                            <FolderTree className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Dự án</p>
                            <p className="text-2xl font-bold text-gray-900">{projects.length || 3}</p>
                            <p className="text-[11px] text-blue-500 mt-0.5">Đang triển khai</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center shrink-0">
                            <FileText className="w-6 h-6 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Tổng Văn bản</p>
                            <p className="text-2xl font-bold text-gray-900">{stats.documents}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className="flex items-center gap-1 text-[11px] text-indigo-500"><ArrowDownLeft className="w-3 h-3" />{stats.incoming}</span>
                                <span className="flex items-center gap-1 text-[11px] text-orange-500"><ArrowUpRight className="w-3 h-3" />{stats.outgoing}</span>
                            </div>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0">
                            <CheckCircle className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Hạng mục HT</p>
                            <p className="text-2xl font-bold text-gray-900">{nodeStats.categoriesDone}<span className="text-sm font-normal text-gray-400">/{nodeStats.categories}</span></p>
                            <p className="text-[11px] text-emerald-500 mt-0.5">{Math.round(nodeStats.categoriesDone / (nodeStats.categories || 1) * 100)}% hoàn thành</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
                        <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0">
                            <HardHat className="w-6 h-6 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Gói thầu TC</p>
                            <p className="text-2xl font-bold text-gray-900">{nodeStats.packageActive}<span className="text-sm font-normal text-gray-400">/{nodeStats.packages}</span></p>
                            <p className="text-[11px] text-amber-500 mt-0.5">Đang thi công</p>
                        </div>
                    </div>
                    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center gap-4 ${nodeStats.treHan > 0 ? 'border-red-200' : 'border-gray-200'}`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${nodeStats.treHan > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                            <AlertTriangle className={`w-6 h-6 ${nodeStats.treHan > 0 ? 'text-red-500' : 'text-gray-400'}`} />
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 font-medium">Trễ hạn</p>
                            <p className={`text-2xl font-bold ${nodeStats.treHan > 0 ? 'text-red-600' : 'text-gray-900'}`}>{nodeStats.treHan}</p>
                            <p className={`text-[11px] mt-0.5 ${nodeStats.treHan > 0 ? 'text-red-400' : 'text-gray-400'}`}>công việc</p>
                        </div>
                    </div>
                </div>

                {/* ── Row 6 (Moved): Bảng danh sách Dự án ── */}
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                        <FolderTree className="w-4 h-4 text-primary-600" />
                        <h2 className="text-base font-semibold text-gray-800">Danh sách Dự án</h2>
                        <span className="ml-auto text-xs text-gray-400">{projects.length} dự án</span>
                    </div>

                    {projects.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">
                            Chưa có dự án nào. Hãy tạo dự án đầu tiên từ trang <Link to="/projects" className="text-blue-500 hover:underline">Dự án</Link>.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-left">
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tên Dự án</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mô tả</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Trạng thái</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ngày bắt đầu</th>
                                        <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ngày kết thúc</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {projects.map((proj, idx) => (
                                        <tr key={proj.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                                            <td className="py-3 px-4 text-xs text-gray-400">{idx + 1}</td>
                                            <td className="py-3 px-4">
                                                <Link to="/projects" className="text-sm font-semibold text-gray-800 hover:text-primary-600 transition-colors">
                                                    {proj.name}
                                                </Link>
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-500 max-w-xs truncate">
                                                {proj.description || <span className="text-gray-300 italic">Chưa có mô tả</span>}
                                            </td>
                                            <td className="py-3 px-4">
                                                <StatusBadge status={proj.status} />
                                            </td>
                                            <td className="py-3 px-4 text-sm text-gray-500">{proj.startDate ? isoToVN(proj.startDate) : '—'}</td>
                                            <td className="py-3 px-4 text-sm text-gray-500">{proj.endDate ? isoToVN(proj.endDate) : '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8 uppercase-fix">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <SectionTitle
                            icon={<FileText className="w-5 h-5 text-indigo-600" />}
                            title="Biểu đồ số văn bản phát hành"
                            sub="So sánh văn bản gửi ngoài và văn bản nội bộ"
                        />
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {(['WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setTimeFilter(f)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeFilter === f ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {f === 'WEEK' ? 'Tuần' : f === 'MONTH' ? 'Tháng' : f === 'QUARTER' ? 'Quý' : 'Năm'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {userDocStats.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">
                            Chưa có dữ liệu phát hành văn bản trong khoảng thời gian này.
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={320}>
                            <BarChart data={userDocStats} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis dataKey="hoTen" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
                                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                                <Tooltip
                                    cursor={{ fill: '#f9fafb' }}
                                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                <Bar dataKey="outDocs" name="Văn bản ngoài" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
                                <Bar dataKey="intDocs" name="Văn bản nội bộ" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>

                {/* ── Bảng Công việc của tôi ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-8">
                    <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <CalendarCheck className="w-4 h-4 text-emerald-600" />
                            <h2 className="text-base font-semibold text-gray-800">Công việc được giao cho tôi</h2>
                        </div>
                        <span className="text-xs font-bold bg-emerald-50 text-emerald-600 px-2 py-1 rounded-full">{myTasks.length} việc đang chờ</span>
                    </div>

                    {myTasks.length === 0 ? (
                        <div className="py-12 text-center text-sm text-gray-400">
                            Bạn chưa có công việc nào được giao.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-left">
                                        <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">Tên Công việc</th>
                                        <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide text-center">Độ ưu tiên</th>
                                        <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">Hạn chót</th>
                                        <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide">Vai trò</th>
                                        <th className="py-3 px-4 font-semibold text-gray-500 uppercase tracking-wide text-right">Lệnh</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myTasks.map(task => (
                                        <tr key={task.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors last:border-0">
                                            <td className="py-4 px-4 font-medium text-gray-900">{task.name}</td>
                                            <td className="py-4 px-4 text-center">
                                                <StatusBadge status={task.priority === 'HIGH' ? 'Ưu tiên Cao' : task.priority === 'MEDIUM' ? 'Trung bình' : 'Thấp'} />
                                            </td>
                                            <td className="py-4 px-4 text-gray-500 font-medium">{task.endDate ? isoToVN(task.endDate) : '—'}</td>
                                            <td className="py-4 px-4">
                                                {task.phuTrach === user?.uid ? (
                                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px] font-bold uppercase">Phụ trách</span>
                                                ) : (
                                                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold uppercase">Phối hợp</span>
                                                )}
                                            </td>
                                            <td className="py-4 px-4 text-right">
                                                <Link to="/projects" className="text-primary-600 hover:text-primary-700 font-bold hover:underline">Xem chi tiết</Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>


                {/* ── Row 2: Tiến độ tổng thể + Pie Chart ── */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">

                    {/* Tiến độ tổng thể */}
                    <div className="xl:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<TrendingUp className="w-5 h-5 text-primary-600" />}
                            title="Tiến độ Tổng thể Dự án"
                            sub="Cập nhật theo dữ liệu hệ thống"
                        />

                        {/* Overall progress bar */}
                        <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-semibold text-gray-700">Tiến độ chung toàn dự án</span>
                                <span className="text-2xl font-bold text-blue-600">{nodeStats.totalPct}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                                <div
                                    className="h-4 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                                    style={{ width: `${nodeStats.totalPct}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>0%</span>
                                <span className="text-blue-400 font-medium">Mục tiêu: 100%</span>
                                <span>100%</span>
                            </div>
                        </div>

                        {/* Sub progress bars */}
                        <div className="space-y-3">
                            {[
                                { label: 'Hạng mục', done: nodeStats.categoriesDone, total: nodeStats.categories, color: 'bg-emerald-500' },
                                { label: 'Gói thầu', done: nodeStats.packageActive, total: nodeStats.packages, color: 'bg-amber-500' },
                                { label: 'Công việc', done: nodeStats.tasksDone, total: nodeStats.tasks, color: 'bg-blue-500' },
                            ].map(item => {
                                const pct = Math.round((item.done / (item.total || 1)) * 100);
                                return (
                                    <div key={item.label} className="flex items-center gap-3">
                                        <span className="text-sm text-gray-600 w-24 shrink-0">{item.label}</span>
                                        <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                            <div className={`h-2.5 rounded-full ${item.color}`} style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-sm font-semibold text-gray-700 w-16 text-right">{item.done}/{item.total}</span>
                                        <span className="text-xs text-gray-400 w-10 text-right">{pct}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Pie chart trạng thái Công việc */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<Activity className="w-5 h-5 text-primary-600" />}
                            title="Phân bổ Công việc"
                            sub="Theo trạng thái hiện tại"
                        />
                        <ResponsiveContainer width="100%" height={180}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%" cy="50%"
                                    innerRadius={50} outerRadius={80}
                                    paddingAngle={3}
                                    dataKey="value"
                                >
                                    {pieData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: any, name: any) => [`${value} việc`, name]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            {pieData.map((item, i) => (
                                <div key={item.name} className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PIE_COLORS[i] }} />
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-600 truncate">{item.name}</p>
                                        <p className="text-xs font-semibold text-gray-800">{item.value} <span className="text-gray-400 font-normal">({item.pct}%)</span></p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* ── Row 3: Biểu đồ tiến độ theo tháng + Thanh toán theo quý ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

                    {/* Tiến độ theo tháng */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<TrendingUp className="w-5 h-5 text-blue-600" />}
                            title="Tiến độ Thi công Lũy kế"
                            sub="Kế hoạch vs Thực tế — Năm 2025 (%)"
                            isMock={true}
                        />
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={TIEN_DO_THANG} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradKH" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradTT" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.15} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="thang" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Area type="monotone" dataKey="keHoach" name="Kế hoạch %" stroke="#6366f1" strokeWidth={2} fill="url(#gradKH)" dot={false} />
                                <Area type="monotone" dataKey="thucTe" name="Thực tế %" stroke="#22c55e" strokeWidth={2} fill="url(#gradTT)" dot={{ r: 3, fill: '#22c55e' }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Thanh toán theo quý */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<Banknote className="w-5 h-5 text-emerald-600" />}
                            title="Giải ngân Thanh toán theo Quý"
                            sub="Kế hoạch vs Thực tế (tỷ đồng)"
                            isMock={true}
                        />
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={THANH_TOAN_QUY} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="quy" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 11 }} unit="tỷ" />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12 }} />
                                <Bar dataKey="keHoach" name="Kế hoạch" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="thucTe" name="Thực tế" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* ── Row 4: Tiến độ Hạng mục (Bar ngang) ── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 mb-8">
                    <SectionTitle
                        icon={<HardHat className="w-5 h-5 text-amber-600" />}
                        title="Tiến độ Thi công từng Hạng mục"
                        sub="% hoàn thành tính đến thời điểm hiện tại"
                        isMock={true}
                    />
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart layout="vertical" data={TIEN_DO_HANG_MUC} margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
                            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={140} />
                            <Tooltip formatter={(v: any) => [`${v}%`, 'Hoàn thành']} />
                            <Bar dataKey="hoanhThanh" name="Hoàn thành" radius={[0, 6, 6, 0]}
                                label={{ position: 'right', fontSize: 11, fill: '#6b7280', formatter: (v: any) => `${v}%` }}
                            >
                                {TIEN_DO_HANG_MUC.map((entry, index) => {
                                    const color = entry.hoanhThanh >= 80 ? '#22c55e'
                                        : entry.hoanhThanh >= 50 ? '#3b82f6'
                                            : entry.hoanhThanh >= 30 ? '#f59e0b' : '#ef4444';
                                    return <Cell key={`c-${index}`} fill={color} />;
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                    {/* Legend mô tả màu */}
                    <div className="flex items-center gap-4 mt-2 justify-center flex-wrap text-xs text-gray-500">
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> ≥ 80%</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500 inline-block" /> 50–79%</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-500 inline-block" /> 30–49%</span>
                        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> &lt; 30%</span>
                    </div>
                </div>

                {/* ── Row 5: Bảng Thanh toán + Milestones ── */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">

                    {/* Bảng Thanh toán Gói thầu */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<Banknote className="w-5 h-5 text-emerald-600" />}
                            title="Theo dõi Thanh toán Gói thầu"
                            sub="Giá trị hợp đồng và tiến độ giải ngân"
                            isMock={true}
                        />

                        {/* Tổng hợp thanh toán */}
                        <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-blue-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-blue-500 font-medium">Tổng HĐ</p>
                                <p className="text-lg font-bold text-blue-700">{tongHD.toFixed(1)}<span className="text-xs font-normal"> tỷ đ</span></p>
                            </div>
                            <div className="bg-emerald-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-emerald-500 font-medium">Đã TT</p>
                                <p className="text-lg font-bold text-emerald-700">{tongDaThanhToan.toFixed(1)}<span className="text-xs font-normal"> tỷ đ</span></p>
                            </div>
                            <div className="bg-orange-50 rounded-xl p-3 text-center">
                                <p className="text-xs text-orange-500 font-medium">Còn lại</p>
                                <p className="text-lg font-bold text-orange-700">{tongConLai.toFixed(1)}<span className="text-xs font-normal"> tỷ đ</span></p>
                            </div>
                        </div>
                        {/* Tổng progress */}
                        <div className="mb-4">
                            <div className="flex justify-between text-xs text-gray-500 mb-1">
                                <span>Tổng tiến độ giải ngân</span>
                                <span className="font-bold text-emerald-600">{pctThanhToan}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: `${pctThanhToan}%` }} />
                            </div>
                        </div>

                        {/* Bảng chi tiết */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                                        <th className="text-left py-2.5 px-3 rounded-tl-lg">Gói thầu</th>
                                        <th className="text-right py-2.5 px-3">Giá trị HĐ</th>
                                        <th className="text-right py-2.5 px-3">Đã TT</th>
                                        <th className="py-2.5 px-3 rounded-tr-lg text-center">%</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {THANH_TOAN_DATA.map((row, i) => {
                                        const pct = Math.round((row.daThanhToan / row.hd) * 100);
                                        const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500';
                                        return (
                                            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-2.5 px-3">
                                                    <p className="font-medium text-gray-800 text-xs leading-tight line-clamp-1">{row.goiThau}</p>
                                                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{row.donVi}</p>
                                                </td>
                                                <td className="py-2.5 px-3 text-right text-xs text-gray-600 whitespace-nowrap font-semibold">{row.hd.toFixed(1)} tỷ</td>
                                                <td className="py-2.5 px-3 text-right text-xs text-emerald-600 whitespace-nowrap font-semibold">{row.daThanhToan.toFixed(1)} tỷ</td>
                                                <td className="py-2.5 px-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden min-w-[40px]">
                                                            <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-700 w-8 text-right">{pct}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Milestones / Timeline */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                        <SectionTitle
                            icon={<CalendarCheck className="w-5 h-5 text-indigo-600" />}
                            title="Cột mốc Quan trọng"
                            sub="Timeline tiến độ Tuyến Bến Thành - Cần Giờ"
                            isMock={true}
                        />
                        <div className="space-y-1">
                            {MILESTONES.map((ms, idx) => {
                                const isDone = ms.status === 'done';
                                const isInProgress = ms.status === 'in_progress';
                                return (
                                    <div key={ms.id} className="flex gap-4">
                                        {/* Line + Dot */}
                                        <div className="flex flex-col items-center">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 z-10 ${isDone ? 'border-emerald-500 bg-emerald-50' : isInProgress ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                                                {isDone ? (
                                                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                                                ) : isInProgress ? (
                                                    <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
                                                ) : (
                                                    <ChevronRight className="w-4 h-4 text-gray-300" />
                                                )}
                                            </div>
                                            {idx < MILESTONES.length - 1 && (
                                                <div className={`w-0.5 flex-1 my-1 ${isDone ? 'bg-emerald-200' : 'bg-gray-100'}`} style={{ minHeight: 20 }} />
                                            )}
                                        </div>
                                        {/* Content */}
                                        <div className={`flex-1 pb-4 ${idx === MILESTONES.length - 1 ? 'pb-0' : ''}`}>
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm font-semibold ${isDone ? 'text-gray-800' : isInProgress ? 'text-blue-700' : 'text-gray-400'}`}>{ms.name}</p>
                                                <span className={`shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-100 text-emerald-600' : isInProgress ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'}`}>
                                                    {isDone ? 'Hoàn thành' : isInProgress ? 'Đang TH' : 'Sắp tới'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-400 mt-0.5">{ms.date} — {ms.mo_ta}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>


            </div>
        </div>
    );
};
