import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { User, UserId, UserRole, isSuperAdmin, isAdmin, BrandingSettings, PendingAccount, PasswordResetRequest, Client, Coach } from '../types';
import { auth, db, signInWithEmail, logOut, createFirebaseUser, sendPasswordReset, getMemberEmail } from '../firebase';
import { onAuthStateChanged, updatePassword as fbUpdatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  writeBatch,
  addDoc,
  orderBy,
} from 'firebase/firestore';
import * as userService from '../services/userService';
import { activatePendingUser as activatePendingUserService } from '../services/userService';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  allUsers: User[];
  pendingAccounts: PendingAccount[];
  passwordResetRequests: PasswordResetRequest[];
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithCoachId: (coachId: string, password: string) => Promise<void>;
  loginWithMemberId: (memberId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (id: UserId, updates: Partial<User>) => Promise<void>;
  refreshUserData: () => Promise<void>;
  updateBranding: (updates: Partial<BrandingSettings>) => Promise<void>;
  deleteUser: (id: UserId) => Promise<void>;
  inviteUser: (email: string, role: UserRole, displayName?: string) => Promise<void>;
  activatePendingUser: (pendingDocId: string, email: string, role: UserRole, name: string) => Promise<void>;
  createCoachAccount: (name: string, email: string, branch?: string) => Promise<{ uid: string; coachId: string }>;
  createClientAccount: (clientId: string, memberId: string, clientName: string, phone?: string) => Promise<{ uid: string }>;
  submitSignUpRequest: (name: string, email: string, role: UserRole, message?: string) => Promise<void>;
  registerFreeUser: (email: string, password: string, profileData: any) => Promise<string>;
  approveSignUpRequest: (id: string, pending: PendingAccount) => Promise<void>;
  denySignUpRequest: (id: string) => Promise<void>;
  submitPasswordResetRequest: (email: string, name?: string) => Promise<void>;
  submitMemberPasswordResetRequest: (memberId: string, phone: string) => Promise<void>;
  approvePasswordResetRequest: (id: string, email: string) => Promise<void>;
  denyPasswordResetRequest: (id: string) => Promise<void>;
  isAuthReady: boolean;
  isSuperUser: boolean;
  effectiveRole: UserRole | undefined;
  previewRole: UserRole | null;
  setPreviewRole: (role: UserRole | null) => void;
  authError: string | null;
  setAuthError: (error: string | null) => void;
  changeMyPassword: (currentPassword: string, newPassword: string) => Promise<void>;
  completeForcedPasswordChange: (newPassword: string) => Promise<void>;
  updateMyProfile: (updates: { photoURL?: string; name?: string }) => Promise<void>;
  runExistingUsersMigration: () => Promise<{ membersMigrated: number; coachesMigrated: number; errors: string[] }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const generateCoachId = async (): Promise<string> => {
  const q = query(collection(db, 'users'), where('role', '==', 'coach'));
  const snap = await getDocs(q);
  const nums = snap.docs
    .map(d => (d.data().coachId as string) || '')
    .filter(id => id.startsWith('COACH-'))
    .map(id => parseInt(id.split('-')[1] || '0', 10))
    .filter(n => !isNaN(n));
  const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
  return `COACH-${String(maxNum + 1).padStart(3, '0')}`;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [pendingAccounts, setPendingAccounts] = useState<PendingAccount[]>([]);
  const [passwordResetRequests, setPasswordResetRequests] = useState<PasswordResetRequest[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [previewRole, setPreviewRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const effectiveRole = useMemo<UserRole | undefined>(() => {
    if (currentUser && isAdmin(currentUser.role) && previewRole) {
      return previewRole;
    }
    return currentUser?.role;
  }, [currentUser, previewRole]);

  const isSuperUser = useMemo(() => {
    return isSuperAdmin(currentUser?.role);
  }, [currentUser]);

  useEffect(() => {
    let active = true;

    const safetyTimeout = setTimeout(() => {
      if (active && !isAuthReady) {
        console.warn('Auth state safety timeout triggered');
        setIsAuthReady(true);
      }
    }, 3000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userId = firebaseUser.uid as UserId;
        const userDocRef = doc(db, 'users', userId);
        try {
          const userDoc = await getDoc(userDocRef);
          let userData: User | null = null;

          if (userDoc.exists()) {
            userData = userDoc.data() as User;
            userData.id = userId;
            if (userData.status === 'nonworking') {
              setCurrentUser(null);
              setAuthError("This account has been deactivated.");
              await logOut();
              clearTimeout(safetyTimeout);
              setIsAuthReady(true);
              return;
            }
            const OWNER_EMAILS = [
              'magd.gallab@gmail.com',
              'admin@mitrixogymcrm.eg',
              'mitrixogymcrm.egyptt@gmail.com',
              'shadyyoussef305@gmail.com',
            ];
            if (firebaseUser.email === "michaelmitry13@gmail.com" && userData.role !== 'crm_admin') {
              userData.role = 'crm_admin';
              try { await updateDoc(userDocRef, { role: 'crm_admin' }); } catch { /* will be set next admin login */ }
            } else if (OWNER_EMAILS.includes(firebaseUser.email || '') && userData.role !== 'super_admin') {
              userData.role = 'super_admin';
              try { await updateDoc(userDocRef, { role: 'super_admin' }); } catch { /* will be set next admin login */ }
            }
            if (firebaseUser.email) {
              const staleQ = query(collection(db, 'users'), where('email', '==', firebaseUser.email));
              const staleSnap = await getDocs(staleQ);
              const staleInvites = staleSnap.docs.filter(d => d.id !== userId);
              if (staleInvites.length > 0) {
                const batch = writeBatch(db);
                staleInvites.forEach(d => batch.delete(d.ref));
                await batch.commit();
              }
            }
            if (userData.role === 'client' && userData.clientRecordId) {
              try {
                const clientQ = query(collection(db, 'clients'), where('memberId', '==', userData.clientRecordId.trim()));
                const clientSnap = await getDocs(clientQ);
                if (!clientSnap.empty && clientSnap.docs[0]) {
                  const clientDocId = clientSnap.docs[0].id;
                  const clientData = clientSnap.docs[0].data();

                  // Migrate clientDocId on user doc if missing
                  if (!userData.clientDocId) {
                    userData.clientDocId = clientDocId;
                    await updateDoc(userDocRef, { clientDocId });
                  }

                  // Ensure portalUserId is set on the client doc for security rules
                  if (!clientData.portalUserId || clientData.portalUserId !== userId) {
                    await updateDoc(doc(db, 'clients', clientDocId), { portalUserId: userId });
                  }
                }
              } catch (e) {
                console.error("Error migrating user clientDocId/portalUserId:", e);
              }
            }
            setCurrentUser(userData);
            setAuthError(null);
          } else {
            const OWNER_EMAILS_NEW = [
              'magd.gallab@gmail.com',
              'admin@mitrixogymcrm.eg',
              'mitrixogymcrm.egyptt@gmail.com',
              'shadyyoussef305@gmail.com',
            ];
            let role: UserRole = 'client';
            if (firebaseUser.email === "michaelmitry13@gmail.com") {
              role = 'crm_admin';
            } else if (OWNER_EMAILS_NEW.includes(firebaseUser.email || '')) {
              role = 'super_admin';
            } else if (firebaseUser.email) {
              const emailLower = firebaseUser.email.toLowerCase();
              const emailsToSearch = [...new Set([firebaseUser.email, emailLower])];
              try {
                const q = query(collection(db, 'users'), where('email', 'in', emailsToSearch));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                  role = querySnapshot.docs[0]!.data()['role'] as UserRole;
                  const batch = writeBatch(db);
                  querySnapshot.docs.forEach(d => batch.delete(d.ref));
                  await batch.commit();
                } else {
                  try {
                    const allUsersSnap = await getDocs(collection(db, 'users'));
                    const match = allUsersSnap.docs.find(d => (d.data().email || '').toLowerCase() === emailLower);
                    if (match) {
                      role = match.data()['role'] as UserRole;
                      const batch = writeBatch(db);
                      allUsersSnap.docs.filter(d => (d.data().email || '').toLowerCase() === emailLower).forEach(d => batch.delete(d.ref));
                      await batch.commit();
                    }
                  } catch (allUsersErr) {
                    console.warn("Could not fetch all users snap for fallback matching:", allUsersErr);
                  }
                }
              } catch (qErr) {
                console.warn("Error querying users collection:", qErr);
              }
            }

            const newUser: User = {
              id: userId,
              name: firebaseUser.displayName || 'New User',
              email: firebaseUser.email || '',
              role: role
            };
            await setDoc(userDocRef, newUser);
            setCurrentUser(newUser);
            setAuthError(null);
          }
        } catch (error: any) {
          console.error("Error fetching user doc:", error);
          setAuthError(`[Firestore Auth Error] ${error.code || 'UNKNOWN'}: ${error.message || String(error)}`);
          // If we fail to load or update the user document, we shouldn't consider the user fully logged in
          setCurrentUser(null);
        }
      } else {
        setCurrentUser(null);
        setAuthError(null);
      }
      clearTimeout(safetyTimeout);
      setIsAuthReady(true);
    });
    return () => {
      active = false;
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  // Presence heartbeat
  useEffect(() => {
    if (!currentUser) return;
    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', currentUser.id), { lastSeen: new Date().toISOString() });
      } catch { /* silent */ }
    };
    updatePresence();
    const interval = setInterval(updatePresence, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  // Users listener
  useEffect(() => {
    if (!currentUser) return;

    // Do not subscribe to these CRM listeners when running in Platform Super Admin mode
    const isSuperAdminMode = window.location.hostname.startsWith('superadmin.') || 
                             window.location.pathname === '/superadmin';
    if (isSuperAdminMode) return;

    const fetchUsers = async () => {
      try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const res = await fetch('/api/users', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          const allFetched = data.users || [];
          const staffUsers = allFetched.filter((u: any) => 
            ['crm_admin', 'super_admin', 'admin', 'manager', 'rep'].includes(u.role)
          );

          const allUsersData = staffUsers.map((d: any) => {
            const hasStoredId = 'id' in d && d.id !== undefined && d.id !== null && d.id !== '';
            const user = { ...d } as User;
            user.isPending = !hasStoredId;
            return { user, hasStoredId };
          });
          const emailMap = new Map<string, { user: User; hasStoredId: boolean }>();
          allUsersData.forEach(({ user, hasStoredId }: any) => {
            const emailKey = (user.email || '').toLowerCase();
            const existing = emailMap.get(emailKey);
            if (!existing || (hasStoredId && !existing.hasStoredId)) {
              emailMap.set(emailKey, { user, hasStoredId });
            }
          });
          setAllUsers(allUsersData.map((e: any) => e.user));
          setUsers(Array.from(emailMap.values()).map(e => e.user));
        }
      } catch (error) {
        console.error('Error fetching users from API:', error);
      }
    };

    fetchUsers();
    const intervalId = setInterval(fetchUsers, 15000); // Poll every 15 seconds
    return () => clearInterval(intervalId);
  }, [currentUser]);

  // Pending accounts + password reset requests listeners (admin/manager only)
  useEffect(() => {
    if (!currentUser) return;
    const role = currentUser.role;
    if (role !== 'manager' && role !== 'admin' && role !== 'super_admin' && role !== 'crm_admin') return;

    // Do not subscribe to these CRM listeners when running in Platform Super Admin mode
    const isSuperAdminMode = window.location.hostname.startsWith('superadmin.') || 
                             window.location.pathname === '/superadmin';
    if (isSuperAdminMode) return;

    const unsubPending = onSnapshot(
      query(collection(db, 'pendingAccounts'), where('status', '==', 'pending'), orderBy('requestedAt', 'desc')),
      (snap) => setPendingAccounts(snap.docs.map(d => ({ ...d.data(), id: d.id } as PendingAccount))),
      (err) => console.error('Firestore Error (pendingAccounts listener):', err.code, err.message)
    );

    const unsubResets = onSnapshot(
      query(collection(db, 'passwordResetRequests'), where('status', '==', 'pending'), orderBy('requestedAt', 'desc')),
      (snap) => setPasswordResetRequests(snap.docs.map(d => ({ ...d.data(), id: d.id } as PasswordResetRequest))),
      (err) => console.error('Firestore Error (passwordResetRequests listener):', err.code, err.message)
    );

    return () => { unsubPending(); unsubResets(); };
  }, [currentUser?.id, currentUser?.role]);

  const logout = async () => { await logOut(); };
  const refreshUserData = async () => {};
  const updateBranding = async (_updates: Partial<BrandingSettings>) => {};

  const loginWithEmailFn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const loginWithCoachId = async (coachIdOrName: string, password: string) => {
    const term = coachIdOrName.trim();
    // 1. Try direct Coach ID lookup
    let q = query(collection(db, 'users'), where('coachId', '==', term.toUpperCase()));
    let snap = await getDocs(q);

    // 2. If not found, try name lookup in users with role='coach'
    if (snap.empty) {
      q = query(collection(db, 'users'), where('role', '==', 'coach'), where('name', '==', term));
      snap = await getDocs(q);
    }

    // 3. Fallback: case-insensitive name match on all users of role coach
    if (snap.empty) {
      const allCoachesQ = query(collection(db, 'users'), where('role', '==', 'coach'));
      const allCoachesSnap = await getDocs(allCoachesQ);
      const matched = allCoachesSnap.docs.find(d => d.data().name?.toLowerCase() === term.toLowerCase());
      if (matched) {
        const coachData = matched.data();
        if (!coachData.email) throw new Error('No email associated with this Coach account.');
        await signInWithEmail(coachData.email, password);
        return;
      }
    }

    if (snap.empty) throw new Error('Coach ID or Name not found. Please check and try again.');
    const coachData = snap.docs[0]!.data();
    if (!coachData.email) throw new Error('No email associated with this Coach account.');
    await signInWithEmail(coachData.email, password);
  };

  const loginWithMemberId = async (memberId: string, password: string) => {
    const q = query(collection(db, 'users'), where('clientRecordId', '==', memberId.trim()));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('Member ID not found. Please check and try again.');
    const memberData = snap.docs[0]!.data();
    if (!memberData.email) throw new Error('No account associated with this Member ID.');
    await signInWithEmail(memberData.email, password);
  };

  const createCoachAccount = async (name: string, email: string, branch?: string) => {
    const coachId = await generateCoachId();
    const uid = await createFirebaseUser(email, '12345678');
    const newUser: User = {
      id: uid,
      name,
      email,
      role: 'coach',
      coachId,
      branch: branch || undefined,
    };
    await setDoc(doc(db, 'users', uid), newUser);
    return { uid, coachId };
  };

  const createClientAccount = async (clientId: string, memberId: string, clientName: string, phone?: string) => {
    const email = getMemberEmail(memberId);
    const uid = await createFirebaseUser(email, '12345678');
    const newUser: User = {
      id: uid,
      name: clientName,
      email,
      role: 'client',
      clientRecordId: memberId,
      clientDocId: clientId,
      phone,
      mustChangePassword: true,
    };
    await setDoc(doc(db, 'users', uid), newUser);
    // Update the client record to flag portal access
    await updateDoc(doc(db, 'clients', clientId), { portalUserId: uid });
    return { uid };
  };

  const submitSignUpRequest = async (name: string, email: string, role: UserRole, message?: string) => {
    // These reads require auth — unauthenticated callers (login page) won't have
    // permission, so we wrap them and skip the guard rather than blocking the request.
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) throw new Error('An account with this email already exists.');
    } catch (err: any) {
      if (err?.message?.includes('already exists')) throw err; // re-throw our own error
      // else: permission denied for unauthenticated user — skip and proceed
    }
    try {
      const pendingQ = query(collection(db, 'pendingAccounts'), where('email', '==', email), where('status', '==', 'pending'));
      const pendingSnap = await getDocs(pendingQ);
      if (!pendingSnap.empty) throw new Error('A pending request for this email already exists.');
    } catch (err: any) {
      if (err?.message?.includes('already exists')) throw err; // re-throw our own error
      // else: permission denied — skip and proceed
    }
    await addDoc(collection(db, 'pendingAccounts'), {
      name,
      email,
      role,
      message: message || '',
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
  };

  const approveSignUpRequest = async (id: string, pending: PendingAccount) => {
    const uid = await createFirebaseUser(pending.email, '12345678');
    const newUser: User = {
      id: uid,
      name: pending.name,
      email: pending.email,
      role: pending.role,
    };
    if (pending.role === 'coach') {
      const coachId = await generateCoachId();
      newUser.coachId = coachId;
    }
    await setDoc(doc(db, 'users', uid), newUser);
    await deleteDoc(doc(db, 'pendingAccounts', id));
  };

  const denySignUpRequest = async (id: string) => {
    await updateDoc(doc(db, 'pendingAccounts', id), { status: 'denied' });
    await deleteDoc(doc(db, 'pendingAccounts', id));
  };

  const submitPasswordResetRequest = async (email: string, name?: string) => {
    // Rate-limit: block duplicate pending requests for the same email.
    // Wrapped in try/catch because unauthenticated callers (login page) lack
    // read permission on this collection — in that case we skip the guard and
    // just allow the write through.
    try {
      const existingQ = query(
        collection(db, 'passwordResetRequests'),
        where('email', '==', email),
        where('status', '==', 'pending')
      );
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        throw new Error('A password reset request for this email is already pending admin approval. Please wait for it to be processed.');
      }
    } catch (err: any) {
      // Re-throw our own duplicate error; swallow Firestore permission errors
      if (err?.message?.includes('pending admin approval')) throw err;
    }
    await addDoc(collection(db, 'passwordResetRequests'), {
      email,
      name: name || '',
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
  };
  const submitMemberPasswordResetRequest = async (memberId: string, phone: string) => {
    // Look up the Firebase user whose clientRecordId matches the provided Member ID
    const userQ = query(collection(db, 'users'), where('clientRecordId', '==', memberId.trim()));
    const userSnap = await getDocs(userQ);
    if (userSnap.empty) {
      throw new Error('Member ID not found. Please check your ID and try again.');
    }
    const userData = userSnap.docs[0]!.data();
    const syntheticEmail: string = userData.email || '';
    const memberName: string = userData.name || '';

    // Verify phone against the clients collection
    const clientQ = query(collection(db, 'clients'), where('memberId', '==', memberId.trim()));
    const clientSnap = await getDocs(clientQ);
    if (!clientSnap.empty) {
      const clientPhone: string = (clientSnap.docs[0]!.data().phone || '').replace(/\s/g, '');
      const inputPhone = phone.trim().replace(/\s/g, '');
      if (clientPhone && inputPhone && clientPhone !== inputPhone) {
        throw new Error('Phone number does not match our records for this Member ID.');
      }
    }

    // Check for an existing pending request
    try {
      const existingQ = query(
        collection(db, 'passwordResetRequests'),
        where('email', '==', syntheticEmail),
        where('status', '==', 'pending')
      );
      const existingSnap = await getDocs(existingQ);
      if (!existingSnap.empty) {
        throw new Error('A password reset request for this account is already pending admin approval.');
      }
    } catch (err: any) {
      if (err?.message?.includes('pending admin approval')) throw err;
    }

    await addDoc(collection(db, 'passwordResetRequests'), {
      email: syntheticEmail,
      name: memberName,
      memberId: memberId.trim(),
      phone: phone.trim(),
      requestedAt: new Date().toISOString(),
      status: 'pending',
    });
  };

  const approvePasswordResetRequest = async (id: string, email: string) => {
    const isSyntheticEmail = email.endsWith('@mitrixogymcrm-member.local');

    if (!isSyntheticEmail) {
      // Real email — Firebase sends a reset link directly
      await sendPasswordReset(email);
    }

    // Mark mustChangePassword so the force-change dialog appears on next login
    try {
      const q = query(collection(db, 'users'), where('email', '==', email));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await updateDoc(snap.docs[0]!.ref, { mustChangePassword: true });
      }
    } catch { /* silent — the reset email was still sent */ }

    await deleteDoc(doc(db, 'passwordResetRequests', id));
  };

  const denyPasswordResetRequest = async (id: string) => {
    await deleteDoc(doc(db, 'passwordResetRequests', id));
  };

  const updateUser = async (id: UserId, updates: Partial<User>) => {
    const currentName = users.find(u => u.id === id)?.name;
    await userService.updateUser(id, updates, currentName);
    if (currentUser && id === currentUser.id) {
      setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
    }
  };

  const deleteUser = async (id: UserId) => {
    if (!isSuperUser) throw new Error("Unauthorized");
    const user = users.find(u => u.id === id);
    if (user && isSuperAdmin(user.role)) throw new Error("Cannot delete a super user account.");
    await userService.deleteUser(id, user?.name);
  };

  const inviteUser = async (email: string, role: UserRole, displayName?: string) => {
    await userService.inviteUser(email, role, displayName);
  };

  const activatePendingUser = async (pendingDocId: string, email: string, role: UserRole, name: string) => {
    await activatePendingUserService(pendingDocId, email, role, name);
  };

  /**
   * Allows the currently signed-in user to change their own password.
   * Requires re-authentication first (Firebase security requirement).
   */
  const changeMyPassword = async (currentPassword: string, newPassword: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('No authenticated user found.');
    // Re-authenticate before changing password (Firebase requires this)
    const credential = EmailAuthProvider.credential(user.email, currentPassword);
    await reauthenticateWithCredential(user, credential);
    await fbUpdatePassword(user, newPassword);
  };

  /** Called from the ForcePasswordChangeDialog — tries reauth with default pwd then updates */
  const completeForcedPasswordChange = async (newPassword: string) => {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('No authenticated user found.');
    // Try default password first; if user already changed it via email link this will fail gracefully
    try {
      const cred = EmailAuthProvider.credential(user.email, '12345678');
      await reauthenticateWithCredential(user, cred);
    } catch {
      // User may have already signed in via a reset link — current session is fresh enough
    }
    await fbUpdatePassword(user, newPassword);
    // Force token refresh so Firestore gets the new token before we write
    await user.getIdToken(true);
    await updateDoc(doc(db, 'users', user.uid), { mustChangePassword: false });
    setCurrentUser(prev => prev ? { ...prev, mustChangePassword: false } : prev);
  };

  /** Update current user's own profile (name / avatar) */
  const updateMyProfile = async (updates: { photoURL?: string; name?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new Error('No authenticated user.');
    await updateDoc(doc(db, 'users', user.uid), updates);
    setCurrentUser(prev => prev ? { ...prev, ...updates } : prev);
  };

  const runExistingUsersMigration = async (): Promise<{ membersMigrated: number; coachesMigrated: number; errors: string[] }> => {
    let membersMigrated = 0;
    let coachesMigrated = 0;
    const errors: string[] = [];

    try {
      const [usersSnap, clientsSnap, coachesSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'clients')),
        getDocs(collection(db, 'coaches'))
      ]);

      const usersList = usersSnap.docs.map(d => d.data() as User);
      const activeMembers = clientsSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Client))
        .filter(c => c.memberId && c.status === 'Active');

      for (const client of activeMembers) {
        const hasAccount = usersList.some(u => u.clientRecordId === client.memberId);
        if (!hasAccount) {
          try {
            await createClientAccount(client.id, client.memberId!, client.name, client.phone);
            membersMigrated++;
          } catch (err: any) {
            errors.push(`Member ${client.name} (${client.memberId}): ${err.message || String(err)}`);
          }
        }
      }

      const coachesList = coachesSnap.docs
        .map(d => ({ ...d.data(), id: d.id } as Coach))
        .filter(c => c.active);

      for (const coach of coachesList) {
        const hasAccount = usersList.some(u => u.role === 'coach' && (u.name?.toLowerCase() === coach.name.toLowerCase() || u.coachId === coach.id));
        if (!hasAccount) {
          try {
            const email = `coach-${coach.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@mitrixogymcrm-coach.local`;
            const uid = await createFirebaseUser(email, '12345678');
            const newUser: User = {
              id: uid,
              name: coach.name,
              email,
              role: 'coach',
              coachId: coach.id.startsWith('COACH-') ? coach.id : await generateCoachId(),
              mustChangePassword: true
            };
            await setDoc(doc(db, 'users', uid), newUser);
            await updateDoc(doc(db, 'coaches', coach.id), { userId: uid });
            coachesMigrated++;
          } catch (err: any) {
            errors.push(`Coach ${coach.name}: ${err.message || String(err)}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`Migration failed: ${err.message || String(err)}`);
    }

    return { membersMigrated, coachesMigrated, errors };
  };

  const registerFreeUser = async (
    email: string,
    password: string,
    profileData: {
      name: string;
      phone: string;
      age?: string;
      gender?: string;
      height?: number;
      weight?: number;
      activityLevel?: string;
      workoutTimes?: string[];
      fitnessTarget?: string;
    }
  ) => {
    // 1. Create firebase user auth
    // Wait, createFirebaseUser sets a password and creates the user, but we'll use standard createUserWithEmailAndPassword here if we can,
    // or just the same flow as createClientAccount but capturing password.
    // Let's implement it inside the hook directly.
    const { createUserWithEmailAndPassword, updateProfile } = await import('firebase/auth');
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCred.user, { displayName: profileData.name });

    const uid = userCred.user.uid;

    // 2. Generate a member ID (e.g., M-0001)
    const clientsSnap = await getDocs(collection(db, 'clients'));
    const memberIds = clientsSnap.docs
      .map(d => d.data().memberId)
      .filter(id => typeof id === 'string' && id.startsWith('MEM-'))
      .map(id => parseInt(id.replace('MEM-', ''), 10))
      .filter(n => !isNaN(n));
    const nextNum = memberIds.length > 0 ? Math.max(...memberIds) + 1 : 1;
    const newMemberId = `MEM-${String(nextNum).padStart(3, '0')}`;

    // 3. Create Client record
    const clientRef = doc(collection(db, 'clients'));
    const newClient = {
      id: clientRef.id,
      name: profileData.name,
      phone: profileData.phone || '',
      status: 'Lead',
      stage: 'New',
      memberId: newMemberId,
      portalUserId: uid,
      points: 100, // Welcome points
      aiTokens: 50, // Welcome tokens for AI chat
      gender: profileData.gender || 'Prefer not to say',
      height: profileData.height || 0,
      weight: profileData.weight || 0,
      activityLevel: profileData.activityLevel || 'Moderately Active',
      workoutTimes: profileData.workoutTimes || [],
      fitnessTarget: profileData.fitnessTarget || 'Improve Lifestyle',
      dateOfBirth: profileData.age || '', // Storing age here for now
      referralCode: `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      createdAt: new Date().toISOString()
    };
    await setDoc(clientRef, newClient);

    // 4. Create User record
    const newUser: User = {
      id: uid,
      name: profileData.name,
      email,
      role: 'client',
      clientRecordId: newMemberId,
      clientDocId: clientRef.id,
    };
    await setDoc(doc(db, 'users', uid), newUser);

    // Auto-login happens automatically by Firebase onAuthStateChanged
    return clientRef.id;
  };

  const memoizedCurrentUser = useMemo(() => {
    if (!currentUser) return null;
    // IMPORTANT: Keep the REAL role on currentUser so admin checks (preview dropdown)
    // always work. Use effectiveRole for nav/permissions through the context.
    return { ...currentUser };
  }, [currentUser, effectiveRole]);

  const value = useMemo(() => ({
    currentUser: memoizedCurrentUser,
    users,
    allUsers,
    pendingAccounts,
    passwordResetRequests,
    loginWithEmail: loginWithEmailFn,
    loginWithCoachId,
    loginWithMemberId,
    logout,
    updateUser,
    refreshUserData,
    updateBranding,
    deleteUser,
    inviteUser,
    createCoachAccount,
    createClientAccount,
    activatePendingUser,
    submitSignUpRequest,
    registerFreeUser,
    approveSignUpRequest,
    denySignUpRequest,
    submitPasswordResetRequest,
    submitMemberPasswordResetRequest,
    approvePasswordResetRequest,
    denyPasswordResetRequest,
    isAuthReady,
    isSuperUser,
    effectiveRole,
    previewRole,
    setPreviewRole,
    authError,
    setAuthError,
    changeMyPassword,
    completeForcedPasswordChange,
    updateMyProfile,
    runExistingUsersMigration,
  }), [memoizedCurrentUser, users, pendingAccounts, passwordResetRequests, isAuthReady, isSuperUser, effectiveRole, previewRole, authError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
