import { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, writeBatch } from 'firebase/firestore';
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
    const unsub = onSnapshot(collection(db, 'importBatches'), (snapshot) => {
      setImportBatches(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ImportBatch)));
      setLoading(false);
    }, (error) => {
      console.error('Failed to fetch import batches', error);
      handleFirestoreError(error, OperationType.LIST, 'importBatches');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const addImportBatch = async (batch: Omit<ImportBatch, 'id'>): Promise<string> => {
    try {
      const docRef = doc(collection(db, 'importBatches'));
      await setDoc(docRef, cleanData(batch));
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'importBatches');
      return '';
    }
  };

  const rollbackImport = async (batchId: string) => {
    try {
      const clientsToRollback = clients.filter(c => c.importBatchId === batchId);
      const paymentIds = payments
        .filter(p => clientsToRollback.some(c => c.id === p.clientId))
        .map(p => p.id);

      const batch = writeBatch(db);
      
      clientsToRollback.forEach(c => {
        batch.delete(doc(db, 'clients', c.id));
      });
      
      paymentIds.forEach(pid => {
        batch.delete(doc(db, 'payments', pid));
      });

      batch.update(doc(db, 'importBatches', batchId), { status: 'Rolled Back' });

      await batch.commit();

      await addAuditLog('DELETE', 'CLIENT', batchId, `Rolled back import batch, deleted ${clientsToRollback.length} records and ${paymentIds.length} payments`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `importBatches/${batchId}`);
    }
  };

  return { importBatches, loading, addImportBatch, rollbackImport };
};
