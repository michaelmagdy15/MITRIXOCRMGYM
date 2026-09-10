import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Client } from '../types';
import { auth, db } from '../firebase';
import { collection, query, onSnapshot, getDocs, doc, writeBatch } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Clock, MapPin, Users as UsersIcon, CheckCircle2, AlertTriangle, Sparkles, ShoppingBag } from 'lucide-react';
import { format, addDays, parseISO, isToday, isSameDay, startOfDay } from 'date-fns';

import { ClassSchedule } from '../types/class';
import { ClassBookingDialog } from './components/ClassBookingDialog';
import { isSessionTierAllowed, isSessionBranchAllowed, getMemberCategory, normalizeBranchName } from '../utils/memberCategories';
import { getTenantId } from '../firebase';
import { useSettings } from '../contexts/SettingsContext';
import StrikeWeeklyScheduleView from '../components/StrikeWeeklyScheduleView';

export default function MemberClasses({ client, onSwitchToStore }: { client: Client | null; onSwitchToStore?: (packageId?: string) => void }) {
  const { branding } = useSettings();
  const [classes, setClasses] = useState<ClassSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionClassId, setActionClassId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(startOfDay(new Date()));
  const [selectedBookingClass, setSelectedBookingClass] = useState<ClassSchedule | null>(null);
  const [isBookingDialogOpen, setIsBookingDialogOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'calendar' | 'timetable'>('calendar');
  const dateScrollRef = useRef<HTMLDivElement>(null);

  const isStrike = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  // Generate date range: 7 days before and 14 days after today
  const dateRange = Array.from({ length: 21 }, (_, i) => addDays(new Date(), i - 7));

  useEffect(() => {
    let unsub: (() => void) | undefined;

    const init = async () => {
      const q = collection(db, 'classSchedules');
      unsub = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ClassSchedule));
        list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
        setClasses(list);
        setLoading(false);
      }, (err) => {
        console.error("Error loading classes:", err);
        setLoading(false);
      });
    };

    init().catch(err => {
      console.error("Failed to initialize MemberClasses:", err);
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Scroll to today on mount
  useEffect(() => {
    const el = dateScrollRef.current;
    if (el) {
      const todayBtn = el.querySelector('[data-today="true"]');
      if (todayBtn) {
        todayBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, []);

  const handleOpenBookingDialog = (gymClass: ClassSchedule) => {
    setSelectedBookingClass(gymClass);
    setIsBookingDialogOpen(true);
  };

  const handleLeaveBooking = async (gymClass: ClassSchedule) => {
    if (!client || !client.id) return;
    setActionClassId(gymClass.id);

    try {
      const token = await auth.currentUser?.getIdToken();
      const tenantId = getTenantId();
      const res = await fetch('/api/classes/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          classId: gymClass.id,
          action: 'leave',
          clientId: client.id,
          tenantId,
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Failed to cancel booking. Please try again.");
        return;
      }
    } catch (err) {
      console.error("Failed to leave class:", err);
      alert("Failed to cancel booking. Please try again.");
    } finally {
      setActionClassId(null);
    }
  };

  const handleSelectTimetableSlot = (slot: any, branchName: string) => {
    // Check branch access (Adults multi-branch, Youth home facility only)
    const isBranchAllowed = isSessionBranchAllowed(
      branchName,
      client?.branch || client?.homeBranch,
      Boolean(client?.has_multi_branch_access),
      memberCategory
    );

    if (!isBranchAllowed) {
      alert(`Youth memberships (${memberCategory}) are restricted to their registered facility (${client?.branch || client?.homeBranch || 'Maxim Compound'}).`);
      return;
    }

    const today = startOfDay(new Date());
    // Find the next upcoming occurrence of this class slot
    const matchingUpcoming = classes.filter(c => {
      try {
        const dateStr = getClassDateStr(c);
        if (!dateStr) return false;
        const classDate = parseISO(dateStr);
        if (classDate < today) return false;
        if (classDate.getDay() !== slot.dayOfWeek) return false;

        const branchMatches = isSessionBranchAllowed(c.branch, branchName, Boolean(client?.has_multi_branch_access), memberCategory);
        if (!branchMatches) return false;

        const sTime = c.startTime || '';
        const matchesTime = sTime.includes(`T${slot.startTime}`) || (c as any).time?.includes(slot.timeDisplay);
        return matchesTime;
      } catch {
        return false;
      }
    });

    matchingUpcoming.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

    if (matchingUpcoming.length > 0 && matchingUpcoming[0]) {
      handleOpenBookingDialog(matchingUpcoming[0]);
    } else {
      // Jump calendar to the next occurrence of this day of week
      const curDay = new Date().getDay();
      const daysUntil = (slot.dayOfWeek - curDay + 7) % 7;
      const targetDate = addDays(new Date(), daysUntil === 0 ? 0 : daysUntil);
      setSelectedDate(startOfDay(targetDate));
      setViewMode('calendar');
    }
  };

  const getClassDateStr = (c: ClassSchedule): string => {
    if ((c as any).date) return (c as any).date;
    if (c.startTime && c.startTime.length >= 10) return c.startTime.substring(0, 10);
    return '';
  };

  const getClassTimeDisplay = (c: ClassSchedule): string => {
    if ((c as any).time) return (c as any).time;
    if (c.startTime && c.endTime) {
      try {
        const s = new Date(c.startTime);
        const e = new Date(c.endTime);
        if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
          return `${s.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${e.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
      } catch { /* fallback */ }
      return `${c.startTime} - ${c.endTime}`;
    }
    return '10:00 - 11:15';
  };

  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'mine' | 'Kids' | 'Juniors' | 'Adults'>('mine');

  const memberCategory = useMemo(() => getMemberCategory(client), [client]);

  // Filter classes for selected date, client tier/category, and branch
  const filteredClasses = useMemo(() => {
    return classes.filter(c => {
      try {
        const dateStr = getClassDateStr(c);
        if (!dateStr) return false;
        const isDateMatch = isSameDay(parseISO(dateStr), selectedDate);
        if (!isDateMatch) return false;

        // Branch filter
        if (branchFilter !== 'all') {
          const bNorm = normalizeBranchName(c.branch);
          if (bNorm !== branchFilter) return false;
        }

        // Category filter
        if (categoryFilter === 'mine') {
          const isTierMatch = isSessionTierAllowed(
            c as any,
            memberCategory
          );
          if (!isTierMatch) return false;

          // RBAC Branch Gating: Youth restricted to home facility, Adults unrestricted
          const isBranchAllowed = isSessionBranchAllowed(
            c.branch,
            client?.branch || client?.homeBranch,
            Boolean(client?.has_multi_branch_access),
            memberCategory
          );
          if (!isBranchAllowed) return false;
        } else if (categoryFilter === 'Adults') {
          const t = ((c as any).tier || '').toLowerCase();
          const n = (c.name || '').toLowerCase();
          const cat = ((c as any).category || '').toLowerCase();
          return t.includes('adult') || n.includes('adult') || cat.includes('adult');
        } else if (categoryFilter === 'Kids') {
          const t = ((c as any).tier || '').toLowerCase();
          const n = (c.name || '').toLowerCase();
          const cat = ((c as any).category || '').toLowerCase();
          return t.includes('kid') || n.includes('kid') || cat.includes('kid');
        } else if (categoryFilter === 'Juniors') {
          const t = ((c as any).tier || '').toLowerCase();
          const n = (c.name || '').toLowerCase();
          const cat = ((c as any).category || '').toLowerCase();
          return t.includes('junior') || n.includes('junior') || cat.includes('junior');
        }

        return true;
      } catch { return false; }
    });
  }, [classes, selectedDate, branchFilter, categoryFilter, memberCategory, client?.branch, client?.homeBranch, client?.has_multi_branch_access]);

  // Count classes per date for dot indicators
  const classCountByDate = useMemo(() => {
    const map = new Map<string, number>();
    classes.forEach(c => {
      if (branchFilter !== 'all') {
        const bNorm = normalizeBranchName(c.branch);
        if (bNorm !== branchFilter) return;
      }

      if (categoryFilter === 'mine') {
        const isTierMatch = isSessionTierAllowed(
          c as any,
          memberCategory
        );
        if (!isTierMatch) return;

        const isBranchAllowed = isSessionBranchAllowed(
          c.branch,
          client?.branch || client?.homeBranch,
          Boolean(client?.has_multi_branch_access),
          memberCategory
        );
        if (!isBranchAllowed) return;
      } else if (categoryFilter === 'Adults') {
        const t = ((c as any).tier || '').toLowerCase();
        const n = (c.name || '').toLowerCase();
        const cat = ((c as any).category || '').toLowerCase();
        if (!t.includes('adult') && !n.includes('adult') && !cat.includes('adult')) return;
      } else if (categoryFilter === 'Kids') {
        const t = ((c as any).tier || '').toLowerCase();
        const n = (c.name || '').toLowerCase();
        const cat = ((c as any).category || '').toLowerCase();
        if (!t.includes('kid') && !n.includes('kid') && !cat.includes('kid')) return;
      } else if (categoryFilter === 'Juniors') {
        const t = ((c as any).tier || '').toLowerCase();
        const n = (c.name || '').toLowerCase();
        const cat = ((c as any).category || '').toLowerCase();
        if (!t.includes('junior') && !n.includes('junior') && !cat.includes('junior')) return;
      }

      const key = getClassDateStr(c);
      if (key) {
        map.set(key, (map.get(key) || 0) + 1);
      }
    });
    return map;
  }, [classes, branchFilter, categoryFilter, memberCategory]);

  // If currently selected date has 0 classes, but there are classes on other dates, find the next date with classes
  const nextDateWithClasses = useMemo(() => {
    const today = startOfDay(new Date());
    for (const c of classes) {
      const dStr = getClassDateStr(c);
      if (dStr) {
        try {
          const d = parseISO(dStr);
          if (d >= today && !isSameDay(d, selectedDate)) {
            return d;
          }
        } catch { /* ignore */ }
      }
    }
    return null;
  }, [classes, selectedDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" /> Class Schedule
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">Select a date to view and reserve sessions</p>
        </div>
        {onSwitchToStore && (
          <Button 
            onClick={() => onSwitchToStore?.()} 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs font-semibold border-border rounded-xl flex items-center gap-1.5 shrink-0 bg-card shadow-xs"
          >
            <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" /> Packages
          </Button>
        )}
      </div>

      {/* View Switcher for Strike Gym */}
      {isStrike && (
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-xl border border-border/60 w-fit">
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'calendar'
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="h-3.5 w-3.5" />
            Day-by-Day
          </button>
          <button
            type="button"
            onClick={() => setViewMode('timetable')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              viewMode === 'timetable'
                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Weekly Timetable (Maxim, Mivida, Impact)
          </button>
        </div>
      )}

      {viewMode === 'timetable' && isStrike ? (
        <StrikeWeeklyScheduleView
          initialBranch={
            (client?.branch || '').toLowerCase().includes('mivida') ? 'mivida' :
            (client?.branch || '').toLowerCase().includes('impact') ? 'impact' : 'maxim'
          }
          memberCategory={memberCategory}
          userRole="client"
          onSelectSlot={(slot, branchName) => {
            handleSelectTimetableSlot(slot, branchName);
          }}
        />
      ) : (
        <>
          {/* Branch & Program Filters for Strike */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">
                Location:
              </span>
              {[
                { id: 'all', label: 'All Branches' },
                { id: 'maxim', label: 'Maxim' },
                { id: 'mivida', label: 'Mivida' },
                { id: 'impact', label: 'Impact' },
              ].map(b => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBranchFilter(b.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                    branchFilter === b.id
                      ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                      : 'bg-card text-muted-foreground hover:text-foreground border-border/80'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mr-1 shrink-0">
                Programs:
              </span>
              {[
                { id: 'mine', label: `My Plan (${memberCategory})` },
                { id: 'all', label: 'All Classes' },
                { id: 'Juniors', label: 'Juniors' },
                { id: 'Kids', label: 'Kids' },
                { id: 'Adults', label: 'Adults' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 border ${
                    categoryFilter === cat.id
                      ? 'bg-foreground text-background border-foreground shadow-xs'
                      : 'bg-card text-muted-foreground hover:text-foreground border-border/80'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* ─── Horizontal Date Ribbon ─── */}
          <div className="relative">
            <div
              ref={dateScrollRef}
              className="flex gap-1.5 overflow-x-auto no-scrollbar py-1 px-0.5"
            >
              {dateRange.map((date, idx) => {
                const dateKey = format(date, 'yyyy-MM-dd');
                const isSelected = isSameDay(date, selectedDate);
                const today = isToday(date);
                const hasClasses = (classCountByDate.get(dateKey) || 0) > 0;

                return (
                  <button
                    key={idx}
                    data-today={today ? 'true' : undefined}
                    onClick={() => setSelectedDate(startOfDay(date))}
                    className={`flex flex-col items-center min-w-[50px] py-2 px-1 rounded-xl transition-all duration-150 shrink-0 ${
                      isSelected
                        ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                        : today
                        ? 'bg-card text-foreground border border-border font-semibold'
                        : 'text-muted-foreground hover:bg-muted/50 font-medium'
                    }`}
                  >
                    <span className="text-[10px] uppercase tracking-wider opacity-80">
                      {format(date, 'EEE')}
                    </span>
                    <span className="text-base font-bold leading-none mt-1 font-mono">
                      {format(date, 'd')}
                    </span>
                    <span className="text-[9px] mt-0.5 uppercase opacity-70">
                      {format(date, 'MMM')}
                    </span>
                    {/* Activity dot */}
                    {hasClasses && (
                      <div className={`h-1 w-1 rounded-full mt-1.5 ${
                        isSelected ? 'bg-primary-foreground' : 'bg-primary'
                      }`} />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ─── Selected Date Header ─── */}
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {isToday(selectedDate) ? 'Today' : format(selectedDate, 'EEEE, dd MMM')}
            </p>
            <span className="text-xs text-muted-foreground font-medium">
              {filteredClasses.length} {filteredClasses.length === 1 ? 'class' : 'classes'}
            </span>
          </div>

          {/* ─── Class Cards ─── */}
          <div className="space-y-2.5">
            {filteredClasses.length === 0 ? (
              <Card className="border border-border/60 bg-card rounded-2xl">
                <CardContent className="py-10 text-center text-muted-foreground text-xs space-y-2">
                  <Calendar className="h-6 w-6 mx-auto opacity-30" />
                  <p className="font-semibold text-foreground">
                    No classes scheduled for {isToday(selectedDate) ? 'today' : format(selectedDate, 'dd MMM')}.
                  </p>
                  {nextDateWithClasses && (
                    <div className="pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold rounded-xl gap-1.5 text-primary border-primary/30 hover:bg-primary/10"
                        onClick={() => setSelectedDate(nextDateWithClasses)}
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Jump to next class on {format(nextDateWithClasses, 'EEEE, dd MMM')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              filteredClasses.map(gymClass => {
                const isBooked = client ? (
                  (gymClass.attendees || []).includes(client.id) ||
                  Boolean(client.memberId && (gymClass.attendees || []).includes(client.memberId)) ||
                  Boolean(client.portalUserId && (gymClass.attendees || []).includes(client.portalUserId))
                ) : false;
                const isWaitlisted = client ? (
                  (gymClass.waitlist || []).includes(client.id) ||
                  Boolean(client.memberId && (gymClass.waitlist || []).includes(client.memberId)) ||
                  Boolean(client.portalUserId && (gymClass.waitlist || []).includes(client.portalUserId))
                ) : false;
                const isFull = (gymClass.attendees || []).length >= gymClass.capacity;
                const spotsLeft = Math.max(0, gymClass.capacity - (gymClass.attendees || []).length);

                return (
                  <Card key={gymClass.id} className={`border border-border/60 bg-card rounded-2xl shadow-xs transition-all ${isBooked ? 'border-primary/40 bg-primary/5' : ''} ${isWaitlisted ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-[9px] uppercase tracking-wider font-bold py-0.5 px-2 rounded-md ${
                              (gymClass.category || '').toLowerCase().includes('kid') ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20' :
                              (gymClass.category || '').toLowerCase().includes('junior') ? 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20' :
                              'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            }`}>
                              {(gymClass.category || 'Class')}
                            </Badge>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                              (gymClass.branch || '').toLowerCase().includes('maxim') ? 'text-rose-600 bg-rose-500/10 border-rose-500/20' :
                              (gymClass.branch || '').toLowerCase().includes('mivida') ? 'text-sky-600 bg-sky-500/10 border-sky-500/20' :
                              'text-amber-600 bg-amber-500/10 border-amber-500/20'
                            }`}>
                              {gymClass.branch}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-foreground leading-snug tracking-tight">{gymClass.name}</h4>
                          {((gymClass as any).coachName || gymClass.instructorName) && (
                            <p className="text-xs text-muted-foreground font-medium">
                              Coach {(gymClass as any).coachName || gymClass.instructorName}
                            </p>
                          )}
                        </div>

                        <div className="text-right flex flex-col items-end">
                          <div className="flex items-center gap-1 text-xs font-mono font-semibold text-foreground">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            {getClassTimeDisplay(gymClass)}
                          </div>
                        </div>
                      </div>

                      {(gymClass as any).description && (
                        <p className="text-xs text-muted-foreground bg-muted/40 p-2.5 rounded-xl border border-border/40 leading-relaxed">
                          {(gymClass as any).description}
                        </p>
                      )}

                      <div className="flex items-center justify-between border-t border-border/60 pt-2.5 mt-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                          <UsersIcon className="h-3.5 w-3.5" />
                          <span>{(gymClass.attendees || []).length} / {gymClass.capacity} Joined</span>
                          {isWaitlisted && (
                            <Badge variant="outline" className="text-[9px] font-bold text-amber-500 border-amber-500/30 bg-amber-500/10 ml-1.5">
                              Waitlisted (#{(gymClass.waitlist || []).indexOf(client?.id || '') + 1})
                            </Badge>
                          )}
                          {spotsLeft <= 3 && spotsLeft > 0 && !isBooked && !isWaitlisted && (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[9px] font-bold ml-1.5">
                              {spotsLeft} spots left
                            </Badge>
                          )}
                        </div>

                        {isBooked || isWaitlisted ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 border-border text-muted-foreground hover:text-foreground transition-all text-xs font-semibold rounded-xl"
                            onClick={() => handleLeaveBooking(gymClass)}
                            disabled={actionClassId === gymClass.id}
                          >
                            {isWaitlisted ? 'Leave Waitlist' : 'Leave'}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="h-8 text-xs font-semibold rounded-xl px-3.5"
                            onClick={() => handleOpenBookingDialog(gymClass)}
                            disabled={actionClassId === gymClass.id}
                          >
                            {isFull ? 'Join Waitlist' : 'Book Class'}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </>
      )}

      {/* ─── Interactive Class Booking Dialog ─── */}
      <ClassBookingDialog
        open={isBookingDialogOpen}
        onOpenChange={setIsBookingDialogOpen}
        gymClass={selectedBookingClass}
        client={client}
        onSwitchToStore={onSwitchToStore}
      />
    </div>
  );
}
