import React, { useState } from 'react';
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
  Calendar, 
  MessageSquare, 
  FileText, 
  ArrowUpDown, 
  DollarSign, 
  Activity, 
  Users, 
  Plus, 
  Phone, 
  Mail, 
  AlertCircle,
  FileCheck,
  History
} from 'lucide-react';
import { format } from 'date-fns';

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
  | 'others';

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
      civilianOrMilitary: client.civilianOrMilitary || 'None'
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
            <span className="text-[11px] text-muted-foreground font-semibold uppercase">{label}</span>
            <select
              className="h-8 w-full rounded border border-input bg-background px-2 py-0 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
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
          <span className="text-[11px] text-muted-foreground font-semibold uppercase">{label}</span>
          <Input
            type={type}
            className="h-8 text-xs bg-background"
            value={(formData[fieldKey] !== undefined ? formData[fieldKey] : '') as any}
            onChange={e => handleInputChange(fieldKey, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          />
        </div>
      );
    }

    return (
      <div className="text-left border-b border-muted/30 pb-1.5">
        <span className="text-[11px] text-muted-foreground font-medium block uppercase tracking-wider">{label}</span>
        <span className="text-xs font-semibold text-foreground/90">{value || '—'}</span>
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
      return ` ( Age is ${age} )`;
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
    <div className="flex flex-col w-full h-[90vh] overflow-hidden bg-slate-900 text-slate-100 rounded-2xl shadow-2xl">
      {/* Redgits Style Top Navigation Bar */}
      <div className="bg-slate-950 px-6 py-2.5 flex items-center justify-between border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {[
            { id: 'member_data', label: 'Member Data' },
            { id: 'package_data', label: 'Package Data' },
            { id: 'financials', label: 'Financial Accounts List' },
            { id: 'freezing', label: 'Freezing List' },
            { id: 'activities', label: 'Activities' },
            { id: 'files', label: 'Files' },
            { id: 'others', label: 'Others' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-3 py-1.5 text-xs font-bold rounded transition-all duration-150 whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-slate-200 text-slate-900 shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button 
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 font-black text-sm p-1 ml-4"
        >
          ✕
        </button>
      </div>

      {/* Blue Header Section */}
      <div className="bg-sky-600 px-6 py-3 flex items-center justify-between flex-shrink-0 text-white shadow-md">
        <div className="flex items-center gap-2 font-bold text-sm uppercase tracking-wide">
          <UserIcon className="h-4 w-4" />
          <span>a Member Show</span>
        </div>
        <span className="text-xs opacity-75">Tenant: Inzan Athletics</span>
      </div>

      {/* Main Container */}
      <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
        {/* View Header with Action Buttons */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-5">
          <div className="flex items-center gap-4 text-left">
            {client.photoURL ? (
              <img 
                src={client.photoURL} 
                alt={client.name} 
                className="h-16 w-16 rounded-full border-2 border-sky-500 object-cover"
              />
            ) : (
              <div className="h-16 w-16 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center text-slate-400 shrink-0">
                <UserIcon className="h-8 w-8" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                View Member Info - ( {client.name} )
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {client.phone} · {client.branch || 'No branch'} ·{' '}
                <Badge className={client.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20' : 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/20'}>
                  {client.status}
                </Badge>
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
                  : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
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
              onClick={() => alert(`Referral Link: ${window.location.origin}/signup?ref=${client.referralCode || ''}`)}
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
              onClick={() => alert('Sending package data via WhatsApp/Email...')}
            >
              Send Package Data
            </Button>
          </div>
        </div>

        {/* Tab Contents */}
        {activeTab === 'member_data' && (
          <div className="space-y-6 text-left">
            {/* Massive Member ID label */}
            <div className="flex justify-between items-center bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span className="text-sm font-semibold text-slate-400">Redgits Member ID:</span>
              <span className="text-4xl font-black text-rose-500 tracking-wider">
                {client.memberId || '—'}
              </span>
            </div>

            {/* 4-column key-value grid */}
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 shadow-inner">
              <h3 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-4 border-b border-slate-800 pb-2">Profile Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
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
                {renderField('Sales Man', client.salesName || 'unassigned', 'salesRep', 'select', 
                  users.filter(u => ['crm_admin', 'super_admin', 'admin', 'manager', 'rep'].includes(u.role?.toLowerCase() || '')).map(u => ({ value: u.id, label: u.name }))
                )}
                {renderField('Trainer', users.find(u => u.id === client.assignedTo)?.name || 'unassigned', 'assignedTo', 'select',
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
                {renderField('Created On', client.createdAt ? format(new Date(client.createdAt), 'yyyy-MM-dd HH:mm:ss') : '—')}
              </div>
            </div>

            {/* Comments and Notes section */}
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-widest text-sky-400 mb-3">System & Staff Notes</h4>
              <div className="text-xs text-slate-300 bg-slate-900/60 p-4 rounded-lg border border-slate-800 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-line">
                {client.legacyNotes || 'No notes currently recorded on this profile.'}
              </div>
            </div>

            {/* Save / Cancel buttons for Edit Mode */}
            {isEditing && (
              <div className="flex gap-3 justify-end pt-2">
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300"
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
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-sky-400">Package Status</h3>
              <div className="flex gap-2">
                {/* Upgrade / Renewal triggering */}
                <Button
                  onClick={handleUpgradeClick}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-8"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Membership (Renew)
                </Button>
                <Button
                  variant="outline"
                  className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 text-xs h-8"
                >
                  Add Service
                </Button>
              </div>
            </div>

            {/* Active package summary */}
            {client.packages && client.packages.some(p => p.status === 'Active') ? (
              client.packages.filter(p => p.status === 'Active').map(pkg => (
                <div key={pkg.id} className="bg-slate-950 p-6 rounded-xl border-l-4 border-l-emerald-500 border border-slate-800 space-y-4 shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded uppercase">Active Package</span>
                      <h4 className="text-lg font-bold text-slate-100 mt-2">{pkg.packageName}</h4>
                    </div>
                    <span className="text-2xl font-black text-emerald-400">
                      {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} Sessions` : '—'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-slate-800/60 text-xs">
                    <div>
                      <span className="text-slate-400 block font-medium">Start Date:</span>
                      <span className="font-bold text-slate-200">{pkg.startDate ? format(new Date(pkg.startDate), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Expiry Date:</span>
                      <span className="font-bold text-slate-200">{pkg.endDate ? format(new Date(pkg.endDate), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Created On:</span>
                      <span className="font-bold text-slate-200">{client.createdAt ? format(new Date(client.createdAt), 'dd MMM yyyy') : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-medium">Status:</span>
                      <span className="font-bold text-emerald-400 uppercase">{pkg.status}</span>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800/60">
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
                      className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 text-xs h-7"
                    >
                      Transfer Package
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200 text-xs h-7"
                    >
                      Freezing
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-slate-950 p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-400 text-xs flex flex-col items-center justify-center gap-2">
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
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400">Package History</h4>
              <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-900 border-b border-slate-800">
                    <TableRow>
                      <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Package</TableHead>
                      <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Start</TableHead>
                      <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Expires</TableHead>
                      <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4 text-center">Sessions</TableHead>
                      <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {client.packages && client.packages.length > 0 ? (
                      [...client.packages]
                        .sort((a, b) => new Date(b.startDate || 0).getTime() - new Date(a.startDate || 0).getTime())
                        .map(pkg => (
                          <TableRow key={pkg.id} className="hover:bg-slate-900/60 border-b border-slate-800/50 transition-colors">
                            <TableCell className="py-3 px-4 text-xs font-medium text-slate-200">{pkg.packageName}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-slate-300">{pkg.startDate ? format(new Date(pkg.startDate), 'dd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-slate-300">{pkg.endDate ? format(new Date(pkg.endDate), 'dd MMM yyyy') : '—'}</TableCell>
                            <TableCell className="py-3 px-4 text-xs text-slate-300 text-center">
                              {(pkg.sessionsRemaining as any) === 'unlimited' ? '∞' : typeof pkg.sessionsRemaining === 'number' ? `${pkg.sessionsRemaining} / ${pkg.sessionsTotal ?? '?'}` : '—'}
                            </TableCell>
                            <TableCell className="py-3 px-4 text-center">
                              <Badge className={
                                pkg.status === 'Active' 
                                  ? 'bg-emerald-500/20 text-emerald-400' 
                                  : pkg.status === 'Expired' 
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700' 
                                  : 'bg-rose-500/20 text-rose-400'
                              }>
                                {pkg.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="py-6 text-center text-xs text-slate-500">
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
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-sky-400">Financial Accounts / Payments</h3>
              <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none">
                {clientPayments.length} entries
              </Badge>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900 border-b border-slate-800">
                  <TableRow>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Date</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Amount</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Method</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Sales Rep</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPayments.length > 0 ? (
                    [...clientPayments]
                      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                      .map(p => (
                        <TableRow key={p.id} className="hover:bg-slate-900/60 border-b border-slate-800/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-slate-300">{p.created_at ? format(new Date(p.created_at), 'dd MMM yyyy HH:mm') : '—'}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-bold text-emerald-400">{p.amount} LE</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-slate-300">{p.method}</TableCell>
                          <TableCell className="py-3 px-4 text-xs text-slate-300">
                            {users.find(u => u.id === p.sales_rep_id)?.name || 'unassigned'}
                          </TableCell>
                          <TableCell className="py-3 px-4 text-xs text-slate-300">
                            {p.recordedBy || 'System'}
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-xs text-slate-500">
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
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold uppercase text-sky-400">Activity & Check-in History</h3>
              <Badge variant="secondary" className="bg-slate-800 text-slate-300 border-none">
                {clientAttendances.length} entries
              </Badge>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-900 border-b border-slate-800">
                  <TableRow>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Timestamp</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4">Activity / Class</TableHead>
                    <TableHead className="text-slate-400 text-[10px] uppercase font-bold py-3 px-4 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientAttendances.length > 0 ? (
                    [...clientAttendances]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map(a => (
                        <TableRow key={a.id} className="hover:bg-slate-900/60 border-b border-slate-800/50 transition-colors">
                          <TableCell className="py-3 px-4 text-xs text-slate-300">{format(new Date(a.date), 'dd MMM yyyy HH:mm:ss')}</TableCell>
                          <TableCell className="py-3 px-4 text-xs font-semibold text-slate-200">{a.packageName || 'Attendance Check-in'}</TableCell>
                          <TableCell className="py-3 px-4 text-center">
                            <Badge className="bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 text-[10px]">
                              Success
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-xs text-slate-500">
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
            <h3 className="text-sm font-bold uppercase text-sky-400 border-b border-slate-800 pb-3">Freezing Logs</h3>
            <div className="bg-slate-950 p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
              No active or historical package freezing requests recorded.
            </div>
          </div>
        )}

        {activeTab === 'files' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-sky-400 border-b border-slate-800 pb-3">Uploaded Documents</h3>
            {client.documents && client.documents.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {client.documents.map(doc => (
                  <div key={doc.id} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-colors">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <FileCheck className="h-5 w-5 text-sky-400 shrink-0" />
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-200 truncate">{doc.name}</p>
                        <span className="text-[10px] text-slate-400">{format(new Date(doc.uploadDate), 'dd MMM yyyy')}</span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => window.open(doc.url, '_blank')}
                      className="text-xs text-sky-400 hover:text-sky-300"
                    >
                      View
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-950 p-8 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                No files or contracts uploaded for this member.
              </div>
            )}
          </div>
        )}

        {activeTab === 'others' && (
          <div className="space-y-4 text-left">
            <h3 className="text-sm font-bold uppercase text-sky-400 border-b border-slate-800 pb-3">Other Information</h3>
            <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Barcode/Card ID:</span>
                <span className="font-bold text-slate-200">{client.barcode || client.cardId || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Emergency Contact:</span>
                <span className="font-bold text-slate-200">{client.emergencyContactName || '—'}</span>
              </div>
              <div className="flex justify-between border-b border-slate-800 pb-2">
                <span className="text-slate-400">Advertising Source:</span>
                <span className="font-bold text-slate-200">{client.advertisingSource || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Lead Source:</span>
                <span className="font-bold text-slate-200">{client.source || '—'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
