import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';
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
      // Registration successful! Firebase auth state will change and App.tsx will navigate away
    } catch (err: any) {
      setError(err.message || 'Failed to register account.');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center flex flex-col items-center animate-in fade-in duration-300">
        {branding.logoUrl ? (
          <img src={branding.logoUrl} alt={branding.companyName} className="h-20 w-auto object-contain mb-4" />
        ) : (
          <h1 className="text-4xl font-black tracking-tight uppercase text-primary">
            {branding.companyName}
          </h1>
        )}
      </div>

      <Card className="w-full max-w-md shadow-2xl overflow-hidden relative animate-in fade-in slide-in-from-bottom-6 duration-300">
        <div className="absolute top-0 left-0 h-1 bg-primary w-full" />
        
        <CardHeader className="pb-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2 hover:bg-muted/80 rounded-full h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <CardTitle className="text-xl font-bold">Start Your Journey</CardTitle>
              <CardDescription>
                Create a member account to manage your profile and booking passes.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="John Doe" required />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="01XXXXXXXXX" required />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} />
              </div>
            </div>

            <div className="pt-4">
              <Button type="submit" className="w-full h-12 text-md font-bold bg-primary hover:bg-primary/95 text-primary-foreground gap-2 transition-all rounded-xl shadow-md cursor-pointer flex items-center justify-center" disabled={isLoading}>
                {isLoading ? 'Creating Account...' : 'Complete Profile & Join'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
