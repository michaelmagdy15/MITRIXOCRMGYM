import React, { useState, useEffect } from 'react';
import { Client } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db, storage, auth, getTenantId } from '../firebase';
import { doc, updateDoc, collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Sun, Moon, ShieldCheck, UserCheck, KeyRound, CheckCircle2, AlertCircle, Users, CalendarDays, Flame, Trophy, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { format, parseISO, differenceInDays } from 'date-fns';

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

export default function MemberProfile({ client }: { client: Client | null }) {
  const { currentUser, changeMyPassword } = useAuth();
  const { theme, toggleTheme } = useTheme();

  // Basic Info Form State
  const [name, setName] = useState(client?.name || '');
  const [phone, setPhone] = useState(client?.phone || '');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Password Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Link Family Member Form State
  const [linkMemberId, setLinkMemberId] = useState('');
  const [linkPhone, setLinkPhone] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Attendance stats for hero card
  const [totalCheckins, setTotalCheckins] = useState(0);
  const [currentStreak, setCurrentStreak] = useState(0);

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !client?.id) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file.');
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const compressed = await compressImage(file);
      const fileRef = storageRef(storage, `member_photos/${client.id}`);
      await uploadBytes(fileRef, compressed, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(fileRef);
      
      if (getTenantId() === 'inzanathletics') {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch('/api/clients/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: client.id, updates: { photoURL: url } })
          });
        }
      }

      const clientRef = doc(db, 'clients', client.id);
      await updateDoc(clientRef, { photoURL: url });
      
      toast.success('Profile photo updated successfully!');
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to upload profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  useEffect(() => {
    if (!client?.id) return;
    const q = query(collection(db, 'attendance'), where('clientId', '==', client.id));
    getDocs(q).then(snap => {
      setTotalCheckins(snap.size);
      const dates = snap.docs.map(d => (d.data() as any).date as string).filter(Boolean).sort().reverse();
      const uniqueDates = [...new Set(dates)];
      let streak = 0;
      const today = new Date();
      for (let i = 0; i < uniqueDates.length; i++) {
        try {
          const d = parseISO(uniqueDates[i]!);
          const diff = differenceInDays(today, d);
          if (diff <= i + 1) streak++;
          else break;
        } catch { break; }
      }
      setCurrentStreak(streak);
    }).catch(() => {});
  }, [client?.id]);

  const initials = (client?.name || 'U').split(' ').map(n => n[0] || '').slice(0, 2).join('').toUpperCase();
  const joinDateStr = client?.startDate || client?.createdAt;
  const memberSince = joinDateStr ? (() => { try { return format(parseISO(joinDateStr), 'MMM yyyy'); } catch { return '—'; } })() : '—';
  const daysAsMember = joinDateStr ? (() => { try { return differenceInDays(new Date(), parseISO(joinDateStr)); } catch { return 0; } })() : 0;

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !currentUser?.id) return;
    
    setIsUpdatingProfile(true);
    setProfileSuccess(false);
    setProfileError(null);

    try {
      const updates = { name: name.trim(), phone: phone.trim() };
      
      if (getTenantId() === 'inzanathletics') {
        const token = await auth.currentUser?.getIdToken();
        if (token) {
          await fetch('/api/clients/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ id: client.id, updates })
          });
        }
      }

      // 1. Update clients collection
      const clientRef = doc(db, 'clients', client.id);
      await updateDoc(clientRef, updates);

      // 2. Update users collection
      const userRef = doc(db, 'users', currentUser.id);
      await updateDoc(userRef, {
        name: name.trim(),
        phone: phone.trim()
      });

      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error updating profile:", err);
      setProfileError("Failed to update profile settings. Please try again.");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }

    setIsUpdatingPassword(true);
    setPasswordSuccess(false);
    setPasswordError(null);

    try {
      await changeMyPassword(currentPassword, newPassword);
      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error changing password:", err);
      if (err.code === 'auth/wrong-password') {
        setPasswordError("Incorrect current password.");
      } else {
        setPasswordError(err.message || "Failed to update password. Try again.");
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const handleLinkFamilyMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client?.id || !linkMemberId || !linkPhone) return;

    setIsLinking(true);
    setLinkSuccess(false);
    setLinkError(null);

    try {
      // 1. Check if trying to link self
      if (client.memberId === linkMemberId.trim()) {
        throw new Error("You cannot link your own profile.");
      }

      // 2. Query target client
      const q = query(
        collection(db, 'clients'),
        where('memberId', '==', linkMemberId.trim())
      );
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty || !querySnapshot.docs[0]) {
        throw new Error("No client found with this Member ID.");
      }

      const targetDoc = querySnapshot.docs[0];
      const targetClientData = targetDoc.data();
      const targetClientId = targetDoc.id;

      // 3. Verify phone match
      if (targetClientData.phone !== linkPhone.trim()) {
        throw new Error("Phone number does not match the record for this Member ID.");
      }

      // 4. Verify not already linked
      const currentLinks = client.linkedClientIds || [];
      if (currentLinks.includes(targetClientId)) {
        throw new Error("This profile is already linked to your account.");
      }

      // 5. Update current client mutually
      const currentClientRef = doc(db, 'clients', client.id);
      await updateDoc(currentClientRef, {
        linkedClientIds: [...currentLinks, targetClientId]
      });

      // 6. Update target client mutually
      const targetClientRef = doc(db, 'clients', targetClientId);
      const targetLinks = targetClientData.linkedClientIds || [];
      await updateDoc(targetClientRef, {
        linkedClientIds: [...targetLinks, client.id]
      });

      // 7. Log to auditLogs
      await addDoc(collection(db, 'auditLogs'), {
        action: 'UPDATE',
        entityType: 'CLIENT',
        entityId: client.id,
        details: `Member ${client.name} linked family profile: ${targetClientData.name} (ID: ${linkMemberId})`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      setLinkSuccess(true);
      setLinkMemberId('');
      setLinkPhone('');
      setTimeout(() => setLinkSuccess(false), 3000);
    } catch (err: any) {
      console.error("Error linking family member:", err);
      setLinkError(err.message || "Failed to link family member. Please try again.");
    } finally {
      setIsLinking(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* ─── BeFit-Style Avatar Hero Card (Glassmorphic) ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-card/45 backdrop-blur-md border border-border/30 p-5 shadow-lg shadow-black/5 dark:shadow-black/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-8 translate-x-8" />
        <div className="flex items-center gap-4">
          {/* Avatar Circle */}
          <div className="relative group">
            <div className="h-16 w-16 rounded-2xl bg-primary/20 border-2 border-primary/30 flex items-center justify-center text-xl font-extrabold text-primary shrink-0 overflow-hidden">
              {client?.photoURL ? (
                <img src={client.photoURL} alt={client.name} className="w-full h-full object-cover" />
              ) : (
                initials
              )}
            </div>
            
            <input
              type="file"
              accept="image/*"
              className="hidden"
              id="member-photo-upload"
              onChange={handlePhotoUpload}
              disabled={isUploadingPhoto}
            />
            <Label
              htmlFor="member-photo-upload"
              className={`absolute -bottom-2 -right-2 h-7 w-7 rounded-full border border-border shadow-sm flex items-center justify-center cursor-pointer transition-colors ${
                isUploadingPhoto ? 'bg-muted text-muted-foreground' : 'bg-background hover:bg-muted text-foreground'
              }`}
            >
              {isUploadingPhoto ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </Label>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight truncate uppercase">{client?.name || 'MEMBER'}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-[9px] font-mono bg-card/50">{client?.memberId || 'N/A'}</Badge>
              <Badge className={`text-[9px] ${client?.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200/50' : 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50'}`}>
                {client?.status || 'Unknown'}
              </Badge>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> Member since {memberSince} · {daysAsMember} days
            </p>
          </div>
        </div>
        {/* Quick Stats Row */}
        <div className="grid grid-cols-3 gap-2 mt-4">
          <div className="text-center p-2.5 bg-background/40 backdrop-blur-sm rounded-xl border border-border/20 shadow-sm">
            <p className="text-lg font-extrabold font-mono text-primary">{totalCheckins}</p>
            <p className="text-[9px] text-muted-foreground font-bold">Check-ins</p>
          </div>
          <div className="text-center p-2.5 bg-background/40 backdrop-blur-sm rounded-xl border border-border/20 shadow-sm">
            <p className="text-lg font-extrabold font-mono text-orange-500 flex items-center justify-center gap-0.5">
              <Flame className="h-4 w-4" />{currentStreak}
            </p>
            <p className="text-[9px] text-muted-foreground font-bold">Streak</p>
          </div>
          <div className="text-center p-2.5 bg-background/40 backdrop-blur-sm rounded-xl border border-border/20 shadow-sm">
            <p className="text-lg font-extrabold font-mono text-primary uppercase">{client?.branch || '—'}</p>
            <p className="text-[9px] text-muted-foreground font-bold">Branch</p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold tracking-tight">Account Settings</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Manage your password, theme preferences, and contact information.</p>
      </div>

      {/* Preferences Section (Theme toggling) */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            {theme === 'dark' ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
            Theme Preference
          </CardTitle>
          <CardDescription className="text-[11px]">Toggle application visual appearance mode.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0 flex items-center justify-between">
          <span className="text-xs font-semibold">
            Currently using <span className="text-primary font-bold capitalize">{theme}</span> mode
          </span>
          <Button variant="outline" size="sm" onClick={toggleTheme} className="h-9 px-4 font-bold border-primary/20 hover:border-primary/40">
            Switch Theme
          </Button>
        </CardContent>
      </Card>

      {/* Edit Profile Info Form */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Profile Information
          </CardTitle>
          <CardDescription className="text-[11px]">Update your personal contact details.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="memberName" className="text-xs font-bold text-muted-foreground">Full Name</Label>
              <Input
                id="memberName"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="memberPhone" className="text-xs font-bold text-muted-foreground">Phone Number</Label>
              <Input
                id="memberPhone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                className="bg-background font-mono"
              />
            </div>

            {profileError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            {profileSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Profile updated successfully!</span>
              </div>
            )}

            <Button type="submit" disabled={isUpdatingProfile} className="w-full font-bold">
              {isUpdatingProfile ? 'Saving...' : 'Update Details'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Link Family Member Card */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Link Family Profile
          </CardTitle>
          <CardDescription className="text-[11px]">
            Link a family member's account to easily toggle between profiles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLinkFamilyMember} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="linkMemberId" className="text-xs font-bold text-muted-foreground">Family Member ID</Label>
              <Input
                id="linkMemberId"
                type="text"
                placeholder="e.g. ST-1092"
                value={linkMemberId}
                onChange={(e) => setLinkMemberId(e.target.value)}
                required
                className="bg-background"
              />
            </div>
            
            <div className="space-y-1.5">
              <Label htmlFor="linkPhone" className="text-xs font-bold text-muted-foreground">Family Member Phone</Label>
              <Input
                id="linkPhone"
                type="tel"
                placeholder="e.g. +201012345678"
                value={linkPhone}
                onChange={(e) => setLinkPhone(e.target.value)}
                required
                className="bg-background font-mono"
              />
            </div>

            {linkError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{linkError}</span>
              </div>
            )}

            {linkSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Family profile linked successfully! Switch profiles in the top bar.</span>
              </div>
            )}

            <Button type="submit" disabled={isLinking} className="w-full font-bold">
              {isLinking ? 'Linking...' : 'Link Account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Password Form */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-primary" />
            Security & Password
          </CardTitle>
          <CardDescription className="text-[11px]">Reset your account authentication credentials.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currPass" className="text-xs font-bold text-muted-foreground">Current Password</Label>
              <Input
                id="currPass"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="newPass" className="text-xs font-bold text-muted-foreground">New Password</Label>
              <Input
                id="newPass"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPass" className="text-xs font-bold text-muted-foreground">Confirm New Password</Label>
              <Input
                id="confirmPass"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="bg-background"
              />
            </div>

            {passwordError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{passwordError}</span>
              </div>
            )}

            {passwordSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>Password updated successfully!</span>
              </div>
            )}

            <Button type="submit" disabled={isUpdatingPassword} className="w-full font-bold">
              {isUpdatingPassword ? 'Updating...' : 'Change Password'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account Deletion Request Card (Apple App Store Review Compliance Guideline 5.1.1) */}
      <Card className="border border-destructive/20 bg-destructive/5 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Delete Account
          </CardTitle>
          <CardDescription className="text-[11px] text-zinc-400">
            Request permanent deletion of your profile data and memberships.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-4">
            Under Apple App Store guidelines, you can request full deletion of your gym membership record and login credentials. This action is irreversible and requires staff approval.
          </p>
          <Button 
            variant="destructive" 
            className="w-full font-bold bg-destructive/10 hover:bg-destructive text-destructive hover:text-white"
            onClick={async () => {
              if (window.confirm("Are you absolutely sure you want to submit a request to delete your account? This will terminate all active memberships and delete your data permanently.")) {
                try {
                  await addDoc(collection(db, 'passwordResetRequests'), {
                    type: 'ACCOUNT_DELETION',
                    clientId: client?.id || '',
                    clientName: client?.name || '',
                    memberId: client?.memberId || '',
                    email: currentUser?.email || '',
                    phone: client?.phone || '',
                    status: 'pending',
                    requestedAt: new Date().toISOString()
                  });
                  alert("Your account deletion request has been submitted successfully. A staff member will process it shortly.");
                } catch (err) {
                  console.error("Error submitting account deletion request:", err);
                  alert("Failed to submit request. Please try again or contact the front desk.");
                }
              }
            }}
          >
            Request Account Deletion
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
