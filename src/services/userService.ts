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
import { User, UserRole, UserId } from '../types';
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

export const inviteUser = async (email: string, role: UserRole, displayName?: string) => {
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
  };

  await setDoc(doc(db, 'users', uid), newUser);
  await addAuditLog('CREATE', 'CLIENT', uid as any, `Invited user: ${email} as ${role}`);
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
