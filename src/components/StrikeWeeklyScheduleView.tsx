import React, { useState, useMemo } from 'react';
import { STRIKE_SCHEDULES, StrikeScheduleSlot, generateStrikeClassesForDateRange } from '../constants/strikeSchedules';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, Sparkles, RefreshCw, CheckCircle2, Users, LayoutGrid, CalendarDays, ArrowRight } from 'lucide-react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { toast } from 'sonner';

interface StrikeWeeklyScheduleViewProps {
  initialBranch?: 'maxim' | 'mivida' | 'impact';
  userRole?: string;
  memberCategory?: string;
  onSelectSlot?: (slot: StrikeScheduleSlot, branchName: string) => void;
  className?: string;
}

const DAYS_ORDER: Array<{ dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6; label: string; full: string }> = [
  { dayOfWeek: 0, label: 'SUN', full: 'Sunday' },
  { dayOfWeek: 1, label: 'MON', full: 'Monday' },
  { dayOfWeek: 2, label: 'TUE', full: 'Tuesday' },
  { dayOfWeek: 3, label: 'WED', full: 'Wednesday' },
  { dayOfWeek: 4, label: 'THU', full: 'Thursday' },
  { dayOfWeek: 5, label: 'FRI', full: 'Friday' },
  { dayOfWeek: 6, label: 'SAT', full: 'Saturday' },
];

export default function StrikeWeeklyScheduleView({
  initialBranch = 'maxim',
  userRole,
  memberCategory,
  onSelectSlot,
  className = ''
}: StrikeWeeklyScheduleViewProps) {
  const [selectedBranch, setSelectedBranch] = useState<'maxim' | 'mivida' | 'impact'>(initialBranch);
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'Kids' | 'Juniors' | 'Adults'>('ALL');
  const [layoutMode, setLayoutMode] = useState<'day' | 'grid'>('day');
  const currentDayOfWeek = (new Date().getDay()) as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const [activeDay, setActiveDay] = useState<0 | 1 | 2 | 3 | 4 | 5 | 6>(currentDayOfWeek);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const canManage = ['admin', 'manager', 'super_admin', 'crm_admin'].includes(userRole || '');

  const currentSchedule = STRIKE_SCHEDULES[selectedBranch];

  // Distinct time slots for the branch
  const timeSlots = useMemo(() => {
    const times = new Set<string>();
    currentSchedule.slots.forEach(s => times.add(s.timeDisplay));
    const order = ['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
    return order.filter(t => times.has(t));
  }, [currentSchedule]);

  // Slots for currently active day in day-view
  const activeDaySlots = useMemo(() => {
    return currentSchedule.slots.filter(s => {
      const matchDay = s.dayOfWeek === activeDay;
      const matchCat = categoryFilter === 'ALL' || s.category === categoryFilter;
      return matchDay && matchCat;
    }).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [currentSchedule, activeDay, categoryFilter]);

  const isCurrentDayOff = useMemo(() => {
    if (selectedBranch === 'maxim' && activeDay === 5) return true; // Maxim Friday OFF
    if (selectedBranch === 'impact' && activeDay === 4) return true; // Impact Thursday OFF
    return false;
  }, [selectedBranch, activeDay]);

  const handleSeedSchedulesToFirestore = async () => {
    if (!canManage) return;
    setIsSeeding(true);
    setSeedSuccess(false);

    try {
      const classesToSeed = generateStrikeClassesForDateRange(new Date(), 60, selectedBranch);
      const chunkSize = 400;
      for (let i = 0; i < classesToSeed.length; i += chunkSize) {
        const chunk = classesToSeed.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        for (const item of chunk) {
          const ref = doc(db, 'classSchedules', item.id);
          batch.set(ref, item, { merge: true });
        }
        await batch.commit();
      }

      setSeedSuccess(true);
      toast.success(`Successfully populated 60 days of ${currentSchedule.displayName} classes!`);
      setTimeout(() => setSeedSuccess(false), 4000);
    } catch (err: any) {
      console.error('Error seeding schedule to Firestore:', err);
      toast.error(err?.message || 'Failed to sync schedule into Firestore.');
    } finally {
      setIsSeeding(false);
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    if (category === 'Kids') {
      return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    }
    if (category === 'Juniors') {
      return 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20';
    }
    return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ── Top Header Card (Clean on White & Dark) ── */}
      <div className="bg-card text-card-foreground p-4 sm:p-5 rounded-2xl border border-border/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] uppercase font-bold tracking-wider">
                Official Schedule
              </Badge>
              <span className="text-xs text-muted-foreground font-medium">Weekly Timetable</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-foreground uppercase mt-1">
              {currentSchedule.title}
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>{currentSchedule.branchName}</span>
            </p>
          </div>

          {/* Controls: Branch Switcher & Admin Sync */}
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleSeedSchedulesToFirestore}
                disabled={isSeeding}
                className="h-8 text-xs font-semibold rounded-xl border-border gap-1.5"
              >
                {isSeeding ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : seedSuccess ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                )}
                <span>{isSeeding ? 'Syncing...' : seedSuccess ? 'Synced!' : 'Sync 60 Days'}</span>
              </Button>
            )}

            {/* View Mode Switcher (Day vs Grid) */}
            <div className="flex items-center bg-muted p-1 rounded-xl border border-border/60">
              <button
                type="button"
                onClick={() => setLayoutMode('day')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  layoutMode === 'day'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Easy mobile day-by-day view"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Day</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('grid')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                  layoutMode === 'grid'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Full weekly grid"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Branch Tabs ── */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/70 rounded-xl border border-border/60">
          {(['maxim', 'mivida', 'impact'] as const).map(bKey => {
            const isActive = selectedBranch === bKey;
            const bConfig = STRIKE_SCHEDULES[bKey];
            return (
              <button
                key={bKey}
                type="button"
                onClick={() => setSelectedBranch(bKey)}
                className={`py-2 px-2 text-xs font-bold rounded-lg transition-all text-center truncate ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }`}
              >
                {bConfig.displayName}
              </button>
            );
          })}
        </div>

        {/* ── Category Filter Pills ── */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mr-1 shrink-0">
            Programs:
          </span>
          {(['ALL', 'Adults', 'Juniors', 'Kids'] as const).map(cat => {
            const isCatActive = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all shrink-0 border ${
                  isCatActive
                    ? 'bg-foreground text-background border-foreground shadow-xs'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-border/80'
                }`}
              >
                {cat === 'ALL' ? 'All Classes' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── MODE A: Mobile-First Day Focus View (Clean, Easy UX) ── */}
      {layoutMode === 'day' ? (
        <div className="space-y-3">
          {/* Day of week ribbon */}
          <div className="grid grid-cols-7 gap-1 bg-card p-1.5 rounded-2xl border border-border/80 shadow-xs">
            {DAYS_ORDER.map(({ dayOfWeek, label }) => {
              const isSelected = activeDay === dayOfWeek;
              const isToday = dayOfWeek === currentDayOfWeek;
              const isOff = (selectedBranch === 'maxim' && dayOfWeek === 5) || (selectedBranch === 'impact' && dayOfWeek === 4);
              const daySlotCount = currentSchedule.slots.filter(s => {
                const matchDay = s.dayOfWeek === dayOfWeek;
                const matchCat = categoryFilter === 'ALL' || s.category === categoryFilter;
                return matchDay && matchCat;
              }).length;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => setActiveDay(dayOfWeek)}
                  className={`py-2 px-1 flex flex-col items-center rounded-xl transition-all relative ${
                    isSelected
                      ? 'bg-primary text-primary-foreground shadow-xs font-bold'
                      : isToday
                      ? 'bg-primary/10 text-primary border border-primary/20 font-semibold'
                      : 'text-muted-foreground hover:bg-muted/60 font-medium'
                  }`}
                >
                  <span className="text-[10px] tracking-wider uppercase opacity-90">{label}</span>
                  {isOff ? (
                    <span className="text-[9px] mt-0.5 opacity-60 font-bold uppercase">Off</span>
                  ) : (
                    <span className="text-xs font-mono font-bold mt-0.5">{daySlotCount}</span>
                  )}
                  {isToday && !isSelected && (
                    <span className="h-1 w-1 rounded-full bg-primary mt-1" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Day Header */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <span>{DAYS_ORDER.find(d => d.dayOfWeek === activeDay)?.full}</span>
              {activeDay === currentDayOfWeek && (
                <Badge variant="outline" className="text-[9px] font-bold text-primary border-primary/30 bg-primary/5 py-0 px-1.5 h-4">
                  Today
                </Badge>
              )}
            </h3>
            <span className="text-xs text-muted-foreground">
              {activeDaySlots.length} {activeDaySlots.length === 1 ? 'session' : 'sessions'}
            </span>
          </div>

          {/* Day Slots List */}
          {isCurrentDayOff ? (
            <Card className="border border-dashed border-border/80 bg-muted/20 rounded-2xl">
              <CardContent className="py-12 text-center text-muted-foreground space-y-2">
                <Clock className="h-8 w-8 mx-auto opacity-30 text-muted-foreground" />
                <p className="font-bold text-sm text-foreground">Club Rest Day</p>
                <p className="text-xs text-muted-foreground">
                  No classes scheduled at {currentSchedule.displayName} on {DAYS_ORDER.find(d => d.dayOfWeek === activeDay)?.full}s.
                </p>
              </CardContent>
            </Card>
          ) : activeDaySlots.length === 0 ? (
            <Card className="border border-dashed border-border/80 bg-muted/20 rounded-2xl">
              <CardContent className="py-10 text-center text-muted-foreground text-xs space-y-1">
                <p className="font-bold text-foreground">No classes matching "{categoryFilter}" on this day.</p>
                <p className="text-muted-foreground">Try selecting "All Classes" to see everything scheduled.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2.5">
              {activeDaySlots.map(slot => (
                <div
                  key={`${slot.dayOfWeek}_${slot.startTime}_${slot.className}`}
                  className="bg-card border border-border/80 rounded-2xl p-4 shadow-xs hover:border-primary/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 text-xs font-mono font-bold text-foreground">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>{slot.timeDisplay}</span>
                      </div>
                      <Badge variant="outline" className={`text-[10px] font-bold py-0.5 px-2 rounded-md ${getCategoryBadgeClass(slot.category)}`}>
                        {slot.category}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-border/80 py-0.5 px-2">
                        {slot.tier}
                      </Badge>
                    </div>

                    <h4 className="text-sm font-black uppercase text-foreground tracking-tight">
                      {slot.className}
                    </h4>

                    <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" /> Cap: {slot.capacity}
                      </span>
                      <span>•</span>
                      <span>Coach Strike Team</span>
                    </div>
                  </div>

                  {onSelectSlot && (
                    <Button
                      size="sm"
                      className="h-9 px-4 text-xs font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shrink-0 shadow-xs"
                      onClick={() => onSelectSlot(slot, currentSchedule.branchName)}
                    >
                      <span>Book Class</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ── MODE B: Full Weekly Grid (Clean Light Card Design) ── */
        <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-xs">
          <div className="min-w-[760px]">
            {/* Table Header: Days */}
            <div className="grid grid-cols-8 border-b border-border bg-muted/50 p-3 text-center font-bold text-xs uppercase tracking-wider">
              <div className="text-muted-foreground flex items-center justify-center gap-1">
                <Clock className="h-3.5 w-3.5" /> Time
              </div>
              {DAYS_ORDER.map(({ dayOfWeek, label }) => {
                const isToday = dayOfWeek === currentDayOfWeek;
                return (
                  <div
                    key={label}
                    className={`py-1.5 px-1 rounded-lg font-black tracking-wider transition-colors ${
                      isToday ? 'bg-primary/10 text-primary border border-primary/30' : 'text-foreground'
                    }`}
                  >
                    <span>{label}</span>
                    {isToday && <span className="block text-[9px] font-bold text-primary tracking-normal">(Today)</span>}
                  </div>
                );
              })}
            </div>

            {/* Table Rows: Time Slots */}
            <div className="divide-y divide-border/60">
              {timeSlots.map(time => (
                <div key={time} className="grid grid-cols-8 p-2.5 items-stretch min-h-[90px] gap-2">
                  {/* Time Label Column */}
                  <div className="flex items-center justify-center font-black text-xs text-muted-foreground bg-muted/40 rounded-xl border border-border/40 p-2 font-mono">
                    {time}
                  </div>

                  {/* Day Columns */}
                  {DAYS_ORDER.map(({ dayOfWeek, label }) => {
                    const isImpactOffThursday = selectedBranch === 'impact' && dayOfWeek === 4;
                    const isMaximOffFriday = selectedBranch === 'maxim' && dayOfWeek === 5;
                    const isOffDay = isImpactOffThursday || isMaximOffFriday;

                    const slot = currentSchedule.slots.find(
                      s => s.dayOfWeek === dayOfWeek && s.timeDisplay === time
                    );

                    const isMatch = slot && (categoryFilter === 'ALL' || slot.category === categoryFilter);

                    if (isOffDay) {
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-center bg-muted/20 border border-dashed border-border/40 rounded-xl text-muted-foreground/60 font-bold text-xs uppercase"
                        >
                          OFF
                        </div>
                      );
                    }

                    if (!slot || !isMatch) {
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-center bg-muted/10 border border-border/30 rounded-xl text-muted-foreground/40 text-xs font-mono"
                        >
                          —
                        </div>
                      );
                    }

                    return (
                      <div
                        key={label}
                        onClick={() => onSelectSlot?.(slot, currentSchedule.branchName)}
                        className={`flex flex-col justify-between p-2 rounded-xl border transition-all ${getCategoryBadgeClass(slot.category)} ${
                          onSelectSlot ? 'cursor-pointer hover:shadow-xs hover:scale-[1.02] active:scale-95' : ''
                        }`}
                      >
                        <div>
                          <div className="text-[11px] font-black tracking-tight leading-tight uppercase line-clamp-2 text-foreground">
                            {slot.className}
                          </div>
                          <div className="text-[9px] opacity-80 mt-1 font-semibold">
                            {slot.tier}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-border/40 text-[9px] opacity-80">
                          <span>Cap: {slot.capacity}</span>
                          {onSelectSlot && (
                            <span className="font-bold text-primary hover:underline">Book →</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
        <div className="bg-card border border-border/80 rounded-xl p-3 flex items-center gap-2.5 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-black text-xs flex items-center justify-center">
            K
          </div>
          <div>
            <div className="font-bold text-xs text-foreground">Kids / Pro Classes</div>
            <p className="text-[10px] text-muted-foreground">All Kids & Kids Pro members</p>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-xl p-3 flex items-center gap-2.5 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 font-black text-xs flex items-center justify-center">
            J
          </div>
          <div>
            <div className="font-bold text-xs text-foreground">Juniors / Advanced</div>
            <p className="text-[10px] text-muted-foreground">All Junior members</p>
          </div>
        </div>

        <div className="bg-card border border-border/80 rounded-xl p-3 flex items-center gap-2.5 shadow-xs">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black text-xs flex items-center justify-center">
            A
          </div>
          <div>
            <div className="font-bold text-xs text-foreground">Adult Boxing & Cond.</div>
            <p className="text-[10px] text-muted-foreground">Adult members across all branches</p>
          </div>
        </div>
      </div>
    </div>
  );
}
