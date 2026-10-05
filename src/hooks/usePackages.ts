import { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Package } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const usePackages = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setPackages([]);
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
      setLoading(false);
    }, (error) => {
      console.error('[Packages] Failed to fetch packages:', error);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    const docRef = doc(collection(db, 'packages'));
    const docId = docRef.id;
    await setDoc(docRef, cleanData(pkg));
    await addAuditLog('CREATE', 'CLIENT', docId, `Created package: ${pkg.name}`, currentUser?.name);
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    await updateDoc(doc(db, 'packages', id), cleanData(updates));
    const pkgName = packages.find(p => p.id === id)?.name || id;
    await addAuditLog('UPDATE', 'CLIENT', id, `Updated package: ${pkgName}`, currentUser?.name);
  };

  const archivePackage = async (id: string, reason?: string) => {
    const pkg = packages.find(p => p.id === id);
    const pkgName = pkg?.name || id;
    await updateDoc(doc(db, 'packages', id), cleanData({
      isActive: false,
      is_active: false,
      archivedAt: new Date().toISOString(),
      archivedBy: currentUser?.id,
      archivedReason: reason || 'Archived by staff'
    }));
    await addAuditLog('UPDATE', 'CLIENT', id, `Archived package: ${pkgName}${reason ? ` (${reason})` : ''}`, currentUser?.name);
  };

  const restorePackage = async (id: string) => {
    const pkg = packages.find(p => p.id === id);
    const pkgName = pkg?.name || id;
    await updateDoc(doc(db, 'packages', id), cleanData({
      isActive: true,
      is_active: true,
      archivedAt: null,
      archivedBy: null,
      archivedReason: null
    }));
    await addAuditLog('UPDATE', 'CLIENT', id, `Restored package: ${pkgName}`, currentUser?.name);
  };

  const recalculateAllPackages = async () => {};

  return { packages, loading, addPackage, updatePackage, deletePackage: archivePackage, restorePackage, recalculateAllPackages };
}
