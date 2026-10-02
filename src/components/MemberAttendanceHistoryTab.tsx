import React, { useState, useEffect, useMemo } from 'react';
import { Client, AttendanceRecord } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Download, Search, History, Calendar, CheckCircle2, AlertCircle, XCircle, RefreshCw } from 'lucide-react';
import { format, isValid } from 'date-fns';
import { toast } from 'sonner';

interface MemberAttendanceHistoryTabProps {
  client: Client;
}

export const MemberAttendanceHistoryTab: React.FC<MemberAttendanceHistoryTabProps> = ({ client }) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ATTENDED' | 'NO_SHOW' | 'CANCELLED'>('ALL');

  useEffect(() => {
    if (!client?.id) return;
    setLoading(true);

    const recordMap = new Map<string, AttendanceRecord>();

    // 1. Listen to subcollection clients/{clientId}/attendance_history
    const subColRef = collection(db, 'clients', client.id, 'attendance_history');
    const unsubSubCol = onSnapshot(subColRef, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as AttendanceRecord;
        recordMap.set(docSnap.id, {
          ...data,
          id: docSnap.id,
          memberId: data.memberId || client.id,
          remainingCreditsAfter: typeof data.remainingCreditsAfter === 'number' ? data.remainingCreditsAfter : (client.sessionsRemaining as any) || 0
        });
      });
      updateSortedList();
      setLoading(false);
    }, (err) => {
      console.warn('[AttendanceHistory] Subcollection listen error:', err);
      setLoading(false);
    });

    // 2. Also listen to top-level attendance_logs for this member
    const logsQuery = query(collection(db, 'attendance_logs'), where('memberId', '==', client.id));
    const unsubLogs = onSnapshot(logsQuery, (snapshot) => {
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as AttendanceRecord;
        recordMap.set(docSnap.id, {
          ...data,
          id: docSnap.id,
          memberId: data.memberId || client.id,
          remainingCreditsAfter: typeof data.remainingCreditsAfter === 'number' ? data.remainingCreditsAfter : (client.sessionsRemaining as any) || 0
        });
      });
      updateSortedList();
    }, (err) => {
      console.warn('[AttendanceHistory] Logs listen error:', err);
    });

    // 3. Fallback: check legacy attendances collection
    const legacyQuery = query(collection(db, 'attendance'), where('clientId', '==', client.id));
    getDocs(legacyQuery).then((snapshot) => {
      snapshot.forEach((docSnap) => {
        if (!recordMap.has(docSnap.id)) {
          const data = docSnap.data();
          recordMap.set(docSnap.id, {
            id: docSnap.id,
            memberId: client.id,
            sessionTitle: data.sessionTitle || data.packageName || 'General Check-In',
            branchName: data.branch || client.branch || 'Maxim Compound',
            sessionDate: data.date ? String(data.date).substring(0, 10) : '',
            checkedInAt: data.date || new Date().toISOString(),
            checkedInBy: data.recordedBy || 'Front Desk',
            status: (data.status || 'ATTENDED').toUpperCase(),
            remainingCreditsAfter: typeof data.remainingCreditsAfter === 'number' ? data.remainingCreditsAfter : (typeof client.sessionsRemaining === 'number' ? client.sessionsRemaining : 0)
          });
        }
      });
      updateSortedList();
    }).catch((err) => {
      console.warn('[AttendanceHistory] Legacy attendances query error:', err);
    });

    const updateSortedList = () => {
      const list = Array.from(recordMap.values()).sort((a, b) => {
        const timeA = new Date(a.checkedInAt || a.sessionDate || 0).getTime();
        const timeB = new Date(b.checkedInAt || b.sessionDate || 0).getTime();
        return timeB - timeA;
      });
      setRecords(list);
    };

    return () => {
      unsubSubCol();
      unsubLogs();
    };
  }, [client?.id]);

  // Formatter for Date & Time: DD/MM/YYYY - hh:mm A
  const formatDateTime = (dateStr?: string): string => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isValid(d)) {
        return format(d, 'dd/MM/yyyy - hh:mm a');
      }
    } catch {
      // ignore
    }
    return dateStr;
  };

  // Status Badge Rendering
  const renderStatusBadge = (status?: string) => {
    const upper = (status || 'ATTENDED').toUpperCase();
    if (upper === 'ATTENDED') {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold py-0.5 px-2">
          <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Attended
        </Badge>
      );
    }
    if (upper === 'NO_SHOW' || upper === 'NO SHOW') {
      return (
        <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[10px] font-bold py-0.5 px-2">
          <XCircle className="h-3 w-3 mr-1 inline" /> No Show
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[10px] font-bold py-0.5 px-2">
        <AlertCircle className="h-3 w-3 mr-1 inline" /> Late Cancel
      </Badge>
    );
  };

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchesSearch =
        (r.sessionTitle || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.branchName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.checkedInBy || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (r.sessionDate || '').includes(searchTerm);

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ATTENDED' && (r.status === 'ATTENDED' || !r.status)) ||
        (statusFilter === 'NO_SHOW' && r.status === 'NO_SHOW') ||
        (statusFilter === 'CANCELLED' && r.status === 'CANCELLED');

      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  // Export Attendance CSV
  const handleExportCsv = () => {
    if (records.length === 0) {
      toast.error('No attendance records available to export.');
      return;
    }

    try {
      const headers = ['Date & Time', 'Class Name', 'Branch', 'Status', 'Remaining Credits', 'Checked In By', 'Session Date', 'Session Time', 'Record ID'];

      const escapeCell = (val: any) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      };

      const rows = records.map((r) => [
        escapeCell(formatDateTime(r.checkedInAt)),
        escapeCell(r.sessionTitle || 'Class Session'),
        escapeCell(r.branchName || 'Maxim Compound'),
        escapeCell(r.status || 'ATTENDED'),
        escapeCell(typeof r.remainingCreditsAfter === 'number' ? r.remainingCreditsAfter : '—'),
        escapeCell(r.checkedInBy || 'Staff'),
        escapeCell(r.sessionDate || ''),
        escapeCell(r.sessionTime || ''),
        escapeCell(r.id)
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const clientSlug = (client.name || 'member').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
      const dateSlug = format(new Date(), 'yyyyMMdd_HHmm');
      link.setAttribute('href', url);
      link.setAttribute('download', `attendance_${clientSlug}_${dateSlug}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Exported ${records.length} attendance records to CSV.`);
    } catch (err: any) {
      console.error('Error exporting attendance CSV:', err);
      toast.error('Failed to export CSV. Please try again.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl border bg-muted/20">
        <div>
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-black uppercase tracking-wider text-foreground">
              Attendance & Session History
            </h4>
            <Badge variant="secondary" className="text-[10px] font-bold bg-primary/10 text-primary border-none">
              {records.length} {records.length === 1 ? 'Record' : 'Records'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Itemized audit trail of class attendance and session deductions for {client.name}.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={records.length === 0}
            className="h-8 text-xs font-bold gap-1.5 rounded-xl border-border hover:bg-primary hover:text-primary-foreground transition-all w-full sm:w-auto shadow-xs"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Attendance (CSV)</span>
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search class, branch, staff..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8 text-xs rounded-xl border-border bg-background"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end overflow-x-auto">
          {(['ALL', 'ATTENDED', 'NO_SHOW', 'CANCELLED'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap border ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {status === 'ALL' ? 'All' : status === 'ATTENDED' ? 'Attended' : status === 'NO_SHOW' ? 'No Show' : 'Late Cancel'}
            </button>
          ))}
        </div>
      </div>

      {/* Responsive Data Table */}
      <div className="rounded-xl border bg-background overflow-hidden shadow-xs">
        <div className="overflow-x-auto max-h-[460px] overflow-y-auto custom-scrollbar">
          <Table>
            <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur-xs">
              <TableRow className="border-b border-border">
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-muted-foreground">
                  Date & Time
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-muted-foreground">
                  Class Name
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-muted-foreground">
                  Branch
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-center text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-center text-muted-foreground">
                  Remaining Credits
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-wider py-3 px-3 text-right text-muted-foreground">
                  Checked In By
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-xs text-muted-foreground">
                    <RefreshCw className="h-4 w-4 animate-spin inline mr-2 text-primary" />
                    Loading attendance audit history...
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-xs text-muted-foreground italic">
                    {searchTerm || statusFilter !== 'ALL'
                      ? 'No attendance records match your filter criteria.'
                      : 'No attendance or session check-ins recorded for this member yet.'}
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record) => (
                  <TableRow key={record.id} className="hover:bg-muted/20 border-b border-border/60 transition-colors">
                    {/* Date & Time: Formatted as DD/MM/YYYY - hh:mm A */}
                    <TableCell className="py-2.5 px-3 text-xs font-mono font-medium text-foreground whitespace-nowrap">
                      {formatDateTime(record.checkedInAt)}
                    </TableCell>

                    {/* Class Name */}
                    <TableCell className="py-2.5 px-3 text-xs font-bold text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[180px]">{record.sessionTitle || 'Class Session'}</span>
                      </div>
                    </TableCell>

                    {/* Branch */}
                    <TableCell className="py-2.5 px-3 text-xs text-muted-foreground capitalize whitespace-nowrap">
                      {record.branchName || 'Maxim Compound'}
                    </TableCell>

                    {/* Status Badge */}
                    <TableCell className="py-2.5 px-3 text-center whitespace-nowrap">
                      {renderStatusBadge(record.status)}
                    </TableCell>

                    {/* Remaining Credits: Balance snapshot after deduction */}
                    <TableCell className="py-2.5 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-xs font-mono font-bold text-foreground">
                        <span>{typeof record.remainingCreditsAfter === 'number' ? record.remainingCreditsAfter : '—'}</span>
                        <span className="text-[10px] text-muted-foreground font-normal">left</span>
                      </div>
                    </TableCell>

                    {/* Checked In By */}
                    <TableCell className="py-2.5 px-3 text-xs text-muted-foreground text-right whitespace-nowrap">
                      {record.checkedInBy || 'Staff'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
