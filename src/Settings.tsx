import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from './context';
import { useAuth } from './contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { storage, db, auth } from './firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Save, UserCircle2, Building2, Users, Package, AlertTriangle, ShieldAlert, Trash2, Dumbbell, Lock, Download, Upload, MessageSquare, Send, KeyRound, Eye, EyeOff, CheckCircle2, Megaphone, Coins, Activity, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import UsersManagement from './Users';
import Packages from './Packages';
import Coaches from './Coaches';
import MyProfile from './components/MyProfile';
import CommissionReport from './components/CommissionReport';
import { BadgePercent, QrCode, Printer, MapPin, Plus, Trophy } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Branch } from './types';
import { exportDatabaseToJson, restoreDatabaseFromJson, mergeBackupRecords } from './services/backupService';
import type { BackupProgressCallback } from './services/backupService';
import { generateBackupStationHTML } from './services/backupStationGenerator';
import { getTenantId } from './firebase';
import { downloadFile } from './utils/download';
import AdminPointsManager from './components/AdminPointsManager';
import AdminActivityFeed from './components/AdminActivityFeed';
import AdminGamificationManager from './components/AdminGamificationManager';
import AdminStorefrontManager from './components/AdminStorefrontManager';

export default function Settings() {
  const { branding, updateBranding, currentUser, wipeSystem, canAccessSettings, branches, updateBranches } = useAppContext();
  const { changeMyPassword, runExistingUsersMigration } = useAuth();
  const [companyName, setCompanyName] = useState(branding.companyName);
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl);
  const [currencyCode, setCurrencyCode] = useState(branding.currencyCode || 'EGP');
  const [currencySymbol, setCurrencySymbol] = useState(branding.currencySymbol || 'LE');
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadStatus, setLogoUploadStatus] = useState<string | null>(null);
  const [kioskPin, setKioskPin] = useState(branding.kioskPin || '');
  const [dailyPin, setDailyPin] = useState(branding.dailyCheckinPin || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPin, setIsSavingPin] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [selectedAccent, setSelectedAccent] = React.useState(branding.brandAccentColor ?? '#1a1a1a');

  // Change password state
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdStatus, setPwdStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  // Migration state
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<{ membersMigrated: number; coachesMigrated: number; errors: string[] } | null>(null);

  const handleRunMigration = async () => {
    setIsMigrating(true);
    setMigrationResult(null);
    try {
      const result = await runExistingUsersMigration();
      setMigrationResult(result);
    } catch (err: any) {
      setMigrationResult({ membersMigrated: 0, coachesMigrated: 0, errors: [err.message || String(err)] });
    } finally {
      setIsMigrating(false);
    }
  };

  const [isWipeDialogOpen, setIsWipeDialogOpen] = useState(false);
  const [wipeStep, setWipeStep] = useState(1);
  const [wipeConfirmText, setWipeConfirmText] = useState('');
  const [isWiping, setIsWiping] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ step: string; percent: number } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Backup-station import state ──
  const [backupImportFile, setBackupImportFile] = React.useState<File | null>(null);
  const [backupImportPreview, setBackupImportPreview] = React.useState<{ checkins: number; payments: number; leads: number } | null>(null);
  const [backupImportLoading, setBackupImportLoading] = React.useState(false);
  const [backupImportResult, setBackupImportResult] = React.useState<string | null>(null);

  const [testSmsPhone, setTestSmsPhone] = useState('+201000680580');
  const [testSmsMessage, setTestSmsMessage] = useState('Test SMS from mitrixogymcrm');
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsStatus, setSmsStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canWipe = canAccessSettings || currentUser?.email === 'michaelmitry13@gmail.com';

  // ── Announcements State ──
  interface AnnouncementRecord {
    id: string;
    title: string;
    body: string;
    imageUrl: string;
    linkUrl: string;
    priority: number;
    startDate: string;
    endDate: string;
    createdBy: string;
  }
  const [announcements, setAnnouncements] = useState<AnnouncementRecord[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '', body: '', imageUrl: '', linkUrl: '', priority: 1,
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);

  const getAuthHeaders = async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchAnnouncements = async () => {
    setLoadingAnnouncements(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/announcements', { headers });
      if (response.ok) {
        const data = await response.json();
        const list = data.announcements || [];
        list.sort((a: any, b: any) => (b.priority || 0) - (a.priority || 0));
        setAnnouncements(list);
      }
    } catch (err) {
      console.warn('Could not load announcements:', err);
    } finally {
      setLoadingAnnouncements(false);
    }
  };

  useEffect(() => {
    if (canAccessSettings) fetchAnnouncements();
  }, [canAccessSettings]);

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title.trim()) return;
    setIsSavingAnnouncement(true);
    try {
      const data = {
        title: announcementForm.title.trim(),
        body: announcementForm.body.trim(),
        imageUrl: announcementForm.imageUrl.trim(),
        linkUrl: announcementForm.linkUrl.trim(),
        priority: Number(announcementForm.priority) || 1,
        startDate: announcementForm.startDate,
        endDate: announcementForm.endDate,
        createdBy: currentUser?.email || 'admin',
      };
      
      const headers = await getAuthHeaders();
      
      if (editingAnnouncementId) {
        await fetch('/api/announcements/update', {
          method: 'POST',
          headers,
          body: JSON.stringify({ id: editingAnnouncementId, updates: data })
        });
        setEditingAnnouncementId(null);
      } else {
        await fetch('/api/announcements/add', {
          method: 'POST',
          headers,
          body: JSON.stringify({ announcement: data })
        });
      }
      setAnnouncementForm({ title: '', body: '', imageUrl: '', linkUrl: '', priority: 1, startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] });
      await fetchAnnouncements();
    } catch (err) {
      console.error('Failed to save announcement:', err);
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/announcements/delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id })
      });
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (err) {
      console.error('Failed to delete announcement:', err);
    }
  };

  const handleEditAnnouncement = (a: AnnouncementRecord) => {
    setEditingAnnouncementId(a.id);
    setAnnouncementForm({
      title: a.title, body: a.body, imageUrl: a.imageUrl || '', linkUrl: a.linkUrl || '',
      priority: a.priority || 1, startDate: a.startDate, endDate: a.endDate
    });
  };

  React.useEffect(() => {
    setCompanyName(branding.companyName);
    setLogoUrl(branding.logoUrl);
    setKioskPin(branding.kioskPin || '');
    setDailyPin(branding.dailyCheckinPin || '');
    setCurrencyCode(branding.currencyCode || 'EGP');
    setCurrencySymbol(branding.currencySymbol || 'LE');
  }, [branding]);

  React.useEffect(() => {
    setSelectedAccent(branding.brandAccentColor ?? '#1a1a1a');
  }, [branding.brandAccentColor]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setLogoUploadStatus('Please select an image file.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setLogoUploadStatus('Logo must be under 3 MB.');
      return;
    }

    setIsUploadingLogo(true);
    setLogoUploadStatus(null);
    try {
      const extension = file.name.split('.').pop() || 'png';
      const fileRef = storageRef(storage, `branding/logo-${Date.now()}.${extension}`);
      await uploadBytes(fileRef, file, { contentType: file.type });
      const url = await getDownloadURL(fileRef);
      setLogoUrl(url);
      setLogoUploadStatus('Logo uploaded successfully!');
    } catch (err: any) {
      console.error(err);
      setLogoUploadStatus('Upload failed. Please try again.');
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateBranding({ companyName, logoUrl, currencyCode, currencySymbol });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePin = async () => {
    setIsSavingPin(true);
    try {
      await updateBranding({ kioskPin, dailyCheckinPin: dailyPin });
    } finally {
      setIsSavingPin(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportProgress({ step: 'Starting…', percent: 0 });
    const onProgress: BackupProgressCallback = (step, percent) => {
      setExportProgress({ step, percent });
    };
    try {
      await exportDatabaseToJson(onProgress);
    } finally {
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(null);
      }, 800);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreStatus(null);
    setIsRestoring(true);
    try {
      const text = await file.text();
      await restoreDatabaseFromJson(text);
      setRestoreStatus({ type: 'success', message: `Restore complete from "${file.name}".` });
    } catch (err) {
      setRestoreStatus({ type: 'error', message: `Restore failed: ${(err as Error).message}` });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleBackupFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBackupImportFile(file);
    setBackupImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setBackupImportPreview({
        checkins: (parsed.checkins ?? []).length,
        payments: (parsed.payments ?? []).length,
        leads: (parsed.leads ?? []).length,
      });
    } catch {
      setBackupImportPreview(null);
    }
  };

  const handleMergeBackup = async () => {
    if (!backupImportFile) return;
    setBackupImportLoading(true);
    setBackupImportResult(null);
    try {
      const text = await backupImportFile.text();
      const result = await mergeBackupRecords(text);
      setBackupImportResult(`✅ Imported: ${result.checkins} check-ins, ${result.payments} payments, ${result.leads} leads`);
      setBackupImportFile(null);
      setBackupImportPreview(null);
    } catch (err) {
      setBackupImportResult('❌ Import failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setBackupImportLoading(false);
    }
  };

  const appUrl = window.location.origin;

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) return;
    if (branches.includes(newBranchName.trim())) {
      alert("Branch already exists");
      return;
    }
    await updateBranches([...branches, newBranchName.trim()]);
    setNewBranchName('');
  };

  const handleRemoveBranch = async (branchToRemove: string) => {
    if (branches.length <= 1) {
      alert("You must have at least one branch.");
      return;
    }
    const confirm = window.confirm(`Are you sure you want to remove ${branchToRemove}?`);
    if (!confirm) return;
    await updateBranches(branches.filter(b => b !== branchToRemove));
  };

  const handleSendTestSms = async () => {
    setSmsStatus(null);
    setIsSendingSms(true);
    try {
      const fnUrl = 'https://sendtestsms-rqxxytxffq-uc.a.run.app';
      const response = await fetch(fnUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testSmsPhone, message: testSmsMessage })
      });
      const data = await response.json();
      if (response.ok) {
        setSmsStatus({ type: 'success', message: `SMS sent successfully to ${testSmsPhone}` });
      } else {
        setSmsStatus({ type: 'error', message: `Failed: ${data.error}` });
      }
    } catch (err) {
      setSmsStatus({ type: 'error', message: `Error: ${(err as Error).message}` });
    } finally {
      setIsSendingSms(false);
    }
  };

  const handlePrintQR = (branch: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const qrUrl = `${appUrl}/checkin?branch=${encodeURIComponent(branch)}`;

    printWindow.document.write(`
      <html>
        <head>
          <title>Check-in QR - ${branch}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; items-center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
            .container { border: 2px solid #000; padding: 40px; border-radius: 20px; }
            h1 { font-size: 48px; margin-bottom: 10px; }
            h2 { font-size: 24px; color: #666; margin-bottom: 40px; }
            .footer { margin-top: 40px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <img src="${branding.logoUrl}" style="max-height: 80px; margin-bottom: 20px;" />
            <h1>Scan to Check-in</h1>
            <h2>${branch} Branch</h2>
            <div id="qr-code"></div>
            <p class="footer">Please ask the front desk for today's PIN</p>
          </div>
          <script src="https://cdn.jsdelivr.net/npm/qrcode@1.5.1/build/qrcode.min.js"></script>
          <script>
            QRCode.toCanvas(document.getElementById('qr-code'), '${qrUrl}', { width: 400 }, function (error) {
              if (error) console.error(error);
              window.print();
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleChangePassword = async () => {
    setPwdStatus(null);
    if (!newPwd || newPwd.length < 8) {
      setPwdStatus({ type: 'error', message: 'New password must be at least 8 characters.' });
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdStatus({ type: 'error', message: 'New passwords do not match.' });
      return;
    }
    setIsChangingPwd(true);
    try {
      await changeMyPassword(currentPwd, newPwd);
      setPwdStatus({ type: 'success', message: 'Password updated successfully! Use your new password next time you log in.' });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      const msg = err?.code === 'auth/wrong-password' || err?.code === 'auth/invalid-credential'
        ? 'Current password is incorrect.'
        : err?.code === 'auth/too-many-requests'
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : err?.message || 'Failed to change password.';
      setPwdStatus({ type: 'error', message: msg });
    } finally {
      setIsChangingPwd(false);
    }
  };

  const ChangePasswordCard = (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          Change My Password
        </CardTitle>
        <CardDescription>
          Update your login password. Enter your current password first to verify it's you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <strong>Default password?</strong> If you were just added to the system, your current password is <code className="font-mono bg-amber-100 px-1 rounded">12345678</code>. Change it here.
        </div>
        <div className="space-y-2">
          <Label htmlFor="currentPwd">Current Password</Label>
          <div className="relative">
            <input
              id="currentPwd"
              type={showPwd ? 'text' : 'password'}
              value={currentPwd}
              onChange={e => setCurrentPwd(e.target.value)}
              placeholder="Enter your current password"
              className="w-full px-3 py-2 border rounded-md text-sm pr-10"
            />
            <button type="button" onClick={() => setShowPwd(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="newPwd">New Password</Label>
          <input
            id="newPwd"
            type={showPwd ? 'text' : 'password'}
            value={newPwd}
            onChange={e => setNewPwd(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPwd">Confirm New Password</Label>
          <input
            id="confirmPwd"
            type={showPwd ? 'text' : 'password'}
            value={confirmPwd}
            onChange={e => setConfirmPwd(e.target.value)}
            placeholder="Repeat new password"
            className="w-full px-3 py-2 border rounded-md text-sm"
          />
        </div>
        <Button className="w-full" onClick={handleChangePassword} disabled={isChangingPwd || !currentPwd || !newPwd || !confirmPwd}>
          {isChangingPwd ? 'Updating...' : 'Update Password'}
        </Button>
        {pwdStatus && (
          <p className={`text-sm font-medium flex items-center gap-2 ${
            pwdStatus.type === 'success' ? 'text-green-600' : 'text-destructive'
          }`}>
            {pwdStatus.type === 'success' && <CheckCircle2 className="h-4 w-4" />}
            {pwdStatus.message}
          </p>
        )}
      </CardContent>
    </Card>
  );

  if (!canAccessSettings) {
    return (
      <div className="space-y-6 max-w-md mx-auto py-8">
        <h2 className="text-2xl font-bold tracking-tight">My Account</h2>
        {ChangePasswordCard}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      </div>

      <Tabs defaultValue="my-profile" className="space-y-6">
        <TabsList className="bg-muted/50 p-1 w-full justify-start overflow-x-auto flex-nowrap h-auto gap-1 no-scrollbar">
          <TabsTrigger value="my-profile" className="flex items-center gap-2 whitespace-nowrap">
            <UserCircle2 className="h-4 w-4" />
            My Profile
          </TabsTrigger>
          <TabsTrigger value="branding" className="flex items-center gap-2 whitespace-nowrap">
            <Building2 className="h-4 w-4" />
            Branding
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2 whitespace-nowrap">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="branches" className="flex items-center gap-2 whitespace-nowrap">
            <MapPin className="h-4 w-4" />
            Branches
          </TabsTrigger>
          <TabsTrigger value="packages" className="flex items-center gap-2 whitespace-nowrap">
            <Package className="h-4 w-4" />
            Packages
          </TabsTrigger>
          <TabsTrigger value="coaches" className="flex items-center gap-2 whitespace-nowrap">
            <Dumbbell className="h-4 w-4" />
            Coaches
          </TabsTrigger>
          <TabsTrigger value="commission" className="flex items-center gap-2 whitespace-nowrap">
            <BadgePercent className="h-4 w-4" />
            Commission
          </TabsTrigger>
          <TabsTrigger value="backup" className="flex items-center gap-2 whitespace-nowrap">
            <Download className="h-4 w-4" />
            Backup
          </TabsTrigger>
          <TabsTrigger value="announcements" className="flex items-center gap-2 whitespace-nowrap">
            <Megaphone className="h-4 w-4" />
            Announcements
          </TabsTrigger>
          <TabsTrigger value="points" className="flex items-center gap-2 whitespace-nowrap">
            <Coins className="h-4 w-4" />
            Points
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2 whitespace-nowrap">
            <Activity className="h-4 w-4" />
            Activity
          </TabsTrigger>
          <TabsTrigger value="gamification" className="flex items-center gap-2 whitespace-nowrap">
            <Trophy className="h-4 w-4" />
            Gamification
          </TabsTrigger>
          <TabsTrigger value="storefront" className="flex items-center gap-2 whitespace-nowrap">
            <Smartphone className="h-4 w-4" />
            Storefront
          </TabsTrigger>


          {canWipe && (
            <TabsTrigger value="danger" className="flex items-center gap-2 whitespace-nowrap text-destructive data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground">
              <AlertTriangle className="h-4 w-4" />
              Danger Zone
            </TabsTrigger>
          )}
        </TabsList>

        {/* ── My Profile ── */}
        <TabsContent value="my-profile" className="space-y-6 animate-in fade-in-50 duration-500">
          <MyProfile />
        </TabsContent>

        {/* ── Branding ── */}
        <TabsContent value="branding" className="space-y-6 animate-in fade-in-50 duration-500">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    Branding
                  </CardTitle>
                  <CardDescription>
                    Customize your CRM's appearance with your company name and logo.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Enter company name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="currencyCode">Currency Code</Label>
                      <Input
                        id="currencyCode"
                        value={currencyCode}
                        onChange={(e) => setCurrencyCode(e.target.value)}
                        placeholder="e.g. EGP, USD, EUR"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currencySymbol">Currency Symbol</Label>
                      <Input
                        id="currencySymbol"
                        value={currencySymbol}
                        onChange={(e) => setCurrencySymbol(e.target.value)}
                        placeholder="e.g. LE, $, €"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL / Upload</Label>
                    <div className="flex gap-2">
                      <Input
                        id="logoUrl"
                        value={logoUrl}
                        onChange={(e) => setLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                        className="flex-1"
                      />
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => logoFileInputRef.current?.click()}
                        disabled={isUploadingLogo}
                        className="shrink-0 font-semibold cursor-pointer"
                      >
                        {isUploadingLogo ? 'Uploading...' : 'Upload Logo'}
                      </Button>
                    </div>
                    {logoUploadStatus && (
                      <p className={`text-xs ${logoUploadStatus.includes('successfully') ? 'text-emerald-600' : 'text-destructive'}`}>
                        {logoUploadStatus}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Transparent PNG or SVG works best. Max 3MB. Don't forget to click "Save Branding" below to apply.
                    </p>
                  </div>
                  {logoUrl && (
                    <div className="p-4 border rounded-lg bg-muted/50 flex flex-col items-center space-y-2">
                      <span className="text-xs font-medium text-muted-foreground uppercase">Preview</span>
                      <img
                        src={logoUrl}
                        alt="Logo Preview"
                        className="max-h-12 object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                  )}
                  <Button className="w-full" onClick={handleSave} disabled={isSaving}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSaving ? 'Saving...' : 'Save Branding'}
                  </Button>
                </CardContent>
              </Card>

              {/* ── Brand Color ── */}
              <Card>
                <CardHeader>
                  <CardTitle>Brand Color</CardTitle>
                  <CardDescription>
                    Choose your gym&apos;s accent color for highlights, badges, and active states.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Preset swatches */}
                  <div>
                    <Label className="text-xs text-muted-foreground mb-2 block">Presets</Label>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { label: 'Onyx', hex: '#1a1a1a' },
                        { label: 'Crimson', hex: '#dc2626' },
                        { label: 'Flame', hex: '#ea580c' },
                        { label: 'Gold', hex: '#ca8a04' },
                        { label: 'Emerald', hex: '#16a34a' },
                        { label: 'Royal Blue', hex: '#2563eb' },
                        { label: 'Violet', hex: '#7c3aed' },
                        { label: 'Rose', hex: '#e11d48' },
                        { label: 'Teal', hex: '#0d9488' },
                      ].map(({ label, hex }) => (
                        <button
                          key={hex}
                          title={label}
                          onClick={() => setSelectedAccent(hex)}
                          className={`w-8 h-8 rounded-full border-2 transition-all hover:scale-110 ${
                            selectedAccent === hex ? 'border-foreground scale-110 shadow-md' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Custom picker */}
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground">Custom</Label>
                    <input
                      type="color"
                      value={selectedAccent}
                      onChange={e => setSelectedAccent(e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-border bg-transparent p-0.5"
                    />
                    <span className="text-sm font-mono text-muted-foreground">{selectedAccent}</span>
                  </div>

                  {/* Live preview */}
                  <div
                    className="rounded-lg px-4 py-3 flex items-center gap-2 transition-colors"
                    style={{ backgroundColor: selectedAccent }}
                  >
                    <div className="w-2 h-2 rounded-full bg-white/80" />
                    <span className="text-white text-sm font-medium">Your brand color preview</span>
                  </div>

                  {/* Save */}
                  <Button
                    onClick={async () => {
                      await updateBranding({ brandAccentColor: selectedAccent });
                    }}
                    size="sm"
                  >
                    Save
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-primary" />
                    Check-in PINs
                  </CardTitle>
                  <CardDescription>
                    Set the daily member check-in PIN and kiosk access PIN.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="kioskPin">Kiosk Access PIN</Label>
                    <Input
                      id="kioskPin"
                      type="password"
                      value={kioskPin}
                      onChange={(e) => setKioskPin(e.target.value)}
                      placeholder="Enter 4-6 digit PIN"
                    />
                    <p className="text-xs text-muted-foreground">
                      Unlocks the attendance scanner on front-desk devices.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dailyPin">Daily Check-in PIN</Label>
                    <Input
                      id="dailyPin"
                      value={dailyPin}
                      onChange={(e) => setDailyPin(e.target.value)}
                      placeholder="e.g. 1234"
                    />
                    <p className="text-xs text-muted-foreground">
                      Members enter this PIN for self check-in. Change it daily for security.
                    </p>
                  </div>
                  <Button className="w-full" onClick={handleSavePin} disabled={isSavingPin}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSavingPin ? 'Saving...' : 'Save PINs'}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <QrCode className="h-5 w-5 text-primary" />
                  Self-Check-in QR Codes
                </CardTitle>
                <CardDescription>
                  Display or print these QR codes for members to scan with their phones.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-4 overflow-auto">
                  {branches.map(branch => (
                    <div key={branch} className="flex flex-col items-center p-4 border rounded-lg bg-muted/30 space-y-3">
                      <div className="flex justify-between w-full items-center">
                        <span className="font-bold text-sm tracking-tight">{branch}</span>
                        <Button variant="outline" size="sm" onClick={() => handlePrintQR(branch)}>
                          <Printer className="h-4 w-4 mr-2" />
                          Print
                        </Button>
                      </div>
                      <div className="bg-white p-2 rounded-md shadow-sm">
                        <QRCodeSVG
                          value={`${appUrl}/checkin?branch=${encodeURIComponent(branch)}`}
                          size={120}
                        />
                      </div>
                      <p className="text-[10px] text-muted-foreground break-all text-center">
                        {appUrl}/checkin?branch={branch}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
          {ChangePasswordCard}
        </TabsContent>

        {/* ── Branches ── */}
        <TabsContent value="branches" className="animate-in fade-in-50 duration-500">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Physical Branches
              </CardTitle>
              <CardDescription>
                Manage the locations/branches of your business. These will appear in dropdowns across the CRM.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-2 max-w-sm">
                <Input
                  placeholder="New Branch Name"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddBranch()}
                />
                <Button onClick={handleAddBranch}>
                  <Plus className="h-4 w-4 mr-2" /> Add
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {branches.map(branch => (
                  <div key={branch} className="flex items-center justify-between p-4 border rounded-lg bg-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-md text-primary">
                        <Building2 className="h-4 w-4" />
                      </div>
                      <span className="font-semibold">{branch}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemoveBranch(branch)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users" className="animate-in fade-in-50 duration-500">
          <UsersManagement />
        </TabsContent>

        <TabsContent value="packages" className="animate-in fade-in-50 duration-500">
          <Packages />
        </TabsContent>

        <TabsContent value="coaches" className="animate-in fade-in-50 duration-500">
          <Coaches />
        </TabsContent>

        <TabsContent value="commission" className="animate-in fade-in-50 duration-500">
          <CommissionReport />
        </TabsContent>

        {/* ── Backup ── */}
        <TabsContent value="backup" className="animate-in fade-in-50 duration-500">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Download My Backup Station</CardTitle>
                <CardDescription>
                  Download a personalized offline backup file for {branding.companyName || 'your gym'}. Staff can use it during outages — check-ins, payments and leads are saved locally and can be synced back when the system is restored.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  onClick={() => {
                    const html = generateBackupStationHTML({
                      gymName: branding.companyName || 'My Gym',
                      tenantId: getTenantId(),
                      brandColor: branding.brandAccentColor || '#1a1a1a',
                    });
                    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
                    downloadFile(blob, `backup-station-${getTenantId()}.html`);
                  }}
                  size="sm"
                  variant="outline"
                >
                  ⬇️ Download Backup Station
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Import Backup Station Records</CardTitle>
                <CardDescription>
                  Import records logged in the offline backup-station.html while the main system was unavailable.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col gap-3">
                  <Label htmlFor="backup-file-input" className="text-sm">
                    Select backup JSON file
                  </Label>
                  <input
                    id="backup-file-input"
                    type="file"
                    accept=".json"
                    onChange={handleBackupFileSelect}
                    className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 cursor-pointer"
                  />
                </div>
                {backupImportPreview && (
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                    <p className="font-medium">File preview:</p>
                    <p className="text-muted-foreground">
                      {backupImportPreview.checkins} check-ins · {backupImportPreview.payments} payments · {backupImportPreview.leads} leads
                    </p>
                  </div>
                )}
                {backupImportResult && (
                  <p className="text-sm font-medium">{backupImportResult}</p>
                )}
                <Button
                  onClick={handleMergeBackup}
                  disabled={!backupImportFile || backupImportLoading}
                  size="sm"
                >
                  {backupImportLoading ? 'Importing…' : 'Merge Records into System'}
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Download className="h-5 w-5 text-primary" />
                  Export Backup
                </CardTitle>
                <CardDescription>
                  Download a full JSON backup of all CRM data — clients, payments, sessions, tasks, packages, and more.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The backup includes all root collections and client subcollections (comments &amp; interactions). Store the file somewhere safe.
                </p>
                {exportProgress && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="capitalize">{exportProgress.step}</span>
                      <span className="font-medium tabular-nums">{exportProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                        style={{ width: `${exportProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}
                <Button className="w-full" onClick={handleExport} disabled={isExporting}>
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? 'Exporting…' : 'Download Backup'}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-primary" />
                  Restore from Backup
                </CardTitle>
                <CardDescription>
                  Upload a previously exported JSON backup to restore data. Existing records with the same ID will be overwritten.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  This does <strong>not</strong> delete existing data first — it merges. To do a clean restore, wipe the system first, then restore.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleRestoreFile}
                />
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isRestoring}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {isRestoring ? 'Restoring...' : 'Choose Backup File'}
                </Button>
                {restoreStatus && (
                  <p className={`text-sm font-medium ${restoreStatus.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>
                    {restoreStatus.message}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Announcements ── */}
        <TabsContent value="announcements" className="animate-in fade-in-50 duration-500">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  {editingAnnouncementId ? 'Edit Announcement' : 'Create Announcement'}
                </CardTitle>
                <CardDescription>
                  Announcements appear as promotional banners on the Member Portal home screen.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Title *</Label>
                  <Input value={announcementForm.title} onChange={e => setAnnouncementForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Summer Sale — 50% Off" />
                </div>
                <div className="space-y-2">
                  <Label>Body</Label>
                  <textarea className="w-full border rounded-md p-2 text-sm min-h-[80px] bg-background" value={announcementForm.body} onChange={e => setAnnouncementForm(f => ({ ...f, body: e.target.value }))} placeholder="Promotion details..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Date</Label>
                    <Input type="date" value={announcementForm.startDate} onChange={e => setAnnouncementForm(f => ({ ...f, startDate: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>End Date</Label>
                    <Input type="date" value={announcementForm.endDate} onChange={e => setAnnouncementForm(f => ({ ...f, endDate: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Image URL (optional)</Label>
                  <Input value={announcementForm.imageUrl} onChange={e => setAnnouncementForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Link URL (optional)</Label>
                  <Input value={announcementForm.linkUrl} onChange={e => setAnnouncementForm(f => ({ ...f, linkUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-2">
                  <Label>Priority (higher = shown first)</Label>
                  <Input type="number" min={1} max={10} value={announcementForm.priority} onChange={e => setAnnouncementForm(f => ({ ...f, priority: Number(e.target.value) }))} />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={handleSaveAnnouncement} disabled={isSavingAnnouncement || !announcementForm.title.trim()}>
                    <Save className="mr-2 h-4 w-4" />
                    {isSavingAnnouncement ? 'Saving...' : editingAnnouncementId ? 'Update' : 'Create'}
                  </Button>
                  {editingAnnouncementId && (
                    <Button variant="outline" onClick={() => { setEditingAnnouncementId(null); setAnnouncementForm({ title: '', body: '', imageUrl: '', linkUrl: '', priority: 1, startDate: new Date().toISOString().split('T')[0], endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] }); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-bold">Active Announcements ({announcements.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingAnnouncements ? (
                  <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" /></div>
                ) : announcements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6 italic">No announcements yet. Create one to engage your members!</p>
                ) : (
                  announcements.map(a => (
                    <div key={a.id} className="p-3 border rounded-lg bg-card/50 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-bold text-sm">{a.title}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2">{a.body}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditAnnouncement(a)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteAnnouncement(a.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex gap-2 text-[10px] text-muted-foreground">
                        <span>Priority: {a.priority}</span>
                        <span>•</span>
                        <span>{a.startDate} → {a.endDate}</span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>


        {/* ── Points Management ── */}
        <TabsContent value="points" className="animate-in fade-in-50 duration-500">
          <AdminPointsManager />
        </TabsContent>

        {/* ── Activity Feed ── */}
        <TabsContent value="activity" className="animate-in fade-in-50 duration-500">
          <AdminActivityFeed />
        </TabsContent>

        {/* ── Gamification Manager ── */}
        <TabsContent value="gamification" className="animate-in fade-in-50 duration-500">
          <AdminGamificationManager />
        </TabsContent>

        {/* ── Storefront Manager ── */}
        <TabsContent value="storefront" className="animate-in fade-in-50 duration-500">
          <AdminStorefrontManager />
        </TabsContent>


        {/* ── Danger Zone ── */}
        {canWipe && (
          <TabsContent value="danger" className="animate-in fade-in-50 duration-500">
            <Card className="border-destructive/50 bg-destructive/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-destructive">
                  <ShieldAlert className="h-5 w-5" />
                  Master System Reset
                </CardTitle>
                <CardDescription className="text-destructive/80 font-medium">
                  This area contains highly destructive actions. Proceed with extreme caution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 border border-destructive/20 rounded-lg bg-background/50 space-y-3">
                  <h4 className="font-bold text-destructive flex items-center gap-2">
                    <Trash2 className="h-4 w-4" />
                    Wipe All CRM Data
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Permanently deletes all Clients, Leads, Payments, Attendance records, and Tasks.
                    Admins and Branding settings are preserved.
                  </p>
                  <Button
                    variant="destructive"
                    className="font-bold"
                    onClick={() => { setWipeStep(1); setIsWipeDialogOpen(true); }}
                  >
                    Wipe System Content
                  </Button>
                </div>

                <div className="p-4 border border-border rounded-lg bg-background/50 space-y-3">
                  <h4 className="font-bold text-foreground flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-primary" />
                    Migrate Existing Members & Coaches
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Loops through all active members and coaches in the database. Generates portal user accounts with a default password <code className="font-mono bg-muted px-1 rounded">12345678</code> and marks them as requiring a password change on first login.
                  </p>
                  <Button
                    variant="outline"
                    className="font-bold border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={handleRunMigration}
                    disabled={isMigrating}
                  >
                    {isMigrating ? 'Migrating Accounts...' : 'Run Auth Migration'}
                  </Button>
                  {migrationResult && (
                    <div className="mt-3 p-3 rounded-lg bg-card border text-sm space-y-2">
                      <p className="font-semibold text-green-600">Migration Completed!</p>
                      <ul className="list-disc pl-5 text-xs space-y-1 text-muted-foreground">
                        <li>Members Migrated: <strong>{migrationResult.membersMigrated}</strong></li>
                        <li>Coaches Migrated: <strong>{migrationResult.coachesMigrated}</strong></li>
                      </ul>
                      {migrationResult.errors.length > 0 && (
                        <div className="text-xs text-destructive mt-2">
                          <p className="font-bold">Errors encountered ({migrationResult.errors.length}):</p>
                          <ul className="list-disc pl-5 space-y-1">
                            {migrationResult.errors.slice(0, 5).map((err, idx) => (
                              <li key={idx} className="break-all">{err}</li>
                            ))}
                            {migrationResult.errors.length > 5 && <li>And {migrationResult.errors.length - 5} more...</li>}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={isWipeDialogOpen} onOpenChange={setIsWipeDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              {wipeStep === 1 ? 'Confirm Reset' : 'Final Verification'}
            </DialogTitle>
            <DialogDescription>
              {wipeStep === 1
                ? 'Are you absolutely sure you want to delete all CRM data? This cannot be undone.'
                : 'To prevent accidental deletion, please type "RESET SYSTEM" in the box below to confirm.'}
            </DialogDescription>
          </DialogHeader>

          {wipeStep === 2 && (
            <div className="py-4">
              <Input
                value={wipeConfirmText}
                onChange={(e) => setWipeConfirmText(e.target.value.toUpperCase())}
                placeholder="RESET SYSTEM"
                className="font-mono text-center tracking-widest"
              />
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsWipeDialogOpen(false)} disabled={isWiping}>
              Cancel
            </Button>
            {wipeStep === 1 ? (
              <Button variant="destructive" onClick={() => setWipeStep(2)}>
                Continue to Final Step
              </Button>
            ) : (
              <Button
                variant="destructive"
                disabled={wipeConfirmText !== 'RESET SYSTEM' || isWiping}
                onClick={async () => {
                  setIsWiping(true);
                  try {
                    await wipeSystem();
                    setIsWipeDialogOpen(false);
                    window.location.reload();
                  } catch (e) {
                    alert("Wipe failed: " + (e as Error).message);
                    setIsWiping(false);
                  }
                }}
              >
                {isWiping ? 'Wiping...' : 'Wipe Everything Now'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
