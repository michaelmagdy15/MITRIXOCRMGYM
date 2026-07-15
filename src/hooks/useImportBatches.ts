import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { ImportBatch, Client, Payment, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';

export const useImportBatches = (currentUser: User | null, clients: Client[], payments: Payment[]) => {
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchImportBatches = useCallback(async () => {
    if (!currentUser || currentUser.role === 'coach' || currentUser.role === 'client') {
      setImportBatches([]);
      setLoading(false);
      return;
    }
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/import-batches', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setImportBatches(data.importBatches || data.batches || []);
      }
    } catch (error) {
      console.error('Failed to fetch import batches', error);
      handleFirestoreError(error, OperationType.LIST, 'importBatches');
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchImportBatches();
  }, [fetchImportBatches]);

  const addImportBatch = async (batch: Omit<ImportBatch, 'id'>): Promise<string> => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/import-batches/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ batch: cleanData(batch) })
      });
      if (res.ok) {
        const data = await res.json();
        await fetchImportBatches();
        return data.id || data.batchId || '';
      }
      return '';
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'importBatches');
      return '';
    }
  };

  const rollbackImport = async (batchId: string) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const clientsToRollback = clients.filter(c => c.importBatchId === batchId);
      const clientIds = clientsToRollback.map(c => c.id);

      if (clientIds.length > 0) {
        await fetch('/api/clients/delete-multiple', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ ids: clientIds })
        });
      }

      const paymentIds = payments
        .filter(p => clientsToRollback.some(c => c.id === p.clientId))
        .map(p => p.id);

      if (paymentIds.length > 0) {
        for (const pid of paymentIds) {
          await fetch('/api/payments/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: pid })
          });
        }
      }

      await fetch('/api/import-batches/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: batchId, updates: { status: 'Rolled Back' } })
      });

      await addAuditLog('DELETE', 'CLIENT', batchId, `Rolled back import batch, deleted ${clientsToRollback.length} records and ${paymentIds.length} payments`);
      
      await fetchImportBatches();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `importBatches/${batchId}`);
    }
  };

  return { importBatches, loading, addImportBatch, rollbackImport };
};
