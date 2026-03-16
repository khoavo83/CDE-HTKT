import { FileCheck, FileText, FileSpreadsheet, FileImage, Layers } from 'lucide-react';
import React from 'react';

// Hàm trả về cấu hình icon dựa vào định hạng file hoặc loại văn bản
export const getDocIconConfig = (doc: any): { Icon: React.ElementType; bg: string; color: string } => {
    // Ưu tiên phân loại theo định dạng file thực tế
    const mime = (doc.fileMimeType || '').toLowerCase();
    const name = (doc.standardName || doc.fileNameOriginal || '').toLowerCase();
    const ext = name.split('.').pop() || '';

    // PDF - màu đỏ
    if (mime.includes('pdf') || ext === 'pdf')
        return { Icon: FileCheck, bg: 'bg-red-50', color: 'text-red-600' };

    // Word - màu xanh dương
    if (mime.includes('word') || mime.includes('document') || ext === 'doc' || ext === 'docx')
        return { Icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' };

    // Excel - màu xanh lá
    if (mime.includes('sheet') || mime.includes('excel') || ext === 'xls' || ext === 'xlsx' || ext === 'csv')
        return { Icon: FileSpreadsheet, bg: 'bg-green-50', color: 'text-green-600' };

    // Image - màu tím
    if (mime.includes('image') || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'gif' || ext === 'webp')
        return { Icon: FileImage, bg: 'bg-purple-50', color: 'text-purple-600' };

    // Fallback: dùng loại văn bản nếu không xác định được định dạng file
    const loai = (doc.loaiVanBan || '').toLowerCase();
    if (loai.includes('quyết định') || loai.includes('qd'))
        return { Icon: FileCheck, bg: 'bg-red-50', color: 'text-red-600' };
    if (loai.includes('nghị quyết'))
        return { Icon: Layers, bg: 'bg-purple-50', color: 'text-purple-600' };
    if (loai.includes('thông báo'))
        return { Icon: FileText, bg: 'bg-orange-50', color: 'text-orange-600' };
    if (loai.includes('hợp đồng'))
        return { Icon: FileCheck, bg: 'bg-green-50', color: 'text-green-700' };
    if (loai.includes('công văn') || loai.includes('cv'))
        return { Icon: FileText, bg: 'bg-blue-50', color: 'text-blue-600' };
    if (loai.includes('báo cáo') || loai.includes('bc'))
        return { Icon: FileSpreadsheet, bg: 'bg-teal-50', color: 'text-teal-600' };

    return { Icon: FileText, bg: 'bg-gray-50', color: 'text-gray-500' };
};

// Hàm định dạng tên văn bản theo chuẩn Mindmap
export const getDocFormattedTitle = (doc: any): string => {
    if (!doc) return 'Văn bản';

    // Format ngày: YYYY-MM-DD → "ngày DD tháng MM năm YYYY"
    let formattedDate = '';
    if (doc.ngayBanHanh) {
        const parts = doc.ngayBanHanh.split('-');
        if (parts.length === 3) {
            formattedDate = `ngày ${parseInt(parts[2])} tháng ${parseInt(parts[1])} năm ${parts[0]}`;
        } else {
            formattedDate = `ngày ${doc.ngayBanHanh}`;
        }
    }

    const docLabelParts = [
        `${doc.loaiVanBan || 'Văn bản'}`,
        doc.soKyHieu ? `số ${doc.soKyHieu}` : '',
        formattedDate,
        doc.coQuanBanHanh ? `của ${doc.coQuanBanHanh.toUpperCase()}` : '',
        (doc.trichYeu || doc.fileNameOriginal) ? `${doc.trichYeu || doc.fileNameOriginal}` : ''
    ];

    return docLabelParts.filter(Boolean).join(' ');
};
