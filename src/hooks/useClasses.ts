import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { ClassSchedule } from '../types/class';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export function useClasses() {
  const { currentUser } = useAuth();
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Cost Optimization: Query classes from the last 30 days and upcoming, preventing loading all historical archives
    const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const q = query(
      collection(db, 'classSchedules'),
      where('date', '>=', thirtyDaysAgoStr)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const classesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ClassSchedule[];
      
      setClasses(classesData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching classes:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const addClass = async (classData: Omit<ClassSchedule, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newClassRef = doc(collection(db, 'classSchedules'));
      const now = new Date().toISOString();
      const scheduleDate = classData.date || classData.startTime.slice(0, 10);
      const scheduleTime = classData.time || classData.startTime.slice(11, 16);
      await setDoc(newClassRef, {
        ...classData,
        // All schedule consumers query by this value; keep it in sync with startTime.
        date: scheduleDate,
        time: scheduleTime,
        status: classData.status || 'active',
        noShowsProcessed: false,
        createdAt: now,
        updatedAt: now
      });
      await addAuditLog('CREATE', 'CLASS', newClassRef.id, `Created class schedule: ${classData.name || scheduleDate} ${scheduleTime}`, currentUser?.name);
      return newClassRef.id;
    } catch (error) {
      console.error("Error adding class:", error);
      throw error;
    }
  };

  const updateClass = async (id: string, updates: Partial<ClassSchedule>) => {
    try {
      const classRef = doc(db, 'classSchedules', id);
      await updateDoc(classRef, {
        ...updates,
        updatedAt: new Date().toISOString()
      });
      const className = classes.find(c => c.id === id)?.name || id;
      await addAuditLog('UPDATE', 'CLASS', id, `Updated class schedule: ${className}. Changes: ${Object.keys(updates).join(', ')}`, currentUser?.name);
    } catch (error) {
      console.error("Error updating class:", error);
      throw error;
    }
  };

  const cancelClass = async (id: string, reason?: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/classes/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          classId: id,
          reason
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to cancel class');
      }
      return data;
    } catch (error) {
      console.error("Error cancelling class via server endpoint:", error);
      // Fallback: update status directly in Firestore if server endpoint is offline
      const classRef = doc(db, 'classSchedules', id);
      const className = classes.find(c => c.id === id)?.name || id;
      await updateDoc(classRef, {
        status: 'cancelled',
        cancelReason: reason || 'Class cancelled by gym',
        cancelledAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      await addAuditLog('CANCEL_CLASS', 'CLASS', id, `Cancelled class schedule (fallback): ${className}. Reason: ${reason || 'Class cancelled by gym'}`, currentUser?.name);
      return { success: true, fallback: true };
    }
  };

  const deleteClass = async (id: string) => {
    try {
      const className = classes.find(c => c.id === id)?.name || id;
      await deleteDoc(doc(db, 'classSchedules', id));
      await addAuditLog('DELETE', 'CLASS', id, `Deleted class schedule: ${className}`, currentUser?.name);
    } catch (error) {
      console.error("Error deleting class:", error);
      throw error;
    }
  };

  return { classes, loading, addClass, updateClass, cancelClass, deleteClass };
}
