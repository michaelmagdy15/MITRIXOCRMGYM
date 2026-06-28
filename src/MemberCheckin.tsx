import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAppContext } from './context';
import { useSettings } from './contexts/SettingsContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Branch } from './types';
import { CheckCircle2, AlertCircle, ArrowLeft, Loader2, Smartphone, Hash, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function MemberCheckin() {
  const [searchParams] = useSearchParams();
  const { selfCheckIn } = useAppContext();
  const { branding, branches } = useSettings();
  const navigate = useNavigate();

  const [branch, setBranch] = useState<Branch | ''>((searchParams.get('branch') as Branch) || '');
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branch || !identifier || !pin) return;

    setIsSubmitting(true);
    const res = await selfCheckIn(identifier, pin, branch as Branch);
    setResult(res);
    setIsSubmitting(false);

    if (res.success) {
      // Clear form on success after brief delay
      setTimeout(() => {
        setIdentifier('');
        setPin('');
      }, 2000);
    }
  };

  if (result?.success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-full max-w-md text-center space-y-6"
        >
          <div className="flex justify-center">
            <div className="h-24 w-24 bg-primary/10 rounded-full flex items-center justify-center">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Check-in Successful!</h1>
            <p className="text-xl text-muted-foreground">{result.message}</p>
          </div>
          <Button 
            variant="outline" 
            size="lg" 
            className="w-full h-14 text-lg font-medium"
            onClick={() => setResult(null)}
          >
            Done
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col items-center p-4 pt-12 md:pt-24 gap-8">
      {/* Brand Header */}
      <motion.div 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="flex flex-col items-center space-y-4"
      >
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.companyName} className="h-16 object-contain" />
        ) : (
          <h1 className="text-2xl font-bold">{branding.companyName}</h1>
        )}
        <div className="h-1 w-12 bg-primary rounded-full" />
      </motion.div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-md"
      >
        <Card className="border-none shadow-2xl bg-background/80 backdrop-blur-xl">
          <CardHeader>
            <CardTitle className="text-2xl text-center">Self Check-in</CardTitle>
            <CardDescription className="text-center">
              Please enter your details to record your attendance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Branch Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Branch</Label>
                <div className="grid grid-cols-1 gap-2">
                  {branches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBranch(b)}
                      className={`h-12 px-4 rounded-xl border-2 transition-all flex items-center justify-between font-medium ${
                        branch === b 
                          ? 'border-primary bg-primary/5 text-primary' 
                          : 'border-muted bg-muted/20 text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {b}
                      {branch === b && <CheckCircle2 className="h-5 w-5" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Identifier Input */}
              <div className="space-y-3">
                <Label htmlFor="identifier" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Member ID or Phone</Label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter ID or Phone number"
                    className="h-14 pl-12 text-lg rounded-xl bg-muted/20 border-none focus-visible:ring-2 focus-visible:ring-primary"
                    required
                  />
                </div>
              </div>

              {/* PIN Input */}
              <div className="space-y-3">
                <Label htmlFor="pin" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Daily PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="Enter Daily PIN"
                    className="h-14 pl-12 text-lg rounded-xl bg-muted/20 border-none focus-visible:ring-2 focus-visible:ring-primary"
                    required
                  />
                </div>
                <p className="text-[11px] text-muted-foreground italic text-center">
                  Ask the staff for today's PIN if you don't have it.
                </p>
              </div>

              {result && !result.success && (
                <motion.div 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-start gap-2"
                >
                  <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
                  <span>{result.message}</span>
                </motion.div>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/20"
                disabled={isSubmitting || !branch || !identifier || !pin}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Checking In...
                  </>
                ) : (
                  'Confirm Check-in'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <footer className="mt-12 text-center space-y-2 pb-8">
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Powered by</p>
          <p className="text-sm font-semibold opacity-50">{branding.companyName} CRM</p>
        </footer>
      </motion.div>
    </div>
  );
}

function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
