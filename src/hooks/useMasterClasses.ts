import { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { toast } from 'sonner';
import { db, auth } from '../firebase';
import { MasterClassDefinition } from '../types/class';
import { addAuditLog } from '../services/auditService';
import { cleanData } from '../utils';

export function useMasterClasses(): {
  masterClasses: MasterClassDefinition[];
  loading: boolean;
  addMasterClass: (data: Omit<MasterClassDefinition, 'id' | 'createdAt'>) => Promise<string>;
  updateMasterClass: (id: string, updates: Partial<MasterClassDefinition>) => Promise<void>;
  toggleMasterClassStatus: (id: string, nextStatus: 'Active' | 'On Hold') => Promise<void>;
  deleteMasterClass: (id: string) => Promise<void>;
} {
  const [masterClasses, setMasterClasses] = useState<MasterClassDefinition[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const colRef = collection(db, 'masterClasses');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const items = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        })) as MasterClassDefinition[];

        items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setMasterClasses(items);
        setLoading(false);
      },
      (error) => {
        console.error('[useMasterClasses] Error subscribing to masterClasses:', error);
        toast.error('Failed to load master class library');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addMasterClass = async (
    data: Omit<MasterClassDefinition, 'id' | 'createdAt'>
  ): Promise<string> => {
    try {
      const newDocRef = doc(collection(db, 'masterClasses'));
      const now = new Date().toISOString();
      const currentUser = auth.currentUser;
      const userName = currentUser?.displayName || currentUser?.email || undefined;

      const payload: MasterClassDefinition = {
        ...data,
        id: newDocRef.id,
        status: data.status || 'Active',
        price: data.classType === 'Free' ? 0 : Number(data.price || 0),
        createdAt: now,
        updatedAt: now,
        createdBy: data.createdBy || currentUser?.uid,
        createdByName: data.createdByName || userName,
      };

      await setDoc(newDocRef, cleanData(payload));
      await addAuditLog(
        'CREATE',
        'CLASS',
        newDocRef.id,
        `Created master class definition: ${payload.name} (${payload.classType}, capacity ${payload.capacity})`,
        userName
      );
      toast.success(`Master class "${payload.name}" added to library`);
      return newDocRef.id;
    } catch (error) {
      console.error('[useMasterClasses] Error adding master class:', error);
      toast.error('Failed to add master class');
      throw error;
    }
  };

  const updateMasterClass = async (
    id: string,
    updates: Partial<MasterClassDefinition>
  ): Promise<void> => {
    try {
      const docRef = doc(db, 'masterClasses', id);
      const now = new Date().toISOString();
      const currentUser = auth.currentUser;
      const userName = currentUser?.displayName || currentUser?.email || undefined;

      const payload = cleanData({
        ...updates,
        ...(updates.classType === 'Free' ? { price: 0 } : {}),
        updatedAt: now,
      });

      await updateDoc(docRef, payload);
      const className = updates.name || masterClasses.find((mc) => mc.id === id)?.name || id;
      await addAuditLog(
        'UPDATE',
        'CLASS',
        id,
        `Updated master class definition: ${className}. Fields: ${Object.keys(updates).join(', ')}`,
        userName
      );
      toast.success(`Master class "${className}" updated`);
    } catch (error) {
      console.error('[useMasterClasses] Error updating master class:', error);
      toast.error('Failed to update master class');
      throw error;
    }
  };

  const toggleMasterClassStatus = async (
    id: string,
    nextStatus: 'Active' | 'On Hold'
  ): Promise<void> => {
    try {
      const docRef = doc(db, 'masterClasses', id);
      const now = new Date().toISOString();
      const currentUser = auth.currentUser;
      const userName = currentUser?.displayName || currentUser?.email || undefined;

      await updateDoc(docRef, {
        status: nextStatus,
        updatedAt: now,
      });
      const className = masterClasses.find((mc) => mc.id === id)?.name || id;
      await addAuditLog(
        'UPDATE',
        'CLASS',
        id,
        `Changed master class status for "${className}" to ${nextStatus}`,
        userName
      );
      toast.success(`Master class "${className}" is now ${nextStatus}`);
    } catch (error) {
      console.error('[useMasterClasses] Error toggling master class status:', error);
      toast.error('Failed to update master class status');
      throw error;
    }
  };

  const deleteMasterClass = async (id: string): Promise<void> => {
    try {
      const className = masterClasses.find((mc) => mc.id === id)?.name || id;
      const currentUser = auth.currentUser;
      const userName = currentUser?.displayName || currentUser?.email || undefined;

      await deleteDoc(doc(db, 'masterClasses', id));
      await addAuditLog(
        'DELETE',
        'CLASS',
        id,
        `Deleted master class definition: ${className}`,
        userName
      );
      toast.success(`Master class "${className}" deleted`);
    } catch (error) {
      console.error('[useMasterClasses] Error deleting master class:', error);
      toast.error('Failed to delete master class');
      throw error;
    }
  };

  return {
    masterClasses,
    loading,
    addMasterClass,
    updateMasterClass,
    toggleMasterClassStatus,
    deleteMasterClass,
  };
}
