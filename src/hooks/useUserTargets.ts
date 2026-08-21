import { useState, useEffect, useCallback } from 'react';
import { UserSalesTarget, User } from '../types';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc } from 'firebase/firestore';
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
    const unsub = onSnapshot(collection(db, 'userTargets'), (snapshot) => {
      setUserTargets(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as UserSalesTarget)));
      setLoading(false);
    }, (error) => {
      console.error('[Targets] Failed to fetch targets:', error);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const updateUserTarget = async (userId: string, month: string, targetAmount: number, ptTarget?: number, classesTarget?: number, membershipsTarget?: number) => {
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
        ...(ptTarget !== undefined && { ptTarget }),
        ...(classesTarget !== undefined && { classesTarget }),
        ...(membershipsTarget !== undefined && { membershipsTarget }),
        setBy: currentUser.id,
        createdAt: new Date().toISOString()
      };
      await setDoc(doc(db, 'userTargets', targetId), cleanData(targetData));
      
      await addAuditLog('UPDATE', 'TARGET', targetId, `Updated target for user ${userId} for ${month}: ${targetAmount} LE`, currentUser?.name);
    } catch (error) {
      console.error('Failed to update target', error);
    }
  };

  return { userTargets, loading, updateUserTarget };
};
