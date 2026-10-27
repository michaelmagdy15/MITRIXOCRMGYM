import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getRequestHostname, getTenantInfoForHost } from '../utils/tenantDb.js';

export const inzanLockerRouter = Router();

const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';
const DEFAULT_LOCKER_BASE_URL = process.env.INZAN_LOCKER_URL || 'https://inzan.tailaf3d90.ts.net';
const DEFAULT_LOCKER_USERNAME = process.env.INZAN_LOCKER_USERNAME || 'admin';

export function getInzanApp(): admin.app.App {
  const defaultApp = admin.apps[0];
  if (defaultApp && defaultApp.options.projectId === INZAN_PROJECT_ID) {
    return defaultApp;
  }
  const existingNamed = admin.apps.find((a) => a?.name === 'inzan-locker-app');
  return existingNamed || admin.initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-locker-app');
}

export function getInzanFirestore() {
  return getFirestore(getInzanApp(), INZAN_DATABASE_ID);
}

interface LockerServerConfig {
  baseUrl: string;
  username: string;
  password: string;
}

interface AuthenticatedCaller {
  uid: string;
  email: string;
  name: string;
  role: string;
  isStaff: boolean;
  clientDocId: string | null;
  clientRecordId: string | null;
}

let cachedConfig: { config: LockerServerConfig; fetchedAt: number } | null = null;
let cachedJwt: { token: string; baseUrl: string; expiresAt: number } | null = null;

const CONFIG_TTL_MS = 2 * 60 * 1000; // 2 minutes
const JWT_TTL_MS = 45 * 60 * 1000; // 45 minutes

function stripUndefinedDeep<T>(val: T): T {
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (val !== null && typeof val === 'object' && Object.prototype.toString.call(val) === '[object Object]') {
    const cleaned: Record<string, any> = {};
    for (const [k, v] of Object.entries(val as Record<string, any>)) {
      if (v !== undefined) {
        cleaned[k] = stripUndefinedDeep(v);
      }
    }
    return cleaned as T;
  }
  return val;
}

function normalizePhoneDigits(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).replace(/[^\d]/g, '');
}

async function verifyInzanTenantRequest(req: Request, res: Response): Promise<boolean> {
  const hostname = getRequestHostname(req);
  const { config: tenantConfig } = await getTenantInfoForHost(hostname);
  const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
  const isInzanHost = hostname.toLowerCase().includes('inzan');
  if (!isLocalhost && !isInzanHost && tenantConfig?.tenantId && tenantConfig.tenantId !== 'inzanathletics') {
    res.status(403).json({ error: 'Inzan Locker System is strictly isolated to the Inzan Athletics tenant.' });
    return false;
  }
  return true;
}

async function authenticateInzanCaller(req: Request): Promise<AuthenticatedCaller | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split('Bearer ')[1];
  if (!token) return null;

  try {
    const decoded = await admin.auth(getInzanApp()).verifyIdToken(token);
    const email = (decoded.email || '').toLowerCase();
    const inzanDb = getInzanFirestore();
    const userSnap = await inzanDb.collection('users').doc(decoded.uid).get();
    const userData = userSnap.exists ? userSnap.data() : null;

    const isSuperAdminEmail =
      email === 'michaelmitry13@gmail.com' ||
      email === 'magd.gallab@gmail.com' ||
      (email.endsWith('@inzan.com') && decoded.email_verified === true);

    const role = String(
      userData?.role ||
        (decoded as any).role ||
        (isSuperAdminEmail ? 'crm_admin' : 'client')
    ).toLowerCase();

    const staffRoles = new Set([
      'admin',
      'crm_admin',
      'super_admin',
      'manager',
      'sales_manager',
      'owner',
      'rep',
      'sales_rep',
      'sales',
      'staff',
      'coach',
      'frontdesk',
      'receptionist',
    ]);

    const isStaff = isSuperAdminEmail || staffRoles.has(role);

    let clientDocId: string | null = userData?.clientDocId ? String(userData.clientDocId) : null;
    let clientRecordId: string | null = userData?.clientRecordId ? String(userData.clientRecordId) : null;

    if (!clientDocId && !isStaff) {
      const clientQuery = await inzanDb
        .collection('clients')
        .where('portalUserId', '==', decoded.uid)
        .limit(1)
        .get();
      if (!clientQuery.empty) {
        const doc = clientQuery.docs[0]!;
        clientDocId = doc.id;
        clientRecordId = String(doc.data()?.memberId || doc.id);
      }
    }

    return {
      uid: decoded.uid,
      email,
      name: String(userData?.name || (decoded as any).name || email || 'User'),
      role,
      isStaff,
      clientDocId,
      clientRecordId,
    };
  } catch (err) {
    console.error('[API] [InzanLockers] Token verification error:', err);
    return null;
  }
}

interface LockerBridgeSnapshot {
  pushedAt: number;
  pushedAtIso: string;
  localUrl: string;
  tunnelUrl: string | null;
  hostname?: string;
  status?: any;
  heartbeat?: any;
  lockers?: any[];
  groups?: any[];
  controllers?: any[];
  readers?: any[];
  users?: any[];
  settings?: any;
  lockerExpiryHours?: number;
}

interface LockerBridgeCommand {
  id: string;
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: any;
  isPublic?: boolean;
  status: 'pending' | 'claimed' | 'completed';
  createdAt: number;
}

let latestBridgeSnapshot: LockerBridgeSnapshot | null = null;
let lastMutationAt = 0;
let lastDirectTunnelFailureAt = 0;
const pendingBridgeResolvers = new Map<
  string,
  {
    resolve: (val: { ok: boolean; status: number; data: any; error?: string }) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();
const bridgePollWaiters = new Set<() => void>();

function notifyBridgePollWaiters() {
  for (const wake of bridgePollWaiters) {
    try {
      wake();
    } catch {
      // ignore
    }
  }
  bridgePollWaiters.clear();
}

async function getBridgeSnapshot(): Promise<LockerBridgeSnapshot | null> {
  if (latestBridgeSnapshot && Date.now() - latestBridgeSnapshot.pushedAt < 45_000) {
    return latestBridgeSnapshot;
  }
  try {
    const inzanDb = getInzanFirestore();
    const doc = await inzanDb.collection('settings').doc('inzan_locker_bridge_state').get();
    if (doc.exists) {
      const d = doc.data() as LockerBridgeSnapshot;
      if (d && typeof d.pushedAt === 'number') {
        latestBridgeSnapshot = d;
        return d;
      }
    }
  } catch (err) {
    console.warn('[API] [InzanLockers] Failed reading settings/inzan_locker_bridge_state:', err);
  }
  return latestBridgeSnapshot;
}

function getCachedEndpointFromBridgeSnapshot(normPath: string, snap: LockerBridgeSnapshot): any | undefined {
  switch (normPath) {
    case '/api/status':
      return snap.status;
    case '/api/heartbeat-status':
      return snap.heartbeat;
    case '/api/lockers':
      return snap.lockers;
    case '/api/groups':
      return snap.groups;
    case '/api/controllers':
      return snap.controllers;
    case '/api/readers':
      return snap.readers;
    case '/api/users':
      return snap.users;
    case '/api/settings':
      return snap.settings;
    case '/api/settings/locker-expiry':
      return snap.lockerExpiryHours !== undefined ? { lockerExpiryHours: snap.lockerExpiryHours } : undefined;
    default:
      return undefined;
  }
}

async function executeViaMacosBridge<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any,
  isPublic?: boolean
): Promise<{ data: T; baseUrl: string }> {
  const snap = await getBridgeSnapshot();
  const bridgeOnline = Boolean(snap && Date.now() - snap.pushedAt < 90_000);

  if (method === 'GET' && snap && Date.now() - snap.pushedAt < 90_000 && snap.pushedAt >= lastMutationAt) {
    const cachedVal = getCachedEndpointFromBridgeSnapshot(path, snap);
    if (cachedVal !== undefined) {
      return {
        data: cachedVal as T,
        baseUrl: snap.tunnelUrl || snap.localUrl || 'http://192.168.10.31:3701',
      };
    }
  }

  if (!bridgeOnline) {
    if (method === 'GET' && snap) {
      const staleVal = getCachedEndpointFromBridgeSnapshot(path, snap);
      if (staleVal !== undefined) {
        return {
          data: staleVal as T,
          baseUrl: snap.tunnelUrl || snap.localUrl || 'https://inzan.tailaf3d90.ts.net',
        };
      }
    }
    console.warn('[API] [InzanLockers] macOS Local Bridge is offline; falling back to direct Tailscale HTTPS link...');
    return executeViaDirectHttp<T>(path, { method, body, isPublic });
  }

  try {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const inzanDb = getInzanFirestore();
    const cmdDocRef = inzanDb.collection('lockerBridgeCommands').doc(commandId);

    const cmdPayload: LockerBridgeCommand = stripUndefinedDeep({
      id: commandId,
      path,
      method,
      body,
      isPublic: Boolean(isPublic),
      status: 'pending',
      createdAt: Date.now(),
    });

    await cmdDocRef.set(cmdPayload);
    notifyBridgePollWaiters();

    const result = await new Promise<{ ok: boolean; status: number; data: any; error?: string }>((resolve, reject) => {
      let settled = false;
      let unsubFirestore: (() => void) | null = null;

      const finish = (resObj?: { ok: boolean; status: number; data: any; error?: string }, err?: Error) => {
        if (settled) return;
        settled = true;
        pendingBridgeResolvers.delete(commandId);
        if (unsubFirestore) {
          try {
            unsubFirestore();
          } catch {
            // ignore
          }
        }
        cmdDocRef.delete().catch(() => {});
        if (err) reject(err);
        else if (resObj) resolve(resObj);
      };

      const timer = setTimeout(() => {
        finish(undefined, new Error('Timed out waiting for macOS Local Locker Bridge response.'));
      }, 9_000);

      pendingBridgeResolvers.set(commandId, {
        timer,
        resolve: (resObj) => {
          clearTimeout(timer);
          finish(resObj);
        },
      });

      unsubFirestore = cmdDocRef.onSnapshot(
        (docSnap) => {
          const d = docSnap.data();
          if (d && d.status === 'completed') {
            clearTimeout(timer);
            finish({
              ok: Boolean(d.responseOk),
              status: Number(d.responseStatus || 200),
              data: d.responseData,
              error: d.responseError,
            });
          }
        },
        () => {
          // Ignore snapshot listener error; in-memory resolver or timeout handles it
        }
      );
    });

    if (method !== 'GET') {
      lastMutationAt = Date.now();
    }

    if (!result.ok) {
      const errText = String(result.error || result.data?.error || result.data?.message || '');
      if (
        errText.includes('Cannot reach local locker server') ||
        result.status === 502 ||
        result.status === 504 ||
        result.status === 503
      ) {
        console.warn(`[API] [InzanLockers] Mac Bridge could not reach LAN server (${errText}). Falling back to direct HTTPS https://inzan.tailaf3d90.ts.net...`);
        return executeViaDirectHttp<T>(path, { method, body, isPublic });
      }

      const err: any = new Error(
        result.error || result.data?.error || result.data?.message || `Locker bridge HTTP ${result.status}`
      );
      err.status = result.status || 500;
      err.payload = result.data;
      throw err;
    }

    return {
      data: result.data as T,
      baseUrl: snap?.localUrl || 'https://inzan.tailaf3d90.ts.net',
    };
  } catch (bridgeErr: any) {
    console.warn(`[API] [InzanLockers] Bridge execution failed (${bridgeErr?.message}). Falling back to direct HTTPS https://inzan.tailaf3d90.ts.net...`);
    return executeViaDirectHttp<T>(path, { method, body, isPublic });
  }
}

async function getLockerServerConfig(forceRefresh = false): Promise<LockerServerConfig> {
  if (!forceRefresh && cachedConfig && Date.now() - cachedConfig.fetchedAt < CONFIG_TTL_MS) {
    return cachedConfig.config;
  }

  let storedBaseUrl = '';
  let storedUsername = '';
  let storedPassword = '';

  try {
    const inzanDb = getInzanFirestore();
    const snap = await inzanDb.collection('settings').doc('inzan_locker_config').get();
    if (snap.exists) {
      const data = snap.data();
      storedBaseUrl = String(data?.baseUrl || '').trim();
      storedUsername = String(data?.username || '').trim();
      storedPassword = String(data?.password || '');
    }
  } catch (err) {
    console.error('[API] [InzanLockers] Failed reading settings/inzan_locker_config:', err);
  }

  const baseUrl = (process.env.INZAN_LOCKER_URL || storedBaseUrl || DEFAULT_LOCKER_BASE_URL).replace(/\/+$/, '');
  const username = process.env.INZAN_LOCKER_USERNAME || storedUsername || DEFAULT_LOCKER_USERNAME;
  const password = process.env.INZAN_LOCKER_PASSWORD || storedPassword || '';

  const config: LockerServerConfig = { baseUrl, username, password };
  cachedConfig = { config, fetchedAt: Date.now() };
  return config;
}

async function getLockerServerJwt(forceLogin = false): Promise<{ token: string; baseUrl: string }> {
  const config = await getLockerServerConfig(forceLogin);
  if (
    !forceLogin &&
    cachedJwt &&
    cachedJwt.baseUrl === config.baseUrl &&
    Date.now() < cachedJwt.expiresAt
  ) {
    return { token: cachedJwt.token, baseUrl: config.baseUrl };
  }

  if (!config.password) {
    throw new Error(
      'Inzan Locker Server credentials are not configured in settings/inzan_locker_config or INZAN_LOCKER_PASSWORD.'
    );
  }

  const loginRes = await fetch(`${config.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: config.username, password: config.password }),
    signal: AbortSignal.timeout(3500),
  });

  const text = await loginRes.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!loginRes.ok || !data?.token) {
    throw new Error(data?.error || data?.message || `Locker server login failed (HTTP ${loginRes.status})`);
  }

  cachedJwt = {
    token: String(data.token),
    baseUrl: config.baseUrl,
    expiresAt: Date.now() + JWT_TTL_MS,
  };

  return { token: cachedJwt.token, baseUrl: config.baseUrl };
}

async function executeViaDirectHttp<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    isPublic?: boolean;
    retried?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<{ data: T; baseUrl: string }> {
  const method = options.method || 'GET';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const timeoutMs = options.timeoutMs || 6500;

  let baseUrl: string;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options.isPublic) {
    const cfg = await getLockerServerConfig();
    baseUrl = cfg.baseUrl;
  } else {
    const auth = await getLockerServerJwt(false);
    baseUrl = auth.baseUrl;
    headers.Authorization = `Bearer ${auth.token}`;
  }

  const res = await fetch(`${baseUrl}${normalizedPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.status === 502 || res.status === 503 || res.status === 504 || res.status === 530) {
    throw new Error(`Tunnel gateway error HTTP ${res.status}`);
  }

  if ((res.status === 401 || res.status === 403) && !options.isPublic && !options.retried) {
    const freshAuth = await getLockerServerJwt(true);
    headers.Authorization = `Bearer ${freshAuth.token}`;
    const retryRes = await fetch(`${freshAuth.baseUrl}${normalizedPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const retryText = await retryRes.text();
    let retryData: any = {};
    try {
      retryData = retryText ? JSON.parse(retryText) : {};
    } catch {
      retryData = { error: retryText };
    }
    if (!retryRes.ok) {
      const err: any = new Error(
        retryData?.error || retryData?.reason || retryData?.message || `Locker server HTTP ${retryRes.status}`
      );
      err.status = retryRes.status;
      err.payload = retryData;
      throw err;
    }
    if (method !== 'GET') lastMutationAt = Date.now();
    lastDirectTunnelFailureAt = 0;
    return { data: retryData as T, baseUrl: freshAuth.baseUrl };
  }

  const text = await res.text();
  let data: any = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text };
  }

  if (!res.ok) {
    const err: any = new Error(
      data?.error || data?.reason || data?.message || `Locker server HTTP ${res.status}`
    );
    err.status = res.status;
    err.payload = data;
    throw err;
  }

  if (method !== 'GET') lastMutationAt = Date.now();
  lastDirectTunnelFailureAt = 0;
  return { data: data as T, baseUrl };
}

async function lockerApiRequest<T = any>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: any;
    isPublic?: boolean;
    retried?: boolean;
  } = {}
): Promise<{ data: T; baseUrl: string }> {
  const method = options.method || 'GET';
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // 1. If the macOS Outbound Bridge pushed a fresh snapshot (< 25s old) and no mutation occurred since, serve GET immediately
  const snap = await getBridgeSnapshot();
  const bridgeOnline = Boolean(snap && Date.now() - snap.pushedAt < 65_000);
  if (method === 'GET' && snap && Date.now() - snap.pushedAt < 25_000 && snap.pushedAt >= lastMutationAt) {
    const cachedVal = getCachedEndpointFromBridgeSnapshot(normalizedPath, snap);
    if (cachedVal !== undefined) {
      return {
        data: cachedVal as T,
        baseUrl: snap.tunnelUrl || snap.localUrl || 'https://inzan.tailaf3d90.ts.net',
      };
    }
  }

  // 2. PRIMARY: Try direct HTTPS to public Tailscale link (https://inzan.tailaf3d90.ts.net)
  // This connects instantly without needing any local daemon to poll or be on the same Wi-Fi.
  try {
    return await executeViaDirectHttp<T>(normalizedPath, options);
  } catch (directErr: any) {
    // If it's a valid 4xx business error from the locker server (e.g. 404 Locker Not Found, 400 Bad Request, 409 In Use),
    // rethrow immediately — the server responded properly with a domain rejection.
    if (directErr?.status && directErr.status >= 400 && directErr.status < 500) {
      throw directErr;
    }
    lastDirectTunnelFailureAt = Date.now();
    console.warn(
      `[API] [InzanLockers] Direct request to https://inzan.tailaf3d90.ts.net failed (${method} ${normalizedPath}: ${directErr?.message}). Falling back to macOS Local Bridge...`
    );

    // 3. FALLBACK: Route through macOS Local Bridge if online
    if (bridgeOnline) {
      return executeViaMacosBridge<T>(normalizedPath, method, options.body, options.isPublic);
    }

    throw directErr;
  }
}

function mapHardwareStatusToCrmStatus(status?: string | null): 'Available' | 'Assigned' | 'Maintenance' {
  const s = String(status || '').toLowerCase();
  if (s === 'maintenance') return 'Maintenance';
  if (s === 'occupied' || s === 'in-use' || s === 'assigned') return 'Assigned';
  return 'Available';
}

export async function syncHardwareLockersToFirestore(params: {
  lockers: any[];
  users: any[];
  groups: any[];
}): Promise<{
  enrichedLockers: any[];
  firestoreMap: Map<string, Record<string, any>>;
}> {
  const inzanDb = getInzanFirestore();
  const existingSnap = await inzanDb.collection('lockers').get();
  const firestoreMap = new Map<string, Record<string, any>>();
  existingSnap.forEach((doc) => {
    firestoreMap.set(doc.id, doc.data());
  });

  const userById = new Map<number, any>();
  const userByLockerId = new Map<number, any>();
  for (const u of params.users) {
    if (typeof u?.id === 'number') {
      userById.set(u.id, u);
    }
    if (typeof u?.locker_id === 'number') {
      userByLockerId.set(u.locker_id, u);
    }
  }

  const groupByLockerId = new Map<number, any>();
  for (const g of params.groups) {
    if (Array.isArray(g?.locker_ids)) {
      for (const lid of g.locker_ids) {
        groupByLockerId.set(Number(lid), g);
      }
    }
  }

  const nowIso = new Date().toISOString();
  const docsToUpsert: Array<{ id: string; data: Record<string, any> }> = [];
  const docsToDelete: string[] = [];
  const enrichedLockers: any[] = [];

  for (const locker of params.lockers) {
    const rawName = String(locker.name || locker.locker_id || locker.id || '').trim();
    if (/reader/i.test(rawName) || /reader/i.test(String(locker.locker_id || ''))) {
      docsToDelete.push(String(locker.id));
      continue;
    }

    const docId = String(locker.id);
    const existing = firestoreMap.get(docId) || {};
    const occupant =
      (locker.user_id ? userById.get(Number(locker.user_id)) : null) ||
      userByLockerId.get(Number(locker.id)) ||
      null;
    const group = groupByLockerId.get(Number(locker.id)) || null;
    const crmStatus = mapHardwareStatusToCrmStatus(locker.status);
    const isOccupied = crmStatus === 'Assigned';

    const isFemale =
      /^F\d/i.test(rawName) ||
      String(locker.gender || '').toLowerCase() === 'women' ||
      String(group?.slug || '').toLowerCase() === 'women' ||
      String(group?.name || '').toLowerCase() === 'women';
    const isMale =
      !isFemale &&
      (/^M\d/i.test(rawName) ||
        String(locker.gender || '').toLowerCase() === 'men' ||
        String(group?.slug || '').toLowerCase() === 'men' ||
        String(group?.name || '').toLowerCase() === 'men');

    const resolvedGender = isFemale ? 'women' : isMale ? 'men' : locker.gender || null;
    const resolvedBranch = isFemale
      ? "Women's Lockers (F)"
      : isMale
      ? "Men's Lockers (M)"
      : existing.branch || 'Garden 8';

    const occupantFullName = occupant
      ? `${occupant.first_name || ''} ${occupant.last_name || ''}`.trim()
      : '';

    const resolvedClientId = isOccupied
      ? String(existing.assignedTo || occupant?.gym_id || (occupant ? `guest_${occupant.id}` : '')).trim()
      : '';
    const resolvedClientName = isOccupied
      ? String(existing.assignedToName || occupantFullName || occupant?.username || '').trim()
      : '';
    const resolvedPin = isOccupied ? String(existing.code || '') : '';
    const resolvedSessionToken = isOccupied ? String(existing.sessionToken || '') : '';
    const resolvedExpiresAt = isOccupied
      ? occupant?.valid_until || existing.expiresAt || null
      : null;

    const enriched = {
      ...locker,
      gender: resolvedGender,
      occupant: occupant || null,
      group: group
        ? {
            id: group.id,
            name: group.name,
            description: group.description || '',
            color: group.color || (isFemale ? '#EC4899' : '#3B82F6'),
            slug: group.slug,
            is_system: group.is_system,
            locker_ids: group.locker_ids || [],
          }
        : isFemale
        ? { id: 41, name: 'Women', description: "Women's Locker Room", color: '#EC4899', slug: 'women', is_system: 1, locker_ids: [] }
        : isMale
        ? { id: 40, name: 'Men', description: "Men's Locker Room", color: '#3B82F6', slug: 'men', is_system: 1, locker_ids: [] }
        : null,
      crmClientId: resolvedClientId || null,
      crmClientName: resolvedClientName || null,
      crmPin: resolvedPin || null,
    };
    enrichedLockers.push(enriched);

    const firestoreDoc: Record<string, any> = {
      id: docId,
      hardwareId: Number(locker.id),
      locker_id: locker.locker_id || docId,
      number: rawName,
      branch: resolvedBranch,
      location: locker.location || '',
      status: crmStatus,
      hardwareStatus: locker.status || 'available',
      isOnline: locker.is_online === 1,
      lastHeartbeat: locker.last_heartbeat || null,
      ipAddress: locker.ip_address || null,
      controllerId: locker.controller_id ?? null,
      channel: locker.channel ?? null,
      protocol: locker.protocol || null,
      relayState: locker.relay_state || 'OFF',
      gender: resolvedGender,
      groupId: group?.id ?? (isFemale ? 41 : isMale ? 40 : null),
      groupName: group?.name ?? (isFemale ? 'Women' : isMale ? 'Men' : null),
      groupColor: group?.color ?? (isFemale ? '#EC4899' : '#3B82F6'),
      hardwareUserId: isOccupied ? (occupant?.id ?? locker.user_id ?? null) : null,
      assignedTo: resolvedClientId,
      assignedToName: resolvedClientName,
      code: resolvedPin,
      sessionToken: resolvedSessionToken,
      expiresAt: resolvedExpiresAt,
      updatedAt: nowIso,
    };

    docsToUpsert.push({ id: docId, data: firestoreDoc });
    firestoreMap.set(docId, firestoreDoc);
  }

  for (const delId of docsToDelete) {
    try {
      await inzanDb.collection('lockers').doc(delId).delete();
      firestoreMap.delete(delId);
    } catch {
      // ignore
    }
  }

  // Commit in batches of 400
  const BATCH_SIZE = 400;
  for (let i = 0; i < docsToUpsert.length; i += BATCH_SIZE) {
    const chunk = docsToUpsert.slice(i, i + BATCH_SIZE);
    const batch = inzanDb.batch();
    for (const item of chunk) {
      const ref = inzanDb.collection('lockers').doc(item.id);
      batch.set(ref, stripUndefinedDeep(item.data), { merge: true });
    }
    await batch.commit();
  }

  return { enrichedLockers, firestoreMap };
}

async function writeLockerAuditLog(
  caller: AuthenticatedCaller,
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'OVERRIDE',
  entityId: string,
  details: string
): Promise<void> {
  try {
    const inzanDb = getInzanFirestore();
    await inzanDb.collection('auditLogs').add({
      userId: caller.uid,
      userName: caller.name,
      action,
      entityType: 'SYSTEM',
      entityId: String(entityId),
      details,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API] [InzanLockers] Failed writing audit log:', err);
  }
}

function canCallerAccessClientLocker(caller: AuthenticatedCaller, targetClientId?: string | null): boolean {
  if (caller.isStaff) return true;
  if (!targetClientId) return false;
  const normalizedTarget = String(targetClientId).trim();
  if (!normalizedTarget) return false;
  if (caller.uid === normalizedTarget) return true;
  if (caller.clientDocId && caller.clientDocId === normalizedTarget) return true;
  if (caller.clientRecordId && caller.clientRecordId === normalizedTarget) return true;
  return false;
}

// ============================================================================
// 1. GET /overview (Staff)
// ============================================================================
inzanLockerRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required for locker overview.' });
      return;
    }

    const [
      statusRes,
      heartbeatRes,
      lockersRes,
      groupsRes,
      controllersRes,
      readersRes,
      usersRes,
      settingsRes,
      expiryRes,
    ] = await Promise.all([
      lockerApiRequest('/api/status'),
      lockerApiRequest('/api/heartbeat-status'),
      lockerApiRequest('/api/lockers'),
      lockerApiRequest('/api/groups'),
      lockerApiRequest('/api/controllers'),
      lockerApiRequest('/api/readers'),
      lockerApiRequest('/api/users'),
      lockerApiRequest('/api/settings'),
      lockerApiRequest('/api/settings/locker-expiry'),
    ]);

    const rawLockers = Array.isArray(lockersRes.data) ? lockersRes.data : lockersRes.data?.data || [];
    const rawGroups = Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.data || [];
    const rawControllers = Array.isArray(controllersRes.data)
      ? controllersRes.data
      : controllersRes.data?.data || [];
    const rawReaders = Array.isArray(readersRes.data) ? readersRes.data : readersRes.data?.data || [];
    const rawUsers = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];

    const { enrichedLockers } = await syncHardwareLockersToFirestore({
      lockers: rawLockers,
      users: rawUsers,
      groups: rawGroups,
    });

    const enrichedControllers = rawControllers.map((ctrl: any) => {
      const matchedGroup =
        ctrl.group ||
        rawGroups.find(
          (g: any) =>
            (ctrl.gender && g.slug === ctrl.gender) ||
            (Array.isArray(ctrl.lockers) &&
              ctrl.lockers.some((cl: any) => Array.isArray(g.locker_ids) && g.locker_ids.includes(cl.id)))
        ) ||
        null;
      return {
        ...ctrl,
        group: matchedGroup ? { id: matchedGroup.id, name: matchedGroup.name, color: matchedGroup.color } : null,
      };
    });

    const bridgeSnap = await getBridgeSnapshot();
    const bridgeOnline = Boolean(bridgeSnap && Date.now() - bridgeSnap.pushedAt < 65_000);
    const hostProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const hostName = req.get('host') || 'admin.inzanathletics.com';
    const crmOrigin = hostName.includes('localhost')
      ? `${hostProto}://${hostName}`
      : 'https://admin.inzanathletics.com';
    const installCommand = `curl -fsSL ${crmOrigin}/api/inzan/lockers/macos-bridge.sh | bash`;

    res.json({
      ok: true,
      serverUrl: statusRes.baseUrl,
      status: statusRes.data,
      heartbeat: heartbeatRes.data,
      lockerExpiryHours: Number(expiryRes.data?.lockerExpiryHours) || 3,
      settings: settingsRes.data,
      lockers: enrichedLockers,
      groups: rawGroups,
      controllers: enrichedControllers,
      readers: rawReaders,
      users: rawUsers,
      syncedAt: new Date().toISOString(),
      bridge: {
        online: bridgeOnline,
        lastSeen: bridgeSnap?.pushedAtIso || null,
        localUrl: bridgeSnap?.localUrl || 'http://192.168.10.31:3701',
        tunnelUrl: bridgeSnap?.tunnelUrl || null,
        hostname: bridgeSnap?.hostname || null,
        installCommand,
      },
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /overview error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch Inzan locker overview' });
  }
});

// ============================================================================
// 1B. MACOS LOCAL BRIDGE & SELF-HEALING TUNNEL ENDPOINTS
// ============================================================================
async function verifyBridgeKey(req: Request): Promise<boolean> {
  const headerKey = String(
    req.headers['x-inzan-bridge-key'] ||
      (req.headers.authorization?.startsWith('Bearer ')
        ? req.headers.authorization.slice(7)
        : '') ||
      req.query.key ||
      ''
  ).trim();
  if (!headerKey) return false;

  const cfg = await getLockerServerConfig();
  if (cfg.password && headerKey === cfg.password) return true;

  try {
    const inzanDb = getInzanFirestore();
    const snap = await inzanDb.collection('settings').doc('inzan_locker_config').get();
    const data = snap.data();
    if (data?.bridgeKey && headerKey === String(data.bridgeKey).trim()) return true;
    if (data?.password && headerKey === String(data.password).trim()) return true;
  } catch {
    // ignore
  }
  return false;
}

inzanLockerRouter.post('/bridge/push', async (req: Request, res: Response) => {
  try {
    if (!(await verifyBridgeKey(req))) {
      res.status(401).json({ error: 'Unauthorized bridge key' });
      return;
    }

    const body = req.body || {};
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    const localUrl = String(body.localUrl || 'http://192.168.10.31:3701').trim();
    const tunnelUrl = body.tunnelUrl ? String(body.tunnelUrl).trim().replace(/\/+$/, '') : null;

    const prevSnap = await getBridgeSnapshot();
    const snap: LockerBridgeSnapshot = stripUndefinedDeep({
      pushedAt: now,
      pushedAtIso: nowIso,
      localUrl,
      tunnelUrl: tunnelUrl || prevSnap?.tunnelUrl || null,
      hostname: body.hostname ? String(body.hostname) : prevSnap?.hostname,
      status: body.status ?? prevSnap?.status ?? { mqtt: 'connected', connected: true },
      heartbeat: body.heartbeat ?? prevSnap?.heartbeat,
      lockers: Array.isArray(body.lockers) ? body.lockers : prevSnap?.lockers || [],
      groups: Array.isArray(body.groups) ? body.groups : prevSnap?.groups || [],
      controllers: Array.isArray(body.controllers) ? body.controllers : prevSnap?.controllers || [],
      readers: Array.isArray(body.readers) ? body.readers : prevSnap?.readers || [],
      users: Array.isArray(body.users) ? body.users : prevSnap?.users || [],
      settings: body.settings ?? prevSnap?.settings ?? {},
      lockerExpiryHours:
        Number(body.lockerExpiryHours || body.expiry?.lockerExpiryHours || prevSnap?.lockerExpiryHours) || 3,
    });

    latestBridgeSnapshot = snap;

    const inzanDb = getInzanFirestore();
    await inzanDb.collection('settings').doc('inzan_locker_bridge_state').set(snap, { merge: true });

    // If the macOS agent provides a live verified tunnel URL (e.g. Cloudflare Tunnel or Tailscale), auto-update baseUrl
    if (tunnelUrl && /^https:\/\//i.test(tunnelUrl)) {
      const currentCfg = await getLockerServerConfig();
      if (currentCfg.baseUrl !== tunnelUrl) {
        await inzanDb
          .collection('settings')
          .doc('inzan_locker_config')
          .set(
            {
              baseUrl: tunnelUrl,
              localUrl,
              tunnelUpdatedAt: nowIso,
            },
            { merge: true }
          );
        cachedConfig = null;
        cachedJwt = null;
        lastDirectTunnelFailureAt = 0;
      }
    }

    if (
      Array.isArray(snap.lockers) &&
      snap.lockers.length > 0 &&
      (Boolean(body.forceSync) || !prevSnap || now - prevSnap.pushedAt > 45_000)
    ) {
      await syncHardwareLockersToFirestore({
        lockers: snap.lockers,
        users: Array.isArray(snap.users) ? snap.users : [],
        groups: Array.isArray(snap.groups) ? snap.groups : [],
      });
    }

    res.json({
      ok: true,
      syncedAt: nowIso,
      lockersCount: snap.lockers?.length || 0,
      activeTunnelUrl: snap.tunnelUrl,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /bridge/push error:', err);
    res.status(500).json({ error: err.message || 'Bridge push failed' });
  }
});

inzanLockerRouter.get('/bridge/poll', async (req: Request, res: Response) => {
  try {
    if (!(await verifyBridgeKey(req))) {
      res.status(401).json({ error: 'Unauthorized bridge key' });
      return;
    }

    const inzanDb = getInzanFirestore();
    const fetchPending = async (): Promise<LockerBridgeCommand[]> => {
      const snap = await inzanDb
        .collection('lockerBridgeCommands')
        .where('status', '==', 'pending')
        .limit(10)
        .get();
      if (snap.empty) return [];
      const list: LockerBridgeCommand[] = [];
      const cutoff = Date.now() - 30_000;
      for (const doc of snap.docs) {
        const d = doc.data() as LockerBridgeCommand;
        if (d.createdAt < cutoff) {
          doc.ref.delete().catch(() => {});
          continue;
        }
        await doc.ref.set({ status: 'claimed', claimedAt: Date.now() }, { merge: true });
        list.push(d);
      }
      return list;
    };

    let commands = await fetchPending();
    if (commands.length === 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          bridgePollWaiters.delete(wake);
          resolve();
        }, 7000);
        const wake = () => {
          clearTimeout(timer);
          bridgePollWaiters.delete(wake);
          resolve();
        };
        bridgePollWaiters.add(wake);
      });
      commands = await fetchPending();
    }

    res.json({ ok: true, commands });
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /bridge/poll error:', err);
    res.status(500).json({ error: err.message || 'Bridge poll failed' });
  }
});

inzanLockerRouter.post('/bridge/respond', async (req: Request, res: Response) => {
  try {
    if (!(await verifyBridgeKey(req))) {
      res.status(401).json({ error: 'Unauthorized bridge key' });
      return;
    }

    const { commandId, ok, status, data, error } = req.body || {};
    if (!commandId) {
      res.status(400).json({ error: 'commandId is required' });
      return;
    }

    const resolver = pendingBridgeResolvers.get(String(commandId));
    if (resolver) {
      resolver.resolve({
        ok: Boolean(ok),
        status: Number(status || (ok ? 200 : 500)),
        data,
        error: error ? String(error) : undefined,
      });
    }

    const inzanDb = getInzanFirestore();
    await inzanDb
      .collection('lockerBridgeCommands')
      .doc(String(commandId))
      .set(
        stripUndefinedDeep({
          status: 'completed',
          responseOk: Boolean(ok),
          responseStatus: Number(status || (ok ? 200 : 500)),
          responseData: data ?? null,
          responseError: error ? String(error) : null,
          completedAt: Date.now(),
        }),
        { merge: true }
      );

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /bridge/respond error:', err);
    res.status(500).json({ error: err.message || 'Bridge respond failed' });
  }
});

inzanLockerRouter.get('/bridge/status', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const snap = await getBridgeSnapshot();
    const cfg = await getLockerServerConfig();
    const online = Boolean(snap && Date.now() - snap.pushedAt < 65_000);
    const hostProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const hostName = req.get('host') || 'admin.inzanathletics.com';
    const crmOrigin = hostName.includes('localhost')
      ? `${hostProto}://${hostName}`
      : 'https://admin.inzanathletics.com';

    res.json({
      ok: true,
      online,
      lastSeen: snap?.pushedAtIso || null,
      localUrl: snap?.localUrl || 'http://192.168.10.31:3701',
      tunnelUrl: snap?.tunnelUrl || null,
      activeBaseUrl: cfg.baseUrl,
      hostname: snap?.hostname || null,
      installCommand: `curl -fsSL ${crmOrigin}/api/inzan/lockers/macos-bridge.sh | bash`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to get bridge status' });
  }
});

inzanLockerRouter.get('/macos-bridge.sh', async (req: Request, res: Response) => {
  try {
    const inzanDb = getInzanFirestore();
    const cfgDoc = await inzanDb.collection('settings').doc('inzan_locker_config').get();
    const cfgData = cfgDoc.exists ? cfgDoc.data() || {} : {};
    const lockerUser = String(cfgData.username || DEFAULT_LOCKER_USERNAME || 'admin').trim();
    const lockerPass = String(cfgData.password || process.env.INZAN_LOCKER_PASSWORD || '').trim();
    let bridgeKey = String(cfgData.bridgeKey || '').trim();
    if (!bridgeKey) {
      bridgeKey = lockerPass || `inzan_bridge_${Date.now().toString(36)}`;
      await inzanDb.collection('settings').doc('inzan_locker_config').set({ bridgeKey }, { merge: true });
    }

    const hostProto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const hostName = req.get('host') || 'admin.inzanathletics.com';
    const crmUrl = hostName.includes('localhost')
      ? `${hostProto}://${hostName}`
      : 'https://admin.inzanathletics.com';
    const localUrl = String(req.query.localUrl || cfgData.localUrl || 'http://192.168.10.31:3701').trim();

    const script = `#!/usr/bin/env bash
set -euo pipefail

echo "=================================================================="
echo "  INZAN ATHLETICS — SMART LOCKER MACOS BRIDGE & TUNNEL WATCHDOG"
echo "=================================================================="

BRIDGE_DIR="\$HOME/.inzan-locker-bridge"
BIN_DIR="\$BRIDGE_DIR/bin"
LOG_DIR="\$BRIDGE_DIR/logs"
PLIST_PATH="\$HOME/Library/LaunchAgents/com.inzanathletics.locker-bridge.plist"

mkdir -p "\$BIN_DIR" "\$LOG_DIR" "\$HOME/Library/LaunchAgents"

CRM_URL="${crmUrl}"
LOCAL_LOCKER_URL="${localUrl}"
LOCKER_USER="${lockerUser}"
LOCKER_PASS="${lockerPass}"
BRIDGE_KEY="${bridgeKey}"

# 1. Install standalone cloudflared binary if not already present (no sudo or Homebrew required)
CLOUDFLARED_BIN=""
if command -v cloudflared >/dev/null 2>&1; then
  CLOUDFLARED_BIN="\$(command -v cloudflared)"
elif [ -x "\$BIN_DIR/cloudflared" ]; then
  CLOUDFLARED_BIN="\$BIN_DIR/cloudflared"
else
  ARCH="\$(uname -m)"
  if [ "\$ARCH" = "arm64" ]; then
    CF_TGZ="cloudflared-darwin-arm64.tgz"
  else
    CF_TGZ="cloudflared-darwin-amd64.tgz"
  fi
  echo "-> Downloading official Cloudflare Tunnel binary (\$CF_TGZ)..."
  if curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/\$CF_TGZ" -o "\$BIN_DIR/cf.tgz"; then
    tar -xzf "\$BIN_DIR/cf.tgz" -C "\$BIN_DIR"
    rm -f "\$BIN_DIR/cf.tgz"
    chmod +x "\$BIN_DIR/cloudflared"
    CLOUDFLARED_BIN="\$BIN_DIR/cloudflared"
    echo "-> Installed cloudflared to \$CLOUDFLARED_BIN"
  else
    echo "-> Warning: Could not download cloudflared (Outbound HTTPS Bridge will still work 100%)."
  fi
fi

# 2. Write the zero-dependency Python 3 Bridge + Self-Healing Tunnel Agent
cat << 'EOF_PY' > "\$BRIDGE_DIR/agent.py"
#!/usr/bin/env python3
import json
import os
import re
import socket
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

CRM_URL = os.environ.get("INZAN_CRM_URL", "https://admin.inzanathletics.com").rstrip("/")
PRIMARY_LOCAL_URL = os.environ.get("INZAN_LOCAL_LOCKER_URL", "http://192.168.10.31:3701").rstrip("/")
LOCKER_USER = os.environ.get("INZAN_LOCKER_USER", "admin")
LOCKER_PASS = os.environ.get("INZAN_LOCKER_PASS", "")
BRIDGE_KEY = os.environ.get("INZAN_BRIDGE_KEY", "")
CLOUDFLARED_BIN = os.environ.get("INZAN_CLOUDFLARED_BIN", "")

CANDIDATE_LOCAL_URLS = []
for u in [PRIMARY_LOCAL_URL, "https://inzan.tailaf3d90.ts.net", "http://192.168.10.31:3701", "http://127.0.0.1:3701", "http://localhost:3701"]:
    if u and u not in CANDIDATE_LOCAL_URLS:
        CANDIDATE_LOCAL_URLS.append(u)

SSL_CTX = ssl.create_default_context()
SSL_UNVERIFIED_CTX = ssl._create_unverified_context()

STATE = {
    "local_url": PRIMARY_LOCAL_URL,
    "jwt": None,
    "jwt_ts": 0,
    "tunnel_url": None,
    "hostname": socket.gethostname(),
}
LOCK = threading.Lock()
PUSH_NOW_EVENT = threading.Event()


def log(msg):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def http_json(url, method="GET", body=None, headers=None, timeout=8):
    req_headers = {"Content-Type": "application/json", "User-Agent": "InzanMacosLockerBridge/2.0"}
    if headers:
        req_headers.update(headers)
    data_bytes = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data_bytes, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX if url.startswith("https") else None) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.URLError as e:
        if url.startswith("https") and "CERTIFICATE_VERIFY_FAILED" in str(e):
            with urllib.request.urlopen(req, timeout=timeout, context=SSL_UNVERIFIED_CTX) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return resp.status, (json.loads(raw) if raw else {})
        raise


def scan_lan_for_locker_server():
    prefixes = ["192.168.10", "192.168.1", "192.168.0"]
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        my_ip = s.getsockname()[0]
        s.close()
        parts = my_ip.split(".")
        if len(parts) == 4:
            p = ".".join(parts[:3])
            if p not in prefixes:
                prefixes.insert(0, p)
    except Exception:
        pass

    found = []
    for prefix in prefixes[:2]:
        threads = []
        def probe(ip):
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(0.35)
                if sock.connect_ex((ip, 3701)) == 0:
                    found.append(f"http://{ip}:3701")
                sock.close()
            except Exception:
                pass
        for i in range(1, 255):
            t = threading.Thread(target=probe, args=(f"{prefix}.{i}",), daemon=True)
            threads.append(t)
            t.start()
        for t in threads:
            t.join(timeout=0.5)
        if found:
            break
    for u in found:
        if u not in CANDIDATE_LOCAL_URLS:
            CANDIDATE_LOCAL_URLS.insert(0, u)
    return found


def get_local_jwt(force=False):
    with LOCK:
        if not force and STATE["jwt"] and (time.time() - STATE["jwt_ts"] < 2400):
            return STATE["jwt"], STATE["local_url"]

    for attempt in range(2):
        for candidate in list(CANDIDATE_LOCAL_URLS):
            try:
                status, data = http_json(
                    f"{candidate}/api/auth/login",
                    method="POST",
                    body={"username": LOCKER_USER, "password": LOCKER_PASS},
                    timeout=3,
                )
                if status == 200 and data.get("token"):
                    with LOCK:
                        STATE["local_url"] = candidate
                        STATE["jwt"] = data["token"]
                        STATE["jwt_ts"] = time.time()
                    return data["token"], candidate
            except Exception:
                continue
        if attempt == 0:
            scan_lan_for_locker_server()
    raise RuntimeError(f"Cannot reach local locker server on any LAN address: {CANDIDATE_LOCAL_URLS}")


def local_api(path, method="GET", body=None, is_public=False):
    norm_path = path if path.startswith("/") else f"/{path}"
    token, base_url = get_local_jwt(False)
    headers = {} if is_public else {"Authorization": f"Bearer {token}"}
    try:
        return http_json(f"{base_url}{norm_path}", method=method, body=body, headers=headers, timeout=6)
    except urllib.error.HTTPError as he:
        if he.code in (401, 403) and not is_public:
            token, base_url = get_local_jwt(True)
            headers = {"Authorization": f"Bearer {token}"}
            return http_json(f"{base_url}{norm_path}", method=method, body=body, headers=headers, timeout=6)
        raw_err = he.read().decode("utf-8", errors="replace")
        try:
            err_json = json.loads(raw_err)
        except Exception:
            err_json = {"error": raw_err or f"HTTP {he.code}"}
        return he.code, err_json


def collect_and_push_snapshot():
    try:
        _, status_data = local_api("/api/status")
        _, heartbeat_data = local_api("/api/heartbeat-status")
        _, lockers_data = local_api("/api/lockers")
        _, groups_data = local_api("/api/groups")
        _, controllers_data = local_api("/api/controllers")
        _, readers_data = local_api("/api/readers")
        _, users_data = local_api("/api/users")
        _, settings_data = local_api("/api/settings")
        _, expiry_data = local_api("/api/settings/locker-expiry")

        payload = {
            "localUrl": STATE["local_url"],
            "tunnelUrl": STATE["tunnel_url"],
            "hostname": STATE["hostname"],
            "status": status_data,
            "heartbeat": heartbeat_data,
            "lockers": lockers_data.get("data") if isinstance(lockers_data, dict) else lockers_data,
            "groups": groups_data.get("data") if isinstance(groups_data, dict) else groups_data,
            "controllers": controllers_data.get("data") if isinstance(controllers_data, dict) else controllers_data,
            "readers": readers_data.get("data") if isinstance(readers_data, dict) else readers_data,
            "users": users_data.get("data") if isinstance(users_data, dict) else users_data,
            "settings": settings_data,
            "lockerExpiryHours": expiry_data.get("lockerExpiryHours", 3) if isinstance(expiry_data, dict) else 3,
        }

        http_json(
            f"{CRM_URL}/api/inzan/lockers/bridge/push",
            method="POST",
            body=payload,
            headers={"x-inzan-bridge-key": BRIDGE_KEY},
            timeout=10,
        )
        return True
    except Exception as e:
        log(f"[SnapshotSync] Warning: {e}")
        return False


def snapshot_loop():
    log(f"Starting Outbound Snapshot Sync Loop -> {CRM_URL}")
    while True:
        collect_and_push_snapshot()
        PUSH_NOW_EVENT.wait(timeout=5.0)
        PUSH_NOW_EVENT.clear()


def command_poll_loop():
    log(f"Starting Real-Time Command Poller Loop -> {CRM_URL}")
    while True:
        try:
            status, res = http_json(
                f"{CRM_URL}/api/inzan/lockers/bridge/poll",
                method="GET",
                headers={"x-inzan-bridge-key": BRIDGE_KEY},
                timeout=15,
            )
            commands = res.get("commands", []) if isinstance(res, dict) else []
            for cmd in commands:
                cmd_id = cmd.get("id")
                path = cmd.get("path", "/api/status")
                method = cmd.get("method", "GET")
                body = cmd.get("body")
                is_public = bool(cmd.get("isPublic", False))
                log(f"[Command] Executing {method} {path} (id={cmd_id})")
                try:
                    code, data = local_api(path, method=method, body=body, is_public=is_public)
                    ok = 200 <= code < 300
                    http_json(
                        f"{CRM_URL}/api/inzan/lockers/bridge/respond",
                        method="POST",
                        body={"commandId": cmd_id, "ok": ok, "status": code, "data": data},
                        headers={"x-inzan-bridge-key": BRIDGE_KEY},
                        timeout=8,
                    )
                except Exception as cmd_err:
                    http_json(
                        f"{CRM_URL}/api/inzan/lockers/bridge/respond",
                        method="POST",
                        body={"commandId": cmd_id, "ok": False, "status": 500, "error": str(cmd_err)},
                        headers={"x-inzan-bridge-key": BRIDGE_KEY},
                        timeout=8,
                    )
                PUSH_NOW_EVENT.set()
        except Exception as e:
            log(f"[CommandPoller] Reconnecting after error: {e}")
            time.sleep(2)


def tunnel_watchdog_loop():
    if not CLOUDFLARED_BIN or not os.path.exists(CLOUDFLARED_BIN):
        log("[TunnelWatchdog] cloudflared binary not found; running in pure Outbound HTTPS Bridge mode.")
        return

    url_pattern = re.compile(r"(https://[a-zA-Z0-9-]+\\.trycloudflare\\.com)")
    while True:
        try:
            _, target_local = get_local_jwt(False)
        except Exception:
            target_local = PRIMARY_LOCAL_URL

        log(f"[TunnelWatchdog] Launching self-healing Cloudflare tunnel -> {target_local}")
        proc = subprocess.Popen(
            [CLOUDFLARED_BIN, "tunnel", "--no-autoupdate", "--edge-ip-version", "4", "--protocol", "http2", "--url", target_local],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
        )

        def reader_thread(p):
            for line in p.stdout:
                m = url_pattern.search(line)
                if m:
                    new_url = m.group(1).rstrip("/")
                    if STATE["tunnel_url"] != new_url:
                        STATE["tunnel_url"] = new_url
                        log(f"[TunnelWatchdog] Active Tunnel URL acquired: {new_url}")
                        PUSH_NOW_EVENT.set()

        t = threading.Thread(target=reader_thread, args=(proc,), daemon=True)
        t.start()

        failures = 0
        while proc.poll() is None:
            time.sleep(20)
            tun = STATE.get("tunnel_url")
            if tun:
                try:
                    code, _ = http_json(f"{tun}/api/status", method="GET", timeout=6)
                    if 200 <= code < 500:
                        failures = 0
                    else:
                        failures += 1
                except Exception:
                    failures += 1
                if failures >= 3:
                    log(f"[TunnelWatchdog] Tunnel {tun} failed 3 health checks; restarting cloudflared...")
                    proc.terminate()
                    break

        try:
            proc.kill()
        except Exception:
            pass
        time.sleep(3)


if __name__ == "__main__":
    log("=== Inzan Locker Bridge Agent Starting ===")
    t_snap = threading.Thread(target=snapshot_loop, daemon=True)
    t_poll = threading.Thread(target=command_poll_loop, daemon=True)
    t_tun = threading.Thread(target=tunnel_watchdog_loop, daemon=True)
    t_snap.start()
    t_poll.start()
    t_tun.start()
    while True:
        time.sleep(60)
EOF_PY

chmod +x "\$BRIDGE_DIR/agent.py"

# 3. Create wrapper script with macOS caffeinate so the iMac never sleeps the bridge
cat << EOF_RUN > "\$BRIDGE_DIR/run.sh"
#!/usr/bin/env bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export INZAN_CRM_URL="\$CRM_URL"
export INZAN_LOCAL_LOCKER_URL="\$LOCAL_LOCKER_URL"
export INZAN_LOCKER_USER="\$LOCKER_USER"
export INZAN_LOCKER_PASS="\$LOCKER_PASS"
export INZAN_BRIDGE_KEY="\$BRIDGE_KEY"
export INZAN_CLOUDFLARED_BIN="\$CLOUDFLARED_BIN"

exec /usr/bin/caffeinate -i -s /usr/bin/python3 "\$BRIDGE_DIR/agent.py"
EOF_RUN

chmod +x "\$BRIDGE_DIR/run.sh"

# 4. Create macOS LaunchAgent plist for automatic startup & self-healing KeepAlive
cat << EOF_PLIST > "\$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.inzanathletics.locker-bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>\$BRIDGE_DIR/run.sh</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>5</integer>
  <key>StandardOutPath</key>
  <string>\$LOG_DIR/bridge.log</string>
  <key>StandardErrorPath</key>
  <string>\$LOG_DIR/bridge.err.log</string>
</dict>
</plist>
EOF_PLIST

# 5. Reload LaunchAgent service
launchctl bootout "gui/\$(id -u)/com.inzanathletics.locker-bridge" >/dev/null 2>&1 || true
launchctl unload "\$PLIST_PATH" >/dev/null 2>&1 || true
if launchctl bootstrap "gui/\$(id -u)" "\$PLIST_PATH" >/dev/null 2>&1; then
  launchctl kickstart -k "gui/\$(id -u)/com.inzanathletics.locker-bridge" >/dev/null 2>&1 || true
else
  launchctl load -w "\$PLIST_PATH"
fi

sleep 3
echo ""
echo "✅ INZAN MACOS LOCKER BRIDGE IS INSTALLED & RUNNING!"
echo "   • Local Locker Server : \$LOCAL_LOCKER_URL"
echo "   • Cloud CRM Target    : \$CRM_URL"
echo "   • Auto-Start Daemon   : \$PLIST_PATH"
echo "   • Live Logs           : tail -f \$LOG_DIR/bridge.log"
echo "=================================================================="
tail -n 12 "\$LOG_DIR/bridge.log" 2>/dev/null || true
`;

    res.setHeader('Content-Type', 'text/x-shellscript; charset=utf-8');
    res.send(script);
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /macos-bridge.sh error:', err);
    res.status(500).send(`# Error generating bridge script: ${err.message}\n`);
  }
});

// ============================================================================
// 4. POST /assign-cardless (Staff)
// ============================================================================
inzanLockerRouter.post('/assign-cardless', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { groupId, clientId, clientName, phone, email } = req.body || {};
    if (!groupId) {
      res.status(400).json({ error: 'groupId is required for cardless assignment.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/lockers/assign-cardless', {
      method: 'POST',
      body: { group_id: Number(groupId) },
    });

    let user = data?.user || null;
    const locker = data?.locker || null;
    const pin = data?.pin ? String(data.pin) : null;
    const expiresAt = data?.expires_at || user?.valid_until || new Date(Date.now() + 3 * 3600 * 1000).toISOString();

    if (user?.id && (clientId || clientName || phone || email)) {
      const nameParts = String(clientName || '').trim().split(/\s+/);
      const firstName = nameParts[0] || user.first_name || 'Guest';
      const lastName = nameParts.slice(1).join(' ') || user.last_name || '';
      try {
        const updatedUserRes = await lockerApiRequest(`/api/users/${user.id}`, {
          method: 'PUT',
          body: {
            first_name: firstName,
            last_name: lastName,
            email: email || user.email || `guest_${user.id}@locker.local`,
            gym_id: clientId || user.gym_id || null,
            phone: phone || user.phone || null,
            role: user.role || 'guest',
            rfid_tag: user.rfid_tag || null,
          },
        });
        if (updatedUserRes.data) {
          user = updatedUserRes.data;
        }
      } catch (uErr) {
        console.warn('[API] [InzanLockers] Optional guest user enrichment failed:', uErr);
      }
    }

    if (locker?.id) {
      const inzanDb = getInzanFirestore();
      await inzanDb
        .collection('lockers')
        .doc(String(locker.id))
        .set(
          stripUndefinedDeep({
            id: String(locker.id),
            hardwareId: Number(locker.id),
            number: locker.name || String(locker.id),
            branch: 'Garden 8',
            status: 'Assigned',
            hardwareStatus: 'occupied',
            hardwareUserId: user?.id ?? null,
            assignedTo: clientId || (user?.id ? `guest_${user.id}` : 'guest'),
            assignedToName:
              clientName || (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'Guest'),
            code: pin || '',
            expiresAt,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
    }

    await writeLockerAuditLog(
      caller,
      'UPDATE',
      String(locker?.id || groupId),
      `Cardless locker ${locker?.name || locker?.id} assigned${clientName ? ` to ${clientName}` : ''}`
    );

    res.json({
      ok: true,
      locker,
      user,
      pin,
      expires_at: expiresAt,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /assign-cardless error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to assign cardless locker' });
  }
});

// ============================================================================
// 5. POST /rfid-scan (Staff)
// ============================================================================
inzanLockerRouter.post('/rfid-scan', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { uid, groupId, readerId, source, clientId, clientName } = req.body || {};
    if (!uid || !groupId) {
      res.status(400).json({ error: 'uid and groupId are required.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/rfid/scan', {
      method: 'POST',
      body: {
        uid: String(uid).trim(),
        reader_id: readerId || 'kiosk-frontdesk',
        source: source || 'usb',
        group_id: Number(groupId),
      },
    });

    const locker = data?.locker;
    const user = data?.user;
    if (locker?.id && (data?.decision === 'allocated-and-opened' || data?.decision === 'opened-assigned')) {
      const inzanDb = getInzanFirestore();
      await inzanDb
        .collection('lockers')
        .doc(String(locker.id))
        .set(
          stripUndefinedDeep({
            id: String(locker.id),
            hardwareId: Number(locker.id),
            number: locker.name || String(locker.id),
            branch: 'Garden 8',
            status: 'Assigned',
            hardwareStatus: 'occupied',
            hardwareUserId: user?.id ?? null,
            assignedTo: clientId || user?.gym_id || (user?.id ? `guest_${user.id}` : 'guest'),
            assignedToName:
              clientName || (user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() : 'RFID Guest'),
            code: data?.pin ? String(data.pin) : undefined,
            expiresAt: data?.valid_until || user?.valid_until || null,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
    }

    res.json({
      ok: true,
      ...data,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /rfid-scan error:', err);
    if (err.payload) {
      res.status(err.status || 400).json({ ok: false, ...err.payload });
      return;
    }
    res.status(err.status || 500).json({ error: err.message || 'RFID scan failed' });
  }
});

// ============================================================================
// 10. POST /bulk-unlock (Staff)
// ============================================================================
inzanLockerRouter.post('/bulk-unlock', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const onlineOnly = req.body?.onlineOnly !== false;
    const { data } = await lockerApiRequest('/api/lockers/bulk-unlock', {
      method: 'POST',
      body: { onlineOnly },
    });

    await writeLockerAuditLog(caller, 'OVERRIDE', 'all_lockers', `Bulk unlocked online lockers (onlineOnly=${onlineOnly})`);

    res.json({
      ok: true,
      results: data?.results || [],
      errors: data?.errors || [],
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /bulk-unlock error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Bulk unlock failed' });
  }
});

// ============================================================================
// 8 & 9. Users Routes: PUT /users/:userId/extend-expiry & GET /users/:userId/logs
// ============================================================================
inzanLockerRouter.put('/users/:userId/extend-expiry', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const userId = Number(req.params.userId);
    const { newExpiryDate, lockerId } = req.body || {};
    if (!userId || !newExpiryDate) {
      res.status(400).json({ error: 'userId and newExpiryDate are required.' });
      return;
    }

    await lockerApiRequest(`/api/users/${userId}/extend-expiry`, {
      method: 'PUT',
      body: { newExpiryDate },
    });

    const inzanDb = getInzanFirestore();
    if (lockerId) {
      await inzanDb
        .collection('lockers')
        .doc(String(lockerId))
        .set({ expiresAt: newExpiryDate, updatedAt: new Date().toISOString() }, { merge: true });
    } else {
      const q = await inzanDb.collection('lockers').where('hardwareUserId', '==', userId).limit(1).get();
      if (!q.empty) {
        await q.docs[0]!.ref.set({ expiresAt: newExpiryDate, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }

    res.json({ ok: true, valid_until: newExpiryDate });
  } catch (err: any) {
    console.error('[API] [InzanLockers] PUT /users/:userId/extend-expiry error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to extend expiry' });
  }
});

inzanLockerRouter.get('/users/:userId/logs', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const userId = Number(req.params.userId);
    const { data } = await lockerApiRequest(`/api/users/${userId}/logs`);
    res.json({
      ok: true,
      logs: Array.isArray(data) ? data : data?.logs || [],
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /users/:userId/logs error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch user logs' });
  }
});

// ============================================================================
// 11 & 12. Groups Routes (Staff)
// ============================================================================
inzanLockerRouter.post('/groups/:groupId/bulk', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const groupId = Number(req.params.groupId);
    const operation: 'unlock' | 'maintenance' | 'normal' = req.body?.operation;
    if (!groupId || !['unlock', 'maintenance', 'normal'].includes(operation)) {
      res.status(400).json({ error: 'Valid groupId and operation (unlock | maintenance | normal) are required.' });
      return;
    }

    if (operation === 'unlock') {
      const { data } = await lockerApiRequest(`/api/locker-groups/${groupId}/bulk-unlock`, {
        method: 'POST',
        body: {},
      });
      await writeLockerAuditLog(caller, 'OVERRIDE', `group_${groupId}`, `Bulk unlocked group ${groupId}`);
      res.json({ ok: true, ...data });
      return;
    }

    const enable = operation === 'maintenance';
    const { data } = await lockerApiRequest(`/api/locker-groups/${groupId}/bulk-maintenance`, {
      method: 'POST',
      body: { enable },
    });
    await writeLockerAuditLog(
      caller,
      'UPDATE',
      `group_${groupId}`,
      `Set group ${groupId} maintenance=${enable}`
    );
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /groups/:groupId/bulk error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Group bulk operation failed' });
  }
});

inzanLockerRouter.post('/groups', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/locker-groups', {
      method: 'POST',
      body: req.body,
    });
    res.json({ ok: true, group: data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /groups error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create group' });
  }
});

inzanLockerRouter.put('/groups/:groupId', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/locker-groups/${req.params.groupId}`, {
      method: 'PUT',
      body: req.body,
    });
    res.json({ ok: true, group: data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] PUT /groups/:groupId error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update group' });
  }
});

inzanLockerRouter.delete('/groups/:groupId', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    await lockerApiRequest(`/api/locker-groups/${req.params.groupId}`, {
      method: 'DELETE',
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[API] [InzanLockers] DELETE /groups/:groupId error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete group' });
  }
});

// ============================================================================
// 13. Controllers Routes (Staff)
// ============================================================================
inzanLockerRouter.post('/controllers/:controllerId/relay/:channel', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { controllerId, channel } = req.params;
    const { action } = req.body || {};
    const { data } = await lockerApiRequest(`/api/controllers/${controllerId}/relay/${channel}`, {
      method: 'POST',
      body: { action },
    });
    res.json({ ok: true, success: data?.success !== false, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /controllers/:id/relay/:ch error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Relay command failed' });
  }
});

inzanLockerRouter.put('/controllers/:controllerId', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/controllers/${req.params.controllerId}`, {
      method: 'PUT',
      body: req.body,
    });
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] PUT /controllers/:id error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update controller' });
  }
});

inzanLockerRouter.post('/controllers/:controllerId/sync-group', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/controllers/${req.params.controllerId}/sync-group`, {
      method: 'POST',
    });
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /controllers/:id/sync-group error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to sync controller group' });
  }
});

inzanLockerRouter.post('/controllers/:controllerId/rename-channels', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/controllers/${req.params.controllerId}/rename-channels`, {
      method: 'POST',
      body: req.body,
    });
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /controllers/:id/rename-channels error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to rename controller channels' });
  }
});

// ============================================================================
// 14. Readers Routes (Staff)
// ============================================================================
inzanLockerRouter.post('/readers', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/readers', {
      method: 'POST',
      body: req.body,
    });
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /readers error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create reader' });
  }
});

inzanLockerRouter.put('/readers/:readerId', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/readers/${req.params.readerId}`, {
      method: 'PUT',
      body: req.body,
    });
    res.json({ ok: true, ...data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] PUT /readers/:id error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to update reader' });
  }
});

inzanLockerRouter.delete('/readers/:readerId', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    await lockerApiRequest(`/api/readers/${req.params.readerId}`, {
      method: 'DELETE',
    });
    res.json({ ok: true });
  } catch (err: any) {
    console.error('[API] [InzanLockers] DELETE /readers/:id error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete reader' });
  }
});

// ============================================================================
// 15. POST /settings (Staff)
// ============================================================================
inzanLockerRouter.post('/settings', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const { mqttConfig, systemSettings, serverConfig } = req.body || {};

    if (serverConfig && typeof serverConfig === 'object') {
      const inzanDb = getInzanFirestore();
      const updateObj: Record<string, any> = { updatedAt: new Date().toISOString(), updatedBy: caller.email };
      if (serverConfig.baseUrl) updateObj.baseUrl = String(serverConfig.baseUrl).trim().replace(/\/+$/, '');
      if (serverConfig.username) updateObj.username = String(serverConfig.username).trim();
      if (serverConfig.password) updateObj.password = String(serverConfig.password);
      await inzanDb.collection('settings').doc('inzan_locker_config').set(updateObj, { merge: true });
      cachedConfig = null;
      cachedJwt = null;
    }

    if (mqttConfig || systemSettings) {
      await lockerApiRequest('/api/settings', {
        method: 'POST',
        body: stripUndefinedDeep({ mqttConfig, systemSettings }),
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /settings error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to save locker settings' });
  }
});

// ============================================================================
// 16. Member & Profile Self-Service Routes (Staff + Authenticated Members)
// ============================================================================
inzanLockerRouter.get('/member-status', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const requestedClientId = String(req.query.clientId || caller.clientDocId || caller.clientRecordId || caller.uid).trim();
    if (!canCallerAccessClientLocker(caller, requestedClientId)) {
      res.status(403).json({ error: 'Forbidden: Cannot view locker status for another member.' });
      return;
    }

    const [lockersRes, usersRes, groupsRes] = await Promise.all([
      lockerApiRequest('/api/lockers'),
      lockerApiRequest('/api/users'),
      lockerApiRequest('/api/groups'),
    ]);

    const rawLockers: any[] = Array.isArray(lockersRes.data) ? lockersRes.data : lockersRes.data?.data || [];
    const rawUsers: any[] = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
    const rawGroups: any[] = Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.data || [];

    const inzanDb = getInzanFirestore();
    const fsQuery = await inzanDb
      .collection('lockers')
      .where('assignedTo', '==', requestedClientId)
      .limit(5)
      .get();

    let fsDoc: Record<string, any> | null = null;
    if (!fsQuery.empty) {
      fsDoc = fsQuery.docs[0]!.data();
    }

    const matchedUser =
      rawUsers.find((u) => u.gym_id && String(u.gym_id) === requestedClientId && u.locker_id) ||
      (fsDoc?.hardwareUserId ? rawUsers.find((u) => u.id === Number(fsDoc!.hardwareUserId)) : null) ||
      rawUsers.find((u) => u.gym_id && String(u.gym_id) === requestedClientId) ||
      null;

    let assignedLocker: any | null = null;
    if (matchedUser?.locker_id) {
      assignedLocker = rawLockers.find((l) => l.id === Number(matchedUser.locker_id)) || null;
    }
    if (!assignedLocker && fsDoc?.hardwareId) {
      const candidate = rawLockers.find((l) => l.id === Number(fsDoc!.hardwareId));
      if (candidate && (candidate.status === 'occupied' || candidate.status === 'in-use')) {
        assignedLocker = candidate;
      }
    }

    let occupant: any | null = matchedUser;
    if (assignedLocker && !occupant && assignedLocker.user_id) {
      occupant = rawUsers.find((u) => u.id === Number(assignedLocker.user_id)) || null;
    }

    if (assignedLocker) {
      const grp = rawGroups.find((g) => Array.isArray(g.locker_ids) && g.locker_ids.includes(assignedLocker.id)) || null;
      assignedLocker = {
        ...assignedLocker,
        occupant,
        group: grp,
        crmClientId: requestedClientId,
        crmClientName: fsDoc?.assignedToName || null,
        crmPin: fsDoc?.code || null,
      };
    }

    const groupsSummary = rawGroups.map((g: any) => {
      const lockerIds: number[] = Array.isArray(g.locker_ids) ? g.locker_ids : [];
      const availableOnline = rawLockers.filter(
        (l) => lockerIds.includes(l.id) && l.status === 'available' && l.is_online === 1
      ).length;
      return {
        id: g.id,
        name: g.name,
        slug: g.slug,
        color: g.color || '#3B82F6',
        availableOnline,
        total: lockerIds.length,
      };
    });

    res.json({
      ok: true,
      assignedLocker,
      occupant: assignedLocker ? occupant : null,
      pin: assignedLocker && fsDoc?.code ? String(fsDoc.code) : null,
      sessionToken: assignedLocker && fsDoc?.sessionToken ? String(fsDoc.sessionToken) : null,
      expiresAt: assignedLocker ? occupant?.valid_until || fsDoc?.expiresAt || null : null,
      unlockUrl: `${lockersRes.baseUrl}/unlock`,
      groups: groupsSummary,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /member-status error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch member locker status' });
  }
});

inzanLockerRouter.post('/member-claim', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const { clientId, clientName, gender, groupId, lockerId, phone, email } = req.body || {};
    const resolvedClientId = String(clientId || caller.clientDocId || caller.clientRecordId || caller.uid).trim();
    const resolvedClientName = String(clientName || caller.name || 'Member').trim();

    if (!canCallerAccessClientLocker(caller, resolvedClientId)) {
      res.status(403).json({ error: 'Forbidden: Cannot claim a locker for another member.' });
      return;
    }

    let assignedLocker: any = null;
    let assignedUser: any = null;
    let pin: string | null = null;
    let expiresAt: string = new Date(Date.now() + 3 * 3600 * 1000).toISOString();

    if (lockerId) {
      // Specific locker assignment
      const usersRes = await lockerApiRequest('/api/users');
      const usersList: any[] = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
      const phoneDigits = normalizePhoneDigits(phone);

      let targetUser =
        usersList.find((u) => u.gym_id && String(u.gym_id) === resolvedClientId) ||
        (phoneDigits ? usersList.find((u) => normalizePhoneDigits(u.phone) === phoneDigits) : null) ||
        (email ? usersList.find((u) => String(u.email || '').toLowerCase() === String(email).toLowerCase()) : null) ||
        null;

      const nameParts = resolvedClientName.split(/\s+/);
      const firstName = nameParts[0] || 'Member';
      const lastName = nameParts.slice(1).join(' ') || '';

      if (!targetUser) {
        const createdRes = await lockerApiRequest('/api/users', {
          method: 'POST',
          body: {
            first_name: firstName,
            last_name: lastName,
            email: email || `${resolvedClientId.replace(/[^a-zA-Z0-9]/g, '')}@inzan.local`,
            gym_id: resolvedClientId,
            phone: phone || '',
            role: 'user',
            rfid_tag: '',
          },
        });
        targetUser = createdRes.data;
      }

      const assignRes = await lockerApiRequest(`/api/lockers/${Number(lockerId)}/assign`, {
        method: 'POST',
        body: {
          userId: targetUser.id,
          expiryDate: expiresAt,
        },
      });

      assignedLocker = assignRes.data?.locker || assignRes.data;
      assignedUser = targetUser;
      pin = assignRes.data?.pin ? String(assignRes.data.pin) : null;
    } else {
      // Cardless group-based assignment
      let resolvedGroupId = groupId ? Number(groupId) : 0;
      if (!resolvedGroupId) {
        const groupsRes = await lockerApiRequest('/api/groups');
        const groupsList: any[] = Array.isArray(groupsRes.data) ? groupsRes.data : groupsRes.data?.data || [];
        const gLower = String(gender || '').toLowerCase();
        const isFemale = gLower.startsWith('f') || gLower.includes('women') || gLower.includes('female');
        const targetGroup =
          groupsList.find((g) =>
            isFemale
              ? g.slug === 'women' || String(g.name || '').toLowerCase().includes('women')
              : g.slug === 'men' || String(g.name || '').toLowerCase().includes('men')
          ) || groupsList[0];
        resolvedGroupId = Number(targetGroup?.id || 40);
      }

      const cardlessRes = await lockerApiRequest('/api/lockers/assign-cardless', {
        method: 'POST',
        body: { group_id: resolvedGroupId },
      });

      assignedLocker = cardlessRes.data?.locker || null;
      assignedUser = cardlessRes.data?.user || null;
      pin = cardlessRes.data?.pin ? String(cardlessRes.data.pin) : null;
      expiresAt = cardlessRes.data?.expires_at || expiresAt;

      if (assignedUser?.id) {
        const nameParts = resolvedClientName.split(/\s+/);
        const firstName = nameParts[0] || assignedUser.first_name || 'Member';
        const lastName = nameParts.slice(1).join(' ') || assignedUser.last_name || '';
        try {
          const updatedUserRes = await lockerApiRequest(`/api/users/${assignedUser.id}`, {
            method: 'PUT',
            body: {
              first_name: firstName,
              last_name: lastName,
              email: email || assignedUser.email || `guest_${assignedUser.id}@locker.local`,
              gym_id: resolvedClientId,
              phone: phone || assignedUser.phone || null,
              role: assignedUser.role || 'guest',
              rfid_tag: assignedUser.rfid_tag || null,
            },
          });
          if (updatedUserRes.data) {
            assignedUser = updatedUserRes.data;
          }
        } catch (uErr) {
          console.warn('[API] [InzanLockers] Member claim user metadata update warning:', uErr);
        }
      }
    }

    // Automatically link the returned PIN via /api/public/unlock so sessionToken is ready for 1-tap / slide unlock
    let sessionToken: string | null = null;
    if (pin) {
      try {
        const unlockRes = await lockerApiRequest('/api/public/unlock', {
          method: 'POST',
          body: { pin },
          isPublic: true,
        });
        if (unlockRes.data?.session?.token) {
          sessionToken = String(unlockRes.data.session.token);
          if (unlockRes.data.session.expires_at) {
            expiresAt = String(unlockRes.data.session.expires_at);
          }
        }
      } catch (linkErr) {
        console.warn('[API] [InzanLockers] Auto-linking PIN to session token failed:', linkErr);
      }
    }

    if (assignedLocker?.id) {
      const inzanDb = getInzanFirestore();
      await inzanDb
        .collection('lockers')
        .doc(String(assignedLocker.id))
        .set(
          stripUndefinedDeep({
            id: String(assignedLocker.id),
            hardwareId: Number(assignedLocker.id),
            number: assignedLocker.name || String(assignedLocker.id),
            branch: 'Garden 8',
            status: 'Assigned',
            hardwareStatus: 'occupied',
            hardwareUserId: assignedUser?.id ?? null,
            assignedTo: resolvedClientId,
            assignedToName: resolvedClientName,
            code: pin || '',
            sessionToken: sessionToken || '',
            expiresAt,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
    }

    res.json({
      ok: true,
      locker: assignedLocker,
      user: assignedUser,
      pin,
      sessionToken,
      expiresAt,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /member-claim error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to claim locker' });
  }
});

inzanLockerRouter.post('/public/unlock', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const { pin, clientId, clientName } = req.body || {};
    if (!pin) {
      res.status(400).json({ error: 'PIN is required.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/public/unlock', {
      method: 'POST',
      body: { pin: String(pin).trim() },
      isPublic: true,
    });

    const session = data?.session;
    let matchedLocker: any = null;

    if (session?.token && session?.locker_name) {
      const inzanDb = getInzanFirestore();
      const q = await inzanDb
        .collection('lockers')
        .where('number', '==', String(session.locker_name))
        .limit(1)
        .get();

      const resolvedClientId = clientId || caller.clientDocId || caller.clientRecordId || caller.uid;
      const resolvedClientName = clientName || caller.name || 'Member';

      if (!q.empty) {
        const docSnap = q.docs[0]!;
        matchedLocker = { id: Number(docSnap.id), ...docSnap.data() };
        await docSnap.ref.set(
          stripUndefinedDeep({
            status: 'Assigned',
            hardwareStatus: 'occupied',
            assignedTo: resolvedClientId,
            assignedToName: resolvedClientName,
            code: String(pin).trim(),
            sessionToken: String(session.token),
            expiresAt: session.expires_at || null,
            updatedAt: new Date().toISOString(),
          }),
          { merge: true }
        );
      }
    }

    res.json({
      ok: true,
      session,
      locker: matchedLocker,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /public/unlock error:', err);
    res.status(err.status || 400).json({ error: err.message || 'Invalid PIN or failed to link locker' });
  }
});

inzanLockerRouter.post('/public/session/status', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const { token } = req.body || {};
    if (!token) {
      res.status(400).json({ error: 'Session token is required.' });
      return;
    }

    const { data } = await lockerApiRequest('/api/public/session/status', {
      method: 'POST',
      body: { token: String(token) },
      isPublic: true,
    });
    res.json(data);
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /public/session/status error:', err);
    res.status(err.status || 400).json({ state: 'expired', error: err.message || 'Session check failed' });
  }
});

inzanLockerRouter.post('/member-open', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const { clientId, lockerId, sessionToken } = req.body || {};
    const resolvedClientId = String(clientId || caller.clientDocId || caller.clientRecordId || caller.uid).trim();

    // 1. Try sessionToken via /api/public/session/open if provided
    if (sessionToken) {
      try {
        await lockerApiRequest('/api/public/session/open', {
          method: 'POST',
          body: { token: String(sessionToken) },
          isPublic: true,
        });
        res.json({ ok: true, message: 'Locker unlocked' });
        return;
      } catch (sessionErr) {
        console.warn('[API] [InzanLockers] Session token open failed, falling back to direct command:', sessionErr);
      }
    }

    // 2. Fallback to direct locker command after verifying ownership or staff
    const inzanDb = getInzanFirestore();
    let targetLockerId: number | null = lockerId ? Number(lockerId) : null;
    let lockerDocData: Record<string, any> | null = null;

    if (targetLockerId) {
      const snap = await inzanDb.collection('lockers').doc(String(targetLockerId)).get();
      if (snap.exists) lockerDocData = snap.data() || null;
    } else if (resolvedClientId) {
      const q = await inzanDb.collection('lockers').where('assignedTo', '==', resolvedClientId).limit(1).get();
      if (!q.empty) {
        targetLockerId = Number(q.docs[0]!.id);
        lockerDocData = q.docs[0]!.data();
      }
    }

    if (!targetLockerId) {
      res.status(404).json({ error: 'No active assigned locker found to open.' });
      return;
    }

    if (
      !caller.isStaff &&
      lockerDocData?.assignedTo &&
      !canCallerAccessClientLocker(caller, String(lockerDocData.assignedTo))
    ) {
      res.status(403).json({ error: 'Forbidden: This locker is not assigned to your profile.' });
      return;
    }

    await lockerApiRequest(`/api/lockers/${targetLockerId}/command`, {
      method: 'POST',
      body: { command: 'openlock' },
    });

    res.json({ ok: true, message: 'Locker unlocked' });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /member-open error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to open locker' });
  }
});

inzanLockerRouter.post('/member-extend', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const { clientId, lockerId, userId, sessionToken } = req.body || {};
    const resolvedClientId = String(clientId || caller.clientDocId || caller.clientRecordId || caller.uid).trim();
    const inzanDb = getInzanFirestore();

    let targetLockerId: number | null = lockerId ? Number(lockerId) : null;
    let lockerDocData: Record<string, any> | null = null;

    if (targetLockerId) {
      const snap = await inzanDb.collection('lockers').doc(String(targetLockerId)).get();
      if (snap.exists) lockerDocData = snap.data() || null;
    } else if (resolvedClientId) {
      const q = await inzanDb.collection('lockers').where('assignedTo', '==', resolvedClientId).limit(1).get();
      if (!q.empty) {
        targetLockerId = Number(q.docs[0]!.id);
        lockerDocData = q.docs[0]!.data();
      }
    }

    const tokenToUse = sessionToken || lockerDocData?.sessionToken;
    if (tokenToUse) {
      try {
        const { data } = await lockerApiRequest('/api/public/session/extend', {
          method: 'POST',
          body: { token: String(tokenToUse) },
          isPublic: true,
        });
        if (targetLockerId && data?.expires_at) {
          await inzanDb
            .collection('lockers')
            .doc(String(targetLockerId))
            .set({ expiresAt: data.expires_at, updatedAt: new Date().toISOString() }, { merge: true });
        }
        res.json({
          ok: true,
          expires_at: data?.expires_at,
          extensions_left: data?.extensions_left,
        });
        return;
      } catch (extErr) {
        console.warn('[API] [InzanLockers] Public session extend failed, falling back to user extend-expiry:', extErr);
      }
    }

    if (
      !caller.isStaff &&
      lockerDocData?.assignedTo &&
      !canCallerAccessClientLocker(caller, String(lockerDocData.assignedTo))
    ) {
      res.status(403).json({ error: 'Forbidden: Cannot extend another member locker.' });
      return;
    }

    const resolvedUserId = Number(userId || lockerDocData?.hardwareUserId || 0);
    if (!resolvedUserId) {
      res.status(400).json({ error: 'Could not resolve locker user ID to extend session.' });
      return;
    }

    const currentExpiryMs = lockerDocData?.expiresAt ? new Date(lockerDocData.expiresAt).getTime() : Date.now();
    const baseMs = !isNaN(currentExpiryMs) && currentExpiryMs > Date.now() ? currentExpiryMs : Date.now();
    const newExpiryIso = new Date(baseMs + 60 * 60 * 1000).toISOString();

    await lockerApiRequest(`/api/users/${resolvedUserId}/extend-expiry`, {
      method: 'PUT',
      body: { newExpiryDate: newExpiryIso },
    });

    if (targetLockerId) {
      await inzanDb
        .collection('lockers')
        .doc(String(targetLockerId))
        .set({ expiresAt: newExpiryIso, updatedAt: new Date().toISOString() }, { merge: true });
    }

    res.json({
      ok: true,
      expires_at: newExpiryIso,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /member-extend error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to extend locker session' });
  }
});

inzanLockerRouter.post('/member-release', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller) {
      res.status(401).json({ error: 'Unauthorized: Valid login required.' });
      return;
    }

    const { clientId, lockerId } = req.body || {};
    const resolvedClientId = String(clientId || caller.clientDocId || caller.clientRecordId || caller.uid).trim();
    const inzanDb = getInzanFirestore();

    let targetLockerId: number | null = lockerId ? Number(lockerId) : null;
    let lockerDocData: Record<string, any> | null = null;

    if (targetLockerId) {
      const snap = await inzanDb.collection('lockers').doc(String(targetLockerId)).get();
      if (snap.exists) lockerDocData = snap.data() || null;
    } else if (resolvedClientId) {
      const q = await inzanDb.collection('lockers').where('assignedTo', '==', resolvedClientId).limit(1).get();
      if (!q.empty) {
        targetLockerId = Number(q.docs[0]!.id);
        lockerDocData = q.docs[0]!.data();
      }
    }

    if (!targetLockerId) {
      res.status(404).json({ error: 'No assigned locker found to release.' });
      return;
    }

    if (
      !caller.isStaff &&
      lockerDocData?.assignedTo &&
      !canCallerAccessClientLocker(caller, String(lockerDocData.assignedTo))
    ) {
      res.status(403).json({ error: 'Forbidden: Cannot release another member locker.' });
      return;
    }

    await lockerApiRequest(`/api/lockers/${targetLockerId}/unassign`, {
      method: 'POST',
    });

    await inzanDb
      .collection('lockers')
      .doc(String(targetLockerId))
      .set(
        {
          status: 'Available',
          hardwareStatus: 'available',
          assignedTo: '',
          assignedToName: '',
          code: '',
          sessionToken: '',
          hardwareUserId: null,
          expiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /member-release error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to release locker' });
  }
});

// ============================================================================
// 2, 3, 6, 7. Parameterized Locker Routes: /:lockerId/... (Staff)
// ============================================================================
inzanLockerRouter.post('/:lockerId/command', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const lockerId = Number(req.params.lockerId);
    const command: 'openlock' | 'maintenance' | 'normal' = req.body?.command;
    if (!lockerId || !['openlock', 'maintenance', 'normal'].includes(command)) {
      res.status(400).json({ error: 'Valid lockerId and command (openlock | maintenance | normal) are required.' });
      return;
    }

    const { data } = await lockerApiRequest(`/api/lockers/${lockerId}/command`, {
      method: 'POST',
      body: { command },
    });

    const inzanDb = getInzanFirestore();
    const updateFields: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (command === 'maintenance') {
      updateFields.status = 'Maintenance';
      updateFields.hardwareStatus = 'maintenance';
    } else if (command === 'normal') {
      updateFields.status = 'Available';
      updateFields.hardwareStatus = 'available';
    }
    await inzanDb.collection('lockers').doc(String(lockerId)).set(updateFields, { merge: true });

    await writeLockerAuditLog(caller, 'OVERRIDE', String(lockerId), `Sent locker command "${command}" to locker #${lockerId}`);

    res.json({ ok: true, locker: data?.locker || data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /:lockerId/command error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Locker command failed' });
  }
});

inzanLockerRouter.post('/:lockerId/assign', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const lockerId = Number(req.params.lockerId);
    const {
      clientId,
      clientName,
      firstName,
      lastName,
      email,
      phone,
      rfidTag,
      userId,
      expiryHours,
      expiryDate,
    } = req.body || {};

    let resolvedUser: any = null;
    if (userId) {
      const usersRes = await lockerApiRequest('/api/users');
      const usersList: any[] = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
      resolvedUser = usersList.find((u) => u.id === Number(userId)) || { id: Number(userId) };
    } else {
      const usersRes = await lockerApiRequest('/api/users');
      const usersList: any[] = Array.isArray(usersRes.data) ? usersRes.data : usersRes.data?.data || [];
      const phoneDigits = normalizePhoneDigits(phone);

      resolvedUser =
        (clientId ? usersList.find((u) => u.gym_id && String(u.gym_id) === String(clientId)) : null) ||
        (phoneDigits ? usersList.find((u) => normalizePhoneDigits(u.phone) === phoneDigits) : null) ||
        (email ? usersList.find((u) => String(u.email || '').toLowerCase() === String(email).toLowerCase()) : null) ||
        null;

      const splitName = String(clientName || '').trim().split(/\s+/);
      const resolvedFirst = firstName || splitName[0] || 'Member';
      const resolvedLast = lastName || splitName.slice(1).join(' ') || '';

      if (!resolvedUser) {
        const createdRes = await lockerApiRequest('/api/users', {
          method: 'POST',
          body: {
            first_name: resolvedFirst,
            last_name: resolvedLast,
            email: email || `${String(clientId || Date.now()).replace(/[^a-zA-Z0-9]/g, '')}@inzan.local`,
            gym_id: clientId || '',
            phone: phone || '',
            role: 'user',
            rfid_tag: rfidTag || '',
          },
        });
        resolvedUser = createdRes.data;
      } else if ((rfidTag && resolvedUser.rfid_tag !== rfidTag) || (clientId && !resolvedUser.gym_id)) {
        try {
          const updatedRes = await lockerApiRequest(`/api/users/${resolvedUser.id}`, {
            method: 'PUT',
            body: {
              first_name: resolvedUser.first_name || resolvedFirst,
              last_name: resolvedUser.last_name || resolvedLast,
              email: resolvedUser.email || email || '',
              gym_id: clientId || resolvedUser.gym_id || '',
              phone: phone || resolvedUser.phone || '',
              role: resolvedUser.role || 'user',
              rfid_tag: rfidTag || resolvedUser.rfid_tag || '',
            },
          });
          if (updatedRes.data) resolvedUser = updatedRes.data;
        } catch (uErr) {
          console.warn('[API] [InzanLockers] Optional user update before assign warning:', uErr);
        }
      }
    }

    const hours = Number(expiryHours) || 3;
    const resolvedExpiry =
      expiryDate || new Date(Date.now() + hours * 3600 * 1000).toISOString();

    const { data } = await lockerApiRequest(`/api/lockers/${lockerId}/assign`, {
      method: 'POST',
      body: {
        userId: Number(resolvedUser.id),
        expiryDate: resolvedExpiry,
      },
    });

    const updatedLocker = data?.locker || data;
    const pin = data?.pin ? String(data.pin) : null;
    const displayName =
      clientName ||
      `${resolvedUser.first_name || ''} ${resolvedUser.last_name || ''}`.trim() ||
      'Assigned Member';

    let sessionToken = '';
    if (pin) {
      try {
        const unlockRes = await lockerApiRequest('/api/public/unlock', {
          method: 'POST',
          body: { pin },
          isPublic: true,
        });
        if (unlockRes.data?.session?.token) {
          sessionToken = String(unlockRes.data.session.token);
        }
      } catch {
        // Ignore optional pre-linking error
      }
    }

    const inzanDb = getInzanFirestore();
    await inzanDb
      .collection('lockers')
      .doc(String(lockerId))
      .set(
        stripUndefinedDeep({
          id: String(lockerId),
          hardwareId: lockerId,
          number: updatedLocker?.name || String(lockerId),
          branch: 'Garden 8',
          status: 'Assigned',
          hardwareStatus: 'occupied',
          hardwareUserId: Number(resolvedUser.id),
          assignedTo: clientId || resolvedUser.gym_id || `user_${resolvedUser.id}`,
          assignedToName: displayName,
          code: pin || '',
          sessionToken,
          expiresAt: resolvedExpiry,
          updatedAt: new Date().toISOString(),
        }),
        { merge: true }
      );

    await writeLockerAuditLog(
      caller,
      'UPDATE',
      String(lockerId),
      `Assigned locker ${updatedLocker?.name || lockerId} to ${displayName}`
    );

    res.json({
      ok: true,
      locker: updatedLocker,
      user: resolvedUser,
      pin,
      expiresAt: resolvedExpiry,
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /:lockerId/assign error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to assign locker' });
  }
});

inzanLockerRouter.post('/:lockerId/unassign', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const lockerId = Number(req.params.lockerId);
    const { data } = await lockerApiRequest(`/api/lockers/${lockerId}/unassign`, {
      method: 'POST',
    });

    const inzanDb = getInzanFirestore();
    await inzanDb
      .collection('lockers')
      .doc(String(lockerId))
      .set(
        {
          status: 'Available',
          hardwareStatus: 'available',
          assignedTo: '',
          assignedToName: '',
          code: '',
          sessionToken: '',
          hardwareUserId: null,
          expiresAt: null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    await writeLockerAuditLog(caller, 'UPDATE', String(lockerId), `Unassigned locker #${lockerId}`);

    res.json({ ok: true, locker: data?.locker || data });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /:lockerId/unassign error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to unassign locker' });
  }
});

inzanLockerRouter.post('/:lockerId/reissue-pin', async (req: Request, res: Response) => {
  try {
    if (!(await verifyInzanTenantRequest(req, res))) return;
    const caller = await authenticateInzanCaller(req);
    if (!caller || !caller.isStaff) {
      res.status(403).json({ error: 'Forbidden: Staff access required.' });
      return;
    }

    const lockerId = Number(req.params.lockerId);
    const { data } = await lockerApiRequest(`/api/lockers/${lockerId}/reissue-pin`, {
      method: 'POST',
    });

    const pin = String(data?.pin || '');
    const inzanDb = getInzanFirestore();
    await inzanDb
      .collection('lockers')
      .doc(String(lockerId))
      .set(
        {
          code: pin,
          sessionToken: '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

    await writeLockerAuditLog(caller, 'UPDATE', String(lockerId), `Re-issued PIN for locker #${lockerId}`);

    res.json({ ok: true, pin });
  } catch (err: any) {
    console.error('[API] [InzanLockers] POST /:lockerId/reissue-pin error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to reissue PIN' });
  }
});
