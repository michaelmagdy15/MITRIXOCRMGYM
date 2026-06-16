import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getPasswordStrength, validateNewPassword } from '../utils/passwordStrength';
import { ShieldAlert, Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ForcePasswordChangeDialog() {
  const { completeForcedPasswordChange, currentUser, logout } = useAuth();

  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const strength = getPasswordStrength(newPwd);
  const validationError = newPwd.length > 0 ? validateNewPassword(newPwd, confirmPwd) : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const err = validateNewPassword(newPwd, confirmPwd);
    if (err) { setError(err); return; }

    setIsSubmitting(true);
    try {
      await completeForcedPasswordChange(newPwd);
      setSuccess(true);
    } catch (ex: any) {
      // If reauth with 12345678 failed AND session is stale, ask user to re-login
      if (ex?.code === 'auth/requires-recent-login') {
        setError('Your session has expired. Please log out and log back in with your temporary password (12345678), then change it.');
      } else {
        setError(ex?.message || 'Failed to update password. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    /* Full-screen overlay — cannot be dismissed */
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-amber-500/20">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Security Update Required</h2>
              <p className="text-sm text-muted-foreground">
                Hi {currentUser?.name?.split(' ')[0]}! Please set a new password before continuing.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {success ? (
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <div className="p-4 rounded-full bg-emerald-500/10">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-lg">Password updated!</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your account is now secure. Welcome to mitrixogymcrm.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-700 dark:text-amber-400 flex gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Your password was reset by an admin. Your temporary password is{' '}
                  <code className="font-mono font-bold">12345678</code>. Please choose a strong new one.
                </span>
              </div>

              {/* New password */}
              <div className="space-y-1.5">
                <Label htmlFor="fp-new">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="fp-new"
                    type={showPwd ? 'text' : 'password'}
                    placeholder="At least 8 characters"
                    className="pl-9 pr-10"
                    value={newPwd}
                    onChange={e => setNewPwd(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPwd(v => !v)}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {newPwd.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${strength.color}`}
                        style={{ width: `${strength.percent}%` }}
                      />
                    </div>
                    <p className={`text-xs font-medium ${strength.textColor}`}>
                      {strength.label}
                    </p>
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div className="space-y-1.5">
                <Label htmlFor="fp-confirm">Confirm Password</Label>
                <Input
                  id="fp-confirm"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                />
              </div>

              {/* Rules checklist */}
              <ul className="space-y-1 text-xs text-muted-foreground">
                {[
                  { ok: newPwd.length >= 8,          text: 'At least 8 characters' },
                  { ok: /[A-Z]/.test(newPwd),        text: 'One uppercase letter' },
                  { ok: /[0-9]/.test(newPwd),        text: 'One number' },
                  { ok: /[^A-Za-z0-9]/.test(newPwd), text: 'One special character (@ # ! …)' },
                  { ok: newPwd === confirmPwd && newPwd.length > 0, text: 'Passwords match' },
                ].map(r => (
                  <li key={r.text} className={`flex items-center gap-1.5 transition-colors ${r.ok ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                    {r.text}
                  </li>
                ))}
              </ul>

              {/* Error */}
              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {/* Validation inline hint */}
              {validationError && newPwd.length > 0 && !error && (
                <p className="text-xs text-amber-600">{validationError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={isSubmitting || !!validationError}
                >
                  {isSubmitting ? 'Updating…' : 'Set New Password'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground text-xs"
                  onClick={logout}
                >
                  Log out
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
