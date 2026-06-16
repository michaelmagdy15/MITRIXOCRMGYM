import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDocs, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { ImportBatch, Client, Payment, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';

export const useImportBatches = (currentUser: User | null, clients: Client[], payments: Payment[]) => {
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'coach' || currentUser.role === 'client') {
      setImportBatches([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'importBatches'), orderBy('date', 'desc')),
      (snapshot) => {
        setImportBatches(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ImportBatch)));
        setLoading(false);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'importBatches');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [currentUser]);

  const addImportBatch = async (batch: Omit<ImportBatch, 'id'>): Promise<string> => {
    try {
      const docRef = await addDoc(collection(db, 'importBatches'), cleanData(batch));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'importBatches');
      return '';
    }
  };

  const rollbackImport = async (batchId: string) => {
    try {
      const clientsToRollback = clients.filter(c => c.importBatchId === batchId);
      for (const client of clientsToRollback) {
        await deleteDoc(doc(db, 'clients', client.id));
      }

      const paymentIds = payments
        .filter(p => clientsToRollback.some(c => c.id === p.clientId))
        .map(p => p.id);

      if (paymentIds.length > 0) {
        let batch = writeBatch(db);
        let count = 0;
        for (const pid of paymentIds) {
          batch.delete(doc(db, 'payments', pid));
          count++;
          if (count === 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      await updateDoc(doc(db, 'importBatches', batchId), { status: 'Rolled Back' });
      await addAuditLog('DELETE', 'CLIENT', batchId, `Rolled back import batch, deleted ${clientsToRollback.length} records and ${paymentIds.length} payments`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `importBatches/${batchId}`);
    }
  };

  return { importBatches, loading, addImportBatch, rollbackImport };
};
