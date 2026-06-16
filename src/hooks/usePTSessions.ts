import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { PTPackageRecord, Client, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const usePTSessions = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [ptPackageRecords, setPTPackageRecords] = useState<PTPackageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;
    // Members can't list all sessions — skip the global listener
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'sessions'),
      (snapshot) => {
        setPTPackageRecords(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as PTPackageRecord)));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'sessions');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [currentUser, effectiveRole]);

  const addPTPackageRecord = async (session: Omit<PTPackageRecord, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'sessions'), cleanData(session));
      const clientName = clients.find(c => c.id === session.clientId)?.name || session.clientId;
      await addAuditLog('CREATE', 'PACKAGE_RECORD', docRef.id, `Scheduled package for ${clientName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'sessions');
    }
  };

  const updatePTPackageRecord = async (id: string, updates: Partial<PTPackageRecord>) => {
    try {
      await updateDoc(doc(db, 'sessions', id), cleanData(updates));
      const record = ptPackageRecords.find(s => s.id === id);
      if (record) {
        const clientName = clients.find(c => c.id === record.clientId)?.name || record.clientId;
        await addAuditLog('UPDATE', 'PACKAGE_RECORD', id, `Updated package status to ${updates.status} for ${clientName}`);

        // Deduct one session when a PT session is marked Attended
        if (updates.status === 'Attended') {
          const client = clients.find(c => c.id === record.clientId);
          if (client && typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
            await updateDoc(doc(db, 'clients', record.clientId), {
              sessionsRemaining: client.sessionsRemaining - 1,
            });
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${id}`);
    }
  };

  return { ptPackageRecords, loading, addPTPackageRecord, updatePTPackageRecord };
};
