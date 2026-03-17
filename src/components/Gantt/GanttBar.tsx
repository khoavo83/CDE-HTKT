import React, { useState, useEffect } from 'react';
import { GanttTask } from './types';
import { addDays, differenceInDays, isAfter, isBefore, format } from 'date-fns';
import { Paperclip } from 'lucide-react';

interface GanttBarProps {
    task: GanttTask;
    timelineStartDate: Date;
    totalDaysInTimeline: number;
    pixelsPerDay: number;
    viewMode?: string;
    onUpdateTask?: (task: GanttTask) => void;
    onDocumentClick?: (task: GanttTask) => void;
}

type DragType = 'planned-move' | 'planned-left' | 'planned-right' | 'actual-move' | 'actual-left' | 'actual-right' | null;

export const GanttBar: React.FC<GanttBarProps> = ({ task, timelineStartDate, totalDaysInTimeline, pixelsPerDay, viewMode, onUpdateTask, onDocumentClick }) => {
    const pStart = task.plannedStartDate instanceof Date ? task.plannedStartDate : new Date(task.plannedStartDate);
    const pEnd = task.plannedEndDate instanceof Date ? task.plannedEndDate : new Date(task.plannedEndDate);
    const aStart = task.actualStartDate ? (task.actualStartDate instanceof Date ? task.actualStartDate : new Date(task.actualStartDate)) : null;
    const aEnd = task.actualEndDate ? (task.actualEndDate instanceof Date ? task.actualEndDate : new Date(task.actualEndDate)) : null;

    // 1. Calculate Planned Bar Position
    const plannedStartFromTimelineStart = Math.max(0, differenceInDays(pStart, timelineStartDate));
    const plannedDuration = differenceInDays(pEnd, pStart) + 1;
    
    // Convert to percentages relative to total timeline width
    const plannedLeftPct = (plannedStartFromTimelineStart / totalDaysInTimeline) * 100;
    const plannedWidthPct = (plannedDuration / totalDaysInTimeline) * 100;

    // 2. Calculate Actual Bar Position (if data exists)
    let actualLeftPct = 0;
    let actualWidthPct = 0;
    let isDelayed = false;

    if (aStart) {
        const actualStartFromTimelineStart = Math.max(0, differenceInDays(aStart, timelineStartDate));
        actualLeftPct = (actualStartFromTimelineStart / totalDaysInTimeline) * 100;
        
        // If no end date yet, draw until today or something similar. For now, just draw a point if no end.
        const effectiveEndDate = aEnd || new Date(); 
        const actualDuration = differenceInDays(effectiveEndDate, aStart) + 1;
        actualWidthPct = (actualDuration / totalDaysInTimeline) * 100;

        // Simple delay logic: if actual end > planned end, it's delayed
        if (aEnd && isAfter(aEnd, pEnd)) {
            isDelayed = true;
        } else if (!aEnd && isAfter(new Date(), pEnd)) {
             isDelayed = true;
        }
    }

    // Dragging State
    const [isDragging, setIsDragging] = useState(false);
    const [dragType, setDragType] = useState<DragType>(null);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragDeltaDays, setDragDeltaDays] = useState(0);

    const handleMouseDown = (e: React.MouseEvent, type: DragType) => {
        if (!onUpdateTask) return; // Only allow drag if we have update handler
        e.stopPropagation();
        e.preventDefault();
        setIsDragging(true);
        setDragType(type);
        setDragStartX(e.clientX);
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDragging) return;
            const deltaX = e.clientX - dragStartX;
            const deltaDays = Math.round(deltaX / pixelsPerDay);
            setDragDeltaDays(deltaDays);
        };

        const handleMouseUp = () => {
            if (!isDragging) return;
            
            setIsDragging(false);

            if (dragDeltaDays !== 0 && dragType && onUpdateTask) {
                const updatedTask = { ...task };
                
                if (dragType === 'planned-move') {
                    updatedTask.plannedStartDate = addDays(pStart, dragDeltaDays);
                    updatedTask.plannedEndDate = addDays(pEnd, dragDeltaDays);
                } else if (dragType === 'planned-left') {
                    updatedTask.plannedStartDate = addDays(pStart, dragDeltaDays);
                    // Ensure start is not after end
                    if (isAfter(updatedTask.plannedStartDate, pEnd)) {
                        updatedTask.plannedStartDate = pEnd;
                    }
                } else if (dragType === 'planned-right') {
                    updatedTask.plannedEndDate = addDays(pEnd, dragDeltaDays);
                    // Ensure end is not before start
                    if (isBefore(updatedTask.plannedEndDate, pStart)) {
                        updatedTask.plannedEndDate = pStart;
                    }
                } else if (dragType === 'actual-move' && aStart) {
                    updatedTask.actualStartDate = addDays(aStart, dragDeltaDays);
                    if (aEnd) {
                        updatedTask.actualEndDate = addDays(aEnd, dragDeltaDays);
                    }
                } else if (dragType === 'actual-left' && aStart) {
                    updatedTask.actualStartDate = addDays(aStart, dragDeltaDays);
                    if (aEnd && isAfter(updatedTask.actualStartDate, aEnd)) {
                        updatedTask.actualStartDate = aEnd;
                    }
                } else if (dragType === 'actual-right' && aEnd) {
                    updatedTask.actualEndDate = addDays(aEnd, dragDeltaDays);
                    if (aStart && isBefore(updatedTask.actualEndDate, aStart)) {
                        updatedTask.actualEndDate = aStart;
                    }
                }

                onUpdateTask(updatedTask);
            }

            setDragType(null);
            setDragDeltaDays(0);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStartX, pixelsPerDay, dragDeltaDays, dragType, task, onUpdateTask]);

    // Apply temporary drag styles
    let displayPlannedLeftPct = plannedLeftPct;
    let displayPlannedWidthPct = plannedWidthPct;
    let displayActualLeftPct = actualLeftPct;
    let displayActualWidthPct = actualWidthPct;

    if (isDragging && dragDeltaDays !== 0) {
        const deltaPct = (dragDeltaDays / totalDaysInTimeline) * 100;
        
        if (dragType === 'planned-move') {
            displayPlannedLeftPct += deltaPct;
        } else if (dragType === 'planned-left') {
            displayPlannedLeftPct += deltaPct;
            displayPlannedWidthPct -= deltaPct; 
            // Avoid negative width
            if (displayPlannedWidthPct < 0.1) {
                displayPlannedLeftPct -= (0.1 - displayPlannedWidthPct);
                displayPlannedWidthPct = 0.1;
            }
        } else if (dragType === 'planned-right') {
            displayPlannedWidthPct += deltaPct;
            if (displayPlannedWidthPct < 0.1) displayPlannedWidthPct = 0.1;
        } else if (dragType === 'actual-move') {
            displayActualLeftPct += deltaPct;
        } else if (dragType === 'actual-left') {
             displayActualLeftPct += deltaPct;
             displayActualWidthPct -= deltaPct;
             if (displayActualWidthPct < 0.1) {
                 displayActualLeftPct -= (0.1 - displayActualWidthPct);
                 displayActualWidthPct = 0.1;
             }
        } else if (dragType === 'actual-right') {
             displayActualWidthPct += deltaPct;
             if (displayActualWidthPct < 0.1) displayActualWidthPct = 0.1;
        }
    }

    const hasDocuments = task.linkedDocumentIds && task.linkedDocumentIds.length > 0;
    
    // Depth-based colors
    const depth = (task as any).depth || 0;
    let plannedBgColor = 'bg-blue-200';
    let plannedBorderColor = 'border-blue-300';
    let draggingBgColor = 'bg-blue-300';
    
    if (task.isCompleted) {
        plannedBgColor = 'bg-green-400';
        plannedBorderColor = 'border-green-500';
        draggingBgColor = 'bg-green-500';
    } else if (depth === 0) {
        plannedBgColor = 'bg-indigo-300';
        plannedBorderColor = 'border-indigo-400';
        draggingBgColor = 'bg-indigo-400';
    } else if (depth === 1) {
        plannedBgColor = 'bg-sky-300';
        plannedBorderColor = 'border-sky-400';
        draggingBgColor = 'bg-sky-400';
    } else if (depth >= 2) {
        plannedBgColor = 'bg-blue-200';
        plannedBorderColor = 'border-blue-300';
        draggingBgColor = 'bg-blue-300';
    }

    return (
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-[32px] pointer-events-none group-hover:block z-10">
            {/* Planned Bar (Background/Top) */}
            <div 
                className={`absolute h-[10px] rounded-full ${plannedBgColor} border ${plannedBorderColor} shadow-sm top-0 z-10 pointer-events-auto cursor-grab active:cursor-grabbing ${isDragging && dragType?.includes('planned') ? `opacity-70 ${draggingBgColor}` : ''}`}
                style={{ 
                    left: `${displayPlannedLeftPct}%`, 
                    width: `${displayPlannedWidthPct}%`,
                    minWidth: `${pixelsPerDay}px`,
                    transition: isDragging ? 'none' : 'all 0.2s',
                }}
                title={`Kế hoạch: ${task.plannedStartDate.toLocaleDateString()} - ${task.plannedEndDate.toLocaleDateString()}`}
                onMouseDown={(e) => handleMouseDown(e, 'planned-move')}
            >
                {/* Date Labels */}
                {!isDragging && (
                    <>
                        <div className="absolute -left-12 -top-[2px] w-11 text-right text-[10px] text-gray-500 font-medium truncate pointer-events-none select-none">
                            {format(pStart, 'dd/MM')}
                        </div>
                        <div className="absolute -right-12 -top-[2px] w-11 text-left text-[10px] text-gray-500 font-medium truncate pointer-events-none select-none">
                            {format(pEnd, 'dd/MM')}
                        </div>
                    </>
                )}

                {/* Drag Handles for Planned */}
                {onUpdateTask && (
                    <>
                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-l-full" onMouseDown={(e) => handleMouseDown(e, 'planned-left')} />
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-r-full" onMouseDown={(e) => handleMouseDown(e, 'planned-right')} />
                    </>
                )}
            </div>

            {/* Actual Bar (Foreground/Bottom) */}
            {task.actualStartDate && (
                <div 
                    className={`absolute h-[10px] rounded-full shadow-sm top-[16px] border z-20 pointer-events-auto ${
                        isDelayed ? 'bg-red-400 border-red-500' : 'bg-green-400 border-green-500'
                    }`}
                    style={{ 
                        left: `${displayActualLeftPct}%`, 
                        width: `${displayActualWidthPct}%`,
                        minWidth: `${pixelsPerDay}px`,
                        transition: isDragging ? 'none' : 'all 0.2s',
                    }}
                    title={`Thực tế: ${task.actualStartDate.toLocaleDateString()} - ${task.actualEndDate ? task.actualEndDate.toLocaleDateString() : 'Đang xử lý'}`}
                >
                    {/* Handlers removed for actual bar */}
                </div>
            )}

            {/* Document Indicator Icon */}
            {hasDocuments && (
                <div 
                    className="absolute pointer-events-auto bg-white border border-gray-200 shadow-sm rounded-full w-5 h-5 flex items-center justify-center top-[4px] z-30 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ 
                        left: `calc(max(${displayPlannedLeftPct + displayPlannedWidthPct}%, ${task.actualStartDate ? displayActualLeftPct + displayActualWidthPct : 0}%) + 8px)`
                    }}
                    title={`Có ${task.linkedDocumentIds!.length} văn bản đính kèm`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onDocumentClick?.(task);
                    }}
                >
                    <Paperclip className="w-3 h-3 text-indigo-500" />
                </div>
            )}
        </div>
    );
};
