import React, { useState } from 'react';
import { GanttTask } from './types';
import { VisibleGanttTask } from './utils';
import { ChevronRight, ChevronDown, AlignLeft, Plus, Edit2, PlusCircle, CheckCircle2, Circle } from 'lucide-react';
import { isAfter, isBefore, differenceInDays } from 'date-fns';

interface GanttSidebarProps {
    tasks: VisibleGanttTask[];
    expandedIds: Set<string>;
    onToggleExpand: (taskId: string) => void;
    onAddTask: (parentId?: string | null) => void;
    onEditTask: (task: GanttTask) => void;
    onToggleComplete: (task: GanttTask) => void;
}

export const GanttSidebar: React.FC<GanttSidebarProps> = ({ tasks, expandedIds, onToggleExpand, onAddTask, onEditTask, onToggleComplete }) => {
    const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

    const renderTaskRow = (task: VisibleGanttTask) => {
        const isHovered = hoveredTaskId === task.id;
        const isExpanded = expandedIds.has(task.id);
        const pEnd = task.plannedEndDate instanceof Date ? task.plannedEndDate : new Date(task.plannedEndDate);
        const aEnd = task.actualEndDate ? (task.actualEndDate instanceof Date ? task.actualEndDate : new Date(task.actualEndDate)) : null;
        let delayDays = 0;
        let earlyDays = 0;
        if (task.isCompleted || aEnd) {
             if (aEnd && isAfter(aEnd, pEnd)) {
                 delayDays = differenceInDays(aEnd, pEnd);
             } else if (aEnd && isBefore(aEnd, pEnd)) {
                 earlyDays = differenceInDays(pEnd, aEnd);
             }
        } else {
             const today = new Date();
             if (isAfter(today, pEnd)) delayDays = differenceInDays(today, pEnd);
        }

        return (
            <div 
                key={task.id}
                className={`flex items-center h-10 border-b hover:bg-indigo-50 transition-colors px-2 cursor-pointer group relative ${task.isCompleted ? 'bg-green-50/30' : ''}`}
                style={{ paddingLeft: `${task.depth * 1.5 + 0.5}rem` }}
                onMouseEnter={() => setHoveredTaskId(task.id)}
                onMouseLeave={() => setHoveredTaskId(null)}
                onClick={(e) => {
                    // Prevent click if clicking on actions
                    if ((e.target as HTMLElement).closest('.task-actions')) return;
                    task.hasChildren && onToggleExpand(task.id);
                }}
            >
                <div className="w-5 flex-shrink-0 flex justify-center mr-1 text-gray-400 hover:text-indigo-600 transition-colors">
                    {task.hasChildren ? (
                        isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
                    ) : (
                        <AlignLeft size={14} className="opacity-50" />
                    )}
                </div>
                
                <button 
                    onClick={(e) => { e.stopPropagation(); onToggleComplete(task); }}
                    className={`task-actions mr-2 flex-shrink-0 transition-colors ${task.isCompleted ? 'text-green-500' : 'text-gray-300 hover:text-green-500'}`}
                    title={task.isCompleted ? "Đánh dấu chưa hoàn thành" : "Đánh dấu hoàn thành"}
                >
                    {task.isCompleted ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </button>

                <div 
                    className={`flex-1 truncate text-sm select-none ${task.isCompleted ? 'text-green-700 font-medium' : (task.depth === 0 ? 'font-bold text-gray-800' : task.depth === 1 ? 'font-semibold text-gray-700' : 'font-medium text-gray-600')}`} 
                    title={task.name}
                >
                    <span>{task.name}</span>
                </div>
                
                {/* Delay/Early Badges */}
                {task.isCompleted || aEnd ? (
                    <>
                        {delayDays > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-orange-100 text-orange-600 whitespace-nowrap" title={`Hoàn thành trễ ${delayDays} ngày`}>
                                Trễ {delayDays}N
                            </span>
                        )}
                        {earlyDays > 0 && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600 whitespace-nowrap" title={`Hoàn thành sớm ${earlyDays} ngày so với kế hoạch`}>
                                Sớm {earlyDays}N
                            </span>
                        )}
                    </>
                ) : (
                    <>
                        {delayDays > 0 ? (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-600 whitespace-nowrap" title={`${delayDays} ngày trễ so với kế hoạch`}>
                                Trễ {delayDays}N
                            </span>
                        ) : (
                             !task.hasChildren && (
                                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-400 whitespace-nowrap italic">
                                    Chưa có VB
                                </span>
                             )
                        )}
                    </>
                )}

                {/* Action buttons (shown on hover) */}
                {isHovered && (
                    <div className="task-actions absolute right-2 flex items-center gap-1 bg-white/90 px-1 rounded shadow-sm border border-indigo-100">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onAddTask(task.id); }}
                            className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                            title="Thêm công việc con"
                        >
                            <PlusCircle size={14} />
                        </button>
                        <button 
                            onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
                            className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Sửa công việc"
                        >
                            <Edit2 size={13} />
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-80 border-r flex-shrink-0 flex flex-col bg-white z-10 shadow-[2px_0_8px_rgba(0,0,0,0.02)]">
            <div className="h-12 border-b flex items-center justify-between px-4 bg-gray-50 flex-shrink-0">
                <span className="font-semibold text-sm text-gray-700 uppercase tracking-wide">
                    Hạng mục công việc
                </span>
                <button 
                    onClick={() => onAddTask(null)}
                    className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-md transition-colors flex items-center gap-1"
                    title="Thêm công việc gốc"
                >
                    <Plus size={16} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar pb-20">
                {tasks.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500 italic">
                        Chưa có công việc nào. Hãy thêm công việc mới.
                    </div>
                ) : (
                    tasks.map(task => renderTaskRow(task))
                )}
            </div>
        </div>
    );
};
