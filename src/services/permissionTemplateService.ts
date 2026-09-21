import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query 
} from 'firebase/firestore';
import { db, getTenantId } from '../firebase';
import { PermissionTemplate } from '../types';
import { DEFAULT_SYSTEM_TEMPLATES } from '../utils/permissions';

const COLLECTION_NAME = 'permission_templates';

/**
 * Subscribe to real-time updates for permission templates in the current tenant's database.
 * If the collection is empty, automatically seeds default system templates.
 */
export function subscribePermissionTemplates(
  onUpdate: (templates: PermissionTemplate[]) => void,
  onError?: (error: any) => void
): () => void {
  const colRef = collection(db, COLLECTION_NAME);

  return onSnapshot(
    colRef,
    async (snapshot) => {
      if (snapshot.empty) {
        // Auto-seed default templates if empty
        try {
          await seedDefaultPermissionTemplates();
        } catch (seedErr) {
          console.error('[Permissions] Failed to auto-seed default templates:', seedErr);
        }
        return;
      }

      const templates: PermissionTemplate[] = snapshot.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || 'Unnamed Template',
          description: data.description || '',
          isSystem: !!data.isSystem,
          baseRole: data.baseRole || 'rep',
          permissions: data.permissions || {},
          createdAt: data.createdAt || new Date().toISOString(),
          updatedAt: data.updatedAt || new Date().toISOString(),
          createdBy: data.createdBy || '',
          tenantId: data.tenantId || getTenantId()
        };
      });

      // Sort: System templates first, then alphabetical by name
      templates.sort((a, b) => {
        if (a.isSystem && !b.isSystem) return -1;
        if (!a.isSystem && b.isSystem) return 1;
        return a.name.localeCompare(b.name);
      });

      onUpdate(templates);
    },
    (err) => {
      console.error('[Permissions] Snapshot error on permission_templates:', err);
      if (onError) onError(err);
    }
  );
}

/**
 * Seeds the pre-configured default system templates for a tenant.
 */
export async function seedDefaultPermissionTemplates(): Promise<void> {
  const tenantId = getTenantId();
  const now = new Date().toISOString();
  const colRef = collection(db, COLLECTION_NAME);

  for (const tpl of DEFAULT_SYSTEM_TEMPLATES) {
    const slugId = tpl.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const docRef = doc(colRef, `sys-${slugId}`);
    await setDoc(docRef, {
      ...tpl,
      tenantId,
      createdAt: now,
      updatedAt: now,
      createdBy: 'system'
    }, { merge: true });
  }
}

/**
 * Create a new permission template.
 */
export async function createPermissionTemplate(
  templateData: Omit<PermissionTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  userId?: string
): Promise<string> {
  const tenantId = getTenantId();
  const now = new Date().toISOString();
  const colRef = collection(db, COLLECTION_NAME);

  const docRef = await addDoc(colRef, {
    ...templateData,
    tenantId,
    createdAt: now,
    updatedAt: now,
    createdBy: userId || 'admin'
  });

  return docRef.id;
}

/**
 * Update an existing permission template.
 */
export async function updatePermissionTemplate(
  templateId: string,
  updates: Partial<Omit<PermissionTemplate, 'id' | 'createdAt'>>
): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, templateId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });
}

/**
 * Delete a permission template.
 */
export async function deletePermissionTemplate(templateId: string): Promise<void> {
  const docRef = doc(db, COLLECTION_NAME, templateId);
  await deleteDoc(docRef);
}
