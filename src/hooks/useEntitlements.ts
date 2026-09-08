import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { Entitlement, EntitlementAdjustment } from '../types/entitlement';

export const useEntitlements = (memberId?: string) => {
  const [entitlements, setEntitlements] = useState<Entitlement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!memberId) {
      setEntitlements([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'entitlements'),
      where('memberId', '==', memberId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Entitlement[];
      
      // Sort by creation date descending
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      setEntitlements(list);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching entitlements:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [memberId]);

  return { entitlements, loading };
};

export const useEntitlementAdjustments = (entitlementId?: string) => {
  const [adjustments, setAdjustments] = useState<EntitlementAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entitlementId) {
      setAdjustments([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, `entitlements/${entitlementId}/adjustments`),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as EntitlementAdjustment[];
      
      setAdjustments(list);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching entitlement adjustments:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [entitlementId]);

  return { adjustments, loading };
};
