import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User as UserIcon, Copy, CheckCircle2, LogOut, Sun, Moon } from 'lucide-react';

export default function CoachProfile() {
  const { currentUser, updateUser, submitPasswordResetRequest, logout } = useAuth();
  const { theme, toggleTheme, themeLocked } = useTheme();
  const [name, setName] = useState(currentUser?.name || '');
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!currentUser || !name.trim()) return;
    setIsSaving(true);
    try {
      await updateUser(currentUser.id, { name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!currentUser?.email) return;
    try {
      await submitPasswordResetRequest(currentUser.email, currentUser.name);
      setResetRequested(true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const copyCoachId = () => {
    if (currentUser?.coachId) {
      navigator.clipboard.writeText(currentUser.coachId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserIcon className="h-6 w-6 text-primary" /> My Profile
          </h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your account settings.</p>
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={logout}
          className="h-10 px-4 font-bold gap-2 rounded-xl shadow-sm shrink-0"
        >
          <LogOut className="h-4 w-4" />
          <span>Log Out</span>
        </Button>
      </div>

      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Coach Identity</CardTitle>
          <CardDescription>Your unique coach ID for logging in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="text-xs text-muted-foreground">Coach ID</p>
              <p className="text-2xl font-mono font-bold text-primary">{currentUser?.coachId ?? '—'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={copyCoachId} className="gap-1.5">
              {copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Email:</span>
            <span className="text-sm font-medium">{currentUser?.email}</span>
          </div>
          {currentUser?.branch && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Branch:</span>
              <Badge variant="outline">{currentUser.branch}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Display Name</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={isSaving || name === currentUser?.name} className="w-full">
            {saved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password</CardTitle>
          <CardDescription>Request an admin to send you a password reset email.</CardDescription>
        </CardHeader>
        <CardContent>
          {resetRequested ? (
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">Reset request submitted. An admin will process it shortly.</span>
            </div>
          ) : (
            <Button variant="outline" onClick={handlePasswordReset} className="w-full">
              Request Password Reset
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Session & Preferences</CardTitle>
          <CardDescription>Switch display appearance or sign out of your coach account on this device.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!themeLocked && (
            <Button
              type="button"
              variant="outline"
              onClick={toggleTheme}
              className="w-full h-11 font-semibold gap-2 rounded-xl"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              <span>{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            onClick={logout}
            className="w-full h-12 font-bold gap-2 rounded-xl text-sm shadow-sm"
          >
            <LogOut className="h-4 w-4" />
            <span>Log Out of Coach Portal</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
