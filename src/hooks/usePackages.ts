import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { Package } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const usePackages = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
      setLoading(false);
    }, (error) => {
      console.error('[Packages] Failed to fetch packages:', error);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'packages'));
      const docId = docRef.id;
      await setDoc(docRef, cleanData(pkg));
      await addAuditLog('CREATE', 'CLIENT', docId, `Created package: ${pkg.name}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to add package:', error);
    }
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    try {
      await updateDoc(doc(db, 'packages', id), cleanData(updates));
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated package: ${pkgName}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to update package:', error);
    }
  };

  const deletePackage = async (id: string) => {
    try {
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await deleteDoc(doc(db, 'packages', id));
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted package: ${pkgName}`, currentUser?.name);
    } catch (error) {
      console.error('Failed to delete package:', error);
    }
  };

  const recalculateAllPackages = async () => {};

  return { packages, loading, addPackage, updatePackage, deletePackage, recalculateAllPackages };
};
