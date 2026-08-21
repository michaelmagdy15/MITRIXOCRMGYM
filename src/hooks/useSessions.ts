import { useState, useCallback } from 'react';
import { collection, query, where, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { useAuth } from '../contexts/AuthContext';
import { Session, SessionType, SessionStatus } from '../types';
import { db, auth } from '../firebase';
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
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/sessions/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to book session');
      
      return { id: data.sessionId, ...sessionData, status: 'Scheduled', createdAt: new Date().toISOString() } as Session;
    } catch (err: any) {
      console.error('[useSessions] Error booking session:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const cancelSession = useCallback(async (sessionId: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/sessions/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel session');
    } catch (err: any) {
      console.error('[useSessions] Error canceling session:', err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  const rescheduleSession = useCallback(async (sessionId: string, newDate: string, newStartTime: string, newEndTime: string) => {
    if (!currentUser) throw new Error('Not authenticated');
    setLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/sessions/reschedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId, newDate, newStartTime, newEndTime })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule session');
    } catch (err: any) {
      console.error('[useSessions] Error rescheduling session:', err);
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
    cancelSession,
    rescheduleSession,
    updateSessionStatus,
    deleteSession,
    loading,
    error
  };
};
