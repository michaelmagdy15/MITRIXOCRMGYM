import { useState, useEffect, useCallback, useRef } from 'react';
import { getLocalDb, saveMembers, searchMembersLocal } from '../services/localDb/gymLocalDb';
import { fetchActiveMembersPage, PaginatedResult } from '../services/clientPaginationService';
import { Client } from '../types';
import { getTenantId } from '../firebase';
import { QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';

export interface UseFastMembersResult {
  members: Client[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  searchLocal: (query: string) => Promise<Client[]>;
}

/**
 * Zero-latency hook for listing members.
 * Reads instantly from local IndexedDB cache (< 10ms) to ensure smooth operation on mobile & low-end devices.
 * Fetches small paginated batches from Firestore to minimize database read charges.
 */
export function useFastMembers(pageSize = 50): UseFastMembersResult {
  const [members, setMembers] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const lastVisibleRef = useRef<QueryDocumentSnapshot<DocumentData> | null>(null);
  const tenantId = getTenantId();

  // 1. Instant Cache Hit from local IndexedDB
  useEffect(() => {
    let active = true;

    async function loadFromCache() {
      try {
        const localDb = await getLocalDb(tenantId);
        const cached = await localDb.getAll('members');
        if (active && cached && cached.length > 0) {
          setMembers(cached as unknown as Client[]);
          setLoading(false);
        }
      } catch (err) {
        console.warn('[useFastMembers] Local cache read warning:', err);
      }

      // 2. Fetch first small batch from network
      try {
        const result: PaginatedResult<Client> = await fetchActiveMembersPage(null, pageSize);
        if (active) {
          lastVisibleRef.current = result.lastVisible;
          setHasMore(result.hasMore);
          if (result.data.length > 0) {
            setMembers(prev => (prev.length === 0 ? result.data : prev));
            saveMembers(tenantId, result.data).catch(() => {});
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('[useFastMembers] Network fetch failed:', err);
        if (active) setLoading(false);
      }
    }

    loadFromCache();
    return () => {
      active = false;
    };
  }, [tenantId, pageSize]);

  // 3. Load next page cursor
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !lastVisibleRef.current) return;
    setLoadingMore(true);

    try {
      const result = await fetchActiveMembersPage(lastVisibleRef.current, pageSize);
      lastVisibleRef.current = result.lastVisible;
      setHasMore(result.hasMore);

      if (result.data.length > 0) {
        setMembers(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const fresh = result.data.filter(m => !existingIds.has(m.id));
          return [...prev, ...fresh];
        });
        saveMembers(tenantId, result.data).catch(() => {});
      }
    } catch (err) {
      console.error('[useFastMembers] loadMore failed:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, pageSize, tenantId]);

  // 4. Local fast search (< 5ms)
  const searchLocal = useCallback(async (q: string): Promise<Client[]> => {
    if (!q || q.trim() === '') return members;
    try {
      const matches = await searchMembersLocal(tenantId, q);
      return matches as unknown as Client[];
    } catch {
      return members.filter(m => 
        (m.name && m.name.toLowerCase().includes(q.toLowerCase())) ||
        (m.phone && m.phone.includes(q))
      );
    }
  }, [members, tenantId]);

  return {
    members,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    searchLocal,
  };
}
