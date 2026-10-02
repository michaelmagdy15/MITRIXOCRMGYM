import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { auth, getTenantId } from '../../firebase';
import { Client } from '../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Link2, UserCheck, UserPlus, Search, CheckCircle2, 
  AlertCircle, Loader2, Sparkles, MessageCircle, ShieldCheck 
} from 'lucide-react';

interface MemberAccountLinkCardProps {
  onClientLinked: (client: Client) => void;
}

export const MemberAccountLinkCard: React.FC<MemberAccountLinkCardProps> = ({ onClientLinked }) => {
  const { currentUser, refreshUserData } = useAuth();
  const { branding, branches } = useSettings();

  const [activeTab, setActiveTab] = useState<'link' | 'create'>('link');
  
  // Link existing state
  const [searchTerm, setSearchTerm] = useState(currentUser?.phone || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [foundClient, setFoundClient] = useState<Client | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);

  // Create new state
  const [newName, setNewName] = useState(currentUser?.name && currentUser.name !== 'New User' ? currentUser.name : '');
  const [newPhone, setNewPhone] = useState(currentUser?.phone || '');
  const [newBranch, setNewBranch] = useState(branches?.[0] || 'Maxim Compound');
  const [isCreating, setIsCreating] = useState(false);

  // Search for existing client via secure server endpoint
  const handleSearchClient = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const term = searchTerm.trim();
    if (!term) {
      setSearchError('Please enter a Member ID, phone number, or email.');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setFoundClient(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const tenantId = getTenantId();
      const res = await fetch('/api/member/search-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ searchTerm: term, tenantId })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to search member records.');
      }

      if (data.found && data.client) {
        setFoundClient(data.client as Client);
      } else {
        setSearchError(data.message || 'No matching member profile found. You can create a new profile or ask reception.');
      }
    } catch (err: any) {
      console.error('Error searching clients:', err);
      setSearchError(err.message || 'Failed to search member records. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Link account to found client via secure server endpoint
  const handleConfirmLink = async () => {
    if (!foundClient || (!currentUser?.id && !auth.currentUser?.uid)) return;
    setIsLinking(true);
    setSearchError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const tenantId = getTenantId();
      const res = await fetch('/api/member/link-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          clientId: foundClient.id,
          memberId: foundClient.memberId,
          tenantId
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to link account.');
      }

      await refreshUserData?.();

      setLinkSuccess(true);
      setTimeout(() => {
        onClientLinked(data.client || foundClient);
      }, 600);
    } catch (err: any) {
      console.error('Error linking account:', err);
      setSearchError(err.message || 'Failed to link account. Please try again.');
      setIsLinking(false);
    }
  };

  // Create new client and link via secure server endpoint
  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setSearchError('Please enter your full name.');
      return;
    }
    if (!currentUser?.id && !auth.currentUser?.uid) return;

    setIsCreating(true);
    setSearchError(null);

    try {
      const token = await auth.currentUser?.getIdToken();
      const tenantId = getTenantId();
      const res = await fetch('/api/member/create-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim() || currentUser?.phone || '',
          branch: newBranch || (branches?.[0] || 'Maxim Compound'),
          tenantId
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create profile.');
      }

      await refreshUserData?.();

      setLinkSuccess(true);
      setTimeout(() => {
        onClientLinked(data.client);
      }, 600);
    } catch (err: any) {
      console.error('Error creating client profile:', err);
      setSearchError(err.message || 'Failed to create profile. Please try again.');
      setIsCreating(false);
    }
  };

  const gymName = branding?.companyName || 'Gym';
  const whatsappPhone = (branding as any)?.whatsappNumber || '201000000000';
  const whatsappUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(
    `Hello ${gymName}, I am trying to connect my member account. My phone number is: ${currentUser?.phone || searchTerm || ''}`
  )}`;

  return (
    <Card className="border-border shadow-lg rounded-2xl overflow-hidden bg-card/95 backdrop-blur-sm">
      <CardHeader className="text-center pb-4 pt-6 bg-gradient-to-b from-primary/10 via-background to-background">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/15 border border-primary/30 flex items-center justify-center text-primary mb-3">
          <Sparkles className="w-6 h-6 animate-pulse" />
        </div>
        <CardTitle className="text-xl font-bold tracking-tight">Connect Your Membership</CardTitle>
        <CardDescription className="text-xs max-w-xs mx-auto">
          Link your gym profile to access your Digital QR Pass, Class Bookings, and Packages.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5 space-y-4">
        {searchError && (
          <div className="p-3 text-xs bg-destructive/10 border border-destructive/20 text-destructive rounded-xl flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{searchError}</div>
          </div>
        )}

        {linkSuccess && (
          <div className="p-4 text-xs bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl flex items-center justify-center gap-2 animate-in zoom-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 animate-bounce" />
            <span className="font-bold text-sm">Account Linked Successfully! Loading...</span>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full">
          <TabsList className="grid grid-cols-2 mb-4">
            <TabsTrigger value="link" className="text-xs font-bold gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              Link Existing
            </TabsTrigger>
            <TabsTrigger value="create" className="text-xs font-bold gap-1.5">
              <UserPlus className="w-3.5 h-3.5" />
              New Member Pass
            </TabsTrigger>
          </TabsList>

          {/* ─── TAB 1: LINK EXISTING MEMBER ─── */}
          <TabsContent value="link" className="space-y-4 pt-1">
            {!foundClient ? (
              <form onSubmit={handleSearchClient} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="search-input" className="text-xs font-semibold">
                    Gym Member ID or Registered Phone
                  </Label>
                  <div className="relative">
                    <Input
                      id="search-input"
                      placeholder="e.g. MEM-1001 or 01000680580"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10 text-sm"
                      autoFocus
                    />
                    <Button 
                      type="submit" 
                      size="icon" 
                      variant="ghost" 
                      className="absolute right-1 top-1 h-7 w-7 text-muted-foreground"
                      disabled={isSearching}
                    >
                      {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Enter the Member ID or mobile number you registered with at the gym.
                  </p>
                </div>

                <Button type="submit" disabled={isSearching || !searchTerm.trim()} className="w-full font-bold">
                  {isSearching ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                  Find My Membership
                </Button>
              </form>
            ) : (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Profile Found
                    </span>
                    <Badge variant="outline" className="text-xs font-mono border-primary/30 text-primary">
                      {foundClient.memberId || foundClient.id}
                    </Badge>
                  </div>

                  <div>
                    <h4 className="font-bold text-base text-foreground">{foundClient.name}</h4>
                    <p className="text-xs text-muted-foreground font-mono">
                      {foundClient.phone || 'No phone'} {foundClient.email ? `• ${foundClient.email}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Badge variant={foundClient.status === 'Active' ? 'default' : 'secondary'} className="text-[11px]">
                      {foundClient.status || 'Active'}
                    </Badge>
                    {foundClient.branch && (
                      <span className="text-xs text-muted-foreground">• {foundClient.branch}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => { setFoundClient(null); setSearchError(null); }}
                    className="flex-1"
                    disabled={isLinking}
                  >
                    Try Another
                  </Button>
                  <Button 
                    onClick={handleConfirmLink} 
                    disabled={isLinking}
                    className="flex-1 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {isLinking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserCheck className="w-4 h-4 mr-2" />}
                    Confirm & Link
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ─── TAB 2: CREATE NEW MEMBER PROFILE ─── */}
          <TabsContent value="create" className="space-y-3 pt-1">
            <form onSubmit={handleCreateClient} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="new-name" className="text-xs font-semibold">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="new-name"
                  placeholder="e.g. Captain Mohamed"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-phone" className="text-xs font-semibold">
                  Mobile Phone Number
                </Label>
                <PhoneInput
                  id="new-phone"
                  value={newPhone}
                  onChange={(val) => setNewPhone(val)}
                />
              </div>

              {branches && branches.length > 1 && (
                <div className="space-y-1.5">
                  <Label htmlFor="new-branch" className="text-xs font-semibold">Gym Branch</Label>
                  <select
                    id="new-branch"
                    value={newBranch}
                    onChange={(e) => setNewBranch(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    {branches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              <Button type="submit" disabled={isCreating || !newName.trim()} className="w-full font-bold">
                {isCreating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />}
                Create Member Pass
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        {/* ─── FRONT DESK ASSISTANCE ─── */}
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-primary" />
            Front desk support
          </span>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp Reception
          </a>
        </div>
      </CardContent>
    </Card>
  );
};
