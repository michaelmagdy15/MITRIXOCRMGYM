import React, { useState, useEffect } from 'react';
import { useCart } from './CartContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { CheckCircle2, Eye, EyeOff, Dumbbell, Flame, Target, Activity, Key, Phone, Mail, ShieldAlert } from 'lucide-react';
import { addDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Client } from '../types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLanguage } from '../contexts/LanguageContext';

export default function Checkout({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const { t } = useLanguage();
  const { items, totalPrice, clearCart } = useCart();
  const { currentUser, loginWithEmail, loginWithMemberId, registerFreeUser } = useAuth();
  const { branding } = useSettings();

  // Dialog Navigation steps
  // If not logged in, we start at 'auth'. Otherwise, we go straight to 'details' or 'payment'.
  const [step, setStep] = useState<'auth' | 'details' | 'payment' | 'success'>('auth');
  const [authTab, setAuthTab] = useState<'signin' | 'register'>('signin');
  const [signinType, setSigninType] = useState<'email' | 'memberId'>('email');

  // Login form state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginMemberId, setLoginMemberId] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Registration form states
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Purchase details form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Instapay' | 'Cash'>('Cash');
  const [instapayRef, setInstapayRef] = useState('');
  const [clientDocId, setClientDocId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-set the initial step when modal opens
  useEffect(() => {
    if (open) {
      if (currentUser) {
        setStep('details');
      } else {
        setStep('auth');
      }
    }
  }, [open, currentUser]);

  // Pre-fill user profile info if logged in
  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name || '');
      setEmail(currentUser.email || '');
      if (currentUser.clientDocId) {
        setClientDocId(currentUser.clientDocId);
      }
      if (currentUser.clientRecordId) {
        const q = query(collection(db, 'clients'), where('memberId', '==', currentUser.clientRecordId.trim()));
        getDocs(q).then(snap => {
          if (!snap.empty && snap.docs[0]) {
            const clientData = snap.docs[0].data();
            if (clientData.phone) setPhone(clientData.phone);
            setClientDocId(snap.docs[0].id);
          }
        }).catch(err => console.error("Error fetching client phone:", err));
      }
    } else {
      setClientDocId(null);
    }
  }, [currentUser]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      if (signinType === 'email') {
        if (!loginEmail || !loginPassword) throw new Error('Email and password are required.');
        await loginWithEmail(loginEmail, loginPassword);
      } else {
        if (!loginMemberId || !loginPassword) throw new Error('Member ID and password are required.');
        await loginWithMemberId(loginMemberId, loginPassword);
      }
      // Success: Firebase auth state updates, triggers the useEffect, advances to 'details'
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regPhone || !regEmail || !regPassword) {
      setError('Please fill in all registration details.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      await registerFreeUser(regEmail, regPassword, {
        name: regName,
        phone: regPhone,
      });
      // Success: Auto-logged in, will advance to 'details' step
    } catch (err: any) {
      setError(err.message || 'Failed to register account.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetailsSubmit = () => {
    if (!name || !phone) {
      setError('Name and phone are required.');
      return;
    }
    setError('');
    setStep('payment');
  };

  const handlePurchaseSubmit = async () => {
    if (paymentMethod === 'Instapay' && (!instapayRef || instapayRef.length !== 12)) {
      setError('Please provide a valid 12-digit Instapay reference number.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const clientId = clientDocId || currentUser?.clientDocId || currentUser?.clientRecordId || 'GUEST-LEAD';
      const companyName = (branding?.companyName && branding.companyName !== 'mitrixogymcrm') ? branding.companyName : 'STRIKE';
      let logoUrlToUse = branding?.logoUrl || '';
      if (!logoUrlToUse || logoUrlToUse === '/mitrixogymcrmlogo.png') {
        logoUrlToUse = `${window.location.origin}/strikelogo.png`;
      }
      const signatureTeamName = companyName.toUpperCase().includes('STRIKE') ? 'Strike Team' : `${companyName} Team`;

      const description = items.map(i => `${i.quantity}x ${i.pkg.name} (${(i.pkg.price * i.quantity).toLocaleString()} EGP)`).join('\n') + 
        `\n\nTotal Price: ${totalPrice.toLocaleString()} EGP` +
        `\nPayment Method: ${paymentMethod}` + 
        (paymentMethod === 'Instapay' ? `\nInstapay Ref: ${instapayRef}` : '');

      // Create a pending purchase task directly in Firestore (bypass context hook to avoid member permission issues)
      await addDoc(collection(db, 'tasks'), {
        title: `Package Purchase Request: ${name}`,
        description,
        dueDate: new Date().toISOString(),
        status: 'Pending',
        priority: 'High',
        clientId,
        assignedTo: '',
        createdBy: currentUser?.id || 'guest',
        createdAt: new Date().toISOString(),
      });

      // Send confirmation email via Firestore trigger
      const buyerEmail = email || regEmail;
      if (buyerEmail) {
        try {
          await addDoc(collection(db, 'mail'), {
            to: buyerEmail,
            message: {
              subject: `Your ${companyName} Booking Request Received`,
              from: `"${companyName}" <info@mitrixogymcrm-egy.com>`,
              html: `
                <div style="background-color: #f8fafc; padding: 40px 10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
                  <div style="max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);">
                    <div style="background-color: #f1f5f9; padding: 40px 30px; text-align: center; border-bottom: 1px solid #e2e8f0;">
                      ${logoUrlToUse
                        ? `<img src="${logoUrlToUse}" alt="${companyName}" style="max-height: 80px; max-width: 240px; object-fit: contain;" />`
                        : `<h1 style="color: #0f172a; margin: 0; font-size: 30px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase;">${companyName}</h1>`
                      }
                      <p style="color: #64748b; margin: 8px 0 0 0; font-size: 13px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase;">Boxing Club</p>
                    </div>
                    <div style="padding: 40px 35px;">
                      <h2 style="color: #0f172a; margin-top: 0; margin-bottom: 16px; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Thank you for your request, ${name}!</h2>
                      <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 12px 0;">Your booking request has been successfully received and is currently pending activation.</p>
                      <p style="color: #0f172a; font-size: 15px; line-height: 1.6; font-weight: bold; margin: 0 0 24px 0;">One of our representatives will contact you shortly to confirm your booking.</p>
                      
                      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #e11d48; border-radius: 8px; padding: 24px; margin: 30px 0;">
                        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 12px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;">Order Summary</h3>
                        <p style="color: #334155; font-size: 15px; white-space: pre-wrap; margin-bottom: 0; line-height: 1.5; font-family: inherit;">${description}</p>
                        
                        <table style="width: 100%; border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 16px; border-collapse: collapse;">
                          <tr>
                            <td style="font-weight: 700; color: #475569; font-size: 15px; text-align: left; padding: 0;">Total Amount:</td>
                            <td style="font-weight: 900; color: #e11d48; font-size: 20px; text-align: right; padding: 0;">${totalPrice.toLocaleString()} EGP</td>
                          </tr>
                        </table>
                      </div>
                      
                      <h3 style="color: #0f172a; font-size: 16px; font-weight: 800; margin-top: 24px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Next Steps</h3>
                      <ul style="color: #475569; font-size: 15px; line-height: 1.7; padding-left: 20px; margin-top: 0; margin-bottom: 24px;">
                        <li style="margin-bottom: 8px;">Visit the branch to complete your payment on the spot.</li>
                        <li style="margin-bottom: 8px;">Your account will be instantly activated upon payment.</li>
                        <li style="margin-bottom: 0;">You will receive your <strong>Member ID</strong> to log in and access all active member features in the app.</li>
                      </ul>
                      
                      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;" />
                      <p style="color: #64748b; font-size: 15px; line-height: 1.5; margin: 0;">Stay sharp,<br/><strong style="color: #0f172a; font-size: 16px;">${signatureTeamName}</strong></p>
                    </div>
                    <div style="background-color: #f8fafc; padding: 24px 30px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0;">
                      <p style="margin: 0;">© ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
                    </div>
                  </div>
                </div>
              `
            }
          });
        } catch (mailErr) {
          // Email sending is non-critical — don't block checkout success
          console.warn("Could not queue confirmation email:", mailErr);
        }
      }

      setStep('success');
      clearCart();
    } catch (err: any) {
      console.error("Purchase error:", err);
      setError('Failed to submit your request. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };


  const resetAndClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep(currentUser ? 'details' : 'auth');
      setName('');
      setPhone('');
      setEmail('');
      setInstapayRef('');
      setError('');
    }, 300);
  };

  return (
    <Dialog open={open} onOpenChange={open ? undefined : resetAndClose}>
      <DialogContent className="w-[95vw] sm:max-w-md bg-card max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Checkout</DialogTitle>
          <DialogDescription>Complete your session package request.</DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive" className="my-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── STEP 1: AUTHENTICATION ── */}
        {step === 'auth' && (
          <Tabs value={authTab} onValueChange={(v) => { setAuthTab(v as any); setError(''); }} className="w-full mt-2">
            <TabsList className="grid w-full grid-cols-2 bg-muted/50">
              <TabsTrigger value="signin" className="font-bold">Sign In</TabsTrigger>
              <TabsTrigger value="register" className="font-bold">Join Club</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4 pt-4">
              <div className="flex justify-center gap-4 bg-muted/30 p-1.5 rounded-lg border text-xs font-bold mb-2">
                <button
                  type="button"
                  onClick={() => setSigninType('email')}
                  className={`flex-1 py-1.5 rounded-md ${signinType === 'email' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() => setSigninType('memberId')}
                  className={`flex-1 py-1.5 rounded-md ${signinType === 'memberId' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
                >
                  Member ID
                </button>
              </div>

              <form onSubmit={handleSignIn} className="space-y-3">
                {signinType === 'email' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="checkout-email">Email Address</Label>
                    <Input id="checkout-email" type="email" placeholder="you@example.com" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="checkout-member-id">Member ID</Label>
                    <Input id="checkout-member-id" placeholder="MEM-001" value={loginMemberId} onChange={e => setLoginMemberId(e.target.value)} required />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="checkout-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="checkout-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={e => setLoginPassword(e.target.value)}
                      className="pr-10"
                      required
                    />
                    <button type="button" onClick={() => setShowLoginPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-4" disabled={isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In & Continue'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="register" className="pt-2">
              <form onSubmit={handleRegisterSubmit} className="space-y-4">
                <div className="space-y-3 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="space-y-1.5">
                    <Label>Full Name</Label>
                    <Input value={regName} onChange={e => setRegName(e.target.value)} placeholder="John Doe" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Phone Number</Label>
                    <Input type="tel" value={regPhone} onChange={e => setRegPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)} placeholder="you@example.com" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Password</Label>
                    <Input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
                  </div>
                  <Button type="submit" className="w-full mt-4 bg-gradient-to-r from-primary to-blue-600 hover:from-primary/95 hover:to-blue-600/95 text-white" disabled={isLoading}>
                    {isLoading ? 'Creating...' : 'Register & Checkout'}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        )}

        {/* ── STEP 2: CONFIRM DETAILS ── */}
        {step === 'details' && (
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-xl flex items-center justify-between border">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase">Selected Packages</p>
                <p className="text-sm font-bold mt-0.5">{items.length} Package(s) in cart</p>
              </div>
              <p className="text-lg font-black text-primary">{totalPrice.toLocaleString()} {t('payments.currency_le')}</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Billing/Member Name</Label>
                <Input placeholder="Enter your full name" value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Phone Number</Label>
                <Input type="tel" placeholder="01XXXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Email Address (For Order Confirmation)</Label>
                <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
            </div>

            <Button className="w-full mt-4" onClick={handleDetailsSubmit}>Continue to Payment</Button>
          </div>
        )}

        {/* ── STEP 3: PAYMENT METHOD ── */}
        {step === 'payment' && (
          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-4 rounded-xl flex justify-between items-center border">
              <span className="font-bold text-sm">Total Price</span>
              <span className="text-xl font-black text-primary">{totalPrice.toLocaleString()} {t('payments.currency_le')}</span>
            </div>

            <div className="space-y-2">
              <Label>Select Payment Method</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v === 'Instapay' ? 'Instapay' : 'Cash')}>
                <SelectTrigger className="h-12 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Instapay">Instapay Transfer</SelectItem>
                  <SelectItem value="Cash">Cash at Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {paymentMethod === 'Instapay' && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="bg-blue-500/10 text-blue-500 text-xs p-3.5 rounded-xl border border-blue-500/20 leading-relaxed">
                  Please transfer <strong>{totalPrice.toLocaleString()} {t('payments.currency_le')}</strong> to Instapay Address: <strong className="select-all text-white">mitrixogymcrm@instapay</strong>, then input your 12-digit transaction reference number below.
                </div>
                <div className="space-y-1.5">
                  <Label>12-Digit Instapay Reference Number</Label>
                  <Input 
                    placeholder="123456789012" 
                    value={instapayRef} 
                    onChange={e => setInstapayRef(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    maxLength={12}
                    className="h-11 rounded-xl text-center font-mono tracking-widest text-md"
                  />
                </div>
              </div>
            )}

            {paymentMethod === 'Cash' && (
              <div className="bg-primary/10 text-primary text-xs p-3.5 rounded-xl border border-primary/20 leading-relaxed">
                You will need to pay the total amount of <strong>{totalPrice.toLocaleString()} {t('payments.currency_le')}</strong> at the Maxim Compound branch to activate your membership and receive your Member ID.
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" className="w-1/3" onClick={() => setStep('details')}>Back</Button>
              <Button className="w-2/3 bg-gradient-to-r from-primary to-rose-600 hover:from-primary/95 hover:to-rose-600/95 font-bold" onClick={handlePurchaseSubmit} disabled={isLoading}>
                {isLoading ? 'Processing...' : 'Confirm Request'}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 4: SUCCESS SCREEN ── */}
        {step === 'success' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center animate-in zoom-in-95 duration-300">
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <h2 className="text-2xl font-black tracking-tight">Request Sent!</h2>
            <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
              Your session booking request has been submitted successfully.
              {(email || regEmail) && " We have sent an order confirmation to your email."}
            </p>
            
            <div className="bg-muted/40 p-4 rounded-2xl border text-xs text-left space-y-2 mt-2 leading-relaxed">
              <p className="font-bold text-foreground">Next steps to activate:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Visit the Maxim Compound branch to settle the payment.</li>
                <li>Your membership will be activated immediately by the staff.</li>
                <li>You will receive your official <strong>Member ID</strong> to log in and unlock premium features like session bookings, QR check-ins, and gym passes.</li>
              </ul>
            </div>
            
            <Button className="w-full mt-4 h-12 font-bold" onClick={resetAndClose}>Back to Storefront</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
