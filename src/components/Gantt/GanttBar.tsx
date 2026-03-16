import React, { useState, useEffect } from 'react';
import { GanttTask } from './types';
import { addDays, differenceInDays, isAfter, isBefore } from 'date-fns';
import { Paperclip } from 'lucide-react';

interface GanttBarProps {
    task: GanttTask;
    timelineStartDate: Date;
    totalDaysInTimeline: number;
    pixelsPerDay: number;
    onUpdateTask?: (task: GanttTask) => void;
    onDocumentClick?: (task: GanttTask) => void;
}

type DragType = 'planned-move' | 'planned-left' | 'planned-right' | 'actual-move' | 'actual-left' | 'actual-right' | null;

export const GanttBar: React.FC<GanttBarProps> = ({ task, timelineStartDate, totalDaysInTimeline, pixelsPerDay, onUpdateTask, onDocumentClick }) => {

    // Helper to ensure we have a valid Date object
    const toDate = (d: any) => (d instanceof Date ? d : new Date(d));

    // 1. Calculate Planned Bar Position in PIXELS
    const pStart = toDate(task.plannedStartDate);
    const pEnd = toDate(task.plannedEndDate);
    const tStart = toDate(timelineStartDate);

    const msPerDay = 1000 * 60 * 60 * 24;
    const plannedStartDays = Math.max(0, (pStart.getTime() - tStart.getTime()) / msPerDay);
    const plannedDurationDays = Math.max(1, (pEnd.getTime() - pStart.getTime()) / msPerDay + 1);
    
    const plannedLeftPx = plannedStartDays * pixelsPerDay;
    const plannedWidthPx = plannedDurationDays * pixelsPerDay;

    // 2. Calculate Actual Bar Position
    let actualLeftPx = 0;
    let actualWidthPx = 0;
    let isDelayed = false;

    if (task.actualStartDate) {
        const aStart = toDate(task.actualStartDate);
        const actualStartDays = Math.max(0, (aStart.getTime() - tStart.getTime()) / msPerDay);
        actualLeftPx = actualStartDays * pixelsPerDay;
        
        const aEnd = task.actualEndDate ? toDate(task.actualEndDate) : new Date(); 
        const actualDurationDays = Math.max(1, (aEnd.getTime() - aStart.getTime()) / msPerDay + 1);
        actualWidthPx = actualDurationDays * pixelsPerDay;

        // Simple delay logic
        if (task.actualEndDate && isAfter(toDate(task.actualEndDate), pEnd)) {
            isDelayed = true;
        } else if (!task.actualEndDate && isAfter(new Date(), pEnd)) {
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
                    updatedTask.plannedStartDate = addDays(updatedTask.plannedStartDate, dragDeltaDays);
                    updatedTask.plannedEndDate = addDays(updatedTask.plannedEndDate, dragDeltaDays);
                } else if (dragType === 'planned-left') {
                    updatedTask.plannedStartDate = addDays(updatedTask.plannedStartDate, dragDeltaDays);
                    // Ensure start is not after end
                    if (isAfter(updatedTask.plannedStartDate, updatedTask.plannedEndDate)) {
                        updatedTask.plannedStartDate = updatedTask.plannedEndDate;
                    }
                } else if (dragType === 'planned-right') {
                    updatedTask.plannedEndDate = addDays(updatedTask.plannedEndDate, dragDeltaDays);
                    // Ensure end is not before start
                    if (isBefore(updatedTask.plannedEndDate, updatedTask.plannedStartDate)) {
                        updatedTask.plannedEndDate = updatedTask.plannedStartDate;
                    }
                } else if (dragType === 'actual-move' && updatedTask.actualStartDate) {
                    updatedTask.actualStartDate = addDays(updatedTask.actualStartDate, dragDeltaDays);
                    if (updatedTask.actualEndDate) {
                        updatedTask.actualEndDate = addDays(updatedTask.actualEndDate, dragDeltaDays);
                    }
                } else if (dragType === 'actual-left' && updatedTask.actualStartDate) {
                    updatedTask.actualStartDate = addDays(updatedTask.actualStartDate, dragDeltaDays);
                    if (updatedTask.actualEndDate && isAfter(updatedTask.actualStartDate, updatedTask.actualEndDate)) {
                        updatedTask.actualStartDate = updatedTask.actualEndDate;
                    }
                } else if (dragType === 'actual-right' && updatedTask.actualEndDate) {
                    updatedTask.actualEndDate = addDays(updatedTask.actualEndDate, dragDeltaDays);
                    if (updatedTask.actualStartDate && isBefore(updatedTask.actualEndDate, updatedTask.actualStartDate)) {
                        updatedTask.actualEndDate = updatedTask.actualStartDate;
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
    let displayPlannedLeftPx = plannedLeftPx;
    let displayPlannedWidthPx = plannedWidthPx;
    let displayActualLeftPx = actualLeftPx;
    let displayActualWidthPx = actualWidthPx;

    if (isDragging && dragDeltaDays !== 0) {
        const deltaPx = dragDeltaDays * pixelsPerDay;
        
        if (dragType === 'planned-move') {
            displayPlannedLeftPx += deltaPx;
        } else if (dragType === 'planned-left') {
            displayPlannedLeftPx += deltaPx;
            displayPlannedWidthPx -= deltaPx; 
            if (displayPlannedWidthPx < pixelsPerDay) {
                displayPlannedLeftPx -= (pixelsPerDay - displayPlannedWidthPx);
                displayPlannedWidthPx = pixelsPerDay;
            }
        } else if (dragType === 'planned-right') {
            displayPlannedWidthPx += deltaPx;
            if (displayPlannedWidthPx < pixelsPerDay) displayPlannedWidthPx = pixelsPerDay;
        } else if (dragType === 'actual-move') {
            displayActualLeftPx += deltaPx;
        } else if (dragType === 'actual-left') {
             displayActualLeftPx += deltaPx;
             displayActualWidthPx -= deltaPx;
             if (displayActualWidthPx < pixelsPerDay) {
                 displayActualLeftPx -= (pixelsPerDay - displayActualWidthPx);
                 displayActualWidthPx = pixelsPerDay;
             }
        } else if (dragType === 'actual-right') {
             displayActualWidthPx += deltaPx;
             if (displayActualWidthPx < pixelsPerDay) displayActualWidthPx = pixelsPerDay;
        }
    }

    const hasDocuments = task.linkedDocumentIds && task.linkedDocumentIds.length > 0;

    return (
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-[32px] pointer-events-none z-10">
            {/* Planned Bar (Background/Top) */}
            <div 
                className={`absolute h-[10px] rounded-full bg-blue-200 border border-blue-300 shadow-sm top-0 z-10 pointer-events-auto cursor-grab active:cursor-grabbing ${isDragging && dragType?.includes('planned') ? 'opacity-70 bg-blue-300' : ''}`}
                style={{ 
                    left: `${displayPlannedLeftPx}px`, 
                    width: `${displayPlannedWidthPx}px`,
                    transition: isDragging ? 'none' : 'all 0.2s',
                }}
                title={`Kế hoạch: ${pStart.toLocaleDateString()} - ${pEnd.toLocaleDateString()}`}
                onMouseDown={(e) => handleMouseDown(e, 'planned-move')}
            >
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
                    className={`absolute h-[10px] rounded-full shadow-sm top-[16px] border z-20 pointer-events-auto cursor-grab active:cursor-grabbing ${
                        isDelayed ? 'bg-red-400 border-red-500' : 'bg-green-400 border-green-500'
                    } ${isDragging && dragType?.includes('actual') ? 'opacity-70 brightness-90' : ''}`}
                    style={{ 
                        left: `${displayActualLeftPx}px`, 
                        width: `${displayActualWidthPx}px`,
                        transition: isDragging ? 'none' : 'all 0.2s',
                    }}
                    title={`Thực tế: ${toDate(task.actualStartDate).toLocaleDateString()} - ${task.actualEndDate ? toDate(task.actualEndDate).toLocaleDateString() : 'Đang xử lý'}`}
                    onMouseDown={(e) => handleMouseDown(e, 'actual-move')}
                >
                    {/* Drag Handles for Actual */}
                    {onUpdateTask && task.actualEndDate && (
                        <>
                            <div className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-l-full" onMouseDown={(e) => handleMouseDown(e, 'actual-left')} />
                            <div className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-black/10 rounded-r-full" onMouseDown={(e) => handleMouseDown(e, 'actual-right')} />
                        </>
                    )}
                </div>
            )}

            {/* Document Indicator Icon */}
            {hasDocuments && (
                <div 
                    className="absolute pointer-events-auto bg-white border border-gray-200 shadow-sm rounded-full w-5 h-5 flex items-center justify-center top-[4px] z-30 opacity-80 hover:opacity-100 transition-opacity cursor-pointer"
                    style={{ 
                        left: `calc(max(${displayPlannedLeftPx + displayPlannedWidthPx}px, ${task.actualStartDate ? displayActualLeftPx + displayActualWidthPx : 0}px) + 8px)`
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
