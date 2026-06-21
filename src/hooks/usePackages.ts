import { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Package } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { PACKAGES } from '../constants';
import { useAuth } from '../contexts/AuthContext';

export const usePackages = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guests (not logged in) — one-time public read of packages
    if (!currentUser) {
      getDocs(collection(db, 'packages'))
        .then((snapshot) => {
          setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
        })
        .catch((err) => {
          console.warn('Could not load packages for guest:', err.code || err.message);
        })
        .finally(() => setLoading(false));
      return;
    }

    // Members/coaches — one-time read (no real-time listener to save reads)
    if (effectiveRole === 'client' || effectiveRole === 'coach') {
      getDocs(collection(db, 'packages'))
        .then((snapshot) => {
          setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
        })
        .catch((err) => {
          console.warn('Could not load packages for member:', err.code || err.message);
        })
        .finally(() => setLoading(false));
      return;
    }

    // Admins/managers — real-time listener
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Package)));
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'packages');
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser, effectiveRole]);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    try {
      const docRef = await addDoc(collection(db, 'packages'), cleanData(pkg));
      await addAuditLog('CREATE', 'CLIENT', docRef.id, `Created package: ${pkg.name}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'packages');
    }
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    try {
      await updateDoc(doc(db, 'packages', id), cleanData(updates));
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated package: ${pkgName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `packages/${id}`);
    }
  };

  const deletePackage = async (id: string) => {
    try {
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await deleteDoc(doc(db, 'packages', id));
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted package: ${pkgName}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `packages/${id}`);
    }
  };

  const recalculateAllPackages = async () => {
    // This part requires access to clients which would likely be passed or imported. Let's see how it's implemented.
    // In context.tsx it is `recalculateAllPackages()`. We can extract it later or leave it in context for now, or fetch clients locally.
    // Let me check context.tsx implementation.
  };

  return { packages, loading, addPackage, updatePackage, deletePackage, recalculateAllPackages };
};
