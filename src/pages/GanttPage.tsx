import React from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { GanttChart } from '../components/Gantt';
import { ArrowLeft } from 'lucide-react';

export const GanttPage = () => {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();

    if (!projectId) {
        return <Navigate to="/projects" replace />;
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 p-6 space-y-4">
            <div className="flex items-center gap-4 shrink-0">
                <button
                    onClick={() => navigate('/projects')}
                    className="p-2 bg-white rounded-full shadow-sm text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                    title="Quay lại Quản lý Dự án"
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Chi tiết Tiến độ Dự án</h1>
                    <p className="text-sm text-gray-500 mt-1">Quản lý và theo dõi sơ đồ Gantt cho dự án đã chọn</p>
                </div>
            </div>
            
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-0">
                <GanttChart projectId={projectId} />
            </div>
        </div>
    );
};
