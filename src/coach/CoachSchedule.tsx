import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../firebase';
import { 
  doc, getDoc, setDoc, updateDoc, addDoc, 
  collection, query, where, onSnapshot, getDocs 
} from 'firebase/firestore';
import { CoachSchedule as CoachScheduleType, Session, SessionType, SessionStatus, Client } from '../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { 
  Save, Calendar, Users, Target, UserPlus, FileHeart, 
  Clock, Plus, Check, CheckCircle2, XCircle, Ban, 
  ChevronLeft, ChevronRight, Copy, Lock, Unlock, 
  Sliders, CalendarDays, Coffee, Search, Phone, 
  AlertCircle, Dumbbell, Sparkles, Flame
} from 'lucide-react';
import { format, addDays, subDays, startOfWeek, isSameDay, isToday } from 'date-fns';
import { toValidDate } from '../utils/dateUtils';

const SESSION_TYPES: { key: SessionType; label: string; icon: any; defaultMax: number; badgeColor: string }[] = [
  { key: '1-on-1', label: '1-on-1', icon: Target, defaultMax: 1, badgeColor: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50' },
  { key: 'Partner', label: 'Partner', icon: UserPlus, defaultMax: 2, badgeColor: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200/50' },
  { key: 'Small Group', label: 'Small Group', icon: Users, defaultMax: 5, badgeColor: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50' },
  { key: 'Class', label: 'Class', icon: Users, defaultMax: 15, badgeColor: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50' },
  { key: 'Nutrition', label: 'Nutrition', icon: FileHeart, defaultMax: 1, badgeColor: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200/50' },
];

const DAYS = [
  { key: 'monday',    label: 'Monday',    short: 'Mon' },
  { key: 'tuesday',   label: 'Tuesday',   short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday',  label: 'Thursday',  short: 'Thu' },
  { key: 'friday',    label: 'Friday',    short: 'Fri' },
  { key: 'saturday',  label: 'Saturday',  short: 'Sat' },
  { key: 'sunday',    label: 'Sunday',    short: 'Sun' },
];

const DEFAULT_SCHEDULE: CoachScheduleType['days'] = Object.fromEntries(
  DAYS.map(d => [
    d.key, 
    { 
      enabled: d.key !== 'sunday', 
      startTime: '09:00', 
      endTime: '21:00',
      slotDurationMinutes: 60,
      blockedSlots: [],
      capacities: {
        '1-on-1': 1,
        'Partner': 2,
        'Small Group': 5,
        'Class': 15,
        'Nutrition': 1
      }
    }
  ])
);

const STATUS_STYLES: Record<SessionStatus, { badge: string; icon: React.ReactNode }> = {
  Scheduled:   { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200/50', icon: <Clock className="h-3 w-3" /> },
  Completed:   { badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50', icon: <CheckCircle2 className="h-3 w-3" /> },
  Attended:    { badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200/50', icon: <CheckCircle2 className="h-3 w-3" /> },
  'No Show':   { badge: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200/50 line-through', icon: <XCircle className="h-3 w-3" /> },
  Rescheduled: { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200/50', icon: <Clock className="h-3 w-3" /> },
  Cancelled:   { badge: 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50', icon: <Ban className="h-3 w-3" /> },
};

function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeTo12h(timeStr: string): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr || '0', 10);
  const m = mStr || '00';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

export default function CoachSchedule({ 
  onStartFloor 
}: { 
  onStartFloor?: (client?: Client, session?: Session) => void; 
} = {}) {
  const { currentUser } = useAuth();
  const [activeView, setActiveView] = useState<'timetable' | 'settings'>('timetable');
  const [schedule, setSchedule] = useState<CoachScheduleType['days']>(DEFAULT_SCHEDULE);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Selected date for visual timetable
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Real-time coach sessions
  const [sessions, setSessions] = useState<Session[]>([]);
  // All clients for assignment modal
  const [clients, setClients] = useState<Client[]>([]);

  // Assign Member Dialog State
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignSlot, setAssignSlot] = useState<{ startTime: string; endTime: string } | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedSessionType, setSelectedSessionType] = useState<SessionType>('1-on-1');
  const [sessionNotes, setSessionNotes] = useState('');
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Session Details / Actions Dialog State
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isUpdatingSession, setIsUpdatingSession] = useState(false);

  // 1. Fetch coach schedule
  useEffect(() => {
    if (!currentUser) return;
    const fetch = async () => {
      try {
        const ref = doc(db, 'coachSchedules', currentUser.id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const dataDays = snap.data().days;
          // Merge with default schedule to ensure all keys exist
          const merged: CoachScheduleType['days'] = {};
          DAYS.forEach(d => {
            merged[d.key] = {
              ...DEFAULT_SCHEDULE[d.key]!,
              ...(dataDays?.[d.key] || {})
            };
          });
          setSchedule(merged);
        }
      } catch (err) {
        console.error("Error fetching coach schedule:", err);
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, [currentUser?.id]);

  // 2. Subscribe to real-time sessions for this coach
  useEffect(() => {
    if (!currentUser) return;
    const q1 = query(collection(db, 'sessions'), where('coachId', '==', currentUser.id));
    const unsub = onSnapshot(q1, (snap) => {
      const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Session));
      setSessions(list);
    }, (err) => {
      console.warn("Falling back to trainerId for coach sessions:", err);
      const q2 = query(collection(db, 'sessions'), where('trainerId', '==', currentUser.id));
      onSnapshot(q2, (snap2) => {
        const list2 = snap2.docs.map(d => ({ ...d.data(), id: d.id } as Session));
        setSessions(list2);
      });
    });

    return () => unsub();
  }, [currentUser?.id]);

  // 3. Fetch clients for assignment
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const snap = await getDocs(collection(db, 'clients'));
        const list = snap.docs.map(d => ({ ...d.data(), id: d.id } as Client));
        list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setClients(list);
      } catch (err) {
        console.error("Error fetching clients for coach timetable:", err);
      }
    };
    fetchClients();
  }, []);

  // Save full schedule to Firestore
  const handleSave = async (customSchedule?: CoachScheduleType['days']) => {
    if (!currentUser) return;
    const toSave = customSchedule || schedule;
    setIsSaving(true);
    try {
      await setDoc(doc(db, 'coachSchedules', currentUser.id), {
        coachId: currentUser.id,
        days: toSave,
        updatedAt: new Date().toISOString(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error("Error saving coach schedule:", err);
      alert("Failed to save schedule.");
    } finally {
      setIsSaving(false);
    }
  };

  // Update schedule state helpers
  const updateDayField = (day: string, field: string, value: any) => {
    setSchedule(prev => ({
      ...prev,
      [day]: { ...prev[day]!, [field]: value },
    }));
  };

  const updateCapacity = (day: string, type: SessionType, delta: number) => {
    setSchedule(prev => {
      const current = prev[day]?.capacities?.[type] ?? DEFAULT_SCHEDULE[day]?.capacities?.[type] ?? 1;
      const nextVal = Math.max(1, Math.min(30, current + delta));
      return {
        ...prev,
        [day]: {
          ...prev[day]!,
          capacities: {
            ...(prev[day]?.capacities || {}),
            [type]: nextVal
          }
        }
      };
    });
  };

  const setCapacityValue = (day: string, type: SessionType, value: number) => {
    setSchedule(prev => ({
      ...prev,
      [day]: {
        ...prev[day]!,
        capacities: {
          ...(prev[day]?.capacities || {}),
          [type]: Math.max(1, value)
        }
      }
    }));
  };

  // Copy one day's schedule to all weekdays or all days
  const copyDaySchedule = (fromDayKey: string, target: 'weekdays' | 'all') => {
    const source = schedule[fromDayKey];
    if (!source) return;

    setSchedule(prev => {
      const updated = { ...prev };
      DAYS.forEach(d => {
        if (target === 'weekdays' && (d.key === 'saturday' || d.key === 'sunday')) return;
        if (d.key !== fromDayKey) {
          updated[d.key] = {
            ...source,
            enabled: true
          };
        }
      });
      handleSave(updated);
      return updated;
    });
  };

  // Toggle slot block / break
  const toggleSlotBlock = async (dayKey: string, slotId: string) => {
    const currentDay = schedule[dayKey] || DEFAULT_SCHEDULE[dayKey]!;
    const blockedList = currentDay.blockedSlots || [];
    const isCurrentlyBlocked = blockedList.includes(slotId);
    const newBlockedList = isCurrentlyBlocked 
      ? blockedList.filter(s => s !== slotId)
      : [...blockedList, slotId];

    const updatedSchedule: CoachScheduleType['days'] = {
      ...schedule,
      [dayKey]: {
        ...currentDay,
        blockedSlots: newBlockedList
      }
    };
    setSchedule(updatedSchedule);
    await handleSave(updatedSchedule);
  };

  // Current selected day of week details
  const selectedDayOfWeekKey = useMemo(() => {
    const dayIndex = selectedDate.getDay(); // 0 = Sunday, 1 = Monday
    const map = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return map[dayIndex] || 'monday';
  }, [selectedDate]);

  const currentDayConfig = schedule[selectedDayOfWeekKey] || DEFAULT_SCHEDULE[selectedDayOfWeekKey]!;

  // Week days around selectedDate
  const currentWeekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 }); // Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(start, i);
      const dayKey = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][d.getDay()] || 'monday';
      const dStr = format(d, 'yyyy-MM-dd');
      const daySessionsCount = sessions.filter(s => {
        if (s.status === 'Cancelled') return false;
        const sDate = toValidDate(s.date);
        return sDate ? isSameDay(sDate, d) : (typeof s.date === 'string' && s.date.startsWith(dStr));
      }).length;

      return {
        date: d,
        dayKey,
        label: format(d, 'EEE'),
        dayNum: format(d, 'd'),
        monthName: format(d, 'MMM'),
        isToday: isToday(d),
        isSelected: isSameDay(d, selectedDate),
        enabled: schedule[dayKey]?.enabled ?? true,
        sessionsCount: daySessionsCount
      };
    });
  }, [selectedDate, schedule, sessions]);

  // Compute timetable slots bounded by startTime and endTime
  const timetableSlots = useMemo(() => {
    if (!currentDayConfig.enabled) return [];

    const [startH = 9, startM = 0] = (currentDayConfig.startTime || '09:00').split(':').map(Number);
    const [endH = 21, endM = 0] = (currentDayConfig.endTime || '21:00').split(':').map(Number);
    const duration = currentDayConfig.slotDurationMinutes || 60;

    let startTotalM = startH * 60 + startM;
    const endTotalM = endH * 60 + endM;

    if (endTotalM <= startTotalM) return [];

    const slots: {
      id: string;
      startTime: string;
      endTime: string;
      isBlocked: boolean;
      sessions: Session[];
      capacity: number;
    }[] = [];

    const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');

    while (startTotalM < endTotalM) {
      const slotEndTotalM = Math.min(startTotalM + duration, endTotalM);
      const slotStartTime = formatMinutesToTime(startTotalM);
      const slotEndTime = formatMinutesToTime(slotEndTotalM);
      const slotId = `${slotStartTime}-${slotEndTime}`;

      const isBlocked = (currentDayConfig.blockedSlots || []).includes(slotId);

      // Find sessions that belong to this date and slot
      const slotSessions = sessions.filter(s => {
        if (s.status === 'Cancelled') return false;
        const sDate = toValidDate(s.date);
        const matchesDate = sDate 
          ? isSameDay(sDate, selectedDate) 
          : (typeof s.date === 'string' && s.date.startsWith(selectedDateStr));

        if (!matchesDate) return false;

        const sStart = (s.startTime || '').slice(0, 5);
        return sStart === slotStartTime;
      });

      // Max capacity for this slot (based on booked session type or default 1-on-1 / small group)
      const primarySessionType = slotSessions[0]?.type || '1-on-1';
      const capacity = currentDayConfig.capacities?.[primarySessionType] || 1;

      slots.push({
        id: slotId,
        startTime: slotStartTime,
        endTime: slotEndTime,
        isBlocked,
        sessions: slotSessions,
        capacity
      });

      startTotalM += duration;
    }

    return slots;
  }, [currentDayConfig, selectedDate, sessions]);

  // Handle open booking modal for a specific slot
  const handleOpenAssignModal = (startTime?: string, endTime?: string) => {
    setBookingError(null);
    setSessionNotes('');
    setSelectedClientId('');
    setSelectedSessionType('1-on-1');
    setClientSearch('');

    if (startTime && endTime) {
      setAssignSlot({ startTime, endTime });
    } else {
      // Default to next available slot or start time
      setAssignSlot({ 
        startTime: currentDayConfig.startTime || '09:00', 
        endTime: formatMinutesToTime((parseInt((currentDayConfig.startTime || '09:00').split(':')[0] || '9', 10) + 1) * 60)
      });
    }
    setAssignDialogOpen(true);
  };

  // Submit Member / Session Assignment
  const handleConfirmAssign = async () => {
    if (!currentUser) return;
    if (!selectedClientId) {
      setBookingError('Please select a member to assign.');
      return;
    }
    if (!assignSlot) {
      setBookingError('Please select a valid time slot.');
      return;
    }

    const client = clients.find(c => c.id === selectedClientId);
    if (!client) {
      setBookingError('Member not found.');
      return;
    }

    setIsSubmittingBooking(true);
    setBookingError(null);

    try {
      const bookingDateStr = format(selectedDate, 'yyyy-MM-dd');
      await addDoc(collection(db, 'sessions'), {
        clientId: client.id,
        clientName: client.name || 'Member',
        coachId: currentUser.id,
        trainerId: currentUser.id,
        coachName: currentUser.name || 'Coach',
        date: bookingDateStr,
        startTime: assignSlot.startTime,
        endTime: assignSlot.endTime,
        type: selectedSessionType,
        status: 'Scheduled',
        notes: sessionNotes.trim(),
        branch: currentUser.branch || client.branch || 'ALL',
        createdAt: new Date().toISOString(),
      });

      setAssignDialogOpen(false);
    } catch (err: any) {
      console.error("Error creating session in timetable:", err);
      setBookingError(err.message || 'Failed to assign member to slot.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  // Update session status
  const handleUpdateSessionStatus = async (status: SessionStatus) => {
    if (!selectedSession) return;
    setIsUpdatingSession(true);
    try {
      await updateDoc(doc(db, 'sessions', selectedSession.id), {
        status,
        updatedAt: new Date().toISOString()
      });
      setSelectedSession(null);
    } catch (err) {
      console.error("Error updating session status:", err);
      alert("Failed to update session status.");
    } finally {
      setIsUpdatingSession(false);
    }
  };

  // Filtered client list for assignment search
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients.slice(0, 15);
    const q = clientSearch.toLowerCase();
    return clients.filter(c => 
      (c.name && c.name.toLowerCase().includes(q)) || 
      (c.phone && c.phone.includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [clients, clientSearch]);

  const selectedClient = clients.find(c => c.id === selectedClientId);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        <p className="text-xs text-muted-foreground animate-pulse">Loading visual schedule & timetable...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-300">
      {/* Top Header & View Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border rounded-2xl p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Coach Timetable & Availability</h2>
              <p className="text-xs text-muted-foreground">Interactive grid bounded by your working hours.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-muted p-1 rounded-xl flex items-center gap-1 border">
            <Button
              variant={activeView === 'timetable' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('timetable')}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg transition-all"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Visual Timetable
            </Button>
            <Button
              variant={activeView === 'settings' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveView('settings')}
              className="h-8 text-xs font-semibold gap-1.5 rounded-lg transition-all"
            >
              <Sliders className="h-3.5 w-3.5" />
              Availability & Limits
            </Button>
          </div>

          <Button 
            onClick={() => handleSave()} 
            disabled={isSaving} 
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1.5 rounded-xl border-primary/20 hover:border-primary/40 font-bold shrink-0"
          >
            <Save className="h-3.5 w-3.5 text-primary" />
            {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      {/* VIEW 1: VISUAL DAILY TIMETABLE */}
      {activeView === 'timetable' && (
        <div className="space-y-4">
          {/* Week & Day Navigation Strip */}
          <Card className="border shadow-sm overflow-hidden bg-card/60 backdrop-blur-sm">
            <CardHeader className="p-3.5 pb-2 border-b bg-muted/20 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-lg"
                  onClick={() => setSelectedDate(prev => subDays(prev, 7))}
                  title="Previous week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs font-bold tracking-tight">
                  {format(currentWeekDays[0]!.date, 'MMM d')} – {format(currentWeekDays[6]!.date, 'MMM d, yyyy')}
                </span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 rounded-lg"
                  onClick={() => setSelectedDate(prev => addDays(prev, 7))}
                  title="Next week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button 
                  variant="secondary" 
                  size="sm" 
                  className="h-7 text-[11px] font-semibold px-2.5 rounded-lg"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => handleOpenAssignModal()}
                  className="h-7 text-[11px] font-bold gap-1 px-3 rounded-lg shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" /> Assign Member
                </Button>
              </div>
            </CardHeader>

            <CardContent className="p-3">
              {/* 7-Day interactive selector strip */}
              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {currentWeekDays.map(item => (
                  <button
                    key={item.dayKey}
                    onClick={() => setSelectedDate(item.date)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border text-center relative ${
                      item.isSelected 
                        ? 'bg-primary text-primary-foreground border-primary shadow-md scale-[1.02]' 
                        : item.isToday
                          ? 'bg-primary/10 border-primary/40 text-foreground hover:bg-primary/15'
                          : 'bg-background hover:bg-muted/60 border-border/60 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80">
                      {item.label}
                    </span>
                    <span className="text-base sm:text-lg font-black leading-tight my-0.5">
                      {item.dayNum}
                    </span>

                    {/* Badge or indicator */}
                    <div className="h-4 flex items-center justify-center">
                      {!item.enabled ? (
                        <span className={`text-[9px] font-semibold uppercase px-1 rounded ${item.isSelected ? 'text-primary-foreground/70' : 'text-zinc-400'}`}>
                          Off
                        </span>
                      ) : item.sessionsCount > 0 ? (
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full ${
                          item.isSelected 
                            ? 'bg-primary-foreground text-primary font-black' 
                            : 'bg-primary/20 text-primary'
                        }`}>
                          {item.sessionsCount} booked
                        </span>
                      ) : (
                        <span className={`h-1.5 w-1.5 rounded-full ${item.isSelected ? 'bg-primary-foreground/50' : 'bg-emerald-500/50'}`} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Selected Day Status Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold capitalize text-foreground">
                {format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </h3>
              {currentDayConfig.enabled ? (
                <Badge variant="outline" className="text-[11px] font-mono border-primary/30 text-primary bg-primary/5">
                  <Clock className="h-3 w-3 mr-1" />
                  {formatTimeTo12h(currentDayConfig.startTime)} – {formatTimeTo12h(currentDayConfig.endTime)}
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[11px] bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  Day Off
                </Badge>
              )}
              {currentDayConfig.enabled && (
                <Badge variant="outline" className="text-[10px] text-muted-foreground border-dashed">
                  {currentDayConfig.slotDurationMinutes || 60}m slots
                </Badge>
              )}
            </div>

            {currentDayConfig.enabled ? (
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  {timetableSlots.filter(s => !s.isBlocked && s.sessions.length === 0).length} Open
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  {timetableSlots.reduce((acc, s) => acc + s.sessions.length, 0)} Booked
                </span>
                {timetableSlots.filter(s => s.isBlocked).length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-zinc-400" />
                    {timetableSlots.filter(s => s.isBlocked).length} Breaks
                  </span>
                )}
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  updateDayField(selectedDayOfWeekKey, 'enabled', true);
                  handleSave({
                    ...schedule,
                    [selectedDayOfWeekKey]: {
                      ...currentDayConfig,
                      enabled: true
                    }
                  });
                }}
                className="h-7 text-xs font-bold text-primary border-primary/30"
              >
                Enable {DAYS.find(d => d.key === selectedDayOfWeekKey)?.label}
              </Button>
            )}
          </div>

          {/* Timetable Grid or Off State */}
          {!currentDayConfig.enabled ? (
            <Card className="border-dashed bg-muted/20 p-8 text-center rounded-2xl">
              <div className="max-w-sm mx-auto space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-muted flex items-center justify-center mx-auto text-muted-foreground">
                  <Coffee className="h-6 w-6" />
                </div>
                <h4 className="font-bold text-base">You are scheduled OFF for this day</h4>
                <p className="text-xs text-muted-foreground">
                  No sessions can be scheduled while this day is disabled. Click below to open availability and start scheduling slots.
                </p>
                <Button 
                  onClick={() => {
                    updateDayField(selectedDayOfWeekKey, 'enabled', true);
                    handleSave({
                      ...schedule,
                      [selectedDayOfWeekKey]: {
                        ...currentDayConfig,
                        enabled: true
                      }
                    });
                  }}
                  className="font-bold text-xs gap-1.5 rounded-xl"
                >
                  <Plus className="h-3.5 w-3.5" /> Open Availability For Today
                </Button>
              </div>
            </Card>
          ) : timetableSlots.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No time slots configured. Check your start and end times in settings.</p>
            </Card>
          ) : (
            /* Hourly Timetable Slots List */
            <div className="space-y-2.5">
              {timetableSlots.map(slot => {
                const bookedCount = slot.sessions.length;
                const isFull = bookedCount >= slot.capacity;
                const isPartiallyBooked = bookedCount > 0 && !isFull;
                const isEmpty = bookedCount === 0;

                return (
                  <div 
                    key={slot.id}
                    className={`border rounded-2xl p-3 sm:p-4 transition-all ${
                      slot.isBlocked
                        ? 'bg-muted/40 border-dashed border-border/80 opacity-75'
                        : isFull
                          ? 'bg-blue-500/5 border-blue-200/60 dark:border-blue-900/40 shadow-sm'
                          : isPartiallyBooked
                            ? 'bg-amber-500/5 border-amber-200/60 dark:border-amber-900/40 shadow-sm'
                            : 'bg-card hover:border-primary/40 shadow-sm'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Time & Slot Status */}
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col">
                          <span className="text-xs sm:text-sm font-black tracking-tight font-mono">
                            {formatTimeTo12h(slot.startTime)} – {formatTimeTo12h(slot.endTime)}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {currentDayConfig.slotDurationMinutes || 60} minutes
                          </span>
                        </div>

                        {/* Status Badge */}
                        {slot.isBlocked ? (
                          <Badge variant="secondary" className="text-[10px] font-semibold gap-1 bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                            <Lock className="h-3 w-3" /> Break / Blocked
                          </Badge>
                        ) : isFull ? (
                          <Badge className="text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-600">
                            Full ({bookedCount}/{slot.capacity})
                          </Badge>
                        ) : isPartiallyBooked ? (
                          <Badge variant="outline" className="text-[10px] font-bold text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950/40">
                            {bookedCount}/{slot.capacity} Booked • {slot.capacity - bookedCount} spots left
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] font-bold text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40">
                            Available • Max {slot.capacity}
                          </Badge>
                        )}
                      </div>

                      {/* Right: Quick Slot Controls */}
                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleSlotBlock(selectedDayOfWeekKey, slot.id)}
                          className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground rounded-lg"
                          title={slot.isBlocked ? "Unblock this slot" : "Mark as break / block slot"}
                        >
                          {slot.isBlocked ? (
                            <span className="flex items-center gap-1 text-primary font-semibold">
                              <Unlock className="h-3 w-3" /> Unblock
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Coffee className="h-3 w-3" /> Set Break
                            </span>
                          )}
                        </Button>

                        {!slot.isBlocked && !isFull && (
                          <Button
                            size="sm"
                            onClick={() => handleOpenAssignModal(slot.startTime, slot.endTime)}
                            className="h-7 text-[11px] font-bold gap-1 px-3 rounded-lg shadow-sm"
                          >
                            <Plus className="h-3 w-3" /> Assign Member
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Booked Sessions Inside this Slot */}
                    {slot.sessions.length > 0 && (
                      <div className="mt-3 pt-3 border-t grid gap-2 sm:grid-cols-2">
                        {slot.sessions.map(session => {
                          const statusStyle = STATUS_STYLES[session.status] || STATUS_STYLES.Scheduled;
                          const sessionTypeConfig = SESSION_TYPES.find(t => t.key === session.type);
                          const Icon = sessionTypeConfig?.icon || Dumbbell;

                          return (
                            <button
                              key={session.id}
                              onClick={() => setSelectedSession(session)}
                              className="text-left bg-background/90 hover:bg-muted/80 border border-border/70 rounded-xl p-2.5 transition-all flex items-start justify-between gap-2 shadow-xs group"
                            >
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <div className="h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">
                                    {(session.clientName || 'M').charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                    {session.clientName || 'Member'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-semibold gap-1 ${sessionTypeConfig?.badgeColor || ''}`}>
                                    <Icon className="h-2.5 w-2.5" />
                                    {session.type}
                                  </Badge>
                                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-semibold gap-1 ${statusStyle.badge}`}>
                                    {statusStyle.icon}
                                    {session.status}
                                  </Badge>
                                </div>
                                {session.notes && (
                                  <p className="text-[10px] text-muted-foreground truncate italic">
                                    "{session.notes}"
                                  </p>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors font-medium shrink-0 pt-0.5">
                                View →
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: INTERACTIVE AVAILABILITY & LIMITS SETTINGS */}
      {activeView === 'settings' && (
        <div className="space-y-4">
          <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold flex items-center gap-2 text-primary">
                <Sparkles className="h-4 w-4" /> Interactive Capacity & Schedule Limits
              </h3>
              <p className="text-xs text-muted-foreground">
                Set working hours and maximum member limits per session type without typing raw numbers.
              </p>
            </div>
            <Button 
              onClick={() => copyDaySchedule('monday', 'weekdays')}
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold gap-1.5 rounded-xl border-primary/20 hover:border-primary/40 shrink-0"
            >
              <Copy className="h-3.5 w-3.5 text-primary" />
              Copy Monday to All Weekdays
            </Button>
          </div>

          <div className="grid gap-3.5">
            {DAYS.map(({ key, label, short }) => {
              const day = (schedule[key] ?? DEFAULT_SCHEDULE[key])!;
              return (
                <Card key={key} className={`transition-all rounded-2xl overflow-hidden border ${day.enabled ? 'bg-card' : 'bg-muted/30 opacity-60'}`}>
                  <CardContent className="p-4 flex flex-col gap-4">
                    {/* Day Header & Enable Toggle */}
                    <div className="flex items-center justify-between border-b pb-3">
                      <div className="flex items-center gap-3">
                        <Switch
                          checked={day.enabled}
                          onCheckedChange={v => updateDayField(key, 'enabled', v)}
                        />
                        <div>
                          <Label className="font-bold text-sm cursor-pointer" onClick={() => updateDayField(key, 'enabled', !day.enabled)}>
                            {label}
                          </Label>
                          <span className="text-[10px] text-muted-foreground block">
                            {day.enabled ? `${formatTimeTo12h(day.startTime)} – ${formatTimeTo12h(day.endTime)}` : 'Marked as Off'}
                          </span>
                        </div>
                      </div>

                      {day.enabled && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyDaySchedule(key, 'all')}
                            className="h-7 text-[10px] font-semibold text-muted-foreground hover:text-foreground px-2"
                            title="Copy this day's settings to all other days"
                          >
                            <Copy className="h-3 w-3 mr-1" /> Copy to all
                          </Button>
                          <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary">
                            Active
                          </Badge>
                        </div>
                      )}
                    </div>

                    {day.enabled && (
                      <div className="space-y-4">
                        {/* Working Hours & Presets */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-primary" /> Daily Working Hours
                            </Label>
                            {/* Quick Presets */}
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  updateDayField(key, 'startTime', '09:00');
                                  updateDayField(key, 'endTime', '21:00');
                                }}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                              >
                                09:00 – 21:00
                              </button>
                              <button
                                onClick={() => {
                                  updateDayField(key, 'startTime', '08:00');
                                  updateDayField(key, 'endTime', '16:00');
                                }}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                              >
                                Morning (08–16)
                              </button>
                              <button
                                onClick={() => {
                                  updateDayField(key, 'startTime', '14:00');
                                  updateDayField(key, 'endTime', '22:00');
                                }}
                                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                              >
                                Evening (14–22)
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">From:</span>
                              <Input
                                type="time"
                                value={day.startTime}
                                onChange={e => updateDayField(key, 'startTime', e.target.value)}
                                className="w-28 h-8 text-xs font-mono"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">To:</span>
                              <Input
                                type="time"
                                value={day.endTime}
                                onChange={e => updateDayField(key, 'endTime', e.target.value)}
                                className="w-28 h-8 text-xs font-mono"
                              />
                            </div>

                            {/* Slot Duration Selector */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <span className="text-xs text-muted-foreground">Slot:</span>
                              {[30, 45, 60, 90].map(dur => (
                                <button
                                  key={dur}
                                  onClick={() => updateDayField(key, 'slotDurationMinutes', dur)}
                                  className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all ${
                                    (day.slotDurationMinutes || 60) === dur
                                      ? 'bg-primary text-primary-foreground border-primary'
                                      : 'bg-background hover:bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {dur}m
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Capacities & Limits */}
                        <div className="space-y-2 border-t pt-3">
                          <Label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 text-primary" /> Session Capacities & Limits
                          </Label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {SESSION_TYPES.map(type => {
                              const Icon = type.icon;
                              const currentCap = day.capacities?.[type.key] ?? type.defaultMax;
                              return (
                                <div 
                                  key={type.key} 
                                  className="border rounded-xl p-2.5 bg-background flex flex-col justify-between gap-2"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                                      <span className="text-xs font-bold text-foreground">{type.label}</span>
                                    </div>
                                    <Badge variant="outline" className={`text-[9px] px-1 py-0 ${type.badgeColor}`}>
                                      Max {currentCap}
                                    </Badge>
                                  </div>

                                  {/* Interactive Stepper & Presets */}
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-xs"
                                        onClick={() => updateCapacity(key, type.key, -1)}
                                        disabled={currentCap <= 1}
                                      >
                                        -
                                      </Button>
                                      <span className="w-8 text-center text-sm font-black font-mono">
                                        {currentCap}
                                      </span>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        className="h-7 w-7 rounded-lg text-xs"
                                        onClick={() => updateCapacity(key, type.key, 1)}
                                        disabled={currentCap >= 30}
                                      >
                                        +
                                      </Button>
                                    </div>

                                    {/* Quick Preset Pills */}
                                    <div className="flex items-center gap-1">
                                      {type.key === 'Small Group' && [3, 4, 5].map(v => (
                                        <button
                                          key={v}
                                          type="button"
                                          onClick={() => setCapacityValue(key, type.key, v)}
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${currentCap === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground'}`}
                                        >
                                          {v}
                                        </button>
                                      ))}
                                      {type.key === 'Class' && [10, 15, 20, 25].map(v => (
                                        <button
                                          key={v}
                                          type="button"
                                          onClick={() => setCapacityValue(key, type.key, v)}
                                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${currentCap === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground'}`}
                                        >
                                          {v}
                                        </button>
                                      ))}
                                      {type.key === 'Partner' && (
                                        <span className="text-[10px] text-muted-foreground font-medium">Standard 2</span>
                                      )}
                                      {type.key === '1-on-1' && (
                                        <span className="text-[10px] text-muted-foreground font-medium">Single 1</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* DIALOG: ASSIGN MEMBER / BOOK SESSION INTO SLOT */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" /> Assign Member to Slot
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign a member into {format(selectedDate, 'EEEE, MMM d')} at {assignSlot ? `${formatTimeTo12h(assignSlot.startTime)} – ${formatTimeTo12h(assignSlot.endTime)}` : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {bookingError && (
              <div className="p-3 bg-red-500/10 border border-red-200/50 rounded-xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* Time Slot Confirmation */}
            {assignSlot && (
              <div className="bg-muted/40 border rounded-xl p-2.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Scheduled Time:</span>
                <span className="font-bold font-mono text-foreground">
                  {formatTimeTo12h(assignSlot.startTime)} – {formatTimeTo12h(assignSlot.endTime)} ({format(selectedDate, 'MMM d, yyyy')})
                </span>
              </div>
            )}

            {/* Member Selection & Search */}
            <div className="space-y-2">
              <Label className="text-xs font-bold">Select Member</Label>
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search member by name, phone or email..."
                  value={clientSearch}
                  onChange={e => setClientSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              {/* Client options list */}
              <div className="max-h-36 overflow-y-auto border rounded-xl divide-y bg-background">
                {filteredClients.length === 0 ? (
                  <p className="p-3 text-center text-xs text-muted-foreground">No members found.</p>
                ) : (
                  filteredClients.map(c => {
                    const isSelected = selectedClientId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedClientId(c.id)}
                        className={`w-full text-left p-2.5 transition-colors flex items-center justify-between text-xs ${
                          isSelected ? 'bg-primary/10 text-primary font-bold' : 'hover:bg-muted/60'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold truncate">{c.name || 'Member'}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate">{c.phone || c.email || 'No contact'}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {c.sessionsRemaining !== undefined && (
                            <Badge variant="outline" className="text-[9px]">
                              {c.sessionsRemaining} left
                            </Badge>
                          )}
                          {isSelected && <Check className="h-4 w-4 text-primary" />}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedClient && (
                <div className="p-2.5 bg-primary/5 border border-primary/20 rounded-xl text-xs flex items-center justify-between">
                  <span className="font-bold text-primary">Selected: {selectedClient.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {selectedClient.packageType || 'General PT'}
                  </span>
                </div>
              )}
            </div>

            {/* Session Type Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">Session Type</Label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                {SESSION_TYPES.map(t => {
                  const isSelected = selectedSessionType === t.key;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setSelectedSessionType(t.key)}
                      className={`p-2 rounded-xl border text-center flex flex-col items-center gap-1 transition-all ${
                        isSelected 
                          ? 'bg-primary text-primary-foreground border-primary shadow-xs font-bold' 
                          : 'bg-background hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="text-[10px] leading-tight">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Notes */}
            <div className="space-y-1">
              <Label className="text-xs font-bold">Notes / Workout Focus (Optional)</Label>
              <Textarea
                placeholder="e.g. Upper body strength, leg day progression, mobility..."
                value={sessionNotes}
                onChange={e => setSessionNotes(e.target.value)}
                className="text-xs h-16 resize-none"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAssignDialogOpen(false)}
              disabled={isSubmittingBooking}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmAssign}
              disabled={isSubmittingBooking || !selectedClientId}
              className="text-xs font-bold gap-1.5"
            >
              {isSubmittingBooking ? 'Assigning...' : 'Confirm Assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: SESSION DETAILS & STATUS ACTIONS */}
      <Dialog open={Boolean(selectedSession)} onOpenChange={open => !open && setSelectedSession(null)}>
        {selectedSession && (
          <DialogContent className="max-w-md rounded-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Dumbbell className="h-4 w-4 text-primary" /> Session Details
              </DialogTitle>
              <DialogDescription className="text-xs">
                Manage status or view member info for this booked session.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-2 text-xs">
              <div className="bg-muted/40 border rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Member:</span>
                  <span className="font-bold text-sm text-foreground">{selectedSession.clientName || 'Member'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-medium">{selectedSession.date}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Time Slot:</span>
                  <span className="font-mono font-bold">
                    {formatTimeTo12h(selectedSession.startTime)} – {formatTimeTo12h(selectedSession.endTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Type:</span>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {selectedSession.type}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant="outline" className={`text-[10px] font-bold ${STATUS_STYLES[selectedSession.status]?.badge || ''}`}>
                    {selectedSession.status}
                  </Badge>
                </div>
                {selectedSession.notes && (
                  <div className="pt-2 border-t">
                    <span className="text-muted-foreground block text-[10px]">Notes:</span>
                    <p className="italic text-foreground mt-0.5">{selectedSession.notes}</p>
                  </div>
                )}
              </div>

              {/* Launch Floor Mode Action */}
              {onStartFloor && (
                <Button
                  type="button"
                  onClick={() => {
                    const clientObj = clients.find(c => c.id === selectedSession.clientId) || ({ id: selectedSession.clientId, name: selectedSession.clientName || 'Member' } as Client);
                    onStartFloor(clientObj, selectedSession);
                    setSelectedSession(null);
                  }}
                  className="w-full h-9 font-bold text-xs gap-1.5 bg-amber-500 hover:bg-amber-600 text-black shadow-sm"
                >
                  <Flame className="h-4 w-4 fill-current" /> Start Floor Workout
                </Button>
              )}

              {/* Status Update Quick Buttons */}
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground">Update Session Status</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateSessionStatus('Attended')}
                    disabled={isUpdatingSession || selectedSession.status === 'Attended'}
                    className="h-8 text-xs font-bold text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Mark Attended
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateSessionStatus('Completed')}
                    disabled={isUpdatingSession || selectedSession.status === 'Completed'}
                    className="h-8 text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-50 dark:hover:bg-blue-950/30 gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Mark Completed
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleUpdateSessionStatus('No Show')}
                    disabled={isUpdatingSession || selectedSession.status === 'No Show'}
                    className="h-8 text-xs font-bold text-amber-600 border-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/30 gap-1"
                  >
                    <XCircle className="h-3.5 w-3.5" /> Mark No-Show
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm("Are you sure you want to cancel this session?")) {
                        handleUpdateSessionStatus('Cancelled');
                      }
                    }}
                    disabled={isUpdatingSession || selectedSession.status === 'Cancelled'}
                    className="h-8 text-xs font-bold text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1"
                  >
                    <Ban className="h-3.5 w-3.5" /> Cancel Session
                  </Button>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedSession(null)}
                className="text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
