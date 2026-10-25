import { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc } from 'firebase/firestore';
import { Package, PackageVersion } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { createPackageVersionRecord, hasPackageBenefitsChanged } from '../utils/packageVersioning';

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
      const nowIso = pkg.createdAt || new Date().toISOString();
      const createdBy = pkg.createdBy || auth.currentUser?.uid || currentUser?.id || '';
      const createdByName = pkg.createdByName || auth.currentUser?.displayName || currentUser?.name || auth.currentUser?.email || 'Admin';
      const status = pkg.status || 'Active';
      const isHold = status === 'Hold';
      const initialPkg: Package = {
        ...(pkg as Package),
        id: docId,
        version: 1,
        status,
        isActive: isHold ? false : pkg.isActive !== false,
        is_active: isHold ? false : pkg.is_active !== false,
        createdAt: nowIso,
        createdBy,
        createdByName,
      };
      const v1Record = createPackageVersionRecord(initialPkg, {
        version: 1,
        effectiveFrom: nowIso,
        createdBy,
        createdByName,
        changeNotes: 'Initial package version',
      });
      const dataToSave = cleanData({
        ...initialPkg,
        version: 1,
        versionHistory: [v1Record],
      });
      await setDoc(docRef, dataToSave);
      try {
        await setDoc(doc(db, 'packages', docId, 'versions', 'v1'), cleanData(v1Record));
      } catch {}
      await addAuditLog('CREATE', 'CLIENT', docId, `Created package: ${pkg.name} (v1)${pkg.category ? ` [${pkg.category}]` : ''}`, currentUser?.name);
      toast.success(`Package "${pkg.name}" created (v1)`);
    } catch (err: any) {
      const msg = err?.message || 'Failed to create package';
      console.error('[Packages] addPackage error:', err);
      toast.error(`Failed to save package: ${msg}`);
      throw err;
    }
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    try {
      const nowIso = new Date().toISOString();
      const existingPkg = packages.find(p => p.id === id);
      const actorId = auth.currentUser?.uid || currentUser?.id || '';
      const actorName = auth.currentUser?.displayName || currentUser?.name || auth.currentUser?.email || 'Admin';

      let versionUpdates: Partial<Package> = {};
      let nextVersionNum = existingPkg?.version || 1;
      let didIncrementVersion = false;

      if (existingPkg && hasPackageBenefitsChanged(existingPkg, updates)) {
        const prevVersionNum = existingPkg.version && existingPkg.version > 0 ? existingPkg.version : 1;
        nextVersionNum = prevVersionNum + 1;
        didIncrementVersion = true;

        const existingHistory: PackageVersion[] = Array.isArray(existingPkg.versionHistory)
          ? [...existingPkg.versionHistory]
          : [];

        // Close out the prior active version record (or synthesize v1 if legacy package had no history array yet)
        const hasPrevInHistory = existingHistory.some(v => v.version === prevVersionNum);
        const closedHistory = hasPrevInHistory
          ? existingHistory.map(v =>
              v.version === prevVersionNum && !v.effectiveUntil
                ? { ...v, effectiveUntil: nowIso }
                : v
            )
          : [
              ...existingHistory,
              createPackageVersionRecord(existingPkg, {
                version: prevVersionNum,
                effectiveFrom: existingPkg.createdAt || nowIso,
                effectiveUntil: nowIso,
                createdBy: existingPkg.createdBy,
                createdByName: existingPkg.createdByName,
                changeNotes: 'Legacy version archived before benefit update',
              }),
            ];

        const mergedNextPkg: Package = {
          ...existingPkg,
          ...updates,
          id,
          version: nextVersionNum,
          updatedAt: nowIso,
        };

        const nextVersionRecord = createPackageVersionRecord(mergedNextPkg, {
          version: nextVersionNum,
          effectiveFrom: nowIso,
          createdBy: actorId,
          createdByName: actorName,
          changeNotes: `Updated package benefits/terms (v${prevVersionNum} -> v${nextVersionNum})`,
        });

        versionUpdates = {
          version: nextVersionNum,
          versionHistory: [...closedHistory, nextVersionRecord],
        };

        try {
          await setDoc(doc(db, 'packages', id, 'versions', `v${nextVersionNum}`), cleanData(nextVersionRecord));
        } catch {}
      }

      await updateDoc(doc(db, 'packages', id), cleanData({
        ...updates,
        ...versionUpdates,
        updatedAt: nowIso
      }));
      const pkgName = updates.name || existingPkg?.name || id;
      await addAuditLog(
        'UPDATE',
        'CLIENT',
        id,
        didIncrementVersion
          ? `Updated package "${pkgName}" benefits → published v${nextVersionNum} (existing members remain on prior version snapshot)`
          : `Updated package: ${pkgName}`,
        currentUser?.name
      );
      toast.success(
        didIncrementVersion
          ? `Package "${pkgName}" updated to v${nextVersionNum} (existing members retain original benefits)`
          : `Package "${pkgName}" updated successfully`
      );
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


