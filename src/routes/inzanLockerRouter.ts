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

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const res = await fetch(`${baseUrl}${normalizedPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if ((res.status === 401 || res.status === 403) && !options.isPublic && !options.retried) {
    const freshAuth = await getLockerServerJwt(true);
    headers.Authorization = `Bearer ${freshAuth.token}`;
    const retryRes = await fetch(`${freshAuth.baseUrl}${normalizedPath}`, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
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

  return { data: data as T, baseUrl };
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
    });
  } catch (err: any) {
    console.error('[API] [InzanLockers] GET /overview error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to fetch Inzan locker overview' });
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
