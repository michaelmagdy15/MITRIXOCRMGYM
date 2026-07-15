import { useState, useEffect, useMemo, useCallback } from 'react';
import { auth } from '../firebase';
import { Task } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const useTasks = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    if (!currentUser) {
      setTasks([]);
      setLoading(false);
      return;
    }
    // Members can't list all tasks
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(data.tasks || []);
      }
    } catch (error) {
      console.error('Failed to fetch tasks', error);
      handleFirestoreError(error, OperationType.LIST, 'tasks');
    } finally {
      setLoading(false);
    }
  }, [currentUser, effectiveRole]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

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
      
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/tasks/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ task: cleanData(newTask) })
      });
      
      if (res.ok) {
        const data = await res.json();
        const id = data.id || data.taskId || 'unknown';
        await addAuditLog('CREATE', 'CLIENT', id, `Created task: ${task.title}`);
        await fetchTasks();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'tasks');
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/tasks/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id, updates: cleanData(updates) })
      });
      
      if (res.ok) {
        const taskName = tasks.find(t => t.id === id)?.title || id;
        await addAuditLog('UPDATE', 'CLIENT', id, `Updated task: ${taskName}`);
        await fetchTasks();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `tasks/${id}`);
    }
  };

  const deleteTask = async (id: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/tasks/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id })
      });
      
      if (res.ok) {
        const taskName = tasks.find(t => t.id === id)?.title || id;
        await addAuditLog('DELETE', 'CLIENT', id, `Deleted task: ${taskName}`);
        await fetchTasks();
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `tasks/${id}`);
    }
  };

  return { tasks: visibleTasks, allTasks: tasks, loading, addTask, updateTask, deleteTask };
};
