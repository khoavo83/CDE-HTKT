import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { GanttTask } from '../components/Gantt/types';

const COLLECTION_NAME = 'project_plans';

export const ganttService = {
  // Get all tasks for a project
  getTasksByProject: async (projectId: string): Promise<GanttTask[]> => {
    try {
        const q = query(
          collection(db, COLLECTION_NAME),
          where('projectId', '==', projectId)
        );
        const snapshot = await getDocs(q);
      
      const tasks: GanttTask[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        
        // Safely parse date from Firestore, which could be Timestamp, Date, string, or {seconds, nanoseconds}
        const parseDate = (val: any, fallback: Date | null = new Date()): any => {
           if (!val) return fallback;
           
           // Handle Firestore Timestamp
           if (typeof val.toDate === 'function') return val.toDate();
           
           // Handle raw Firestore object {seconds, nanoseconds}
           if (val && typeof val.seconds === 'number') {
               return new Date(val.seconds * 1000);
           }
           
           if (val instanceof Date) return val;
           
           if (typeof val === 'string' || typeof val === 'number') {
               const parsed = new Date(val);
               // Filter out common "zero" dates or extreme outlier years to keep timeline clean
               if (isNaN(parsed.getTime()) || parsed.getFullYear() < 2000 || parsed.getFullYear() > 2100) {
                   return fallback;
               }
               return parsed;
           }
           
           return fallback;
        };

        tasks.push({
          id: docSnap.id,
          projectId: data.projectId,
          name: data.name,
          parentId: data.parentId,
          plannedStartDate: parseDate(data.plannedStartDate, new Date()),
          plannedEndDate: parseDate(data.plannedEndDate, new Date()),
          actualStartDate: parseDate(data.actualStartDate, null),
          actualEndDate: parseDate(data.actualEndDate, null),
          linkedDocumentIds: data.linkedDocumentIds || [],
          order: data.order || 0
        });
      });
      return tasks;
    } catch (error) {
      console.error('Error fetching Gantt tasks:', error);
      throw error;
    }
  },

  // Get specific document details by their IDs
  getDocumentsByIds: async (docIds: string[]): Promise<any[]> => {
    if (!docIds || docIds.length === 0) return [];
    try {
      // Firebase 'in' query has a limit of 10 items.
      // If there are more than 10, we'll need multiple queries or Promise.all over individual docs.
      // Let's use individual getDoc queries to avoid 'in' limit issues and handle missing docs gracefully.
      const docRefs = docIds.map(id => doc(db, 'vanban', id));
      const { getDoc } = await import('firebase/firestore');
      
      const docSnapshots = await Promise.all(docRefs.map(ref => getDoc(ref)));
      
      const documents: any[] = [];
      docSnapshots.forEach(snap => {
        if (snap.exists()) {
          documents.push({ id: snap.id, ...snap.data() });
        }
      });
      return documents;
    } catch (error) {
      console.error('Error fetching documents by IDs:', error);
      return []; // Return empty gracefully if it fails
    }
  },

  // Add or update a task
  saveTask: async (task: GanttTask): Promise<void> => {
    try {
      const docRef = doc(db, COLLECTION_NAME, task.id);
      
      const taskData = {
        projectId: task.projectId,
        name: task.name,
        parentId: task.parentId,
        plannedStartDate: Timestamp.fromDate(task.plannedStartDate),
        plannedEndDate: Timestamp.fromDate(task.plannedEndDate),
        actualStartDate: task.actualStartDate ? Timestamp.fromDate(task.actualStartDate) : null,
        actualEndDate: task.actualEndDate ? Timestamp.fromDate(task.actualEndDate) : null,
        linkedDocumentIds: task.linkedDocumentIds || [],
        order: task.order || 0
      };

      await setDoc(docRef, taskData, { merge: true });
    } catch (error) {
      console.error('Error saving Gantt task:', error);
      throw error;
    }
  },

  // Delete a task
  deleteTask: async (taskId: string): Promise<void> => {
    try {
      await deleteDoc(doc(db, COLLECTION_NAME, taskId));
    } catch (error) {
      console.error('Error deleting Gantt task:', error);
      throw error;
    }
  }
};
