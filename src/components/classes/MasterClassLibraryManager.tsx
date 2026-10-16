import React, { useState, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage, getTenantId } from '../../firebase';
import { useMasterClasses } from '../../hooks/useMasterClasses';
import { MasterClassDefinition } from '../../types/class';
import { useSettings } from '../../contexts/SettingsContext';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Upload,
  Image as ImageIcon,
  Users,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  Tag,
  DollarSign,
  Sparkles,
  BookOpen,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

export const MASTER_CLASS_CATEGORIES = [
  'SGF',
  'Classes',
  'HIIT',
  'Boxing',
  'Yoga & Flexibility',
  'Strength & Conditioning',
  'Gymnastics',
  'Adults',
  'Kids',
  'Juniors',
  'Cardio Blast',
  'Pilates',
  'Mobility & Core',
  'Cross Training',
  'Spinning',
] as const;

export function MasterClassLibraryManager() {
  const {
    masterClasses,
    loading,
    addMasterClass,
    updateMasterClass,
    toggleMasterClassStatus,
    deleteMasterClass,
  } = useMasterClasses();
  const { branding } = useSettings();
  const currencySymbol = branding?.currencySymbol || 'EGP';

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Free' | 'Paid'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'Active' | 'On Hold'>('ALL');

  // Create / Edit Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterClassDefinition | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Delete Confirmation Dialog State
  const [deleteTarget, setDeleteTarget] = useState<MasterClassDefinition | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form Fields State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState<number>(20);
  const [imageUrl, setImageUrl] = useState('');
  const [classType, setClassType] = useState<'Free' | 'Paid'>('Free');
  const [price, setPrice] = useState<number>(0);
  const [category, setCategory] = useState<string>('Classes');
  const [status, setStatus] = useState<'Active' | 'On Hold'>('Active');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(MASTER_CLASS_CATEGORIES);
    masterClasses.forEach((mc) => {
      if (mc.category) set.add(mc.category);
    });
    return Array.from(set);
  }, [masterClasses]);

  const filteredMasterClasses = useMemo(() => {
    return masterClasses.filter((mc) => {
      if (categoryFilter !== 'ALL' && mc.category !== categoryFilter) return false;
      if (typeFilter !== 'ALL' && mc.classType !== typeFilter) return false;
      if (statusFilter !== 'ALL' && mc.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (mc.name || '').toLowerCase().includes(q);
        const matchDesc = (mc.description || '').toLowerCase().includes(q);
        const matchCat = (mc.category || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchCat) return false;
      }
      return true;
    });
  }, [masterClasses, categoryFilter, typeFilter, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = masterClasses.length;
    const active = masterClasses.filter((m) => m.status === 'Active').length;
    const onHold = masterClasses.filter((m) => m.status === 'On Hold').length;
    const paid = masterClasses.filter((m) => m.classType === 'Paid').length;
    const free = masterClasses.filter((m) => m.classType === 'Free').length;
    return { total, active, onHold, paid, free };
  }, [masterClasses]);

  const resetForm = () => {
    setEditingItem(null);
    setName('');
    setDescription('');
    setCapacity(20);
    setImageUrl('');
    setClassType('Free');
    setPrice(0);
    setCategory('Classes');
    setStatus('Active');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleOpenAdd = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (item: MasterClassDefinition) => {
    setEditingItem(item);
    setName(item.name || '');
    setDescription(item.description || '');
    setCapacity(Number(item.capacity) || 20);
    setImageUrl(item.imageUrl || '');
    setClassType(item.classType || 'Free');
    setPrice(item.classType === 'Free' ? 0 : Number(item.price || 0));
    setCategory(item.category || 'Classes');
    setStatus(item.status || 'Active');
    setIsDialogOpen(true);
  };

  const handleClassTypeChange = (nextType: 'Free' | 'Paid') => {
    setClassType(nextType);
    if (nextType === 'Free') {
      setPrice(0);
    }
  };

  const handleImageFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file');
      return;
    }

    setIsUploadingImage(true);
    try {
      const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
      const storagePath = `tenants/${getTenantId()}/master_classes/${crypto.randomUUID()}_${safeName}`;
      const fileRef = storageRef(storage, storagePath);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(fileRef);
      setImageUrl(downloadUrl);
      toast.success('Class profile image uploaded');
    } catch (error: any) {
      console.error('[MasterClassLibraryManager] Image upload error:', error);
      toast.error(error?.message || 'Failed to upload class image');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Class Name is required');
      return;
    }
    if (!capacity || capacity < 1) {
      toast.error('Capacity limit must be at least 1');
      return;
    }
    if (classType === 'Paid' && (price === undefined || price < 0)) {
      toast.error('Please enter a valid price for a Paid class');
      return;
    }

    const resolvedPrice = classType === 'Free' ? 0 : Number(price || 0);

    setIsSubmitting(true);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        capacity: Number(capacity),
        imageUrl: imageUrl.trim() || undefined,
        classType,
        price: resolvedPrice,
        category: category || 'Classes',
        status,
      };

      if (editingItem) {
        await updateMasterClass(editingItem.id, payload);
      } else {
        await addMasterClass(payload);
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      // Error logged & toasted inside useMasterClasses
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickToggleStatus = async (item: MasterClassDefinition) => {
    const nextStatus: 'Active' | 'On Hold' = item.status === 'Active' ? 'On Hold' : 'Active';
    setTogglingId(item.id);
    try {
      await toggleMasterClassStatus(item.id, nextStatus);
    } catch {
      // Handled in hook
    } finally {
      setTogglingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteMasterClass(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Handled in hook
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Primary Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Master Class Library
          </h2>
          <p className="text-sm text-muted-foreground">
            Create and manage reusable master class profiles, capacities, pricing, and availability status.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          New Master Class
        </Button>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-card/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Profiles</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <BookOpen className="h-8 w-8 text-primary/20" />
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Active</p>
              <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-500/20" />
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">On Hold</p>
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.onHold}</p>
            </div>
            <PauseCircle className="h-8 w-8 text-amber-500/20" />
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Free / Paid</p>
              <p className="text-2xl font-bold">
                {stats.free} <span className="text-muted-foreground text-base font-normal">/</span> {stats.paid}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-blue-500/20" />
          </CardContent>
        </Card>
      </div>

      {/* Filters Toolbar */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search class name or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={categoryFilter} onValueChange={(val) => { if (val) setCategoryFilter(val); }}>
              <SelectTrigger>
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Categories</SelectItem>
                {availableCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'ALL' | 'Free' | 'Paid')}>
              <SelectTrigger>
                <SelectValue placeholder="All Class Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Types (Free & Paid)</SelectItem>
                <SelectItem value="Free">Free Classes</SelectItem>
                <SelectItem value="Paid">Paid Classes</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'ALL' | 'Active' | 'On Hold')}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="Active">Active Only</SelectItem>
                <SelectItem value="On Hold">On Hold Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Master Class Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((n) => (
            <Card key={n} className="overflow-hidden animate-pulse">
              <div className="h-40 bg-muted" />
              <CardContent className="p-4 space-y-3">
                <div className="h-5 bg-muted rounded w-2/3" />
                <div className="h-4 bg-muted rounded w-full" />
                <div className="h-8 bg-muted rounded w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredMasterClasses.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center space-y-3">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto opacity-50" />
            <div className="space-y-1">
              <p className="font-semibold text-base">No master classes found</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {masterClasses.length === 0
                  ? 'Your Master Class Library is empty. Create your first master class profile to start scheduling classes.'
                  : 'No master class profiles match your current filter criteria.'}
              </p>
            </div>
            {masterClasses.length === 0 && (
              <Button onClick={handleOpenAdd} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Create First Master Class
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMasterClasses.map((mc) => {
            const isOnHold = mc.status === 'On Hold';
            const isPaid = mc.classType === 'Paid';

            return (
              <Card
                key={mc.id}
                className={`overflow-hidden flex flex-col justify-between transition-all border ${
                  isOnHold ? 'opacity-80 border-amber-500/30 bg-muted/20' : 'hover:shadow-md'
                }`}
              >
                <div>
                  {/* Profile Image Thumbnail Banner */}
                  <div className="relative h-44 w-full bg-muted overflow-hidden flex items-center justify-center">
                    {mc.imageUrl ? (
                      <img
                        src={mc.imageUrl}
                        alt={mc.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground/50">
                        <Sparkles className="h-10 w-10 mb-1" />
                        <span className="text-xs font-medium">{mc.category || 'Master Class'}</span>
                      </div>
                    )}

                    {/* Top-Left Category Badge */}
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="backdrop-blur-md bg-background/85 font-medium gap-1">
                        <Tag className="h-3 w-3" />
                        {mc.category || 'Classes'}
                      </Badge>
                    </div>

                    {/* Top-Right Status Badge */}
                    <div className="absolute top-3 right-3">
                      <Badge
                        className={
                          isOnHold
                            ? 'bg-amber-500/90 hover:bg-amber-500 text-white border-0'
                            : 'bg-emerald-600/90 hover:bg-emerald-600 text-white border-0'
                        }
                      >
                        {mc.status || 'Active'}
                      </Badge>
                    </div>

                    {/* Bottom Strip: Free vs Paid + Capacity */}
                    <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                      <Badge
                        className={
                          isPaid
                            ? 'bg-blue-600/90 hover:bg-blue-600 text-white border-0 font-semibold'
                            : 'bg-zinc-900/80 hover:bg-zinc-900 text-white border-0'
                        }
                      >
                        {isPaid ? `Paid • ${mc.price} ${currencySymbol}` : 'Free Class'}
                      </Badge>

                      <Badge variant="outline" className="backdrop-blur-md bg-background/90 gap-1 font-medium">
                        <Users className="h-3 w-3 text-primary" />
                        Cap: {mc.capacity}
                      </Badge>
                    </div>
                  </div>

                  {/* Card Details */}
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-lg font-bold line-clamp-1">{mc.name}</CardTitle>
                    <CardDescription className="line-clamp-2 min-h-[2.5rem] text-xs">
                      {mc.description || 'No description provided for this master class.'}
                    </CardDescription>
                  </CardHeader>
                </div>

                {/* Card Actions */}
                <CardContent className="p-4 pt-2 border-t bg-muted/10 flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickToggleStatus(mc)}
                    disabled={togglingId === mc.id}
                    className="gap-1.5 text-xs flex-1"
                    title={isOnHold ? 'Activate Class' : 'Put Class On Hold'}
                  >
                    {isOnHold ? (
                      <>
                        <PlayCircle className="h-3.5 w-3.5 text-emerald-600" />
                        Activate
                      </>
                    ) : (
                      <>
                        <PauseCircle className="h-3.5 w-3.5 text-amber-600" />
                        Hold
                      </>
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEdit(mc)}
                    className="gap-1.5 text-xs"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget(mc)}
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Delete Master Class"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Master Class Modal */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Master Class Profile' : 'Create Master Class Profile'}</DialogTitle>
            <DialogDescription>
              Configure the template details for this class. Changes apply to the Master Class Library.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            {/* Class Name */}
            <div className="space-y-1.5">
              <Label htmlFor="mc-name">Class Name *</Label>
              <Input
                id="mc-name"
                placeholder="e.g., Strike Boxing Conditioning, SGF Morning Blast"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="mc-description">Description</Label>
              <Textarea
                id="mc-description"
                placeholder="Describe workout intensity, equipment needed, or target audience..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Category & Capacity Limit */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mc-category">Category *</Label>
                <Select value={category} onValueChange={(val) => { if (val) setCategory(val); }}>
                  <SelectTrigger id="mc-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mc-capacity">Default Capacity Limit *</Label>
                <Input
                  id="mc-capacity"
                  type="number"
                  min={1}
                  max={500}
                  value={capacity}
                  onChange={(e) => setCapacity(Math.max(1, Number(e.target.value) || 1))}
                  required
                />
              </div>
            </div>

            {/* Class Type (Free vs Paid) & Price */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mc-type">Class Type *</Label>
                <Select
                  value={classType}
                  onValueChange={(val) => handleClassTypeChange(val as 'Free' | 'Paid')}
                >
                  <SelectTrigger id="mc-type">
                    <SelectValue placeholder="Free or Paid" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Free">Free (Included / 0 {currencySymbol})</SelectItem>
                    <SelectItem value="Paid">Paid (Requires Fee)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {classType === 'Paid' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="mc-price">Class Price ({currencySymbol}) *</Label>
                  <Input
                    id="mc-price"
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="e.g. 250"
                    value={price}
                    onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
                    required
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Class Price ({currencySymbol})</Label>
                  <Input value={`0 (${currencySymbol} - Free)`} disabled className="bg-muted" />
                </div>
              )}
            </div>

            {/* Status (Active vs On Hold) */}
            <div className="space-y-1.5">
              <Label htmlFor="mc-status">Library Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as 'Active' | 'On Hold')}>
                <SelectTrigger id="mc-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active (Available for Scheduling)</SelectItem>
                  <SelectItem value="On Hold">On Hold (Hidden from Active Scheduling)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Profile Image Upload & URL */}
            <div className="space-y-2">
              <Label>Class Profile Image</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Paste image URL or upload from device..."
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className="flex-1"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageFileUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  className="gap-1.5 shrink-0"
                >
                  <Upload className="h-4 w-4" />
                  {isUploadingImage ? 'Uploading...' : 'Upload Image'}
                </Button>
              </div>

              {imageUrl && (
                <div className="relative mt-2 rounded-lg overflow-hidden border h-32 bg-muted flex items-center justify-center">
                  <img
                    src={imageUrl}
                    alt="Class preview"
                    className="h-full w-full object-cover"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="h-6 w-6 absolute top-2 right-2"
                    onClick={() => setImageUrl('')}
                    title="Remove image"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || isUploadingImage}>
                {isSubmitting
                  ? 'Saving...'
                  : editingItem
                  ? 'Save Changes'
                  : 'Create Master Class'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Delete Master Class</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground">"{deleteTarget?.name}"</span> from the Master Class
              Library? Existing scheduled sessions on the timetable will not be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MasterClassLibraryManager;
