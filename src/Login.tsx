import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { useSettings } from './contexts/SettingsContext';
import { sendPasswordReset } from './firebase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { UserRole } from './types';
import { Eye, EyeOff, ShieldCheck, Dumbbell, Users, ArrowLeft, CheckCircle2, Globe } from 'lucide-react';
import { useLanguage } from './contexts/LanguageContext';
import SignupWizard from './SignupWizard';

type View = 'login' | 'signup' | 'signup-success';


interface LoginProps {
  onSwitchToMemberStore?: () => void;
  isSuperAdmin?: boolean;
}

export default function Login({ onSwitchToMemberStore, isSuperAdmin = false }: LoginProps = {}) {
  const { loginWithEmail, loginWithCoachId, loginWithMemberId, submitSignUpRequest, submitPasswordResetRequest, submitMemberPasswordResetRequest, isAuthReady, authError, setAuthError } = useAuth();
  const { branding } = useSettings();
  const { language, toggleLanguage } = useLanguage();

  const [view, setView] = useState<View>('login');

  // Email/password tab
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Coach ID tab
  const [coachId, setCoachId] = useState('');
  const [coachPassword, setCoachPassword] = useState('');
  const [showCoachPassword, setShowCoachPassword] = useState(false);

  // Member ID tab
  const [memberId, setMemberId] = useState('');
  const [memberPassword, setMemberPassword] = useState('');
  const [showMemberPassword, setShowMemberPassword] = useState(false);

  // Sign-up form
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupRole, setSignupRole] = useState<UserRole>('rep');
  const [signupMessage, setSignupMessage] = useState('');

  // Forgot password dialog (staff / coach — email based)
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotName, setForgotName] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);

  // Forgot password dialog (member — ID + phone + real email)
  const [memberForgotOpen, setMemberForgotOpen] = useState(false);
  const [memberForgotId, setMemberForgotId] = useState('');
  const [memberForgotPhone, setMemberForgotPhone] = useState('');
  const [memberForgotEmail, setMemberForgotEmail] = useState('');
  const [memberForgotSubmitted, setMemberForgotSubmitted] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleError = (err: unknown) => {
    const code = (err as any)?.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      setError('Invalid email or password. Please try again.');
    } else if (code === 'auth/too-many-requests') {
      setError('Too many failed attempts. Please wait a moment and try again.');
    } else if (code === 'auth/user-disabled') {
      setError('This account has been disabled. Please contact an administrator.');
    } else {
      setError((err as Error)?.message || 'An error occurred. Please try again.');
    }
  };


  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError('');
    setAuthError(null);
    setIsLoading(true);
    try { await loginWithEmail(email, password); } catch (err) { handleError(err); }
    finally { setIsLoading(false); }
  };

  const handleCoachLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coachId || !coachPassword) { setError('Please enter your Coach ID and password.'); return; }
    setError('');
    setIsLoading(true);
    try { await loginWithCoachId(coachId, coachPassword); } catch (err) { handleError(err); }
    finally { setIsLoading(false); }
  };

  const handleMemberLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId || !memberPassword) { setError('Please enter your Member ID and password.'); return; }
    setError('');
    setIsLoading(true);
    try { await loginWithMemberId(memberId, memberPassword); } catch (err) { handleError(err); }
    finally { setIsLoading(false); }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupName || !signupEmail) { setError('Please fill in all required fields.'); return; }
    setError('');
    setIsLoading(true);
    try {
      await submitSignUpRequest(signupName, signupEmail, signupRole, signupMessage);
      setView('signup-success');
    } catch (err) {
      setError((err as Error)?.message || 'Failed to submit request.');
    } finally {
      setIsLoading(false);
    }
  };

  // Staff/Coach: Send Firebase reset email DIRECTLY — no admin approval
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail) return;
    setIsLoading(true);
    setError('');
    try {
      await sendPasswordReset(forgotEmail.trim());
      setForgotSubmitted(true);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        // Don't reveal if email exists (security best practice)
        setForgotSubmitted(true);
      } else {
        setError(err?.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Member: Verify identity via server, then send Firebase reset email to their real email
  const handleMemberForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberForgotId || !memberForgotPhone || !memberForgotEmail) return;
    setIsLoading(true);
    setError('');
    try {
      // Step 1: Server verifies identity (ID + Phone) and updates auth email
      const resp = await fetch('/api/self-reset-member-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          memberId: memberForgotId.trim(), 
          phone: memberForgotPhone.trim(),
          realEmail: memberForgotEmail.trim()
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data.error || 'Verification failed.');
      }
      // Step 2: Now that auth email is updated, send Firebase reset email
      await sendPasswordReset(memberForgotEmail.trim());
      setMemberForgotSubmitted(true);
    } catch (err) {
      setError((err as Error)?.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (isSuperAdmin) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 md:p-12 font-sans relative overflow-y-auto">
        <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="mb-8 text-center flex flex-col items-center">
            <h1 className="text-4xl font-extralight tracking-[0.2em] uppercase text-rose-500 font-logo">PLATFORM</h1>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-[0.4em] font-logo mt-2">Super Admin Portal</p>
          </div>

          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">Sign In</h1>
            <p className="text-sm text-zinc-400">Enter your platform credentials to access the central registry.</p>
          </div>

          <Card className="border-zinc-800 bg-zinc-950/80 shadow-2xl">
            <CardContent className="pt-6">
              {authError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription className="break-words font-mono text-xs">
                    {authError}
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-email" className="text-zinc-300">Email Address</Label>
                  <Input 
                    id="admin-email"
                    type="email" 
                    placeholder="you@mitrixo.com" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="bg-zinc-900 border-zinc-800 text-white placeholder:text-zinc-500 focus-visible:ring-rose-500"
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="admin-password" className="text-zinc-300">Password</Label>
                  </div>
                  <div className="relative">
                    <Input 
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'} 
                      value={password} 
                      onChange={(e) => setPassword(e.target.value)} 
                      className="bg-zinc-900 border-zinc-800 text-white pr-10 focus-visible:ring-rose-500"
                      required 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)} 
                      className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <Button type="submit" disabled={isLoading} className="w-full bg-rose-600 hover:bg-rose-500 text-white font-bold h-11 rounded-xl">
                  {isLoading ? 'Signing In...' : 'Access Portal'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const Logo = () => (
    <div className="mb-8 text-center flex flex-col items-center">
      {branding.logoUrl ? (
        <img src={branding.logoUrl} alt={branding.companyName} className="h-20 w-auto object-contain mb-4" referrerPolicy="no-referrer" />
      ) : (
        <>
          <h1 className="text-5xl font-extralight tracking-[0.2em] uppercase text-primary font-logo">{branding.companyName}</h1>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.4em] font-logo mt-2">Don't limit your challenges</p>
        </>
      )}
    </div>
  );

  // ── Sign-up success view ──
  if (view === 'signup-success') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Logo />
        <Card className="w-full max-w-md shadow-2xl text-center">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-4">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h2 className="text-xl font-bold">Request Submitted!</h2>
            <p className="text-muted-foreground text-sm">Your sign-up request has been sent to the administrators. You'll be notified once your account is approved.</p>
            <Button variant="outline" onClick={() => setView('login')}>Back to Login</Button>
          </CardContent>
        </Card>

        {onSwitchToMemberStore && (
          <Button 
            variant="outline" 
            onClick={onSwitchToMemberStore} 
            className="mt-4 w-full max-w-md bg-background/50 border-white/10 hover:bg-muted text-xs font-bold h-10 rounded-xl"
          >
            ← Go to Member Storefront
          </Button>
        )}
      </div>
    );
  }

  // ── Sign-up request view ──
  if (view === 'signup') {
    return <SignupWizard onBack={() => { setView('login'); setError(''); }} />;
  }

  // ── Main login view ──
  // ── Main login view ──
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 md:p-12 font-sans relative overflow-y-auto">
      {/* Language toggle — top-right corner */}
      <div className="absolute top-4 right-4 z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="h-9 px-3 text-xs font-bold flex items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 hover:bg-muted text-foreground backdrop-blur-sm"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{language === 'en' ? 'العربية' : 'English'}</span>
        </Button>
      </div>
      <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo */}
        <Logo />

        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Welcome Back</h1>
          <p className="text-sm text-muted-foreground">Select your portal role to sign in to your workspace.</p>
        </div>

          <Card className="border-border/50 shadow-2xl glass-card">
            <CardContent className="pt-6">
              {authError && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription className="break-words font-mono text-xs">
                    {authError}
                  </AlertDescription>
                </Alert>
              )}
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Tabs defaultValue="member" onValueChange={() => { setError(''); setAuthError(null); }}>
                <TabsList className="grid grid-cols-3 w-full mb-6 bg-muted/50 p-1 rounded-lg">
                  <TabsTrigger value="member" className="flex items-center justify-center gap-1.5 text-xs py-2">
                    <Users className="h-3.5 w-3.5" /> Member
                  </TabsTrigger>
                  <TabsTrigger value="coach" className="flex items-center justify-center gap-1.5 text-xs py-2">
                    <Dumbbell className="h-3.5 w-3.5" /> Coach
                  </TabsTrigger>
                  <TabsTrigger value="staff" className="flex items-center justify-center gap-1.5 text-xs py-2">
                    <ShieldCheck className="h-3.5 w-3.5" /> Staff
                  </TabsTrigger>
                </TabsList>

                {/* ── Member Tab ── */}
                <TabsContent value="member" className="space-y-4">
                  <form onSubmit={handleMemberLogin} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="member-id">Member ID</Label>
                      <Input
                        id="member-id"
                        placeholder="e.g. MEM-001"
                        value={memberId}
                        onChange={e => setMemberId(e.target.value)}
                        className="font-mono tracking-wide"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="member-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="member-password"
                          type={showMemberPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={memberPassword}
                          onChange={e => setMemberPassword(e.target.value)}
                          className="pr-10"
                          autoComplete="current-password"
                          required
                        />
                        <button type="button" onClick={() => setShowMemberPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showMemberPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11 text-sm font-semibold bg-gradient-to-r from-primary to-rose-600 hover:from-primary/95 hover:to-rose-600/95 transition-all duration-300" disabled={isLoading}>
                      {isLoading ? 'Signing in...' : 'Sign In as Member'}
                    </Button>
                  </form>
                  <div className="flex items-center justify-between text-xs pt-2">
                    <button
                      className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      onClick={() => {
                        setMemberForgotOpen(true);
                        setMemberForgotSubmitted(false);
                        setMemberForgotId('');
                        setMemberForgotPhone('');
                        setError('');
                      }}
                    >
                      Forgot password?
                    </button>
                    <button className="text-primary hover:text-primary/80 font-semibold underline-offset-4 hover:underline" onClick={() => { setView('signup'); setError(''); }}>
                      Join for Free
                    </button>
                  </div>
                </TabsContent>

                {/* ── Coach Tab ── */}
                <TabsContent value="coach" className="space-y-4">
                  <form onSubmit={handleCoachLogin} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="coach-id">Coach ID</Label>
                      <Input
                        id="coach-id"
                        placeholder="COACH-001"
                        value={coachId}
                        onChange={e => setCoachId(e.target.value.toUpperCase())}
                        className="font-mono tracking-wide"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="coach-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="coach-password"
                          type={showCoachPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={coachPassword}
                          onChange={e => setCoachPassword(e.target.value)}
                          className="pr-10"
                          autoComplete="current-password"
                          required
                        />
                        <button type="button" onClick={() => setShowCoachPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showCoachPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={isLoading}>
                      {isLoading ? 'Signing in...' : 'Sign In as Coach'}
                    </Button>
                  </form>
                  <div className="text-center text-xs pt-2">
                    <button className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" onClick={() => { setForgotOpen(true); setForgotSubmitted(false); setForgotEmail(''); setForgotName(''); }}>
                      Forgot password?
                    </button>
                  </div>
                </TabsContent>

                {/* ── Staff Tab ── */}
                <TabsContent value="staff" className="space-y-4">

                  <form onSubmit={handleEmailLogin} className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-email">Email</Label>
                      <Input id="staff-email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="staff-password">Password</Label>
                      <div className="relative">
                        <Input
                          id="staff-password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          className="pr-10"
                          autoComplete="current-password"
                          required
                        />
                        <button type="button" onClick={() => setShowPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full h-11 text-sm font-semibold" disabled={isLoading}>
                      {isLoading ? 'Signing in...' : 'Sign In'}
                    </Button>
                  </form>

                  <div className="text-center text-xs pt-2">
                    <button className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline" onClick={() => { setForgotOpen(true); setForgotSubmitted(false); setForgotEmail(''); setForgotName(''); }}>
                      Forgot password?
                    </button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {onSwitchToMemberStore && (
            <Button 
              variant="outline" 
              onClick={onSwitchToMemberStore} 
              className="mt-4 w-full bg-background/50 border-white/10 hover:bg-muted text-xs font-bold h-11 rounded-xl"
            >
              ← Go to Member Storefront
            </Button>
          )}

          <div className="text-center text-xs text-muted-foreground/60">
            Made & managed by <a href="https://mitrixo.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors font-medium underline underline-offset-4 decoration-muted-foreground/30 hover:decoration-foreground">mitrixo.com systems</a>
          </div>
        </div>

      {/* ── Forgot Password Dialog (Staff / Coach — email) ── */}
      <Dialog open={forgotOpen} onOpenChange={open => { setForgotOpen(open); if (!open) { setForgotSubmitted(false); setError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
          </DialogHeader>
          {forgotSubmitted ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-semibold">Reset Email Sent!</p>
              <p className="text-sm text-muted-foreground">If an account exists for <strong>{forgotEmail}</strong>, you'll receive a password reset link in your inbox. Check your spam folder too.</p>
              <Button onClick={() => setForgotOpen(false)}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4 py-2">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input type="email" placeholder="you@example.com" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} required />
              </div>
              <p className="text-xs text-muted-foreground">We'll send a password reset link directly to your email — no waiting required.</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForgotOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isLoading || !forgotEmail}>
                  {isLoading ? 'Sending...' : 'Send Reset Link'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Forgot Password Dialog (Member — ID + Phone + Email) ── */}
      <Dialog open={memberForgotOpen} onOpenChange={open => { setMemberForgotOpen(open); if (!open) { setMemberForgotSubmitted(false); setError(''); setMemberForgotEmail(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Member Password</DialogTitle>
          </DialogHeader>
          {memberForgotSubmitted ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-semibold">Reset Link Sent!</p>
              <p className="text-sm text-muted-foreground">
                A password reset link has been sent to <strong>{memberForgotEmail}</strong>. Click the link in the email to set your new password.
              </p>
              <p className="text-xs text-muted-foreground">Don't see it? Check your spam/junk folder.</p>
              <Button onClick={() => setMemberForgotOpen(false)}>Got it</Button>
            </div>
          ) : (
            <form onSubmit={handleMemberForgotPassword} className="space-y-4 py-2">
              {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
              <p className="text-sm text-muted-foreground">
                Verify your identity, then we'll send a password reset link to your email.
              </p>
              <div className="space-y-2">
                <Label>Member ID</Label>
                <Input
                  placeholder="e.g. MEM-001"
                  value={memberForgotId}
                  onChange={e => setMemberForgotId(e.target.value)}
                  className="font-mono tracking-wide"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Phone Number (on file)</Label>
                <Input
                  type="tel"
                  placeholder="e.g. 01012345678"
                  value={memberForgotPhone}
                  onChange={e => setMemberForgotPhone(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Your Email Address</Label>
                <Input
                  type="email"
                  placeholder="you@gmail.com"
                  value={memberForgotEmail}
                  onChange={e => setMemberForgotEmail(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">We'll send the reset link here and save this email to your profile.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setMemberForgotOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={isLoading || !memberForgotId || !memberForgotPhone || !memberForgotEmail}>
                  {isLoading ? 'Verifying...' : 'Send Reset Link'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
