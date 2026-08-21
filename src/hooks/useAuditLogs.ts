import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { AuditLog, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { subYears, formatISO } from 'date-fns';

const PRIVILEGED_ROLES = new Set(['manager', 'admin', 'super_admin', 'crm_admin']);
const MAX_FETCH = 5000; // safety cap

export interface AuditLogQueryParams {
  dateFrom: string; // 'yyyy-MM-dd'
  dateTo: string;   // 'yyyy-MM-dd'
  entityId?: string; // filter by entityId (e.g. per-client history)
}

export const useAuditLogs = (currentUser: User | null, params: AuditLogQueryParams) => {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async () => {
    if (!currentUser || !PRIVILEGED_ROLES.has(currentUser.role)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Convert a local "yyyy-MM-dd" date string to an ISO UTC string representing
      // midnight / end-of-day in Egypt time (Africa/Cairo = UTC+3).
      // e.g. "2026-05-04" start-of-day in Cairo = "2026-05-03T21:00:00.000Z"
      function egyptDayBoundary(dateStr: string, endOfDay: boolean): string {
        // Cairo is UTC+3 (no DST). Midnight Cairo = UTC-3h.
        const offsetMs = 3 * 60 * 60 * 1000;
        const [y, m, d] = dateStr.split('-').map(Number) as [number, number, number];
        const localMidnight = new Date(Date.UTC(y, m - 1, d)); // midnight UTC for that date string
        if (endOfDay) {
          return new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000 - offsetMs - 1).toISOString(); // 23:59:59.999 Cairo
        }
        return new Date(localMidnight.getTime() - offsetMs).toISOString(); // 00:00:00.000 Cairo
      }

      const fromISO = params.dateFrom
        ? egyptDayBoundary(params.dateFrom, false)
        : formatISO(subYears(new Date(), 1));
      const toISO = params.dateTo
        ? egyptDayBoundary(params.dateTo, true)
        : formatISO(new Date());

      const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
      const { db } = await import('../firebase');
      
      let q = query(
        collection(db, 'auditLogs'),
        where('timestamp', '>=', fromISO),
        where('timestamp', '<=', toISO),
        orderBy('timestamp', 'desc'),
        limit(MAX_FETCH)
      );
      
      if (params.entityId) {
        q = query(q, where('entityId', '==', params.entityId));
      }

      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as AuditLog[];
      setAuditLogs(data);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      handleFirestoreError(error, OperationType.LIST, 'auditLogs');
    } finally {
      setLoading(false);
    }
  }, [currentUser, params.dateFrom, params.dateTo, params.entityId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { auditLogs, loading, refresh: fetchLogs };
};
