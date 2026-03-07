/**
 * Utility: Format theo chuẩn Việt Nam
 * - Ngày giờ: dd/mm/yyyy hh:mm (UTC+7)
 * - Số: 1.234.567,89 (chấm phân ngàn, phẩy thập phân)
 * - Tiền: 1.234.567 VNĐ hoặc 1,234.56 USD
 */

const VI_LOCALE = 'vi-VN';
const TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Format n\u00e0y theo dd/mm/yyyy */
export function formatDate(value: string | Date | any | null | undefined): string {
    if (!value) return '--';

    let d: Date;
    if (typeof value === 'string') {
        d = new Date(value);
    } else if (value && typeof value.toDate === 'function') {
        d = value.toDate();
    } else {
        d = value as Date;
    }

    if (isNaN(d.getTime())) {
        // Th\u1eed parse ISO YYYY-MM-DD tr\u1ef1c ti\u1ebfp
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

/** Format ng\u00e0y gi\u1edd theo dd/mm/yyyy hh:mm */
export function formatDateTime(value: string | Date | any | null | undefined): string {
    if (!value) return '--';

    let d: Date;
    if (typeof value === 'string') {
        d = new Date(value);
    } else if (value && typeof value.toDate === 'function') {
        d = value.toDate();
    } else {
        d = value as Date;
    }

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

/** Format s\u1ed1 theo ki\u1ec3u Vi\u1ec7t Nam: 1.234.567,89 */
export function formatNumber(value: number | string | null | undefined, decimals = 0): string {
    if (value === null || value === undefined || value === '') return '--';
    const num = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
    if (isNaN(num)) return String(value);
    return num.toLocaleString(VI_LOCALE, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Format ti\u1ec1n VN\u0110: 1.234.567 VN\u0110 */
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

/** Format ti\u1ec1n USD: $1,234.56 */
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

/** L\u1ea5y gi\u1edd hi\u1ec7n t\u1ea1i t\u1ea1i H\u00e0 N\u1ed9i d\u1ea1ng hh:mm */
export function nowHHMM(): string {
    return new Date().toLocaleTimeString(VI_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: TIMEZONE,
    });
}

/** L\u1ea5y ng\u00e0y hi\u1ec7n t\u1ea1i t\u1ea1i H\u00e0 N\u1ed9i (YYYY-MM-DD) \u0111\u1ec3 d\u00f9ng trong input[type=date] */
export function todayISO(): string {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const y = local.getFullYear();
    const m = String(local.getMonth() + 1).padStart(2, '0');
    const d = String(local.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Chuy\u1ec3n chu\u1ed7i YYYY-MM-DD sang dd/mm/yyyy */
export function isoToVN(isoDate: string | null | undefined): string {
    if (!isoDate) return '--';
    const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
    return isoDate;
}

/** Chuy\u1ec3n \u0111\u1ed5i dung l\u01b0\u1ee3ng Bytes sang \u0111\u01a1n v\u1ecb MB, GB d\u1ec5 \u0111\u1ecdc */
export function formatBytes(bytes: number | null | undefined, decimals = 2): string {
    if (bytes === null || bytes === undefined || isNaN(bytes) || bytes === 0) return '--';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
