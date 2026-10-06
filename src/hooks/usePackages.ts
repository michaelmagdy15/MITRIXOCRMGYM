import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Package } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';

export const usePackages = () => {
  const { currentUser } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setPackages([]);
      setLoading(false);
      setError(null);
      return;
    }
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
      setLoading(false);
      setError(null);
    }, (err) => {
      const errMsg = err?.message || 'Failed to fetch packages from database';
      console.error('[Packages] Failed to fetch packages:', err);
      setError(errMsg);
      toast.error(`Package sync error: ${errMsg}`);
      setLoading(false);
    });
    return () => unsub();
  }, [currentUser]);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'packages'));
      const docId = docRef.id;
      const dataToSave = cleanData({
        ...pkg,
        isActive: pkg.isActive !== false,
        is_active: pkg.is_active !== false,
        createdAt: new Date().toISOString()
      });
      await setDoc(docRef, dataToSave);
      await addAuditLog('CREATE', 'CLIENT', docId, `Created package: ${pkg.name}${pkg.category ? ` [${pkg.category}]` : ''}`, currentUser?.name);
      toast.success(`Package "${pkg.name}" created successfully`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to create package';
      console.error('[Packages] addPackage error:', err);
      toast.error(`Failed to save package: ${msg}`);
      throw err;
    }
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    try {
      await updateDoc(doc(db, 'packages', id), cleanData({
        ...updates,
        updatedAt: new Date().toISOString()
      }));
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated package: ${pkgName}`, currentUser?.name);
      toast.success(`Package "${pkgName}" updated successfully`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to update package';
      console.error('[Packages] updatePackage error:', err);
      toast.error(`Failed to update package: ${msg}`);
      throw err;
    }
  };

  const archivePackage = async (id: string, reason?: string) => {
    try {
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
      toast.success(`Package "${pkgName}" archived`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to archive package';
      console.error('[Packages] archivePackage error:', err);
      toast.error(`Failed to archive package: ${msg}`);
      throw err;
    }
  };

  const restorePackage = async (id: string) => {
    try {
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
      toast.success(`Package "${pkgName}" restored to active status`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to restore package';
      console.error('[Packages] restorePackage error:', err);
      toast.error(`Failed to restore package: ${msg}`);
      throw err;
    }
  };

  const recalculateAllPackages = async () => {};

  return { packages, loading, error, addPackage, updatePackage, deletePackage: archivePackage, restorePackage, recalculateAllPackages };
};

