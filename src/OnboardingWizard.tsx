import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Sparkles, CheckCircle2, Loader2, ArrowRight, ExternalLink } from 'lucide-react';

export default function OnboardingWizard() {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    databaseId: string;
    ownerUid: string;
    temporaryPassword?: string;
    subdomain: string;
    gymName: string;
  } | null>(null);

  // Form State
  const [gymName, setGymName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [enableMobileApp, setEnableMobileApp] = useState(false);

  const handleSubdomainChange = (val: string) => {
    // Keep it lowercase, digits, and hyphens only
    const formatted = val.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(formatted);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gymName || !subdomain || !ownerName || !ownerEmail || !ownerPassword) {
      setError('Please fill in all fields.');
      return;
    }
    
    if (subdomain.length < 3) {
      setError('Subdomain must be at least 3 characters long.');
      return;
    }

    setError('');
    setIsLoading(true);
    setStatusMessage('Initiating GCP resource provisioning...');

    try {
      // Step 1: Call provisioning API
      const response = await fetch('/api/provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenantId: subdomain,
          tenantName: gymName,
          ownerEmail,
          ownerName,
          ownerPassword,
          enableMobileApp,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Provisioning failed.');
      }

      setSuccessData({
        databaseId: result.databaseId,
        ownerUid: result.ownerUid,
        temporaryPassword: ownerPassword,
        subdomain,
        gymName,
      });
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during setup.');
    } finally {
      setIsLoading(false);
      setStatusMessage('');
    }
  };

  if (successData) {
    const loginUrl = `https://${successData.subdomain}.mitrixo.com`;
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-8 w-8 text-primary animate-pulse" />
          <h1 className="text-2xl font-black uppercase tracking-widest text-primary">MITRIXO SYSTEMS</h1>
        </div>

        <Card className="w-full max-w-lg border-zinc-800 bg-zinc-950 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-500">
          <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 w-full animate-pulse" />
          
          <CardHeader className="text-center pt-8">
            <div className="mx-auto h-16 w-16 bg-emerald-950/50 rounded-full flex items-center justify-center border border-emerald-500/25 mb-4">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <CardTitle className="text-3xl font-black text-white uppercase tracking-tight">Gym Provisioned!</CardTitle>
            <CardDescription className="text-zinc-400 mt-2">
              Your system is ready and isolated on your custom subdomain database.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 pb-8">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 space-y-4">
              <div className="flex justify-between border-b border-zinc-800/60 pb-2.5">
                <span className="text-zinc-400 text-sm">Gym Name:</span>
                <span className="text-white font-bold">{successData.gymName}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/60 pb-2.5">
                <span className="text-zinc-400 text-sm">Subdomain:</span>
                <span className="text-emerald-400 font-mono font-bold">{successData.subdomain}.mitrixo.com</span>
              </div>
              <div className="flex justify-between border-b border-zinc-800/60 pb-2.5">
                <span className="text-zinc-400 text-sm">Database Instance:</span>
                <span className="text-zinc-300 font-mono text-xs">{successData.databaseId}</span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-zinc-400 text-sm">Admin Email:</span>
                <span className="text-white font-semibold">{ownerEmail}</span>
              </div>
            </div>

            <div className="pt-2">
              <a 
                href={loginUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-14 bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-lg transition-all rounded-xl shadow-lg shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-2 hover:opacity-95"
              >
                Go to Gym Dashboard
                <ExternalLink className="h-5 w-5" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="mb-6 flex items-center gap-2">
        <Shield className="h-8 w-8 text-primary" />
        <h1 className="text-2xl font-black uppercase tracking-widest text-primary">MITRIXO SYSTEMS</h1>
      </div>

      <Card className="w-full max-w-md border-zinc-800 bg-zinc-950 shadow-2xl relative overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-300">
        <div className="absolute top-0 left-0 h-1 bg-primary w-full" />
        
        <CardHeader className="pb-4">
          <CardTitle className="text-2xl font-black uppercase tracking-tight text-white">Create New Gym CRM</CardTitle>
          <CardDescription className="text-zinc-400">
            Provision a new isolated client database instance and owner credentials.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <Alert variant="destructive" className="bg-destructive/10 border-destructive/20 text-destructive-foreground">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-zinc-300 font-bold uppercase text-xs tracking-wider">Gym/Company Name</Label>
                <Input 
                  value={gymName} 
                  onChange={e => setGymName(e.target.value)} 
                  placeholder="Iron Gym / Gold's Gym" 
                  className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-primary placeholder:text-zinc-600"
                  required 
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-zinc-300 font-bold uppercase text-xs tracking-wider">Desired Subdomain</Label>
                <div className="flex items-center">
                  <Input 
                    value={subdomain} 
                    onChange={e => handleSubdomainChange(e.target.value)} 
                    placeholder="irongym" 
                    className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-primary placeholder:text-zinc-600 rounded-r-none border-r-0"
                    required 
                    disabled={isLoading}
                  />
                  <span className="bg-zinc-900 border border-zinc-800 border-l-0 text-zinc-500 h-11 px-3 flex items-center rounded-r-md text-sm font-semibold select-none">
                    .mitrixo.com
                  </span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">Lowercase letters, numbers, and hyphens only.</p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <input 
                  type="checkbox"
                  id="enable-mobile"
                  checked={enableMobileApp}
                  onChange={e => setEnableMobileApp(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-800 bg-zinc-950 text-primary focus:ring-primary cursor-pointer accent-primary"
                  disabled={isLoading}
                />
                <Label htmlFor="enable-mobile" className="text-zinc-300 font-bold uppercase text-xs tracking-wider cursor-pointer select-none">
                  Request Mobile App & Storefront
                </Label>
              </div>

              <div className="border-t border-zinc-900 my-4 pt-4 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary">Super Admin User</h3>
                
                <div className="space-y-2">
                  <Label className="text-zinc-300 font-bold uppercase text-xs tracking-wider">Admin Name</Label>
                  <Input 
                    value={ownerName} 
                    onChange={e => setOwnerName(e.target.value)} 
                    placeholder="John Doe" 
                    className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-primary placeholder:text-zinc-600"
                    required 
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300 font-bold uppercase text-xs tracking-wider">Admin Email</Label>
                  <Input 
                    type="email"
                    value={ownerEmail} 
                    onChange={e => setOwnerEmail(e.target.value)} 
                    placeholder="owner@yourgym.com" 
                    className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-primary placeholder:text-zinc-600"
                    required 
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-zinc-300 font-bold uppercase text-xs tracking-wider">Admin Password</Label>
                  <Input 
                    type="password"
                    value={ownerPassword} 
                    onChange={e => setOwnerPassword(e.target.value)} 
                    placeholder="••••••••" 
                    className="bg-zinc-900 border-zinc-800 text-white h-11 focus:border-primary placeholder:text-zinc-600"
                    required 
                    minLength={6}
                    disabled={isLoading}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button 
                type="submit" 
                className="w-full h-12 text-md font-black uppercase bg-primary hover:bg-primary/95 text-primary-foreground gap-2 transition-all rounded-xl shadow-md cursor-pointer flex items-center justify-center" 
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Creating Database...</span>
                  </>
                ) : (
                  <>
                    <span>Provision System</span>
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </Button>
              {isLoading && statusMessage && (
                <p className="text-center text-xs text-zinc-500 mt-2 animate-pulse">{statusMessage}</p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
