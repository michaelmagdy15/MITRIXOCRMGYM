import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '../../context';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useClasses } from '../../hooks/useClasses';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import { format, subDays, parseISO, isToday } from 'date-fns';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  UserX, 
  AlertTriangle, 
  FileSpreadsheet, 
  Filter, 
  Check, 
  X, 
  Sparkles, 
  Users, 
  Phone,
  ShieldAlert,
  ChevronRight,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveAttendee } from '../../utils/attendeeUtils';
import { ClassSchedule, ClassBooking } from '../../types/class';
import { toast } from 'sonner';

interface AttendanceReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  initialSessionId?: string;
}

export const AttendanceReconciliationModal: React.FC<AttendanceReconciliationModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  initialSessionId
}) => {
  const { classes } = useClasses();
  const { branches } = useSettings();
  const { clients, coaches } = useAppContext();
  const { currentUser } = useAuth();

  // Filters
  const yesterdayStr = useMemo(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'), []);
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || yesterdayStr);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string>(initialSessionId || 'all');
  const [selectedCoachId, setSelectedCoachId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Paper check-off states: map of `classId_memberId` -> boolean
  const [paperMatches, setPaperMatches] = useState<Record<string, boolean>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [discrepancyFilter, setDiscrepancyFilter] = useState<'all' | 'unconfirmed' | 'attended' | 'noshow'>('all');

  // Bookings map loaded for the day for cross-verification
  const [dayBookings, setDayBookings] = useState<ClassBooking[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (initialDate) setSelectedDate(initialDate);
    if (initialSessionId) setSelectedSessionId(initialSessionId);
  }, [initialDate, initialSessionId]);

  // Load classBookings for selected date
  useEffect(() => {
    if (!isOpen || !selectedDate) return;
    let cancelled = false;

    const loadBookings = async () => {
      try {
        const q = query(
          collection(db, 'classBookings'),
          where('classDate', '==', selectedDate)
        );
        const snap = await getDocs(q);
        if (!cancelled) {
          const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as ClassBooking));
          setDayBookings(list);
        }
      } catch (err) {
        console.warn("[Reconciliation] Could not load bookings for date:", err);
      }
    };

    loadBookings();
    return () => { cancelled = true; };
  }, [isOpen, selectedDate]);

  // Filter classes on selected date
  const filteredSessions = useMemo(() => {
    return classes.filter((c: ClassSchedule) => {
      const classDate = c.date || (c.startTime ? c.startTime.substring(0, 10) : '');
      if (classDate !== selectedDate) return false;
      if (selectedBranch !== 'all' && c.branch && c.branch !== selectedBranch) return false;
      if (selectedCoachId !== 'all' && c.instructorId !== selectedCoachId) return false;
      if (selectedCategory !== 'all' && c.category !== selectedCategory) return false;
      return true;
    }).sort((a: ClassSchedule, b: ClassSchedule) => (a.time || '').localeCompare(b.time || ''));
  }, [classes, selectedDate, selectedBranch, selectedCoachId, selectedCategory]);

  // If a specific session is selected, narrow down to it; otherwise include all filtered sessions
  const activeSessions = useMemo(() => {
    if (selectedSessionId !== 'all') {
      const match = filteredSessions.find((s: ClassSchedule) => s.id === selectedSessionId);
      return match ? [match] : [];
    }
    return filteredSessions;
  }, [filteredSessions, selectedSessionId]);

  // Flattened roster rows across active sessions
  const rosterRows = useMemo(() => {
    const rows: {
      session: ClassSchedule;
      memberId: string;
      rowKey: string;
      displayName: string;
      displayPhone: string;
      displayId: string;
      packageName: string;
      creditsRemaining: number | string;
      bookingTime: string;
      systemStatus: 'attended' | 'booked' | 'no-show' | 'unmarked';
      isVerifiedPast: boolean;
      client: any;
    }[] = [];

    activeSessions.forEach((session: ClassSchedule) => {
      const enrolled = session.attendees || [];
      const checkedInSet = new Set(session.checkedIn || []);
      const noShowSet = new Set(session.noShows || []);

      enrolled.forEach((attendeeId: string) => {
        const { client, displayName, displayPhone, displayId } = resolveAttendee(attendeeId, clients);
        const matchedIds = [attendeeId, client?.id, client?.memberId, client?.portalUserId].filter(Boolean) as string[];
        
        const isCheckedIn = matchedIds.some(id => checkedInSet.has(id));
        const isNoShow = !isCheckedIn && matchedIds.some(id => noShowSet.has(id));

        const bookingRecord = dayBookings.find(b => 
          b.classId === session.id && (b.clientId === attendeeId || b.memberId === attendeeId || matchedIds.includes(b.clientId || ''))
        );

        const systemStatus: 'attended' | 'booked' | 'no-show' | 'unmarked' = isCheckedIn
          ? 'attended'
          : isNoShow
            ? 'no-show'
            : bookingRecord?.status === 'attended'
              ? 'attended'
              : 'booked';

        const rowKey = `${session.id}_${attendeeId}`;

        // Package / Tier Info
        let packageName = 'Standard';
        let creditsRemaining: number | string = '—';
        if (client) {
          packageName = client.packageType || client.memberCategory || 'Active Member';
          creditsRemaining = client.sessionsRemaining ?? '—';
        }

        // Booking Time
        let bookingTime = 'Pre-booked';
        const rawTime = bookingRecord?.bookedAt || bookingRecord?.createdAt;
        if (rawTime) {
          const bDate = new Date(rawTime);
          if (!isNaN(bDate.getTime())) {
            bookingTime = format(bDate, 'MMM d, h:mm a');
          }
        }

        rows.push({
          session,
          memberId: attendeeId,
          rowKey,
          displayName,
          displayPhone,
          displayId,
          packageName,
          creditsRemaining,
          bookingTime,
          systemStatus,
          isVerifiedPast: isCheckedIn,
          client
        });
      });
    });

    // Apply discrepancy and search filter
    return rows.filter(row => {
      if (discrepancyFilter === 'unconfirmed' && row.systemStatus !== 'booked') return false;
      if (discrepancyFilter === 'attended' && row.systemStatus !== 'attended') return false;
      if (discrepancyFilter === 'noshow' && row.systemStatus !== 'no-show') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matches = row.displayName.toLowerCase().includes(q) ||
                        row.displayPhone.includes(q) ||
                        row.displayId.toLowerCase().includes(q) ||
                        row.session.name.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [activeSessions, clients, dayBookings, discrepancyFilter, searchQuery]);

  // Reconciliation Metrics
  const metrics = useMemo(() => {
    let total = 0;
    let attended = 0;
    let pendingVerification = 0;
    let noShows = 0;
    let paperMatchedCount = 0;

    rosterRows.forEach(row => {
      total++;
      if (row.systemStatus === 'attended') attended++;
      else if (row.systemStatus === 'no-show') noShows++;
      else pendingVerification++;

      if (paperMatches[row.rowKey] || row.systemStatus === 'attended') {
        paperMatchedCount++;
      }
    });

    const noShowCandidates = pendingVerification;

    return { total, attended, pendingVerification, noShows, paperMatchedCount, noShowCandidates };
  }, [rosterRows, paperMatches]);

  // Toggle paper match for a single row
  const togglePaperMatch = (rowKey: string) => {
    setPaperMatches(prev => ({
      ...prev,
      [rowKey]: !prev[rowKey]
    }));
  };

  // Mark all unconfirmed rows as matched on paper
  const handleCheckAllOnPaper = () => {
    const next: Record<string, boolean> = { ...paperMatches };
    rosterRows.forEach(r => {
      if (r.systemStatus !== 'attended') {
        next[r.rowKey] = true;
      }
    });
    setPaperMatches(next);
    toast.info("All listed unconfirmed members checked as present on paper sheet.");
  };

  // Clear all checks
  const handleClearAllPaperChecks = () => {
    setPaperMatches({});
    toast.info("Paper check marks cleared.");
  };

  // Confirm & Reconcile in Batch
  const handleConfirmAndReconcile = async () => {
    const checkedRows = rosterRows.filter(r => paperMatches[r.rowKey] && r.systemStatus !== 'attended');
    if (checkedRows.length === 0) {
      toast.warning("No new attendees selected for reconciliation.", {
        description: "Toggle the paper switch on members present on your physical sheet."
      });
      return;
    }

    setIsProcessing(true);
    let successCount = 0;

    try {
      const token = await auth.currentUser?.getIdToken();

      // Group by session to make batch calls
      const sessionGroups = new Map<string, typeof checkedRows>();
      checkedRows.forEach(r => {
        const group = sessionGroups.get(r.session.id) || [];
        group.push(r);
        sessionGroups.set(r.session.id, group);
      });

      for (const [sessionId, items] of sessionGroups.entries()) {
        const payload = {
          sessionId,
          items: items.map(item => ({
            memberId: item.memberId,
            paperPresent: true,
            reason: `Physical paper sheet reconciliation (${selectedDate})`
          }))
        };

        const res = await fetch(`/api/v1/sessions/${sessionId}/attendance/batch-reconcile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          successCount += items.length;
          // Update local session
          const session = items[0]?.session;
          if (session) {
            const nextCheckedIn = Array.from(new Set([...(session.checkedIn || []), ...items.map(i => i.memberId)]));
            const nextNoShows = (session.noShows || []).filter(id => !items.some(i => i.memberId === id));
            await updateDoc(doc(db, 'classSchedules', sessionId), {
              checkedIn: nextCheckedIn,
              noShows: nextNoShows,
              updatedAt: new Date().toISOString()
            }).catch(() => {});
          }
        }
      }

      toast.success(`Successfully reconciled ${successCount} member attendance records!`, {
        description: "Checked in retroactively with backdated timestamps and forgiven no-show strikes."
      });

      // Clear matches for reconciled rows
      const nextMatches = { ...paperMatches };
      checkedRows.forEach(r => delete nextMatches[r.rowKey]);
      setPaperMatches(nextMatches);
    } catch (err: any) {
      console.error("[Reconciliation Submit Error]:", err);
      toast.error(err.message || "Failed to reconcile paper sheet attendance.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Flag remaining unconfirmed as No-Show Candidates
  const handleFlagRemainingNoShows = async () => {
    const unconfirmedRows = rosterRows.filter(r => r.systemStatus === 'booked' && !paperMatches[r.rowKey]);
    if (unconfirmedRows.length === 0) {
      toast.info("No unconfirmed candidates to flag.");
      return;
    }

    if (!window.confirm(`Are you sure you want to mark ${unconfirmedRows.length} members as No-Show? They booked on the app but were not marked on your paper sheet.`)) {
      return;
    }

    setIsProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const sessionGroups = new Map<string, typeof unconfirmedRows>();
      unconfirmedRows.forEach(r => {
        const group = sessionGroups.get(r.session.id) || [];
        group.push(r);
        sessionGroups.set(r.session.id, group);
      });

      for (const [sessionId, items] of sessionGroups.entries()) {
        const payload = {
          sessionId,
          items: items.map(item => ({
            memberId: item.memberId,
            paperPresent: false,
            reason: `Reconciliation discrepancy: Absent on paper sheet (${selectedDate})`
          }))
        };

        await fetch(`/api/v1/sessions/${sessionId}/attendance/batch-reconcile`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify(payload)
        });
      }

      toast.warning(`Marked ${unconfirmedRows.length} members as No-Show.`);
    } catch (err: any) {
      console.error("Error flagging no-shows:", err);
      toast.error("Failed to flag no-shows.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Single Check-In Action
  const handleSingleCheckIn = async (row: typeof rosterRows[0]) => {
    setIsProcessing(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch(`/api/v1/sessions/${row.session.id}/attendance/retroactive-checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sessionId: row.session.id,
          memberId: row.memberId,
          reason: `Paper roster match (${selectedDate})`
        })
      });

      if (!res.ok) throw new Error("Failed to check in attendee.");

      // Local update
      const nextCheckedIn = Array.from(new Set([...(row.session.checkedIn || []), row.memberId]));
      const nextNoShows = (row.session.noShows || []).filter(id => id !== row.memberId);
      await updateDoc(doc(db, 'classSchedules', row.session.id), {
        checkedIn: nextCheckedIn,
        noShows: nextNoShows,
        updatedAt: new Date().toISOString()
      });

      toast.success(`Checked in ${row.displayName} (Verified)`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Check-in failed.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={open => !open && onClose()}>
      <DialogContent 
        className={cn(
          "flex flex-col p-0 gap-0 overflow-hidden bg-background shadow-2xl transition-all duration-200 border",
          isFullscreen
            ? "fixed inset-0 z-50 w-screen sm:max-w-none md:max-w-none lg:max-w-none h-screen max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0"
            : "w-[96vw] sm:max-w-[96vw] md:max-w-[96vw] lg:max-w-[1450px] xl:max-w-[1600px] h-[92vh] max-h-[95vh] rounded-2xl"
        )}
      >
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b bg-card/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base sm:text-lg font-black flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                Historical Attendance Reconciliation Engine
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Reconcile physical paper attendance sheets with digital CRM records & forgive false no-show penalties.
              </DialogDescription>
            </div>

            {/* Quick Action Badges */}
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setSelectedDate(yesterdayStr)}
                className={`h-7 text-xs font-bold ${selectedDate === yesterdayStr ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
              >
                Yesterday
              </Button>
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))}
                className={`h-7 text-xs font-bold ${selectedDate === format(new Date(), 'yyyy-MM-dd') ? 'bg-primary/10 text-primary border-primary/40' : ''}`}
              >
                Today
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                title={isFullscreen ? "Exit Fullscreen (Restore)" : "Expand to Fullscreen"}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-3">
            {/* Date Picker */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Audit Date</Label>
              <Input 
                type="date" 
                value={selectedDate} 
                onChange={e => setSelectedDate(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>

            {/* Branch Selector */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Branch</Label>
              <Select value={selectedBranch} onValueChange={(val) => { if (val) setSelectedBranch(val); }}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Branches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Branches</SelectItem>
                  {(branches || []).map(b => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Session Selector */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Session</Label>
              <Select value={selectedSessionId} onValueChange={(val) => { if (val) setSelectedSessionId(val); }}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Sessions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sessions ({filteredSessions.length})</SelectItem>
                  {filteredSessions.map((s: ClassSchedule) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.time} — {s.name} ({s.attendees?.length || 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Coach Filter */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Coach</Label>
              <Select value={selectedCoachId} onValueChange={(val) => { if (val) setSelectedCoachId(val); }}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Coaches" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Coaches</SelectItem>
                  {(coaches || []).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Search Filter */}
            <div className="space-y-1">
              <Label className="text-[10px] font-bold uppercase text-muted-foreground">Search</Label>
              <Input 
                placeholder="Name, phone, ID..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>
        </DialogHeader>

        {/* Live Metrics Bar */}
        <div className="p-3 bg-muted/40 border-b grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="flex items-center justify-between p-2 rounded-lg bg-background border">
            <span className="text-muted-foreground font-semibold">Total Roster:</span>
            <span className="font-black text-foreground">{metrics.total}</span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-background border">
            <span className="text-muted-foreground font-semibold">Attended (Verified):</span>
            <span className="font-black text-emerald-600">{metrics.attended}</span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-background border">
            <span className="text-muted-foreground font-semibold">Pending Verification:</span>
            <span className="font-black text-amber-600">{metrics.pendingVerification}</span>
          </div>

          <div className="flex items-center justify-between p-2 rounded-lg bg-background border">
            <span className="text-muted-foreground font-semibold">No-Show Candidates:</span>
            <span className="font-black text-rose-500">{metrics.noShowCandidates}</span>
          </div>
        </div>

        {/* Action Header */}
        <div className="px-4 py-2 border-b bg-card/20 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleCheckAllOnPaper}
              className="h-7 text-xs font-bold"
            >
              <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" />
              Check All Unconfirmed
            </Button>
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={handleClearAllPaperChecks}
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Checks
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {metrics.noShowCandidates > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={isProcessing}
                onClick={handleFlagRemainingNoShows}
                className="h-7 text-xs font-bold border-rose-500/30 text-rose-600 hover:bg-rose-600 hover:text-white"
                title="Flag members who did not show up on paper as No-Show"
              >
                <UserX className="h-3.5 w-3.5 mr-1" />
                Flag Unchecked as No-Shows ({metrics.noShowCandidates})
              </Button>
            )}

            <Button
              size="sm"
              disabled={isProcessing}
              onClick={handleConfirmAndReconcile}
              className="h-7 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              {isProcessing ? "Reconciling..." : `Confirm & Reconcile Selected (${Object.values(paperMatches).filter(Boolean).length})`}
            </Button>
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {rosterRows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground text-xs italic">
              No attendees found matching the selected reconciliation criteria for {selectedDate}.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="w-[80px] text-center font-bold text-[11px] uppercase">Paper Match</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase">Client Name</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase">Session & Time</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase">Package / Tier</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase">Booking Time</TableHead>
                  <TableHead className="font-bold text-[11px] uppercase w-[130px]">System Status</TableHead>
                  <TableHead className="text-right font-bold text-[11px] uppercase w-[120px]">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rosterRows.map(row => {
                  const isCheckedOnPaper = paperMatches[row.rowKey] || row.systemStatus === 'attended';
                  return (
                    <TableRow 
                      key={row.rowKey} 
                      className={`hover:bg-muted/40 transition-colors ${isCheckedOnPaper ? 'bg-emerald-500/5' : ''}`}
                    >
                      {/* Paper Match Toggle */}
                      <TableCell className="text-center">
                        <div className="flex justify-center">
                          <Switch 
                            checked={isCheckedOnPaper}
                            disabled={row.systemStatus === 'attended'}
                            onCheckedChange={() => togglePaperMatch(row.rowKey)}
                            className="data-[state=checked]:bg-emerald-600"
                            title="Check off if this member's name appears on your physical paper sheet"
                          />
                        </div>
                      </TableCell>

                      {/* Member Info */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <div className="font-black text-xs text-foreground flex items-center gap-1.5">
                            {row.displayName}
                            {row.displayId && (
                              <span className="text-[10px] font-mono text-muted-foreground font-normal">
                                #{row.displayId.replace(/^#/, '')}
                              </span>
                            )}
                          </div>
                          {row.displayPhone && (
                            <a href={`tel:${row.displayPhone}`} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1">
                              <Phone className="h-3 w-3" /> {row.displayPhone}
                            </a>
                          )}
                        </div>
                      </TableCell>

                      {/* Session Info */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="font-bold text-xs text-foreground uppercase">{row.session.name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {row.session.time} • {row.session.branch || 'Main Studio'}
                          </p>
                        </div>
                      </TableCell>

                      {/* Package / Tier */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-foreground">{row.packageName}</p>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            Credits Left: <span className="font-bold text-foreground">{row.creditsRemaining}</span>
                          </p>
                        </div>
                      </TableCell>

                      {/* Booking Time */}
                      <TableCell className="text-xs text-muted-foreground font-mono">
                        {row.bookingTime}
                      </TableCell>

                      {/* Status */}
                      <TableCell>
                        {row.systemStatus === 'attended' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold">
                            <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Attended (Verified)
                          </Badge>
                        ) : row.systemStatus === 'no-show' ? (
                          <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[10px] font-bold">
                            <UserX className="h-3 w-3 mr-1 inline" /> No-Show
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/10 text-amber-600 border border-amber-500/30 text-[10px] font-bold animate-pulse">
                            <Clock className="h-3 w-3 mr-1 inline" /> Pending Verification
                          </Badge>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="text-right">
                        {row.systemStatus !== 'attended' ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isProcessing}
                            onClick={() => handleSingleCheckIn(row)}
                            className="h-7 px-2 text-[11px] font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                          >
                            <Check className="h-3 w-3 mr-0.5" /> Check In
                          </Button>
                        ) : (
                          <span className="text-[11px] font-bold text-emerald-600 flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Verified
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-3 bg-muted/20 border-t flex items-center justify-between sm:justify-between">
          <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5 text-primary" />
            <span>Audit log entries are written immutably to <code>attendance_audit_logs</code>.</span>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AttendanceReconciliationModal;
