/**
 * Utility: Format theo chuẩn Việt Nam
 * - Ngày giờ: dd/mm/yyyy hh:mm (UTC+7)
 * - Số: 1.234.567,89 (chấm phân ngàn, phẩy thập phân)
 * - Tiền: 1.234.567 VNĐ hoặc 1,234.56 USD
 */

const VI_LOCALE = 'vi-VN';
const TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Format ngày theo dd/mm/yyyy */
export function formatDate(value: string | Date | null | undefined): string {
    if (!value) return '--';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) {
        // Thử parse ISO YYYY-MM-DD trực tiếp
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, day] = value.split('-');
            return `${day}/${m}/${y}`;
        }
        return String(value);
    }
    return d.toLocaleDateString(VI_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: TIMEZONE,
    });
}

/** Format ngày giờ theo dd/mm/yyyy hh:mm */
export function formatDateTime(value: string | Date | null | undefined): string {
    if (!value) return '--';
    const d = typeof value === 'string' ? new Date(value) : value;
    if (isNaN(d.getTime())) return String(value);
    return d.toLocaleString(VI_LOCALE, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE,
    });
}

/** Format số theo kiểu Việt Nam: 1.234.567,89 */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || value === '') return '--';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    if (isNaN(num)) return String(value);
    return num.toLocaleString(VI_LOCALE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Format tiền VNĐ: 1.234.567 VNĐ */
export function formatVND(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '--';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    if (isNaN(num)) return String(value);
    return num.toLocaleString(VI_LOCALE, {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });
}

/** Format tiền USD: $1,234.56 */
export function formatUSD(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '--';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Lấy giờ hiện tại tại Hà Nội dạng hh:mm */
export function nowHHMM(): string {
    return new Date().toLocaleTimeString(VI_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE,
    });
}

/** Lấy ngày hiện tại tại Hà Nội (YYYY-MM-DD) để dùng trong input[type=date] */
export function todayISO(): string {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, '0');
    const d = String(local.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Chuyển chuỗi YYYY-MM-DD sang dd/mm/yyyy */
export function isoToVN(isoDate: string | null | undefined): string {
    if (!isoDate) return '--';
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return isoDate;
}

/** Chuyển đổi dung lượng Bytes sang đơn vị MB, GB dễ đọc */
export function formatBytes(bytes: number | null | undefined, decimals = 2): string {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) return '--';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

