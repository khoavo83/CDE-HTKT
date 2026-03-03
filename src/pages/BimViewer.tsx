import React, { useEffect, useRef, useState } from 'react';
import * as OBC from 'openbim-components';
import * as THREE from 'three';
import { Box, Loader2, UploadCloud, Scissors, Trash2 } from 'lucide-react';

import toast from 'react-hot-toast';

export const BimViewer = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [viewerRef, setViewerRef] = useState<OBC.Components | null>(null);
    const [clipperRef, setClipperRef] = useState<any>(null);
    const [isClipping, setIsClipping] = useState(false);

    useEffect(() => {
        if (!containerRef.current) return;

        // Initialize OpenBIM Components Viewer
        const components = new OBC.Components();
        components.scene = new OBC.SimpleScene(components);
        components.renderer = new OBC.PostproductionRenderer(components, containerRef.current);
        components.camera = new OBC.SimpleCamera(components);
        components.raycaster = new OBC.SimpleRaycaster(components);
        components.init();

        // Setup Scene Background
        (components.scene as OBC.SimpleScene).setup();
        const scene = components.scene.get();
        scene.background = new THREE.Color(0xf1f5f9); // slate-50

        // Tools
        components.tools.get(OBC.FragmentManager);
        const ifcLoader = new OBC.FragmentIfcLoader(components);

        const highlighter = new OBC.FragmentHighlighter(components);
        highlighter.setup();

        const clipper = new OBC.SimpleClipper(components);
        // Cần tắt bật qua giao diện
        clipper.enabled = false;
        setClipperRef(clipper);

        // Tạo mặt cắt khi click đúp
        if (containerRef.current) {
            containerRef.current.ondblclick = () => {
                if (clipper.enabled) clipper.create();
            };
        }

        ifcLoader.settings.wasm = {
            path: 'https://unpkg.com/web-ifc@0.0.44/',
            absolute: true,
        };

        components.scene.get().add(new THREE.AmbientLight(0xffffff, 0.5));
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(100, 100, 100);
        components.scene.get().add(directionalLight);

        setViewerRef(components);

        return () => {
            components.dispose();
        };
    }, []);

    const loadIfcFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !viewerRef) return;
        const file = event.target.files[0];
        setIsLoading(true);

        try {
            const buffer = await file.arrayBuffer();
            const data = new Uint8Array(buffer);

            const ifcLoader = viewerRef.tools.get(OBC.FragmentIfcLoader);
            await ifcLoader.load(data);

        } catch (error) {
            console.error("Lỗi parse file IFC:", error);
            toast.error("Lỗi khi load tệp IFC 3D.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-4rem)] bg-gray-50 p-4">
            <div className="bg-white p-4 shrink-0 rounded-t-xl shadow-sm border border-b-0 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Box className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-gray-800">Không gian Mô hình BIM 3D</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Hỗ trợ định dạng IFC trực tiếp từ Google Drive</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    {/* Các công cụ BIM */}
                    {viewerRef && (
                        <div className="flex items-center gap-2 mr-4 border-r pr-4">
                            <button
                                onClick={() => {
                                    if (clipperRef) {
                                        clipperRef.enabled = !isClipping;
                                        setIsClipping(!isClipping);
                                    }
                                }}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${isClipping ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'text-gray-600 hover:bg-gray-100'}`}
                                title="Bật/Tắt chế độ Cắt mặt phẳng"
                            >
                                <Scissors className="w-4 h-4" /> Bật Cắt {isClipping ? 'ON' : 'OFF'}
                            </button>
                            <button
                                onClick={() => clipperRef?.deleteAll()}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                                title="Xoá toàn bộ mặt cắt"
                            >
                                <Trash2 className="w-4 h-4" /> Xoá Cắt
                            </button>
                        </div>
                    )}

                    <label className="cursor-pointer bg-primary-600 border border-transparent text-white hover:bg-primary-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm">
                        <UploadCloud className="w-4 h-4" /> Nạp file mô hình IFC
                        <input type="file" accept=".ifc" className="hidden" onChange={loadIfcFile} />
                    </label>
                </div>
            </div>

            <div className="relative flex-1 bg-white rounded-b-xl border shadow-inner overflow-hidden">
                {isLoading && (
                    <div className="absolute inset-0 z-50 bg-white/60 backdrop-blur-sm flex flex-col items-center justify-center">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                        <p className="text-indigo-900 font-medium">Đang dựng hình 3D không gian...</p>
                    </div>
                )}
                {/* 3D Canvas Container */}
                <div ref={containerRef} className="w-full h-full outline-none" />

                <div className="absolute bottom-4 left-4 bg-white/90 p-3 rounded-lg shadow border backdrop-blur text-xs text-gray-600 space-y-1">
                    {/* Tooltip Hướng dẫn */}
                    <p className="font-semibold text-gray-800 mb-2">Thao tác Không gian:</p>
                    <p>• <span className="font-medium">Chuột trái:</span> Xoay (Orbit)</p>
                    <p>• <span className="font-medium">Chuột phải:</span> Trượt (Pan)</p>
                    <p>• <span className="font-medium">Con lăn chuột:</span> Phóng to/Thu nhỏ (Zoom)</p>
                    <p>• <span className="font-medium">Click cấu kiện:</span> Chọn để tô sáng / Đo bóc</p>
                    <p className="text-indigo-600 mt-2 font-medium border-t pt-2">Bật Cắt (ON) ➔ Double-click Cấu kiện để tạo Mặt Cắt ngang.</p>
                </div>
            </div>
        </div>
    );
};
