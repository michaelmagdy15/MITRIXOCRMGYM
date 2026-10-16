import { useState, useEffect, useMemo } from 'react';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
} from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { isTenantInzan } from '../utils/inzanOrg';
import { PackageCategoryItem } from '../types';
import { toast } from 'sonner';
import { addAuditLog } from '../services/auditService';

export const INZAN_DEFAULT_PACKAGE_CATEGORIES: string[] = [
  'Membership',
  'Classes',
  'SGF (Small Group Fitness)',
  'Personal Training',
  'Gymnastics',
  'Nutrition',
  'Physiotherapy',
  'Complimentary',
  'Drop-in / Day Pass',
  'Other',
];

export const STANDARD_DEFAULT_PACKAGE_CATEGORIES: string[] = [
  'Gym Memberships',
  'Personal Training (PT)',
  'Drop-in / Day Pass',
  'Classes',
  'Nutrition',
  'Other',
];

interface FirestorePackageCategoryDoc extends PackageCategoryItem {
  isDeleted?: boolean;
  originalDefaultName?: string;
  updatedAt?: string;
}

export function usePackageCategories(): {
  categories: PackageCategoryItem[];
  categoryNames: string[];
  loading: boolean;
  addCategory: (name: string, description?: string, createdBy?: string) => Promise<void>;
  updateCategory: (id: string, name: string, description?: string) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
} {
  const [firestoreDocs, setFirestoreDocs] = useState<FirestorePackageCategoryDoc[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const defaultCategories = useMemo(() => {
    const tenantId = getTenantId();
    const isInzan = isTenantInzan(tenantId) || tenantId.toLowerCase().includes('inzan');
    return isInzan ? INZAN_DEFAULT_PACKAGE_CATEGORIES : STANDARD_DEFAULT_PACKAGE_CATEGORIES;
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'packageCategories'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const docs: FirestorePackageCategoryDoc[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: String(data.name || ''),
            description: data.description ? String(data.description) : undefined,
            isSystem: Boolean(data.isSystem),
            createdAt: String(data.createdAt || ''),
            createdBy: data.createdBy ? String(data.createdBy) : undefined,
            isDeleted: Boolean(data.isDeleted),
            originalDefaultName: data.originalDefaultName ? String(data.originalDefaultName) : undefined,
            updatedAt: data.updatedAt ? String(data.updatedAt) : undefined,
          };
        });
        setFirestoreDocs(docs);
        setLoading(false);
      },
      (err) => {
        console.error('[PackageCategories] Failed to subscribe to packageCategories:', err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const categories = useMemo<PackageCategoryItem[]>(() => {
    const overriddenOrDeletedDefaults = new Set<string>();

    for (const docItem of firestoreDocs) {
      if (docItem.originalDefaultName) {
        overriddenOrDeletedDefaults.add(docItem.originalDefaultName.toLowerCase());
      }
      if (docItem.name) {
        overriddenOrDeletedDefaults.add(docItem.name.toLowerCase());
      }
    }

    const result: PackageCategoryItem[] = [];

    // 1. Include default categories in their canonical order (or their Firestore override if renamed/updated in place)
    for (const defName of defaultCategories) {
      const defLower = defName.toLowerCase();
      const matchingDoc = firestoreDocs.find(
        (d) =>
          (d.originalDefaultName && d.originalDefaultName.toLowerCase() === defLower) ||
          (!d.originalDefaultName && d.name.toLowerCase() === defLower)
      );

      if (matchingDoc) {
        if (!matchingDoc.isDeleted && matchingDoc.name.trim()) {
          result.push({
            id: matchingDoc.id,
            name: matchingDoc.name,
            description: matchingDoc.description,
            isSystem: matchingDoc.isSystem,
            createdAt: matchingDoc.createdAt,
            createdBy: matchingDoc.createdBy,
          });
        }
      } else if (!overriddenOrDeletedDefaults.has(defLower)) {
        result.push({
          id: `default_${defName}`,
          name: defName,
          isSystem: true,
          createdAt: '',
        });
      }
    }

    // 2. Include custom Firestore categories that didn't already get placed via a default slot
    const includedIds = new Set(result.map((r) => r.id));
    const includedNamesLower = new Set(result.map((r) => r.name.toLowerCase()));

    for (const docItem of firestoreDocs) {
      if (docItem.isDeleted) continue;
      if (includedIds.has(docItem.id)) continue;
      const trimmed = docItem.name.trim();
      if (!trimmed) continue;
      if (includedNamesLower.has(trimmed.toLowerCase())) continue;

      result.push({
        id: docItem.id,
        name: trimmed,
        description: docItem.description,
        isSystem: docItem.isSystem,
        createdAt: docItem.createdAt,
        createdBy: docItem.createdBy,
      });
      includedIds.add(docItem.id);
      includedNamesLower.add(trimmed.toLowerCase());
    }

    return result;
  }, [firestoreDocs, defaultCategories]);

  const categoryNames = useMemo<string[]>(() => {
    return categories.map((c) => c.name);
  }, [categories]);

  const addCategory = async (name: string, description?: string, createdBy?: string): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Category name is required');
      return;
    }

    const existsActive = categories.some(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (existsActive) {
      toast.error(`Category "${trimmedName}" already exists`);
      return;
    }

    try {
      const now = new Date().toISOString();
      // Check if there is a tombstone doc for this name
      const tombstone = firestoreDocs.find(
        (d) =>
          d.isDeleted &&
          (d.name.toLowerCase() === trimmedName.toLowerCase() ||
            (d.originalDefaultName && d.originalDefaultName.toLowerCase() === trimmedName.toLowerCase()))
      );

      if (tombstone) {
        const payload: Record<string, any> = {
          name: trimmedName,
          description: description?.trim() || '',
          isDeleted: false,
          updatedAt: now,
        };
        if (createdBy) {
          payload.createdBy = createdBy;
        }
        await updateDoc(doc(db, 'packageCategories', tombstone.id), payload);
        await addAuditLog(
          'CREATE',
          'SETTINGS',
          tombstone.id,
          `Restored/Added package category: ${trimmedName}`,
          createdBy
        );
      } else {
        const payload: Record<string, any> = {
          name: trimmedName,
          description: description?.trim() || '',
          isSystem: false,
          isDeleted: false,
          createdAt: now,
        };
        if (createdBy) {
          payload.createdBy = createdBy;
        }
        const docRef = await addDoc(collection(db, 'packageCategories'), payload);
        await addAuditLog(
          'CREATE',
          'SETTINGS',
          docRef.id,
          `Added package category: ${trimmedName}`,
          createdBy
        );
      }
      toast.success(`Category "${trimmedName}" added`);
    } catch (err: any) {
      console.error('[PackageCategories] addCategory error:', err);
      toast.error(err?.message || 'Failed to add category');
      throw err;
    }
  };

  const updateCategory = async (id: string, name: string, description?: string): Promise<void> => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Category name is required');
      return;
    }

    const duplicate = categories.some(
      (c) => c.id !== id && c.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      toast.error(`Category "${trimmedName}" already exists`);
      return;
    }

    try {
      const now = new Date().toISOString();
      if (id.startsWith('default_')) {
        const originalDefaultName = id.slice('default_'.length);
        const existingDoc = firestoreDocs.find(
          (d) =>
            (d.originalDefaultName && d.originalDefaultName.toLowerCase() === originalDefaultName.toLowerCase()) ||
            d.name.toLowerCase() === originalDefaultName.toLowerCase()
        );

        if (existingDoc) {
          await updateDoc(doc(db, 'packageCategories', existingDoc.id), {
            name: trimmedName,
            description: description?.trim() || '',
            originalDefaultName: existingDoc.originalDefaultName || originalDefaultName,
            isDeleted: false,
            updatedAt: now,
          });
          await addAuditLog(
            'UPDATE',
            'SETTINGS',
            existingDoc.id,
            `Updated package category "${originalDefaultName}" to "${trimmedName}"`
          );
        } else {
          const docRef = await addDoc(collection(db, 'packageCategories'), {
            name: trimmedName,
            description: description?.trim() || '',
            originalDefaultName,
            isSystem: true,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
          });
          await addAuditLog(
            'UPDATE',
            'SETTINGS',
            docRef.id,
            `Updated default package category "${originalDefaultName}" to "${trimmedName}"`
          );
        }
      } else {
        const existingDoc = firestoreDocs.find((d) => d.id === id);
        await updateDoc(doc(db, 'packageCategories', id), {
          name: trimmedName,
          description: description?.trim() || '',
          updatedAt: now,
        });
        await addAuditLog(
          'UPDATE',
          'SETTINGS',
          id,
          `Updated package category "${existingDoc?.name || id}" to "${trimmedName}"`
        );
      }
      toast.success(`Category "${trimmedName}" updated`);
    } catch (err: any) {
      console.error('[PackageCategories] updateCategory error:', err);
      toast.error(err?.message || 'Failed to update category');
      throw err;
    }
  };

  const deleteCategory = async (id: string): Promise<void> => {
    try {
      const now = new Date().toISOString();
      if (id.startsWith('default_')) {
        const defaultName = id.slice('default_'.length);
        const existingDoc = firestoreDocs.find(
          (d) =>
            (d.originalDefaultName && d.originalDefaultName.toLowerCase() === defaultName.toLowerCase()) ||
            d.name.toLowerCase() === defaultName.toLowerCase()
        );

        if (existingDoc) {
          await updateDoc(doc(db, 'packageCategories', existingDoc.id), {
            isDeleted: true,
            updatedAt: now,
          });
          await addAuditLog(
            'DELETE',
            'SETTINGS',
            existingDoc.id,
            `Deleted default package category: ${defaultName}`
          );
        } else {
          const docRef = await addDoc(collection(db, 'packageCategories'), {
            name: defaultName,
            originalDefaultName: defaultName,
            isDeleted: true,
            createdAt: now,
          });
          await addAuditLog(
            'DELETE',
            'SETTINGS',
            docRef.id,
            `Deleted default package category: ${defaultName}`
          );
        }
        toast.success(`Category "${defaultName}" removed`);
      } else {
        const existingDoc = firestoreDocs.find((d) => d.id === id);
        const catName = existingDoc?.name || id;
        const isOverridingDefault =
          Boolean(existingDoc?.originalDefaultName) ||
          defaultCategories.some((def) => def.toLowerCase() === catName.toLowerCase());

        if (isOverridingDefault) {
          await updateDoc(doc(db, 'packageCategories', id), {
            isDeleted: true,
            updatedAt: now,
          });
        } else {
          await deleteDoc(doc(db, 'packageCategories', id));
        }

        await addAuditLog('DELETE', 'SETTINGS', id, `Deleted package category: ${catName}`);
        toast.success(`Category "${catName}" deleted`);
      }
    } catch (err: any) {
      console.error('[PackageCategories] deleteCategory error:', err);
      toast.error(err?.message || 'Failed to delete category');
      throw err;
    }
  };

  return {
    categories,
    categoryNames,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
  };
}
