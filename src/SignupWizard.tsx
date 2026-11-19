import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Clock, AlertCircle } from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import { useSettings } from './contexts/SettingsContext';

interface SignupWizardProps {
  onBack: () => void;
}

export default function SignupWizard({ onBack }: SignupWizardProps) {
  const { registerFreeUser } = useAuth();
  const { branding } = useSettings();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPendingSuccess, setIsPendingSuccess] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !email || !password) {
      setError('Please fill in all details.');
      return;
    }
    setError('');
    setIsLoading(true);

    try {
      await registerFreeUser(email, password, {
        name,
        phone,
      });
      setIsPendingSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to register account.');
      setIsLoading(false);
    }
  };

  if (isPendingSuccess) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 sm:px-6 pt-[max(1.75rem,calc(var(--safe-top)+1rem))] pb-[max(2rem,calc(var(--safe-bottom)+1.5rem))] md:py-12 overflow-x-hidden overflow-y-auto">
        <Card className="w-full max-w-[440px] bg-card/95 border-0 ring-1 ring-border/80 shadow-2xl shadow-black/10 dark:shadow-black/50 rounded-2xl overflow-hidden relative py-0 animate-in fade-in slide-in-from-bottom-6 duration-300">
          <div className="absolute top-0 left-0 h-1 bg-amber-500 w-full" />
          <CardContent className="p-6 sm:p-8 text-center space-y-5">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-amber-500/15 text-amber-600 flex items-center justify-center">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Account Pending Activation</h1>
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                Your account was created. Visit the front desk to complete registration and activate your member pass.
              </p>
            </div>
            <Button data-auth-cta="true" className="w-full h-11 sm:h-12 rounded-xl font-semibold" onClick={onBack}>
              Back to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-4 sm:px-6 pt-[max(1.75rem,calc(var(--safe-top)+1rem))] pb-[max(2rem,calc(var(--safe-bottom)+1.5rem))] md:py-12 overflow-x-hidden overflow-y-auto">
      <div className="mb-5 sm:mb-6 text-center flex flex-col items-center animate-in fade-in duration-300">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.companyName} className="h-11 sm:h-14 max-w-[230px] sm:max-w-[270px] w-auto object-contain dark:brightness-0 dark:invert" referrerPolicy="no-referrer" />
        ) : (
          <h1 className="text-3xl sm:text-4xl font-extralight tracking-[0.22em] uppercase text-primary font-logo">
            {branding.companyName}
          </h1>
        )}
      </div>

      <Card className="w-full max-w-[440px] bg-card/95 border-0 ring-1 ring-border/80 shadow-2xl shadow-black/10 dark:shadow-black/50 rounded-2xl overflow-hidden relative py-0 animate-in fade-in slide-in-from-bottom-6 duration-300">
        <div className="absolute top-0 left-0 h-1 bg-primary w-full" />
        
        <CardHeader className="px-5 sm:px-7 pt-6 pb-2">
          <div className="flex items-start gap-2.5">
            <Button type="button" variant="ghost" size="icon" onClick={onBack} aria-label="Back to login" className="-ml-1.5 hover:bg-muted/80 rounded-full h-10 w-10 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl font-bold">Start Your Journey</CardTitle>
              <CardDescription className="mt-0.5 text-xs sm:text-sm">
                Create a member account to manage your profile and booking passes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-5 sm:px-7 pb-6 sm:pb-7 pt-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive" className="rounded-xl border-destructive/35 bg-destructive/10 px-3.5 py-3 text-destructive flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <AlertDescription className="text-xs sm:text-sm leading-relaxed text-destructive">{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-[13px] font-medium text-foreground/90">Full Name</Label>
                <Input className="h-11 sm:h-12 rounded-xl px-3.5 text-base sm:text-sm bg-background/70 dark:bg-[#131315] border-border/80 placeholder:text-muted-foreground/70" value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-[13px] font-medium text-foreground/90">Phone Number</Label>
                <Input className="h-11 sm:h-12 rounded-xl px-3.5 text-base sm:text-sm bg-background/70 dark:bg-[#131315] border-border/80 placeholder:text-muted-foreground/70" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-[13px] font-medium text-foreground/90">Email</Label>
                <Input className="h-11 sm:h-12 rounded-xl px-3.5 text-base sm:text-sm bg-background/70 dark:bg-[#131315] border-border/80 placeholder:text-muted-foreground/70" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs sm:text-[13px] font-medium text-foreground/90">Password</Label>
                <Input className="h-11 sm:h-12 rounded-xl px-3.5 text-base sm:text-sm bg-background/70 dark:bg-[#131315] border-border/80 placeholder:text-muted-foreground/70" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            </div>

            <div className="pt-2">
              <Button type="submit" data-auth-cta="true" className="w-full h-11 sm:h-12 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground gap-2 transition-all rounded-xl shadow-sm cursor-pointer flex items-center justify-center" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Complete Profile & Join'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
