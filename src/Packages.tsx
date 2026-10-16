import React, { useState, useRef } from 'react';
import { useAppContext } from './context';
import { usePackages } from './hooks/usePackages';
import { usePackageCategories } from './hooks/usePackageCategories';
import { PackageCategoryManagerDialog } from './components/packages/PackageCategoryManagerDialog';
import PackageBenefitsFormSection, { PackageEnhancementsState, DEFAULT_PACKAGE_ENHANCEMENTS } from './components/packages/PackageBenefitsFormSection';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Branch } from './types';
import { Plus, Edit, Upload, X, Archive, RotateCcw, HelpCircle, ChevronDown, ChevronUp, Layers, Tag, FolderCog, PauseCircle, PlayCircle, Target, Calendar, User as UserIcon } from 'lucide-react';
import { storage, getTenantId } from './firebase';
import { isTenantInzan } from './utils/inzanOrg';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ConfirmDialog } from './components/ConfirmDialog';
import ImageCropperDialog from './components/ImageCropperDialog';

export const INZAN_PACKAGE_CATEGORIES = [
  'Membership',
  'Personal Training',
  'SGF',
  'Gymnastics',
  'Nutrition',
  'Complimentary',
  'Classes',
  'Physiotherapy',
  'Gym Memberships',
  'Personal Training (PT)',
  'Drop-in / Day Pass',
  'Other'
] as const;

export const STANDARD_PACKAGE_CATEGORIES = [
  'Gym Memberships',
  'Personal Training (PT)',
  'Drop-in / Day Pass',
  'Classes',
  'Nutrition',
  'Other'
] as const;

export const PACKAGE_CATEGORIES = INZAN_PACKAGE_CATEGORIES;

export default function Packages() {
  const { currentUser, branches, features } = useAppContext();
  const { packages, addPackage, updatePackage, togglePackageHold, deletePackage, restorePackage } = usePackages();
  const { categoryNames } = usePackageCategories();
  const isInzan = isTenantInzan() || getTenantId().toLowerCase().includes('inzan');
  const availableCategories = isInzan ? INZAN_PACKAGE_CATEGORIES : STANDARD_PACKAGE_CATEGORIES;
  const effectiveCategories: readonly string[] = isInzan && categoryNames && categoryNames.length > 0 ? categoryNames : availableCategories;

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isCatManagerOpen, setIsCatManagerOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);
  const [archiveReason, setArchiveReason] = useState('');
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  const [name, setName] = useState('');
  const [sessions, setSessions] = useState<number | ''>('');
  const [unlimitedSessions, setUnlimitedSessions] = useState(false);
  const [price, setPrice] = useState<number | ''>('');
  const [expiryDays, setExpiryDays] = useState<number | ''>('');
  const [branch, setBranch] = useState<Branch | 'ALL'>('ALL');
  const [packageType, setPackageType] = useState<Package['type']>('Group');
  const [category, setCategory] = useState<string>('Gym Memberships');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [imageUrl, setImageUrl] = useState('');
  const [enhancements, setEnhancements] = useState<PackageEnhancementsState>(DEFAULT_PACKAGE_ENHANCEMENTS);
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [cropSrc, setCropSrc] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);

  const addFileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  if (currentUser?.role !== 'manager' && currentUser?.role !== 'admin' && currentUser?.role !== 'super_admin' && currentUser?.role !== 'crm_admin') {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">You do not have permission to view this page.</p>
      </div>
    );
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setCropSrc(reader.result as string);
        setIsCropOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCroppedImageUpload = async (blob: Blob) => {
    setUploading(true);
    try {
      const path = `packages/pkg_${Date.now()}.jpg`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob);
      const url = await getDownloadURL(ref);
      setImageUrl(url);
    } catch (err: any) {
      console.error('Failed to upload image:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
    }
  };

  const buildEnhancementPayload = (numericPrice: number) => {
    const enh: any = enhancements || DEFAULT_PACKAGE_ENHANCEMENTS;
    const freePtSessions = Number(enh.freePtSessions ?? enh.benefits?.freePtSessions ?? 0);
    const freezeAllowanceDays = Number(enh.freezeAllowanceDays ?? enh.benefits?.freezeAllowanceDays ?? 0);
    const minFreezeDays = Number(enh.minFreezeDays ?? enh.benefits?.minFreezeDays ?? 0);
    const maxFreezeDays = Number(enh.maxFreezeDays ?? enh.benefits?.maxFreezeDays ?? 0);
    const guestInvitations = Number(enh.guestInvitations ?? enh.benefits?.guestInvitations ?? 0);
    const freeClassTrials = Number(enh.freeClassTrials ?? enh.benefits?.freeClassTrials ?? 0);
    const pkgStatus: 'Active' | 'Hold' = enh.status === 'Hold' ? 'Hold' : 'Active';
    const isTimeRestricted = Boolean(enh.isTimeRestricted);

    return {
      hierarchy: (enh.hierarchy || 'Primary') as Package['hierarchy'],
      status: pkgStatus,
      isActive: pkgStatus !== 'Hold',
      is_active: pkgStatus !== 'Hold',
      benefits: {
        freePtSessions,
        freezeAllowanceDays,
        minFreezeDays,
        maxFreezeDays,
        guestInvitations,
        freeClassTrials,
      },
      freePtSessions,
      freezeAllowanceDays,
      minFreezeDays,
      maxFreezeDays,
      guestInvitations,
      freeClassTrials,
      isTimeRestricted,
      allowedStartTime: isTimeRestricted ? (enh.allowedStartTime || '06:00') : undefined,
      allowedEndTime: isTimeRestricted ? (enh.allowedEndTime || '14:00') : undefined,
      targetTeam: (enh.targetTeam || 'Sales') as Package['targetTeam'],
      targetAmount: enh.targetAmount !== undefined && enh.targetAmount !== '' ? Number(enh.targetAmount) : numericPrice,
    };
  };

  const handleAdd = async () => {
    if (name && (unlimitedSessions || sessions !== '') && price !== '' && expiryDays !== '') {
      setIsSubmitting(true);
      try {
        const numericPrice = Number(price);
        await addPackage({
          name,
          sessions: unlimitedSessions ? 0 : Number(sessions),
          price: numericPrice,
          expiryDays: Number(expiryDays),
          branch,
          category,
          type: packageType,
          imageUrl: imageUrl || undefined,
          ...(isInzan ? buildEnhancementPayload(numericPrice) : {}),
        });
        setIsAddOpen(false);
        resetForm();
      } catch (err: any) {
        // Error is surfaced via sonner toast in usePackages
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleEdit = async () => {
    if (editingPackage && name && (unlimitedSessions || sessions !== '') && price !== '' && expiryDays !== '') {
      setIsSubmitting(true);
      try {
        const numericPrice = Number(price);
        await updatePackage(editingPackage.id, {
          name,
          sessions: unlimitedSessions ? 0 : Number(sessions),
          price: numericPrice,
          expiryDays: Number(expiryDays),
          branch,
          category,
          type: packageType,
          imageUrl: imageUrl || undefined,
          ...(isInzan ? buildEnhancementPayload(numericPrice) : {}),
        });
        setIsEditOpen(false);
        setEditingPackage(null);
        resetForm();
      } catch (err: any) {
        // Error is surfaced via sonner toast in usePackages
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const isArchived = (pkg: Package) => {
    return Boolean(pkg.archivedAt);
  };

  const isOnHold = (pkg: Package) => {
    if (isArchived(pkg)) return false;
    return pkg.status === 'Hold' || pkg.isActive === false || pkg.is_active === false;
  };

  const handleToggleHold = async (pkg: Package) => {
    const currentlyHold = isOnHold(pkg);
    setIsSubmitting(true);
    try {
      if (togglePackageHold) {
        await togglePackageHold(pkg.id, !currentlyHold);
      } else {
        await updatePackage(pkg.id, {
          status: !currentlyHold ? 'Hold' : 'Active',
          isActive: currentlyHold,
          is_active: currentlyHold,
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setPackageToDelete(id);
    setArchiveReason('');
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (packageToDelete) {
      setIsSubmitting(true);
      try {
        await deletePackage(packageToDelete, archiveReason || undefined);
        setPackageToDelete(null);
        setArchiveReason('');
        setIsConfirmDeleteOpen(false);
      } catch (err) {
        // error surfaced
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleRestore = async (id: string) => {
    setIsSubmitting(true);
    try {
      await restorePackage(id);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEdit = (pkg: Package) => {
    setEditingPackage(pkg);
    setName(pkg.name);
    const isUnlimited = pkg.sessions === 0;
    setUnlimitedSessions(isUnlimited);
    setSessions(isUnlimited ? '' : pkg.sessions);
    setPrice(pkg.price);
    setExpiryDays(pkg.expiryDays);
    setBranch(pkg.branch);
    setCategory(pkg.category || (pkg.type === 'Private' ? 'Personal Training (PT)' : 'Gym Memberships'));
    setPackageType(pkg.type || 'Group');
    setImageUrl(pkg.imageUrl || '');

    const freePtSessions = pkg.freePtSessions ?? pkg.benefits?.freePtSessions ?? 0;
    const freezeAllowanceDays = pkg.freezeAllowanceDays ?? pkg.benefits?.freezeAllowanceDays ?? 0;
    const minFreezeDays = pkg.minFreezeDays ?? pkg.benefits?.minFreezeDays ?? 7;
    const maxFreezeDays = pkg.maxFreezeDays ?? pkg.benefits?.maxFreezeDays ?? 30;
    const guestInvitations = pkg.guestInvitations ?? pkg.benefits?.guestInvitations ?? 0;
    const freeClassTrials = pkg.freeClassTrials ?? pkg.benefits?.freeClassTrials ?? 0;

    setEnhancements({
      ...DEFAULT_PACKAGE_ENHANCEMENTS,
      hierarchy: pkg.hierarchy || 'Primary',
      status: isOnHold(pkg) ? 'Hold' : 'Active',
      freePtSessions,
      freezeAllowanceDays,
      minFreezeDays,
      maxFreezeDays,
      guestInvitations,
      freeClassTrials,
      isTimeRestricted: Boolean(pkg.isTimeRestricted),
      allowedStartTime: pkg.allowedStartTime || '06:00',
      allowedEndTime: pkg.allowedEndTime || '14:00',
      targetTeam: pkg.targetTeam || 'Sales',
      targetAmount: pkg.targetAmount ?? pkg.price ?? 0,
    });

    setIsEditOpen(true);
  };

  const resetForm = () => {
    setName('');
    setSessions('');
    setUnlimitedSessions(false);
    setPrice('');
    setExpiryDays('');
    setBranch('ALL');
    setCategory(effectiveCategories[0] || 'Gym Memberships');
    setPackageType('Group');
    setImageUrl('');
    setEnhancements(DEFAULT_PACKAGE_ENHANCEMENTS);
    setUploading(false);
  };

  const getCategoryBadgeClass = (cat?: string) => {
    switch (cat) {
      case 'Membership':
      case 'Gym Memberships':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Personal Training':
      case 'Personal Training (PT)':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'SGF':
      case 'SGF (Small Group Fitness)':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Gymnastics':
        return 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20';
      case 'Drop-in / Day Pass':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      case 'Nutrition':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'Classes':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      case 'Physiotherapy':
        return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20';
      case 'Complimentary':
        return 'bg-teal-500/10 text-teal-500 border-teal-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  const renderBenefitsBadges = (pkg: Package) => {
    const pt = pkg.freePtSessions ?? pkg.benefits?.freePtSessions ?? 0;
    const freeze = pkg.freezeAllowanceDays ?? pkg.benefits?.freezeAllowanceDays ?? 0;
    const minF = pkg.minFreezeDays ?? pkg.benefits?.minFreezeDays ?? 0;
    const maxF = pkg.maxFreezeDays ?? pkg.benefits?.maxFreezeDays ?? 0;
    const invites = pkg.guestInvitations ?? pkg.benefits?.guestInvitations ?? 0;
    const trials = pkg.freeClassTrials ?? pkg.benefits?.freeClassTrials ?? 0;
    const timeRestricted = Boolean(pkg.isTimeRestricted);

    const badges: React.ReactNode[] = [];
    if (pt > 0) {
      badges.push(
        <span key="pt" className="inline-flex items-center rounded-md bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400">
          🎁 {pt} PT
        </span>
      );
    }
    if (freeze > 0) {
      const rangeText = minF > 0 || maxF > 0 ? ` (${minF || 1}-${maxF || freeze}d)` : '';
      badges.push(
        <span key="freeze" className="inline-flex items-center rounded-md bg-sky-500/10 border border-sky-500/20 px-1.5 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400">
          ❄️ {freeze}d Freeze{rangeText}
        </span>
      );
    }
    if (invites > 0) {
      badges.push(
        <span key="invites" className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
          🎟️ {invites} Invites
        </span>
      );
    }
    if (trials > 0) {
      badges.push(
        <span key="trials" className="inline-flex items-center rounded-md bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
          🏋️ {trials} Class Trials
        </span>
      );
    }
    if (timeRestricted) {
      badges.push(
        <span key="time" className="inline-flex items-center rounded-md bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 text-[11px] font-medium text-orange-600 dark:text-orange-400">
          ⏰ {pkg.allowedStartTime || '06:00'}-{pkg.allowedEndTime || '14:00'}
        </span>
      );
    }

    if (badges.length === 0) {
      return <span className="text-xs text-muted-foreground">—</span>;
    }

    return <div className="flex flex-wrap gap-1 max-w-[260px]">{badges}</div>;
  };

  const filteredPackages = packages
    .filter(pkg => features?.ptPackages !== false || pkg.type !== 'Private')
    .filter(pkg => {
      if (selectedCategory === 'ALL') return true;
      const cat = pkg.category || (pkg.type === 'Private' ? 'Personal Training (PT)' : 'Gym Memberships');
      return cat === selectedCategory;
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Package Management</h2>
          <p className="text-sm text-muted-foreground">
            Configure memberships, PT tiers, day passes, and service entitlements
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowGuide(!showGuide)}
            className="gap-1.5"
          >
            <HelpCircle className="h-4 w-4 text-primary" />
            <span>Guide</span>
            {showGuide ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>

          {isInzan && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCatManagerOpen(true)}
              className="gap-1.5"
            >
              <FolderCog className="h-4 w-4 text-primary" />
              <span>Manage Categories</span>
            </Button>
          )}

          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={<Button className="gap-1.5" />}>
              <Plus className="h-4 w-4" /> Add Package
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
              <DialogHeader>
                <DialogTitle className="text-xl md:text-2xl font-bold">Add New Package</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Package Name</Label>
                    <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 12 Sessions PT or 1 Month Gym" />
                  </div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={category} onValueChange={(v: any) => v && setCategory(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {effectiveCategories.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Sessions</Label>
                    <div className="flex items-center gap-2 mb-1">
                      <input
                        type="checkbox"
                        id="unlimited-add"
                        checked={unlimitedSessions}
                        onChange={e => { setUnlimitedSessions(e.target.checked); if (e.target.checked) setSessions(''); }}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      <label htmlFor="unlimited-add" className="text-sm text-muted-foreground cursor-pointer select-none">∞ Unlimited (time-governed)</label>
                    </div>
                    <Input type="number" value={sessions} disabled={unlimitedSessions} placeholder={unlimitedSessions ? 'Unlimited' : ''} onChange={e => setSessions(e.target.value ? Number(e.target.value) : '')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Price (LE)</Label>
                    <Input type="number" value={price} onChange={e => setPrice(e.target.value ? Number(e.target.value) : '')} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Expiry (Days)</Label>
                    <Input type="number" value={expiryDays} onChange={e => setExpiryDays(e.target.value ? Number(e.target.value) : '')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Select value={branch} onValueChange={(v: any) => setBranch(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Branches</SelectItem>
                        {branches.map(b => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {features?.ptPackages !== false && (
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={packageType} onValueChange={(v: any) => v && setPackageType(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Private">Private</SelectItem>
                        <SelectItem value="Group">Group</SelectItem>
                        <SelectItem value="Other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {isInzan && <PackageBenefitsFormSection value={enhancements} onChange={setEnhancements} />}

                <div className="space-y-2">
                  <Label>Package Image (optional)</Label>
                  <div className="flex items-center gap-3">
                    {imageUrl ? (
                      <div className="relative h-16 w-16 rounded-lg overflow-hidden border">
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                        <button 
                          type="button"
                          className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white" 
                          onClick={() => setImageUrl('')}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center bg-muted/30">
                        <span className="text-[10px] text-muted-foreground text-center">No image</span>
                      </div>
                    )}
                    <input
                      type="file"
                      ref={addFileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileSelect}
                    />
                    <Button 
                      type="button"
                      size="sm" 
                      variant="outline" 
                      className="gap-1.5"
                      onClick={() => addFileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? 'Uploading...' : 'Upload Image'}
                    </Button>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={isSubmitting}>Cancel</Button>
                <Button onClick={handleAdd} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save Package'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {showGuide && (
        <Card className="border border-primary/20 bg-primary/5 p-4 rounded-2xl">
          <div className="flex items-start gap-3">
            <Layers className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-2 text-sm">
              <h4 className="font-semibold text-foreground">{isInzan ? 'Package Configuration & Inzan Operations Guide' : 'Package Configuration Guide'}</h4>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Categories:</strong> Segment packages cleanly across POS tabs (Gym Memberships, PT, Drop-in, Classes, Nutrition). This prevents cross-service booking confusion.</li>
                {isInzan && (
                  <>
                <li><strong className="text-foreground">Primary vs Secondary Hierarchy:</strong> Primary packages represent core memberships, while Secondary packages represent add-ons or supplementary services.</li>
                <li><strong className="text-foreground">Benefits & Entitlements:</strong> Configure complimentary PT sessions, freeze allowances (total days + min/max per request), guest invitations, class trials, and off-peak check-in windows.</li>
                <li><strong className="text-foreground">Target Attribution & Hold Status:</strong> Assign revenue targets to Sales, PT, Class Instructors, or Nutrition teams, and place seasonal packages On Hold without archiving them.</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        </Card>
      )}

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
        <Button
          size="sm"
          variant={selectedCategory === 'ALL' ? 'default' : 'outline'}
          className="h-8 text-xs rounded-full"
          onClick={() => setSelectedCategory('ALL')}
        >
          All Categories ({packages.length})
        </Button>
        {effectiveCategories.map(cat => {
          const count = packages.filter(p => (p.category || (p.type === 'Private' ? 'Personal Training (PT)' : 'Gym Memberships')) === cat).length;
          return (
            <Button
              key={cat}
              size="sm"
              variant={selectedCategory === cat ? 'default' : 'outline'}
              className="h-8 text-xs rounded-full gap-1.5"
              onClick={() => setSelectedCategory(cat)}
            >
              <span>{cat}</span>
              <span className="text-[10px] opacity-75 font-semibold">({count})</span>
            </Button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>{isInzan ? 'Category & Hierarchy' : 'Category'}</TableHead>
                {isInzan && <TableHead>Benefits & Access</TableHead>}
                {isInzan && <TableHead>Target</TableHead>}
                <TableHead>Sessions / Expiry</TableHead>
                <TableHead>Price</TableHead>
                {isInzan && <TableHead>Status</TableHead>}
                {isInzan && <TableHead>Created</TableHead>}
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPackages.map(pkg => {
                const archived = isArchived(pkg);
                const onHold = isOnHold(pkg);
                const pkgCat = pkg.category || (pkg.type === 'Private' ? 'Personal Training (PT)' : 'Gym Memberships');
                const hierarchy = pkg.hierarchy || 'Primary';
                const targetTeam = pkg.targetTeam || 'Sales';
                return (
                  <TableRow key={pkg.id} className={archived ? 'opacity-60 bg-muted/30' : onHold ? 'bg-amber-500/5' : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{pkg.name}</span>
                        <span className="text-xs text-muted-foreground">Branch: {pkg.branch}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getCategoryBadgeClass(pkgCat)}`}>
                          <Tag className="h-3 w-3" />
                          {pkgCat}
                        </span>
                        {isInzan && (
                          <span
                            className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                              hierarchy === 'Primary'
                                ? 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20'
                                : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                            }`}
                          >
                            {hierarchy}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    {isInzan && (
                      <TableCell>
                        {renderBenefitsBadges(pkg)}
                      </TableCell>
                    )}
                    {isInzan && (
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Target className="h-3 w-3" />
                            Target: {targetTeam}
                          </span>
                          {pkg.targetAmount !== undefined && pkg.targetAmount > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              Credit: {Number(pkg.targetAmount).toLocaleString()} LE
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-col">
                        <span>
                          {pkg.sessions === 0
                            ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">∞ Unlimited</span>
                            : `${pkg.sessions} sessions`}
                        </span>
                        <span className="text-xs text-muted-foreground">{pkg.expiryDays} days</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold">{pkg.price.toLocaleString()} LE</TableCell>
                    {isInzan && (
                      <TableCell>
                        {archived ? (
                          <span className="inline-flex items-center rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-0.5 text-xs font-medium text-rose-600">
                            Archived
                          </span>
                        ) : onHold ? (
                          <span className="inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-600">
                            On Hold
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                            Active
                          </span>
                        )}
                      </TableCell>
                    )}
                    {isInzan && (
                      <TableCell>
                        <div className="flex flex-col text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {pkg.createdAt ? new Date(pkg.createdAt).toLocaleDateString() : '—'}
                          </span>
                          {pkg.createdByName && (
                            <span className="inline-flex items-center gap-1 text-[11px]">
                              <UserIcon className="h-3 w-3" />
                              {pkg.createdByName}
                            </span>
                          )}
                        </div>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!archived && (
                          <>
                            {isInzan && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleHold(pkg)}
                                title={onHold ? 'Activate package' : 'Put package On Hold'}
                                disabled={isSubmitting}
                                className={onHold ? 'text-emerald-600' : 'text-amber-600'}
                              >
                                {onHold ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)} title="Edit package" disabled={isSubmitting}>
                              <Edit className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {archived ? (
                          <Button variant="ghost" size="icon" onClick={() => handleRestore(pkg.id)} title="Restore package" disabled={isSubmitting}>
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(pkg.id)} title="Archive package" disabled={isSubmitting}>
                            <Archive className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPackages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isInzan ? 9 : 5} className="text-center text-muted-foreground py-8">
                    No packages found in this category.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <PackageCategoryManagerDialog
        open={isCatManagerOpen}
        onOpenChange={setIsCatManagerOpen}
      />

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
          <DialogHeader>
            <DialogTitle className="text-xl md:text-2xl font-bold">Edit Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v: any) => v && setCategory(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {effectiveCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sessions</Label>
                <div className="flex items-center gap-2 mb-1">
                  <input
                    type="checkbox"
                    id="unlimited-edit"
                    checked={unlimitedSessions}
                    onChange={e => { setUnlimitedSessions(e.target.checked); if (e.target.checked) setSessions(''); }}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="unlimited-edit" className="text-sm text-muted-foreground cursor-pointer select-none">∞ Unlimited (time-governed)</label>
                </div>
                <Input type="number" value={sessions} disabled={unlimitedSessions} placeholder={unlimitedSessions ? 'Unlimited' : ''} onChange={e => setSessions(e.target.value ? Number(e.target.value) : '')} />
              </div>
              <div className="space-y-2">
                <Label>Price (LE)</Label>
                <Input type="number" value={price} onChange={e => setPrice(e.target.value ? Number(e.target.value) : '')} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expiry (Days)</Label>
                <Input type="number" value={expiryDays} onChange={e => setExpiryDays(e.target.value ? Number(e.target.value) : '')} />
              </div>
              <div className="space-y-2">
                <Label>Branch</Label>
                <Select value={branch} onValueChange={(v: any) => setBranch(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Branches (Global)</SelectItem>
                    {branches.map(b => (
                      <SelectItem key={b} value={b}>{b}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {features?.ptPackages !== false && (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={packageType} onValueChange={(v: any) => v && setPackageType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Private">Private</SelectItem>
                    <SelectItem value="Group">Group</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {isInzan && <PackageBenefitsFormSection value={enhancements} onChange={setEnhancements} />}

            <div className="space-y-2">
              <Label>Package Image (optional)</Label>
              <div className="flex items-center gap-3">
                {imageUrl ? (
                  <div className="relative h-16 w-16 rounded-lg overflow-hidden border">
                    <img src={imageUrl} alt="" className="h-full w-full object-cover" />
                    <button 
                      type="button"
                      className="absolute top-0.5 right-0.5 bg-black/60 rounded-full p-0.5 text-white" 
                      onClick={() => setImageUrl('')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-lg border border-dashed flex items-center justify-center bg-muted/30">
                    <span className="text-[10px] text-muted-foreground text-center">No image</span>
                  </div>
                )}
                <input
                  type="file"
                  ref={editFileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileSelect}
                />
                <Button 
                  type="button"
                  size="sm" 
                  variant="outline" 
                  className="gap-1.5"
                  onClick={() => editFileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload className="h-3.5 w-3.5" />
                  {uploading ? 'Uploading...' : 'Upload Image'}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSubmitting}>Cancel</Button>
            <Button onClick={handleEdit} disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog 
        isOpen={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        title="Archive Package"
        description={
          <div className="space-y-3">
            <p>Archiving hides the package from new sales. Existing members keep their entitlements.</p>
            <div className="space-y-1">
              <Label>Reason (optional)</Label>
              <Input value={archiveReason} onChange={e => setArchiveReason(e.target.value)} placeholder="e.g. Seasonal offer ended" />
            </div>
          </div>
        }
        onConfirm={confirmDelete}
        variant="destructive"
        confirmText={isSubmitting ? "Archiving..." : "Archive"}
      />

      <ImageCropperDialog
        isOpen={isCropOpen}
        onClose={() => {
          setIsCropOpen(false);
          setCropSrc('');
          if (addFileInputRef.current) addFileInputRef.current.value = '';
          if (editFileInputRef.current) editFileInputRef.current.value = '';
        }}
        imageSrc={cropSrc}
        aspectRatio={1}
        onCropComplete={handleCroppedImageUpload}
      />
    </div>
  );
}

