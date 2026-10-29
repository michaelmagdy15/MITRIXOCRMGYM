import { useState, useEffect, useCallback } from 'react';
import { auth } from '../firebase';
import { AuditLog, User } from '../types';
import { handleFirestoreError, OperationType } from '../utils/errorHandler';
import { subYears, formatISO } from 'date-fns';
import { getGymDayBoundaryUtc } from '../utils/dateUtils';

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
      // Accurately compute Cairo day boundaries dynamically deriving Egypt DST (UTC+3 summer / UTC+2 winter)
      const fromISO = params.dateFrom
        ? getGymDayBoundaryUtc(params.dateFrom, false)
        : formatISO(subYears(new Date(), 1));
      const toISO = params.dateTo
        ? getGymDayBoundaryUtc(params.dateTo, true)
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

      const snapshot = await getDocs(q);
      let logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog));

      // In-memory filter for entityId if provided
      if (params.entityId) {
        logs = logs.filter(log => log.entityId === params.entityId);
      }

      setAuditLogs(logs);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'auditLogs');
    } finally {
      setLoading(false);
    }
  }, [currentUser?.role, params.dateFrom, params.dateTo, params.entityId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return { auditLogs, loading, refetch: fetchLogs, refresh: fetchLogs };
};
