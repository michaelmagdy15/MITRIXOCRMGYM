import React, { useState, useRef } from 'react';
import { Client, Payment, Attendance, User, Package } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { 
  User as UserIcon, 
  Lock, 
  Unlock, 
  Plus, 
  AlertCircle,
  FileCheck,
  Camera,
  Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { db, storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, query, where, onSnapshot, addDoc, orderBy } from 'firebase/firestore';
import { SalesTransferLog, TrainerTransferLog } from '../types';
import { toast } from 'sonner';
import { MessageSquare, ArrowRightLeft, Heart, Stethoscope, Clock, Palette } from 'lucide-react';

const MAX_PX = 400;
const TARGET_KB = 150;
const MIN_QUALITY = 0.30;

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width > height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
        else               { width  = Math.round((width / height) * MAX_PX); height = MAX_PX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            if (blob.size / 1024 <= TARGET_KB || quality <= MIN_QUALITY) {
              resolve(blob);
            } else {
              tryCompress(Math.max(MIN_QUALITY, quality - 0.15));
            }
          },
          'image/jpeg',
          quality,
        );
      };

      tryCompress(0.75);
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
    img.src = objectUrl;
  });
}

interface InzanMemberShowProps {
  client: Client;
  onClose: () => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => Promise<void>;
  payments: Payment[];
  attendances: Attendance[];
  users: User[];
  packages: Package[];
  currentUser: User | null;
  setUpgradeDialogClientId: (id: string | null) => void;
  setUpgradePkgName: (name: string) => void;
  setUpgradeStartDate: (date: string) => void;
}

type TabType = 
  | 'member_data'
  | 'package_data'
  | 'financials'
  | 'freezing'
  | 'activities'
  | 'files'
  | 'others'
  | 'comments'
  | 'transfers';

export function InzanMemberShow({
  client,
  onClose,
  onUpdateClient,
  payments,
  attendances,
  users,
  packages,
  currentUser,
  setUpgradeDialogClientId,
  setUpgradePkgName,
  setUpgradeStartDate
}: InzanMemberShowProps) {
  const [activeTab, setActiveTab] = useState<TabType>('member_data');
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Client>>({});
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoUploadStatus, setPhotoUploadStatus] = useState<string | null>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    setIsUploadingPhoto(true);
    setPhotoUploadStatus('Compressing...');
    try {
      const compressed = await compressImage(file);
      setPhotoUploadStatus('Uploading...');
      const fileRef = storageRef(storage, `member_photos/${client.id}`);
      await uploadBytes(fileRef, compressed, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(fileRef);
      
      await onUpdateClient(client.id, { photoURL: url });
      
      if (isEditing) {
        setFormData(prev => ({ ...prev, photoURL: url }));
      }
      
      toast.success('Member photo updated successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to upload member photo.');
    } finally {
      setIsUploadingPhoto(false);
      setPhotoUploadStatus(null);
    }
  };

  // Premium features state
  const [newComment, setNewComment] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);
  const [salesTransfers, setSalesTransfers] = useState<SalesTransferLog[]>([]);
  const [trainerTransfers, setTrainerTransfers] = useState<TrainerTransferLog[]>([]);

  // Fetch sales transfer logs
  React.useEffect(() => {
    const q = query(collection(db, 'salesTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setSalesTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as SalesTransferLog)));
    }, () => setSalesTransfers([]));
    return unsub;
  }, [client.id]);

  // Fetch trainer transfer logs
  React.useEffect(() => {
    const q2 = query(collection(db, 'trainerTransferLogs'), where('clientId', '==', client.id), orderBy('createdAt', 'desc'));
    const unsub2 = onSnapshot(q2, snap => {
      setTrainerTransfers(snap.docs.map(d => ({ id: d.id, ...d.data() } as TrainerTransferLog)));
    }, () => setTrainerTransfers([]));
    return unsub2;
  }, [client.id]);

  // Calculate unpaid
  const unpaidAmount = payments.filter(p => p.clientId === client.id && !p.deleted_at).reduce((sum, p) => sum + (p.amount - p.amount_paid), 0);

  // Add comment handler
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setIsSavingComment(true);
    try {
      const comments = [...(client.comments || []), {
        id: Math.random().toString(36).substring(7),
        text: newComment.trim(),
        date: new Date().toISOString(),
        author: currentUser?.name || 'System'
      }];
      await onUpdateClient(client.id, { comments });
      setNewComment('');
      toast.success('Comment added');
    } catch { toast.error('Failed to add comment'); }
    setIsSavingComment(false);
  };

  // Initialize edit form
  const startEditing = () => {
    setFormData({
      name: client.name || '',
      phone: client.phone || '',
      backupPhone: client.backupPhone || '',
      jobTitle: client.jobTitle || '',
      dateOfBirth: client.dateOfBirth ? client.dateOfBirth.split('T')[0] : '',
      nationalId: client.nationalId || '',
      email: client.email || '',
      city: client.city || '',
      salesRep: client.salesRep || '',
      assignedTo: client.assignedTo || '',
      weight: client.weight || undefined,
      height: client.height || undefined,
      activityLevel: client.activityLevel || undefined,
      fitnessTarget: client.fitnessTarget || undefined,
      address: client.address || '',
      legacyMemberId: client.legacyMemberId || '',
      gender: client.gender || undefined,
      typeOfClient: client.typeOfClient || '',
      guestSerial: client.guestSerial || '',
      advertisingSource: client.advertisingSource || '',
      barcode: client.barcode || '',
      nationality: client.nationality || '',
      emergencyContactName: client.emergencyContactName || '',
      civilStatus: client.civilStatus || '',
      cardId: client.cardId || '',
      civilianOrMilitary: client.civilianOrMilitary || 'None',
      photoURL: client.photoURL || ''
    });
    setIsEditing(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateClient(client.id, formData);
      setIsEditing(false);
    } catch (err: any) {
      alert(err?.message || 'Failed to update client profile');
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof Client, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Get mapped data
  const clientPayments = payments.filter(p => p.clientId === client.id);
  const clientAttendances = attendances.filter(a => a.clientId === client.id);

  // Helper for displaying fields
  const renderField = (
    label: string, 
    value: string | number | undefined | null, 
    fieldKey?: keyof Client, 
    type: 'text' | 'select' | 'number' | 'date' = 'text',
    options?: { value: string; label: string }[]
  ) => {
    if (isEditing && fieldKey) {
      if (type === 'select' && options) {
        return (
          <div className="flex flex-col space-y-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase">{label}</span>
            <select
              className="h-8 w-full rounded border border-input bg-background px-2 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              value={(formData[fieldKey] as string) || ''}
              onChange={e => handleInputChange(fieldKey, e.target.value)}
            >
              <option value="">Select...</option>
              {options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        );
      }
      return (
        <div className="flex flex-col space-y-1">
          <span className="text-[10px] text-muted-foreground font-semibold uppercase">{label}</span>
          <Input
            type={type}
            className="h-8 text-xs bg-background text-foreground"
            value={(formData[fieldKey] !== undefined ? formData[fieldKey] : '') as any}
            onChange={e => handleInputChange(fieldKey, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          />
        </div>
      );
    }

    return (
      <div className="text-left border-b border-border pb-1.5">
        <span className="text-[10px] text-muted-foreground font-medium block uppercase tracking-wider">{label}</span>
        <span className="text-xs font-semibold text-foreground">{value || '—'}</span>
      </div>
    );
  };

  const getAge = (dob: string | undefined) => {
    if (!dob) return '';
    try {
      const birthDate = new Date(dob);
      const difference = Date.now() - birthDate.getTime();
      const ageDate = new Date(difference);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);
      return ` (Age ${age})`;
    } catch {
      return '';
    }
  };

  const handleUpgradeClick = () => {
    setUpgradeDialogClientId(client.id);
    setUpgradePkgName('');
    setUpgradeStartDate(format(new Date(), 'yyyy-MM-dd'));
  };

  return (
    <div className="flex flex-col w-full h-[92vh] overflow-hidden bg-background text-foreground">
      {/* Redgits Style Top Navigation Bar */}
      <div className="bg-muted/30 px-6 py-2 flex items-center justify-between border-b border-border flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'member_data', label: 'Member Data' },
            { id: 'package_data', label: 'Package Data' },
            { id: 'financials', label: 'Financial Accounts List' },
            { id: 'freezing', label: 'Freezing List' },
            { id: 'activities', label: 'Activities' },
            { id: 'files', label: 'Files' },
            { id: 'others', label: 'Others' },
            { id: 'comments', label: 'Comments Log' },
            { id: 'transfers', label: 'Transfer History' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-3 py-1 text-xs font-bold rounded transition-all duration-150 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button 
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground font-black text-sm p-1 ml-4"
        >
          ✕
        </button>
      </div>

      {/* Blue Header Section */}
      <div className="bg-[#0284c7] px-6 py-2.5 flex items-center justify-between flex-shrink-0 text-white shadow-sm">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider">
          <UserIcon className="h-4 w-4" />
          <span>a Member Show</span>
        </div>
        <span className="text-xs opacity-90">Tenant: Inzan Athletics</span>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* View Header with Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-border pb-5">
          <div className="flex items-center gap-4 text-left">
            {client.photoURL ? (
              <img 
                src={client.photoURL} 
                alt={client.name} 
                className="h-14 w-14 rounded-full border-2 border-primary object-cover shrink-0"
              />
            ) : (
              <div className="h-14 w-14 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground shrink-0">
                <UserIcon className="h-7 w-7" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                View Member Info - ( {client.name} )
                {client.colorLabel && (
                  <span className={`inline-block h-3 w-3 rounded-full ml-1`} style={{ backgroundColor: client.colorLabel }} />
                )}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {client.phone} · {client.branch || 'No branch'} ·{' '}
                <Badge className={client.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/10 border border-rose-500/20'}>
                  {client.status}
                </Badge>
                {unpaidAmount > 0 && (
                  <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/10 border border-red-500/20 ml-2">
                    Unpaid: {unpaidAmount.toLocaleString()} LE
                  </Badge>
                )}
              </p>
            </div>
          </div>

          {/* Buttons bar */}
          <div className="flex flex-wrap gap-2 items-center">
            {/* Safety net toggle lock button */}
            <Button
              variant="outline"
              size="sm"
              onClick={isEditing ? () => setIsEditing(false) : startEditing}
              className={`h-8 font-bold text-xs ${
                isEditing 
                  ? 'bg-rose-600 hover:bg-rose-700 border-rose-500 text-white' 
                  : 'bg-background hover:bg-muted text-foreground'
              }`}
            >
              {isEditing ? (
                <>
                  <Lock className="h-3.5 w-3.5 mr-1" />
                  Lock / Cancel
                </>
              ) : (
                <>
                  <Unlock className="h-3.5 w-3.5 mr-1" />
                  Safety Net: Edit
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-teal-600 hover:bg-teal-700 border-teal-500 text-white font-bold text-xs"
              onClick={() => {
                const url = `${window.location.origin}/signup?ref=${client.referralCode || ''}`;
                navigator.clipboard.writeText(url);
                alert(`Referral Link copied: ${url}`);
              }}
            >
              Referral
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-indigo-600 hover:bg-indigo-700 border-indigo-500 text-white font-bold text-xs"
              onClick={() => {
                const cleanNum = client.phone.replace(/\D/g, '');
                window.open(`https://wa.me/${cleanNum.startsWith('0') ? '20' + cleanNum.substring(1) : cleanNum}`, '_blank');
              }}
            >
              Staff Whatsapp
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 bg-pink-600 hover:bg-pink-700 border-pink-500 text-white font-bold text-xs"
              onClick={() => alert('Sending package data via WhatsApp...')}
            >
              Send Package Data
            </Button>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'member_data' && (
          <div className="space-y-6">
            {/* Desktop Two-Column Sidebar Layout */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 text-left">
              {/* Left Column: Photo & Redgits ID */}
              <div className="md:col-span-1 space-y-4">
                {/* Profile Card */}
                <div className="border border-border rounded-xl p-4 bg-muted/10 flex flex-col items-center justify-center text-center">
                  <div className="relative group cursor-pointer mb-3">
                    {client.photoURL ? (
                      <img 
                        src={client.photoURL} 
                        alt={client.name} 
                        className="h-28 w-28 rounded-full border-2 border-primary object-cover"
                      />
                    ) : (
                      <div className="h-28 w-28 rounded-full bg-muted border flex items-center justify-center text-muted-foreground">
                        <UserIcon className="h-12 w-12" />
                      </div>
                    )}
                    
                    {/* Hover Overlay */}
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all duration-200 border border-primary/40"
                    >
                      {isUploadingPhoto ? (
                        <Loader2 className="h-6 w-6 text-white animate-spin" />
                      ) : (
                        <>
                          <Camera className="h-6 w-6 text-white mb-1" />
                          <span className="text-[9px] text-white/90 font-bold uppercase tracking-wider">Upload</span>
                        </>
                      )}
                    </div>
                  </div>

                  {photoUploadStatus && (
                    <span className="text-[10px] text-primary font-bold animate-pulse mb-2">{photoUploadStatus}</span>
                  )}

                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handlePhotoUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />

                  <h3 className="font-bold text-sm text-foreground">{client.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{client.phone}</p>
                  <Badge className="mt-2 bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/30">
                    {client.status}
                  </Badge>
                </div>

                {/* Redgits Member ID Badge */}
                <div className="border border-border rounded-xl p-4 bg-muted/20 text-center flex flex-col justify-center items-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Redgits Member ID</span>
                  <span className="text-3xl font-black text-rose-500 tracking-wider mt-1">{client.memberId || '—'}</span>
                </div>
              </div>

              {/* Right Column: Key-Value Field Grid */}
              <div className="md:col-span-3 border border-border p-6 rounded-xl bg-muted/5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-4 border-b border-border pb-2">Profile Details</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                  {renderField('Member Name', client.name, 'name')}
                  {renderField('Username', client.memberId, 'legacyNotes')}
                  {renderField('Mobile', client.phone, 'phone')}
                  {renderField('Phone', client.phone, 'phone')}
                  {renderField('Backup Mobile', client.backupPhone, 'backupPhone')}
                  {renderField('Job', client.jobTitle, 'jobTitle')}
                  {renderField('Birthday', (client.dateOfBirth ? format(new Date(client.dateOfBirth), 'yyyy-MM-dd') : '') + getAge(client.dateOfBirth), 'dateOfBirth', 'date')}
                  {renderField('National ID', client.nationalId, 'nationalId')}
                  {renderField('Email', client.email, 'email')}
                  {renderField('Area', client.city, 'city')}
                  {renderField('Sales Man', users.find(u => u.id === (formData.salesRep || client.salesRep))?.name || 'unassigned', 'salesRep', 'select', 
                    users.filter(u => ['crm_admin', 'super_admin', 'admin', 'manager', 'rep'].includes(u.role?.toLowerCase() || '')).map(u => ({ value: u.id, label: u.name }))
                  )}
                  {renderField('Trainer', users.find(u => u.id === (formData.assignedTo || client.assignedTo))?.name || 'unassigned', 'assignedTo', 'select',
                    users.filter(u => ['coach'].includes(u.role?.toLowerCase() || '')).map(u => ({ value: u.id, label: u.name }))
                  )}
                  {renderField('Weight (kg)', client.weight, 'weight', 'number')}
                  {renderField('Height (cm)', client.height, 'height', 'number')}
                  {renderField('Level', client.activityLevel, 'activityLevel', 'select', [
                    { value: 'Beginner', label: 'Beginner' },
                    { value: 'Intermediate', label: 'Intermediate' },
                    { value: 'Advanced', label: 'Advanced' }
                  ])}
                  {renderField('Goal', client.fitnessTarget, 'fitnessTarget', 'select', [
                    { value: 'Loss Weight', label: 'Loss Weight' },
                    { value: 'Build Muscle', label: 'Build Muscle' },
                    { value: 'Fitness', label: 'Fitness' },
                    { value: 'Rehab', label: 'Rehab' }
                  ])}
                  {renderField('Civil Status', client.civilStatus, 'civilStatus')}
                  {renderField('Status', client.status)}
                  {renderField('Address', client.address, 'address')}
                  {renderField('Member Code', client.legacyMemberId, 'legacyMemberId')}
                  {renderField('Emergency Contact', client.emergencyContactName, 'emergencyContactName')}
                  {renderField('Gender', client.gender, 'gender', 'select', [
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' }
                  ])}
                  {renderField('Type', client.typeOfClient, 'typeOfClient')}
                  {renderField('Guest Serial', client.guestSerial, 'guestSerial')}
                  {renderField('Advertising Source', client.advertisingSource, 'advertisingSource')}
                  {renderField('Bar-code / RFID', client.barcode, 'barcode')}
                  {renderField('Nationality', client.nationality, 'nationality')}
                  {renderField('Civilian/Military', client.civilianOrMilitary, 'civilianOrMilitary', 'select', [
                    { value: 'None', label: 'None' },
                    { value: 'Civilian', label: 'Civilian' },
                    { value: 'Military', label: 'Military' }
                  ])}
                  {renderField('Card ID', client.cardId, 'cardId')}
                  {renderField('Medical Info', client.medicalInfo, 'medicalInfo')}
                  {renderField('Preferred Time', client.preferredTime, 'preferredTime', 'select', [
                    { value: 'Morning', label: 'Morning' },
                    { value: 'Afternoon', label: 'Afternoon' },
                    { value: 'Evening', label: 'Evening' },
                    { value: 'Night', label: 'Night' }
                  ])}
                  {renderField('Color Label', client.colorLabel, 'colorLabel', 'select', [
                    { value: 'red', label: '🔴 Red' },
                    { value: 'green', label: '🟢 Green' },
                    { value: 'blue', label: '🔵 Blue' },
                    { value: 'purple', label: '🟣 Purple' },
                    { value: 'yellow', label: '🟡 Yellow' },
                    { value: 'orange', label: '🟠 Orange' },
                    { value: 'pink', label: '🩷 Pink' },
                    { value: 'brown', label: '🟤 Brown' }
                  ])}
                  {renderField('Created On', client.createdAt ? format(new Date(client.createdAt), 'yyyy-MM-dd HH:mm:ss') : '—')}
                </div>
              </div>
            </div>

            {/* Comments and Notes section */}
            <div className="border border-border p-6 rounded-xl bg-muted/10 text-left">
              <h4 className="text-xs font-bold uppercase tracking-widest text-primary mb-3">System & Staff Notes</h4>
              <div className="text-xs text-foreground bg-background p-4 rounded-lg border border-border leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line">
                {client.legacyNotes || 'No notes currently recorded on this profile.'}
              </div>
            </div>

            {/* Save / Cancel buttons for Edit Mode */}
            {isEditing && (
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="bg-sky-600 hover:bg-sky-700 text-white font-bold"
                >
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'package_data' && (
          <div className="space-y-6 text-left">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold uppercase text-primary">Package Status</h3>
              <div className="flex gap-2">
                <Button
                  onClick={handleUpgradeClick}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Membership (Renew)
                </Button>
                <Button
                  variant="outline"
                  className="text-xs h-8"
                >
                  Add Service
                </Button>
              </div>
            </div>

            {/* Active package summary */}
            {client.packages && client.packages.some(p => p.status === 'Active') ? (
              client.packages.filter(p => p.status === 'Active').map(pkg => (
                <div key={pkg.id} className="bg-muted/10 p-6 rounded-xl border-l-4 border-l-emerald-500 border border-border space-y-4 shadow-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">Active Package</span>
                      <h4 className="text-lg font-bold text-foreground mt-2">{pkg.packageName}</h4>
                    </div>
                    <span className="text-2xl font-black text-emerald-500">
                      {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} Sessions` : '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-border text-xs">
                    <div>
                      <span className="text-muted-foreground block font-medium">Start Date:</span>
                      <span className="font-bold text-foreground">{pkg.startDate ? format(new Date(pkg.startDate), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Expiry Date:</span>
                      <span className="font-bold text-foreground">{pkg.endDate ? format(new Date(pkg.endDate), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Created On:</span>
                      <span className="font-bold text-foreground">{client.createdAt ? format(new Date(client.createdAt), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block font-medium">Status:</span>
                      <span className="font-bold text-emerald-500 uppercase">{pkg.status}</span>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                    <Button
                      size="sm"
                      onClick={handleUpgradeClick}
                      className="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs h-7"
                    >
                      Change Package (Renew)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                    >
                      Transfer Package
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                    >
                      Freezing
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-rose-500" />
                <span>No active membership package found on this profile.</span>
                <Button
                  size="sm"
                  onClick={handleUpgradeClick}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs mt-2"
                >
                  Purchase a Package
                </Button>
              </div>
            )}

            {/* Historical Packages Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Package History</h4>
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/20 border-b border-border">
                    <TableRow>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Package</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Start</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Expires</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">Sessions</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.packages && client.packages.length > 0 ? (
                      [...client.packages]
                        .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
                        .map(pkg => (
                          <TableRow key={pkg.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                            <TableCell className="py-3 px-4 text-xs font-medium text-foreground">{pkg.packageName}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-muted-foreground">{pkg.startDate ? format(new Date(pkg.startDate), 'dd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-muted-foreground">{pkg.endDate ? format(new Date(pkg.endDate), 'dd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-muted-foreground text-center">
                              {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} / ${pkg.sessionsTotal ?? '?'}` : '—'}
                            </TableCell>
                            <TableCell className="py-3 px-4 text-center">
                              <Badge className={
                                pkg.status === 'Active' 
                                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' 
                                  : pkg.status === 'Expired' 
                                  ? 'bg-muted text-muted-foreground border border-border' 
                                  : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                              }>
                                {pkg.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                          No historical package records.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold uppercase text-primary">Financial Accounts / Payments</h3>
              <Badge variant="secondary" className="border-none">
                {clientPayments.length} entries
              </Badge>
            </div>

            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Date</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Amount</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Method</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Sales Rep</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPayments.length > 0 ? (
                    [...clientPayments]
                      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                      .map(p => (
                        <TableRow key={p.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{p.created_at ? format(new Date(p.created_at), 'dd MMM yyyy HH:mm') : '—'}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-bold text-emerald-500">{p.amount} LE</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{p.method}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                            {users.find(u => u.id === p.sales_rep_id)?.name || 'unassigned'}
                          </TableCell>
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">
                            {p.recordedBy || 'System'}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">
                        No financial records found for this member.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'activities' && (
          <div className="space-y-4 text-left">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-sm font-bold uppercase text-primary">Activity & Check-in History</h3>
              <Badge variant="secondary" className="border-none">
                {clientAttendances.length} entries
              </Badge>
            </div>

            <div className="rounded-xl border border-border bg-background overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/20 border-b border-border">
                  <TableRow>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Timestamp</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Activity / Class</TableHead>
                    <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientAttendances.length > 0 ? (
                    [...clientAttendances]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(a => (
                        <TableRow key={a.id} className="hover:bg-muted/50 border-b border-border/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-muted-foreground">{format(new Date(a.date), 'dd MMM yyyy HH:mm:ss')}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-semibold text-foreground">{a.packageName || 'Attendance Check-in'}</TableCell>
                          <TableCell className="py-3 px-4 text-center">
                            <Badge className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px]">
                              Success
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-xs text-muted-foreground">
                        No activity records found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {activeTab === 'freezing' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Freezing Logs</h3>
            <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
              No active or historical package freezing requests recorded.
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Uploaded Documents</h3>
            {client.documents && client.documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-left">
                {client.documents.map(doc => (
                  <div key={doc.id} className="bg-muted/10 p-4 rounded-xl border border-border flex items-center justify-between gap-3 hover:border-border/80 transition-colors">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="h-5 w-5 text-primary shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-foreground truncate">{doc.name}</p>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(doc.uploadDate), 'dd MMM yyyy')}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(doc.url, '_blank')}
                      className="text-xs text-primary hover:text-primary/80"
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
                No files or contracts uploaded for this member.
              </div>
            )}
          </div>
        )}

        {activeTab === 'others' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Other Information</h3>
            <div className="bg-muted/5 p-6 rounded-xl border border-border space-y-3 text-xs">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Barcode/Card ID:</span>
                <span className="font-bold text-foreground">{client.barcode || client.cardId || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Emergency Contact:</span>
                <span className="font-bold text-foreground">{client.emergencyContactName || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-muted-foreground">Advertising Source:</span>
                <span className="font-bold text-foreground">{client.advertisingSource || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lead Source:</span>
                <span className="font-bold text-foreground">{client.source || '—'}</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3">Comments & Notes Timeline</h3>
            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="text-xs min-h-[60px]"
              />
              <Button
                onClick={handleAddComment}
                disabled={isSavingComment || !newComment.trim()}
                className="bg-primary text-primary-foreground font-bold text-xs h-auto"
              >
                {isSavingComment ? '...' : 'Add'}
              </Button>
            </div>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {client.comments && client.comments.length > 0 ? (
                [...client.comments].reverse().map((c, i) => (
                  <div key={c.id || i} className="bg-muted/10 border border-border rounded-lg p-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-foreground">#{client.comments!.length - i} — {c.author}</span>
                      <span className="text-[10px] text-muted-foreground">{c.date ? format(new Date(c.date), 'dd MMM yyyy HH:mm') : '—'}</span>
                    </div>
                    <p className="text-xs text-foreground/80">{c.text}</p>
                  </div>
                ))
              ) : (
                <div className="bg-muted/5 p-8 rounded-xl border border-dashed border-border text-center text-muted-foreground text-xs">
                  No comments recorded.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'transfers' && (
          <div className="space-y-6 text-left">
            <div>
              <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3 mb-3">Sales Rep Transfer History</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/20 border-b border-border">
                    <TableRow>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">#</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">From Sales</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">To Sales</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesTransfers.length > 0 ? salesTransfers.map((t, i) => (
                      <TableRow key={t.id} className="hover:bg-muted/50 border-b border-border/50">
                        <TableCell className="py-3 px-4 text-xs">{i + 1}</TableCell>
                        <TableCell className="py-3 px-4 text-xs">{t.fromSalesName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs font-bold text-foreground">{t.toSalesName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdByName || t.createdBy}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdAt ? format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm') : '—'}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No sales transfer records.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase text-primary border-b border-border pb-3 mb-3">Trainer Transfer History</h3>
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/20 border-b border-border">
                    <TableRow>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">#</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">From Trainer</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">To Trainer</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                      <TableHead className="text-muted-foreground text-[10px] uppercase font-bold py-3 px-4">Created On</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trainerTransfers.length > 0 ? trainerTransfers.map((t, i) => (
                      <TableRow key={t.id} className="hover:bg-muted/50 border-b border-border/50">
                        <TableCell className="py-3 px-4 text-xs">{i + 1}</TableCell>
                        <TableCell className="py-3 px-4 text-xs">{t.fromTrainerName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs font-bold text-foreground">{t.toTrainerName}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdByName || t.createdBy}</TableCell>
                        <TableCell className="py-3 px-4 text-xs text-muted-foreground">{t.createdAt ? format(new Date(t.createdAt), 'yyyy-MM-dd HH:mm') : '—'}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow><TableCell colSpan={5} className="py-6 text-center text-xs text-muted-foreground">No trainer transfer records.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
