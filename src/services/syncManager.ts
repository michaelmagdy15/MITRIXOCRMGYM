import { flushOutbox } from './outbox/outboxProcessor';
import {
  getSyncCursor,
  setSyncCursor,
  saveMembers,
  savePackages,
} from './localDb/gymLocalDb';

export interface SyncResult {
  pushed: number;
  pulled: number;
  success: boolean;
}

const activeSyncTenants = new Set<string>();

/**
 * Executes a single immediate sync pass:
 * 1. Checks navigator.onLine (returns failure if offline).
 * 2. Fetches optional auth token.
 * 3. Flushes pending outbox operations to backend.
 * 4. Pulls delta changes from /api/desktop/sync/pull using current sync cursor.
 * 5. Saves extracted members and packages to local IndexedDB.
 * 6. Updates local sync cursor to serverTime.
 */
export async function syncNow(
  tenantId: string,
  getAuthToken?: () => Promise<string | null>
): Promise<SyncResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { pushed: 0, pulled: 0, success: false };
  }

  if (activeSyncTenants.has(tenantId)) {
    return { pushed: 0, pulled: 0, success: false };
  }

  activeSyncTenants.add(tenantId);

  let pushed = 0;
  let pulled = 0;

  try {
    let token: string | undefined;
    if (getAuthToken) {
      try {
        const fetched = await getAuthToken();
        if (fetched) {
          token = fetched;
        }
      } catch {
        // Ignore token resolution error and proceed
      }
    }

    // Step 1: Flush outbox
    try {
      const flushRes = await flushOutbox(tenantId, token);
      pushed = flushRes?.succeeded ?? flushRes?.sent ?? 0;
    } catch {
      // Continue to pull even if outbox flush experienced an error
    }

    // Step 2: Pull delta changes from server
    const currentCursor = (await getSyncCursor(tenantId)) || '';
    const url = `/api/desktop/sync/pull?cursor=${encodeURIComponent(currentCursor)}&limit=500`;

    const headers: Record<string, string> = {
      'x-tenant-id': tenantId,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
    });

    if (!res.ok) {
      return { pushed, pulled: 0, success: false };
    }

    const data = await res.json();
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    pulled = items.length;

    const members: any[] = [];
    const packages: any[] = [];

    for (const item of items) {
      if (!item) continue;
      const record = item.data ? { ...item.data, id: item.id || item.data.id } : item;
      const type = item.entityType || item.type;

      if (type === 'member' || type === 'client') {
        members.push(record);
      } else if (type === 'package') {
        packages.push(record);
      }
    }

    if (members.length > 0) {
      await saveMembers(tenantId, members);
    }
    if (packages.length > 0) {
      await savePackages(tenantId, packages);
    }

    const newCursor = data?.serverTime || new Date().toISOString();
    await setSyncCursor(tenantId, newCursor);

    return {
      pushed,
      pulled,
      success: true,
    };
  } catch {
    // Fail silently on network error / dropout without throwing or alerting user
    return { pushed, pulled: 0, success: false };
  } finally {
    activeSyncTenants.delete(tenantId);
  }
}

/**
 * Starts continuous autonomous background delta-sync heartbeat for the specified tenant.
 * - Runs sync on a timer (default 60 seconds).
 * - Listens for window 'focus' events.
 * - Returns a cleanup function stopBackgroundSync().
 */
export function startBackgroundSync(
  tenantId: string,
  getAuthToken?: () => Promise<string | null>,
  intervalMs: number = 60000
): () => void {
  const runSyncOnce = async (): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return;
    }
    try {
      await syncNow(tenantId, getAuthToken);
    } catch {
      // Fail silently without throwing or alerting user
    }
  };

  const timerId = setInterval(runSyncOnce, intervalMs);

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('focus', runSyncOnce);
  }

  return function stopBackgroundSync(): void {
    clearInterval(timerId);
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('focus', runSyncOnce);
    }
  };
}
