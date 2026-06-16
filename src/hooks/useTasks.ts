import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
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
    if (!currentUser) {
      setTasks([]);
      setLoading(false);
      return;
    }
    // Members can't list all tasks — skip the global listener
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(collection(db, 'tasks'), (snapshot) => {
      setTasks(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Task)));
      setLoading(false);
    }, (error) => {
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
      const docRef = await addDoc(collection(db, 'tasks'), cleanData(newTask));
      await addAuditLog('CREATE', 'CLIENT', docRef.id, `Created task: ${task.title}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      await updateDoc(doc(db, 'tasks', id), cleanData(updates));
      const taskName = tasks.find(t => t.id === id)?.title || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated task: ${taskName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const taskName = tasks.find(t => t.id === id)?.title || id;
      await deleteDoc(doc(db, 'tasks', id));
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted task: ${taskName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
    }
  };

  return { tasks: visibleTasks, allTasks: tasks, loading, addTask, updateTask, deleteTask };
};
