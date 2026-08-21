import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { ClassSchedule } from '../types/class';

export function useClasses() {
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // IMPORTANT: Tenant isolation is handled by getDbForRequest or equivalent in rules/context
    // For now, we query the root 'classSchedules' collection which will live in the tenant's specific db.
    const q = query(collection(db, 'classSchedules'));
    
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
      await setDoc(newClassRef, {
        ...classData,
        noShowsProcessed: false,
        createdAt: now,
        updatedAt: now
      });
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
    } catch (error) {
      console.error("Error updating class:", error);
      throw error;
    }
  };

  const deleteClass = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'classSchedules', id));
    } catch (error) {
      console.error("Error deleting class:", error);
      throw error;
    }
  };

  return { classes, loading, addClass, updateClass, deleteClass };
}
