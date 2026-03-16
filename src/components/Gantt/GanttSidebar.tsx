import React, { useState } from 'react';
import { GanttTask } from './types';
import { VisibleGanttTask } from './utils';
import { ChevronRight, ChevronDown, AlignLeft, Plus, Edit2, PlusCircle } from 'lucide-react';

interface GanttSidebarProps {
    tasks: VisibleGanttTask[];
    expandedIds: Set<string>;
    onToggleExpand: (taskId: string) => void;
    onAddTask: (parentId?: string | null) => void;
    onEditTask: (task: GanttTask) => void;
}

export const GanttSidebar: React.FC<GanttSidebarProps> = ({ tasks, expandedIds, onToggleExpand, onAddTask, onEditTask }) => {
    const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);

    const renderTaskRow = (task: VisibleGanttTask) => {
        const isHovered = hoveredTaskId === task.id;
        const isExpanded = expandedIds.has(task.id);
        
        return (
            <div 
                key={task.id}
                className="flex items-center h-10 border-b hover:bg-indigo-50 transition-colors px-2 cursor-pointer group relative"
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
                <div className="flex-1 truncate text-sm font-medium text-gray-700 select-none" title={task.name}>
                    {task.name}
                </div>

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
