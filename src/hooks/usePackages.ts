import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { Package } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from '../services/auditService';
import { useAuth } from '../contexts/AuthContext';

export const usePackages = () => {
  const { currentUser, effectiveRole } = useAuth();
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPackages = useCallback(async () => {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/packages', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        setPackages(data.packages || []);
      }
    } catch (err) {
      console.error('[Packages] Failed to fetch packages:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  const addPackage = async (pkg: Omit<Package, 'id'>) => {
    try {
      const docId = Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/packages/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id: docId, pkg: cleanData(pkg) })
      });
      await fetchPackages();
      await addAuditLog('CREATE', 'CLIENT', docId, `Created package: ${pkg.name}`);
    } catch (error) {
      console.error('Failed to add package:', error);
    }
  };

  const updatePackage = async (id: string, updates: Partial<Package>) => {
    try {
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/packages/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id, updates: cleanData(updates) })
      });
      await fetchPackages();
      const pkgName = packages.find(p => p.id === id)?.name || id;
      await addAuditLog('UPDATE', 'CLIENT', id, `Updated package: ${pkgName}`);
    } catch (error) {
      console.error('Failed to update package:', error);
    }
  };

  const deletePackage = async (id: string) => {
    try {
      const pkgName = packages.find(p => p.id === id)?.name || id;
      const token = await auth.currentUser?.getIdToken();
      await fetch('/api/packages/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id })
      });
      await fetchPackages();
      await addAuditLog('DELETE', 'CLIENT', id, `Deleted package: ${pkgName}`);
    } catch (error) {
      console.error('Failed to delete package:', error);
    }
  };

  const recalculateAllPackages = async () => {};

  return { packages, loading, addPackage, updatePackage, deletePackage, recalculateAllPackages };
};
