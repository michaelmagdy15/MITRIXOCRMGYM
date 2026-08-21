import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Session, SessionType, SessionStatus } from '../types';
import { db } from '../firebase';
import { addAuditLog } from '../services/auditService';

export const useSessions = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async (filters?: { coachId?: string; clientId?: string; date?: string; status?: SessionStatus }) => {
    setLoading(true);
    setError(null);
    try {
      let q = query(collection(db, 'sessions'));
      
      if (filters?.coachId) q = query(q, where('coachId', '==', filters.coachId));
      if (filters?.clientId) q = query(q, where('clientId', '==', filters.clientId));
      if (filters?.date) q = query(q, where('date', '==', filters.date));
      if (filters?.status) q = query(q, where('status', '==', filters.status));

      const snapshot = await getDocs(q);
      const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
      return sessions;
    } catch (err: any) {
      console.error('[useSessions] Error fetching sessions:', err);
      setError(err.message);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const bookSession = useCallback(async (sessionData: Omit<Session, 'id' | 'createdAt'>) => {
    if (!currentUser) throw new Error('Not authenticated');
    setLoading(true);
    try {
      // 1. Capacity Validation
      const coachRef = doc(db, 'coachSchedules', sessionData.coachId);
      const coachSnap = await getDoc(coachRef);
      if (!coachSnap.exists()) throw new Error('Coach schedule not found');
      
      const coachSchedule = coachSnap.data()?.days || {};
      const dateObj = new Date(sessionData.date);
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
      const dayOfWeek = days[dateObj.getDay()] as 'sunday'|'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday';
      
      const dayConfig = coachSchedule[dayOfWeek];
      if (!dayConfig || !dayConfig.enabled) {
        throw new Error('Coach is not available on this day');
      }

      const capacity = dayConfig.capacities?.[sessionData.type] || 0;
      if (capacity === 0) {
        throw new Error(`Coach does not offer ${sessionData.type} sessions on this day`);
      }

      const existingQ = query(
        collection(db, 'sessions'),
        where('coachId', '==', sessionData.coachId),
        where('date', '==', sessionData.date),
        where('startTime', '==', sessionData.startTime),
        where('type', '==', sessionData.type),
        where('status', 'in', ['Scheduled', 'Completed', 'No Show'])
      );
      const existingSnap = await getDocs(existingQ);
      if (existingSnap.docs.length >= capacity) {
        throw new Error(`This time slot is fully booked for ${sessionData.type} sessions`);
      }

      // 2. Package Deduction (placeholder - to be implemented in cloud function or transactional logic)
      if (sessionData.packageId) {
        // Here we could run a transaction to deduct 1 session from the client's package
      }

      // 3. Create Session
      const newRef = doc(collection(db, 'sessions'));
      const newSession: Session = {
        ...sessionData,
        id: newRef.id,
        createdAt: new Date().toISOString(),
      };
      
      await setDoc(newRef, newSession);
      
      await addAuditLog(
        'CREATE',
        'SESSION',
        newRef.id,
        `Booked ${sessionData.type} session for ${sessionData.date} at ${sessionData.startTime}`
      );
      
      return newSession;
    } catch (err: any) {
      console.error('[useSessions] Error booking session:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const updateSessionStatus = useCallback(async (sessionId: string, status: SessionStatus, branch?: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    setLoading(true);
    try {
      await updateDoc(doc(db, 'sessions', sessionId), { status });
      
      await addAuditLog(
        'UPDATE',
        'SESSION',
        sessionId,
        `Updated session status to ${status}`
      );
    } catch (err: any) {
      console.error('[useSessions] Error updating session:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const deleteSession = useCallback(async (sessionId: string, branch?: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'sessions', sessionId));
      
      await addAuditLog(
        'DELETE',
        'SESSION',
        sessionId,
        `Deleted session`
      );
    } catch (err: any) {
      console.error('[useSessions] Error deleting session:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  return {
    fetchSessions,
    bookSession,
    updateSessionStatus,
    deleteSession,
    loading,
    error
  };
};
