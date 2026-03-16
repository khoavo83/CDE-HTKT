export interface GanttTask {
    id: string;
    projectId: string;
    name: string;
    parentId: string | null;
    plannedStartDate: Date; // For UI logic we use Date, Firestore uses Timestamp
    plannedEndDate: Date;
    actualStartDate: Date | null;
    actualEndDate: Date | null;
    linkedDocumentIds: string[];
    order: number;
    isCompleted?: boolean;
    // For rendering tree structure
    children?: GanttTask[];
    isExpanded?: boolean;
}

export type ViewMode = 'Week' | 'Month' | 'Quarter' | 'Year';
