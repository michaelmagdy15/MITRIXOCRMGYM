/**
 * Front-desk read-only failover helpers backed by Cloudflare KV cloud backup snapshots.
 * Pure lookup/merge/search helpers live alongside lazy runtime fetchers so tests
 * can run in Node without initializing browser Firebase SDKs.
 */

export interface BackupSnapshotPayload {
  version: number;
  tenantId: string;
  lastBackupAt: string;
  counts: Record<string, number>;
  collections: {
    settings?: Record<string, any>;
    packages?: Record<string, any>;
    coaches?: Record<string, any>;
    users?: Record<string, any>;
    userTargets?: Record<string, any>;
    corporateCompanies?: Record<string, any>;
    lockers?: Record<string, any>;
    classSchedules?: Record<string, any>;
    clients?: Record<string, any>;
    payments?: Record<string, any>;
    attendance?: Record<string, any>;
  };
}

export interface QuotaFailoverEventDetail {
  active: boolean;
  lastBackupAt?: string;
  count?: number;
}

const SNAPSHOT_TTL_MS = 10 * 60_000;
const snapshotMemoryCache = new Map<string, { value: BackupSnapshotPayload | null; expiresAt: number }>();
const inflightSnapshotRequests = new Map<string, Promise<BackupSnapshotPayload | null>>();

export function normalizeLookupToken(token: string): { lower: string; compact: string } {
  const lower = String(token || '')
    .replace(/^#/, '')
    .trim()
    .toLowerCase();
  const compact = lower.replace(/[\s-]/g, '');
  return { lower, compact };
}

function matchesTokenValue(val: unknown, lower: string, compact: string): boolean {
  if (val === null || val === undefined) return false;
  const s = String(val).replace(/^#/, '').trim().toLowerCase();
  if (!s) return false;
  if (s === lower) return true;
  if (compact && s.replace(/[\s-]/g, '') === compact) return true;
  return false;
}

/**
 * Matches a member inside an offline/backup client array using Member ID, barcode,
 * redgitsId, secondaryBarcodes, package barcodes, guestSerial, or phone.
 * Resolves `mergedInto` targets within the same snapshot when available.
 */
export function findMemberInBackupClients<T extends Record<string, any>>(
  clients: T[],
  lookupToken: string
): T | null {
  if (!Array.isArray(clients) || clients.length === 0) return null;
  const raw = String(lookupToken || '').trim();
  if (!raw) return null;

  const { lower, compact } = normalizeLookupToken(raw);
  const digitsOnly = compact.replace(/\D/g, '');
  const egyptSuffix = digitsOnly.length >= 10 ? digitsOnly.slice(-10) : '';

  const matched = clients.find((c) => {
    if (!c || typeof c !== 'object') return false;
    if (String(c.id || '') === raw) return true;
    if (
      matchesTokenValue(c.memberId, lower, compact) ||
      matchesTokenValue(c.memberCode, lower, compact) ||
      matchesTokenValue(c.redgitsId, lower, compact) ||
      matchesTokenValue(c.barcode, lower, compact) ||
      matchesTokenValue(c.cardId, lower, compact) ||
      matchesTokenValue(c.leadId, lower, compact) ||
      matchesTokenValue(c.guestSerial, lower, compact)
    ) {
      return true;
    }

    if (egyptSuffix) {
      const clientPhoneDigits = String(c.phone || c.normalized_phone || '').replace(/\D/g, '');
      if (clientPhoneDigits && clientPhoneDigits.endsWith(egyptSuffix)) {
        return true;
      }
    } else if (c.phone && String(c.phone).trim() === raw) {
      return true;
    }

    if (Array.isArray(c.secondaryBarcodes) && c.secondaryBarcodes.some((b: unknown) => matchesTokenValue(b, lower, compact))) {
      return true;
    }
    if (Array.isArray(c.packages) && c.packages.some((p: any) => matchesTokenValue(p?.barcode, lower, compact))) {
      return true;
    }
    return false;
  });

  if (!matched) return null;

  if (matched.mergedInto && typeof matched.mergedInto === 'string') {
    const target = clients.find((c) => c && c.id === matched.mergedInto);
    if (target) return target;
  }

  return matched;
}

/**
 * Merges backup snapshot clients after live clients without overwriting live entries,
 * tagging snapshot-only records with `_fromBackupSnapshot: true`.
 */
export function mergeBackupClients<T extends { id: string }>(
  existing: T[],
  backupClients: T[]
): Array<T & { _fromBackupSnapshot?: boolean }> {
  const seen = new Set<string>();
  const merged: Array<T & { _fromBackupSnapshot?: boolean }> = [];

  for (const item of existing || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }

  for (const item of backupClients || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push({ ...item, _fromBackupSnapshot: true });
  }

  return merged;
}

/**
 * Instant client-side search across a cloud backup snapshot's client map.
 */
export function searchBackupClients<T extends Record<string, any>>(
  clients: T[],
  term: string,
  limitCount = 40
): Array<T & { _fromBackupSnapshot: true }> {
  if (!Array.isArray(clients) || clients.length === 0) return [];
  const { lower, compact } = normalizeLookupToken(term);
  if (!lower) return [];

  const matches: Array<T & { _fromBackupSnapshot: true }> = [];
  for (const c of clients) {
    if (!c || (c as any).isDeleted) continue;
    if ((c as any).mergedInto) continue;

    const haystacks = [
      c.name,
      c.phone,
      c.normalized_phone,
      c.memberId,
      c.leadId,
      c.barcode,
      c.redgitsId,
      ...(Array.isArray(c.secondaryBarcodes) ? c.secondaryBarcodes : []),
    ]
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).toLowerCase());

    const hit = haystacks.some(
      (h) => h.includes(lower) || (compact.length >= 2 && h.replace(/[\s-]/g, '').includes(compact))
    );

    if (hit) {
      matches.push({ ...c, _fromBackupSnapshot: true });
      if (matches.length >= limitCount) break;
    }
  }
  return matches;
}

export function dispatchQuotaFailoverEvent(detail: QuotaFailoverEventDetail): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
  try {
    window.dispatchEvent(new CustomEvent('mitrixo:quota-failover', { detail }));
  } catch {
    // ignore event dispatch errors in restricted environments
  }
}

export async function fetchTenantBackupSnapshot(
  tenantId: string,
  forceRefresh = false
): Promise<BackupSnapshotPayload | null> {
  const tid = String(tenantId || '').trim().toLowerCase() || 'inzanathletics';
  const now = Date.now();
  const cached = snapshotMemoryCache.get(tid);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.value;
  }

  if (!forceRefresh) {
    const inflight = inflightSnapshotRequests.get(tid);
    if (inflight) return inflight;
  }

  const task = (async (): Promise<BackupSnapshotPayload | null> => {
    try {
      const { auth } = await import('../firebase');
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      if (!token) return null;

      const res = await fetch('/api/quota/backup-snapshot', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          snapshotMemoryCache.set(tid, { value: null, expiresAt: Date.now() + 60_000 });
        }
        return null;
      }

      const data = await res.json();
      const snapshot = (data?.snapshot || null) as BackupSnapshotPayload | null;
      snapshotMemoryCache.set(tid, {
        value: snapshot,
        expiresAt: Date.now() + SNAPSHOT_TTL_MS,
      });
      return snapshot;
    } catch {
      return cached?.value ?? null;
    } finally {
      inflightSnapshotRequests.delete(tid);
    }
  })();

  inflightSnapshotRequests.set(tid, task);
  return task;
}

export async function hydrateBackupClientsToLocalDb(
  tenantId: string,
  clients: any[]
): Promise<void> {
  if (!tenantId || !Array.isArray(clients) || clients.length === 0) return;
  try {
    const { saveMembers } = await import('./../services/localDb');
    await saveMembers(tenantId, clients);
  } catch {
    // ignore IndexedDB write failure in private/restricted browsers
  }
}

export function __clearBackupSnapshotCacheForTests(): void {
  snapshotMemoryCache.clear();
  inflightSnapshotRequests.clear();
}
