import React, { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPasswordStrength, validateNewPassword } from '../utils/passwordStrength';
import { storage } from '../firebase';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Camera, Lock, Eye, EyeOff, CheckCircle2, Loader2, User as UserIcon, KeyRound } from 'lucide-react';

// ─── Image compression ────────────────────────────────────────────────────────
// Resizes to max 400×400 px, then iteratively lowers JPEG quality until the
// blob is ≤ TARGET_KB.  No external library needed — pure Canvas API.
const MAX_PX = 400;
const TARGET_KB = 150;
const MIN_QUALITY = 0.30;

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Resize to max MAX_PX × MAX_PX (maintains aspect ratio)
      let { width, height } = img;
      if (width > MAX_PX || height > MAX_PX) {
        if (width > height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
        else               { width  = Math.round((width / height) * MAX_PX); height = MAX_PX; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);

      // Binary-search quality: start at 0.75, bracket down fast.
      // For a 400×400 JPEG, 0.75 is almost always ≤ 150 KB in one pass.
      const tryCompress = (quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Canvas toBlob failed')); return; }
            if (blob.size / 1024 <= TARGET_KB || quality <= MIN_QUALITY) {
              resolve(blob);
            } else {
              // Drop by 15 % each time for faster convergence
              tryCompress(Math.max(MIN_QUALITY, quality - 0.15));
            }
          },
          'image/jpeg',
          quality,
        );
      };

      tryCompress(0.75); // 0.75 usually hits target in one shot
    };

    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Failed to load image')); };
    img.src = objectUrl;
  });
}


export default function MyProfile() {
  const { currentUser, updateMyProfile, submitPasswordResetRequest, changeMyPassword } = useAuth();

  // ── Avatar ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarPhase, setAvatarPhase] = useState<'compressing' | 'uploading' | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
      setAvatarStatus('Please select an image file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setAvatarStatus('Image must be under 10 MB.');
      return;
    }

    setIsUploadingAvatar(true);
    setAvatarStatus(null);
    try {
      setAvatarPhase('compressing');
      const compressed = await compressImage(file);
      const sizeKb = Math.round(compressed.size / 1024);

      setAvatarPhase('uploading');
      const fileRef = storageRef(storage, `avatars/${currentUser.id}`);
      await uploadBytes(fileRef, compressed, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(fileRef);
      await updateMyProfile({ photoURL: url });
      setAvatarStatus(`Profile picture updated! (${sizeKb} KB)`);
    } catch (err: any) {
      setAvatarStatus('Upload failed. Please try again.');
    } finally {
      setIsUploadingAvatar(false);
      setAvatarPhase(null);
    }
  };

  // ── Change Password Dialog ───────────────────────────────────────────────
  const [isPwdOpen, setIsPwdOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState(false);
  const [isChangingPwd, setIsChangingPwd] = useState(false);

  const strength = getPasswordStrength(newPwd);

  const resetPwdForm = () => {
    setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    setPwdError(null); setPwdSuccess(false); setShowPwd(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    const err = validateNewPassword(newPwd, confirmPwd);
    if (err) { setPwdError(err); return; }

    setIsChangingPwd(true);
    try {
      await changeMyPassword(currentPwd, newPwd);
      setPwdSuccess(true);
    } catch (ex: any) {
      if (ex?.code === 'auth/wrong-password' || ex?.code === 'auth/invalid-credential') {
        setPwdError('Current password is incorrect.');
      } else if (ex?.code === 'auth/requires-recent-login') {
        setPwdError('Session expired. Please log out and log back in, then try again.');
      } else {
        setPwdError(ex?.message || 'Failed to change password.');
      }
    } finally {
      setIsChangingPwd(false);
    }
  };

  // ── Request Reset ────────────────────────────────────────────────────────
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [resetRequestStatus, setResetRequestStatus] = useState<string | null>(null);

  const handleRequestReset = async () => {
    if (!currentUser?.email) return;
    setIsRequestingReset(true);
    setResetRequestStatus(null);
    try {
      await submitPasswordResetRequest(currentUser.email, currentUser.name);
      setResetRequestStatus('Request submitted! An admin will approve it shortly.');
    } catch {
      setResetRequestStatus('Failed to submit request. Please try again.');
    } finally {
      setIsRequestingReset(false);
    }
  };

  if (!currentUser) return null;

  const initials = currentUser.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="space-y-6 max-w-xl">
      {/* ── Avatar Card ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="h-4 w-4" /> Profile Picture
          </CardTitle>
          <CardDescription>Upload any photo (JPG, PNG, HEIC…). It will be auto-compressed to under 150 KB before saving.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-5">
          {/* Avatar circle */}
          <div
            className="relative h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-primary">{initials}</span>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
              <Camera className="h-6 w-6 text-white" />
            </div>
            {isUploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center rounded-full gap-1">
                <Loader2 className="h-5 w-5 text-white animate-spin" />
                <span className="text-white text-[9px] font-medium leading-none">
                  {avatarPhase === 'compressing' ? 'Shrinking' : 'Saving'}
                </span>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
            >
              {isUploadingAvatar ? (
                <><Loader2 className="h-3 w-3 mr-2 animate-spin" />
                  {avatarPhase === 'compressing' ? 'Compressing…' : 'Uploading…'}
                </>
              ) : (
                <><Camera className="h-4 w-4 mr-2" />Change Photo</>
              )}
            </Button>
            {avatarStatus && (
              <p className={`text-xs ${avatarStatus.includes('!') ? 'text-emerald-600' : 'text-destructive'}`}>
                {avatarStatus}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{currentUser.name}</p>
            <p className="text-xs text-muted-foreground">{currentUser.email}</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Password Card ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="h-4 w-4" /> Password
          </CardTitle>
          <CardDescription>
            Change your password directly (requires current password) or submit a request for admin approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => { resetPwdForm(); setIsPwdOpen(true); }} variant="outline" className="w-full justify-start gap-2">
            <Lock className="h-4 w-4" /> Change My Password
          </Button>

          <div className="relative flex items-center gap-2">
            <div className="flex-1 border-t" />
            <span className="text-xs text-muted-foreground px-1">or</span>
            <div className="flex-1 border-t" />
          </div>

          <div className="rounded-xl border p-4 space-y-2 bg-muted/30">
            <p className="text-sm font-medium flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" />
              Can't remember your current password?
            </p>
            <p className="text-xs text-muted-foreground">
              Submit a password reset request. An admin will approve it, and you'll receive a reset link by email (or your password will be reset to the temporary default).
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRequestReset}
              disabled={isRequestingReset || !!resetRequestStatus?.includes('submitted')}
              className="mt-1"
            >
              {isRequestingReset ? (
                <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Submitting…</>
              ) : (
                'Request Password Reset'
              )}
            </Button>
            {resetRequestStatus && (
              <p className={`text-xs ${resetRequestStatus.includes('submitted') ? 'text-emerald-600' : 'text-destructive'}`}>
                {resetRequestStatus}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Change Password Dialog ──────────────────────────────────────── */}
      <Dialog open={isPwdOpen} onOpenChange={open => { if (!open) { resetPwdForm(); } setIsPwdOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" /> Change Password
            </DialogTitle>
          </DialogHeader>

          {pwdSuccess ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="p-4 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <p className="font-semibold">Password updated successfully!</p>
              <Button onClick={() => { setIsPwdOpen(false); resetPwdForm(); }}>Done</Button>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4 py-2">
              {/* Current password */}
              <div className="space-y-1.5">
                <Label htmlFor="mp-current">Current Password</Label>
                <div className="relative">
                  <Input
                    id="mp-current"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="Enter your current password"
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button type="button" className="absolute right-3 top-2.5 text-muted-foreground" onClick={() => setShowPwd(v => !v)}>
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="mp-new">New Password</Label>
                <Input
                  id="mp-new"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                />
                {newPwd.length > 0 && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${strength.color}`}
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                    <p className={`text-xs font-medium ${strength.textColor}`}>{strength.label}</p>
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label htmlFor="mp-confirm">Confirm New Password</Label>
                <Input
                  id="mp-confirm"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {/* Rules */}
              <ul className="space-y-1 text-xs text-muted-foreground">
                {[
                  { ok: newPwd.length >= 8,           text: 'At least 8 characters' },
                  { ok: /[A-Z]/.test(newPwd),         text: 'One uppercase letter' },
                  { ok: /[0-9]/.test(newPwd),         text: 'One number' },
                  { ok: /[^A-Za-z0-9]/.test(newPwd),  text: 'One special character' },
                  { ok: newPwd === confirmPwd && newPwd.length > 0, text: 'Passwords match' },
                ].map(r => (
                  <li key={r.text} className={`flex items-center gap-1.5 transition-colors ${r.ok ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    {r.text}
                  </li>
                ))}
              </ul>

              {pwdError && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{pwdError}</p>
              )}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPwdOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  disabled={isChangingPwd || !currentPwd || !!validateNewPassword(newPwd, confirmPwd)}
                >
                  {isChangingPwd ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating…</> : 'Update Password'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
