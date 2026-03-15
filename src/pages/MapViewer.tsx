import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, LayersControl, GeoJSON, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MobileWarning } from '../components/MobileWarning';
import {
    Map as MapIcon, Upload, Layers, Trash2,
    Eye, EyeOff, Loader2, AlertCircle, ChevronLeft, ChevronRight
} from 'lucide-react';
import { parseKMZ } from '../utils/kmzParser';
import { db } from '../firebase/config';
import {
    collection, addDoc, onSnapshot, doc, query,
    orderBy, writeBatch, getDocs
} from 'firebase/firestore';
import { useAuthStore } from '../store/useAuthStore';
import { canEditOrDeleteData } from '../utils/authUtils';
import toast from 'react-hot-toast';
import { GenericConfirmModal } from '../components/GenericConfirmModal';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

L.Marker.prototype.options.icon = L.icon({
    iconUrl: icon, shadowUrl: iconShadow,
    iconSize: [25, 41], iconAnchor: [12, 41]
});

// ========================
// Màu từ KML properties
// ========================
const getFeatureStyle = (feature: any) => {
    const p = feature?.properties || {};
    return {
        color: p['stroke'] || p['fill'] || '#3b82f6',
        weight: p['stroke-width'] ? Number(p['stroke-width']) : 2,
        opacity: p['stroke-opacity'] !== undefined ? Number(p['stroke-opacity']) : 1,
        fillColor: p['fill'] || p['stroke'] || '#3b82f6',
        fillOpacity: p['fill-opacity'] !== undefined ? Number(p['fill-opacity']) : 0.35,
    };
};

// ========================
// Auto fit bounds sau upload
// ========================
const FitBounds = ({ data }: { data: any }) => {
    const map = useMap();
    useEffect(() => {
        if (!data) return;
        try {
            const bounds = L.geoJSON(data).getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [30, 30] });
        } catch { /* ignore */ }
    }, [data, map]);
    return null;
};

// ========================
// Constants
// ========================
const CHUNK_SIZE_BYTES = 700_000; // 700 KB mỗi chunk (giới hạn an toàn Firestore)

// ========================
// Chia features thành chunks
// ========================
function chunkFeatures(features: any[]): any[][] {
    const chunks: any[][] = [];
    let current: any[] = [];
    let currentSize = 0;

    for (const f of features) {
        const fStr = JSON.stringify(f);
        if (currentSize + fStr.length > CHUNK_SIZE_BYTES && current.length > 0) {
            chunks.push(current);
            current = [];
            currentSize = 0;
        }
        current.push(f);
        currentSize += fStr.length;
    }
    if (current.length > 0) chunks.push(current);
    return chunks;
}

// ========================
// Interface
// ========================
interface MapLayer {
    id: string;
    name: string;
    fileName: string;
    uploadedAt: string;
    uploadedBy: string;
    sizeKB: number;
    totalChunks: number;
    totalFeatures: number;
    geoJsonType?: string;          // FeatureCollection type
}

export const MapViewer = () => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    if (isMobile) return <MobileWarning />;

    const { user } = useAuthStore();
    const centerPosition: [number, number] = [10.7769, 106.7009];
    const [layers, setLayers] = useState<MapLayer[]>([]);
    const [visibleIds, setVisibleIds] = useState<Set<string>>(new Set());
    const [loadedGeoData, setLoadedGeoData] = useState<Record<string, any>>({}); // layerId → geoJSON
    const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMsg, setUploadMsg] = useState('');
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [latestData, setLatestData] = useState<any>(null);

    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        layerId: string;
    }>({ isOpen: false, layerId: '' });

    // Load danh sách layer metadata từ Firestore
    useEffect(() => {
        const q = query(collection(db, 'map_layers'), orderBy('uploadedAt', 'desc'));
        const unsub = onSnapshot(q, (snap) => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as MapLayer));
            setLayers(list);
        });
        return () => unsub();
    }, []);

    // Load chunks của một layer khi bật hiển thị
    const loadLayerData = async (layerId: string) => {
        if (loadedGeoData[layerId] || loadingIds.has(layerId)) return;

        setLoadingIds(prev => new Set(prev).add(layerId));
        try {
            const chunksSnap = await getDocs(
                query(collection(db, 'map_layers', layerId, 'chunks'), orderBy('index'))
            );
            const allFeatures: any[] = [];
            chunksSnap.docs.forEach(d => {
                const data = d.data();
                // Support cả 2 format: featuresJson (mới) và features (cũ)
                const features = data.featuresJson
                    ? JSON.parse(data.featuresJson)
                    : (data.features || []);
                allFeatures.push(...features);
            });
            const geoData = { type: 'FeatureCollection', features: allFeatures };
            setLoadedGeoData(prev => ({ ...prev, [layerId]: geoData }));
        } catch (err) {
            console.error('Lỗi load layer chunks:', err);
        } finally {
            setLoadingIds(prev => { const n = new Set(prev); n.delete(layerId); return n; });
        }
    };

    // Bật/tắt layer + load dữ liệu khi cần
    const toggleVisible = async (id: string) => {
        const willShow = !visibleIds.has(id);
        setVisibleIds(prev => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id); else n.add(id);
            return n;
        });
        if (willShow) await loadLayerData(id);
    };

    // Upload file KMZ/KML -> Chunking -> Firestore
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        setIsUploading(true);
        setUploadMsg('Đang đọc file KMZ...');
        try {
            const geoData = await parseKMZ(file);
            const features: any[] = geoData.features || [];
            const totalFeatures = features.length;
            const totalSizeKB = Math.round(JSON.stringify(geoData).length / 1024);

            setUploadMsg(`Đang chia ${totalFeatures} đối tượng thành chunks...`);
            const chunks = chunkFeatures(features);

            setUploadMsg(`Đang lưu metadata lên Firestore...`);
            // 1. Tạo layer metadata doc
            const layerRef = await addDoc(collection(db, 'map_layers'), {
                name: file.name.replace(/\.[^/.]+$/, ''),
                fileName: file.name,
                uploadedAt: new Date().toISOString(),
                uploadedBy: user?.email || 'unknown',
                sizeKB: totalSizeKB,
                totalChunks: chunks.length,
                totalFeatures,
            });

            // 2. Lưu từng chunk vào subcollection chunks/
            for (let i = 0; i < chunks.length; i++) {
                setUploadMsg(`Đang tải chunk ${i + 1}/${chunks.length}...`);
                const batch = writeBatch(db);
                const chunkRef = doc(collection(db, 'map_layers', layerRef.id, 'chunks'));
                batch.set(chunkRef, {
                    index: i,
                    featuresJson: JSON.stringify(chunks[i]), // Stringify để tránh lỗi nested arrays Firestore
                });
                await batch.commit();
            }

            setLatestData(geoData);
            setUploadMsg('');
            toast.success('Đã tải lên bản đồ thành công');
            // Auto load và bật layer vừa upload
            setLoadedGeoData(prev => ({ ...prev, [layerRef.id]: geoData }));
            setVisibleIds(prev => new Set(prev).add(layerRef.id));
        } catch (err: any) {
            toast.error(`Lỗi: ${err?.message || 'Không thể đọc file KMZ'}`);
        } finally {
            setIsUploading(false);
            setUploadMsg('');
        }
    };

    // Mở modal xác nhận xoá
    const handleDeleteRequest = (id: string) => {
        setConfirmModal({ isOpen: true, layerId: id });
    };

    // Thực hiện xoá layer và tất cả chunks
    const handleDelete = async (id: string) => {
        const toastId = toast.loading('Đang xoá lớp dữ liệu...');
        try {
            // Xoá tất cả chunks trước
            const chunksSnap = await getDocs(collection(db, 'map_layers', id, 'chunks'));
            const batch = writeBatch(db);
            chunksSnap.docs.forEach(d => batch.delete(d.ref));
            batch.delete(doc(db, 'map_layers', id));
            await batch.commit();

            setVisibleIds(prev => { const n = new Set(prev); n.delete(id); return n; });
            setLoadedGeoData(prev => { const n = { ...prev }; delete n[id]; return n; });
            toast.success('Đã xoá lớp dữ liệu', { id: toastId });
        } catch (error) {
            toast.error('Lỗi khi xoá lớp dữ liệu', { id: toastId });
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] w-full flex flex-col bg-white">
            {/* Top Bar */}
            <div className="h-14 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0 shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                        <MapIcon className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800 leading-tight">Bản đồ Quy hoạch GIS</h1>
                        <p className="text-[11px] text-gray-500 font-medium">{layers.length} lớp đã lưu</p>
                    </div>
                </div>

                <label className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors cursor-pointer shadow-sm
                    ${isUploading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'}`}>
                    {isUploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" />{uploadMsg || 'Đang xử lý...'}</>
                        : <><Upload className="w-4 h-4" />Tải lên KMZ / KML</>}
                    <input type="file" accept=".kmz,.kml" className="hidden"
                        onChange={handleFileUpload} disabled={isUploading} />
                </label>
            </div>

            {/* Body */}
            <div className="flex-1 flex overflow-hidden relative z-0">

                {/* Sidebar */}
                <div className={`${sidebarOpen ? 'w-64' : 'w-0'} shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden transition-all duration-200`}>
                    <div className="flex items-center gap-1.5 px-4 py-3 border-b border-gray-100 bg-gray-50">
                        <Layers className="w-4 h-4 text-gray-500" />
                        <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Danh sách Lớp</span>
                    </div>
                    <div className="overflow-y-auto flex-1">
                        {layers.length === 0 ? (
                            <div className="p-4 text-xs text-gray-400 text-center mt-4">
                                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-gray-300" />
                                Chưa có lớp nào. Hãy tải lên file KMZ/KML.
                            </div>
                        ) : layers.map(layer => {
                            const isVisible = visibleIds.has(layer.id);
                            const isLoading = loadingIds.has(layer.id);
                            return (
                                <div key={layer.id} className="flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 group">
                                    <button
                                        onClick={() => toggleVisible(layer.id)}
                                        disabled={isLoading}
                                        title={isVisible ? 'Ẩn lớp' : 'Hiện lớp'}
                                        className={`shrink-0 ${isLoading ? 'text-gray-300 animate-pulse' : isVisible ? 'text-emerald-500' : 'text-gray-300'}`}
                                    >
                                        {isLoading
                                            ? <Loader2 className="w-4 h-4 animate-spin" />
                                            : isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                    </button>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-gray-800 truncate">{layer.name}</p>
                                        <p className="text-[10px] text-gray-400">
                                            {layer.sizeKB} KB • {layer.totalFeatures} đối tượng • {layer.totalChunks} phần
                                        </p>
                                    </div>
                                    {canEditOrDeleteData(user, layer.uploadedBy) && (
                                        <button
                                            onClick={() => handleDeleteRequest(layer.id)}
                                            className="shrink-0 text-gray-200 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Toggle sidebar */}
                <button
                    onClick={() => setSidebarOpen(v => !v)}
                    className="absolute z-[500] top-1/2 -translate-y-1/2 bg-white border border-gray-200 shadow rounded-r-md p-1 hover:bg-gray-50 transition-all"
                    style={{ left: sidebarOpen ? '256px' : '0px' }}
                >
                    {sidebarOpen ? <ChevronLeft className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
                </button>

                {/* Map */}
                <div className="flex-1 h-full relative">
                    <MapContainer center={centerPosition} zoom={12} scrollWheelZoom className="w-full h-full" zoomControl>
                        <LayersControl position="topright">
                            <LayersControl.BaseLayer checked name="Google Vệ tinh">
                                <TileLayer attribution='&copy; Google Maps' url="https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}" maxZoom={21} />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Google Vệ tinh + Đường">
                                <TileLayer attribution='&copy; Google Maps' url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}" maxZoom={21} />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="Google Đường phố">
                                <TileLayer attribution='&copy; Google Maps' url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" maxZoom={21} />
                            </LayersControl.BaseLayer>
                            <LayersControl.BaseLayer name="OpenStreetMap">
                                <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
                            </LayersControl.BaseLayer>

                            {/* Render các layer đang bật & đã load xong */}
                            {layers
                                .filter(l => visibleIds.has(l.id) && loadedGeoData[l.id])
                                .map(layer => (
                                    <LayersControl.Overlay checked key={layer.id} name={layer.name}>
                                        <GeoJSON
                                            key={layer.id + '_geo'}
                                            data={loadedGeoData[layer.id]}
                                            style={getFeatureStyle}
                                            onEachFeature={(feature, lyr) => {
                                                const p = feature.properties || {};
                                                const lines = [
                                                    p.name && `<b>${p.name}</b>`,
                                                    p.description && `<span>${p.description}</span>`,
                                                ].filter(Boolean);
                                                if (lines.length) lyr.bindPopup(lines.join('<br/>'), { maxWidth: 280 });
                                            }}
                                        />
                                    </LayersControl.Overlay>
                                ))}
                        </LayersControl>

                        {latestData && <FitBounds data={latestData} />}
                    </MapContainer>
                </div>
            </div>

            <GenericConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                onConfirm={() => handleDelete(confirmModal.layerId)}
                title="Xác nhận xoá bản đồ"
                message="Bạn có chắc chắn muốn xoá lớp dữ liệu này khỏi hệ thống? Tuyệt đối không thể hoàn tác nếu đã xoá!"
                type="danger"
                confirmText="Chắc chắn Xoá"
            />
        </div>
    );
};
