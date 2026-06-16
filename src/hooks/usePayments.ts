import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Payment, Client, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';

interface UsePaymentsOptions {
  currentUser: User | null;
  clients: Client[];
  canDeletePayments: boolean;
}

export const usePayments = ({ currentUser, clients, canDeletePayments }: UsePaymentsOptions) => {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser || currentUser.role === 'coach' || currentUser.role === 'client') {
      setPayments([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(collection(db, 'payments'), (snapshot) => {
      // Filter out soft-deleted payments (where deleted_at is not null)
      setPayments(snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as Payment))
        .filter(p => !p.deleted_at)
      );
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const addPayment = async (payment: Omit<Payment, 'id' | 'client_name' | 'amount_paid' | 'created_at' | 'package_category_type' | 'deleted_at'>) => {
    if (!currentUser) return;
    try {
      const client = clients.find(c => c.id === payment.clientId);
      const clientName = client?.name || payment.clientId;

      const paymentData = {
        ...payment,
        client_name: clientName,
        amount_paid: payment.amount,
        sales_rep_id: payment.sales_rep_id || '',
        created_at: new Date().toISOString(),
        package_category_type: payment.packageType.toLowerCase().includes('pt') || payment.packageType.toLowerCase().includes('private')
          ? 'Private Training'
          : 'Group Training',
        deleted_at: null
      };

      const docRef = await addDoc(collection(db, 'payments'), cleanData(paymentData));
      await addAuditLog('CREATE', 'PAYMENT', docRef.id, `Recorded payment of ${payment.amount} LE for ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    }
  };

  const deletePayment = async (id: string) => {
    if (!canDeletePayments) {
      throw new Error('Unauthorized: You do not have permission to delete payments.');
    }
    try {
      const payment = payments.find(p => p.id === id);
      const clientName = payment
        ? (clients.find(c => c.id === payment.clientId)?.name || payment.clientId)
        : id;
      const amount = payment?.amount || 'unknown';

      await deleteDoc(doc(db, 'payments', id));
      await addAuditLog('DELETE', 'PAYMENT', id, `Deleted payment of ${amount} LE for ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `payments/${id}`);
    }
  };

  const updatePayment = async (id: string, updates: Partial<Payment>) => {
    if (!currentUser) return;
    try {
      const payment = payments.find(p => p.id === id);
      const clientName = payment
        ? (clients.find(c => c.id === payment.clientId)?.name || payment.clientId)
        : id;

      await updateDoc(doc(db, 'payments', id), cleanData(updates));
      await addAuditLog('UPDATE', 'PAYMENT', id, `Updated payment for ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${id}`);
    }
  };

  return { payments, loading, addPayment, deletePayment, updatePayment };
};
