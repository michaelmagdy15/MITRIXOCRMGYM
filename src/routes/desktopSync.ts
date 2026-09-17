import crypto from 'crypto';
import express, { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { getDbForRequest, getTenantIdForRequest, getTenantInfoForHost, getRequestHostname } from '../utils/tenantDb.js';

export const desktopSyncRouter = Router();

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
  entityType: 'member' | 'attendance';
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
    const decoded = await admin.auth().verifyIdToken(token);
    if (decoded.email === PLATFORM_SUPER_ADMIN_EMAIL) {
      return {
        uid: decoded.uid,
        email: decoded.email,
        role: 'super_admin',
        name: 'Platform Super Admin',
      };
    }

    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (userDoc.exists) {
      const udata = userDoc.data();
      return {
        uid: decoded.uid,
        email: decoded.email,
        role: udata?.role || 'staff',
        name: udata?.name || (decoded as any).name || undefined,
      };
    }

    return {
      uid: decoded.uid,
      email: decoded.email,
      role: 'staff',
      name: (decoded as any).name || undefined,
    };
  } catch {
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
 * Validates device credentials against tenant's desktop_devices collection.
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
      message: 'Both deviceId and deviceToken (or X-Device-Id and X-Device-Token headers) are required.',
    };
  }

  const deviceRef = db.collection('desktop_devices').doc(deviceId);
  const deviceDoc = await deviceRef.get();

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
            source: 'desktop_offline',
            deviceId: device.deviceId,
            operationId,
            createdAt: now,
          };

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
            result: { attendanceId },
          };

          const auditRef = db.collection('desktop_audit_log').doc();
          const auditEntry = {
            operationId,
            deviceId: device.deviceId,
            tenantId: resolvedTenantId,
            actorUserId: op.actorUserId || 'desktop-offline',
            action: 'CREATE',
            entityType: 'ATTENDANCE',
            entityId: attendanceId,
            details: `Desktop offline check-in for client ${clientData?.name || clientId} at ${branch}`,
            timestamp: now,
          };

          const batch = db.batch();
          batch.set(attendanceRef, attendanceRecord);
          batch.set(ledgerRef, ledgerEntry);
          batch.set(auditRef, auditEntry);
          await batch.commit();

          results.push({
            operationId,
            status: 'acknowledged',
            deduplicated: false,
            appliedAt: now,
            result: { attendanceId },
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
  try {
    const db = (req as any)._testDb || (await getDbForRequest(req));
    const resolvedTenantId = await getTenantIdForRequest(req);

    // Authenticate device
    const authResult = await authenticateDevice(req, db, resolvedTenantId);
    if (!authResult.success) {
      return res.status(authResult.status).json({ error: authResult.error, message: authResult.message });
    }

    const limitParam = Number(req.query.limit);
    const limit = Math.min(Math.max(isNaN(limitParam) ? 1000 : limitParam, 1), 2000);
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor.trim() ? req.query.cursor.trim() : null;

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
          .catch(async () => {
            // Fallback if updatedAt index is not available or records lack updatedAt
            return db.collection('clients').limit(limit).get();
          });

        for (const doc of clientSnap.docs) {
          const data = doc.data();
          delete data.comments;
          delete data.interactions;
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

        for (const doc of clientSnap.docs) {
          const data = doc.data();
          delete data.comments;
          delete data.interactions;
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
          .catch(async () => {
            return db.collection('attendance').orderBy('date', 'desc').limit(limit).get();
          });

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
          .catch(async () => {
            return db.collection('attendance').limit(limit).get();
          });

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
      console.error('[DesktopSync] Error pulling attendance:', attendanceErr);
    }

    // Sort combined feed by serverUpdatedAt ascending
    items.sort((a, b) => (a.serverUpdatedAt > b.serverUpdatedAt ? 1 : -1));

    const pagedItems = items.slice(0, limit);
    const hasMore = items.length > limit;
    const nextCursor =
      pagedItems.length > 0 && pagedItems[pagedItems.length - 1]
        ? pagedItems[pagedItems.length - 1]!.serverUpdatedAt
        : cursor;

    return res.status(200).json({
      items: pagedItems,
      nextCursor,
      hasMore,
      serverTime: new Date().toISOString(),
    });
  } catch (error) {
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
