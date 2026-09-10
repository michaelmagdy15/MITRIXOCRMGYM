import React, { useState, useEffect } from 'react';
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
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { User } from '../types';
import { ClassSchedule } from '../types/class';
import { Calendar, Search, Filter, Plus, Trash2, Users, Flame, Clock, ChevronLeft, ChevronRight, MapPin, CheckCircle2, Edit, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { format, addWeeks } from 'date-fns';
import { safeFormatDate, safeFormatTime, toValidDate } from '../utils/dateUtils';
import { getSessionAllowedTiers, toCanonicalTier, CanonicalTier } from '../utils/memberCategories';

export const TIER_OPTIONS: { id: CanonicalTier; label: string }[] = [
  { id: 'KIDS', label: 'Kids Standard' },
  { id: 'KIDS_PRO', label: 'Kids Pro' },
  { id: 'JUNIORS', label: 'Juniors Standard' },
  { id: 'JUNIORS_PRO', label: 'Juniors Pro' },
  { id: 'ADULT', label: 'Adults' }
];

const CATEGORIES = [
  'HIIT',
  'Strength & Conditioning',
  'Boxing',
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
  const [coaches, setCoaches] = useState<User[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassSchedule | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Form fields
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Boxing');
  const [selectedTiers, setSelectedTiers] = useState<CanonicalTier[]>(['ADULT']);
  const [instructorId, setInstructorId] = useState('');
  const [instructorName, setInstructorName] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [capacity, setCapacity] = useState(15);
  const [price, setPrice] = useState(0);
  const [branch, setBranch] = useState(branches?.[0] || 'Main Studio');
  const [repeatWeekly, setRepeatWeekly] = useState(false);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  
  // Cancel/Delete Dialog State
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [cancelClassId, setCancelClassId] = useState('');
  const [cancelClassName, setCancelClassName] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

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

  const openCreateDialog = () => {
    setEditingClass(null);
    setName('');
    setCategory('Boxing');
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
    setBranch(branches?.[0] || 'Main Studio');
    setRepeatWeekly(false);
    setRepeatWeeks(4);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (cls: ClassSchedule) => {
    setEditingClass(cls);
    setName(cls.name);
    setCategory(cls.category || 'Boxing');
    const initialTiers = (cls.allowed_tiers && cls.allowed_tiers.length > 0)
      ? cls.allowed_tiers
      : (cls.allowedTiers && cls.allowedTiers.length > 0)
      ? cls.allowedTiers
      : getSessionAllowedTiers(cls);
    setSelectedTiers(initialTiers as CanonicalTier[]);
    setInstructorId(cls.instructorId || '');
    setInstructorName(cls.instructorName || '');
    const dateStr = cls.startTime ? cls.startTime.substring(0, 10) : format(new Date(), 'yyyy-MM-dd');
    const startStr = cls.startTime ? cls.startTime.substring(11, 16) : '10:00';
    const endStr = cls.endTime ? cls.endTime.substring(11, 16) : '11:00';
    setDate(dateStr);
    setStartTime(startStr);
    setEndTime(endStr);
    setCapacity(cls.capacity || 15);
    setPrice(cls.price || 0);
    setBranch(cls.branch || branches?.[0] || 'Main Studio');
    setRepeatWeekly(false);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleInstructorChange = (coachId: string | null) => {
    if (!coachId) return;
    setInstructorId(coachId);
    const selected = coaches.find(c => c.id === coachId);
    if (selected) {
      setInstructorName(selected.name);
    }
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Class Name is required.");
      return;
    }
    if (!instructorId) {
      setFormError("Please select an Instructor.");
      return;
    }
    if (!date || !startTime || !endTime) {
      setFormError("Date, Start Time, and End Time are required.");
      return;
    }

    const tiersToSave = selectedTiers.length > 0 ? selectedTiers : (['ADULT'] as CanonicalTier[]);

    setIsSaving(true);
    try {
      if (editingClass) {
        // Update existing class
        const startIso = `${date}T${startTime}:00`;
        const endIso = `${date}T${endTime}:00`;
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
        // Create new class (or recurring batch)
        const numWeeks = repeatWeekly ? Math.max(1, Number(repeatWeeks)) : 1;
        const baseDate = toValidDate(date) || new Date();

        for (let i = 0; i < numWeeks; i++) {
          const currentWeekDate = addWeeks(baseDate, i);
          const dateStr = safeFormatDate(currentWeekDate, 'yyyy-MM-dd');
          const startIso = `${dateStr}T${startTime}:00`;
          const endIso = `${dateStr}T${endTime}:00`;

          await addClass({
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

  const filteredClasses = classes.filter(cls => {
    const matchesSearch = cls.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (cls.instructorName && cls.instructorName.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || cls.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Class Schedule Manager</h2>
          <p className="text-sm text-muted-foreground">
            Manage whitelabeled studio classes, weekly recurring slots, coach assignments, and eligible membership tiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={openCreateDialog} className="gap-1.5 shadow-sm">
            <Plus className="h-4 w-4" /> Schedule New Class
          </Button>
        </div>
      </div>

      <Tabs defaultValue="classes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="classes" className="gap-2">
            <Calendar className="h-4 w-4" /> Class Schedule
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <Flame className="h-4 w-4" /> Analytics & Payroll
          </TabsTrigger>
        </TabsList>

        <TabsContent value="classes" className="space-y-4">
          {/* Filter Bar */}
          <Card className="border shadow-sm">
            <CardContent className="p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search class or instructor..."
                  className="pl-9 h-9 text-xs"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={selectedCategory} onValueChange={(val) => { if (val) setSelectedCategory(val); }}>
                  <SelectTrigger className="h-9 text-xs w-[160px]">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table of Classes */}
          <Card className="border shadow-sm">
            <CardContent className="p-0">
              <div className="relative w-full overflow-auto">
                <table className="w-full caption-bottom text-sm">
                  <thead className="[&_tr]:border-b bg-muted/30">
                    <tr className="border-b">
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Class & Eligible Tiers</th>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Instructor</th>
                      <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground">Date & Time</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Capacity</th>
                      <th className="h-10 px-4 text-center align-middle font-medium text-muted-foreground">Pricing</th>
                      <th className="h-10 px-4 text-right align-middle font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0 divide-y">
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">Loading classes...</td>
                      </tr>
                    ) : filteredClasses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-muted-foreground">
                          No classes match your filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredClasses.map(cls => {
                        const attendeesCount = cls.attendees?.length || 0;
                        const waitlistCount = cls.waitlist?.length || 0;
                        const isFull = attendeesCount >= cls.capacity;

                        return (
                          <tr key={cls.id} className="transition-colors hover:bg-muted/40">
                            <td className="p-4 align-middle">
                              <p className="font-semibold text-foreground">{cls.name}</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(cls.allowed_tiers && cls.allowed_tiers.length > 0 ? cls.allowed_tiers : getSessionAllowedTiers(cls)).map(t => (
                                  <Badge key={t} variant="secondary" className="text-[9px] px-1.5 py-0 h-4 font-medium bg-primary/10 text-primary border-primary/20">
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="p-4 align-middle text-sm font-medium">
                              {cls.instructorName}
                            </td>
                            <td className="p-4 align-middle text-sm text-muted-foreground">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">
                                  {safeFormatDate(cls.startTime, 'EEE, MMM d, yyyy')}
                                </span>
                                <span className="text-xs">
                                  {safeFormatTime(cls.startTime, 'HH:mm', '10:00')} - {safeFormatTime(cls.endTime, 'HH:mm', '11:00')}
                                </span>
                              </div>
                            </td>
                            <td className="p-4 align-middle text-center">
                              <Badge variant={isFull ? 'destructive' : 'secondary'} className="text-xs">
                                {attendeesCount} / {cls.capacity}
                              </Badge>
                              {waitlistCount > 0 && (
                                <span className="block text-[10px] text-amber-600 font-semibold mt-0.5">
                                  +{waitlistCount} waitlisted
                                </span>
                              )}
                            </td>
                            <td className="p-4 align-middle text-center text-sm font-semibold">
                              {cls.price === 0 ? (
                                <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">
                                  Free
                                </Badge>
                              ) : (
                                <span>{cls.price} EGP</span>
                              )}
                            </td>
                            <td className="p-4 align-middle text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0"
                                  onClick={() => openEditDialog(cls)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700"
                                  onClick={() => handleDelete(cls.id, cls.name)}
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

      {/* Create / Edit Class Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClass ? 'Edit Class Schedule' : 'Create New Class Schedule'}</DialogTitle>
            <DialogDescription>
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
              <Label className="text-xs font-semibold">Class Name</Label>
              <Input
                placeholder="e.g. Boxing Basics, Kids / Pro Boxing, HIIT"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>

            {/* Eligible Member Tiers Multi-Select Checkboxes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Eligible Member Tiers (Commercial Product Mapping)</Label>
                <span className="text-[11px] text-muted-foreground">{selectedTiers.length} selected</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-muted/30 rounded-lg border border-border/50">
                {TIER_OPTIONS.map(opt => {
                  const isChecked = selectedTiers.includes(opt.id);
                  return (
                    <label
                      key={opt.id}
                      className={`flex items-center gap-2 text-xs p-2 rounded-md cursor-pointer transition-colors border ${
                        isChecked
                          ? 'bg-primary/10 border-primary/40 text-foreground font-medium'
                          : 'bg-background border-border/40 text-muted-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedTiers(prev => Array.from(new Set([...prev, opt.id])));
                          } else {
                            setSelectedTiers(prev => prev.filter(t => t !== opt.id));
                          }
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
              {selectedTiers.length === 0 && (
                <p className="text-[11px] text-amber-500 font-medium">Please select at least one eligible tier.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={category} onValueChange={(val) => { if (val) setCategory(val); }}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Instructor</Label>
                <Select value={instructorId} onValueChange={handleInstructorChange}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select coach" />
                  </SelectTrigger>
                  <SelectContent>
                    {coaches.map(coach => (
                      <SelectItem key={coach.id} value={coach.id}>{coach.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Start Time</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">End Time</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Capacity (Spots)</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={capacity}
                  onChange={e => setCapacity(Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Price (0 = Free)</Label>
                <Input
                  type="number"
                  min={0}
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Branch / Studio</Label>
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
                    placeholder="e.g. Main Studio, Maxim"
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                  />
                )}
              </div>
            </div>

            {!editingClass && (
              <div className="p-3 bg-muted/20 border border-border/50 rounded-lg space-y-2">
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

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSaving}>
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
            <DialogTitle>Cancel / Remove Class</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove <strong>{cancelClassName}</strong>? This action will notify enrolled members.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-xs font-medium">Cancellation Reason (Optional)</Label>
            <Input
              placeholder="e.g. Coach sick leave, maintenance"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsCancelDialogOpen(false)}>
              Keep Class
            </Button>
            <Button variant="destructive" size="sm" onClick={handleConfirmCancel}>
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ClassManager;
