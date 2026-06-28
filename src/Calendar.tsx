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
import { db } from './firebase';
import { collection, onSnapshot, addDoc, doc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Checkbox } from '@/components/ui/checkbox';
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
  Sparkles
} from 'lucide-react';
import { PTPackageRecord, Branch } from './types';

interface GymClass {
  id: string;
  name: string;
  coachName: string;
  date: string;          // YYYY-MM-DD
  time: string;          // e.g. "18:00 - 19:15"
  branch: string;
  capacity: number;
  attendees: string[];   // clientIds
  type: 'Class' | 'Event';
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
    features
  } = useAppContext();

  const { t, language, isRtl } = useLanguage();

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

  // Group Class Booking Form State
  const [bookingType, setBookingType] = useState<'pt' | 'class'>('pt');
  const [className, setClassName] = useState('');
  const [classCoachName, setClassCoachName] = useState('');
  const [classEndTime, setClassEndTime] = useState('11:15');
  const [classCapacity, setClassCapacity] = useState(15);
  const [classType, setClassType] = useState<'Class' | 'Event'>('Class');
  const [classDescription, setClassDescription] = useState('');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);

  useEffect(() => {
    if (features && features.ptPackages === false) {
      setBookingType('class');
    }
  }, [features]);

  // Fetch classes collection
  useEffect(() => {
    const q = collection(db, 'classes');
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as GymClass));
      setGymClasses(list);
    }, (err) => {
      console.error("Error loading classes for calendar:", err);
    });
    return unsub;
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

  // Filtered sessions
  const filteredRecords = useMemo(() => {
    if (features?.ptPackages === false) return [];
    return ptPackageRecords.filter(record => {
      if (selectedBranch !== 'All' && record.branch !== selectedBranch) return false;
      return true;
    });
  }, [ptPackageRecords, selectedBranch, features]);

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
      return format(parseISO(item.date), 'HH:mm');
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
  const handleOpenBooking = (date: Date) => {
    setBookDate(format(date, 'yyyy-MM-dd'));
    // Auto-select branch from current user or first branch
    if (currentUser?.branch) {
      setBookBranch(currentUser.branch);
    } else if (branches && branches.length > 0) {
      setBookBranch(branches[0] || '');
    }
    // Reset booking states
    setBookingType('pt');
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

      // Reset fields
      setBookClientId('');
      setBookTrainerId('');
      setBookNotes('');
    } else {
      if (!className || !bookDate || !bookBranch || !classCoachName || !bookTime || !classEndTime) return;

      if (repeatWeekly) {
        const batch = writeBatch(db);
        const baseDate = parseISO(bookDate);
        for (let i = 0; i < repeatWeeks; i++) {
          const classDate = addDays(baseDate, 7 * i);
          const dateStr = format(classDate, 'yyyy-MM-dd');
          const newDocRef = doc(collection(db, 'classes'));
          batch.set(newDocRef, {
            name: className,
            coachName: classCoachName,
            date: dateStr,
            time: `${bookTime} - ${classEndTime}`,
            branch: bookBranch,
            capacity: Number(classCapacity) || 15,
            attendees: [],
            type: classType,
            description: classDescription || undefined
          });
        }
        await batch.commit();
      } else {
        await addDoc(collection(db, 'classes'), {
          name: className,
          coachName: classCoachName,
          date: bookDate,
          time: `${bookTime} - ${classEndTime}`,
          branch: bookBranch,
          capacity: Number(classCapacity) || 15,
          attendees: [],
          type: classType,
          description: classDescription || undefined
        });
      }

      // Reset fields
      setClassName('');
      setClassCoachName('');
      setClassEndTime('11:15');
      setClassCapacity(15);
      setClassType('Class');
      setClassDescription('');
      setRepeatWeekly(false);
      setRepeatWeeks(4);
    }

    setIsBookModalOpen(false);
  };

  const handleStatusChange = async (recordId: string, status: PTPackageRecord['status']) => {
    await updatePTPackageRecord(recordId, { status });
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

          <Button 
            onClick={() => handleOpenBooking(new Date())}
            className="rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-sm h-10 px-4 flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            {language === 'ar' ? 'حجز جلسة جديدة' : 'Book Session'}
          </Button>
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
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
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
                      {users.filter(u => u.role === 'coach' || coaches.some(c => c.active && c.userId === u.id)).map(u => (
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
          const client = clients.find(c => c.id === selectedRecord.clientId);
          const trainer = users.find(u => u.id === selectedRecord.trainerId);
          return (
            <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
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
                    <p className="font-bold text-foreground text-base">{client?.name || 'Unknown Client'}</p>
                    <p className="text-[10px] text-muted-foreground">{client?.phone}</p>
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

      {/* Class Details / Delete Class Modal Dialog */}
      <Dialog open={selectedClass !== null} onOpenChange={(open) => !open && setSelectedClass(null)}>
        {selectedClass && (() => {
          return (
            <DialogContent className="max-w-md bg-background/95 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl p-6">
              <DialogHeader className="pb-3 border-b text-left">
                <DialogTitle className="text-lg font-bold flex items-center justify-between">
                  <span>{language === 'ar' ? 'تفاصيل الحصة الجماعية' : 'Group Class Details'}</span>
                  <Badge className="px-2 py-0.5 rounded-lg border bg-indigo-500/10 text-indigo-400 border-indigo-500/20">
                    {selectedClass.type}
                  </Badge>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-4 text-sm leading-relaxed">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'اسم الحصة' : 'Class Name'}</p>
                    <p className="font-bold text-foreground text-base">{selectedClass.name}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوقت' : 'Time'}</p>
                      <p className="font-bold text-foreground">{format(parseISO(selectedClass.date), 'PPP')}</p>
                      <p className="text-xs text-muted-foreground">{selectedClass.time}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الفرع' : 'Branch'}</p>
                      <p className="font-bold text-foreground">{selectedClass.branch || 'General'}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <UserIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase">{language === 'ar' ? 'المدرب' : 'Coach / Instructor'}</p>
                    <p className="font-bold text-foreground">{selectedClass.coachName}</p>
                  </div>
                </div>

                {selectedClass.description && (
                  <div className="bg-muted/10 p-3 rounded-xl border border-white/5 space-y-1">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{language === 'ar' ? 'الوصف' : 'Description'}</p>
                    <p className="text-xs text-muted-foreground italic leading-relaxed">{selectedClass.description}</p>
                  </div>
                )}

                {/* Attendees list */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide flex justify-between">
                    <span>{language === 'ar' ? 'المشاركون' : 'Attendees'}</span>
                    <span>{selectedClass.attendees?.length || 0} / {selectedClass.capacity}</span>
                  </p>
                  <div className="max-h-[150px] overflow-y-auto border border-white/5 rounded-xl bg-muted/10 divide-y divide-white/5">
                    {!selectedClass.attendees || selectedClass.attendees.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic p-3 text-center">
                        {language === 'ar' ? 'لا يوجد مشاركون بعد' : 'No attendees signed up yet'}
                      </p>
                    ) : (
                      selectedClass.attendees.map(clientId => {
                        const client = clients.find(c => c.id === clientId);
                        return (
                          <div key={clientId} className="p-2 flex justify-between items-center text-xs">
                            <span className="font-semibold text-foreground">{client?.name || 'Unknown Client'}</span>
                            <span className="text-muted-foreground text-[10px]">{client?.phone || ''}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Cancel / Delete Class button */}
                <div className="pt-4 border-t">
                  <Button 
                    variant="outline" 
                    className="w-full rounded-xl border-rose-500/20 text-rose-500 hover:bg-rose-500/5 font-bold text-xs"
                    onClick={async () => {
                      if (window.confirm(language === 'ar' ? 'هل أنت متأكد من إلغاء وحذف هذه الحصة؟' : 'Are you sure you want to cancel and delete this class?')) {
                        await deleteDoc(doc(db, 'classes', selectedClass.id));
                        setSelectedClass(null);
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
    </div>
  );
}
