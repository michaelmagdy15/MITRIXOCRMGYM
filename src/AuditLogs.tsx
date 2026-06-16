import React, { useState, useMemo, useCallback } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useAuditLogs } from './hooks/useAuditLogs';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format, parseISO, subYears, subDays } from 'date-fns';
import { AuditLog, Branch } from './types';
import { MapPin, Search, Filter, ShieldAlert, History, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Archive, Download, Trash2 } from 'lucide-react';
import { collection, getDocs, query, where, orderBy, writeBatch, doc } from 'firebase/firestore';
import { db } from './firebase';

const OWNER_EMAILS = ['michaelmitry13@gmail.com', 'magd.gallab@gmail.com'];

async function fetchAndArchiveOldLogs(cutoffDays: number): Promise<{ logs: AuditLog[]; count: number }> {
  const cutoff = subDays(new Date(), cutoffDays).toISOString();
  const q = query(
    collection(db, 'auditLogs'),
    where('timestamp', '<', cutoff),
    orderBy('timestamp', 'desc')
  );
  const snap = await getDocs(q);
  const logs = snap.docs.map(d => ({ ...d.data(), id: d.id } as AuditLog));
  return { logs, count: snap.docs.length };
}

async function deleteLogsFromFirestore(logs: AuditLog[]): Promise<void> {
  const BATCH_SIZE = 400;
  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    logs.slice(i, i + BATCH_SIZE).forEach(log => {
      batch.delete(doc(db, 'auditLogs', log.id));
    });
    await batch.commit();
  }
}

function downloadJSON(data: AuditLog[], cutoffDays: number): void {
  const cutoffDate = format(subDays(new Date(), cutoffDays), 'yyyy-MM-dd');
  const today = format(new Date(), 'yyyy-MM-dd');
  const filename = `mitrixogymcrm-audit-archive_before-${cutoffDate}_exported-${today}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 20;

function getActionBadge(action: AuditLog['action']) {
  switch (action) {
    case 'CREATE': return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-none text-[11px]">Create</Badge>;
    case 'UPDATE': return <Badge className="bg-blue-500 hover:bg-blue-600 text-white border-none text-[11px]">Update</Badge>;
    case 'DELETE': return <Badge variant="destructive" className="text-[11px]">Delete</Badge>;
    default: return <Badge variant="secondary" className="text-[11px]">{action}</Badge>;
  }
}

function getEntityBadge(entity: AuditLog['entityType']) {
  switch (entity) {
    case 'CLIENT': return <Badge variant="outline" className="border-blue-200 text-blue-700 bg-blue-50 text-[11px]">Client</Badge>;
    case 'LEAD': return <Badge variant="outline" className="border-amber-200 text-amber-700 bg-amber-50 text-[11px]">Lead</Badge>;
    case 'PAYMENT': return <Badge variant="outline" className="border-green-200 text-green-700 bg-green-50 text-[11px]">Payment</Badge>;
    case 'PACKAGE_RECORD': return <Badge variant="outline" className="border-purple-200 text-purple-700 bg-purple-50 text-[11px]">Package</Badge>;
    case 'TARGET': return <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 text-[11px]">Target</Badge>;
    case 'ATTENDANCE': return <Badge variant="outline" className="border-pink-200 text-pink-700 bg-pink-50 text-[11px]">Attendance</Badge>;
    default: return <Badge variant="outline" className="text-[11px]">{entity}</Badge>;
  }
}

const selectClass = "flex h-10 w-full rounded-md border border-muted bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring appearance-none";

export default function AuditLogs() {
  const { currentUser, users, allUsers } = useAuth();
  const canAccess =
    currentUser?.role === 'manager' ||
    currentUser?.role === 'admin' ||
    currentUser?.role === 'super_admin' ||
    currentUser?.role === 'crm_admin' ||
    !!currentUser?.can_access_settings_and_history;

  const isOwner = OWNER_EMAILS.includes(currentUser?.email || '');

  // Archive state
  const [archiveCutoff, setArchiveCutoff] = useState(30);
  const [archiveStatus, setArchiveStatus] = useState<'idle' | 'fetching' | 'confirm' | 'deleting' | 'done'>('idle');
  const [archiveLogs, setArchiveLogs] = useState<AuditLog[]>([]);
  const [archiveError, setArchiveError] = useState('');

  const handleArchiveFetch = async () => {
    setArchiveStatus('fetching');
    setArchiveError('');
    try {
      const { logs } = await fetchAndArchiveOldLogs(archiveCutoff);
      setArchiveLogs(logs);
      if (logs.length === 0) {
        setArchiveError(`No logs older than ${archiveCutoff} days found.`);
        setArchiveStatus('idle');
      } else {
        downloadJSON(logs, archiveCutoff);
        setArchiveStatus('confirm');
      }
    } catch (e) {
      setArchiveError('Failed to fetch logs. Check your connection.');
      setArchiveStatus('idle');
    }
  };

  const handleArchiveDelete = async () => {
    setArchiveStatus('deleting');
    try {
      await deleteLogsFromFirestore(archiveLogs);
      setArchiveStatus('done');
      setArchiveLogs([]);
      refresh();
    } catch (e) {
      setArchiveError('Delete failed. Some records may still exist.');
      setArchiveStatus('confirm');
    }
  };

  // Date range — default last 1 year
  const defaultFrom = format(subYears(new Date(), 1), 'yyyy-MM-dd');
  const defaultTo = format(new Date(), 'yyyy-MM-dd');
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(defaultTo);

  // Query params only update on Apply (or on mount)
  const [queryParams, setQueryParams] = useState({ dateFrom: defaultFrom, dateTo: defaultTo });

  const { auditLogs, loading, refresh } = useAuditLogs(currentUser, queryParams);

  // Client-side filters
  const [entityFilter, setEntityFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [branchFilter, setBranchFilter] = useState<Branch | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Page state resets to 1 when filters change
  const [currentPage, setCurrentPage] = useState(1);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  const filteredLogs = useMemo(() => {
    let result = auditLogs.filter(log => {
      if (entityFilter !== 'ALL' && log.entityType !== entityFilter) return false;
      if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
      if (branchFilter !== 'ALL' && log.branch !== branchFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!log.details?.toLowerCase().includes(term)) return false;
      }
      return true;
    });

    if (sortDir === 'asc') result = [...result].reverse();
    return result;
  }, [auditLogs, entityFilter, actionFilter, branchFilter, searchTerm, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filteredLogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleApply = () => {
    setQueryParams({ dateFrom, dateTo });
    resetPage();
  };

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <ShieldAlert className="h-16 w-16 text-destructive opacity-20" />
        <h2 className="text-2xl font-bold">Access Restricted</h2>
        <p className="text-muted-foreground max-w-md">
          System history is exclusively visible to Atef (Sales Manager).
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">System History</h2>
          <p className="text-muted-foreground text-sm">Track all activities and changes across branches.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => { refresh(); resetPage(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading…' : 'Refresh'}
          </Button>
          {isOwner && (
            <Button
              variant="outline"
              size="sm"
              className="border-amber-500/40 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={() => setArchiveStatus(s => s === 'idle' ? 'fetching' : 'idle')}
              disabled={archiveStatus === 'fetching' || archiveStatus === 'deleting'}
            >
              <Archive className="h-4 w-4 mr-2" />
              Export & Archive
            </Button>
          )}
        </div>
      </div>

      {/* Archive Panel — owners only */}
      {isOwner && archiveStatus !== 'idle' && (
        <div className="rounded-xl border border-amber-400/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
            <Archive className="h-4 w-4" />
            Export & Archive Audit Logs
          </div>

          {archiveStatus === 'fetching' && (
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Archive logs older than</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={7} max={365}
                    className="h-9 w-24 text-sm"
                    value={archiveCutoff}
                    onChange={e => setArchiveCutoff(Number(e.target.value))}
                  />
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              </div>
              <Button size="sm" className="h-9 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleArchiveFetch}>
                <Download className="h-4 w-4 mr-2" />
                Download JSON
              </Button>
              <Button size="sm" variant="ghost" className="h-9" onClick={() => setArchiveStatus('idle')}>
                Cancel
              </Button>
            </div>
          )}

          {archiveStatus === 'confirm' && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ✅ <strong>{archiveLogs.length.toLocaleString()} records</strong> downloaded successfully.
                Now you can delete them from Firestore to free up space.
              </p>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleArchiveDelete}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete {archiveLogs.length.toLocaleString()} records from Firestore
                </Button>
                <Button size="sm" variant="outline" onClick={() => setArchiveStatus('idle')}>
                  Keep in Firestore
                </Button>
              </div>
            </div>
          )}

          {archiveStatus === 'deleting' && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" />
              Deleting {archiveLogs.length.toLocaleString()} records from Firestore…
            </p>
          )}

          {archiveStatus === 'done' && (
            <p className="text-sm text-emerald-600 font-semibold">
              ✅ Archive complete. Firestore cleaned up. The downloaded file is your permanent record.
            </p>
          )}

          {archiveError && (
            <p className="text-sm text-destructive">{archiveError}</p>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-muted/30 border rounded-xl p-4 space-y-3">
        {/* Row 1: Date range */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 flex-1 min-w-[130px]">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">From Date</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="h-10 bg-background border-muted text-sm"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[130px]">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">To Date</label>
            <Input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="h-10 bg-background border-muted text-sm"
            />
          </div>
          <Button onClick={handleApply} disabled={loading} className="h-10 px-5">
            Apply
          </Button>
        </div>

        {/* Row 2: Entity / Action / Branch / Search */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search */}
          <div className="space-y-1 col-span-2 md:col-span-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search details…"
                className="pl-9 h-10 bg-background border-muted text-sm"
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); resetPage(); }}
              />
            </div>
          </div>

          {/* Entity */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Category</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <select
                className={selectClass}
                value={entityFilter}
                onChange={e => { setEntityFilter(e.target.value); resetPage(); }}
              >
                <option value="ALL">All Categories</option>
                <option value="CLIENT">Clients</option>
                <option value="LEAD">Leads</option>
                <option value="PAYMENT">Payments</option>
                <option value="PACKAGE_RECORD">Packages</option>
                <option value="ATTENDANCE">Attendance</option>
                <option value="TARGET">Sales Targets</option>
              </select>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Action</label>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <select
                className={selectClass}
                value={actionFilter}
                onChange={e => { setActionFilter(e.target.value); resetPage(); }}
              >
                <option value="ALL">All Actions</option>
                <option value="CREATE">Created</option>
                <option value="UPDATE">Updated</option>
                <option value="DELETE">Deleted</option>
              </select>
            </div>
          </div>

          {/* Branch */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">Branch</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <select
                className={selectClass}
                value={branchFilter}
                onChange={e => { setBranchFilter(e.target.value as any); resetPage(); }}
              >
                <option value="ALL">All Branches</option>
                <option value="COMPLEX">COMPLEX</option>
                <option value="MIVIDA">MIVIDA</option>
                <option value="mitrixogymcrm IMPACT">mitrixogymcrm IMPACT</option>
              </select>
            </div>
          </div>
        </div>

        {/* Sort + result count */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs text-muted-foreground">
            {loading ? 'Loading…' : `${filteredLogs.length.toLocaleString()} records found`}
          </p>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground">Sort</label>
            <select
              className="h-8 rounded-md border border-muted bg-background px-2 text-xs focus:outline-none"
              value={sortDir}
              onChange={e => { setSortDir(e.target.value as 'desc' | 'asc'); resetPage(); }}
            >
              <option value="desc">Newest First</option>
              <option value="asc">Oldest First</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card className="border-none shadow-md shadow-primary/5">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="w-[155px]">Timestamp</TableHead>
                  <TableHead className="w-[140px]">Team Member</TableHead>
                  <TableHead className="w-[90px]">Action</TableHead>
                  <TableHead className="w-[110px]">Category</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[110px]">Branch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 opacity-30" />
                      Loading history…
                    </TableCell>
                  </TableRow>
                ) : paginated.length > 0 ? (
                  paginated.map(log => {
                    // Resolution hierarchy: 
                    // 1. Static name stored in the log (new format)
                    // 2. Lookup in allUsers (including non-deduplicated/backup records)
                    // 3. Lookup in deduplicated users (fallback)
                    const resolvedName = log.userName || 
                                       allUsers.find(u => u.id === log.userId)?.name || 
                                       users.find(u => u.id === log.userId)?.name || 
                                       'Unknown';
                    return (
                      <TableRow key={log.id} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="whitespace-nowrap text-[11px] text-muted-foreground">
                          <div className="font-semibold text-foreground/80">
                            {format(parseISO(log.timestamp), 'MMM d, yyyy')}
                          </div>
                          <div>{format(parseISO(log.timestamp), 'h:mm:ss a')}</div>
                        </TableCell>
                        <TableCell className="font-semibold text-sm">
                          {resolvedName}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell>{getEntityBadge(log.entityType)}</TableCell>
                        <TableCell className="text-sm">{log.details}</TableCell>
                        <TableCell>
                          {log.branch ? (
                            <Badge variant="secondary" className="flex items-center gap-1 w-fit text-[10px] font-bold">
                              <MapPin className="h-2 w-2" /> {log.branch}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground text-[10px] italic">Global</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16">
                      <div className="flex flex-col items-center text-muted-foreground">
                        <History className="h-10 w-10 mb-3 opacity-20" />
                        <p className="font-medium">No records found</p>
                        <p className="text-sm">Try adjusting your filters or date range.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {!loading && filteredLogs.length > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-xs text-muted-foreground">
                Showing{' '}
                <span className="font-semibold text-foreground">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredLogs.length)}
                </span>{' '}
                of{' '}
                <span className="font-semibold text-foreground">{filteredLogs.length.toLocaleString()}</span>{' '}
                records
              </p>

              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(1)}
                  disabled={safePage === 1}
                >
                  <ChevronsLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                <span className="text-xs font-medium px-3 py-1 bg-muted rounded-md min-w-[90px] text-center">
                  Page {safePage} of {totalPages.toLocaleString()}
                </span>

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safePage === totalPages}
                >
                  <ChevronsRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
