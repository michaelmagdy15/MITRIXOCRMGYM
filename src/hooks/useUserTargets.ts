import { useState, useEffect, useCallback } from 'react';
import { UserSalesTarget, User } from '../types';
import { auth } from '../firebase';
import { addAuditLog } from '../services/auditService';
import { cleanData } from '../utils';

export const useUserTargets = (currentUser: User | null) => {
  const [userTargets, setUserTargets] = useState<UserSalesTarget[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUserTargets = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/user-targets', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUserTargets(data.targets || []);
      }
    } catch (err) {
      console.error('[Targets] Failed to fetch targets:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }
    fetchUserTargets();
  }, [currentUser, fetchUserTargets]);

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
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/user-targets/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ id: targetId, target: cleanData(targetData) })
      });
      if (res.ok) {
        await fetchUserTargets();
      }
      await addAuditLog('UPDATE', 'TARGET', targetId, `Updated target for user ${userId} for ${month}: ${targetAmount} LE`);
    } catch (error) {
      console.error('Failed to update target', error);
    }
  };

  return { userTargets, loading, updateUserTarget };
};
