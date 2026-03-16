import React from 'react';
import { GanttChart } from '../components/Gantt';
import { GanttTask } from '../components/Gantt/types';

// Hardcoded mock data for Phase 1 UI testing
const mockTasks: GanttTask[] = [
    {
        id: 't1',
        projectId: 'p1',
        name: 'Giai đoạn 1: Chuẩn bị đầu tư',
        parentId: null,
        plannedStartDate: new Date(2023, 9, 1), // Oct 1, 2023
        plannedEndDate: new Date(2023, 10, 15), // Nov 15, 2023
        actualStartDate: new Date(2023, 9, 5),
        actualEndDate: new Date(2023, 10, 20),
        linkedDocumentIds: ['doc1'],
        order: 1,
        isExpanded: true,
        children: [
            {
                id: 't1-1',
                projectId: 'p1',
                name: 'Lập báo cáo NCKT',
                parentId: 't1',
                plannedStartDate: new Date(2023, 9, 1),
                plannedEndDate: new Date(2023, 9, 20),
                actualStartDate: new Date(2023, 9, 5),
                actualEndDate: new Date(2023, 9, 25),
                linkedDocumentIds: [],
                order: 1
            },
            {
                id: 't1-2',
                projectId: 'p1',
                name: 'Thẩm định Thiết kế cơ sở',
                parentId: 't1',
                plannedStartDate: new Date(2023, 9, 25),
                plannedEndDate: new Date(2023, 10, 15),
                actualStartDate: null, // Chưa có actual
                actualEndDate: null,
                linkedDocumentIds: [],
                order: 2
            }
        ]
    },
    {
        id: 't2',
        projectId: 'p1',
        name: 'Giai đoạn 2: Thực hiện dự án',
        parentId: null,
        plannedStartDate: new Date(2023, 11, 1),
        plannedEndDate: new Date(2024, 5, 30),
        actualStartDate: null,
        actualEndDate: null,
        linkedDocumentIds: [],
        order: 2,
        isExpanded: false
    }
];

export const GanttTestPage = () => {
    return (
        <div className="h-full p-4">
            <h1 className="text-2xl font-bold text-gray-800 mb-4">Gantt Chart Test Page</h1>
            <div className="h-[800px]">
                <GanttChart projectId="p1" tasks={mockTasks} />
            </div>
        </div>
    );
};
