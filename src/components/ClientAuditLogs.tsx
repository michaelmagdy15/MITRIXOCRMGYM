import React from 'react';
import { User } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { useAuditLogs } from '../hooks/useAuditLogs';
import { User as UserType } from '../types';

const safeFormatDate = (dateStr: any, formatStr: string, fallback: string = '—') => {
  if (!dateStr) return fallback;
  try {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) {
      const d = new Date(dateStr);
      if (isValid(d)) return format(d, formatStr);
      return fallback;
    }
    return format(parsed, formatStr);
  } catch (error) {
    return fallback;
  }
};

interface ClientAuditLogsProps {
  clientId: string;
  currentUser: UserType | null;
  mode?: 'logs' | 'points';
}

export function ClientAuditLogs({ clientId, currentUser, mode = 'logs' }: ClientAuditLogsProps) {
  const { auditLogs, loading } = useAuditLogs(currentUser, { dateFrom: '', dateTo: '', entityId: clientId });

  if (mode === 'points') {
    const pointsLogs = (auditLogs || []).filter(
      (log) =>
        log.entityId === clientId &&
        log.details &&
        (log.details.toLowerCase().includes('points') || log.details.toLowerCase().includes('pts'))
    );

    return (
      <div className="max-h-40 overflow-y-auto space-y-1.5 text-xs custom-scrollbar">
        {loading ? (
          <p className="text-xs text-muted-foreground italic text-center py-4">Loading…</p>
        ) : pointsLogs.length > 0 ? (
          pointsLogs.map((log) => (
            <div key={log.id} className="bg-background p-2.5 rounded border flex justify-between gap-4">
              <p className="text-muted-foreground leading-snug">{log.details}</p>
              <span className="text-[9px] text-muted-foreground shrink-0">{safeFormatDate(log.timestamp, 'dd MMM yyyy')}</span>
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground italic text-center py-4">No point transactions logged.</p>
        )}
      </div>
    );
  }

  const clientLogs = (auditLogs || []).filter((log) => log.entityId === clientId);

  return (
    <div className="h-72 overflow-y-auto space-y-2 custom-scrollbar">
      {loading ? (
        <p className="text-xs text-muted-foreground italic text-center py-10">Loading…</p>
      ) : clientLogs.length > 0 ? (
        clientLogs
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .map((log) => (
            <div key={log.id} className="bg-muted/20 p-3 rounded-lg border text-xs space-y-1">
              <div className="flex justify-between items-center text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground/80 flex items-center gap-1">
                  <User className="h-3.5 w-3.5" />
                  {log.userName || 'System'} ({log.action})
                </span>
                <span>{safeFormatDate(log.timestamp, 'MMM d yyyy, h:mm a')}</span>
              </div>
              <p className="text-muted-foreground">{log.details}</p>
            </div>
          ))
      ) : (
        <p className="text-xs text-muted-foreground italic text-center py-10">No audit events logged for this member.</p>
      )}
    </div>
  );
}
