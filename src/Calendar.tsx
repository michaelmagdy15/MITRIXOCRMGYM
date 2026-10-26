import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from './context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from './contexts/LanguageContext';
import { useSettings } from './contexts/SettingsContext';
import { db, auth, getTenantId } from './firebase';
import StrikeWeeklyScheduleView from './components/StrikeWeeklyScheduleView';
import { collection, onSnapshot, setDoc, doc, deleteDoc, writeBatch, getDocs, query, where, updateDoc } from 'firebase/firestore';
import { Checkbox } from '@/components/ui/checkbox';
import { resolveAttendee } from './utils/attendeeUtils';
import { 
  format, 
  isSameDay, 
  parseISO, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  addMonths, 
  subMonths,
  addWeeks,
  subWeeks,
  isSameMonth,
  addDays
} from 'date-fns';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Clock, 
  MapPin, 
  User as UserIcon,
  CheckCircle,
  XCircle,
  AlertCircle,
  Grid,
  List,
  SlidersHorizontal,
  X,
  Sparkles,
  Edit,
  Trash2,
  Search,
  UserPlus
} from 'lucide-react';
import { PTPackageRecord, Branch } from './types';
import { isTenantInzan } from './utils/inzanOrg';

interface GymClass {
  id: string;
  name: string;
  coachName: string;
  instructorName?: string;
  instructorId?: string;
  date: string;          // YYYY-MM-DD
  time: string;          // e.g. "18:00 - 19:15"
  startTime?: string;
  endTime?: string;
  branch: string;
  capacity: number;
  attendees: string[];   // clientIds
  waitlist?: string[];
  checkedInAttendees?: string[];
  noShowAttendees?: string[];
  type: 'Class' | 'Event';
  category?: string;
  status?: 'active' | 'cancelled' | 'completed';
  description?: string;
}

export default function CalendarView() {
  const { 
    currentUser, 
    users, 
    clients, 
    ptPackageRecords, 
    addPTPackageRecord, 
    updatePTPackageRecord,
    branches,
    coaches,
    features,
    setActiveTab,
    setActiveClientId
  } = useAppContext();

  const { t, language, isRtl } = useLanguage();
  const { branding } = useSettings();
  const [isStrikeTimetableOpen, setIsStrikeTimetableOpen] = useState(false);

  const isStrike = useMemo(() => {
    const tenantId = getTenantId();
    return tenantId.toLowerCase().includes('strike') || (branding?.companyName || '').toLowerCase().includes('strike');
  }, [branding?.companyName]);

  const isInzan = useMemo(() => {
    const tenantId = getTenantId();
    return true || isTenantInzan() || tenantId.toLowerCase().includes('inzan') || (branding?.companyName || '').toLowerCase().includes('inzan');
  }, [branding?.companyName]);

  // Calendar State
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'All'>('All');
  
  // Booking Dialog State
  const [isBookModalOpen, setIsBookModalOpen] = useState(false);
  const [bookClientId, setBookClientId] = useState('');
  const [bookTrainerId, setBookTrainerId] = useState('');
  const [bookBranch, setBookBranch] = useState<Branch | ''>('');
  const [bookDate, setBookDate] = useState('');
  const [bookTime, setBookTime] = useState('10:00');
  const [bookNotes, setBookNotes] = useState('');

  // Selected Record Popover State
  const [selectedRecord, setSelectedRecord] = useState<PTPackageRecord | null>(null);

  // Gym Classes State
  const [gymClasses, setGymClasses] = useState<GymClass[]>([]);
  const [selectedClass, setSelectedClass] = useState<GymClass | null>(null);
  const [rosterSearchQuery, setRosterSearchQuery] = useState('');
  const [isEditingClassDetails, setIsEditingClassDetails] = useState(false);
  const [editClassName, setEditClassName] = useState('');
  const [editClassCoach, setEditClassCoach] = useState('');
  const [editClassTime, setEditClassTime] = useState('');
  const [editClassCapacity, setEditClassCapacity] = useState(15);
  const [editClassDescription, setEditClassDescription] = useState('');
  const [isSavingClassEdit, setIsSavingClassEdit] = useState(false);

  // Group Class Booking Form State
  const [bookingType, setBookingType] = useState<'pt' | 'class'>('pt');
  const [className, setClassName] = useState('');
  const [classCoachName, setClassCoachName] = useState('');
  const [classEndTime, setClassEndTime] = useState('11:15');
  const [classCapacity, setClassCapacity] = useState(15);
  const [classType, setClassType] = useState<'Class' | 'Event'>('Class');
  const [classDescription, setClassDescription] = useState('');
  const [classTier, setClassTier] = useState<string>('All Tiers');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);

  useEffect(() => {
    if (features && features.ptPackages === false) {
      setBookingType('class');
    }
  }, [features]);

  // Real-time listener for class schedules scoped to visible window (prev month to next month)
  useEffect(() => {
    const minDate = startOfMonth(subMonths(currentDate, 1));
    const maxDate = endOfMonth(addMonths(currentDate, 1));
    const minDateStr = format(minDate, 'yyyy-MM-dd');
    const maxDateStr = format(maxDate, 'yyyy-MM-dd');

    const q = query(
      collection(db, 'classSchedules'),
      where('date', '>=', minDateStr),
      where('date', '<=', maxDateStr)
    );

    const unsub = onSnapshot(q, (snap) => {
      const events = snap.docs.map(d => {
        const data = d.data();
        const dateStr = data.date || (data.startTime ? data.startTime.substring(0, 10) : format(new Date(), 'yyyy-MM-dd'));
        const timeStr = data.time || (data.startTime && data.endTime 
          ? `${data.startTime.substring(11, 16)} - ${data.endTime.substring(11, 16)}` 
          : '10:00 - 11:15');

        return {
          id: d.id,
          name: data.name || data.className || 'Class',
          coachName: data.coachName || data.instructorName || 'Coach',
          instructorName: data.instructorName || data.coachName || '',
          instructorId: data.instructorId || '',
          date: dateStr,
          time: timeStr,
          startTime: data.startTime || `${dateStr}T${timeStr.split('-')[0].trim()}:00`,
          endTime: data.endTime || `${dateStr}T${timeStr.split('-')[1]?.trim() || '11:15'}:00`,
          branch: data.branch || 'Main Branch',
          capacity: Number(data.capacity) || 15,
          attendees: data.attendees || [],
          waitlist: data.waitlist || [],
          checkedInAttendees: data.checkedInAttendees || [],
          noShowAttendees: data.noShowAttendees || [],
          type: data.type || (data.category === 'Event' ? 'Event' : 'Class'),
          category: data.category || data.type || 'Class',
          status: data.status || 'active',
          description: data.description || ''
        } as GymClass;
      });
      setGymClasses(events);
      setSelectedClass(prev => prev ? (events.find(e => e.id === prev.id) || prev) : null);
    }, (err) => {
      console.error("Error loading class schedules:", err);
    });

    return () => unsub();
  }, [currentDate]);

  // Live Sessions State (from Firestore sessions collection)
  const [liveSessions, setLiveSessions] = useState<any[]>([]);

  useEffect(() => {
    const q = collection(db, 'sessions');
    const unsub = onSnapshot(q, (snap) => {
      const records = snap.docs.map(d => {
        const data = d.data();
        const datePart = data.date || (data.startTime ? data.startTime.substring(0, 10) : format(new Date(), 'yyyy-MM-dd'));
        const timePart = data.startTime || '10:00';
        const isoDate = datePart.includes('T') ? datePart : `${datePart}T${timePart.length === 5 ? timePart + ':00' : timePart}`;
        return {
          id: d.id,
          clientId: data.clientId,
          clientName: data.clientName,
          trainerId: data.coachId || data.trainerId,
          trainerName: data.coachName || data.trainerName || 'Coach',
          packageId: data.packageId || '',
          date: isoDate,
          status: data.status || 'Scheduled',
          branch: data.branch || 'Main Branch',
          notes: data.notes || '',
          type: data.type || '1-on-1',
          isLiveSession: true
        };
      });
      setLiveSessions(records);
    }, (err) => {
      console.error("Error listening to sessions in Calendar:", err);
    });

    return () => unsub();
  }, []);

  // Month days generator
  const monthDays = useMemo(() => {
    const startMonth = startOfMonth(currentDate);
    const endMonth = endOfMonth(currentDate);
    const startCal = startOfWeek(startMonth, { weekStartsOn: 0 }); // Sunday
    const endCal = endOfWeek(endMonth, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: startCal, end: endCal });
  }, [currentDate]);

  // Week days generator
  const weekDays = useMemo(() => {
    const startWeek = startOfWeek(currentDate, { weekStartsOn: 0 });
    const endWeek = endOfWeek(currentDate, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: startWeek, end: endWeek });
  }, [currentDate]);

  // Filtered sessions (merging ptPackageRecords and canonical sessions)
  const filteredRecords = useMemo(() => {
    if (features?.ptPackages === false) return [];
    const ptIds = new Set(ptPackageRecords.map(r => r.id));
    const merged = [
      ...ptPackageRecords,
      ...liveSessions.filter(s => !ptIds.has(s.id))
    ];
    return merged.filter(record => {
      if (selectedBranch !== 'All' && record.branch !== selectedBranch) return false;
      return true;
    });
  }, [ptPackageRecords, liveSessions, selectedBranch, features]);

  // Filtered classes
  const filteredClasses = useMemo(() => {
    return gymClasses.filter(c => {
      if (selectedBranch !== 'All' && c.branch !== selectedBranch) return false;
      return true;
    });
  }, [gymClasses, selectedBranch]);

  const getItemStartTime = (item: any) => {
    if ('time' in item) {
      // Group Class
      return item.time.split(' - ')[0] || '00:00';
    } else {
      // PT Session
      try {
        return format(parseISO(item.date), 'HH:mm');
      } catch {
        return '10:00';
      }
    }
  };

  // Navigation handlers
  const handlePrev = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => subMonths(prev, 1));
    } else {
      setCurrentDate(prev => subWeeks(prev, 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'month') {
      setCurrentDate(prev => addMonths(prev, 1));
    } else {
      setCurrentDate(prev => addWeeks(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Open booking modal pre-filled for a specific date
  const handleOpenBooking = (date?: Date, defaultType?: 'pt' | 'class') => {
    const d = date || new Date();
    setBookDate(format(d, 'yyyy-MM-dd'));
    if (currentUser?.branch) {
      setBookBranch(currentUser.branch);
    } else if (branches && branches.length > 0) {
      setBookBranch(branches[0] || '');
    }
    // Reset booking states
    setBookingType(defaultType || (features?.ptPackages === false ? 'class' : 'pt'));
    setBookClientId('');
    setBookTrainerId('');
    setBookTime('10:00');
    setBookNotes('');
    setClassName('');
    setClassCoachName('');
    setClassEndTime('11:15');
    setClassCapacity(15);
    setClassType('Class');
    setClassDescription('');
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    setIsBookModalOpen(true);
  };

  const handleCreateBooking = async () => {
    if (bookingType === 'pt') {
      if (!bookClientId || !bookDate || !bookBranch) return;
      
      const [hours, minutes] = bookTime.split(':');
      const combinedDate = new Date(bookDate);
      combinedDate.setHours(parseInt(hours || '0'), parseInt(minutes || '0'), 0, 0);

      await addPTPackageRecord({
        clientId: bookClientId,
        trainerId: bookTrainerId || undefined,
        branch: bookBranch || undefined,
        date: combinedDate.toISOString(),
        status: 'Scheduled',
        notes: bookNotes || undefined
      });

      // Also create canonical Session document for member app synchronization
      try {
        const client = clients.find(c => c.id === bookClientId);
        const coach = users.find(u => u.id === bookTrainerId);
        const newSessionRef = doc(collection(db, 'sessions'));
        await setDoc(newSessionRef, {
          clientId: bookClientId,
          clientName: client?.name || 'Member',
          coachId: bookTrainerId || '',
          trainerId: bookTrainerId || '',
          coachName: coach?.name || 'Coach',
          branch: bookBranch,
          date: bookDate,
          startTime: bookTime,
          endTime: classEndTime || '11:00',
          type: '1-on-1',
          status: 'Scheduled',
          notes: bookNotes || '',
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error creating synced session doc:", err);
      }

      // Reset fields
      setBookClientId('');
      setBookTrainerId('');
      setBookNotes('');
    } else {
      if (!className || !bookDate || !bookBranch || !classCoachName || !bookTime || !classEndTime) return;

      const numWeeks = repeatWeekly ? Math.max(1, repeatWeeks) : 1;
      const baseDate = parseISO(bookDate);
      const promises = [];

      for (let i = 0; i < numWeeks; i++) {
        const classDate = addDays(baseDate, 7 * i);
        const dateStr = format(classDate, 'yyyy-MM-dd');
        const startIso = `${dateStr}T${bookTime}:00`;
        const endIso = `${dateStr}T${classEndTime}:00`;
        const classId = crypto.randomUUID();

        const itemData = {
          id: classId,
          name: className,
          coachName: classCoachName,
          instructorName: classCoachName,
          date: dateStr,
          time: `${bookTime} - ${classEndTime}`,
          startTime: startIso,
          endTime: endIso,
          branch: bookBranch,
          capacity: Number(classCapacity) || 15,
          attendees: [],
          waitlist: [],
          type: classType,
          category: classType,
          tier: classTier,
          allowedTiers: classTier === 'All Tiers' 
            ? ['All Tiers', 'Kids Only', 'Kids Pro', 'Junior Only', 'Junior Advanced', 'Adults'] 
            : [classTier],
          status: 'active',
          price: 0,
          description: classDescription || undefined,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        // Write directly to classSchedules (primary collection listened to by mobile apps and portals)
        promises.push(setDoc(doc(db, 'classSchedules', classId), itemData));
      }

      await Promise.all(promises);

      // Reset fields
      setClassName('');
      setClassCoachName('');
      setClassEndTime('11:15');
      setClassCapacity(15);
      setClassType('Class');
      setClassDescription('');
      setClassTier('All Tiers');
      setRepeatWeekly(false);
      setRepeatWeeks(4);
    }

    setIsBookModalOpen(false);
  };

  const handleStatusChange = async (recordId: string, status: PTPackageRecord['status']) => {
    try {
      await updateDoc(doc(db, 'sessions', recordId), { 
        status,
        updatedAt: new Date().toISOString()
      });
    } catch {
      // ignore if record only exists in ptPackageRecords
    }
    try {
      await updatePTPackageRecord(recordId, { status });
    } catch {
      // ignore if record only exists in sessions
    }
    setSelectedRecord(null);
  };

  // UI Helpers
  const getStatusColor = (status: PTPackageRecord['status']) => {
    switch (status) {
      case 'Attended': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'No Show': return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'Cancelled': return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
      case 'Scheduled': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      default: return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
    }
  };

  const getDayName = (dayIndex: number) => {
    const namesEN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const namesAR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return language === 'ar' ? namesAR[dayIndex] : namesEN[dayIndex];
  };

  const formatMonthYear = (date: Date) => {
    if (language === 'ar') {
      const monthsAR = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      return `${monthsAR[date.getMonth()]} ${date.getFullYear()}`;
    }
    return format(date, 'MMMM yyyy');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground font-sans">
            {language === 'ar' ? 'الجدول الزمني والجدولة' : 'Visual Class & PT Scheduling'}
          </h2>
          <p className="text-muted-foreground text-sm">
            {language === 'ar' 
              ? 'تتبع وإدارة حصص التدريب الشخصي والدروس الجماعية بصرياً.' 
              : 'Track and schedule personal training sessions and group classes visually.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* View Toggles */}
          <div className="flex items-center bg-muted/30 border border-white/5 rounded-xl p-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setViewMode('month')}
              className={`rounded-lg h-8 px-3 font-medium text-xs transition-all ${viewMode === 'month' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <Grid className="h-3.5 w-3.5 me-1.5" />
              {language === 'ar' ? 'شهري' : 'Month'}
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setViewMode('week')}
              className={`rounded-lg h-8 px-3 font-medium text-xs transition-all ${viewMode === 'week' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
            >
              <List className="h-3.5 w-3.5 me-1.5" />
              {language === 'ar' ? 'أسبوعي' : 'Week'}
            </Button>
          </div>

          {isStrike && (
            <Button 
              variant="outline"
              onClick={() => setIsStrikeTimetableOpen(true)}
              className="rounded-xl border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 font-bold text-sm h-10 px-4 flex items-center gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              {language === 'ar' ? 'جدول الحصص الأسبوعي' : 'Weekly Timetable'}
            </Button>
          )}

          <Button 
            onClick={() => handleOpenBooking(new Date(), 'class')}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm h-10 px-4 flex items-center gap-1.5 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'إضافة حصة جديدة' : 'Add Class / Event'}
          </Button>

          {features?.ptPackages !== false && (
            <Button 
              variant="outline"
              onClick={() => handleOpenBooking(new Date(), 'pt')}
              className="rounded-xl font-bold text-sm h-10 px-4 flex items-center gap-1.5 border-white/10 hover:bg-muted/40"
            >
              <Plus className="h-4 w-4" />
              {language === 'ar' ? 'حجز جلسة خاصة' : 'Book PT Session'}
            </Button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card/65 backdrop-blur-xl border border-white/5 rounded-2xl p-4 shadow-xl">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleToday}
            className="rounded-lg h-9 border-white/5 hover:bg-muted/40 font-bold text-xs"
          >
            {language === 'ar' ? 'اليوم' : 'Today'}
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={handlePrev} className="h-9 w-9 rounded-lg hover:bg-muted/40">
              {isRtl ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
            <span className="text-sm font-bold min-w-[120px] text-center text-foreground">
              {formatMonthYear(currentDate)}
            </span>
            <Button variant="ghost" size="icon" onClick={handleNext} className="h-9 w-9 rounded-lg hover:bg-muted/40">
              {isRtl ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground hidden sm:block" />
          <div className="w-full sm:w-[200px]">
            <Select value={selectedBranch} onValueChange={(v) => v && setSelectedBranch(v as any)}>
              <SelectTrigger className="rounded-xl bg-muted/20 border-white/5 h-9 text-xs">
                <SelectValue placeholder={language === 'ar' ? 'تصفية حسب الفرع' : 'Filter by Branch'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{language === 'ar' ? 'كل الفروع' : 'All Branches'}</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Calendar Grid View */}
      <Card className="border border-white/5 shadow-2xl overflow-hidden rounded-3xl bg-card/65 backdrop-blur-xl">
        <CardContent className="p-0">
          {/* Calendar Headers */}
          <div className="grid grid-cols-7 border-b border-white/5 bg-muted/20 text-center py-3 text-xs font-bold tracking-wider text-muted-foreground uppercase">
            {Array.from({ length: 7 }).map((_, idx) => (
              <div key={idx}>{getDayName(idx)}</div>
            ))}
          </div>

          {/* Grid Cells */}
          {viewMode === 'month' ? (
            <div className="grid grid-cols-7 divide-x divide-y divide-white/5 min-h-[500px]">
              {monthDays.map((day, idx) => {
                const isCurrentMonth = isSameMonth(day, currentDate);
                const isTodayDate = isSameDay(day, new Date());
                const daySessions = filteredRecords.filter(record => isSameDay(parseISO(record.date), day));
                const dayClasses = filteredClasses.filter(c => {
                  try {
                    return c.date === format(day, 'yyyy-MM-dd');
                  } catch {
                    return false;
                  }
                });

                const mergedItems = [
                  ...daySessions.map(s => ({ ...s, itemType: 'pt' as const })),
                  ...dayClasses.map(c => ({ ...c, itemType: 'class' as const }))
                ].sort((a, b) => {
                  const timeA = getItemStartTime(a);
                  const timeB = getItemStartTime(b);
                  return timeA.localeCompare(timeB);
                });
                
                return (
                  <div 
                    key={idx} 
                    className={`min-h-[100px] p-2 flex flex-col justify-between transition-all group hover:bg-muted/10 relative cursor-pointer ${
                      isCurrentMonth ? 'text-foreground' : 'text-muted-foreground/30 bg-muted/5'
                    } ${isTodayDate ? 'bg-primary/5' : ''}`}
                    onClick={() => handleOpenBooking(day)}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-bold flex items-center justify-center h-6 w-6 rounded-full ${
                        isTodayDate ? 'bg-primary text-primary-foreground font-black' : ''
                      }`}>
                        {format(day, 'd')}
                      </span>
                      {mergedItems.length > 0 && (
                        <span className="text-[10px] font-bold text-muted-foreground opacity-60">
                          {mergedItems.length} {language === 'ar' ? 'حصص' : 'sessions'}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 space-y-1 overflow-y-auto max-h-[80px] no-scrollbar py-1" onClick={(e) => e.stopPropagation()}>
                      {mergedItems.slice(0, 3).map(item => {
                        if (item.itemType === 'pt') {
                          const client = clients.find(c => c.id === item.clientId);
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => setSelectedRecord(item as any)}
                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded-md border truncate shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${getStatusColor(item.status)}`}
                            >
                              {format(parseISO(item.date), 'HH:mm')} - {client?.name || 'Member'}
                            </div>
                          );
                        } else {
                          return (
                            <div 
                              key={item.id} 
                              onClick={() => setSelectedClass(item as any)}
                              className="px-1.5 py-0.5 text-[10px] font-medium rounded-md border truncate shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                            >
                              {item.time.split(' - ')[0]} - {item.name}
                            </div>
                          );
                        }
                      })}
                      {mergedItems.length > 3 && (
                        <div className="text-[9px] font-bold text-center text-primary pt-0.5">
                          + {mergedItems.length - 3} {language === 'ar' ? 'المزيد' : 'more'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // Week View Detail Grid
            <div className="grid grid-cols-7 divide-x divide-white/5 min-h-[400px]">
              {weekDays.map((day, idx) => {
                const isTodayDate = isSameDay(day, new Date());
                const daySessions = filteredRecords.filter(record => isSameDay(parseISO(record.date), day));
                const dayClasses = filteredClasses.filter(c => {
                  try {
                    return c.date === format(day, 'yyyy-MM-dd');
                  } catch {
                    return false;
                  }
                });

                const mergedItems = [
                  ...daySessions.map(s => ({ ...s, itemType: 'pt' as const })),
                  ...dayClasses.map(c => ({ ...c, itemType: 'class' as const }))
                ].sort((a, b) => {
                  const timeA = getItemStartTime(a);
                  const timeB = getItemStartTime(b);
                  return timeA.localeCompare(timeB);
                });
                
                return (
                  <div 
                    key={idx} 
                    className={`p-3 min-h-[300px] flex flex-col gap-2 transition-all hover:bg-muted/10 ${
                      isTodayDate ? 'bg-primary/5' : ''
                    }`}
                    onClick={() => handleOpenBooking(day)}
                  >
                    <div className="text-center pb-2 border-b border-white/5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase">{format(day, 'eee')}</p>
                      <p className={`text-base font-black inline-block px-2 py-0.5 rounded-full ${
                        isTodayDate ? 'bg-primary text-primary-foreground' : 'text-foreground'
                      }`}>
                        {format(day, 'd')}
                      </p>
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto no-scrollbar py-1" onClick={(e) => e.stopPropagation()}>
                      {mergedItems.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-[10px] text-muted-foreground/35 italic select-none">
                          {language === 'ar' ? 'فارغ' : 'No bookings'}
                        </div>
                      ) : (
                        mergedItems.map(item => {
                          if (item.itemType === 'pt') {
                            const client = clients.find(c => c.id === item.clientId);
                            const trainer = users.find(u => u.id === item.trainerId);
                            return (
                              <div 
                                key={item.id}
                                onClick={() => setSelectedRecord(item as any)}
                                className={`p-2 text-xs font-semibold rounded-xl border space-y-1 shadow-sm transition-all hover:scale-[1.02] cursor-pointer ${getStatusColor(item.status)}`}
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-[10px]">{format(parseISO(item.date), 'h:mm a')}</span>
                                </div>
                                <p className="truncate font-bold text-foreground">{client?.name || 'Member'}</p>
                                {trainer && <p className="text-[9px] opacity-75 truncate">{trainer.name}</p>}
                              </div>
                            );
                          } else {
                            return (
                              <div 
                                key={item.id}
                                onClick={() => setSelectedClass(item as any)}
                                className="p-2 text-xs font-semibold rounded-xl border space-y-1 shadow-sm transition-all hover:scale-[1.02] cursor-pointer bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                              >
                                <div className="flex justify-between items-center">
                                  <span className="font-bold text-[10px]">{item.time}</span>
                                  <Badge className="bg-indigo-500/20 text-indigo-400 border-none text-[8px] px-1 h-3.5 uppercase font-mono">
                                    {item.type}
                                  </Badge>
                                </div>
                                <p className="truncate font-bold text-foreground">{item.name}</p>
                                <p className="text-[9px] opacity-75 truncate">{item.coachName}</p>
                                <p className="text-[8px] opacity-60">{item.attendees?.length || 0} / {item.capacity} Joined</p>
                              </div>
                            );
                          }
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking Modal Dialog */}
      <Dialog open={isBookModalOpen} onOpenChange={setIsBookModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6 md:p-8">
          <DialogHeader className="pb-2 text-left">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-primary" />
              <span>
                {bookingType === 'pt'
                  ? (language === 'ar' ? 'حجز حصة تدريبية (شخصي)' : 'Book a PT Session')
                  : (language === 'ar' ? 'جدولة حصة جماعية / فعالية' : 'Schedule Group Class')
                }
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 text-sm">
            {/* Booking Type Toggle */}
            <div className="flex items-center bg-muted/30 border border-white/5 rounded-xl p-1 mb-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBookingType('pt')}
                className={`flex-1 rounded-lg h-8 font-medium text-xs transition-all ${bookingType === 'pt' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {language === 'ar' ? 'تدريب شخصي PT' : 'PT Session'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBookingType('class')}
                className={`flex-1 rounded-lg h-8 font-medium text-xs transition-all ${bookingType === 'class' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground'}`}
              >
                {language === 'ar' ? 'حصة جماعية Class' : 'Group Class'}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'التاريخ' : 'Date'}</Label>
                <input 
                  type="date"
                  className="flex h-10 w-full rounded-xl border border-white/5 bg-muted/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={bookDate}
                  onChange={(e) => setBookDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'وقت البدء' : 'Start Time'}</Label>
                <input 
                  type="time"
                  className="flex h-10 w-full rounded-xl border border-white/5 bg-muted/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  value={bookTime}
                  onChange={(e) => setBookTime(e.target.value)}
                />
              </div>
            </div>

            {bookingType === 'pt' ? (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'العضو / العميل' : 'Client / Member'}</Label>
                  <Select value={bookClientId} onValueChange={(v) => v && setBookClientId(v)}>
                    <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                      <SelectValue placeholder={language === 'ar' ? 'اختر العضو' : 'Select client'} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.sessionsRemaining !== undefined ? `(${c.sessionsRemaining} left)` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'المدرب المسؤول' : 'Trainer / Coach'}</Label>
                  <Select value={bookTrainerId} onValueChange={(v) => v && setBookTrainerId(v)}>
                    <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                      <SelectValue placeholder={language === 'ar' ? 'اختر المدرب' : 'Select trainer'} />
                    </SelectTrigger>
                    <SelectContent>
                      {coaches.filter(c => c.active).map(c => (
                        <SelectItem key={c.id} value={c.userId || c.id}>{c.name} (Coach)</SelectItem>
                      ))}
                      {/* Also include any users with role=coach not already in coaches list */}
                      {users.filter(u => u.role === 'coach' && u.status !== 'nonworking' && !coaches.some(c => c.userId === u.id)).map(u => (
                        <SelectItem key={u.id} value={u.id}>{u.name} (Coach)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الفرع' : 'Branch'}</Label>
                  <Select value={bookBranch} onValueChange={(v) => v && setBookBranch(v as Branch)}>
                    <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                      <SelectValue placeholder={language === 'ar' ? 'اختر الفرع' : 'Select branch'} />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'ملاحظات' : 'Notes'}</Label>
                  <Textarea 
                    className="min-h-[80px] rounded-xl bg-muted/20 border-white/5 focus:border-primary resize-none p-3 text-sm"
                    placeholder={language === 'ar' ? 'تفاصيل إضافية للحجز...' : 'PT package focus, physical targets, notes...'}
                    value={bookNotes}
                    onChange={(e) => setBookNotes(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'اسم الحصة' : 'Class Name'}</Label>
                  <Input 
                    placeholder={language === 'ar' ? 'مثال: أساسيات الملاكمة' : 'e.g. Boxing Fundamentals'}
                    className="rounded-xl bg-muted/20 border-white/5 h-10 focus:border-primary"
                    value={className}
                    onChange={(e) => setClassName(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'المدرب / المحاضر' : 'Coach / Instructor'}</Label>
                  <Select value={classCoachName} onValueChange={(v) => v && setClassCoachName(v)}>
                    <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                      <SelectValue placeholder={language === 'ar' ? 'اختر المدرب' : 'Select coach'} />
                    </SelectTrigger>
                    <SelectContent>
                      {coaches.filter(c => c.active).map(c => (
                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'النوع' : 'Type'}</Label>
                    <Select value={classType} onValueChange={(v) => v && setClassType(v as any)}>
                      <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Class">{language === 'ar' ? 'حصة جماعية' : 'Class'}</SelectItem>
                        <SelectItem value="Event">{language === 'ar' ? 'فعالية' : 'Event'}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'وقت الانتهاء' : 'End Time'}</Label>
                    <input 
                      type="time"
                      className="flex h-10 w-full rounded-xl border border-white/5 bg-muted/20 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                      value={classEndTime}
                      onChange={(e) => setClassEndTime(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'السعة القصوى' : 'Capacity'}</Label>
                    <Input 
                      type="number" 
                      className="rounded-xl bg-muted/20 border-white/5 h-10 focus:border-primary"
                      value={classCapacity}
                      onChange={(e) => setClassCapacity(Number(e.target.value) || 15)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الفرع' : 'Branch'}</Label>
                    <Select value={bookBranch} onValueChange={(v) => v && setBookBranch(v as Branch)}>
                      <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                        <SelectValue placeholder={language === 'ar' ? 'اختر الفرع' : 'Select branch'} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map(b => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'فئة / مستوى المشتركين' : 'Target Tier / Category'}</Label>
                  <Select value={classTier} onValueChange={(v) => v && setClassTier(v)}>
                    <SelectTrigger className="w-full bg-muted/20 border-white/5 rounded-xl h-10">
                      <SelectValue placeholder="Select allowed tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All Tiers">All Tiers (Open to Everyone)</SelectItem>
                      <SelectItem value="Kids Only">Kids Only</SelectItem>
                      <SelectItem value="Kids Pro">Kids Pro Only</SelectItem>
                      <SelectItem value="Junior Only">Junior Only</SelectItem>
                      <SelectItem value="Junior Advanced">Junior Advanced / Pro</SelectItem>
                      <SelectItem value="Adults">Adults Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4 items-center pt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="repeatWeekly" 
                      checked={repeatWeekly} 
                      onCheckedChange={(checked) => setRepeatWeekly(!!checked)} 
                    />
                    <label htmlFor="repeatWeekly" className="text-xs font-semibold cursor-pointer select-none">
                      {language === 'ar' ? 'تكرار أسبوعياً' : 'Repeat weekly'}
                    </label>
                  </div>
                  {repeatWeekly && (
                    <div className="space-y-1">
                      <Label className="text-xs font-bold text-muted-foreground uppercase">
                        {language === 'ar' ? 'عدد الأسابيع' : 'Weeks to repeat'}
                      </Label>
                      <Input 
                        type="number"
                        min="1"
                        max="12"
                        className="rounded-xl bg-muted/20 border-white/5 h-10 focus:border-primary"
                        value={repeatWeeks}
                        onChange={(e) => setRepeatWeeks(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوصف' : 'Description'}</Label>
                  <Textarea 
                    className="min-h-[80px] rounded-xl bg-muted/20 border-white/5 focus:border-primary resize-none p-3 text-sm"
                    placeholder={language === 'ar' ? 'تفاصيل إضافية للحصة الجماعية...' : 'Class details, sparring focus, level info...'}
                    value={classDescription}
                    onChange={(e) => setClassDescription(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter className="pt-4 border-t flex flex-col sm:flex-row gap-2">
            <Button variant="outline" className="rounded-xl order-2 sm:order-1" onClick={() => setIsBookModalOpen(false)}>
              {language === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button 
              className="rounded-xl bg-primary text-primary-foreground font-bold hover:opacity-95 order-1 sm:order-2"
              onClick={handleCreateBooking}
              disabled={
                bookingType === 'pt' 
                  ? (!bookClientId || !bookDate || !bookBranch) 
                  : (!className || !bookDate || !bookBranch || !classCoachName || !bookTime || !classEndTime)
              }
            >
              {language === 'ar' ? 'تأكيد الحجز' : 'Confirm Booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Details / Edit Status Modal Dialog */}
      <Dialog open={selectedRecord !== null} onOpenChange={(open) => !open && setSelectedRecord(null)}>
        {selectedRecord && (() => {
          const { client, displayName, displayPhone, rawId, isOrphaned } = resolveAttendee({
            clientId: selectedRecord.clientId,
            name: (selectedRecord as any).clientName,
            phone: (selectedRecord as any).clientPhone
          }, clients);
          const trainer = users.find(u => u.id === selectedRecord.trainerId);
          return (
            <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6 md:p-8">
              <DialogHeader className="pb-3 border-b text-left">
                <DialogTitle className="text-lg font-bold flex items-center justify-between">
                  <span>{language === 'ar' ? 'تفاصيل الحصة التدريبية' : 'Session Details'}</span>
                  <Badge className={`px-2 py-0.5 rounded-lg border ${getStatusColor(selectedRecord.status)}`}>
                    {selectedRecord.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-sm leading-relaxed">
                <div className="flex items-center gap-3">
                  <UserIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الأعضاء' : 'Member'}</p>
                    {client ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecord(null);
                          setActiveTab('clients');
                          setActiveClientId(client.id);
                        }}
                        className="font-bold text-foreground text-base hover:text-primary transition-colors underline decoration-dotted text-left block"
                        title="View member profile in CRM"
                      >
                        {displayName}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2" title={`Profile no longer found (ID: ${rawId})`}>
                        <span className="font-bold text-muted-foreground text-base line-through opacity-70">
                          {displayName}
                        </span>
                        <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 text-[9px] px-1 py-0 h-4">
                          Orphaned
                        </Badge>
                      </div>
                    )}
                    {displayPhone && <p className="text-[10px] text-muted-foreground">{displayPhone}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوقت' : 'Time'}</p>
                      <p className="font-bold text-foreground">{format(parseISO(selectedRecord.date), 'PPP')}</p>
                      <p className="text-xs text-muted-foreground">{format(parseISO(selectedRecord.date), 'h:mm a')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الفرع' : 'Branch'}</p>
                      <p className="font-bold text-foreground">{selectedRecord.branch || 'General'}</p>
                    </div>
                  </div>
                </div>

                {trainer && (
                  <div className="flex items-center gap-3">
                    <UserIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'المدرب' : 'Coach / Trainer'}</p>
                      <p className="font-bold text-foreground">{trainer.name}</p>
                    </div>
                  </div>
                )}

                {selectedRecord.notes && (
                  <div className="bg-muted/10 p-3 rounded-xl border border-white/5 space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'ملاحظات' : 'Notes'}</p>
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{selectedRecord.notes}</p>
                  </div>
                )}

                {/* Change Status Controls */}
                {selectedRecord.status === 'Scheduled' && (
                  <div className="pt-4 border-t space-y-2">
                    <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
                      {language === 'ar' ? 'تحديث حالة الحضور' : 'Update Attendance Status'}
                    </Label>
                    <div className="grid grid-cols-3 gap-2">
                      <Button 
                        size="sm"
                        onClick={() => handleStatusChange(selectedRecord.id, 'Attended')}
                        className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
                      >
                        <CheckCircle className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'حضر' : 'Attended'}
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(selectedRecord.id, 'No Show')}
                        className="rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500/5 font-bold text-xs"
                      >
                        <XCircle className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'لم يحضر' : 'No Show'}
                      </Button>
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => handleStatusChange(selectedRecord.id, 'Cancelled')}
                        className="rounded-xl border-zinc-800 text-zinc-400 hover:bg-zinc-900 font-bold text-xs"
                      >
                        <AlertCircle className="h-3.5 w-3.5 me-1" />
                        {language === 'ar' ? 'ألغي' : 'Cancel'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setSelectedRecord(null)}>
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>

      {/* Class Details & Embedded Class Manager Modal Dialog */}
      <Dialog
        open={selectedClass !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedClass(null);
            setIsEditingClassDetails(false);
            setRosterSearchQuery('');
          }
        }}
      >
        {selectedClass && (() => {
          const liveClass = gymClasses.find(c => c.id === selectedClass.id) || selectedClass;
          const attendeeIds = liveClass.attendees || [];
          const waitlistIds = liveClass.waitlist || [];
          const checkedInIds = liveClass.checkedInAttendees || [];
          const noShowIds = liveClass.noShowAttendees || [];
          const isFull = attendeeIds.length >= liveClass.capacity;

          const matchingMembers = isInzan && rosterSearchQuery.trim().length >= 2
            ? clients
                .filter(c => {
                  const q = rosterSearchQuery.toLowerCase();
                  return (
                    String(c.name || '').toLowerCase().includes(q) ||
                    String(c.memberId || '').toLowerCase().includes(q) ||
                    String(c.phone || '').toLowerCase().includes(q)
                  );
                })
                .slice(0, 8)
            : [];

          const handleAddMemberToClass = async (memberId: string) => {
            if (attendeeIds.includes(memberId) || waitlistIds.includes(memberId)) return;
            try {
              if (!isFull) {
                const updated = [...attendeeIds, memberId];
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  attendees: updated,
                  updatedAt: new Date().toISOString()
                });
              } else {
                const updatedWaitlist = [...waitlistIds, memberId];
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  waitlist: updatedWaitlist,
                  updatedAt: new Date().toISOString()
                });
              }
              setRosterSearchQuery('');
            } catch (err) {
              console.error('Failed to add member to class:', err);
            }
          };

          const handleRemoveMemberFromClass = async (memberId: string, fromWaitlist = false) => {
            try {
              if (fromWaitlist) {
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  waitlist: waitlistIds.filter(id => id !== memberId),
                  updatedAt: new Date().toISOString()
                });
              } else {
                const nextAttendees = attendeeIds.filter(id => id !== memberId);
                const nextWaitlist = [...waitlistIds];
                if (nextAttendees.length < liveClass.capacity && nextWaitlist.length > 0) {
                  const promoted = nextWaitlist.shift()!;
                  nextAttendees.push(promoted);
                }
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  attendees: nextAttendees,
                  waitlist: nextWaitlist,
                  checkedInAttendees: checkedInIds.filter(id => id !== memberId),
                  noShowAttendees: noShowIds.filter(id => id !== memberId),
                  updatedAt: new Date().toISOString()
                });
              }
            } catch (err) {
              console.error('Failed to remove member from class:', err);
            }
          };

          const handleToggleAttendeeStatus = async (memberId: string, statusType: 'checkedIn' | 'noShow') => {
            try {
              if (statusType === 'checkedIn') {
                const nextCheckedIn = checkedInIds.includes(memberId)
                  ? checkedInIds.filter(id => id !== memberId)
                  : [...checkedInIds, memberId];
                const nextNoShow = noShowIds.filter(id => id !== memberId);
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  checkedInAttendees: nextCheckedIn,
                  noShowAttendees: nextNoShow,
                  updatedAt: new Date().toISOString()
                });
              } else {
                const nextNoShow = noShowIds.includes(memberId)
                  ? noShowIds.filter(id => id !== memberId)
                  : [...noShowIds, memberId];
                const nextCheckedIn = checkedInIds.filter(id => id !== memberId);
                await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                  noShowAttendees: nextNoShow,
                  checkedInAttendees: nextCheckedIn,
                  updatedAt: new Date().toISOString()
                });
              }
            } catch (err) {
              console.error('Failed to update attendee attendance status:', err);
            }
          };

          const handleSaveClassEdit = async () => {
            setIsSavingClassEdit(true);
            try {
              await updateDoc(doc(db, 'classSchedules', liveClass.id), {
                name: editClassName || liveClass.name,
                coachName: editClassCoach || liveClass.coachName,
                instructorName: editClassCoach || liveClass.coachName,
                time: editClassTime || liveClass.time,
                capacity: Number(editClassCapacity) || liveClass.capacity,
                description: editClassDescription,
                updatedAt: new Date().toISOString()
              });
              setIsEditingClassDetails(false);
            } catch (err) {
              console.error('Failed to update class details:', err);
            } finally {
              setIsSavingClassEdit(false);
            }
          };

          return (
            <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6 md:p-8">
              <DialogHeader className="pb-3 border-b text-left">
                <DialogTitle className="text-lg font-bold flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-indigo-400" />
                    <span>{language === 'ar' ? 'تفاصيل وإدارة الحصة الجماعية' : (isInzan ? 'Group Class Details & Class Manager' : 'Group Class Details')}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="px-2 py-0.5 rounded-lg border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                      {liveClass.type}
                    </Badge>
                    {isInzan && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 rounded-lg"
                          onClick={() => {
                            if (!isEditingClassDetails) {
                              setEditClassName(liveClass.name);
                              setEditClassCoach(liveClass.coachName);
                              setEditClassTime(liveClass.time);
                              setEditClassCapacity(liveClass.capacity);
                              setEditClassDescription(liveClass.description || '');
                            }
                            setIsEditingClassDetails(!isEditingClassDetails);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          {isEditingClassDetails ? 'Cancel Edit' : 'Edit Class'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 rounded-lg border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => {
                            setSelectedClass(null);
                            setActiveTab('classes');
                          }}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Master Templates
                        </Button>
                      </>
                    )}
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-sm leading-relaxed">
                {isInzan && isEditingClassDetails ? (
                  <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-primary">Edit Class Schedule & Capacity</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Class Name</Label>
                        <Input value={editClassName} onChange={(e) => setEditClassName(e.target.value)} className="h-9 rounded-xl bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Coach / Instructor</Label>
                        <Input value={editClassCoach} onChange={(e) => setEditClassCoach(e.target.value)} className="h-9 rounded-xl bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Time Window (e.g. 18:00 - 19:15)</Label>
                        <Input value={editClassTime} onChange={(e) => setEditClassTime(e.target.value)} className="h-9 rounded-xl bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Max Capacity</Label>
                        <Input type="number" value={editClassCapacity} onChange={(e) => setEditClassCapacity(Number(e.target.value) || 15)} className="h-9 rounded-xl bg-background" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Description / Notes</Label>
                      <Textarea value={editClassDescription} onChange={(e) => setEditClassDescription(e.target.value)} className="min-h-[60px] rounded-xl bg-background text-xs" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setIsEditingClassDetails(false)}>Cancel</Button>
                      <Button size="sm" onClick={handleSaveClassEdit} disabled={isSavingClassEdit}>
                        {isSavingClassEdit ? 'Saving...' : 'Save Class Changes'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3 bg-muted/20 p-3.5 rounded-2xl border border-border/50">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'اسم الحصة' : 'Class Name'}</p>
                          <p className="font-bold text-foreground text-base">{liveClass.name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">Capacity</p>
                        <Badge variant="outline" className={`text-xs font-bold ${isFull ? 'border-amber-500/40 text-amber-500 bg-amber-500/10' : 'border-emerald-500/40 text-emerald-500 bg-emerald-500/10'}`}>
                          {attendeeIds.length} / {liveClass.capacity} Booked
                        </Badge>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/10 border border-border/40">
                        <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوقت' : 'Date & Time'}</p>
                          <p className="font-bold text-foreground text-xs">{format(parseISO(liveClass.date), 'dd MMM yyyy')}</p>
                          <p className="text-[11px] text-muted-foreground">{liveClass.time}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/10 border border-border/40">
                        <UserIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'المدرب' : 'Coach / Instructor'}</p>
                          <p className="font-bold text-foreground text-xs">{liveClass.coachName}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/10 border border-border/40">
                        <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الفرع' : 'Branch'}</p>
                          <p className="font-bold text-foreground text-xs">{liveClass.branch || 'General'}</p>
                        </div>
                      </div>
                    </div>

                    {liveClass.description && (
                      <div className="bg-muted/10 p-3 rounded-xl border border-white/5 space-y-1">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوصف' : 'Description'}</p>
                        <p className="text-xs text-muted-foreground italic leading-relaxed">{liveClass.description}</p>
                      </div>
                    )}
                  </>
                )}

                {/* Embedded Class Manager: Search & Add Member to Roster / Waitlist */}
                {isInzan && (
                  <div className="p-3.5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                        <UserPlus className="h-3.5 w-3.5" />
                        Add Member to Class {isFull ? '(Adds to Waitlist)' : 'Roster'}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {checkedInIds.length} Checked In · {noShowIds.length} No-Show
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search member by name, ID (#), or phone to add to class..."
                        value={rosterSearchQuery}
                        onChange={(e) => setRosterSearchQuery(e.target.value)}
                        className="pl-8 h-9 rounded-xl bg-background text-xs"
                      />
                    </div>
                    {matchingMembers.length > 0 && (
                      <div className="border rounded-xl bg-background divide-y max-h-44 overflow-y-auto shadow-md">
                        {matchingMembers.map(m => {
                          const alreadyInRoster = attendeeIds.includes(m.id);
                          const alreadyInWaitlist = waitlistIds.includes(m.id);
                          return (
                            <div key={m.id} className="p-2 flex items-center justify-between text-xs hover:bg-muted/40">
                              <div>
                                <span className="font-bold text-foreground">{m.name}</span>
                                <span className="text-muted-foreground ml-1.5 font-mono text-[10px]">#{m.memberId || 'N/A'}</span>
                                <span className="text-muted-foreground ml-2 text-[10px]">{m.phone}</span>
                              </div>
                              <Button
                                size="sm"
                                variant={alreadyInRoster || alreadyInWaitlist ? 'outline' : 'default'}
                                disabled={alreadyInRoster || alreadyInWaitlist}
                                className="h-7 text-[11px] px-2.5 rounded-lg"
                                onClick={() => handleAddMemberToClass(m.id)}
                              >
                                {alreadyInRoster ? 'Booked' : alreadyInWaitlist ? 'Waitlisted' : isFull ? '+ Waitlist' : '+ Add to Class'}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Attendees Roster with Check-In / No-Show / Remove Controls */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex justify-between">
                    <span>{language === 'ar' ? 'المشاركون' : 'Class Roster (Attendees)'}</span>
                    <span>{attendeeIds.length} / {liveClass.capacity}</span>
                  </p>
                  <div className="max-h-[220px] overflow-y-auto border border-white/5 rounded-xl bg-muted/10 divide-y divide-white/5">
                    {attendeeIds.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic p-3 text-center">
                        {language === 'ar' ? 'لا يوجد مشاركون بعد' : 'No attendees signed up yet'}
                      </p>
                    ) : (
                      attendeeIds.map(clientId => {
                        const { client, displayName, displayPhone, rawId } = resolveAttendee(clientId, clients);
                        const memberKey = typeof clientId === 'string' ? clientId : rawId;
                        const isCheckedIn = checkedInIds.includes(memberKey);
                        const isNoShow = noShowIds.includes(memberKey);
                        return (
                          <div key={memberKey} className="p-2.5 flex flex-wrap justify-between items-center gap-2 text-xs">
                            <div className="flex items-center gap-2">
                              {client ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedClass(null);
                                    setActiveTab('clients');
                                    setActiveClientId(client.id);
                                  }}
                                  className="font-semibold text-foreground hover:text-primary transition-colors underline decoration-dotted text-left"
                                  title="View member profile in CRM"
                                >
                                  {displayName}
                                </button>
                              ) : (
                                <div className="flex items-center gap-1.5" title={`Profile no longer found (ID: ${rawId})`}>
                                  <span className="font-semibold text-muted-foreground line-through opacity-70">
                                    {displayName}
                                  </span>
                                  <Badge variant="outline" className="border-amber-500/40 text-amber-500 bg-amber-500/10 text-[9px] px-1 py-0 h-4">
                                    Orphaned
                                  </Badge>
                                </div>
                              )}
                              <span className="text-muted-foreground text-[10px]">{displayPhone}</span>
                              {isCheckedIn && (
                                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-[9px] px-1.5 py-0 h-4">
                                  ✓ Checked In
                                </Badge>
                              )}
                              {isNoShow && (
                                <Badge className="bg-rose-500/15 text-rose-500 border-rose-500/30 text-[9px] px-1.5 py-0 h-4">
                                  ✗ No-Show
                                </Badge>
                              )}
                            </div>

                            {isInzan && (
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isCheckedIn ? 'default' : 'outline'}
                                  className={`h-6 px-2 text-[10px] rounded-md ${isCheckedIn ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'border-emerald-500/30 text-emerald-500'}`}
                                  onClick={() => handleToggleAttendeeStatus(memberKey, 'checkedIn')}
                                >
                                  Check In
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={isNoShow ? 'default' : 'outline'}
                                  className={`h-6 px-2 text-[10px] rounded-md ${isNoShow ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'border-rose-500/30 text-rose-500'}`}
                                  onClick={() => handleToggleAttendeeStatus(memberKey, 'noShow')}
                                >
                                  No-Show
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                                  title="Remove from class"
                                  onClick={() => handleRemoveMemberFromClass(memberKey, false)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Waitlist Section (if any) */}
                {isInzan && waitlistIds.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-wide flex justify-between">
                      <span>Waitlist Queue</span>
                      <span>{waitlistIds.length} Waiting</span>
                    </p>
                    <div className="border border-amber-500/20 rounded-xl bg-amber-500/5 divide-y divide-amber-500/10">
                      {waitlistIds.map((wId, idx) => {
                        const { displayName, displayPhone, rawId } = resolveAttendee(wId, clients);
                        const wKey = typeof wId === 'string' ? wId : rawId;
                        return (
                          <div key={wKey} className="p-2 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-mono text-[10px] text-amber-500 font-bold mr-2">#{idx + 1}</span>
                              <span className="font-semibold text-foreground">{displayName}</span>
                              <span className="text-muted-foreground text-[10px] ml-2">{displayPhone}</span>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-rose-500"
                              onClick={() => handleRemoveMemberFromClass(wKey, true)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Cancel / Delete Class button */}
                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500/5 font-bold text-xs"
                    onClick={async () => {
                      if (window.confirm(language === 'ar' ? 'هل أنت متأكد من إلغاء وحذف هذه الحصة؟' : 'Are you sure you want to cancel and delete this class?')) {
                        try {
                          await deleteDoc(doc(db, 'classSchedules', liveClass.id));
                          setSelectedClass(null);
                        } catch (err) {
                          console.error("Failed to delete class:", err);
                        }
                      }
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5 me-1" />
                    {language === 'ar' ? 'إلغاء وحذف الحصة' : 'Cancel & Delete Class'}
                  </Button>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" className="w-full rounded-xl" onClick={() => setSelectedClass(null)}>
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </Button>
              </DialogFooter>
            </DialogContent>
          );
        })()}
      </Dialog>
      {/* Strike Weekly Timetable Modal */}
      {isStrike && (
        <Dialog open={isStrikeTimetableOpen} onOpenChange={setIsStrikeTimetableOpen}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-zinc-950 border-zinc-800 p-6 rounded-3xl">
            <StrikeWeeklyScheduleView userRole={currentUser?.role} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
