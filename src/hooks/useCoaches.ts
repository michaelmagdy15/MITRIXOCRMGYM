import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, setDoc, query, where, getDocs, runTransaction } from 'firebase/firestore';
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



  useEffect(() => {
    if (!currentUser) {
      setCoaches([]);
      setLoading(false);
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
    const counterRef = doc(db, 'counters', 'coaches');
    try {
      const nextId = await runTransaction(db, async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentId = 0;
        if (counterDoc.exists()) {
          currentId = counterDoc.data().lastId || 0;
        }
        transaction.set(counterRef, { lastId: currentId + 1 }, { merge: true });
        return currentId + 1;
      });
      return `COACH-${String(nextId).padStart(3, '0')}`;
    } catch (error) {
      console.error('Error generating coach ID:', error);
      return `COACH-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
    }
  };

  const addCoach = async (coach: Omit<Coach, 'id'>) => {
    try {
      const docId = doc(collection(db, 'coaches')).id;
      const finalCoach: any = { ...coach };

      await setDoc(doc(db, 'coaches', docId), cleanData(finalCoach));

      if (coach.active) {
        try {
          const coachId = await generateCoachId();
          const coachNum = coachId.split('-')[1] || '000';
          const firstName = (coach.name || '').split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '') || 'coach';
          const tenantPrefix = getTenantId() || 'mitrixogymcrm';
          const email = `${tenantPrefix}-coach-${firstName.toLowerCase()}-${coachNum}@mitrixogymcrm-coach.local`;
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
          await updateDoc(doc(db, 'coaches', docId), { userId: uid });
        } catch (authErr) {
          console.error("Auto coach portal account creation failed:", authErr);
        }
      }

      await addAuditLog('CREATE', 'COACH', docId, `Created coach: ${coach.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'coaches', true);
    }
  };

  const updateCoach = async (id: string, updates: Partial<Coach>) => {
    try {
      const existing = coaches.find(c => c.id === id);
      const updateData = { ...updates };
      const isNowActive = updates.active === true || (existing?.active === true && updates.active === undefined);
      const hasNoUser = !existing?.userId && !updates.userId;

      // Sync phone, name, or active status changes to linked user if user already exists
      if (existing?.userId && (updates.phone !== undefined || updates.name !== undefined || updates.active !== undefined)) {
        try {
          const userUpdates: Partial<User> = {};
          if (updates.phone !== undefined) userUpdates.phone = updates.phone;
          if (updates.name !== undefined) userUpdates.name = updates.name;
          if (updates.active !== undefined) userUpdates.status = updates.active ? 'working' : 'nonworking';
          await updateDoc(doc(db, 'users', existing.userId), cleanData(userUpdates));
        } catch (syncErr) {
          console.error("Failed to sync coach info to user account:", syncErr);
        }
      }

      await updateDoc(doc(db, 'coaches', id), cleanData(updateData));

      if (isNowActive && hasNoUser) {
        try {
          const coachId = await generateCoachId();
          const coachNum = coachId.split('-')[1] || '000';
          const coachName = updates.name || existing?.name || '';
          const firstName = coachName.split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '') || 'coach';
          const tenantPrefix = getTenantId() || 'mitrixogymcrm';
          const email = `${tenantPrefix}-coach-${firstName.toLowerCase()}-${coachNum}@mitrixogymcrm-coach.local`;
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
          await updateDoc(doc(db, 'coaches', id), { userId: uid });
        } catch (authErr) {
          console.error("Auto coach portal account creation on update failed:", authErr);
        }
      }

      const coachName = coaches.find(c => c.id === id)?.name || id;
      await addAuditLog('UPDATE', 'COACH', id, `Updated coach: ${coachName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `coaches/${id}`, true);
    }
  };

  const createPortalAccountForCoach = async (coach: Coach): Promise<{ success: boolean; user?: User; error?: string }> => {
    try {
      const coachId = await generateCoachId();
      const coachNum = coachId.split('-')[1] || '000';
      const firstName = (coach.name || '').split(' ')[0]?.replace(/[^a-zA-Z0-9]/g, '') || 'coach';
      const tenantPrefix = getTenantId() || 'mitrixogymcrm';
      const email = `${tenantPrefix}-coach-${firstName.toLowerCase()}-${coachNum}@mitrixogymcrm-coach.local`;
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
      await updateDoc(doc(db, 'coaches', coach.id), { userId: uid });
      await addAuditLog('CREATE', 'USER', uid, `Created coach portal account for ${coach.name} (${coachId})`);

      return { success: true, user: newUser };
    } catch (err: any) {
      console.error("Error creating portal account for coach:", err);
      return { success: false, error: err?.message || String(err) };
    }
  };

  const deleteCoach = async (id: string) => {
    try {
      const coachName = coaches.find(c => c.id === id)?.name || id;
      await deleteDoc(doc(db, 'coaches', id));
      await addAuditLog('DELETE', 'COACH', id, `Deleted coach: ${coachName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `coaches/${id}`, true);
    }
  };

  return { coaches, loading, addCoach, updateCoach, deleteCoach, createPortalAccountForCoach };
};
