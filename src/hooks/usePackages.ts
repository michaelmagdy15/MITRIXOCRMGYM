import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
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
    const unsub = onSnapshot(collection(db, 'packages'), (snapshot) => {
      setPackages(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Package)));
      setLoading(false);
      setError(null);
    }, (err) => {
      const errMsg = err?.message || 'Failed to fetch packages from database';
      console.error('[Packages] Failed to fetch packages:', err);
      setError(errMsg);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    try {
      const docRef = doc(collection(db, 'packages'));
      const docId = docRef.id;
      const status = pkg.status || 'Active';
      const isHold = status === 'Hold';
      const dataToSave = cleanData({
        ...pkg,
        status,
        isActive: isHold ? false : pkg.isActive !== false,
        is_active: isHold ? false : pkg.is_active !== false,
        createdAt: pkg.createdAt || new Date().toISOString(),
        createdBy: pkg.createdBy || auth.currentUser?.uid || currentUser?.id || '',
        createdByName: pkg.createdByName || auth.currentUser?.displayName || currentUser?.name || auth.currentUser?.email || 'Admin'
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

  const togglePackageHold = async (id: string, hold: boolean) => {
    try {
      const pkg = packages.find(p => p.id === id);
      const pkgName = pkg?.name || id;
      const newStatus = hold ? 'Hold' : 'Active';
      await updateDoc(doc(db, 'packages', id), cleanData({
        status: newStatus,
        isActive: !hold,
        is_active: !hold,
        updatedAt: new Date().toISOString()
      }));
      await addAuditLog('UPDATE', 'CLIENT', id, `Set package status to ${newStatus}: ${pkgName}`, currentUser?.name);
      toast.success(`Package "${pkgName}" is now ${hold ? 'On Hold' : 'Active'}`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to update package status';
      console.error('[Packages] togglePackageHold error:', err);
      toast.error(`Failed to update package status: ${msg}`);
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
        status: 'Active',
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

  return { packages, loading, error, addPackage, updatePackage, togglePackageHold, deletePackage: archivePackage, restorePackage, recalculateAllPackages };
};


