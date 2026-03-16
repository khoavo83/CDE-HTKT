import React, { useMemo } from 'react';
import { GanttTask, ViewMode } from './types';
import { VisibleGanttTask } from './utils';
import { 
    startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, 
    startOfQuarter, endOfQuarter, format, addDays, getDaysInMonth, 
    differenceInDays, isSameMonth
} from 'date-fns';
import { vi } from 'date-fns/locale';
import { GanttBar } from './GanttBar';

interface GanttTimelineProps {
    tasks: GanttTask[];
    startDate: Date;
    endDate: Date;
    viewMode: ViewMode;
    expandedTaskIds: Set<string>;
    pixelsPerDay: number;
    onUpdateTask?: (task: GanttTask) => void;
    onDocumentClick?: (task: GanttTask) => void;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
    tasks, startDate, endDate, viewMode, expandedTaskIds, pixelsPerDay, onUpdateTask, onDocumentClick
}) => {
    // 2. Generate columns based on viewMode
    const columns = useMemo(() => {
        const cols = [];
        let currentDate = startDate;

        while (currentDate <= endDate) {
            if (viewMode === 'Week') {
                const e = endOfWeek(currentDate, { weekStartsOn: 1 });
                cols.push({ start: currentDate, end: e > endDate ? endDate : e, label: `Tuần ${format(currentDate, 'ww')}` });
                currentDate = addDays(e, 1);
            } else if (viewMode === 'Month') {
                const e = endOfMonth(currentDate);
                cols.push({ start: currentDate, end: e > endDate ? endDate : e, label: format(currentDate, 'MM/yyyy') });
                currentDate = addDays(e, 1);
            } else if (viewMode === 'Quarter') {
                const e = endOfQuarter(currentDate);
                cols.push({ start: currentDate, end: e > endDate ? endDate : e, label: `Q${format(currentDate, 'Q/yyyy')}` });
                currentDate = addDays(e, 1);
            } else if (viewMode === 'Year') {
                const e = endOfYear(currentDate);
                cols.push({ start: currentDate, end: e > endDate ? endDate : e, label: format(currentDate, 'yyyy') });
                currentDate = addDays(e, 1);
            }
        }
        return cols;
    }, [startDate, endDate, viewMode]);

    const totalDaysInTimeline = differenceInDays(endDate, startDate) + 1;
    // Set a minimum width per day to ensure bars are visible, adjust based on viewMode
    const timelineWidth = totalDaysInTimeline * pixelsPerDay;

    return (
        <div className="flex-1 overflow-auto bg-gray-50 relative hide-scrollbar">
            <div style={{ width: Math.max(timelineWidth, 800) }} className="relative min-h-full">

                {/* Headers */}
                <div className="h-12 border-b bg-white sticky top-0 z-20 flex">
                    {columns.map((col, idx) => {
                        const daysInCol = differenceInDays(col.end, col.start) + 1;
                        const widthPct = (daysInCol / totalDaysInTimeline) * 100;
                        return (
                            <div
                                key={idx}
                                className="border-r flex items-center justify-center text-[10px] md:text-xs font-semibold text-gray-600 bg-gray-50 shrink-0"
                                style={{ 
                                    width: `${widthPct}%`,
                                    minWidth: viewMode === 'Month' ? '120px' : '60px'
                                }}
                            >
                                {col.label}
                            </div>
                        );
                    })}
                </div>

                {/* Grid Background Lines */}
                <div className="absolute top-12 bottom-0 left-0 right-0 flex pointer-events-none z-0">
                    {columns.map((col, idx) => {
                         const daysInCol = differenceInDays(col.end, col.start) + 1;
                         const widthPct = (daysInCol / totalDaysInTimeline) * 100;
                         return (
                             <div key={`line-${idx}`} className="border-r border-gray-200 h-full" style={{ width: `${widthPct}%` }} />
                         );
                    })}
                </div>

                {/* Task Rows Placeholder */}
                <div className="relative z-10 w-full pt-2">
                    {tasks.map((task, idx) => {
                        return (
                            <div key={task.id} className="h-10 w-full relative group hover:bg-black/5 flex items-center border-b border-transparent hover:border-gray-200 transition-colors">
                                {/* Task Row content (Gantt Bar) */}
                                <div className="relative h-full flex-1">
                                    <GanttBar
                                        task={task}
                                        timelineStartDate={startDate}
                                        totalDaysInTimeline={totalDaysInTimeline}
                                        pixelsPerDay={pixelsPerDay}
                                        onUpdateTask={onUpdateTask}
                                        onDocumentClick={onDocumentClick}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
};
