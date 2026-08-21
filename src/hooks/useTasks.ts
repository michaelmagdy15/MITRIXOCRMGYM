import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { Task } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const useTasks = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || effectiveRole === 'client' || effectiveRole === 'coach') {
      setTasks([]);
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Task)));
      setLoading(false);
    }, (error) => {
      console.error('Failed to fetch tasks', error);
      handleFirestoreError(error, OperationType.LIST, 'tasks');
      setLoading(false);
    });

    return () => unsub();
  }, [currentUser, effectiveRole]);

  const visibleTasks = useMemo(() => {
    if (!currentUser) return [];
    if (effectiveRole === 'manager' || effectiveRole === 'admin') return tasks;
    return tasks.filter(t => t.assignedTo === currentUser.id || t.createdBy === currentUser.id);
  }, [tasks, currentUser, effectiveRole]);

  const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'createdBy'>) => {
    if (!currentUser) return;
    try {
      const newTask = {
        ...task,
        createdBy: currentUser.id,
        createdAt: new Date().toISOString(),
      };
      
      const docRef = doc(collection(db, 'tasks'));
      const docId = docRef.id;
      await setDoc(docRef, cleanData(newTask));
      await addAuditLog('CREATE', 'CLIENT', docId, `Created task: ${task.title}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      await updateDoc(doc(db, 'tasks', id), cleanData(updates));
      const taskName = tasks.find(t => t.id === id)?.title || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated task: ${taskName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tasks', id));
      const taskName = tasks.find(t => t.id === id)?.title || id;
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted task: ${taskName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
    }
  };

  return { tasks: visibleTasks, allTasks: tasks, loading, addTask, updateTask, deleteTask };
};
