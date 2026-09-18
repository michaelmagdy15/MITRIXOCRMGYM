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
        const capacityObj = PT_CAPACITY_LIMITS[session.sessionType as keyof typeof PT_CAPACITY_LIMITS];
        const maxAllowed = capacityObj ? capacityObj.max : 1;
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
      const record = ptPackageRecords.find(s => s.id === id);
      if (record) {
        const oldStatus = record.status;
        const newStatus = updates.status || oldStatus;
        
        await updateDoc(doc(db, 'sessions', id), cleanData(updates));
        
        const clientName = clients.find(c => c.id === record.clientId)?.name || record.clientId;
        await addAuditLog('UPDATE', 'PACKAGE_RECORD', id, `Updated package status to ${newStatus} for ${clientName}`);

        // PRD Rule: Completed (Attended) and No Show both deduct 1 session balance. Rescheduled/Cancelled does not.
        const isOldDeducted = oldStatus === 'Attended' || oldStatus === 'No Show';
        const isNewDeducted = newStatus === 'Attended' || newStatus === 'No Show';
        
        let adjustment = 0;
        if (isNewDeducted && !isOldDeducted) {
          adjustment = -1; // deduct
        } else if (!isNewDeducted && isOldDeducted) {
          adjustment = 1; // restore
        }

        if (adjustment !== 0) {
          const client = clients.find(c => c.id === record.clientId);
          if (client && typeof client.sessionsRemaining === 'number') {
            const packagesCopy = client.packages ? [...client.packages] : [];
            const activePkgIdx = packagesCopy.findIndex(p => p.status === 'Active');
            const clientUpdate: any = {
              sessionsRemaining: Math.max(0, client.sessionsRemaining + adjustment)
            };
            
            if (activePkgIdx !== -1) {
              const activePkg = packagesCopy[activePkgIdx];
              if (activePkg && typeof activePkg.sessionsRemaining === 'number') {
                packagesCopy[activePkgIdx] = {
                  ...activePkg,
                  sessionsRemaining: Math.max(0, activePkg.sessionsRemaining + adjustment)
                } as any;
                clientUpdate.packages = packagesCopy;
              }
            }
            await updateDoc(doc(db, 'clients', record.clientId), clientUpdate);
          }
        }
      } else {
        await updateDoc(doc(db, 'sessions', id), cleanData(updates));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `sessions/${id}`);
    }
  };

  return { ptPackageRecords, loading, addPTPackageRecord, updatePTPackageRecord };
};
