import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAppContext } from './context';
import { useSettings } from './contexts/SettingsContext';
import { useLanguage } from './contexts/LanguageContext';
import { db, auth, getTenantId } from './firebase';
import { collection, query, onSnapshot, orderBy, getDocs, setDoc, doc } from 'firebase/firestore';
import { Client, CallCenterLog } from './types';
import { downloadFile } from './utils/download';
import { addDays, format, parseISO } from 'date-fns';
import {
  Phone, Search, Download, Star, User, MessageSquare,
  PhoneCall, PhoneOff, PhoneMissed, ThumbsUp, ThumbsDown, Users, X, Loader2, CalendarDays
} from 'lucide-react';
import { toast } from 'sonner';

/* ─────────────────────── Constants ─────────────────────── */

const CALL_TYPES = [
  'Answer',
  'Not Interested',
  'No Answer',
  'Interested',
  'Social Media',
  'Follow Up',
  'Call Later',
] as const;

type CallType = (typeof CALL_TYPES)[number];

const CALL_TYPE_STYLES: Record<
  CallType,
  { base: string; active: string; icon: React.ReactNode; badge: string }
> = {
  Answer: {
    base: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20',
    active: 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25',
    icon: <PhoneCall className="h-4 w-4" />,
    badge: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  },
  'Not Interested': {
    base: 'bg-red-500/10 text-red-600 border-red-500/30 hover:bg-red-500/20',
    active: 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/25',
    icon: <ThumbsDown className="h-4 w-4" />,
    badge: 'bg-red-500/15 text-red-600 border-red-500/30',
  },
  'No Answer': {
    base: 'bg-gray-500/10 text-gray-600 border-gray-500/30 hover:bg-gray-500/20',
    active: 'bg-gray-500 text-white border-gray-500 shadow-lg shadow-gray-500/25',
    icon: <PhoneOff className="h-4 w-4" />,
    badge: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
  },
  Interested: {
    base: 'bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20',
    active: 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25',
    icon: <ThumbsUp className="h-4 w-4" />,
    badge: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  },
  'Social Media': {
    base: 'bg-purple-500/10 text-purple-600 border-purple-500/30 hover:bg-purple-500/20',
    active: 'bg-purple-500 text-white border-purple-500 shadow-lg shadow-purple-500/25',
    icon: <MessageSquare className="h-4 w-4" />,
    badge: 'bg-purple-500/15 text-purple-600 border-purple-500/30',
  },
  'Follow Up': {
    base: 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20',
    active: 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25',
    icon: <Star className="h-4 w-4" />,
    badge: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  },
  'Call Later': {
    base: 'bg-violet-500/10 text-violet-600 border-violet-500/30 hover:bg-violet-500/20',
    active: 'bg-violet-500 text-white border-violet-500 shadow-lg shadow-violet-500/25',
    icon: <CalendarDays className="h-4 w-4" />,
    badge: 'bg-violet-500/15 text-violet-600 border-violet-500/30',
  },
};

const STATUS_COLOR: Record<string, string> = {
  lead: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  member: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  expired: 'bg-red-500/15 text-red-600 border-red-500/30',
  frozen: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  inactive: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
};

/* ─────────────────────── Helpers ─────────────────────── */

function exportToCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) {
    toast.info('No data to export');
    return;
  }
  const firstRow = data[0];
  if (!firstRow) return;
  const headers = Object.keys(firstRow);
  const csvContent = [
    headers.join(','),
    ...data.map((row) =>
      headers
        .map((h) => {
          const val = row[h];
          return typeof val === 'string'
            ? `"${val.replace(/"/g, '""')}"`
            : val ?? '';
        })
        .join(','),
    ),
  ].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  downloadFile(blob, `${filename}.csv`);
  toast.success('CSV exported successfully');
}

function formatDate(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy');
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd MMM yyyy, hh:mm a');
  } catch {
    return iso;
  }
}

/* ─────────────────────── Component ─────────────────────── */

export default function CallCenter() {
  const { clients, currentUser, users, payments, attendances } = useAppContext();
  const { branches } = useSettings();
  const { isRtl } = useLanguage();
  const isInzan = getTenantId() === 'inzanathletics';

  /* ── State ── */
  const [searchById, setSearchById] = useState('');
  const [searchByName, setSearchByName] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [callType, setCallType] = useState<CallType | ''>('');
  const [comment, setComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [callLogs, setCallLogs] = useState<CallCenterLog[]>([]);
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterCallType, setFilterCallType] = useState('All');
  const [filterBranch, setFilterBranch] = useState('All');
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [targetSegment, setTargetSegment] = useState<'Active' | 'Expired' | 'Last Seen' | 'Leads'>('Active');
  const [targetDateFrom, setTargetDateFrom] = useState('');
  const [targetDateTo, setTargetDateTo] = useState('');

  const availableCallTypes = isInzan ? CALL_TYPES : CALL_TYPES.filter((type) => type !== 'Call Later');

  /* ── Fetch tenant call logs ── */
  const fetchCallLogs = useCallback(async () => {
    try {
      let logs: CallCenterLog[];
      if (isInzan) {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Your session expired. Please sign in again.');
        const response = await fetch('/api/call-center/logs', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to load call history.');
        logs = Array.isArray(result.logs) ? result.logs as CallCenterLog[] : [];
      } else {
        const snap = await getDocs(query(collection(db, 'callCenterLog')));
        logs = snap.docs.map((d) => ({ ...d.data(), id: d.id } as CallCenterLog));
      }
      // Sort by createdAt desc locally (if missing index)
      logs.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setCallLogs(logs);
    } catch (error) {
      console.error('Error fetching call logs:', error);
      toast.error('Failed to load call logs');
    }
  }, [isInzan]);

  useEffect(() => {
    fetchCallLogs();
  }, [fetchCallLogs]);

  useEffect(() => {
    if (!isInzan) return;
    const refreshLogs = () => { void fetchCallLogs(); };
    const intervalId = window.setInterval(refreshLogs, 60_000);
    window.addEventListener('focus', refreshLogs);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshLogs);
    };
  }, [fetchCallLogs, isInzan]);

  /* ── Unpaid amount for selected client ── */
  const unpaidAmount = useMemo(() => {
    if (!selectedClient) return 0;
    return payments
      .filter(
        (p: any) => p.clientId === selectedClient.id && !p.deleted_at,
      )
      .reduce((sum: number, p: any) => sum + ((p.amount || 0) - (p.amount_paid || 0)), 0);
  }, [selectedClient, payments]);

  const getCooldownUntil = useCallback((client: Client): number => {
    const memberId = client.memberId || client.id;
    return callLogs.reduce((latestUntil, log) => {
      const belongsToClient = log.clientDocId === client.id || log.memberId === memberId;
      if (!belongsToClient) return latestUntil;
      const savedUntil = Date.parse(log.cooldownUntil || '');
      if (Number.isFinite(savedUntil)) return Math.max(latestUntil, savedUntil);
      if (log.callType === 'Not Interested') {
        const loggedAt = Date.parse(log.createdAt || '');
        if (Number.isFinite(loggedAt)) return Math.max(latestUntil, loggedAt + 15 * 24 * 60 * 60 * 1000);
      }
      return latestUntil;
    }, 0);
  }, [callLogs]);

  const lastAttendanceByClient = useMemo(() => {
    const latestByClient = new Map<string, string>();
    for (const attendance of attendances) {
      const day = String(attendance.date || '').slice(0, 10);
      if (!day) continue;
      const existing = latestByClient.get(attendance.clientId);
      if (!existing || day > existing) latestByClient.set(attendance.clientId, day);
    }
    return latestByClient;
  }, [attendances]);

  const callTargets = useMemo(() => {
    if (!isInzan) return [];
    const today = format(new Date(), 'yyyy-MM-dd');
    const lastSeenFrom = targetDateFrom || format(addDays(new Date(), -30), 'yyyy-MM-dd');
    const lastSeenTo = targetDateTo || today;
    if (lastSeenFrom > lastSeenTo) return [];

    return clients.filter((client) => {
      if (getCooldownUntil(client) > Date.now()) return false;
      const status = String(client.status || '').toLowerCase();
      if (targetSegment === 'Active' && status !== 'active' && status !== 'nearly expired') return false;
      if (targetSegment === 'Expired' && status !== 'expired' && !(client.membershipExpiry && client.membershipExpiry.slice(0, 10) < today)) return false;
      if (targetSegment === 'Leads' && status !== 'lead') return false;

      if (targetSegment === 'Last Seen') {
        if (status === 'lead' || status === 'hold') return false;
        const lastSeen = lastAttendanceByClient.get(client.id);
        return !lastSeen || lastSeen < lastSeenFrom || lastSeen > lastSeenTo;
      }

      const targetDate = targetSegment === 'Leads'
        ? String(client.createdAt || '').slice(0, 10)
        : String(client.membershipExpiry || '').slice(0, 10);
      if (targetDateFrom && (!targetDate || targetDate < targetDateFrom)) return false;
      if (targetDateTo && (!targetDate || targetDate > targetDateTo)) return false;
      return true;
    }).slice(0, 100);
  }, [clients, getCooldownUntil, isInzan, lastAttendanceByClient, targetDateFrom, targetDateTo, targetSegment]);

  const pendingFollowUps = useMemo(() => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return callLogs
      .filter((log) => log.callType === 'Call Later' && log.reminderDate && log.reminderStatus !== 'completed')
      .sort((a, b) => String(a.reminderDate).localeCompare(String(b.reminderDate)))
      .filter((log) => String(log.reminderDate) <= today)
      .slice(0, 10);
  }, [callLogs]);

  const targetDateRangeFrom = targetSegment === 'Last Seen'
    ? targetDateFrom || format(addDays(new Date(), -30), 'yyyy-MM-dd')
    : targetDateFrom;
  const targetDateRangeTo = targetSegment === 'Last Seen'
    ? targetDateTo || format(new Date(), 'yyyy-MM-dd')
    : targetDateTo;
  const targetDateRangeInvalid = Boolean(targetDateRangeFrom && targetDateRangeTo && targetDateRangeFrom > targetDateRangeTo);

  /* ── Search handlers ── */
  const handleSearchById = useCallback(() => {
    if (!searchById.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const term = searchById.trim().toLowerCase();
    const results = clients.filter(
      (c) => c.memberId?.toLowerCase() === term || c.id.toLowerCase() === term,
    );
    if (results.length === 1) {
      setSelectedClient(results[0] ?? null);
      setSearchResults([]);
      setShowResults(false);
    } else if (results.length > 0) {
      setSearchResults(results);
      setShowResults(true);
    } else {
      toast.info('No member found with that ID');
      setSearchResults([]);
      setShowResults(false);
    }
  }, [searchById, clients]);

  const handleSearchByName = useCallback(() => {
    if (!searchByName.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    const term = searchByName.trim().toLowerCase();
    const results = clients
      .filter(
        (c) =>
          c.name?.toLowerCase().includes(term) ||
          c.phone?.toLowerCase().includes(term),
      )
      .slice(0, 5);
    if (results.length > 0) {
      setSearchResults(results);
      setShowResults(true);
    } else {
      toast.info('No members found');
      setSearchResults([]);
      setShowResults(false);
    }
  }, [searchByName, clients]);

  const selectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setSearchResults([]);
    setShowResults(false);
    setSearchById('');
    setSearchByName('');
    setCallType('');
    setComment('');
    setReminderDate('');
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedClient(null);
    setCallType('');
    setComment('');
    setReminderDate('');
  }, []);

  /* ── Save call log ── */
  const handleSave = useCallback(async () => {
    if (!selectedClient) {
      toast.error('Please select a member first');
      return;
    }
    if (!callType) {
      toast.error('Please select a call status');
      return;
    }
    if (!comment.trim()) {
      toast.error('Please add a comment');
      return;
    }
    if (isInzan && getCooldownUntil(selectedClient) > Date.now()) {
      toast.error(`This contact is in a 15-day cooldown until ${new Date(getCooldownUntil(selectedClient)).toLocaleDateString()}.`);
      return;
    }
    if (isInzan && callType === 'Call Later' && !reminderDate) {
      toast.error('Choose a reminder date for Call Later.');
      return;
    }

    setIsSaving(true);
    try {
      let logEntry: CallCenterLog;
      if (isInzan) {
        const token = await auth.currentUser?.getIdToken();
        if (!token) throw new Error('Your session expired. Please sign in again.');
        const response = await fetch('/api/call-center/logs', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            clientDocId: selectedClient.id,
            callType,
            comment: comment.trim(),
            reminderDate: callType === 'Call Later' ? reminderDate : undefined,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save call log.');
        logEntry = result.log as CallCenterLog;
      } else {
        const newId = crypto.randomUUID();
        logEntry = {
          id: newId,
          memberId: selectedClient.memberId || selectedClient.id,
          memberName: selectedClient.name || '',
          memberPhone: selectedClient.phone || '',
          memberStatus: selectedClient.status || '',
          packageData: selectedClient.packageType || '',
          callType: callType as CallCenterLog['callType'],
          comment: comment.trim(),
          source: selectedClient.source || '',
          createdBy: currentUser?.id || '',
          createdByName: currentUser?.name || '',
          createdAt: new Date().toISOString(),
          branch: selectedClient.branch || '',
        };
        await setDoc(doc(db, 'callCenterLog', logEntry.id), logEntry);
      }
      
      // Update local state immediately
      setCallLogs((previousLogs) => [
        logEntry,
        ...previousLogs.map((log) => {
          const sameClient = log.clientDocId === selectedClient.id || log.memberId === (selectedClient.memberId || selectedClient.id);
          if (isInzan && sameClient && log.callType === 'Call Later' && log.reminderStatus !== 'completed') {
            return { ...log, reminderStatus: 'completed' as const, reminderCompletedAt: new Date().toISOString() };
          }
          return log;
        }),
      ]);
      toast.success('Call log saved successfully');
      setCallType('');
      setComment('');
      setReminderDate('');
    } catch (error) {
      console.error('Error saving call log:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save call log');
    } finally {
      setIsSaving(false);
    }
  }, [selectedClient, callType, comment, currentUser, getCooldownUntil, isInzan, reminderDate]);

  /* ── Filtered logs ── */
  const filteredLogs = useMemo(() => {
    return callLogs.filter((log) => {
      if (filterCallType !== 'All' && log.callType !== filterCallType) return false;
      if (filterBranch !== 'All' && log.branch !== filterBranch) return false;
      if (filterDateFrom) {
        const logDate = log.createdAt?.slice(0, 10) || '';
        if (logDate < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const logDate = log.createdAt?.slice(0, 10) || '';
        if (logDate > filterDateTo) return false;
      }
      return true;
    });
  }, [callLogs, filterCallType, filterBranch, filterDateFrom, filterDateTo]);

  /* ── CSV export data ── */
  const handleExport = useCallback(() => {
    const exportData = filteredLogs.map((log) => ({
      Date: formatDateTime(log.createdAt),
      'Member Name': log.memberName,
      'Member ID': log.memberId,
      Phone: log.memberPhone,
      Status: log.memberStatus,
      'Call Type': log.callType,
      Comment: log.comment,
      Branch: log.branch || '',
      'Created By': log.createdByName || log.createdBy,
    }));
    exportToCSV(exportData, `call_center_logs_${format(new Date(), 'yyyy-MM-dd')}`);
  }, [filteredLogs]);

  /* ── Member logs for quick view ── */
  const memberLogs = useMemo(() => {
    if (!selectedClient) return [];
    const targetId = selectedClient.memberId || selectedClient.id;
    return callLogs.filter((l) => l.clientDocId === selectedClient.id || l.memberId === targetId).slice(0, 10);
  }, [selectedClient, callLogs]);

  /* ────────────────────── RENDER ────────────────────── */
  return (
    <div className="space-y-6" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10">
            <Phone className="h-7 w-7 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-black uppercase tracking-tight">Call Center</h1>
            <p className="text-sm text-muted-foreground">
              Outbound call management workspace
            </p>
          </div>
        </div>
        <Badge variant="outline" className="gap-1.5 px-3 py-1.5 text-sm">
          <Users className="h-4 w-4" />
          {callLogs.length} Total Logs
        </Badge>
      </div>

      {isInzan && (
        <>
          <Card className="border-amber-500/20">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-amber-500" />
                Call Target List
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Contacts in a 15-day Not Interested cooldown are automatically excluded.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">Contact group</label>
                  <Select value={targetSegment} onValueChange={(value) => value && setTargetSegment(value as typeof targetSegment)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active Members</SelectItem>
                      <SelectItem value="Expired">Expired Members</SelectItem>
                      <SelectItem value="Last Seen">Non-Attendees (Last Seen)</SelectItem>
                      <SelectItem value="Leads">Leads</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {targetSegment === 'Last Seen' ? 'No-attendance window from' : 'Relevant date from'}
                  </label>
                  <Input type="date" value={targetDateFrom} onChange={(e) => setTargetDateFrom(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-muted-foreground">
                    {targetSegment === 'Last Seen' ? 'No-attendance window to' : 'Relevant date to'}
                  </label>
                  <Input type="date" value={targetDateTo} onChange={(e) => setTargetDateTo(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {targetSegment === 'Last Seen'
                  ? 'Shows members with no check-in during the selected window. If dates are blank, the last 30 days are used.'
                  : targetSegment === 'Leads'
                    ? 'Date filters apply to lead creation date.'
                    : 'Date filters apply to membership expiry date.'}
              </p>
              {targetDateRangeInvalid ? (
                <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">The start date must be on or before the end date.</p>
              ) : callTargets.length === 0 ? (
                <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No eligible contacts match this list.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto rounded-lg border">
                  {callTargets.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-3 border-b p-3 text-left last:border-b-0 hover:bg-muted/40"
                      onClick={() => selectClient(client)}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{client.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {client.memberId || client.id} · {client.phone || 'No phone'} · {client.branch || 'No branch'}
                        </span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-muted-foreground">
                        {targetSegment === 'Last Seen'
                          ? `Last seen: ${lastAttendanceByClient.get(client.id) || 'Never'}`
                          : targetSegment === 'Leads'
                            ? `Created: ${formatDate(client.createdAt)}`
                            : `Expires: ${formatDate(client.membershipExpiry)}`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Showing up to 100 contacts.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <CalendarDays className="h-5 w-5 text-violet-500" />
                Follow-ups Due / Overdue ({pendingFollowUps.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {pendingFollowUps.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-up reminders are due today.</p>
              ) : (
                <div className="space-y-2">
                  {pendingFollowUps.map((log) => {
                    const client = clients.find((candidate) =>
                      candidate.id === log.clientDocId ||
                      candidate.memberId === log.memberId ||
                      candidate.id === log.memberId
                    );
                    return (
                      <div key={log.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{log.memberName}</p>
                          <p className="text-xs text-muted-foreground">Due {log.reminderDate} · {log.memberPhone}</p>
                        </div>
                        {client && (
                          <Button size="sm" variant="outline" onClick={() => selectClient(client)}>
                            <PhoneCall className="mr-1.5 h-3.5 w-3.5" /> Call
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Search Section ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Search className="h-5 w-5 text-amber-500" />
            Search Member
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Search by ID */}
            <div className="flex gap-2">
              <Input
                placeholder="Search by Member ID..."
                value={searchById}
                onChange={(e) => setSearchById(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchById()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSearchById}
                className="shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Search by Name / Phone */}
            <div className="flex gap-2">
              <Input
                placeholder="Search by name or phone..."
                value={searchByName}
                onChange={(e) => setSearchByName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchByName()}
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                onClick={handleSearchByName}
                className="shrink-0"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Search Results Dropdown */}
          {showResults && searchResults.length > 0 && (
            <div className="mt-3 rounded-lg border bg-card shadow-lg">
              <div className="flex items-center justify-between border-b px-4 py-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} found
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowResults(false);
                    setSearchResults([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {searchResults.map((client) => (
                <button
                  key={client.id}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  onClick={() => selectClient(client)}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
                    <User className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {client.memberId && `ID: ${client.memberId} · `}
                      {client.phone}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs capitalize ${STATUS_COLOR[client.status] || ''}`}
                  >
                    {client.status}
                  </Badge>
                  {client.branch && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {client.branch}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Member Quick View ── */}
      {selectedClient && (
        <Card className="border-amber-500/30 shadow-amber-500/5 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <User className="h-5 w-5 text-amber-500" />
                Member Details
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <InfoCell label="Name" value={selectedClient.name} />
              <InfoCell label="Phone" value={selectedClient.phone} />
              <InfoCell label="Backup Phone" value={selectedClient.backupPhone || '—'} />
              <InfoCell
                label="Status"
                value={
                  <Badge
                    variant="outline"
                    className={`capitalize ${STATUS_COLOR[selectedClient.status] || ''}`}
                  >
                    {selectedClient.status}
                  </Badge>
                }
              />
              <InfoCell label="Package" value={selectedClient.packageType || '—'} />
              <InfoCell label="Member ID" value={selectedClient.memberId || '—'} />
              <InfoCell
                label="Expiry Date"
                value={formatDate(selectedClient.membershipExpiry)}
              />
              <InfoCell label="Branch" value={selectedClient.branch || '—'} />
              <InfoCell label="Sales Rep" value={selectedClient.salesName || '—'} />
              <InfoCell
                label="Unpaid Amount"
                value={
                  <span className={unpaidAmount > 0 ? 'font-bold text-red-500' : ''}>
                    {unpaidAmount > 0
                      ? `${unpaidAmount.toLocaleString()} EGP`
                      : '0 EGP'}
                  </span>
                }
              />
            </div>

            {isInzan && getCooldownUntil(selectedClient) > Date.now() && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
                This contact cannot be called until {new Date(getCooldownUntil(selectedClient)).toLocaleDateString()} because of the 15-day Not Interested cooldown.
              </div>
            )}

            {/* Call Status Buttons */}
            <div>
              <label className="mb-2 block text-sm font-medium text-muted-foreground">
                Call Status
              </label>
              <div className="flex flex-wrap gap-2">
                {availableCallTypes.map((type) => {
                  const style = CALL_TYPE_STYLES[type];
                  const isActive = callType === type;
                  return (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      disabled={isInzan && getCooldownUntil(selectedClient) > Date.now()}
                      className={`gap-1.5 transition-all duration-200 ${
                        isActive ? style.active : style.base
                      }`}
                      onClick={() => {
                        setCallType(isActive ? '' : type);
                        if (!isActive && type === 'Call Later' && !reminderDate) {
                          setReminderDate(format(addDays(new Date(), 1), 'yyyy-MM-dd'));
                        }
                      }}
                    >
                      {style.icon}
                      {type}
                    </Button>
                  );
                })}
              </div>
            </div>

            {isInzan && callType === 'Call Later' && (
              <div className="max-w-xs space-y-1.5">
                <label htmlFor="call-reminder-date" className="block text-sm font-medium text-muted-foreground">
                  Reminder date
                </label>
                <Input
                  id="call-reminder-date"
                  type="date"
                  min={format(new Date(), 'yyyy-MM-dd')}
                  value={reminderDate}
                  onChange={(event) => setReminderDate(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">A due task will be assigned to you for this date.</p>
              </div>
            )}

            {/* Comment + Save */}
            <div className="space-y-3">
              <Textarea
                placeholder="Add your call notes here..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {callType
                    ? `Status: ${callType}`
                    : 'Select a call status above'}
                </p>
                <Button
                  onClick={handleSave}
                  disabled={isSaving || !callType || !comment.trim() || (isInzan && getCooldownUntil(selectedClient) > Date.now()) || (isInzan && callType === 'Call Later' && !reminderDate)}
                  className="min-w-[140px] bg-amber-500 text-white hover:bg-amber-600"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <PhoneCall className="h-4 w-4 mr-2" />
                      Save Call Log
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Recent Calls for this Member */}
            {memberLogs.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-muted-foreground">
                  Recent Calls for {selectedClient.name}
                </h4>
                <div className="max-h-48 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Date</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Comment</th>
                        <th className="px-3 py-2 text-left font-medium">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {memberLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-3 py-2">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                CALL_TYPE_STYLES[log.callType as CallType]?.badge || ''
                              }`}
                            >
                              {log.callType}
                            </Badge>
                          </td>
                          <td className="max-w-[200px] truncate px-3 py-2 text-xs">
                            {log.comment}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                            {log.createdByName || log.createdBy}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Call History Table ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-amber-500" />
              Call History
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={filteredLogs.length === 0}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                From
              </label>
              <Input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                To
              </label>
              <Input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Call Type
              </label>
              <Select value={filterCallType} onValueChange={(v) => setFilterCallType(v || 'All')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Types</SelectItem>
                  {availableCallTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Branch
              </label>
              <Select value={filterBranch} onValueChange={(v) => setFilterBranch(v || 'All')}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Branches</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Table */}
          {filteredLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
              <PhoneOff className="h-10 w-10 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-medium text-muted-foreground">
                No call logs found
              </p>
              <p className="text-xs text-muted-foreground/60">
                Adjust your filters or start logging calls above
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Date
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Member
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Member ID
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Phone
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Status
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Call Type
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Comment
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Branch
                    </th>
                    <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Created By
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredLogs.map((log) => (
                    <tr
                      key={log.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 font-medium">
                        {log.memberName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {log.memberId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs">
                        {log.memberPhone}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-xs capitalize ${
                            STATUS_COLOR[log.memberStatus] || ''
                          }`}
                        >
                          {log.memberStatus}
                        </Badge>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            CALL_TYPE_STYLES[log.callType as CallType]?.badge || ''
                          }`}
                        >
                          {log.callType}
                        </Badge>
                      </td>
                      <td className="max-w-[250px] truncate px-3 py-2.5 text-xs" title={log.comment}>
                        {log.comment}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {log.branch || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                        {log.createdByName || log.createdBy}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Result count */}
          {filteredLogs.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing {filteredLogs.length} of {callLogs.length} total logs
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ─────────────────────── Sub-components ─────────────────────── */

function InfoCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-semibold truncate">{value}</div>
    </div>
  );
}
