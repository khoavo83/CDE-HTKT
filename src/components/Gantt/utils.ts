import { GanttTask } from './types';

export interface VisibleGanttTask extends GanttTask {
    depth: number;
    hasChildren: boolean;
}

export const buildTaskTree = (flatTasks: GanttTask[]): GanttTask[] => {
    const taskMap = new Map<string, GanttTask>();
    const roots: GanttTask[] = [];

    // First pass: map all tasks and initialize children array
    flatTasks.forEach(task => {
        taskMap.set(task.id, { ...task, children: [] });
    });

    // Second pass: organize into tree
    flatTasks.forEach(task => {
        const node = taskMap.get(task.id)!;
        if (node.parentId) {
            const parent = taskMap.get(node.parentId);
            if (parent) {
                if (!parent.children) parent.children = [];
                parent.children.push(node);
            } else {
                roots.push(node);
            }
        } else {
            roots.push(node);
        }
    });

    // Recursive sort by order
    const sortNodes = (nodes: GanttTask[]) => {
        nodes.sort((a, b) => a.order - b.order);
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortNodes(node.children);
            }
        });
    };

    sortNodes(roots);
    return roots;
};

export const getVisibleTasks = (
    flatTasks: GanttTask[], 
    expandedIds: Set<string>
): VisibleGanttTask[] => {
    const tree = buildTaskTree(flatTasks);
    const visible: VisibleGanttTask[] = [];

    const traverse = (nodes: GanttTask[], depth: number) => {
        nodes.forEach(node => {
            const hasChildren = !!node.children && node.children.length > 0;
            visible.push({
                ...node,
                depth,
                hasChildren
            });
            if (hasChildren && expandedIds.has(node.id)) {
                traverse(node.children!, depth + 1);
            }
        });
    };

    traverse(tree, 0);
    return visible;
};
