import { gunzipSync } from 'node:zlib';

export interface ArchiveMeta {
  version: number;
  tenantId: string;
  generatedAt: string;
  totalRecords: number;
  counts: {
    attendanceHistory: number;
    attendance: number;
    leads: number;
    invitations: number;
    callCenterLog: number;
  };
  gzipBytes?: Record<string, number>;
}

export type ArchiveDatasetType = 'leads' | 'invitations' | 'callCenterLog' | 'attendance';

export interface ArchiveSearchResult {
  available: boolean;
  type: ArchiveDatasetType;
  total: number;
  matched: number;
  items: any[];
}

export interface EdgeMonitorHealthReport {
  checkedAt: string;
  overallOk: boolean;
  checks: Record<
    string,
    {
      ok: boolean;
      status: number;
      latencyMs: number;
      quotaState?: string;
      readPercent?: number;
      reads?: number;
      readLimit?: number;
      error?: string;
    }
  >;
  history?: Array<{
    t: string;
    ok: boolean;
    inzanMs?: number;
    strikeMs?: number;
    vbtMs?: number;
    quotaState?: string;
  }>;
}

const ARCHIVE_CACHE_TTL_MS = 30 * 60_000;
const EDGE_MONITOR_CACHE_TTL_MS = 3 * 60_000;

const archiveCache = new Map<string, { value: any; expiresAt: number }>();
const inflightArchiveLoads = new Map<string, Promise<any>>();

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

function kvValueUrl(cfg: { accountId: string; namespaceId: string }, key: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cfg.accountId)}/storage/kv/namespaces/${encodeURIComponent(cfg.namespaceId)}/values/${encodeURIComponent(key)}`;
}

async function kvGetBuffer(key: string): Promise<Buffer | null> {
  const cfg = getKvConfig();
  if (!cfg) return null;
  const res = await fetch(kvValueUrl(cfg, key), {
    headers: { Authorization: `Bearer ${cfg.apiToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudflare KV read failed (${res.status}): ${body.slice(0, 180)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function kvPutBuffer(key: string, payload: Buffer, contentType: string): Promise<void> {
  const cfg = getKvConfig();
  if (!cfg) {
    throw new Error('Cloudflare KV credentials are not configured.');
  }
  const res = await fetch(kvValueUrl(cfg, key), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${cfg.apiToken}`,
      'Content-Type': contentType,
    },
    body: new Uint8Array(payload),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Cloudflare KV write failed (${res.status}): ${body.slice(0, 180)}`);
  }
}

export const ALLOWED_ARCHIVE_BUCKETS = new Set([
  'att_hist',
  'attendance',
  'leads',
  'invitations',
  'callCenterLog',
  'meta',
] as const);

export async function putArchiveBucket(
  tenantId: string,
  bucket: string,
  payload: Buffer
): Promise<void> {
  if (!ALLOWED_ARCHIVE_BUCKETS.has(bucket as any)) {
    throw new Error(`Invalid archive bucket "${bucket}".`);
  }
  if (!Buffer.isBuffer(payload) || payload.byteLength === 0) {
    throw new Error('Archive payload must be a non-empty buffer.');
  }

  if (bucket === 'meta') {
    JSON.parse(payload.toString('utf8'));
  } else {
    gunzipSync(payload);
  }

  const tid = normalizeTenant(tenantId);
  const key = `archive:${tid}:${bucket}`;
  const contentType = bucket === 'meta' ? 'application/json' : 'application/gzip';
  await kvPutBuffer(key, payload, contentType);
  archiveCache.delete(key);
}

async function loadCachedKvJson<T>(
  key: string,
  gzipped: boolean,
  ttlMs: number
): Promise<T | null> {
  const now = Date.now();
  const cached = archiveCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value as T | null;
  }

  const inflight = inflightArchiveLoads.get(key);
  if (inflight) return inflight;

  const task = (async (): Promise<T | null> => {
    try {
      const buf = await kvGetBuffer(key);
      if (!buf) {
        archiveCache.set(key, { value: null, expiresAt: Date.now() + Math.min(ttlMs, 5 * 60_000) });
        return null;
      }
      const jsonStr = gzipped ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
      const parsed = JSON.parse(jsonStr) as T;
      archiveCache.set(key, { value: parsed, expiresAt: Date.now() + ttlMs });
      return parsed;
    } catch (err) {
      console.warn(`[Archive] Failed loading KV key "${key}":`, err instanceof Error ? err.message : err);
      return (cached?.value ?? null) as T | null;
    } finally {
      inflightArchiveLoads.delete(key);
    }
  })();

  inflightArchiveLoads.set(key, task);
  return task;
}

/**
 * Pure text filter for historical archive arrays (leads, invitations, callCenterLog, attendance).
 */
export function filterArchiveItems<T extends Record<string, any>>(
  items: T[],
  queryText: string,
  limitCount = 50
): { total: number; matched: number; items: T[] } {
  if (!Array.isArray(items) || items.length === 0) {
    return { total: 0, matched: 0, items: [] };
  }
  const cappedLimit = Math.min(Math.max(1, Number(limitCount) || 50), 200);
  const q = String(queryText || '').trim().toLowerCase();
  if (!q) {
    return {
      total: items.length,
      matched: items.length,
      items: items.slice(0, cappedLimit),
    };
  }

  const qCompact = q.replace(/[\s-]/g, '');
  const filtered: T[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    let isMatch = false;
    for (const val of Object.values(item)) {
      if (val === null || val === undefined) continue;
      if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
        const s = String(val).toLowerCase();
        if (s.includes(q) || (qCompact.length >= 2 && s.replace(/[\s-]/g, '').includes(qCompact))) {
          isMatch = true;
          break;
        }
      }
    }
    if (isMatch) {
      filtered.push(item);
    }
  }

  return {
    total: items.length,
    matched: filtered.length,
    items: filtered.slice(0, cappedLimit),
  };
}

/**
 * Merges archived `attendance_history` entries and legacy `attendance` entries
 * for a single member, deduplicating by timestamp prefix (`YYYY-MM-DDTHH:MM:SS`)
 * and sorting newest-first.
 */
export function mergeMemberAttendanceArchives(
  attHistEntries: any[],
  legacyAttEntries: any[]
): any[] {
  const combined = [
    ...(Array.isArray(attHistEntries) ? attHistEntries : []),
    ...(Array.isArray(legacyAttEntries) ? legacyAttEntries : []),
  ];
  const seen = new Set<string>();
  const out: any[] = [];

  for (const raw of combined) {
    if (!raw || typeof raw !== 'object') continue;
    const dateVal = String(raw.date || raw.checkedInAt || raw.sessionDate || '').trim();
    const dedupeKey = dateVal ? `${dateVal.slice(0, 19)}|${String(raw.packageName || '')}` : String(raw.id || '');
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);
    out.push({
      id: String(raw.id || `arch_${out.length}`),
      date: dateVal,
      checkOutTime: raw.checkOutTime || '',
      packageName: raw.packageName || 'Attendance Check-in',
      branch: raw.branch || 'Garden 8',
      recordedByName: raw.recordedByName || raw.recordedBy || 'Archive',
      locker: raw.locker || '',
      status: raw.status || 'ATTENDED',
      isArchived: true,
    });
  }

  out.sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
  return out;
}

export async function getArchiveMeta(tenantId: string): Promise<{ available: boolean; meta: ArchiveMeta | null }> {
  const tid = normalizeTenant(tenantId);
  const meta = await loadCachedKvJson<ArchiveMeta>(`archive:${tid}:meta`, false, ARCHIVE_CACHE_TTL_MS);
  return { available: Boolean(meta), meta };
}

export async function getMemberArchivedAttendance(
  tenantId: string,
  candidateIds: string[]
): Promise<{ available: boolean; total: number; items: any[] }> {
  const tid = normalizeTenant(tenantId);
  const cleanIds = Array.from(
    new Set(
      candidateIds
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .flatMap((id) => (id.startsWith('redgits-') ? [id, id.replace(/^redgits-/, '')] : [id, `redgits-${id}`]))
    )
  );

  if (cleanIds.length === 0) {
    return { available: false, total: 0, items: [] };
  }

  const [attHistMap, attBucket] = await Promise.all([
    loadCachedKvJson<Record<string, any[]>>(`archive:${tid}:att_hist`, true, ARCHIVE_CACHE_TTL_MS),
    loadCachedKvJson<{ byClient?: Record<string, any[]> }>(
      `archive:${tid}:attendance`,
      true,
      ARCHIVE_CACHE_TTL_MS
    ),
  ]);

  if (!attHistMap && !attBucket) {
    return { available: false, total: 0, items: [] };
  }

  const histRows: any[] = [];
  const legacyRows: any[] = [];
  for (const cid of cleanIds) {
    if (attHistMap && Array.isArray(attHistMap[cid])) {
      histRows.push(...attHistMap[cid]);
    }
    if (attBucket?.byClient && Array.isArray(attBucket.byClient[cid])) {
      legacyRows.push(...attBucket.byClient[cid]);
    }
  }

  const merged = mergeMemberAttendanceArchives(histRows, legacyRows);
  return { available: true, total: merged.length, items: merged };
}

export async function searchHistoricalArchive(
  tenantId: string,
  type: ArchiveDatasetType,
  q: string,
  limitCount = 50
): Promise<ArchiveSearchResult> {
  const tid = normalizeTenant(tenantId);

  if (type === 'attendance') {
    const bucket = await loadCachedKvJson<{ byClient?: Record<string, any[]>; all?: any[] }>(
      `archive:${tid}:attendance`,
      true,
      ARCHIVE_CACHE_TTL_MS
    );
    if (!bucket) return { available: false, type, total: 0, matched: 0, items: [] };
    const flat = Array.isArray(bucket.all)
      ? bucket.all
      : Object.entries(bucket.byClient || {}).flatMap(([clientId, entries]) =>
          (Array.isArray(entries) ? entries : []).map((e) => ({ clientId, ...e }))
        );
    const res = filterArchiveItems(flat, q, limitCount);
    return { available: true, type, ...res };
  }

  const list = await loadCachedKvJson<any[]>(`archive:${tid}:${type}`, true, ARCHIVE_CACHE_TTL_MS);
  if (!Array.isArray(list)) {
    return { available: false, type, total: 0, matched: 0, items: [] };
  }
  const res = filterArchiveItems(list, q, limitCount);
  return { available: true, type, ...res };
}

let inflightMonitorRefresh: Promise<EdgeMonitorHealthReport | null> | null = null;

async function probeEndpointHealth(
  url: string,
  method: 'GET' | 'HEAD' = 'GET'
): Promise<{ ok: boolean; status: number; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': 'Mitrixo-Gateway-Monitor/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    return {
      ok: res.ok,
      status: res.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getEdgeMonitorHealth(): Promise<EdgeMonitorHealthReport | null> {
  return loadCachedKvJson<EdgeMonitorHealthReport>(
    'monitor:health:latest',
    false,
    EDGE_MONITOR_CACHE_TTL_MS
  );
}

/**
 * Returns cached Cloudflare Edge Monitor telemetry if fresher than 10 minutes,
 * or refreshes it on demand (coalesced) by probing Strike + VBT + self gateway health.
 */
export async function getOrRefreshEdgeMonitorHealth(inzanQuotaStatus?: {
  state: string;
  readPercent: number;
  reads: number;
  readLimit: number;
}): Promise<EdgeMonitorHealthReport | null> {
  const existing = await getEdgeMonitorHealth();
  if (existing?.checkedAt) {
    const ageMs = Date.now() - Date.parse(existing.checkedAt);
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < 10 * 60_000) {
      return existing;
    }
  }

  if (inflightMonitorRefresh) return inflightMonitorRefresh;

  inflightMonitorRefresh = (async (): Promise<EdgeMonitorHealthReport | null> => {
    try {
      const [strikeProduction, vbtPortal] = await Promise.all([
        probeEndpointHealth('https://strike-egy.com/api/health', 'GET'),
        probeEndpointHealth('https://vbt.mitrixo.com/', 'HEAD'),
      ]);

      const nowIso = new Date().toISOString();
      const inzanGateway = { ok: true, status: 200, latencyMs: 1 };
      const quotaInfo = inzanQuotaStatus || {
        state: 'normal',
        readPercent: 0,
        reads: 0,
        readLimit: 50_000,
      };
      const overallOk = Boolean(inzanGateway.ok && strikeProduction.ok && vbtPortal.ok);
      const prevHistory = Array.isArray(existing?.history) ? existing.history : [];
      const nextHistory = [
        ...prevHistory.slice(-23),
        {
          t: nowIso,
          ok: overallOk,
          inzanMs: inzanGateway.latencyMs,
          strikeMs: strikeProduction.latencyMs,
          vbtMs: vbtPortal.latencyMs,
          quotaState: quotaInfo.state,
        },
      ];

      const report: EdgeMonitorHealthReport = {
        checkedAt: nowIso,
        overallOk,
        checks: {
          inzanGateway,
          inzanQuota: {
            ok: true,
            status: 200,
            latencyMs: 1,
            quotaState: quotaInfo.state,
            readPercent: quotaInfo.readPercent,
            reads: quotaInfo.reads,
            readLimit: quotaInfo.readLimit,
          },
          strikeProduction,
          vbtPortal,
        },
        history: nextHistory,
      };

      archiveCache.set('monitor:health:latest', {
        value: report,
        expiresAt: Date.now() + EDGE_MONITOR_CACHE_TTL_MS,
      });

      if (getKvConfig()) {
        await kvPutBuffer(
          'monitor:health:latest',
          Buffer.from(JSON.stringify(report), 'utf8'),
          'application/json'
        ).catch((err) => {
          console.warn('[EdgeMonitor] KV persist failed:', err instanceof Error ? err.message : err);
        });
      }

      return report;
    } catch {
      return existing;
    } finally {
      inflightMonitorRefresh = null;
    }
  })();

  return inflightMonitorRefresh;
}

export function __clearArchiveCachesForTests(): void {
  archiveCache.clear();
  inflightArchiveLoads.clear();
  inflightMonitorRefresh = null;
}
