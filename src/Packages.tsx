import React, { useState, useRef } from 'react';
import { useAppContext } from './context';
import { usePackages } from './hooks/usePackages';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Package, Branch } from './types';
import { Plus, Edit, Trash2, Upload, X } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { storage } from './firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import ImageCropperDialog from './components/ImageCropperDialog';

export default function Packages() {
  const { currentUser, branches, features } = useAppContext();
  const { packages, addPackage, updatePackage, deletePackage } = usePackages();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [packageToDelete, setPackageToDelete] = useState<string | null>(null);
  const [editingPackage, setEditingPackage] = useState<Package | null>(null);

  const [name, setName] = useState('');
  const [sessions, setSessions] = useState<number | ''>('');
  const [unlimitedSessions, setUnlimitedSessions] = useState(false);
  const [price, setPrice] = useState<number | ''>('');
  const [expiryDays, setExpiryDays] = useState<number | ''>('');
  const [branch, setBranch] = useState<Branch | 'ALL'>('ALL');
  const [packageType, setPackageType] = useState<Package['type']>('Group');
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
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
      await addPackage({
        name,
        sessions: unlimitedSessions ? 0 : Number(sessions),
        price: Number(price),
        expiryDays: Number(expiryDays),
        branch,
        type: packageType,
        imageUrl: imageUrl || undefined
      });
      setIsAddOpen(false);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (editingPackage && name && (unlimitedSessions || sessions !== '') && price !== '' && expiryDays !== '') {
      await updatePackage(editingPackage.id, {
        name,
        sessions: unlimitedSessions ? 0 : Number(sessions),
        price: Number(price),
        expiryDays: Number(expiryDays),
        branch,
        type: packageType,
        imageUrl: imageUrl || undefined
      });
      setIsEditOpen(false);
      setEditingPackage(null);
      resetForm();
    }
  };

  const handleDelete = async (id: string) => {
    setPackageToDelete(id);
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (packageToDelete) {
      await deletePackage(packageToDelete);
      setPackageToDelete(null);
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
    setPackageType('Group');
    setImageUrl('');
    setUploading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold tracking-tight">Package Management</h2>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger render={<Button />}>
            <Plus className="mr-2 h-4 w-4" /> Add Package
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Package</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Package Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. 12 Sessions" />
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
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd}>Save Package</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Sessions</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages
                .filter(pkg => features?.ptPackages !== false || pkg.type !== 'Private')
                .map(pkg => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pkg.name}</TableCell>
                  <TableCell>
                    {pkg.sessions === 0
                      ? <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">∞ Unlimited</span>
                      : pkg.sessions}
                  </TableCell>
                  <TableCell>{pkg.price.toLocaleString()} LE</TableCell>
                  <TableCell>{pkg.expiryDays} days</TableCell>
                  <TableCell>{pkg.branch}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(pkg)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(pkg.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {packages.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No packages found. Create one to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Package</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Package Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
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
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit}>Update Package</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog 
        isOpen={isConfirmDeleteOpen}
        onOpenChange={setIsConfirmDeleteOpen}
        title="Delete Package"
        description="Are you sure you want to delete this package? This action cannot be undone."
        onConfirm={confirmDelete}
        variant="destructive"
        confirmText="Delete"
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
