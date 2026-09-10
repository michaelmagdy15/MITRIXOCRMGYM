import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useClasses } from '../hooks/useClasses';
import { ClassAnalytics } from './ClassAnalytics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { collection, getDocs, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { User, Client } from '../types';
import { ClassSchedule } from '../types/class';
import { 
  Calendar, 
  Search, 
  Filter, 
  Plus, 
  Trash2, 
  Users, 
  Flame, 
  Clock, 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  CheckCircle2, 
  Edit, 
  AlertCircle,
  Check,
  X,
  Phone,
  UserPlus,
  UserCheck,
  UserX,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useAppContext } from '../context';
import { format, addWeeks, isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';
import { safeFormatDate, safeFormatTime, toValidDate } from '../utils/dateUtils';
import { getSessionAllowedTiers, toCanonicalTier, CanonicalTier } from '../utils/memberCategories';

export const TIER_OPTIONS: { id: CanonicalTier; label: string }[] = [
  { id: 'KIDS', label: 'Kids Standard' },
  { id: 'KIDS_PRO', label: 'Kids Pro' },
  { id: 'JUNIORS', label: 'Juniors Standard' },
  { id: 'JUNIORS_PRO', label: 'Juniors Pro' },
  { id: 'ADULT', label: 'Adults' }
];

export const BASE_CATEGORIES = [
  'Adults',
  'Kids',
  'Juniors',
  'Boxing',
  'HIIT',
  'Strength & Conditioning',
  'Cardio Blast',
  'Yoga & Flexibility',
  'Pilates',
  'Mobility & Core',
  'Cross Training',
  'Spinning'
];

export const ClassManager: React.FC = () => {
  const { classes, loading, addClass, updateClass, deleteClass } = useClasses();
  const { currentUser } = useAuth();
  const { branches, branding } = useSettings();
  const { clients } = useAppContext();
  const [coaches, setCoaches] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSchedule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Filtering & Sorting
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const [selectedDateFilter, setSelectedDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'week' | 'upcoming' | 'past'>('all');

  // Form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Adults');
  const [selectedTiers, setSelectedTiers] = useState<CanonicalTier[]>(['ADULT']);
  const [instructorId, setInstructorId] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [capacity, setCapacity] = useState(15);
  const [price, setPrice] = useState(0);
  const [branch, setBranch] = useState(branches?.[0] || 'Maxim Compound');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  
  // Cancel/Delete Dialog State
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelClassId, setCancelClassId] = useState('');
  const [cancelClassName, setCancelClassName] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Attendees Roster Modal State
  const [rosterClass, setRosterClass] = useState<ClassSchedule | null>(null);
  const [isRosterOpen, setIsRosterOpen] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [selectedMemberToAdd, setSelectedMemberToAdd] = useState<string>('');

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const users = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
        const activeCoaches = users.filter(u => u.role === 'coach' || (u.role as string) === 'trainer' || u.role === 'admin');
        setCoaches(activeCoaches);
        if (activeCoaches.length > 0 && !instructorId) {
          setInstructorId(activeCoaches[0]?.id || '');
          setInstructorName(activeCoaches[0]?.name || '');
        }
      } catch (err) {
        console.error("Error fetching coaches for class manager:", err);
      }
    };
    fetchCoaches();
  }, []);

  // Synchronize latest rosterClass when classes change in real-time
  useEffect(() => {
    if (rosterClass) {
      const freshClass = classes.find(c => c.id === rosterClass.id);
      if (freshClass) {
        setRosterClass(freshClass);
      }
    }
  }, [classes]);

  // Dynamic Categories from Base + Loaded Classes
  const dynamicCategories = useMemo(() => {
    const catSet = new Set<string>(BASE_CATEGORIES);
    classes.forEach(c => {
      if (c.category) catSet.add(c.category);
    });
    return Array.from(catSet);
  }, [classes]);

  const openCreateDialog = () => {
    setEditingClass(null);
    setName('');
    setCategory('Adults');
    setSelectedTiers(['ADULT']);
    if (coaches.length > 0) {
      setInstructorId(coaches[0]?.id || '');
      setInstructorName(coaches[0]?.name || '');
    }
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setStartTime('10:00');
    setEndTime('11:00');
    setCapacity(15);
    setPrice(0);
    setBranch(branches?.[0] || 'Maxim Compound');
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (cls: ClassSchedule) => {
    setEditingClass(cls);
    setName(cls.name);
    setCategory(cls.category || 'Adults');
    const initialTiers = (cls.allowed_tiers && cls.allowed_tiers.length > 0)
      ? cls.allowed_tiers.map(toCanonicalTier)
      : getSessionAllowedTiers(cls);
    setSelectedTiers(initialTiers);
    setInstructorId(cls.instructorId);
    setInstructorName(cls.instructorName);
    
    const validStart = toValidDate(cls.startTime);
    const validEnd = toValidDate(cls.endTime);
    setDate(validStart ? format(validStart, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
    setStartTime(validStart ? format(validStart, 'HH:mm') : '10:00');
    setEndTime(validEnd ? format(validEnd, 'HH:mm') : '11:00');
    
    setCapacity(cls.capacity);
    setPrice(cls.price);
    setBranch(cls.branch || branches?.[0] || 'Maxim Compound');
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openRosterDialog = (cls: ClassSchedule) => {
    setRosterClass(cls);
    setRosterSearch('');
    setIsAddMemberOpen(false);
    setSelectedMemberToAdd('');
    setIsRosterOpen(true);
  };

  const handleTierToggle = (tierId: CanonicalTier) => {
    setSelectedTiers(prev => 
      prev.includes(tierId) 
        ? prev.filter(t => t !== tierId)
        : [...prev, tierId]
    );
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Class name is required.");
      return;
    }

    if (selectedTiers.length === 0) {
      setFormError("Please select at least one eligible membership tier.");
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const startIso = `${date}T${startTime}:00`;
      const endIso = `${date}T${endTime}:00`;
      const tiersToSave = Array.from(new Set(selectedTiers));

      if (editingClass) {
        await updateClass(editingClass.id, {
          name: name.trim(),
          category,
          allowed_tiers: tiersToSave,
          allowedTiers: tiersToSave,
          instructorId,
          instructorName,
          capacity: Number(capacity) || 15,
          price: Number(price) || 0,
          startTime: startIso,
          endTime: endIso,
          branch,
          updatedAt: new Date().toISOString()
        });
      } else {
        const weeksToCreate = repeatWeekly ? Math.max(1, repeatWeeks) : 1;
        const baseDate = new Date(date);

        for (let i = 0; i < weeksToCreate; i++) {
          const classDate = addWeeks(baseDate, i);
          const dateString = format(classDate, 'yyyy-MM-dd');
          const sIso = `${dateString}T${startTime}:00`;
          const eIso = `${dateString}T${endTime}:00`;

          await addClass({
            name: name.trim(),
            category,
            allowed_tiers: tiersToSave,
            allowedTiers: tiersToSave,
            instructorId,
            instructorName,
            capacity: Number(capacity) || 15,
            price: Number(price) || 0,
            startTime: sIso,
            endTime: eIso,
            status: 'active',
            branch,
            attendees: [],
            waitlist: [],
            checkedIn: [],
            noShows: []
          });
        }
      }

      setIsDialogOpen(false);
    } catch (err: any) {
      console.error("Failed to save class:", err);
      setFormError(err?.message || "Failed to save class. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string, className: string) => {
    setCancelClassId(id);
    setCancelClassName(className);
    setCancelReason('');
    setIsCancelDialogOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelClassId) return;
    try {
      await deleteClass(cancelClassId);
      setIsCancelDialogOpen(false);
      setCancelClassId('');
    } catch (err) {
      console.error("Error cancelling class:", err);
    }
  };

  // =========================================================================
  // ROSTER ACTIONS (Check-In, No-Show, Cancel/Refund, Add Member)
  // =========================================================================
  const handleToggleCheckIn = async (attendeeId: string) => {
    if (!rosterClass) return;
    setActionLoadingId(attendeeId);
    try {
      const isCurrentlyCheckedIn = rosterClass.checkedIn?.includes(attendeeId);
      const classRef = doc(db, 'classSchedules', rosterClass.id);

      if (isCurrentlyCheckedIn) {
        await updateDoc(classRef, {
          checkedIn: arrayRemove(attendeeId)
        });
      } else {
        await updateDoc(classRef, {
          checkedIn: arrayUnion(attendeeId),
          noShows: arrayRemove(attendeeId)
        });
      }

      // Sync booking doc if exists
      const bookingDocRef = doc(db, 'classBookings', `${rosterClass.id}_${attendeeId}`);
      await updateDoc(bookingDocRef, {
        status: isCurrentlyCheckedIn ? 'booked' : 'attended',
        checkedInAt: isCurrentlyCheckedIn ? null : new Date().toISOString()
      }).catch(() => {});
    } catch (err) {
      console.error("Error toggling check-in:", err);
      alert("Failed to update check-in status.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleToggleNoShow = async (attendeeId: string) => {
    if (!rosterClass) return;
    setActionLoadingId(attendeeId);
    try {
      const isCurrentlyNoShow = rosterClass.noShows?.includes(attendeeId);
      const classRef = doc(db, 'classSchedules', rosterClass.id);

      if (isCurrentlyNoShow) {
        await updateDoc(classRef, {
          noShows: arrayRemove(attendeeId)
        });
      } else {
        await updateDoc(classRef, {
          noShows: arrayUnion(attendeeId),
          checkedIn: arrayRemove(attendeeId)
        });
      }

      // Sync booking doc if exists
      const bookingDocRef = doc(db, 'classBookings', `${rosterClass.id}_${attendeeId}`);
      await updateDoc(bookingDocRef, {
        status: isCurrentlyNoShow ? 'booked' : 'no-show'
      }).catch(() => {});
    } catch (err) {
      console.error("Error toggling no-show:", err);
      alert("Failed to update no-show status.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveAttendeeFromClass = async (attendeeId: string) => {
    if (!rosterClass) return;
    const client = clients.find(c => c.id === attendeeId || c.memberId === attendeeId);
    const clientName = client?.name || attendeeId;

    if (!window.confirm(`Are you sure you want to remove ${clientName} from this class? Their session credit will be refunded.`)) {
      return;
    }

    setActionLoadingId(attendeeId);
    try {
      // Call backend /api/classes/book with action 'leave'
      const token = await auth.currentUser?.getIdToken();
      let resOk = false;
      try {
        const res = await fetch('/api/classes/book', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            classId: rosterClass.id,
            action: 'leave',
            clientId: attendeeId
          })
        });
        if (res.ok) resOk = true;
      } catch (e) {
        console.warn("Backend call failed, using direct Firestore fallback", e);
      }

      if (!resOk) {
        const classRef = doc(db, 'classSchedules', rosterClass.id);
        await updateDoc(classRef, {
          attendees: arrayRemove(attendeeId),
          checkedIn: arrayRemove(attendeeId),
          noShows: arrayRemove(attendeeId)
        });

        // Update booking doc
        const bookingDocRef = doc(db, 'classBookings', `${rosterClass.id}_${attendeeId}`);
        await updateDoc(bookingDocRef, {
          status: 'cancelled',
          cancelledAt: new Date().toISOString()
        }).catch(() => {});
      }
    } catch (err) {
      console.error("Error removing attendee:", err);
      alert("Failed to remove attendee.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handlePromoteWaitlist = async (waitlistId: string) => {
    if (!rosterClass) return;
    setActionLoadingId(waitlistId);
    try {
      const classRef = doc(db, 'classSchedules', rosterClass.id);
      await updateDoc(classRef, {
        waitlist: arrayRemove(waitlistId),
        attendees: arrayUnion(waitlistId)
      });

      const bookingDocRef = doc(db, 'classBookings', `${rosterClass.id}_${waitlistId}`);
      await updateDoc(bookingDocRef, {
        status: 'booked',
        promotedAt: new Date().toISOString()
      }).catch(() => {});
    } catch (err) {
      console.error("Error promoting waitlist member:", err);
      alert("Failed to promote member.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleManualAddMember = async () => {
    if (!rosterClass || !selectedMemberToAdd) return;
    setActionLoadingId('manual-add');

    try {
      const token = await auth.currentUser?.getIdToken();
      let resOk = false;
      let errorMsg = '';

      try {
        const res = await fetch('/api/classes/book', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            classId: rosterClass.id,
            action: 'join',
            clientId: selectedMemberToAdd
          })
        });
        const data = await res.json();
        if (res.ok) {
          resOk = true;
        } else {
          errorMsg = data.error || 'Failed to book member';
        }
      } catch (e) {
        console.warn("Backend call failed, using direct Firestore fallback", e);
      }

      if (!resOk && errorMsg) {
        alert(errorMsg);
        return;
      }

      if (!resOk) {
        // Fallback: direct union
        const classRef = doc(db, 'classSchedules', rosterClass.id);
        await updateDoc(classRef, {
          attendees: arrayUnion(selectedMemberToAdd)
        });
      }

      setIsAddMemberOpen(false);
      setSelectedMemberToAdd('');
    } catch (err: any) {
      console.error("Error adding member to class:", err);
      alert(err?.message || "Failed to add member.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // =========================================================================
  // SORTING & FILTERING
  // =========================================================================
  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) => {
      const timeA = new Date(a.startTime || (a.date ? `${a.date}T00:00:00` : 0)).getTime();
      const timeB = new Date(b.startTime || (b.date ? `${b.date}T00:00:00` : 0)).getTime();
      return timeA - timeB;
    });
  }, [classes]);

  const filteredClasses = useMemo(() => {
    return sortedClasses.filter(cls => {
      // 1. Search filter
      const matchesSearch = 
        cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (cls.instructorName && cls.instructorName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (cls.branch && cls.branch.toLowerCase().includes(searchTerm.toLowerCase()));
      if (!matchesSearch) return false;

      // 2. Category filter
      if (selectedCategory !== 'all' && cls.category !== selectedCategory) {
        return false;
      }

      // 3. Branch filter
      if (selectedBranch !== 'all' && cls.branch && cls.branch !== selectedBranch) {
        return false;
      }

      // 4. Date filter
      if (selectedDateFilter !== 'all') {
        const dateStr = cls.date || (cls.startTime ? cls.startTime.substring(0, 10) : '');
        if (dateStr) {
          try {
            const parsed = parseISO(dateStr);
            if (selectedDateFilter === 'today' && !isToday(parsed)) return false;
            if (selectedDateFilter === 'tomorrow' && !isTomorrow(parsed)) return false;
            if (selectedDateFilter === 'week' && !isThisWeek(parsed, { weekStartsOn: 0 })) return false;
            if (selectedDateFilter === 'upcoming') {
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (dateStr < todayStr) return false;
            }
            if (selectedDateFilter === 'past') {
              const todayStr = format(new Date(), 'yyyy-MM-dd');
              if (dateStr >= todayStr) return false;
            }
          } catch {
            // Keep if date parsing fails
          }
        }
      }

      return true;
    });
  }, [sortedClasses, searchTerm, selectedCategory, selectedBranch, selectedDateFilter]);

  // Today's classes count
  const todayClassesCount = useMemo(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return classes.filter(c => {
      const d = c.date || (c.startTime ? c.startTime.substring(0, 10) : '');
      return d === todayStr;
    }).length;
  }, [classes]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-foreground uppercase flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Class Schedule Manager
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage studio classes, weekly recurring slots, coach assignments, eligible membership tiers, and live attendee rosters.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreateDialog} className="gap-1.5 shadow-sm text-xs font-bold h-9">
            <Plus className="h-4 w-4" /> Schedule New Class
          </Button>
        </div>
      </div>

      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="classes" className="gap-2 text-xs font-bold">
            <Calendar className="h-4 w-4" /> Class Schedule ({classes.length})
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 text-xs font-bold">
            <Flame className="h-4 w-4" /> Analytics & Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Today's Classes</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-foreground">{todayClassesCount}</span>
                  <Badge variant="outline" className="text-[10px] text-primary border-primary/30">Today</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Total Classes Seeded</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-foreground">{classes.length}</span>
                  <Badge variant="secondary" className="text-[10px]">Active</Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Active Attendees</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-emerald-500">
                    {classes.reduce((acc, c) => acc + (c.attendees?.length || 0), 0)}
                  </span>
                  <Users className="h-4 w-4 text-emerald-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/50 border shadow-xs">
              <CardContent className="p-3.5">
                <p className="text-[11px] font-bold text-muted-foreground uppercase">Waitlisted Members</p>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-xl font-black text-amber-500">
                    {classes.reduce((acc, c) => acc + (c.waitlist?.length || 0), 0)}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">Waitlist</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="border bg-card/40 shadow-xs">
            <CardContent className="p-3.5 flex flex-wrap gap-3 items-center justify-between">
              {/* Search */}
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search class, instructor, branch..."
                  className="pl-9 h-9 text-xs bg-background"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              {/* Multi-Filters */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Date Filter */}
                <Select value={selectedDateFilter} onValueChange={(val: any) => setSelectedDateFilter(val)}>
                  <SelectTrigger className="h-9 text-xs w-[130px] bg-background">
                    <SelectValue placeholder="All Dates" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Dates</SelectItem>
                    <SelectItem value="today">Today ({todayClassesCount})</SelectItem>
                    <SelectItem value="tomorrow">Tomorrow</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="past">Past Classes</SelectItem>
                  </SelectContent>
                </Select>

                {/* Category Filter */}
                <Select value={selectedCategory} onValueChange={(val) => { if (val) setSelectedCategory(val); }}>
                  <SelectTrigger className="h-9 text-xs w-[140px] bg-background">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {dynamicCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Branch Filter */}
                {branches && branches.length > 0 && (
                  <Select value={selectedBranch} onValueChange={(val) => { if (val) setSelectedBranch(val); }}>
                    <SelectTrigger className="h-9 text-xs w-[140px] bg-background">
                      <SelectValue placeholder="All Branches" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Table of Classes */}
          <Card className="border bg-card/40">
            <CardContent className="p-0">
              <div className="relative w-full overflow-x-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b bg-muted/30">
                    <tr className="border-b">
                      <th className="h-10 px-4 text-left align-middle font-bold text-xs uppercase text-muted-foreground">Class & Category</th>
                      <th className="h-10 px-4 text-left align-middle font-bold text-xs uppercase text-muted-foreground">Instructor</th>
                      <th className="h-10 px-4 text-left align-middle font-bold text-xs uppercase text-muted-foreground">Date & Time</th>
                      <th className="h-10 px-4 text-left align-middle font-bold text-xs uppercase text-muted-foreground">Branch</th>
                      <th className="h-10 px-4 text-center align-middle font-bold text-xs uppercase text-muted-foreground">Roster / Capacity</th>
                      <th className="h-10 px-4 text-center align-middle font-bold text-xs uppercase text-muted-foreground">Pricing</th>
                      <th className="h-10 px-4 text-right align-middle font-bold text-xs uppercase text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0 divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground text-xs">
                          <div className="flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />
                            Loading studio classes...
                          </div>
                        </td>
                      </tr>
                    ) : filteredClasses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-muted-foreground text-xs italic">
                          No classes match the selected filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredClasses.map(cls => {
                        const attendeesCount = cls.attendees?.length || 0;
                        const waitlistCount = cls.waitlist?.length || 0;
                        const checkedInCount = cls.checkedIn?.length || 0;
                        const isFull = attendeesCount >= cls.capacity;

                        return (
                          <tr key={cls.id} className="transition-colors hover:bg-muted/40">
                            {/* Class name & Tiers */}
                            <td className="p-4 align-middle">
                              <p className="font-extrabold text-xs text-foreground uppercase">{cls.name}</p>
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {cls.category && (
                                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-bold border-primary/30 text-primary">
                                    {cls.category}
                                  </Badge>
                                )}
                                {(cls.allowed_tiers && cls.allowed_tiers.length > 0 ? cls.allowed_tiers : getSessionAllowedTiers(cls)).map(t => (
                                  <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium bg-muted text-muted-foreground">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </td>

                            {/* Instructor */}
                            <td className="p-4 align-middle text-xs font-semibold text-foreground">
                              {cls.instructorName || 'Coach'}
                            </td>

                            {/* Date & Time */}
                            <td className="p-4 align-middle text-xs text-muted-foreground">
                              <div className="flex flex-col">
                                <span className="font-bold text-foreground">
                                  {safeFormatDate(cls.startTime, 'EEE, MMM d, yyyy')}
                                </span>
                                <span className="text-[11px] flex items-center gap-1 mt-0.5">
                                  <Clock className="h-3 w-3" />
                                  {safeFormatTime(cls.startTime, 'HH:mm', '10:00')} - {safeFormatTime(cls.endTime, 'HH:mm', '11:00')}
                                </span>
                              </div>
                            </td>

                            {/* Branch */}
                            <td className="p-4 align-middle text-xs font-medium text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                <span>{cls.branch || 'Main Studio'}</span>
                              </div>
                            </td>

                            {/* Roster / Capacity */}
                            <td className="p-4 align-middle text-center">
                              <button
                                type="button"
                                onClick={() => openRosterDialog(cls)}
                                className="group inline-flex flex-col items-center cursor-pointer p-1 rounded-lg hover:bg-muted/60 transition-all"
                                title="Click to view attendee roster"
                              >
                                <Badge 
                                  variant={isFull ? 'destructive' : 'secondary'} 
                                  className={`text-[11px] font-bold px-2 py-0.5 group-hover:ring-2 group-hover:ring-primary/40 transition-all ${
                                    attendeesCount > 0 && !isFull ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : ''
                                  }`}
                                >
                                  <Users className="h-3 w-3 mr-1 inline" />
                                  {attendeesCount} / {cls.capacity}
                                </Badge>

                                {checkedInCount > 0 && (
                                  <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                                    {checkedInCount} checked-in
                                  </span>
                                )}

                                {waitlistCount > 0 && (
                                  <span className="text-[10px] text-amber-600 font-semibold mt-0.5">
                                    +{waitlistCount} waitlisted
                                  </span>
                                )}
                              </button>
                            </td>

                            {/* Pricing */}
                            <td className="p-4 align-middle text-center text-xs font-semibold">
                              {cls.price === 0 ? (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px]">
                                  Free
                                </Badge>
                              ) : (
                                <span>{cls.price} EGP</span>
                              )}
                            </td>

                            {/* Actions */}
                            <td className="p-4 align-middle text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-8 px-2.5 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/10"
                                  onClick={() => openRosterDialog(cls)}
                                  title="View Attendee Roster"
                                >
                                  <Users className="h-3.5 w-3.5" />
                                  <span>Roster</span>
                                  {attendeesCount > 0 && (
                                    <span className="ml-1 px-1.5 py-0 text-[10px] bg-primary text-primary-foreground rounded-full">
                                      {attendeesCount}
                                    </span>
                                  )}
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => openEditDialog(cls)}
                                  title="Edit Class Schedule"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                                  onClick={() => handleDelete(cls.id, cls.name)}
                                  title="Delete Class"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics">
          <ClassAnalytics />
        </TabsContent>
      </Tabs>

      {/* ─── ATTENDEE ROSTER DIALOG ─── */}
      <Dialog open={isRosterOpen} onOpenChange={setIsRosterOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
          <DialogHeader className="border-b pb-3">
            <div className="flex items-start justify-between">
              <div>
                <DialogTitle className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" /> Class Attendee Roster
                </DialogTitle>
                {rosterClass && (
                  <DialogDescription className="text-xs mt-1">
                    <strong>{rosterClass.name}</strong> • {safeFormatDate(rosterClass.startTime, 'EEE, MMM d, yyyy')} ({safeFormatTime(rosterClass.startTime, 'HH:mm', '10:00')} - {safeFormatTime(rosterClass.endTime, 'HH:mm', '11:00')}) • {rosterClass.branch || 'Main Studio'}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>

          {rosterClass && (
            <div className="space-y-4 py-2">
              {/* Capacity Stats & Add Member Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border border-border/50 text-xs">
                <div className="flex items-center gap-4 font-semibold">
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] block">Enrolled</span>
                    <span className="text-sm font-black text-foreground">
                      {rosterClass.attendees?.length || 0} / {rosterClass.capacity}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] block">Checked In</span>
                    <span className="text-sm font-black text-emerald-500">
                      {rosterClass.checkedIn?.length || 0}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground uppercase text-[10px] block">Waitlist</span>
                    <span className="text-sm font-black text-amber-500">
                      {rosterClass.waitlist?.length || 0}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsAddMemberOpen(!isAddMemberOpen)}
                  className="h-8 text-xs font-bold gap-1 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Add Member
                </Button>
              </div>

              {/* Inline Add Member Picker */}
              {isAddMemberOpen && (
                <div className="p-3 bg-primary/5 rounded-xl border border-primary/20 space-y-2 animate-in fade-in-50 duration-200">
                  <Label className="text-xs font-bold uppercase text-primary">Manually Add Member to Class</Label>
                  <div className="flex gap-2">
                    <Select value={selectedMemberToAdd} onValueChange={(val) => { if (val) setSelectedMemberToAdd(val); }}>
                      <SelectTrigger className="h-9 text-xs bg-background flex-1">
                        <SelectValue placeholder="Select member from database..." />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.memberId ? `(#${c.memberId})` : ''} — {c.phone}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      disabled={!selectedMemberToAdd || actionLoadingId === 'manual-add'}
                      onClick={handleManualAddMember}
                      className="h-9 text-xs font-bold"
                    >
                      {actionLoadingId === 'manual-add' ? 'Adding...' : 'Enroll'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Search Inside Roster */}
              {(rosterClass.attendees?.length || 0) > 4 && (
                <div className="relative w-full">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search enrolled members..."
                    className="pl-8 h-8 text-xs bg-background"
                    value={rosterSearch}
                    onChange={e => setRosterSearch(e.target.value)}
                  />
                </div>
              )}

              {/* Attendees List */}
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                  Enrolled Attendees ({rosterClass.attendees?.length || 0})
                </p>

                {!rosterClass.attendees || rosterClass.attendees.length === 0 ? (
                  <div className="p-8 text-center border border-dashed rounded-xl text-xs text-muted-foreground italic">
                    No members enrolled in this class yet.
                  </div>
                ) : (
                  <div className="divide-y border rounded-xl overflow-hidden bg-card">
                    {rosterClass.attendees
                      .filter(attendeeId => {
                        if (!rosterSearch.trim()) return true;
                        const client = clients.find(c => c.id === attendeeId || c.memberId === attendeeId);
                        const q = rosterSearch.toLowerCase();
                        return (client?.name || '').toLowerCase().includes(q) ||
                               (client?.phone || '').includes(q) ||
                               (client?.memberId || '').toLowerCase().includes(q);
                      })
                      .map(attendeeId => {
                        const client = clients.find(c => c.id === attendeeId || c.memberId === attendeeId);
                        const isCheckedIn = rosterClass.checkedIn?.includes(attendeeId);
                        const isNoShow = rosterClass.noShows?.includes(attendeeId);
                        const isBusy = actionLoadingId === attendeeId;

                        return (
                          <div key={attendeeId} className="p-3 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                            {/* Member Details */}
                            <div className="flex items-center gap-3">
                              <div className="h-8 w-8 rounded-full bg-primary/10 text-primary font-black text-xs flex items-center justify-center shrink-0">
                                {(client?.name || 'M').substring(0, 1).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-bold text-xs text-foreground flex items-center gap-1.5">
                                  {client?.name || 'Unknown Client'}
                                  {client?.memberId && (
                                    <span className="text-[10px] font-mono text-muted-foreground font-medium">
                                      #{client.memberId}
                                    </span>
                                  )}
                                </p>
                                {client?.phone && (
                                  <a href={`tel:${client.phone}`} className="text-[11px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                                    <Phone className="h-3 w-3" /> {client.phone}
                                  </a>
                                )}
                              </div>
                            </div>

                            {/* Status and Action Buttons */}
                            <div className="flex items-center gap-2">
                              {isCheckedIn ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 text-[10px] font-bold">
                                  <CheckCircle2 className="h-3 w-3 mr-1 inline" /> Checked In
                                </Badge>
                              ) : isNoShow ? (
                                <Badge className="bg-rose-500/10 text-rose-600 border border-rose-500/20 text-[10px] font-bold">
                                  <UserX className="h-3 w-3 mr-1 inline" /> No-Show
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px] font-bold">
                                  Booked
                                </Badge>
                              )}

                              <Button
                                size="sm"
                                variant={isCheckedIn ? 'secondary' : 'outline'}
                                disabled={isBusy}
                                onClick={() => handleToggleCheckIn(attendeeId)}
                                className="h-7 px-2 text-[11px] font-bold border-emerald-500/30 text-emerald-600 hover:bg-emerald-600 hover:text-white"
                                title={isCheckedIn ? "Undo Check-In" : "Check in member"}
                              >
                                {isCheckedIn ? "Undo" : "Check-in"}
                              </Button>

                              <Button
                                size="sm"
                                variant={isNoShow ? 'secondary' : 'outline'}
                                disabled={isBusy}
                                onClick={() => handleToggleNoShow(attendeeId)}
                                className="h-7 px-2 text-[11px] font-bold border-amber-500/30 text-amber-600 hover:bg-amber-600 hover:text-white"
                                title={isNoShow ? "Undo No-Show" : "Mark as No-Show"}
                              >
                                No-Show
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isBusy}
                                onClick={() => handleRemoveAttendeeFromClass(attendeeId)}
                                className="h-7 w-7 p-0 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                                title="Remove from class & refund session"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Waitlist Section (if any) */}
              {rosterClass.waitlist && rosterClass.waitlist.length > 0 && (
                <div className="space-y-2 pt-2 border-t">
                  <p className="text-xs font-bold uppercase text-amber-600 tracking-wider">
                    Waitlist ({rosterClass.waitlist.length})
                  </p>
                  <div className="divide-y border rounded-xl overflow-hidden bg-card">
                    {rosterClass.waitlist.map((waitlistId, idx) => {
                      const client = clients.find(c => c.id === waitlistId || c.memberId === waitlistId);
                      const isBusy = actionLoadingId === waitlistId;

                      return (
                        <div key={waitlistId} className="p-3 flex items-center justify-between gap-2 hover:bg-muted/30">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono font-bold text-amber-600">#{idx + 1}</span>
                            <div>
                              <p className="font-bold text-xs text-foreground">{client?.name || 'Waitlisted Member'}</p>
                              {client?.phone && <p className="text-[11px] text-muted-foreground">{client.phone}</p>}
                            </div>
                          </div>

                          <Button
                            size="sm"
                            disabled={isBusy}
                            onClick={() => handlePromoteWaitlist(waitlistId)}
                            className="h-7 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white"
                          >
                            Promote to Class
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setIsRosterOpen(false)}>
              Close Roster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Class Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase tracking-tight">
              {editingClass ? 'Edit Class Schedule' : 'Create New Class Schedule'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure class details, assigned coach, timing, eligible membership tiers, and capacity limit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveClass} className="space-y-4 py-2">
            {formError && (
              <div className="p-3 text-xs bg-red-500/10 border border-red-500/20 text-red-600 rounded-lg flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Class Name</Label>
              <Input
                placeholder="e.g. Adult Boxing & Conditioning, Kids Boxing, HIIT"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Category / Program</Label>
                <Select value={category} onValueChange={(val) => { if (val) setCategory(val); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {dynamicCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Coach / Instructor</Label>
                <Select
                  value={instructorId}
                  onValueChange={(val) => {
                    if (!val) return;
                    const c = coaches.find(item => item.id === val);
                    setInstructorId(val);
                    setInstructorName(c?.name || '');
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Allowed Tiers */}
            <div className="space-y-2 p-3 bg-muted/20 border border-border/50 rounded-xl">
              <Label className="text-xs font-bold uppercase text-muted-foreground">Eligible Membership Tiers</Label>
              <p className="text-[11px] text-muted-foreground">
                Only members holding packages matching these tiers will be able to book this class.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {TIER_OPTIONS.map(opt => (
                  <div key={opt.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`tier-${opt.id}`}
                      checked={selectedTiers.includes(opt.id)}
                      onCheckedChange={() => handleTierToggle(opt.id)}
                    />
                    <Label htmlFor={`tier-${opt.id}`} className="text-xs cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">End Time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  required
                  className="h-9 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Capacity (Spots)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={capacity}
                  onChange={e => setCapacity(Number(e.target.value))}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Price (0 = Free)</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Branch / Studio</Label>
                {branches && branches.length > 0 ? (
                  <Select value={branch} onValueChange={(val) => { if (val) setBranch(val); }}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b} value={b}>{b}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="e.g. Maxim Compound"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    className="h-9 text-xs"
                  />
                )}
              </div>
            </div>

            {!editingClass && (
              <div className="p-3 bg-muted/20 border border-border/50 rounded-xl space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="repeatWeekly"
                    checked={repeatWeekly}
                    onCheckedChange={(checked) => setRepeatWeekly(!!checked)}
                  />
                  <Label htmlFor="repeatWeekly" className="text-xs font-medium cursor-pointer">
                    Repeat weekly for consecutive weeks
                  </Label>
                </div>
                {repeatWeekly && (
                  <div className="flex items-center gap-2 pl-6 pt-1">
                    <Label className="text-xs text-muted-foreground">Duration:</Label>
                    <Input
                      type="number"
                      min={2}
                      max={12}
                      className="h-8 w-20 text-xs"
                      value={repeatWeeks}
                      onChange={e => setRepeatWeeks(Number(e.target.value))}
                    />
                    <span className="text-xs text-muted-foreground">weeks</span>
                  </div>
                )}
              </div>
            )}

            <DialogFooter className="pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSaving} className="font-bold">
                {isSaving ? "Saving..." : editingClass ? "Save Changes" : "Create Schedule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-black uppercase text-rose-500">Cancel / Remove Class</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to remove <strong>{cancelClassName}</strong>? This will cancel bookings and notify enrolled members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-bold uppercase text-muted-foreground">Cancellation Reason (Optional)</Label>
            <Input
              placeholder="e.g. Coach sick leave, maintenance"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCancelDialogOpen(false)}>
              Keep Class
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmCancel} className="font-bold">
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassManager;
