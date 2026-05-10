import React, { useEffect } from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import { GanttChart } from '../components/Gantt';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';

export const GanttPage = () => {
    const { projectId } = useParams<{ projectId: string }>();
    const navigate = useNavigate();

    useEffect(() => {
        if (!projectId) {
            toast('Vui lòng chọn Dự án để xem Sơ đồ Gantt', {
                icon: '📊',
                duration: 4000
            });
            navigate('/projects', { replace: true });
        }
    }, [projectId, navigate]);

    if (!projectId) {
        return <div className="h-full flex items-center justify-center text-gray-500">Đang chuyển hướng...</div>;
    }

    return (
        <div className="h-full flex flex-col bg-gray-50 p-4 gap-4">
            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-0">
                <GanttChart projectId={projectId} />
            </div>
            
            <div className="flex items-center justify-end shrink-0">
                <button
                    onClick={() => navigate('/projects')}
                    className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm border border-gray-200 text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-all font-medium"
                    title="Quay lại Quản lý Dự án"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Quay lại Quản lý Dự án
                </button>
            </div>
        </div>
    );
};
