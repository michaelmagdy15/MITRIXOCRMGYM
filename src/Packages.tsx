import React, { useState, useRef } from 'react';
import { useAppContext } from './context';
import { usePackages } from './hooks/usePackages';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Branch } from './types';
import { Plus, Edit, Upload, X, Archive, RotateCcw, HelpCircle, ChevronDown, ChevronUp, Layers, Tag } from 'lucide-react';
import { storage } from './firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ConfirmDialog } from './components/ConfirmDialog';
import ImageCropperDialog from './components/ImageCropperDialog';

export const PACKAGE_CATEGORIES = [
  'Gym Memberships',
  'Personal Training (PT)',
  'Drop-in / Day Pass',
  'Nutrition',
  'Classes',
  'Other'
] as const;

export default function Packages() {
  const { currentUser, branches, features } = useAppContext();
  const { packages, addPackage, updatePackage, deletePackage, restorePackage } = usePackages();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
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

  const handleAdd = async () => {
    if (name && (unlimitedSessions || sessions !== '') && price !== '' && expiryDays !== '') {
      setIsSubmitting(true);
      try {
        await addPackage({
          name,
          sessions: unlimitedSessions ? 0 : Number(sessions),
          price: Number(price),
          expiryDays: Number(expiryDays),
          branch,
          category,
          type: packageType,
          imageUrl: imageUrl || undefined
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
        await updatePackage(editingPackage.id, {
          name,
          sessions: unlimitedSessions ? 0 : Number(sessions),
          price: Number(price),
          expiryDays: Number(expiryDays),
          branch,
          category,
          type: packageType,
          imageUrl: imageUrl || undefined
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
    return pkg.archivedAt !== undefined || pkg.isActive === false || pkg.is_active === false;
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
    setIsEditOpen(true);
  };

  const resetForm = () => {
    setName('');
    setSessions('');
    setUnlimitedSessions(false);
    setPrice('');
    setExpiryDays('');
    setBranch('ALL');
    setCategory('Gym Memberships');
    setPackageType('Group');
    setImageUrl('');
    setUploading(false);
  };


  const getCategoryBadgeClass = (cat?: string) => {
    switch (cat) {
      case 'Gym Memberships':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'Personal Training (PT)':
        return 'bg-purple-500/10 text-purple-500 border-purple-500/20';
      case 'Drop-in / Day Pass':
        return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'Nutrition':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'Classes':
        return 'bg-rose-500/10 text-rose-500 border-rose-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
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
        <div className="flex items-center gap-2">
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

          <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger render={<Button className="gap-1.5" />}>
              <Plus className="h-4 w-4" /> Add Package
            </DialogTrigger>
            <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
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
                        {PACKAGE_CATEGORIES.map(cat => (
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
              <h4 className="font-semibold text-foreground">Package Configuration & Inzan Operations Guide</h4>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                <li><strong className="text-foreground">Categories:</strong> Segment packages cleanly across POS tabs (Gym Memberships, PT, Drop-in, Classes, Nutrition). This prevents cross-service booking confusion.</li>
                <li><strong className="text-foreground">Unlimited Entry:</strong> Mark <em>∞ Unlimited</em> for time-governed memberships. Sessions field is stored as 0 and members enjoy unrestricted check-ins until expiry.</li>
                <li><strong className="text-foreground">Validity & Expiry:</strong> Calculated in days from payment confirmation. Expired memberships automatically block new bookings while preserving complete historical records.</li>
                <li><strong className="text-foreground">Soft-Archive:</strong> Inactive or retired packages are archived rather than permanently deleted. Existing members keep active entitlements and historical revenue reports remain 100% accurate.</li>
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
        {PACKAGE_CATEGORIES.map(cat => {
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
                <TableHead>Category</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPackages.map(pkg => {
                const archived = isArchived(pkg);
                const pkgCat = pkg.category || (pkg.type === 'Private' ? 'Personal Training (PT)' : 'Gym Memberships');
                return (
                  <TableRow key={pkg.id} className={archived ? 'opacity-60 bg-muted/30' : undefined}>
                    <TableCell className="font-medium">
                      {pkg.name}
                      {archived && (
                        <span className="ml-2 inline-flex items-center rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-600">
                          Archived
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getCategoryBadgeClass(pkgCat)}`}>
                        <Tag className="h-3 w-3" />
                        {pkgCat}
                      </span>
                    </TableCell>
                    <TableCell>
                      {pkg.sessions === 0
                        ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">∞ Unlimited</span>
                        : pkg.sessions}
                    </TableCell>
                    <TableCell>{pkg.price.toLocaleString()} LE</TableCell>
                    <TableCell>{pkg.expiryDays} days</TableCell>
                    <TableCell>{pkg.branch}</TableCell>
                    <TableCell className="text-right">
                      {!archived && (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)} disabled={isSubmitting}>
                          <Edit className="h-4 w-4" />
                        </Button>
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
                    </TableCell>
                  </TableRow>
                );
              })}
              {filteredPackages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No packages found in this category.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl p-6 md:p-8">
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
                    {PACKAGE_CATEGORIES.map(cat => (
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
