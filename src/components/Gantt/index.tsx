import React, { useState, useEffect, useMemo } from 'react';
import { GanttTask, ViewMode } from './types';
import { GanttSidebar } from './GanttSidebar';
import { GanttTimeline } from './GanttTimeline';
import { getVisibleTasks } from './utils';
import { TaskModal } from './TaskModal';
import { TaskDocumentsModal } from './TaskDocumentsModal';
import { ganttService } from '../../services/ganttService';
import toast from 'react-hot-toast';
import { Loader2, Edit2, Plus, FileText } from 'lucide-react';
import { addDays, subDays, startOfMonth, endOfMonth, startOfWeek, endOfWeek, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from 'date-fns';

interface GanttChartProps {
    projectId: string;
    tasks?: GanttTask[]; // Keep for backward compatibility or initial seed
}

export const GanttChart: React.FC<GanttChartProps> = ({ projectId, tasks: initialTasks }) => {
    const [viewMode, setViewMode] = useState<ViewMode>('Month');
    const [flatTasks, setFlatTasks] = useState<GanttTask[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(true);

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<GanttTask | null>(null);
    const [addingParentId, setAddingParentId] = useState<string | null>(null);
    const [selectedTaskForDocs, setSelectedTaskForDocs] = useState<GanttTask | null>(null);

    const fetchTasks = async () => {
        try {
            setIsLoading(true);
            const data = await ganttService.getTasksByProject(projectId);
            setFlatTasks(data);
            
            // Auto expand top level nodes initially if empty
            if (expandedIds.size === 0 && data.length > 0) {
                const initialExpanded = new Set<string>();
                data.filter(t => !t.parentId).forEach(t => initialExpanded.add(t.id));
                setExpandedIds(initialExpanded);
            }
        } catch (error) {
            console.error(error);
            toast.error('Lỗi khi tải dữ liệu sơ đồ Gantt');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // Fetch tasks on mount or when projectId changes
        if (projectId) {
            fetchTasks();
        }
    }, [projectId]);

    const visibleTasks = useMemo(() => {
        return getVisibleTasks(flatTasks, expandedIds);
    }, [flatTasks, expandedIds]);

    const handleToggleExpand = (taskId: string) => {
        const next = new Set(expandedIds);
        if (next.has(taskId)) {
            next.delete(taskId);
        } else {
            next.add(taskId);
        }
        setExpandedIds(next);
    };

    const handleOpenAddTask = (parentId: string | null = null) => {
        setEditingTask(null);
        setAddingParentId(parentId);
        setIsModalOpen(true);
    };

    const handleOpenEditTask = (task: GanttTask) => {
        setEditingTask(task);
        setAddingParentId(null);
        setIsModalOpen(true);
    };

    const handleSaveTask = async (taskData: Partial<GanttTask>) => {
        try {
            const isNew = !taskData.id;
            const finalTask: GanttTask = {
                id: taskData.id || crypto.randomUUID(),
                projectId,
                name: taskData.name!,
                parentId: taskData.parentId || null,
                plannedStartDate: taskData.plannedStartDate!,
                plannedEndDate: taskData.plannedEndDate!,
                actualStartDate: taskData.actualStartDate || null,
                actualEndDate: taskData.actualEndDate || null,
                linkedDocumentIds: taskData.linkedDocumentIds || [],
                order: taskData.order || (isNew ? flatTasks.length : 0),
            };

            await ganttService.saveTask(finalTask);
            
            // Optimistic update
            if (isNew) {
                setFlatTasks([...flatTasks, finalTask]);
                if (finalTask.parentId) {
                    setExpandedIds(prev => new Set(prev).add(finalTask.parentId!));
                }
            } else {
                setFlatTasks(flatTasks.map(t => t.id === finalTask.id ? finalTask : t));
            }

            toast.success(isNew ? 'Thêm công việc thành công' : 'Cập nhật công việc thành công');
            setIsModalOpen(false);
        } catch (error) {
            toast.error('Có lỗi xảy ra khi lưu công việc');
        }
    };

    const handleUpdateTaskDates = async (taskData: GanttTask) => {
        try {
            await ganttService.saveTask(taskData);
            setFlatTasks(flatTasks.map(t => t.id === taskData.id ? taskData : t));
        } catch (error) {
            toast.error('Có lỗi xảy ra khi cập nhật ngày');
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        try {
            const children = flatTasks.filter(t => t.parentId === taskId);
            if (children.length > 0) {
                toast.error('Không thể xóa công việc đang có công việc con!');
                return;
            }

            await ganttService.deleteTask(taskId);
            setFlatTasks(flatTasks.filter(t => t.id !== taskId));
            toast.success('Xóa công việc thành công');
            setIsModalOpen(false);
        } catch (error) {
            toast.error('Có lỗi xảy ra khi xóa công việc');
        }
    };

    // Compute timeline date range based on tasks and viewMode
    const { timelineStartDate, timelineEndDate, pixelsPerDay } = useMemo(() => {
        const allDates: Date[] = [];
        flatTasks.forEach(t => {
            if (t.plannedStartDate) allDates.push(t.plannedStartDate instanceof Date ? t.plannedStartDate : new Date(t.plannedStartDate));
            if (t.plannedEndDate) allDates.push(t.plannedEndDate instanceof Date ? t.plannedEndDate : new Date(t.plannedEndDate));
            if (t.actualStartDate) allDates.push(t.actualStartDate instanceof Date ? t.actualStartDate : new Date(t.actualStartDate));
            if (t.actualEndDate) allDates.push(t.actualEndDate instanceof Date ? t.actualEndDate : new Date(t.actualEndDate));
        });

        let minDate = allDates.length > 0 ? new Date(Math.min(...allDates.filter(d => !isNaN(d.getTime())).map(d => d.getTime()))) : new Date();
        let maxDate = allDates.length > 0 ? new Date(Math.max(...allDates.filter(d => !isNaN(d.getTime())).map(d => d.getTime()))) : addDays(new Date(), 90);

        // Add padding based on view mode
        if (viewMode === 'Week') {
            minDate = startOfWeek(subDays(minDate, 7), { weekStartsOn: 1 });
            maxDate = endOfWeek(addDays(maxDate, 7), { weekStartsOn: 1 });
        } else if (viewMode === 'Month') {
            minDate = startOfMonth(subDays(minDate, 15));
            maxDate = endOfMonth(addDays(maxDate, 15));
        } else if (viewMode === 'Quarter') {
            minDate = startOfQuarter(subDays(minDate, 30));
            maxDate = endOfQuarter(addDays(maxDate, 30));
        } else {
            minDate = startOfYear(minDate);
            maxDate = endOfYear(maxDate);
        }

        // Pixels per day based on view mode
        let ppd = 4;
        if (viewMode === 'Week') ppd = 20;
        else if (viewMode === 'Month') ppd = 6;
        else if (viewMode === 'Quarter') ppd = 3;
        else ppd = 1.5;

        return { timelineStartDate: minDate, timelineEndDate: maxDate, pixelsPerDay: ppd };
    }, [flatTasks, viewMode]);

    return (
        <div className="flex flex-col h-full bg-white rounded-lg border shadow-sm overflow-hidden">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-gray-800">Sơ đồ Gantt Dự án</h2>
                    {isLoading && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex bg-white rounded-md border p-1 shadow-sm">
                        {(['Week', 'Month', 'Quarter', 'Year'] as ViewMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                className={`px-3 py-1 text-sm font-medium rounded-sm transition-colors ${
                                    viewMode === mode ? 'bg-indigo-100 text-indigo-700' : 'text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {mode === 'Week' ? 'Tuần' : mode === 'Month' ? 'Tháng' : mode === 'Quarter' ? 'Quý' : 'Năm'}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Mobile Card View for Gantt */}
            <div className="md:hidden flex-1 overflow-auto p-3 space-y-2">
                {visibleTasks.length === 0 && !isLoading && (
                    <div className="p-8 text-center text-gray-500">Chưa có công việc nào.</div>
                )}
                {visibleTasks.map((task) => {
                    const isExpanded = expandedIds.has(task.id);
                    const pStart = task.plannedStartDate instanceof Date ? task.plannedStartDate : new Date(task.plannedStartDate);
                    const pEnd = task.plannedEndDate instanceof Date ? task.plannedEndDate : new Date(task.plannedEndDate);
                    const aStart = task.actualStartDate ? (task.actualStartDate instanceof Date ? task.actualStartDate : new Date(task.actualStartDate)) : null;
                    const aEnd = task.actualEndDate ? (task.actualEndDate instanceof Date ? task.actualEndDate : new Date(task.actualEndDate)) : null;
                    const totalDays = Math.max(1, Math.ceil((pEnd.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24)));
                    const now = new Date();
                    const elapsed = Math.ceil((now.getTime() - pStart.getTime()) / (1000 * 60 * 60 * 24));
                    const progress = aEnd ? 100 : Math.min(100, Math.max(0, Math.round((elapsed / totalDays) * 100)));
                    const formatD = (d: Date) => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;

                    return (
                        <div key={task.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-2" style={{ marginLeft: `${task.depth * 0.75}rem` }}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    {task.hasChildren && (
                                        <button onClick={() => handleToggleExpand(task.id)} className="p-1 text-gray-400 hover:text-indigo-600 flex-shrink-0">
                                            {isExpanded ? <span className="text-xs">▼</span> : <span className="text-xs">▶</span>}
                                        </button>
                                    )}
                                    <span className={`text-sm font-medium text-gray-800 truncate ${task.hasChildren ? 'font-bold' : ''}`}>{task.name}</span>
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    <button onClick={() => handleOpenEditTask(task)} className="p-1.5 text-gray-400 hover:text-indigo-600 bg-gray-50 rounded-lg"><Edit2 className="w-3.5 h-3.5" /></button>
                                    <button onClick={() => handleOpenAddTask(task.id)} className="p-1.5 text-gray-400 hover:text-green-600 bg-gray-50 rounded-lg"><Plus className="w-3.5 h-3.5" /></button>
                                    {task.linkedDocumentIds?.length > 0 && (
                                        <button onClick={() => setSelectedTaskForDocs(task)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 rounded-lg"><FileText className="w-3.5 h-3.5" /></button>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500">
                                <span>KH: {formatD(pStart)} → {formatD(pEnd)}</span>
                                {aStart && <span className="text-indigo-600">| TT: {formatD(aStart)}{aEnd ? ` → ${formatD(aEnd)}` : ''}</span>}
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                                <div className={`h-2 rounded-full transition-all ${aEnd ? 'bg-green-500' : progress > 80 ? 'bg-amber-500' : 'bg-indigo-500'}`} style={{ width: `${progress}%` }} />
                            </div>
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-gray-400">{totalDays} ngày</span>
                                <span className={`font-bold ${aEnd ? 'text-green-600' : 'text-indigo-600'}`}>{progress}%</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Desktop: Main Gantt Area (Sidebar + Timeline) */}
            <div className="hidden md:flex flex-1 overflow-hidden relative group/gantt">
                 <GanttSidebar 
                    tasks={visibleTasks} 
                    expandedIds={expandedIds}
                    onToggleExpand={handleToggleExpand} 
                    onAddTask={handleOpenAddTask}
                    onEditTask={handleOpenEditTask}
                />
                 <GanttTimeline 
                    tasks={visibleTasks} 
                    startDate={timelineStartDate}
                    endDate={timelineEndDate}
                    viewMode={viewMode}
                    expandedTaskIds={expandedIds}
                    pixelsPerDay={pixelsPerDay}
                    onUpdateTask={handleUpdateTaskDates}
                    onDocumentClick={setSelectedTaskForDocs}
                />
            </div>

            {/* Task Modal */}
            <TaskModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveTask}
                onDelete={editingTask ? handleDeleteTask : undefined}
                task={editingTask}
                parentId={addingParentId}
            />

            {/* Document List Modal */}
            <TaskDocumentsModal 
                isOpen={!!selectedTaskForDocs}
                onClose={() => setSelectedTaskForDocs(null)}
                task={selectedTaskForDocs}
            />
        </div>
    );
};
