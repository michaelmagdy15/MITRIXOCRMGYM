import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { db, createFirebaseUser, getTenantId, auth } from '../firebase';
import { Coach, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const useCoaches = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoaches = async () => {
    if (getTenantId() !== 'inzanathletics') return;
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/coaches', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCoaches(data.coaches || []);
      }
    } catch (err) {
      console.error('[Coaches] Failed to fetch coaches:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      setCoaches([]);
      setLoading(false);
      return;
    }

    if (getTenantId() === 'inzanathletics') {
      fetchCoaches();
      return;
    }

    // Members/coaches can't list all coaches — skip the global listener
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(collection(db, 'coaches'), (snapshot) => {
      setCoaches(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Coach)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'coaches');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, effectiveRole]);

  const generateCoachId = async (): Promise<string> => {
    const q = query(collection(db, 'users'), where('role', '==', 'coach'));
    const snap = await getDocs(q);
    const nums = snap.docs
      .map(d => (d.data().coachId as string) || '')
      .filter(id => id.startsWith('COACH-'))
      .map(id => parseInt(id.split('-')[1] || '0', 10))
      .filter(n => !isNaN(n));
    const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
    return `COACH-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const addCoach = async (coach: Omit<Coach, 'id'>) => {
    try {
      const docId = doc(collection(db, 'coaches')).id;
      const finalCoach: any = { ...coach };

      if (coach.active) {
        try {
          const coachId = await generateCoachId();
          const coachNum = coachId.split('-')[1] || '000';
          const firstName = (coach.name || '').split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '') || 'coach';
          const email = `coach-${firstName.toLowerCase()}-${coachNum}@mitrixogymcrm-coach.local`;
          const uid = await createFirebaseUser(email, '12345678');

          const newUser: User = {
            id: uid,
            name: coach.name,
            email,
            role: 'coach',
            coachId,
            mustChangePassword: true,
            phone: coach.phone || ''
          };

          await setDoc(doc(db, 'users', uid), newUser);
          finalCoach.userId = uid;
        } catch (authErr) {
          console.error("Auto coach portal account creation failed:", authErr);
        }
      }

      if (getTenantId() === 'inzanathletics') {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/coaches/add', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id: docId, coach: cleanData(finalCoach) })
        });
        await fetchCoaches();
      } else {
        await setDoc(doc(db, 'coaches', docId), cleanData(finalCoach));
      }

      await addAuditLog('CREATE', 'COACH', docId, `Created coach: ${coach.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'coaches');
    }
  };

  const updateCoach = async (id: string, updates: Partial<Coach>) => {
    try {
      const existing = coaches.find(c => c.id === id);
      const updateData = { ...updates };
      const isNowActive = updates.active === true || (existing?.active === true && updates.active === undefined);
      const hasNoUser = !existing?.userId && !updates.userId;

      // Sync phone or name changes to linked user if user already exists
      if (existing?.userId && (updates.phone !== undefined || updates.name !== undefined)) {
        try {
          const userUpdates: Partial<User> = {};
          if (updates.phone !== undefined) userUpdates.phone = updates.phone;
          if (updates.name !== undefined) userUpdates.name = updates.name;
          await updateDoc(doc(db, 'users', existing.userId), cleanData(userUpdates));
        } catch (syncErr) {
          console.error("Failed to sync coach info to user account:", syncErr);
        }
      }

      if (isNowActive && hasNoUser) {
        try {
          const coachId = await generateCoachId();
          const coachNum = coachId.split('-')[1] || '000';
          const coachName = updates.name || existing?.name || '';
          const firstName = coachName.split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '') || 'coach';
          const email = `coach-${firstName.toLowerCase()}-${coachNum}@mitrixogymcrm-coach.local`;
          const uid = await createFirebaseUser(email, '12345678');

          const newUser: User = {
            id: uid,
            name: coachName,
            email,
            role: 'coach',
            coachId,
            mustChangePassword: true,
            phone: updates.phone || existing?.phone || ''
          };

          await setDoc(doc(db, 'users', uid), newUser);
          updateData.userId = uid;
        } catch (authErr) {
          console.error("Auto coach portal account creation on update failed:", authErr);
        }
      }

      if (getTenantId() === 'inzanathletics') {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/coaches/update', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id, updates: cleanData(updateData) })
        });
        await fetchCoaches();
      } else {
        await updateDoc(doc(db, 'coaches', id), cleanData(updateData));
      }

      const coachName = coaches.find(c => c.id === id)?.name || id;
      await addAuditLog('UPDATE', 'COACH', id, `Updated coach: ${coachName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coaches/${id}`);
    }
  };

  const deleteCoach = async (id: string) => {
    try {
      const coachName = coaches.find(c => c.id === id)?.name || id;
      if (getTenantId() === 'inzanathletics') {
        const token = await auth.currentUser?.getIdToken();
        await fetch('/api/coaches/delete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ id })
        });
        await fetchCoaches();
      } else {
        await deleteDoc(doc(db, 'coaches', id));
      }
      await addAuditLog('DELETE', 'COACH', id, `Deleted coach: ${coachName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coaches/${id}`);
    }
  };

  return { coaches, loading, addCoach, updateCoach, deleteCoach };
};
