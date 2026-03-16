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
    timelineRef?: React.RefObject<HTMLDivElement>;
    tasks: VisibleGanttTask[];
    startDate: Date;
    endDate: Date;
    viewMode: ViewMode;
    expandedTaskIds: Set<string>;
    pixelsPerDay: number;
    onUpdateTask?: (task: GanttTask) => void;
    onDocumentClick?: (task: GanttTask) => void;
}

export const GanttTimeline: React.FC<GanttTimelineProps> = ({
    timelineRef, tasks, startDate, endDate, viewMode, expandedTaskIds, pixelsPerDay, onUpdateTask, onDocumentClick
}) => {
    // 2. Generate columns based on viewMode
    const columns = useMemo(() => {
        const cols = [];
        let currentDate = startDate;

        while (currentDate <= endDate) {
            if (viewMode === 'Week') {
                const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                const e = currentDate;
                cols.push({ 
                    start: currentDate, 
                    end: e > endDate ? endDate : e, 
                    labelTop: dayNames[currentDate.getDay()],
                    labelBottom: format(currentDate, 'dd/MM')
                });
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

    const today = new Date();
    const showToday = today >= startDate && today <= endDate;
    const todayLeft = differenceInDays(today, startDate) * pixelsPerDay;

    return (
        <div ref={timelineRef} className="flex-1 overflow-auto bg-gray-50 relative hide-scrollbar">
            <div style={{ width: Math.max(timelineWidth, 800) }} className="relative min-h-full">

                {/* Headers */}
                <div className="h-12 border-b bg-white sticky top-0 z-20 flex">
                    {columns.map((col, idx) => {
                        const daysInCol = differenceInDays(col.end, col.start) + 1;
                        const colWidth = daysInCol * pixelsPerDay;
                        return (
                            <div
                                key={idx}
                                className="border-r flex items-center justify-center text-[10px] md:text-xs font-semibold text-gray-600 bg-gray-50 shrink-0 overflow-hidden"
                                style={{ 
                                    width: `${colWidth}px`,
                                    minWidth: viewMode === 'Month' ? '120px' : '60px'
                                }}
                            >
                                {col.labelTop ? (
                                    <div className="flex flex-col items-center justify-center leading-tight">
                                        <span className="text-[11px] font-bold text-gray-700">{col.labelTop}</span>
                                        <span className="text-[9px] font-normal text-gray-500">{col.labelBottom}</span>
                                    </div>
                                ) : (
                                    <span className="truncate px-1">{col.label}</span>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Grid Background Lines */}
                <div className="absolute top-12 bottom-0 left-0 right-0 flex pointer-events-none z-0">
                    {columns.map((col, idx) => {
                         const daysInCol = differenceInDays(col.end, col.start) + 1;
                         const colWidth = daysInCol * pixelsPerDay;
                         return (
                             <div key={`line-${idx}`} className="border-r border-gray-100 h-full shrink-0" style={{ width: `${colWidth}px` }} />
                         );
                    })}
                </div>

                {/* Today Line */}
                {showToday && (
                    <div 
                        className="absolute top-12 bottom-0 w-px bg-red-400 z-20 pointer-events-none"
                        style={{ left: `${todayLeft}px` }}
                    >
                        <div className="absolute -top-[18px] left-1/2 -translate-x-1/2 bg-red-400 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                            Hôm nay
                        </div>
                    </div>
                )}

                {/* Task Rows Placeholder */}
                <div className="relative z-10 w-full">
                    {tasks.map((task, idx) => {
                        return (
                            <div key={task.id} className="h-10 w-full relative group hover:bg-indigo-50/50 flex items-center border-b border-gray-100 hover:border-gray-200 transition-colors">
                                {/* Task Row content (Gantt Bar) */}
                                <div className="relative h-full flex-1">
                                    <GanttBar
                                        task={task}
                                        timelineStartDate={startDate}
                                        totalDaysInTimeline={totalDaysInTimeline}
                                        pixelsPerDay={pixelsPerDay}
                                        viewMode={viewMode}
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
