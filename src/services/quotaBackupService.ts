import { gunzipSync, gzipSync } from 'node:zlib';
import type admin from 'firebase-admin';
import { isFirestoreQuotaOrUnavailableError } from '../utils/firestoreQuota.js';
import {
  getPacificDateKey,
  isQuotaShieldActive,
  markQuotaExhausted,
  recordFirestoreReads,
  shouldDeferBackgroundJob,
} from '../utils/sparkQuotaShield.js';

export interface BackupCollectionCounts {
  settings: number;
  packages: number;
  coaches: number;
  users: number;
  userTargets: number;
  corporateCompanies: number;
  lockers: number;
  classSchedules: number;
  clients: number;
  payments: number;
  attendance: number;
}

export interface BackupMeta {
  tenantId: string;
  lastBackupAt: string;
  mode: 'incremental' | 'bootstrap';
  readsUsed: number;
  gzipBytes: number;
  rawBytes: number;
  counts: BackupCollectionCounts;
  dailyKey: string;
}

export interface TenantBackupSnapshot {
  version: number;
  tenantId: string;
  lastBackupAt: string;
  counts: BackupCollectionCounts;
  collections: {
    settings: Record<string, any>;
    packages: Record<string, any>;
    coaches: Record<string, any>;
    users: Record<string, any>;
    userTargets: Record<string, any>;
    corporateCompanies: Record<string, any>;
    lockers: Record<string, any>;
    classSchedules: Record<string, any>;
    clients: Record<string, any>;
    payments: Record<string, any>;
    attendance: Record<string, any>;
  };
}

export interface BackupRunResult {
  ok: boolean;
  skipped?: boolean;
  quotaExceeded?: boolean;
  reason?: string;
  readsUsed: number;
  meta?: BackupMeta | null;
}

const MAX_BACKUP_READS = 3500;
const META_CACHE_TTL_MS = 5 * 60 * 1000;
const SNAPSHOT_CACHE_TTL_MS = 15 * 60 * 1000;
const SEVEN_DAYS_TTL_SECONDS = 7 * 24 * 60 * 60;

const STAFF_ROLES = [
  'crm_admin',
  'super_admin',
  'admin',
  'manager',
  'fitness_manager',
  'rep',
  'coach',
  'trainer',
];

const ACTIVE_STATUSES = [
  'Active',
  'Hold',
  'Nearly Expired',
  'nearly expired',
  'hold',
  'active',
  'HOLD',
  'ACTIVE',
  'Frozen',
  'frozen',
];

const metaCache = new Map<string, { value: BackupMeta | null; expiresAt: number }>();
const snapshotCache = new Map<string, { value: TenantBackupSnapshot | null; expiresAt: number }>();
const activeBackups = new Set<string>();

function normalizeTenant(tenantId: string): string {
  return String(tenantId || '').trim().toLowerCase() || 'inzanathletics';
}

function getKvConfig(): { accountId: string; apiToken: string; namespaceId: string } | null {
  const accountId = String(process.env.CF_ACCOUNT_ID || '').trim();
  const apiToken = String(process.env.CF_API_TOKEN || '').trim();
  const namespaceId = String(process.env.CF_BACKUP_KV_NAMESPACE_ID || '').trim();
  if (!accountId || !apiToken || !namespaceId) return null;
  return { accountId, apiToken, namespaceId };
}

export function isCloudBackupConfigured(): boolean {
  return getKvConfig() !== null;
}

function kvValueUrl(cfg: { accountId: string; namespaceId: string }, key: string, ttlSeconds?: number): string {
  const base = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/storage/kv/namespaces/${encodeURIComponent(cfg.namespaceId)}/values/${encodeURIComponent(key)}`;
  return ttlSeconds ? `${base}?expiration_ttl=${ttlSeconds}` : base;
}

async function kvGetBuffer(key: string): Promise<Buffer | null> {
  const cfg = getKvConfig();
  if (!cfg) return null;
  const res = await fetch(kvValueUrl(cfg, key), {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudflare KV read failed (${res.status}): ${body.slice(0, 180)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function kvPutBuffer(
  key: string,
  payload: Buffer,
  contentType: string,
  ttlSeconds?: number
): Promise<void> {
  const cfg = getKvConfig();
  if (!cfg) {
    throw new Error('Cloudflare KV backup credentials are not configured.');
  }
  const res = await fetch(kvValueUrl(cfg, key, ttlSeconds), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': contentType,
    },
    body: new Uint8Array(payload),
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudflare KV write failed (${res.status}): ${body.slice(0, 180)}`);
  }
}

export async function getBackupMeta(tenantId: string, bypassCache = false): Promise<BackupMeta | null> {
  const tid = normalizeTenant(tenantId);
  const now = Date.now();
  const cached = metaCache.get(tid);
  if (!bypassCache && cached && cached.expiresAt > now) {
    return cached.value;
  }
  if (!isCloudBackupConfigured()) {
    metaCache.set(tid, { value: null, expiresAt: now + META_CACHE_TTL_MS });
    return null;
  }
  try {
    const raw = await kvGetBuffer(`backup:${tid}:meta`);
    const parsed = raw ? (JSON.parse(raw.toString('utf8')) as BackupMeta) : null;
    metaCache.set(tid, { value: parsed, expiresAt: now + META_CACHE_TTL_MS });
    return parsed;
  } catch (err) {
    console.warn('[QuotaBackup] Failed to read KV backup meta:', err instanceof Error ? err.message : err);
    return cached?.value ?? null;
  }
}

export async function getCachedBackupSnapshot(
  tenantId: string,
  bypassCache = false
): Promise<TenantBackupSnapshot | null> {
  const tid = normalizeTenant(tenantId);
  const now = Date.now();
  const cached = snapshotCache.get(tid);
  if (!bypassCache && cached && cached.expiresAt > now) {
    return cached.value;
  }
  if (!isCloudBackupConfigured()) return null;
  try {
    const gzBuf = await kvGetBuffer(`backup:${tid}:latest`);
    if (!gzBuf) {
      snapshotCache.set(tid, { value: null, expiresAt: now + META_CACHE_TTL_MS });
      return null;
    }
    const parsed = JSON.parse(gunzipSync(gzBuf).toString('utf8')) as TenantBackupSnapshot;
    snapshotCache.set(tid, { value: parsed, expiresAt: now + SNAPSHOT_CACHE_TTL_MS });
    return parsed;
  } catch (err) {
    console.warn('[QuotaBackup] Failed to read KV latest snapshot:', err instanceof Error ? err.message : err);
    return cached?.value ?? null;
  }
}

function stripBulkFields(data: Record<string, any>): Record<string, any> {
  const copy = { ...data };
  delete copy.history;
  delete copy.importedHistory;
  delete copy.auditTrail;
  delete copy.versions;
  delete copy.changeNotes;
  delete copy.photoCaptureLogs;
  delete copy.comments;
  delete copy.interactions;
  delete copy.callAuditTrail;
  return copy;
}

function snapToMap(
  snap: admin.firestore.QuerySnapshot,
  strip = false
): Record<string, any> {
  const out: Record<string, any> = {};
  for (const d of snap.docs) {
    const data = d.data() || {};
    out[d.id] = { ...(strip ? stripBulkFields(data) : data), id: d.id };
  }
  return out;
}

export async function runIncrementalCloudBackup(
  tenantId: string,
  db: admin.firestore.Firestore,
  options?: { force?: boolean }
): Promise<BackupRunResult> {
  const tid = normalizeTenant(tenantId);

  if (!isCloudBackupConfigured()) {
    return { ok: false, skipped: true, reason: 'CLOUD_BACKUP_NOT_CONFIGURED', readsUsed: 0 };
  }
  if (isQuotaShieldActive(tid)) {
    return {
      ok: false,
      skipped: true,
      quotaExceeded: true,
      reason: 'QUOTA_SHIELD_ACTIVE',
      readsUsed: 0,
      meta: await getBackupMeta(tid),
    };
  }
  if (!options?.force && shouldDeferBackgroundJob(tid)) {
    return {
      ok: false,
      skipped: true,
      reason: 'CONSERVE_MODE_DEFERRED',
      readsUsed: 0,
      meta: await getBackupMeta(tid),
    };
  }
  if (activeBackups.has(tid)) {
    return { ok: false, skipped: true, reason: 'BACKUP_ALREADY_RUNNING', readsUsed: 0 };
  }

  activeBackups.add(tid);
  let readsUsed = 0;

  const trackRead = async (query: admin.firestore.Query): Promise<admin.firestore.QuerySnapshot> => {
    const snap = await query.get();
    const n = Math.max(1, snap.size);
    readsUsed += n;
    recordFirestoreReads(tid, n);
    return snap;
  };

  try {
    const prior = await getCachedBackupSnapshot(tid);
    const hasIncrementalCursor = Boolean(prior?.lastBackupAt);
    const mode: 'incremental' | 'bootstrap' = hasIncrementalCursor ? 'incremental' : 'bootstrap';
    const budgetRemaining = () => Math.max(0, MAX_BACKUP_READS - readsUsed);

    const thirtyDaysAgoStr = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const fourteenDaysAgoStr = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const twoDaysAgoStr = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // 1. Small core configuration & directory collections (bounded strictly)
    const [settingsSnap, packagesSnap, coachesSnap, targetsSnap, corpSnap, lockersSnap, usersSnap, schedulesSnap] =
      await Promise.all([
        trackRead(db.collection('settings').limit(50)),
        trackRead(db.collection('packages').limit(300)),
        trackRead(db.collection('coaches').limit(100)),
        trackRead(db.collection('userTargets').limit(200)),
        trackRead(db.collection('corporateCompanies').limit(100)),
        trackRead(db.collection('lockers').limit(200)),
        trackRead(db.collection('users').where('role', 'in', STAFF_ROLES).limit(150)),
        trackRead(db.collection('classSchedules').where('date', '>=', thirtyDaysAgoStr).limit(400)),
      ]);

    const clientsMap: Record<string, any> = { ...(prior?.collections?.clients || {}) };
    const paymentsMap: Record<string, any> = { ...(prior?.collections?.payments || {}) };
    const attendanceMap: Record<string, any> = { ...(prior?.collections?.attendance || {}) };

    // 2. Clients delta or bootstrap within remaining read cap
    if (budgetRemaining() > 0) {
      if (hasIncrementalCursor && prior?.lastBackupAt) {
        const cap = Math.min(900, budgetRemaining());
        let clientSnap: admin.firestore.QuerySnapshot;
        try {
          clientSnap = await trackRead(
            db.collection('clients').where('updatedAt', '>=', prior.lastBackupAt).limit(cap)
          );
        } catch (err) {
          if (isFirestoreQuotaOrUnavailableError(err)) throw err;
          clientSnap = await trackRead(db.collection('clients').where('status', 'in', ACTIVE_STATUSES).limit(Math.min(500, cap)));
        }
        Object.assign(clientsMap, snapToMap(clientSnap, true));
      } else {
        const activeSnap = await trackRead(
          db.collection('clients').where('status', 'in', ACTIVE_STATUSES).limit(Math.min(1600, budgetRemaining()))
        );
        Object.assign(clientsMap, snapToMap(activeSnap, true));
        if (budgetRemaining() > 300) {
          const leadSnap = await trackRead(
            db.collection('clients').where('status', '==', 'Lead').limit(Math.min(250, budgetRemaining()))
          );
          Object.assign(clientsMap, snapToMap(leadSnap, true));
        }
      }
    }

    // 3. Payments delta or 30d bootstrap
    if (budgetRemaining() > 0) {
      const cap = Math.min(600, budgetRemaining());
      if (hasIncrementalCursor && prior?.lastBackupAt) {
        let paySnap: admin.firestore.QuerySnapshot;
        try {
          paySnap = await trackRead(
            db.collection('payments').where('created_at', '>=', prior.lastBackupAt).limit(cap)
          );
        } catch (err) {
          if (isFirestoreQuotaOrUnavailableError(err)) throw err;
          paySnap = await trackRead(db.collection('payments').where('date', '>=', twoDaysAgoStr).limit(cap));
        }
        Object.assign(paymentsMap, snapToMap(paySnap, false));
      } else {
        const paySnap = await trackRead(
          db.collection('payments').where('date', '>=', thirtyDaysAgoStr).limit(cap)
        );
        Object.assign(paymentsMap, snapToMap(paySnap, false));
      }
    }

    // 4. Attendance delta or 14d bootstrap
    if (budgetRemaining() > 0) {
      const cap = Math.min(600, budgetRemaining());
      const cutoff = hasIncrementalCursor ? twoDaysAgoStr : fourteenDaysAgoStr;
      const attSnap = await trackRead(
        db.collection('attendance').where('date', '>=', cutoff).limit(cap)
      );
      Object.assign(attendanceMap, snapToMap(attSnap, false));
    }

    const nowIso = new Date().toISOString();
    const collections = {
      settings: snapToMap(settingsSnap, false),
      packages: snapToMap(packagesSnap, true),
      coaches: snapToMap(coachesSnap, false),
      users: snapToMap(usersSnap, false),
      userTargets: snapToMap(targetsSnap, false),
      corporateCompanies: snapToMap(corpSnap, false),
      lockers: snapToMap(lockersSnap, false),
      classSchedules: snapToMap(schedulesSnap, false),
      clients: clientsMap,
      payments: paymentsMap,
      attendance: attendanceMap,
    };

    const counts: BackupCollectionCounts = {
      settings: Object.keys(collections.settings).length,
      packages: Object.keys(collections.packages).length,
      coaches: Object.keys(collections.coaches).length,
      users: Object.keys(collections.users).length,
      userTargets: Object.keys(collections.userTargets).length,
      corporateCompanies: Object.keys(collections.corporateCompanies).length,
      lockers: Object.keys(collections.lockers).length,
      classSchedules: Object.keys(collections.classSchedules).length,
      clients: Object.keys(collections.clients).length,
      payments: Object.keys(collections.payments).length,
      attendance: Object.keys(collections.attendance).length,
    };

    const snapshot: TenantBackupSnapshot = {
      version: 1,
      tenantId: tid,
      lastBackupAt: nowIso,
      counts,
      collections,
    };

    const rawJsonBuf = Buffer.from(JSON.stringify(snapshot), 'utf8');
    const gzipBuf = gzipSync(rawJsonBuf, { level: 6 });
    const ptDay = getPacificDateKey();
    const dailyKey = `backup:${tid}:daily:${ptDay}`;

    const meta: BackupMeta = {
      tenantId: tid,
      lastBackupAt: nowIso,
      mode,
      readsUsed,
      gzipBytes: gzipBuf.byteLength,
      rawBytes: rawJsonBuf.byteLength,
      counts,
      dailyKey,
    };

    await kvPutBuffer(`backup:${tid}:latest`, gzipBuf, 'application/gzip');
    await kvPutBuffer(dailyKey, gzipBuf, 'application/gzip', SEVEN_DAYS_TTL_SECONDS);
    await kvPutBuffer(`backup:${tid}:meta`, Buffer.from(JSON.stringify(meta), 'utf8'), 'application/json');

    const nowMs = Date.now();
    metaCache.set(tid, { value: meta, expiresAt: nowMs + META_CACHE_TTL_MS });
    snapshotCache.set(tid, { value: snapshot, expiresAt: nowMs + SNAPSHOT_CACHE_TTL_MS });

    return { ok: true, readsUsed, meta };
  } catch (err) {
    if (isFirestoreQuotaOrUnavailableError(err)) {
      const msg = err instanceof Error ? err.message : 'FIRESTORE_QUOTA_EXCEEDED';
      markQuotaExhausted(tid, msg);
      return {
        ok: false,
        quotaExceeded: true,
        reason: 'FIRESTORE_QUOTA_EXCEEDED',
        readsUsed,
        meta: await getBackupMeta(tid),
      };
    }
    throw err;
  } finally {
    activeBackups.delete(tid);
  }
}
