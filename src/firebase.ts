import { initializeApp, deleteApp } from 'firebase/app';
import {
  getAuth,
  signOut,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

// Support dynamic tenant configurations loaded based on subdomain or query param
const getActiveConfig = () => {
  const dynamicConfig = (window as any).__FIREBASE_CONFIG__;
  if (dynamicConfig) {
    return dynamicConfig;
  }

  // Fallback for standalone Vite dev or direct localhost testing
  try {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const t = (params.get('tenant') || '').toLowerCase();
      const host = window.location.hostname.toLowerCase();
      if (t === 'inzan' || t === 'inzanathletics' || host.includes('inzan')) {
        return {
          ...firebaseConfig,
          firestoreDatabaseId: 'db-inzanathletics',
          tenantId: 'inzanathletics'
        };
      }
      if (t === 'strike' || t === 'strikeboxing' || host.includes('strike')) {
        return {
          ...firebaseConfig,
          tenantId: 'strike'
        };
      }
    }
  } catch {}

  return firebaseConfig;
};

export const activeConfig = getActiveConfig();

/**
 * Extracts the tenant identifier from the current subdomain, query param, or config.
 * Used to namespace member emails and prevent Auth collisions between gyms.
 * Examples: "strike" from strike.mitrixo.com, "inzanathletics" from inzanathletics.mitrixo.com
 * Falls back to "default" if no subdomain or on localhost.
 */
export const getTenantId = (): string => {
  // 1. Explicit query parameter override (e.g. ?tenant=inzan or ?tenant=strike)
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const t = (params.get('tenant') || '').toLowerCase();
      if (t === 'inzan' || t === 'inzanathletics') return 'inzanathletics';
      if (t === 'strike' || t === 'strikeboxing') return 'strike';
      if (t) return t;
    }
  } catch {}

  // 2. Server-injected tenantId in activeConfig
  const configTenantId = (activeConfig as any).tenantId;
  if (configTenantId) return configTenantId;

  // 3. Extract from subdomain or hostname
  try {
    const hostname = window.location.hostname.toLowerCase();
    const parts = hostname.split('.');
    // e.g. "strike.mitrixo.com" → parts = ["strike", "mitrixo", "com"]
    // e.g. "inzanathletics.localhost" → parts = ["inzanathletics", "localhost"]
    if (parts.length >= 3 && parts[0] !== 'www') {
      const sub = parts[0]!;
      if (sub === 'inzan' || sub === 'inzanathletics') return 'inzanathletics';
      if (sub === 'strike') return 'strike';
      return sub;
    }
    if (parts.length === 2 && (parts[1] === 'localhost' || parts[1] === 'local')) {
      const sub = parts[0]!;
      if (sub === 'inzan' || sub === 'inzanathletics') return 'inzanathletics';
      if (sub === 'strike') return 'strike';
      return sub;
    }
    if (hostname.includes('inzan')) return 'inzanathletics';
    if (hostname.includes('strike')) return 'strike';

    // 4. Custom domains: check the config's databaseId for a hint
    const dbId = (activeConfig as any).firestoreDatabaseId;
    if (dbId && dbId !== '(default)') {
      return dbId.replace(/^db-/, '');
    }
  } catch {
    // SSR or non-browser environment
  }
  return 'default';
};

/**
 * Generates a tenant-namespaced email for member portal accounts.
 * Format: member-{memberId}@{tenantId}.mitrixo-member.local
 * This prevents Firebase Auth collisions when multiple gyms have
 * members with the same sequential ID (e.g., both have member 112).
 */
export const getMemberEmail = (memberId: string): string => {
  const tenantId = getTenantId();
  return `member-${memberId.toLowerCase()}@${tenantId}.mitrixo-member.local`;
};

const app = initializeApp(activeConfig);
export const auth = getAuth(app);

export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, (activeConfig as any).firestoreDatabaseId);

export const storage = getStorage(app);

export const signInWithEmail = async (email: string, password: string) => {
  return signInWithEmailAndPassword(auth, email, password);
};

export const sendPasswordReset = async (email: string) => {
  return sendPasswordResetEmail(auth, email);
};

/**
 * Creates a Firebase Auth user without disrupting the current admin session.
 * Uses a temporary secondary app instance that gets deleted after creation.
 */
export const createFirebaseUser = async (email: string, password: string): Promise<string> => {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error("No authorization token found. You must be signed in.");
  }

  const response = await fetch('/api/tenant/create-auth-user', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server returned ${response.status}`);
  }

  const data = await response.json();
  return data.uid;
};

/**
 * Retrieves the UID of an existing Firebase Auth account by signing in with the
 * known default password. Used when `createFirebaseUser` fails with
 * `auth/email-already-in-use` to recover the pre-existing UID so Firestore
 * documents can be migrated to it.
 */
export const getExistingUserUID = async (email: string, password: string): Promise<string> => {
  const tempApp = initializeApp(activeConfig as any, `temp-lookup-${Date.now()}`);
  const tempAuth = getAuth(tempApp);
  try {
    const cred = await signInWithEmailAndPassword(tempAuth, email, password);
    return cred.user.uid;
  } finally {
    await deleteApp(tempApp);
  }
};

/**
 * Checks what sign-in methods are registered for an email address.
 * Useful for diagnosing why an account already exists.
 */
export const checkSignInMethods = async (email: string): Promise<string[]> => {
  return fetchSignInMethodsForEmail(auth, email);
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};
