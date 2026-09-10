import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';
import { PTPackageRecord, Client, User, PT_CAPACITY_LIMITS } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const usePTSessions = (currentUser: User | null, clients: Client[]) => {
  const { effectiveRole } = useAuth();
  const [ptPackageRecords, setPTPackageRecords] = useState<PTPackageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    const q = query(collection(db, 'sessions'));
    const unsub = onSnapshot(
      q,
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
      if (session.sessionType && session.clientIds && session.clientIds.length > 0) {
        const maxAllowed = PT_CAPACITY_LIMITS[session.sessionType as keyof typeof PT_CAPACITY_LIMITS] || 1;
        if (session.clientIds.length > maxAllowed) {
          throw new Error(`Capacity exceeded: ${session.sessionType} allows at most ${maxAllowed} member(s).`);
        }
      }
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

        // PRD Rule: Completed (Attended) and No Show both deduct 1 session balance
        if (updates.status === 'Attended' || updates.status === 'No Show') {
          const client = clients.find(c => c.id === record.clientId);
          if (client && typeof client.sessionsRemaining === 'number' && client.sessionsRemaining > 0) {
            const packagesCopy = client.packages ? [...client.packages] : [];
            const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
            const clientUpdate: any = {
              sessionsRemaining: client.sessionsRemaining - 1
            };
            if (activePkgIdx !== -1) {
              const activePkg = packagesCopy[activePkgIdx];
              if (activePkg && typeof activePkg.sessionsRemaining === 'number' && activePkg.sessionsRemaining > 0) {
                packagesCopy[activePkgIdx] = {
                  ...activePkg,
                  sessionsRemaining: activePkg.sessionsRemaining - 1
                } as any;
                clientUpdate.packages = packagesCopy;
              }
            }
            await updateDoc(doc(db, 'clients', record.clientId), clientUpdate);
          }
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${id}`);
    }
  };

  return { ptPackageRecords, loading, addPTPackageRecord, updatePTPackageRecord };
};
