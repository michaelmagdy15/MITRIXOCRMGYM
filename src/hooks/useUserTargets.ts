import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { UserSalesTarget, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { addAuditLog } from '../services/auditService';
import { cleanData } from '../utils';

export const useUserTargets = (currentUser: User | null) => {
  const [userTargets, setUserTargets] = useState<UserSalesTarget[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;

    if (currentUser.role === 'manager' || currentUser.role === 'admin' || currentUser.role === 'super_admin' || currentUser.role === 'crm_admin') {
      unsub = onSnapshot(collection(db, 'targets'), (snapshot) => {
        setUserTargets(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UserSalesTarget)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'targets');
        setLoading(false);
      });
    } else if (currentUser.role === 'rep') {
      const q = query(collection(db, 'targets'), where('userId', '==', currentUser.id));
      unsub = onSnapshot(q, (snapshot) => {
        setUserTargets(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UserSalesTarget)));
        setLoading(false);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'targets');
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    return () => {
      if (unsub) unsub();
    };
  }, [currentUser]);

  const updateUserTarget = async (userId: string, month: string, targetAmount: number) => {
    if (!currentUser) return;
    try {
      const targetId = `${userId}_${month}`;
      const targetData: UserSalesTarget = {
        id: targetId,
        userId,
        sales_rep_id: userId,
        month,
        month_year: month,
        targetAmount,
        setBy: currentUser.id,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'targets', targetId), cleanData(targetData), { merge: true });
      await addAuditLog('UPDATE', 'TARGET', targetId, `Updated target for user ${userId} for ${month}: ${targetAmount} LE`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `targets/${userId}_${month}`);
    }
  };

  return { userTargets, loading, updateUserTarget };
};
