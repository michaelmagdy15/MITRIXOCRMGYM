import crypto from 'crypto';
import express, { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import {
  getAuthForRequest,
  getDbForRequest,
  getTenantIdForRequest,
  getTenantInfoForHost,
  getRequestHostname,
} from '../utils/tenantDb.js';
import { isFirestoreQuotaOrUnavailableError } from '../utils/firestoreQuota.js';
import {
  isQuotaShieldActive,
  markQuotaExhausted,
  recordFirestoreReads,
} from '../utils/sparkQuotaShield.js';

export const desktopSyncRouter = Router();

const CACHE_TTL_15M_MS = 15 * 60_000;
const SYNC_PULL_CACHE_TTL_MS = 60_000;
const LAST_SEEN_THROTTLE_MS = 10 * 60_000;

const staffUserCache = new Map<string, { value: { uid: string; email?: string; role?: string; name?: string } | null; expiresAt: number }>();
const webDeviceRevokeCache = new Map<string, { revoked: boolean; registeredAt?: string; expiresAt: number }>();
const deviceAuthCache = new Map<string, { device: AuthenticatedDevice; deviceRef: FirebaseFirestore.DocumentReference; lastSeenUpdatedAt: number; expiresAt: number }>();
const syncPullCache = new Map<string, { payload: any; expiresAt: number }>();

const PLATFORM_SUPER_ADMIN_EMAIL = 'michaelmitry13@gmail.com';

interface AuthenticatedDevice {
  deviceId: string;
  deviceName: string;
  appVersion: string;
  tenantId: string;
  deviceToken: string;
  status: 'active' | 'revoked';
  registeredAt: string;
  lastSeenAt: string;
  registeredBy?: {
    uid: string;
    email?: string | null;
    name?: string | null;
    role?: string | null;
  };
  platform?: string;
  metadata?: Record<string, any>;
}

interface OutboxOperation {
  operationId: string;
  tenantId?: string;
  deviceId?: string;
  actorUserId?: string;
  entityType?: string;
  entityId?: string;
  operationType: string;
  baseServerVersion?: number | string;
  payload?: any;
  payloadJson?: string;
  createdAtUtc?: string;
}

interface SyncPushResult {
  operationId: string;
  status: 'acknowledged' | 'conflict' | 'failed';
  deduplicated?: boolean;
  appliedAt?: string;
  result?: any;
  error?: string;
  reason?: string;
  conflictId?: string;
}

interface SyncItem {
  id: string;
  entityType: 'member' | 'attendance' | 'package';
  tenantId: string;
  data: any;
  serverVersion: number;
  serverUpdatedAt: string;
  deletedAt: string | null;
}

function getHeaderString(req: Request, headerName: string): string | undefined {
  const value = req.headers[headerName.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return typeof value === 'string' ? value : undefined;
}

/**
 * Validates staff authentication (Firebase ID Token or authorized dev/test token)
 */
async function authenticateStaffUser(
  req: Request,
  db: FirebaseFirestore.Firestore
): Promise<{ uid: string; email?: string; role?: string; name?: string } | null> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1];
  } else if (req.body && typeof req.body === 'object') {
    if (req.body.staffToken) token = String(req.body.staffToken);
    else if (req.body.authToken) token = String(req.body.authToken);
  }

  if (!token) return null;

  try {
    const resolvedTenantId = await getTenantIdForRequest(req).catch(() => 'inzanathletics');
    const tenantAuth = await getAuthForRequest(req);
    const decoded = await tenantAuth.verifyIdToken(token);
    if (decoded.email === PLATFORM_SUPER_ADMIN_EMAIL) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        role: 'super_admin',
        name: 'Platform Super Admin',
      };
    }

    const claimRole = typeof (decoded as any).role === 'string' ? String((decoded as any).role).trim() : '';
    if ((decoded as any).tenantId === resolvedTenantId && claimRole.length > 0) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        role: claimRole,
        name: (decoded as any).name || decoded.email || undefined,
      };
    }

    const cacheKey = `${resolvedTenantId}:${decoded.uid}`;
    const now = Date.now();
    const cached = staffUserCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const userDoc = await db.collection('users').doc(decoded.uid).get();
    recordFirestoreReads(resolvedTenantId, 1);
    if (userDoc.exists) {
      const udata = userDoc.data();
      const resolved = {
        uid: decoded.uid,
        email: decoded.email,
        role: udata?.role || 'staff',
        name: udata?.name || (decoded as any).name || undefined,
      };
      staffUserCache.set(cacheKey, { value: resolved, expiresAt: now + CACHE_TTL_15M_MS });
      return resolved;
    }

    staffUserCache.set(cacheKey, { value: null, expiresAt: now + 60_000 });
    return null;
  } catch (err) {
    if (isFirestoreQuotaOrUnavailableError(err)) {
      const tid = await getTenantIdForRequest(req).catch(() => 'inzanathletics');
      markQuotaExhausted(tid, (err as Error)?.message);
      throw err;
    }
    // Development / automated test harness token support
    if (
      process.env.NODE_ENV !== 'production' &&
      (token === 'dev-staff-token' || token.startsWith('test-') || token === 'mock-staff-token')
    ) {
      return {
        uid: 'dev-staff-1',
        email: 'staff@test.local',
        role: 'admin',
        name: 'Dev Staff',
      };
    }
    return null;
  }
}

/**
 * Validates device credentials against tenant's desktop_devices collection or
 * authenticates web front-desk staff sessions directly.
 * Enforces strict tenant isolation and device revocation.
 */
async function authenticateDevice(
  req: Request,
  db: FirebaseFirestore.Firestore,
  resolvedTenantId: string
): Promise<
  | { success: true; device: AuthenticatedDevice; deviceRef: FirebaseFirestore.DocumentReference }
  | { success: false; status: number; error: string; message: string }
> {
  // 1. Support Web Front-Desk clients via signed-in staff credentials
  const staffUser = await authenticateStaffUser(req, db);
  if (staffUser) {
    const rawDeviceId =
      getHeaderString(req, 'x-device-id') ||
      (typeof req.body === 'object' && req.body?.deviceId ? String(req.body.deviceId) : undefined) ||
      (typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined);

    const deviceId = (rawDeviceId && String(rawDeviceId).trim()) || `web-${staffUser.uid}`;
    const deviceRef = db.collection('desktop_devices').doc(deviceId);
    const webCacheKey = `${resolvedTenantId}:${deviceId}`;
    const nowMs = Date.now();
    let webRevokeEntry = webDeviceRevokeCache.get(webCacheKey);

    if (!webRevokeEntry || webRevokeEntry.expiresAt <= nowMs) {
      const existingDoc = await deviceRef.get().catch(() => null);
      if (existingDoc) recordFirestoreReads(resolvedTenantId, 1);
      webRevokeEntry = {
        revoked: Boolean(existingDoc && existingDoc.exists && existingDoc.data()?.status === 'revoked'),
        registeredAt: existingDoc && existingDoc.exists ? existingDoc.data()?.registeredAt : undefined,
        expiresAt: nowMs + CACHE_TTL_15M_MS,
      };
      webDeviceRevokeCache.set(webCacheKey, webRevokeEntry);
    }

    if (webRevokeEntry.revoked) {
      return {
        success: false,
        status: 403,
        error: 'DEVICE_REVOKED',
        message: 'This device has been revoked and cannot access the sync API.',
      };
    }

    const deviceName = `Web Front Desk (${staffUser.name || staffUser.email || staffUser.uid})`;
    const now = new Date().toISOString();

    const device: AuthenticatedDevice = {
      deviceId,
      deviceName,
      appVersion: getHeaderString(req, 'x-app-version') || 'web-frontdesk',
      tenantId: resolvedTenantId,
      deviceToken: 'web-staff-session',
      status: 'active',
      registeredAt: webRevokeEntry.registeredAt || now,
      lastSeenAt: now,
      registeredBy: {
        uid: staffUser.uid,
        email: staffUser.email || null,
        name: staffUser.name || null,
        role: staffUser.role || null,
      },
      platform: getHeaderString(req, 'sec-ch-ua-platform') || 'web-browser',
      metadata: {
        isWebClient: true,
        userAgent: req.headers['user-agent'] || 'unknown',
      },
    };

    return { success: true, device, deviceRef };
  }

  // 2. Hardware Desktop Device Authentication (Windows/macOS native app)
  const deviceId =
    getHeaderString(req, 'x-device-id') ||
    (typeof req.body === 'object' && req.body?.deviceId ? String(req.body.deviceId) : undefined) ||
    (typeof req.query.deviceId === 'string' ? req.query.deviceId : undefined);

  let deviceToken =
    getHeaderString(req, 'x-device-token') ||
    (typeof req.body === 'object' && req.body?.deviceToken ? String(req.body.deviceToken) : undefined);

  if (!deviceToken) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      deviceToken = authHeader.split('Bearer ')[1];
    }
  }

  if (!deviceId || !deviceToken) {
    return {
      success: false,
      status: 401,
      error: 'MISSING_DEVICE_CREDENTIALS',
      message: 'Both deviceId and deviceToken (or X-Device-Id and X-Device-Token headers or Staff Bearer Token) are required.',
    };
  }

  const deviceRef = db.collection('desktop_devices').doc(deviceId);
  const deviceCacheKey = `${resolvedTenantId}:${deviceId}:${deviceToken}`;
  const nowMs = Date.now();
  const cachedDevice = deviceAuthCache.get(deviceCacheKey);
  if (cachedDevice && cachedDevice.expiresAt > nowMs) {
    if (nowMs - cachedDevice.lastSeenUpdatedAt > LAST_SEEN_THROTTLE_MS) {
      cachedDevice.lastSeenUpdatedAt = nowMs;
      deviceRef
        .update({ lastSeenAt: new Date(nowMs).toISOString() })
        .catch((err) => console.error('[DesktopSync] Error updating lastSeenAt:', err));
    }
    return { success: true, device: cachedDevice.device, deviceRef };
  }

  const deviceDoc = await deviceRef.get();
  recordFirestoreReads(resolvedTenantId, 1);

  if (!deviceDoc.exists) {
    return {
      success: false,
      status: 401,
      error: 'DEVICE_NOT_FOUND',
      message: `Device "${deviceId}" is not registered in tenant "${resolvedTenantId}".`,
    };
  }

  const deviceData = deviceDoc.data() as AuthenticatedDevice;

  if (deviceData.status === 'revoked') {
    return {
      success: false,
      status: 403,
      error: 'DEVICE_REVOKED',
      message: 'This device has been revoked and cannot access the sync API.',
    };
  }

  if (deviceData.deviceToken !== deviceToken) {
    return {
      success: false,
      status: 401,
      error: 'INVALID_DEVICE_TOKEN',
      message: 'Device authentication token mismatch.',
    };
  }

  deviceAuthCache.set(deviceCacheKey, {
    device: deviceData,
    deviceRef,
    lastSeenUpdatedAt: nowMs,
    expiresAt: nowMs + CACHE_TTL_15M_MS,
  });

  // Update last seen asynchronously
  deviceRef
    .update({ lastSeenAt: new Date().toISOString() })
    .catch((err) => console.error('[DesktopSync] Error updating lastSeenAt:', err));

  return { success: true, device: deviceData, deviceRef };
}

// ===============================================================
// 1. POST /devices/register
// ===============================================================
desktopSyncRouter.post('/devices/register', async (req: Request, res: Response) => {
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);

    const { tenantId, deviceId, deviceName, appVersion, platform, metadata } = req.body || {};

    // 1. Validate required fields
    if (!deviceId || typeof deviceId !== 'string' || !deviceId.trim()) {
      return res.status(400).json({ error: 'INVALID_DEVICE_ID', message: 'deviceId is required and must be a non-empty string.' });
    }
    if (!deviceName || typeof deviceName !== 'string' || !deviceName.trim()) {
      return res.status(400).json({ error: 'INVALID_DEVICE_NAME', message: 'deviceName is required and must be a non-empty string.' });
    }
    if (!appVersion || typeof appVersion !== 'string' || !appVersion.trim()) {
      return res.status(400).json({ error: 'INVALID_APP_VERSION', message: 'appVersion is required.' });
    }

    // 2. Sacred Rule: verify tenantId matches resolved tenant
    if (tenantId && String(tenantId).toLowerCase().trim() !== resolvedTenantId.toLowerCase().trim()) {
      return res.status(400).json({
        error: 'TENANT_MISMATCH',
        message: `Supplied tenantId "${tenantId}" does not match resolved tenant "${resolvedTenantId}".`,
      });
    }

    // 3. Validate staff credentials/token
    const staffUser = await authenticateStaffUser(req, db);
    if (!staffUser) {
      return res.status(401).json({
        error: 'UNAUTHORIZED_STAFF',
        message: 'Valid staff credentials or Authorization Bearer token is required to register a device.',
      });
    }

    const ALLOWED_DEVICE_REG_ROLES = ['admin', 'manager', 'super_admin', 'crm_admin', 'staff', 'sales_manager', 'frontdesk'];
    if (!ALLOWED_DEVICE_REG_ROLES.includes(staffUser.role || '')) {
      return res.status(403).json({
        error: 'FORBIDDEN_DEVICE_REGISTRATION',
        message: 'Only authorized staff and managers can register desktop devices.',
      });
    }

    // 4. Generate high-entropy device token
    const deviceToken = `dtk_${crypto.randomUUID()}_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    const deviceDocRef = db.collection('desktop_devices').doc(deviceId.trim());
    const existingDoc = await deviceDocRef.get();

    if (existingDoc.exists && existingDoc.data()?.status === 'revoked') {
      return res.status(403).json({
        error: 'DEVICE_REVOKED',
        message: 'This device ID has been revoked and cannot be re-registered without administrative reset.',
      });
    }

    const registrationData: AuthenticatedDevice = {
      deviceId: deviceId.trim(),
      deviceName: deviceName.trim(),
      appVersion: appVersion.trim(),
      tenantId: resolvedTenantId,
      deviceToken,
      status: 'active',
      registeredAt: existingDoc.exists ? existingDoc.data()?.registeredAt || now : now,
      lastSeenAt: now,
      registeredBy: {
        uid: staffUser.uid,
        email: staffUser.email || null,
        name: staffUser.name || null,
        role: staffUser.role || null,
      },
      platform: platform || 'windows',
      metadata: metadata || {},
    };

    await deviceDocRef.set(registrationData, { merge: true });

    // Record audit event in tenant database
    await db.collection('desktop_audit_log').add({
      action: 'REGISTER_DEVICE',
      entityType: 'DEVICE',
      entityId: deviceId.trim(),
      actorUserId: staffUser.uid,
      tenantId: resolvedTenantId,
      details: `Device "${deviceName}" (${deviceId}) registered by ${staffUser.email || staffUser.uid}`,
      timestamp: now,
    });

    return res.status(200).json({
      status: 'registered',
      deviceId: deviceId.trim(),
      deviceToken,
      tenantId: resolvedTenantId,
      serverTime: now,
    });
  } catch (error) {
    console.error('[DesktopSync] Error in /devices/register:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});

// ===============================================================
// 2. POST /devices/refresh
// ===============================================================
desktopSyncRouter.post('/devices/refresh', async (req: Request, res: Response) => {
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);

    const deviceId =
      getHeaderString(req, 'x-device-id') ||
      (typeof req.body === 'object' && req.body?.deviceId ? String(req.body.deviceId) : undefined);

    let deviceToken =
      getHeaderString(req, 'x-device-token') ||
      (typeof req.body === 'object' && req.body?.deviceToken ? String(req.body.deviceToken) : undefined);

    if (!deviceToken) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        deviceToken = authHeader.split('Bearer ')[1];
      }
    }

    if (!deviceId || !deviceToken) {
      return res.status(400).json({
        error: 'MISSING_DEVICE_CREDENTIALS',
        message: 'deviceId and deviceToken are required to refresh credentials.',
      });
    }

    const deviceRef = db.collection('desktop_devices').doc(deviceId);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      return res.status(404).json({ error: 'DEVICE_NOT_FOUND', message: 'Device is not registered.' });
    }

    const deviceData = deviceDoc.data() as AuthenticatedDevice;

    if (deviceData.status === 'revoked') {
      return res.status(403).json({ error: 'DEVICE_REVOKED', message: 'Device registration has been revoked.' });
    }

    if (deviceData.deviceToken !== deviceToken) {
      return res.status(401).json({ error: 'INVALID_DEVICE_TOKEN', message: 'Invalid device token.' });
    }

    const newDeviceToken = `dtk_${crypto.randomUUID()}_${crypto.randomBytes(24).toString('hex')}`;
    const now = new Date().toISOString();

    await deviceRef.update({
      deviceToken: newDeviceToken,
      lastSeenAt: now,
      ...(req.body?.appVersion ? { appVersion: String(req.body.appVersion) } : {}),
    });

    return res.status(200).json({
      status: 'refreshed',
      deviceId,
      deviceToken: newDeviceToken,
      tenantId: resolvedTenantId,
      serverTime: now,
    });
  } catch (error) {
    console.error('[DesktopSync] Error in /devices/refresh:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});

// ===============================================================
// 3. POST /devices/:id/revoke
// ===============================================================
desktopSyncRouter.post('/devices/:id/revoke', async (req: Request, res: Response) => {
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);
    const targetDeviceId = req.params.id;

    if (!targetDeviceId) {
      return res.status(400).json({ error: 'MISSING_DEVICE_ID', message: 'Device ID is required in URL.' });
    }

    const deviceRef = db.collection('desktop_devices').doc(targetDeviceId);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      return res.status(404).json({ error: 'DEVICE_NOT_FOUND', message: `Device "${targetDeviceId}" not found.` });
    }

    const revokedAt = new Date().toISOString();
    const revokedBy =
      (req as any).user?.uid ||
      req.body?.revokedBy ||
      (await authenticateStaffUser(req, db))?.uid ||
      'staff-admin';
    const reason = req.body?.reason || 'Administrative revocation';

    await deviceRef.update({
      status: 'revoked',
      revokedAt,
      revokedBy,
      revocationReason: reason,
    });

    await db.collection('desktop_audit_log').add({
      action: 'REVOKE_DEVICE',
      entityType: 'DEVICE',
      entityId: targetDeviceId,
      actorUserId: revokedBy,
      tenantId: resolvedTenantId,
      details: `Device "${targetDeviceId}" was revoked: ${reason}`,
      timestamp: revokedAt,
    });

    return res.status(200).json({
      status: 'revoked',
      deviceId: targetDeviceId,
      revokedAt,
      revokedBy,
      serverTime: revokedAt,
    });
  } catch (error) {
    console.error('[DesktopSync] Error in /devices/:id/revoke:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});

// ===============================================================
// 4. POST /sync/push
// ===============================================================
desktopSyncRouter.post('/sync/push', async (req: Request, res: Response) => {
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);

    // 1. Authenticate and validate device against tenant
    const authResult = await authenticateDevice(req, db, resolvedTenantId);
    if (!authResult.success) {
      return res.status(authResult.status).json({ error: authResult.error, message: authResult.message });
    }

    const { device } = authResult;

    // 2. Extract operations array
    let rawOps: any[] = [];
    if (Array.isArray(req.body?.operations)) {
      rawOps = req.body.operations;
    } else if (Array.isArray(req.body?.batch)) {
      rawOps = req.body.batch;
    } else if (Array.isArray(req.body)) {
      rawOps = req.body;
    }

    if (rawOps.length === 0) {
      return res.status(200).json({
        results: [],
        serverTime: new Date().toISOString(),
      });
    }

    const results: SyncPushResult[] = [];

    // 3. Process each operation with idempotency checking
    for (const op of rawOps as OutboxOperation[]) {
      if (!op || !op.operationId || typeof op.operationId !== 'string') {
        results.push({
          operationId: String(op?.operationId || 'unknown'),
          status: 'failed',
          error: 'MISSING_OPERATION_ID',
          reason: 'Every outbox operation must include a unique operationId string.',
        });
        continue;
      }

      const operationId = op.operationId.trim();

      // Step A: Idempotency check in tenant's ledger
      const ledgerRef = db.collection('desktop_idempotency_ledger').doc(operationId);
      const ledgerDoc = await ledgerRef.get();

      if (ledgerDoc.exists) {
        const existingData = ledgerDoc.data()!;
        results.push({
          operationId,
          status: 'acknowledged',
          deduplicated: true,
          appliedAt: existingData.appliedAt,
          result: existingData.result,
        });
        continue;
      }

      // Step B: Parse payload
      let payload: any = op.payload;
      if (!payload && op.payloadJson) {
        try {
          payload = JSON.parse(op.payloadJson);
        } catch {
          payload = {};
        }
      }
      payload = payload || {};

      const now = new Date().toISOString();

      try {
        // Step C: Handle operation types
        if (op.operationType === 'attendance.checkin') {
          const clientId = String(payload.clientId || op.entityId || '').trim();
          if (!clientId) {
            results.push({
              operationId,
              status: 'failed',
              error: 'INVALID_PAYLOAD',
              reason: 'attendance.checkin requires a valid clientId.',
            });
            continue;
          }

          const branch = String(payload.branch || 'MAIN');
          const date = String(payload.date || op.createdAtUtc || now);
          const recordedBy = String(payload.recordedBy || op.actorUserId || device.deviceId);

          // Client lookup in tenant db
          const clientRef = db.collection('clients').doc(clientId);
          const clientDoc = await clientRef.get();
          const clientData = clientDoc.exists ? clientDoc.data() : null;

          const attendanceRef = db.collection('attendance').doc();
          const attendanceId = attendanceRef.id;

          const attendanceRecord = {
            clientId,
            clientName: clientData?.name || payload.clientName || 'Unknown',
            branch,
            date,
            recordedBy,
            packageName: payload.packageName || clientData?.packageType || '',
            source: device.metadata?.isWebClient ? 'web_frontdesk' : 'desktop_offline',
            deviceId: device.deviceId,
            operationId,
            createdAt: now,
          };

          const clientUpdates: Record<string, any> = {};

          if (clientDoc.exists && clientData && payload.deductSession !== false) {
            // Deduct from packages array if present
            if (Array.isArray(clientData.packages) && clientData.packages.length > 0) {
              const packagesCopy = [...clientData.packages];
              let pkgIdx = -1;
              if (payload.packageName) {
                pkgIdx = packagesCopy.findIndex(
                  (p: any) => p.packageName === payload.packageName && (p.status === 'Active' || !p.status)
                );
              }
              if (pkgIdx === -1) {
                pkgIdx = packagesCopy.findIndex((p: any) => p.status === 'Active');
              }
              if (pkgIdx !== -1) {
                const targetPkg = packagesCopy[pkgIdx];
                if (targetPkg && typeof targetPkg.sessionsRemaining === 'number' && targetPkg.sessionsRemaining > 0) {
                  packagesCopy[pkgIdx] = {
                    ...targetPkg,
                    sessionsRemaining: Math.max(0, targetPkg.sessionsRemaining - 1),
                  };
                  clientUpdates.packages = packagesCopy;
                }
              }
            }

            // Deduct from client top-level sessionsRemaining if number > 0
            if (typeof clientData.sessionsRemaining === 'number' && clientData.sessionsRemaining > 0) {
              clientUpdates.sessionsRemaining = Math.max(0, clientData.sessionsRemaining - 1);
            }

            if (Object.keys(clientUpdates).length > 0) {
              clientUpdates.updatedAt = now;
            }
          }

          const ledgerEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || null,
            operationType: op.operationType,
            entityType: 'attendance',
            entityId: attendanceId,
            appliedAt: now,
            status: 'applied',
            result: { attendanceId, clientUpdated: Object.keys(clientUpdates).length > 0 },
          };

          const auditRef = db.collection('desktop_audit_log').doc();
          const auditEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || (device.metadata?.isWebClient ? 'web-frontdesk' : 'desktop-offline'),
            action: 'CREATE',
            entityType: 'ATTENDANCE',
            entityId: attendanceId,
            details: `Check-in for client ${clientData?.name || clientId} at ${branch} via ${device.deviceName}`,
            timestamp: now,
          };

          const batch = db.batch();
          batch.set(attendanceRef, attendanceRecord);
          if (clientDoc.exists && Object.keys(clientUpdates).length > 0) {
            batch.update(clientRef, clientUpdates);
          }
          batch.set(ledgerRef, ledgerEntry);
          batch.set(auditRef, auditEntry);
          await batch.commit();

          results.push({
            operationId,
            status: 'acknowledged',
            deduplicated: false,
            appliedAt: now,
            result: { attendanceId, clientUpdated: Object.keys(clientUpdates).length > 0 },
          });
        } else if (op.operationType === 'member.update_notes') {
          const clientId = String(payload.clientId || op.entityId || '').trim();
          const noteText = String(payload.note || payload.text || payload.notes || '').trim();
          const author = String(payload.author || op.actorUserId || device.deviceName || 'Desktop Staff');

          if (!clientId || !noteText) {
            results.push({
              operationId,
              status: 'failed',
              error: 'INVALID_PAYLOAD',
              reason: 'member.update_notes requires clientId and note text.',
            });
            continue;
          }

          const clientRef = db.collection('clients').doc(clientId);
          const clientDoc = await clientRef.get();

          if (!clientDoc.exists) {
            const conflictRef = db.collection('desktop_conflicts').doc();
            await conflictRef.set({
              operationId,
              deviceId: device.deviceId,
              tenantId: resolvedTenantId,
              operationType: op.operationType,
              payload,
              reason: `Member "${clientId}" does not exist in tenant database.`,
              status: 'unresolved',
              createdAt: now,
            });

            results.push({
              operationId,
              status: 'conflict',
              conflictId: conflictRef.id,
              reason: `Member "${clientId}" does not exist in tenant database.`,
            });
            continue;
          }

          const commentRef = clientRef.collection('comments').doc();
          const commentRecord = {
            text: noteText,
            date: payload.date || now,
            author,
            source: 'desktop_offline',
            operationId,
          };

          const ledgerEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || null,
            operationType: op.operationType,
            entityType: 'member',
            entityId: clientId,
            appliedAt: now,
            status: 'applied',
            result: { clientId, commentId: commentRef.id },
          };

          const auditRef = db.collection('desktop_audit_log').doc();
          const auditEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || 'desktop-offline',
            action: 'UPDATE',
            entityType: 'CLIENT_NOTE',
            entityId: clientId,
            details: `Desktop offline note added for member ${clientId}`,
            timestamp: now,
          };

          const batch = db.batch();
          batch.set(commentRef, commentRecord);
          batch.update(clientRef, { lastContactDate: now });
          batch.set(ledgerRef, ledgerEntry);
          batch.set(auditRef, auditEntry);
          await batch.commit();

          results.push({
            operationId,
            status: 'acknowledged',
            deduplicated: false,
            appliedAt: now,
            result: { clientId, commentId: commentRef.id },
          });
        } else if (op.operationType === 'payment.create') {
          // Extract requested payload fields:
          // clientId, amount, paymentMethod, packageType, packageName, notes, date, receiptNumber
          const rawClientId = payload.clientId || op.entityId || '';
          const isGuest =
            !rawClientId ||
            rawClientId === 'guest' ||
            rawClientId === 'WALK-IN-GUEST' ||
            rawClientId === 'GUEST';
          const clientId = isGuest ? (rawClientId || 'guest') : String(rawClientId).trim();

          const amount = Number(payload.amount ?? payload.amount_paid ?? 0);
          const paymentMethod = String(payload.paymentMethod || payload.method || 'Cash').trim();
          const packageType = String(payload.packageType || payload.package_category_type || 'General').trim();
          const packageName = String(payload.packageName || payload.packageType || '').trim();
          const notes = String(payload.notes || '').trim();
          const date = String(payload.date || op.createdAtUtc || now).trim();
          const receiptNumber = String(payload.receiptNumber || payload.receiptSerial || '').trim();

          let clientRef: any = null;
          let clientDoc: any = null;
          let clientData: any = null;

          if (clientId && !isGuest) {
            clientRef = db.collection('clients').doc(clientId);
            clientDoc = await clientRef.get();
            if (clientDoc.exists) {
              clientData = clientDoc.data();
            }
          }

          const clientName =
            clientData?.name ||
            payload.clientName ||
            payload.client_name ||
            (isGuest ? (payload.guestName || 'Guest') : 'Unknown');

          // Create doc in payments collection
          const paymentRef = db.collection('payments').doc();
          const paymentId = paymentRef.id;

          const paymentRecord: Record<string, any> = {
            id: paymentId,
            clientId,
            client_name: clientName,
            clientName,
            amount,
            amount_paid: Number(payload.amount_paid ?? amount),
            method: paymentMethod,
            paymentMethod,
            packageType,
            packageName,
            notes,
            date,
            receiptNumber,
            receiptSerial: receiptNumber,
            status: payload.status || 'paid',
            source: device.metadata?.isWebClient ? 'web_frontdesk' : 'desktop_offline',
            deviceId: device.deviceId,
            operationId,
            created_at: now,
            createdAt: now,
          };

          if (payload.recordedBy) paymentRecord.recordedBy = payload.recordedBy;
          if (payload.sales_rep_id) paymentRecord.sales_rep_id = payload.sales_rep_id;
          if (payload.branch) paymentRecord.branch = payload.branch;
          if (payload.branchId) paymentRecord.branchId = payload.branchId;
          if (payload.isPartialPayment !== undefined) paymentRecord.isPartialPayment = payload.isPartialPayment;
          if (payload.remainingBalance !== undefined) paymentRecord.remainingBalance = payload.remainingBalance;
          if (payload.isComplimentary !== undefined) paymentRecord.isComplimentary = payload.isComplimentary;
          if (payload.id && String(payload.id).startsWith('temp-')) paymentRecord.offlineTempId = payload.id;

          // If payload.clientId: update client's payments list or balance if applicable
          const clientUpdates: Record<string, any> = {};

          if (clientRef && clientDoc?.exists && clientData) {
            // Update client's payments list
            if (Array.isArray(clientData.payments)) {
              clientUpdates.payments = [...clientData.payments, paymentId];
            } else {
              clientUpdates.payments = [paymentId];
            }

            // Update client balance if applicable
            if (typeof clientData.outstandingBalance === 'number' && clientData.outstandingBalance > 0) {
              const newBal = Math.max(0, clientData.outstandingBalance - amount);
              clientUpdates.outstandingBalance = newBal;
              clientUpdates.hasOutstandingBalance = newBal > 0;
            } else if (typeof clientData.balance === 'number' && clientData.balance > 0) {
              clientUpdates.balance = Math.max(0, clientData.balance - amount);
            }

            // Update package balance if applicable
            if (Array.isArray(clientData.packages) && clientData.packages.length > 0) {
              let remAmount = amount;
              clientUpdates.packages = clientData.packages.map((pkg: any) => {
                if (remAmount > 0 && typeof pkg.remainingBalance === 'number' && pkg.remainingBalance > 0) {
                  const deduct = Math.min(pkg.remainingBalance, remAmount);
                  remAmount -= deduct;
                  return {
                    ...pkg,
                    remainingBalance: pkg.remainingBalance - deduct,
                    paid: pkg.remainingBalance - deduct === 0,
                  };
                }
                return pkg;
              });
            }

            clientUpdates.paid = true;
            clientUpdates.lastContactDate = now;
            clientUpdates.updatedAt = now;
          }

          // Ledger entry for idempotency
          const ledgerEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || null,
            operationType: op.operationType,
            entityType: 'payment',
            entityId: paymentId,
            appliedAt: now,
            status: 'applied',
            result: {
              paymentId,
              clientId: clientId || null,
              amount,
              clientUpdated: Object.keys(clientUpdates).length > 0,
            },
          };

          const auditRef = db.collection('desktop_audit_log').doc();
          const auditEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || (device.metadata?.isWebClient ? 'web-frontdesk' : 'desktop-offline'),
            action: 'CREATE',
            entityType: 'PAYMENT',
            entityId: paymentId,
            details: `Payment recorded of ${amount} for client ${clientData?.name || clientId || 'guest'} via ${device.deviceName}`,
            timestamp: now,
          };

          // Atomically write payment, updates, and idempotency ledger doc
          const batch = db.batch();
          batch.set(paymentRef, paymentRecord);
          if (clientRef && clientDoc?.exists && Object.keys(clientUpdates).length > 0) {
            batch.update(clientRef, clientUpdates);
          }
          batch.set(ledgerRef, ledgerEntry);
          batch.set(auditRef, auditEntry);
          await batch.commit();

          results.push({
            operationId,
            status: 'acknowledged',
            deduplicated: false,
            appliedAt: now,
            result: {
              paymentId,
              clientId: clientId || null,
              amount,
              clientUpdated: Object.keys(clientUpdates).length > 0,
            },
          });
        } else {
          // Unsupported operation type -> record conflict
          const conflictRef = db.collection('desktop_conflicts').doc();
          await conflictRef.set({
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            operationType: op.operationType,
            payload,
            reason: `Unsupported operationType "${op.operationType}" in desktop sync.`,
            status: 'unresolved',
            createdAt: now,
          });

          results.push({
            operationId,
            status: 'conflict',
            conflictId: conflictRef.id,
            reason: `Unsupported operationType "${op.operationType}".`,
          });
        }
      } catch (opErr) {
        console.error(`[DesktopSync] Error applying operation ${operationId}:`, opErr);
        const conflictRef = db.collection('desktop_conflicts').doc();
        await conflictRef.set({
          operationId,
          deviceId: device.deviceId,
          tenantId: resolvedTenantId,
          operationType: op.operationType,
          payload,
          reason: (opErr as Error).message || 'Execution error during atomic batch application',
          status: 'unresolved',
          createdAt: now,
        });

        results.push({
          operationId,
          status: 'conflict',
          conflictId: conflictRef.id,
          reason: (opErr as Error).message,
        });
      }
    }

    return res.status(200).json({
      results,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[DesktopSync] Error in /sync/push:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});

// ===============================================================
// 5. GET /sync/pull
// ===============================================================
desktopSyncRouter.get('/sync/pull', async (req: Request, res: Response) => {
  let resolvedTenantId = 'inzanathletics';
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    resolvedTenantId = await getTenantIdForRequest(req);

    // Authenticate device
    const authResult = await authenticateDevice(req, db, resolvedTenantId);
    if (!authResult.success) {
      return res.status(authResult.status).json({ error: authResult.error, message: authResult.message });
    }

    const limitParam = Number(req.query.limit);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 250 : limitParam, 1), 1000);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null;
    const cacheKey = `${resolvedTenantId}:${cursor || ''}:${limit}`;
    const nowMs = Date.now();
    const cachedPull = syncPullCache.get(cacheKey);

    if (isQuotaShieldActive(resolvedTenantId)) {
      if (cachedPull) {
        res.setHeader('X-Mitrixo-Quota-Shield', 'active');
        return res.status(200).json(cachedPull.payload);
      }
      return res.status(503).json({
        error: 'FIRESTORE_QUOTA_EXCEEDED',
        code: 'FIRESTORE_QUOTA_EXCEEDED',
        message: 'Database temporarily busy (quota shield active). Please retry shortly.',
      });
    }

    if (cachedPull && cachedPull.expiresAt > nowMs) {
      return res.status(200).json(cachedPull.payload);
    }

    const items: SyncItem[] = [];

    // Query 1: Clients / Members
    try {
      if (cursor) {
        // Query clients updated after cursor
        let clientSnap = await db
          .collection('clients')
          .where('updatedAt', '>', cursor)
          .orderBy('updatedAt', 'asc')
          .limit(limit)
          .get()
          .catch(async (err: unknown) => {
            if (isFirestoreQuotaOrUnavailableError(err)) throw err;
            // Bounded status fallback if updatedAt index is missing; never scan unfiltered collection
            return db
              .collection('clients')
              .where('status', 'in', ['Active', 'Hold', 'Nearly Expired'])
              .limit(limit)
              .get();
          });
        recordFirestoreReads(resolvedTenantId, Math.max(1, clientSnap.size));

        for (const doc of clientSnap.docs) {
          const data = doc.data();
          delete data.comments;
          delete data.interactions;
          delete data.assignmentHistory;
          delete data.callAuditTrail;
          delete data.history;
          delete data.documents;
          delete data.attachments;
          delete data.importedHistory;
          delete data.photoCaptureLogs;
          const serverUpdatedAt = data.updatedAt || data.createdAt || data.lastContactDate || cursor;
          if (!cursor || serverUpdatedAt > cursor) {
            items.push({
              id: doc.id,
              entityType: 'member',
              tenantId: resolvedTenantId,
              data: { ...data, id: doc.id },
              serverVersion: data.serverVersion || 1,
              serverUpdatedAt,
              deletedAt: data.deleted_at || data.deletedAt || null,
            });
          }
        }
      } else {
        // Initial sync: fetch all active members from tenant
        const clientSnap = await db
          .collection('clients')
          .limit(limit)
          .get();
        recordFirestoreReads(resolvedTenantId, Math.max(1, clientSnap.size));

        for (const doc of clientSnap.docs) {
          const data = doc.data();
          delete data.comments;
          delete data.interactions;
          delete data.assignmentHistory;
          delete data.callAuditTrail;
          delete data.history;
          delete data.documents;
          delete data.attachments;
          delete data.importedHistory;
          delete data.photoCaptureLogs;
          items.push({
            id: doc.id,
            entityType: 'member',
            tenantId: resolvedTenantId,
            data: { ...data, id: doc.id },
            serverVersion: data.serverVersion || 1,
            serverUpdatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            deletedAt: data.deleted_at || data.deletedAt || null,
          });
        }
      }
    } catch (clientErr) {
      if (isFirestoreQuotaOrUnavailableError(clientErr)) throw clientErr;
      console.error('[DesktopSync] Error pulling clients:', clientErr);
    }

    // Query 2: Attendance records
    try {
      if (cursor) {
        const attendanceSnap = await db
          .collection('attendance')
          .where('date', '>', cursor)
          .orderBy('date', 'asc')
          .limit(limit)
          .get()
          .catch(async (err: unknown) => {
            if (isFirestoreQuotaOrUnavailableError(err)) throw err;
            return db.collection('attendance').orderBy('date', 'desc').limit(limit).get();
          });
        recordFirestoreReads(resolvedTenantId, Math.max(1, attendanceSnap.size));

        for (const doc of attendanceSnap.docs) {
          const data = doc.data();
          const serverUpdatedAt = data.date || data.createdAt || cursor;
          if (!cursor || serverUpdatedAt > cursor) {
            items.push({
              id: doc.id,
              entityType: 'attendance',
              tenantId: resolvedTenantId,
              data: { ...data, id: doc.id },
              serverVersion: data.serverVersion || 1,
              serverUpdatedAt,
              deletedAt: data.deleted_at || data.deletedAt || null,
            });
          }
        }
      } else {
        // Initial sync: pull recent attendance
        const attendanceSnap = await db
          .collection('attendance')
          .orderBy('date', 'desc')
          .limit(limit)
          .get()
          .catch(async (err: unknown) => {
            if (isFirestoreQuotaOrUnavailableError(err)) throw err;
            return db.collection('attendance').limit(limit).get();
          });
        recordFirestoreReads(resolvedTenantId, Math.max(1, attendanceSnap.size));

        for (const doc of attendanceSnap.docs) {
          const data = doc.data();
          items.push({
            id: doc.id,
            entityType: 'attendance',
            tenantId: resolvedTenantId,
            data: { ...data, id: doc.id },
            serverVersion: data.serverVersion || 1,
            serverUpdatedAt: data.date || data.createdAt || new Date().toISOString(),
            deletedAt: data.deleted_at || data.deletedAt || null,
          });
        }
      }
    } catch (attendanceErr) {
      if (isFirestoreQuotaOrUnavailableError(attendanceErr)) throw attendanceErr;
      console.error('[DesktopSync] Error pulling attendance:', attendanceErr);
    }

    // Query 3: Packages catalogue
    try {
      if (cursor) {
        const pkgSnap = await db
          .collection('packages')
          .where('updatedAt', '>', cursor)
          .orderBy('updatedAt', 'asc')
          .limit(limit)
          .get()
          .catch(async (err: unknown) => {
            if (isFirestoreQuotaOrUnavailableError(err)) throw err;
            return db.collection('packages').limit(limit).get();
          });
        recordFirestoreReads(resolvedTenantId, Math.max(1, pkgSnap.size));

        for (const doc of pkgSnap.docs) {
          const data = doc.data();
          delete data.history;
          delete data.auditTrail;
          delete data.versions;
          delete data.changeNotes;
          const serverUpdatedAt = data.updatedAt || data.createdAt || cursor;
          if (!cursor || serverUpdatedAt > cursor) {
            items.push({
              id: doc.id,
              entityType: 'package',
              tenantId: resolvedTenantId,
              data: { ...data, id: doc.id },
              serverVersion: data.serverVersion || data.version || 1,
              serverUpdatedAt,
              deletedAt: data.deleted_at || data.deletedAt || (data.status === 'Archived' ? (data.archivedAt || serverUpdatedAt) : null),
            });
          }
        }
      } else {
        // Initial sync: pull packages
        const pkgSnap = await db.collection('packages').limit(limit).get();
        recordFirestoreReads(resolvedTenantId, Math.max(1, pkgSnap.size));

        for (const doc of pkgSnap.docs) {
          const data = doc.data();
          delete data.history;
          delete data.auditTrail;
          delete data.versions;
          delete data.changeNotes;
          items.push({
            id: doc.id,
            entityType: 'package',
            tenantId: resolvedTenantId,
            data: { ...data, id: doc.id },
            serverVersion: data.serverVersion || data.version || 1,
            serverUpdatedAt: data.updatedAt || data.createdAt || new Date().toISOString(),
            deletedAt: data.deleted_at || data.deletedAt || (data.status === 'Archived' ? (data.archivedAt || data.updatedAt || new Date().toISOString()) : null),
          });
        }
      }
    } catch (packageErr) {
      if (isFirestoreQuotaOrUnavailableError(packageErr)) throw packageErr;
      console.error('[DesktopSync] Error pulling packages:', packageErr);
    }

    // Sort combined feed by serverUpdatedAt ascending
    items.sort((a, b) => (a.serverUpdatedAt > b.serverUpdatedAt ? 1 : -1));

    const pagedItems = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextCursor =
      pagedItems.length > 0 && pagedItems[pagedItems.length - 1]
        ? pagedItems[pagedItems.length - 1]!.serverUpdatedAt
        : cursor;

    const payload = {
      items: pagedItems,
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    };
    syncPullCache.set(cacheKey, { payload, expiresAt: Date.now() + SYNC_PULL_CACHE_TTL_MS });

    return res.status(200).json(payload);
  } catch (error) {
    if (isFirestoreQuotaOrUnavailableError(error)) {
      markQuotaExhausted(resolvedTenantId, (error as Error)?.message);
      const limitParam = Number(req.query.limit);
      const limit = Math.min(Math.max(isNaN(limitParam) ? 250 : limitParam, 1), 1000);
      const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null;
      const stale = syncPullCache.get(`${resolvedTenantId}:${cursor || ''}:${limit}`);
      if (stale) {
        res.setHeader('X-Mitrixo-Quota-Shield', 'active');
        return res.status(200).json(stale.payload);
      }
      return res.status(503).json({
        error: 'FIRESTORE_QUOTA_EXCEEDED',
        code: 'FIRESTORE_QUOTA_EXCEEDED',
        message: 'Database temporarily busy (quota exceeded). Please retry shortly.',
      });
    }
    console.error('[DesktopSync] Error in /sync/pull:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});

// ===============================================================
// 6. POST /conflicts/:id/resolve
// ===============================================================
desktopSyncRouter.post('/conflicts/:id/resolve', async (req: Request, res: Response) => {
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);
    const conflictId = req.params.id;

    if (!conflictId) {
      return res.status(400).json({ error: 'MISSING_CONFLICT_ID', message: 'Conflict ID is required in URL.' });
    }

    const conflictRef = db.collection('desktop_conflicts').doc(conflictId);
    const conflictDoc = await conflictRef.get();

    if (!conflictDoc.exists) {
      return res.status(404).json({ error: 'CONFLICT_NOT_FOUND', message: `Conflict "${conflictId}" not found.` });
    }

    const resolution = req.body?.resolution || 'accepted'; // 'accepted' | 'rejected' | 'merged'
    const resolvedBy =
      (req as any).user?.uid ||
      req.body?.resolvedBy ||
      (await authenticateStaffUser(req, db))?.uid ||
      'staff';
    const resolutionNotes = req.body?.resolutionNotes || req.body?.notes || '';
    const resolvedAt = new Date().toISOString();

    await conflictRef.update({
      status: 'resolved',
      resolution,
      resolvedBy,
      resolutionNotes,
      resolvedAt,
      updatedAt: resolvedAt,
    });

    await db.collection('desktop_audit_log').add({
      action: 'RESOLVE_CONFLICT',
      entityType: 'CONFLICT',
      entityId: conflictId,
      actorUserId: resolvedBy,
      tenantId: resolvedTenantId,
      details: `Conflict "${conflictId}" resolved as "${resolution}". Notes: ${resolutionNotes}`,
      timestamp: resolvedAt,
    });

    return res.status(200).json({
      status: 'resolved',
      conflictId,
      resolution,
      resolvedAt,
      serverTime: resolvedAt,
    });
  } catch (error) {
    console.error('[DesktopSync] Error in /conflicts/:id/resolve:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: (error as Error).message });
  }
});
