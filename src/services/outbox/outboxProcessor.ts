import type { OutboxEntry, OutboxOperationType, FlushResult } from './outboxTypes';
import {
  saveOutboxEntry,
  deleteOutboxEntry,
  getOutboxEntriesByTenant,
  getAllOutboxEntries,
} from './outboxDb';

const BASE_RETRY_DELAY_MS = 2000; // 2 seconds initial backoff
const MAX_RETRY_DELAY_MS = 300000; // 5 minutes max backoff
const STALE_IN_FLIGHT_MS = 60000; // 1 minute before in-flight items are treated as timed-out
const BATCH_SIZE_LIMIT = 20;

let activeTenantId: string | null = null;
let activeAuthToken: string | null = null;

const inFlightFlushes = new Set<string>();

type ListenerRegistration = {
  callback: (pendingCount: number) => void;
  tenantId?: string;
};

const listeners = new Set<ListenerRegistration>();

/**
 * Generates a RFC4122 v4 UUID with fallback for non-crypto environments.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Determines whether an outbox entry is eligible for flush attempt.
 */
function isEligibleForSync(entry: OutboxEntry): boolean {
  const now = Date.now();
  if (entry.status === 'pending') {
    return true;
  }
  if (entry.status === 'in-flight') {
    const elapsed = now - new Date(entry.updatedAtUtc).getTime();
    return elapsed >= STALE_IN_FLIGHT_MS;
  }
  if (entry.status === 'failed') {
    const elapsed = now - new Date(entry.updatedAtUtc).getTime();
    const backoffMs = Math.min(
      MAX_RETRY_DELAY_MS,
      BASE_RETRY_DELAY_MS * Math.pow(2, Math.max(0, entry.retryCount - 1))
    );
    return elapsed >= backoffMs;
  }
  return false;
}

/**
 * Counts all pending, failed, or in-flight entries across all tenants.
 */
async function getAllPendingCount(): Promise<number> {
  try {
    const all = await getAllOutboxEntries();
    return all.filter((e) => e.status === 'pending' || e.status === 'failed' || e.status === 'in-flight').length;
  } catch {
    return 0;
  }
}

/**
 * Notifies all registered listeners with the updated pending count.
 */
async function notifyListeners(updatedTenantId?: string): Promise<void> {
  if (listeners.size === 0) return;

  for (const reg of listeners) {
    try {
      const targetTenant = reg.tenantId || updatedTenantId || activeTenantId;
      const count = targetTenant
        ? await getPendingOutboxCount(targetTenant)
        : await getAllPendingCount();
      reg.callback(count);
    } catch (err) {
      console.warn('[OutboxProcessor] Listener notification failed:', err);
    }
  }
}

/**
 * Sets active sync context (tenantId and optional authToken) for auto-flush operations.
 */
export function setActiveSyncContext(tenantId: string, authToken?: string): void {
  activeTenantId = tenantId;
  if (authToken !== undefined) {
    activeAuthToken = authToken;
  }
}

/**
 * Returns the count of pending, failed, or in-flight outbox items for a tenant.
 */
export async function getPendingOutboxCount(tenantId: string): Promise<number> {
  try {
    const entries = await getOutboxEntriesByTenant(tenantId);
    return entries.filter(
      (e) => e.status === 'pending' || e.status === 'failed' || e.status === 'in-flight'
    ).length;
  } catch (err) {
    console.warn('[OutboxProcessor] Failed to count pending outbox entries:', err);
    return 0;
  }
}

/**
 * Subscribes to real-time outbox changes. Returns an unsubscribe function.
 */
export function onOutboxChange(
  callback: (pendingCount: number) => void,
  tenantId?: string
): () => void {
  const reg: ListenerRegistration = { callback, tenantId };
  listeners.add(reg);

  // Deliver initial count
  const initialTenant = tenantId || activeTenantId;
  if (initialTenant) {
    getPendingOutboxCount(initialTenant)
      .then((count) => {
        if (listeners.has(reg)) {
          callback(count);
        }
      })
      .catch(() => {});
  } else {
    getAllPendingCount()
      .then((count) => {
        if (listeners.has(reg)) {
          callback(count);
        }
      })
      .catch(() => {});
  }

  return () => {
    listeners.delete(reg);
  };
}

/**
 * Creates and commits a new mutation operation to the persistent outbox store.
 */
export async function enqueueOperation(
  tenantId: string,
  operationType: string,
  entityId: string,
  payload: any
): Promise<string> {
  const operationId = generateUUID();
  const now = new Date().toISOString();

  const entry: OutboxEntry = {
    operationId,
    tenantId,
    operationType: operationType as OutboxOperationType,
    entityId,
    payload: payload ?? {},
    status: 'pending',
    retryCount: 0,
    createdAtUtc: now,
    updatedAtUtc: now,
  };

  await saveOutboxEntry(entry);
  await notifyListeners(tenantId);

  // If online, schedule background flush
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    setTimeout(() => {
      flushOutbox(tenantId, activeAuthToken || undefined).catch((err) => {
        console.warn('[OutboxProcessor] Auto-flush after enqueue error:', err);
      });
    }, 50);
  }

  return operationId;
}

/**
 * Flushes up to 20 pending or failed outbox operations to the backend sync API.
 */
export async function flushOutbox(
  tenantId: string,
  authToken?: string
): Promise<FlushResult> {
  if (!tenantId) {
    return { sent: 0, succeeded: 0, failed: 0 };
  }

  if (inFlightFlushes.has(tenantId)) {
    return { sent: 0, succeeded: 0, failed: 0 };
  }

  inFlightFlushes.add(tenantId);

  try {
    const entries = await getOutboxEntriesByTenant(tenantId);
    const eligible = entries
      .filter(isEligibleForSync)
      .sort((a, b) => new Date(a.createdAtUtc).getTime() - new Date(b.createdAtUtc).getTime());

    const batch = eligible.slice(0, BATCH_SIZE_LIMIT);
    if (batch.length === 0) {
      return { sent: 0, succeeded: 0, failed: 0 };
    }

    // Mark as in-flight
    const inFlightTime = new Date().toISOString();
    for (const item of batch) {
      item.status = 'in-flight';
      item.updatedAtUtc = inFlightTime;
      await saveOutboxEntry(item);
    }
    await notifyListeners(tenantId);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-tenant-id': tenantId,
    };

    const token = authToken || activeAuthToken;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    // Attach deviceId if present in storage
    if (typeof localStorage !== 'undefined') {
      const localDeviceId =
        localStorage.getItem('mitrixogym_device_id') ||
        localStorage.getItem('strike_device_id') ||
        localStorage.getItem('deviceId');
      if (localDeviceId) {
        headers['x-device-id'] = localDeviceId;
      }
    }

    let response: Response;
    try {
      response = await fetch('/api/desktop/sync/push', {
        method: 'POST',
        headers,
        body: JSON.stringify({ batch }),
      });
    } catch (netErr: any) {
      const errStr = netErr instanceof Error ? netErr.message : String(netErr);
      const failTime = new Date().toISOString();
      for (const item of batch) {
        item.status = 'failed';
        item.retryCount += 1;
        item.lastError = `Network failure: ${errStr}`;
        item.updatedAtUtc = failTime;
        await saveOutboxEntry(item);
      }
      await notifyListeners(tenantId);
      return { sent: batch.length, succeeded: 0, failed: batch.length };
    }

    if (!response.ok) {
      let errorMsg = `Server error ${response.status}: ${response.statusText}`;
      try {
        const errorJson = await response.json();
        if (errorJson?.message || errorJson?.error) {
          errorMsg = errorJson.message || errorJson.error;
        }
      } catch {
        // Response was not JSON
      }

      const failTime = new Date().toISOString();
      for (const item of batch) {
        item.status = 'failed';
        item.retryCount += 1;
        item.lastError = errorMsg;
        item.updatedAtUtc = failTime;
        await saveOutboxEntry(item);
      }
      await notifyListeners(tenantId);
      return { sent: batch.length, succeeded: 0, failed: batch.length };
    }

    const data = await response.json();
    const results: Array<{
      operationId: string;
      status: 'acknowledged' | 'failed' | 'conflict' | string;
      reason?: string;
      error?: string;
    }> = Array.isArray(data?.results) ? data.results : [];

    const resultsMap = new Map(results.map((r) => [r.operationId, r]));

    let succeeded = 0;
    let failed = 0;
    const finishTime = new Date().toISOString();

    for (const item of batch) {
      const res = resultsMap.get(item.operationId);
      if (res && res.status === 'acknowledged') {
        await deleteOutboxEntry(item.operationId);
        succeeded++;
      } else {
        item.status = 'failed';
        item.retryCount += 1;
        item.lastError =
          res?.reason ||
          res?.error ||
          (res ? `Status: ${res.status}` : 'No result returned for operation');
        item.updatedAtUtc = finishTime;
        await saveOutboxEntry(item);
        failed++;
      }
    }

    await notifyListeners(tenantId);
    return { sent: batch.length, succeeded, failed };
  } finally {
    inFlightFlushes.delete(tenantId);
  }
}

/**
 * Scans the outbox for any tenants with pending items and triggers flush.
 */
async function autoFlushAllPendingTenants(): Promise<void> {
  try {
    const all = await getAllOutboxEntries();
    const pendingTenants = new Set(
      all
        .filter((e) => e.status === 'pending' || e.status === 'failed')
        .map((e) => e.tenantId)
    );

    for (const tenantId of pendingTenants) {
      await flushOutbox(tenantId, activeAuthToken || undefined);
    }
  } catch (err) {
    console.warn('[OutboxProcessor] Online auto-flush inspection failed:', err);
  }
}

// Attach automatic event listener on browser online event
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => {
    autoFlushAllPendingTenants().catch((err) => {
      console.warn('[OutboxProcessor] Online event handler error:', err);
    });
  });
}
