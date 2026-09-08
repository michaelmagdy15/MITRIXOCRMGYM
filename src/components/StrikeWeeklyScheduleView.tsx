import React, { useState, useMemo } from 'react';
import { STRIKE_SCHEDULES, StrikeScheduleSlot, generateStrikeClassesForDateRange } from '../constants/strikeSchedules';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar as CalendarIcon, Clock, MapPin, Sparkles, RefreshCw, CheckCircle2, Users, ShieldAlert } from 'lucide-react';
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
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  const canManage = ['admin', 'manager', 'super_admin', 'crm_admin'].includes(userRole || '');
  const currentDayOfWeek = new Date().getDay();

  const currentSchedule = STRIKE_SCHEDULES[selectedBranch];

  // Distinct time slots present for the branch
  const timeSlots = useMemo(() => {
    const times = new Set<string>();
    currentSchedule.slots.forEach(s => times.add(s.timeDisplay));
    // Sort chronologically (5:00 PM -> 6:00 PM -> 7:00 PM -> 8:00 PM -> 9:00 PM)
    const order = ['5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
    return order.filter(t => times.has(t));
  }, [currentSchedule]);

  // One-click seed to Firestore classSchedules
  const handleSeedSchedulesToFirestore = async () => {
    if (!canManage) return;
    setIsSeeding(true);
    setSeedSuccess(false);

    try {
      // Generate 60 days of classes for the selected branch (or all branches)
      const classesToSeed = generateStrikeClassesForDateRange(new Date(), 60, selectedBranch);
      
      // Batch write in chunks of 450 (Firestore limit is 500)
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

  const getSlotBadgeStyle = (slot: StrikeScheduleSlot) => {
    if (slot.category === 'Kids') {
      return 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:border-amber-400';
    }
    if (slot.category === 'Juniors') {
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:border-indigo-400';
    }
    return 'bg-zinc-800 text-zinc-200 border-zinc-700 hover:border-zinc-500';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ── Header & Location Tabs ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-950 p-5 rounded-2xl border border-zinc-800 shadow-xl">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/20 text-[10px] uppercase tracking-wider font-bold">
              Strike Gym Official
            </Badge>
            <span className="text-xs text-zinc-500">• Weekly Timetable</span>
          </div>
          <h2 className="text-2xl font-black tracking-wider uppercase text-white mt-1">
            {currentSchedule.title}
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-rose-500" />
            Location: <strong className="text-zinc-200">{currentSchedule.branchName}</strong>
          </p>
        </div>

        {/* Branch Selector Tabs */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <Tabs value={selectedBranch} onValueChange={(v) => setSelectedBranch(v as any)}>
            <TabsList className="bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <TabsTrigger value="maxim" className="text-xs font-bold px-3 py-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                Maxim
              </TabsTrigger>
              <TabsTrigger value="mivida" className="text-xs font-bold px-3 py-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                Mivida
              </TabsTrigger>
              <TabsTrigger value="impact" className="text-xs font-bold px-3 py-1.5 data-[state=active]:bg-rose-600 data-[state=active]:text-white">
                Impact
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Admin / Manager One-Click Calendar Sync */}
          {canManage && (
            <Button
              size="sm"
              onClick={handleSeedSchedulesToFirestore}
              disabled={isSeeding}
              className="h-9 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 text-xs font-semibold rounded-xl flex items-center gap-1.5 shrink-0"
              title="Populate classSchedules in Firestore for next 60 days"
            >
              {isSeeding ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-rose-400" />
              ) : seedSuccess ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              )}
              {isSeeding ? 'Syncing...' : seedSuccess ? 'Synced 60 Days!' : 'Sync to Calendar'}
            </Button>
          )}
        </div>
      </div>

      {/* ── Category Filter Pills ── */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500 mr-2 shrink-0">Filter Tier:</span>
        {(['ALL', 'Kids', 'Juniors', 'Adults'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
              categoryFilter === cat
                ? 'bg-rose-600 text-white shadow-md shadow-rose-900/40'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            {cat === 'ALL' ? 'All Classes' : cat}
          </button>
        ))}
      </div>

      {/* ── Timetable Grid (Poster Design Match) ── */}
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="min-w-[760px]">
          {/* Table Header: Days */}
          <div className="grid grid-cols-8 border-b border-zinc-800/80 bg-zinc-900/80 p-3 text-center font-bold text-xs uppercase tracking-wider">
            <div className="text-zinc-500 flex items-center justify-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Time
            </div>
            {DAYS_ORDER.map(({ dayOfWeek, label }) => {
              const isToday = dayOfWeek === currentDayOfWeek;
              return (
                <div
                  key={label}
                  className={`py-1 rounded-lg font-black tracking-wider transition-colors ${
                    isToday ? 'bg-rose-600/20 text-rose-400 border border-rose-500/30' : 'text-zinc-300'
                  }`}
                >
                  {label}
                  {isToday && <span className="block text-[9px] font-medium text-rose-400 tracking-normal">(Today)</span>}
                </div>
              );
            })}
          </div>

          {/* Table Rows: Time Slots */}
          <div className="divide-y divide-zinc-800/50">
            {timeSlots.map(time => {
              return (
                <div key={time} className="grid grid-cols-8 p-2.5 items-stretch min-h-[85px] gap-2">
                  {/* Time Label Column */}
                  <div className="flex items-center justify-center font-black text-sm text-zinc-400 bg-zinc-900/40 rounded-xl border border-zinc-800/40 p-2">
                    {time}
                  </div>

                  {/* Day Columns */}
                  {DAYS_ORDER.map(({ dayOfWeek, label }) => {
                    // Check if Thursday is OFF on Impact or Friday is OFF on Maxim
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
                          className="flex items-center justify-center bg-zinc-900/20 border border-zinc-800/30 rounded-xl text-zinc-600 font-bold text-xs uppercase tracking-wider"
                        >
                          OFF
                        </div>
                      );
                    }

                    if (!slot) {
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-center bg-zinc-900/10 border border-zinc-900/40 rounded-xl text-zinc-700 text-xs font-mono"
                        >
                          —
                        </div>
                      );
                    }

                    if (!isMatch) {
                      return (
                        <div
                          key={label}
                          className="flex items-center justify-center bg-zinc-900/10 border border-zinc-900/30 rounded-xl text-zinc-700 text-xs opacity-30"
                        >
                          —
                        </div>
                      );
                    }

                    return (
                      <div
                        key={label}
                        onClick={() => onSelectSlot?.(slot, currentSchedule.branchName)}
                        className={`flex flex-col justify-between p-2.5 rounded-xl border transition-all ${getSlotBadgeStyle(slot)} ${
                          onSelectSlot ? 'cursor-pointer transform hover:scale-[1.02]' : ''
                        }`}
                      >
                        <div>
                          <div className="text-[11px] font-black tracking-tight leading-tight uppercase line-clamp-2">
                            {slot.className}
                          </div>
                          <div className="text-[10px] opacity-80 mt-1 font-medium">
                            {slot.tier}
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/10 text-[9px] opacity-75">
                          <span>Cap: {slot.capacity}</span>
                          {onSelectSlot && (
                            <span className="font-bold text-rose-400 hover:underline">Book →</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Legend / Quick Summary ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold text-xs">
              KP
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100">Kids / Pro Classes</div>
              <p className="text-[11px] text-zinc-400">Strictly for Kids Only & Kids Pro members.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs">
              JA
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100">Juniors / Advanced</div>
              <p className="text-[11px] text-zinc-400">Exclusive to Junior members & Juniors Pro.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border-zinc-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-xs">
              AD
            </div>
            <div>
              <div className="font-bold text-sm text-zinc-100">Adult Boxing & Conditioning</div>
              <p className="text-[11px] text-zinc-400">Available across Maxim, Mivida, and Impact.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
