import { 
  collection, 
  doc, 
  updateDoc, 
  addDoc, 
  deleteDoc,
  setDoc,
  query,
  where,
  getDocs
} from 'firebase/firestore';
import { db, auth, createFirebaseUser } from '../firebase';
import { User, UserRole, UserId, InzanDepartment, InzanJobTitle } from '../types';
import { cleanData } from '../utils';
import { addAuditLog } from './auditService';

export const updateUser = async (id: UserId, updates: Partial<User>, currentName?: string) => {
  await updateDoc(doc(db, 'users', id), cleanData(updates));
  await addAuditLog('UPDATE', 'CLIENT', id as any, `Updated user permissions: ${currentName || id}`);
};

export const deleteUser = async (id: UserId, userName?: string) => {
  await deleteDoc(doc(db, 'users', id));
  await addAuditLog('DELETE', 'CLIENT', id as any, `Deleted user account: ${userName || id}`);
};

export interface InviteUserOptions {
  branch?: string;
  salesTarget?: number;
  status?: 'working' | 'nonworking';
  department?: InzanDepartment;
  jobTitle?: InzanJobTitle;
  trainerType?: 'Full-Time' | 'Part-Time';
  customPermissions?: Record<string, boolean>;
  can_delete_payments?: boolean;
  can_view_global_dashboard?: boolean;
  can_access_settings_and_history?: boolean;
  can_delete_records?: boolean;
  can_assign_leads?: boolean;
}

export const inviteUser = async (
  email: string, 
  role: UserRole, 
  displayName?: string, 
  phone?: string, 
  permissionTemplateId?: string,
  options?: InviteUserOptions
) => {
  // Check for existing user or invite
  const q = query(collection(db, 'users'), where('email', '==', email));
  const querySnapshot = await getDocs(q);
  
  if (!querySnapshot.empty) {
    throw new Error('A user with this email already exists or is already invited.');
  }

  const name = (displayName || '').trim() || email.split('@')[0] || email;

  // Create a real Firebase Auth account with a default password so the user can log in immediately.
  // They should change this via Settings after first login.
  const uid = await createFirebaseUser(email, '12345678');

  const newUser: User = {
    id: uid,
    name,
    email,
    role,
    status: options?.status || 'working',
    ...(phone ? { phone: phone.trim() } : {}),
    ...(permissionTemplateId ? { permissionTemplateId } : {}),
    ...(options?.branch ? { branch: options.branch } : {}),
    ...(options?.salesTarget !== undefined ? { salesTarget: options.salesTarget } : {}),
    ...(options?.department ? { department: options.department } : {}),
    ...(options?.jobTitle ? { jobTitle: options.jobTitle } : {}),
    ...(options?.trainerType ? { trainerType: options.trainerType } : {}),
    ...(options?.customPermissions ? { customPermissions: options.customPermissions } : {}),
    ...(options?.can_delete_payments !== undefined ? { can_delete_payments: options.can_delete_payments } : {}),
    ...(options?.can_view_global_dashboard !== undefined ? { can_view_global_dashboard: options.can_view_global_dashboard } : {}),
    ...(options?.can_access_settings_and_history !== undefined ? { can_access_settings_and_history: options.can_access_settings_and_history } : {}),
    ...(options?.can_delete_records !== undefined ? { can_delete_records: options.can_delete_records } : {}),
    ...(options?.can_assign_leads !== undefined ? { can_assign_leads: options.can_assign_leads } : {})
  };

  await setDoc(doc(db, 'users', uid), cleanData(newUser));
  await addAuditLog('CREATE', 'CLIENT', uid as any, `Invited user: ${email} as ${role}${phone ? ` (${phone})` : ''}${permissionTemplateId ? ` with template ${permissionTemplateId}` : ''}`);
  return uid as UserId;
};

/**
 * Activates a "Pending Invite" user who has a Firestore doc but no Firebase Auth account.
 * Creates the Auth account with default password 12345678 and re-keys the Firestore doc
 * under the new Auth UID (preserving role, name, email).
 */
export const activatePendingUser = async (
  pendingDocId: string,
  email: string,
  role: UserRole,
  name: string
): Promise<UserId> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("No authorization token found. You must be signed in.");
  }

  const response = await fetch('/api/tenant/activate-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ pendingDocId, email, role, name })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server returned ${response.status}`);
  }

  const data = await response.json();
  const uid = data.uid as UserId;

  await addAuditLog('UPDATE', 'CLIENT', uid as any, `Activated pending user account: ${email}`);
  return uid;
};
