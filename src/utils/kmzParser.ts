import JSZip from 'jszip';
import { kml } from '@tmcw/togeojson';

export const parseKMZ = async (file: File): Promise<any> => {
    try {
        if (file.name.toLowerCase().endsWith('.kmz')) {
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(file);

            // Lấy ra danh sách các file trong gói KMZ (tìm file .kml)
            const kmlFiles = Object.keys(zipContent.files).filter(name => name.toLowerCase().endsWith('.kml'));
            if (kmlFiles.length === 0) {
                throw new Error("Không tìm thấy file KML nào bên trong gói KMZ này.");
            }

            // Đọc file KML đầu tiên tìm được
            const kmlText = await zipContent.files[kmlFiles[0]].async('text');
            const dom = new DOMParser().parseFromString(kmlText, 'text/xml');
            return kml(dom); // Trả về định dạng GeoJSON chuẩn hoá

        } else if (file.name.toLowerCase().endsWith('.kml')) {
            // Đọc trực tiếp nội dung KML
            const text = await file.text();
            const dom = new DOMParser().parseFromString(text, 'text/xml');
            return kml(dom);
        } else {
            throw new Error("Chỉ hỗ trợ file *.kmz hoặc *.kml");
        }
    } catch (error) {
        console.error("Lỗi giải nén/parse KMZ:", error);
        throw error;
    }
};
