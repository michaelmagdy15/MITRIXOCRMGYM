import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { collection, doc, updateDoc, onSnapshot, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { Payment, Client, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
import { resolvePaymentCategory } from '../utils/paymentCategories';
import { isPaymentEditableByStaff } from '../utils/permissions';
import { isTenantInzan } from '../utils/inzanOrg';

interface UsePaymentsOptions {
  currentUser: User | null;
  clients: Client[];
  canDeletePayments: boolean;
}

export const usePayments = ({ currentUser, clients, canDeletePayments }: UsePaymentsOptions) => {
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [historicalPayments, setHistoricalPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [historicalPaymentsLoaded, setHistoricalPaymentsLoaded] = useState(false);
  const [loadingHistoricalPayments, setLoadingHistoricalPayments] = useState(false);
  const historicalLoadPromiseRef = useRef<Promise<void> | null>(null);
  const { effectiveRole } = useAuth();

  const ninetyDaysAgoIso = useMemo(
    () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    []
  );

  useEffect(() => {
    if (!currentUser || effectiveRole === 'coach' || effectiveRole === 'client') {
      setRecentPayments([]);
      setHistoricalPayments([]);
      setHistoricalPaymentsLoaded(false);
      setLoading(false);
      return;
    }

    // Scope real-time listener to the last 90 days to save memory and Firestore read quota;
    // older payments are loaded on-demand via fetchHistoricalPayments().
    const recentPaymentsQuery = query(
      collection(db, 'payments'),
      where('date', '>=', ninetyDaysAgoIso)
    );

    const unsub = onSnapshot(recentPaymentsQuery, (snapshot) => {
      // Filter out soft-deleted payments (where deleted_at is not null), unless status is refunded
      setRecentPayments(snapshot.docs
        .map(d => ({ ...d.data(), id: d.id } as Payment))
        .filter(p => !p.deleted_at || p.status === 'refunded')
      );
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'payments');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser?.id, currentUser?.role, effectiveRole, ninetyDaysAgoIso]);

  const fetchHistoricalPayments = useCallback(async () => {
    if (!currentUser || effectiveRole === 'coach' || effectiveRole === 'client') return;
    if (historicalPaymentsLoaded) return;
    if (historicalLoadPromiseRef.current) return historicalLoadPromiseRef.current;

    setLoadingHistoricalPayments(true);
    const loadPromise = (async () => {
      try {
        const olderQuery = query(
          collection(db, 'payments'),
          where('date', '<', ninetyDaysAgoIso)
        );
        const snap = await getDocs(olderQuery);
        let docsList = snap.docs
          .map(d => ({ ...d.data(), id: d.id } as Payment))
          .filter(p => !p.deleted_at || p.status === 'refunded');

        // Fallback check for legacy docs missing a `date` field
        if (docsList.length === 0 && recentPayments.length === 0) {
          const allSnap = await getDocs(collection(db, 'payments'));
          docsList = allSnap.docs
            .map(d => ({ ...d.data(), id: d.id } as Payment))
            .filter(p => !p.deleted_at || p.status === 'refunded');
        }

        setHistoricalPayments(docsList);
        setHistoricalPaymentsLoaded(true);
      } catch (error) {
        console.error('[usePayments] Failed to fetch historical payments:', error);
      } finally {
        setLoadingHistoricalPayments(false);
        historicalLoadPromiseRef.current = null;
      }
    })();

    historicalLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }, [currentUser, effectiveRole, historicalPaymentsLoaded, ninetyDaysAgoIso, recentPayments.length]);

  const payments = useMemo(() => {
    if (historicalPayments.length === 0) return recentPayments;
    const byId = new Map<string, Payment>();
    for (const p of historicalPayments) {
      if (p?.id) byId.set(p.id, p);
    }
    for (const p of recentPayments) {
      if (p?.id) byId.set(p.id, p);
    }
    return Array.from(byId.values());
  }, [recentPayments, historicalPayments]);



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
        package_category_type: resolvePaymentCategory(payment.packageType),
        deleted_at: null
      };

      const docRef = doc(collection(db, 'payments'));
      const docId = docRef.id;

      await setDoc(docRef, cleanData(paymentData), { merge: true });
      await addAuditLog('CREATE', 'PAYMENT', docId, `Recorded payment of ${payment.amount} LE for ${clientName}`, currentUser?.name);
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

      await updateDoc(doc(db, 'payments', id), { deleted_at: new Date().toISOString() });
      await addAuditLog('DELETE', 'PAYMENT', id, `Deleted payment of ${amount} LE for ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `payments/${id}`);
    }
  };

  const updatePayment = async (id: string, updates: Partial<Payment>) => {
    if (!currentUser) return;
    try {
      const payment = payments.find(p => p.id === id);
      const isInzan = isTenantInzan() || getTenantId().toLowerCase().includes('inzan');
      if (payment && isInzan) {
        const editCheck = isPaymentEditableByStaff(payment, currentUser, canDeletePayments);
        if (!editCheck.canEdit) {
          throw new Error(editCheck.reason || 'Unauthorized to modify this payment.');
        }
      }
      const clientName = payment
        ? (clients.find(c => c.id === payment.clientId)?.name || payment.clientId)
        : id;

      await updateDoc(doc(db, 'payments', id), cleanData(updates));
      await addAuditLog('UPDATE', 'PAYMENT', id, `Updated payment for ${clientName}`, currentUser?.name);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `payments/${id}`);
    }
  };

  return {
    payments,
    loading,
    historicalPaymentsLoaded,
    loadingHistoricalPayments,
    fetchHistoricalPayments,
    addPayment,
    deletePayment,
    updatePayment
  };
};
