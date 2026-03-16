import { User } from '../store/useAuthStore';

// Map vai trò sang bậc để dễ so sánh (số càng lớn, bậc càng cao)
const ROLE_RANKING = {
    'admin': 4,
    'manager': 3,
    'user': 2,
    'viewer': 1
};

export const canManageUser = (currentUser: User | null, targetUserRole: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;

    // currentUser là manager thì chỉ được quản lý user hoặc viewer (không được quản lý manager khác hay admin)
    const currentRank = ROLE_RANKING[currentUser.role as keyof typeof ROLE_RANKING] || 0;
    const targetRank = ROLE_RANKING[targetUserRole as keyof typeof ROLE_RANKING] || 0;

    // Cấp dưới không được thao tác cấp trên và cấp ngang hàng. Phải lớn hơn hẳn.
    return currentRank > targetRank;
};

export const canEditOrDeleteData = (currentUser: User | null, dataOwnerEmail?: string): boolean => {
    if (!currentUser) return false;

    // Admin có toàn quyền nội bộ
    if (currentUser.role === 'admin') return true;

    // Nếu có thông tin người tạo, chỉ người tạo mới được sửa data của mình
    if (dataOwnerEmail && currentUser.email === dataOwnerEmail) return true;

    return false;
};
