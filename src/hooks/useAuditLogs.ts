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

      const token = await auth.currentUser?.getIdToken();
      const url = new URL('/api/audit-logs', window.location.origin);
      url.searchParams.append('fromISO', fromISO);
      url.searchParams.append('toISO', toISO);
      url.searchParams.append('limit', MAX_FETCH.toString());

      const res = await fetch(url.toString(), {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.auditLogs || []);
      }
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      handleFirestoreError(error, OperationType.LIST, 'auditLogs');
    } finally {
      setLoading(false);
    }
  }, [currentUser, params.dateFrom, params.dateTo]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { auditLogs, loading, refresh: fetchLogs };
};
