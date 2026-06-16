import React, { useState, useEffect } from 'react';
import { Client, GuestInvite } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { UserPlus, Copy, Check, Info, Calendar, UserCheck, AlertCircle } from 'lucide-react';

const STATUS_STYLES: Record<string, { badge: string; text: string }> = {
  Pending: { badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20', text: 'Active Invite' },
  Attended: { badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', text: 'Checked In' },
  Expired: { badge: 'bg-red-500/10 text-red-400 border-red-500/20', text: 'Expired' },
};

export default function MemberInvites({ client }: { client: Client | null }) {
  const [invites, setInvites] = useState<GuestInvite[]>([]);
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'guestInvites'),
      where('hostClientId', '==', client.id)
    );

    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      } as GuestInvite));

      // Sort: newest invites first
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setInvites(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading guest invites:", err);
      setLoading(false);
    });

    return unsub;
  }, [client?.id]);

  const generateInviteCode = () => {
    const chars = '0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `ST-${code}`;
  };

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !guestName || !guestPhone || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);
    setGeneratedCode('');

    try {
      const inviteCode = generateInviteCode();

      await addDoc(collection(db, 'guestInvites'), {
        hostClientId: client.id,
        hostName: client.name,
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim(),
        inviteCode: inviteCode,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });

      // Log in audit logs
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} invited guest ${guestName.trim()} (Phone: ${guestPhone.trim()}). Code: ${inviteCode}`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      setGeneratedCode(inviteCode);
      setSubmitSuccess(true);
      setGuestName('');
      setGuestPhone('');
    } catch (err) {
      console.error("Failed to create guest invite:", err);
      alert("Failed to generate invitation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  if (!client) return null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div>
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" /> Send Guest Invite
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Invite friends or family members for a free trial training session at mitrixogymcrm.
        </p>
      </div>

      {/* Invite Creation Form */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> Generate Trial Code
          </CardTitle>
          <CardDescription className="text-[11px]">
            Input details of your guest to issue an invite pass code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateInvite} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="guestName" className="text-xs font-bold text-muted-foreground">Guest Name</Label>
              <Input
                id="guestName"
                type="text"
                placeholder="Enter full name"
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="guestPhone" className="text-xs font-bold text-muted-foreground">Guest Phone Number</Label>
              <Input
                id="guestPhone"
                type="tel"
                placeholder="e.g. +201012345678"
                value={guestPhone}
                onChange={e => setGuestPhone(e.target.value)}
                required
                className="bg-background"
              />
            </div>

            {submitSuccess && generatedCode && (
              <div className="bg-primary/10 border border-primary/20 text-primary p-4 rounded-2xl space-y-2.5 animate-in zoom-in-95">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                  <UserCheck className="h-4 w-4" /> Guest Pass Generated!
                </div>
                <div className="flex justify-between items-center bg-zinc-950 p-3 rounded-xl border border-zinc-800">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold block uppercase tracking-wider">PASS CODE</span>
                    <strong className="text-xl font-mono tracking-widest text-white">{generatedCode}</strong>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopyCode(generatedCode, 'new-invite')}
                    className="h-8 w-8 text-zinc-400 hover:text-white"
                  >
                    {copiedCodeId === 'new-invite' ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-[10px] text-zinc-400 leading-normal">
                  Share this code with your guest. They should show this code to the front desk receptionist when checking in.
                </p>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting} className="w-full font-bold">
              {isSubmitting ? 'Generating Pass...' : 'Create Invite Code'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Guest Policy Info */}
      <Card className="border border-dashed bg-muted/20">
        <CardContent className="p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-foreground block">Guest Trial Policy</span>
            <p>Each guest code entitles one non-member to a single free trial session. Guests must present their code upon arrival. Checked-in guest profiles are registered in our CRM pipeline as leads.</p>
          </div>
        </CardContent>
      </Card>

      {/* Active & Past Invites History */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-primary" /> Invitation History
        </h3>

        {invites.length > 0 ? (
          <div className="space-y-3">
            {invites.map(invite => {
              const style = STATUS_STYLES[invite.status] || { badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20', text: invite.status };
              const dateObj = new Date(invite.createdAt);
              return (
                <Card key={invite.id} className="border bg-card/40 hover:bg-card/75 transition-colors shadow-sm">
                  <CardContent className="p-4 flex justify-between items-center gap-4">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-foreground truncate">{invite.guestName}</span>
                        <Badge className={`border text-[9px] px-1.5 py-0 rounded-full font-bold ${style.badge}`} variant="outline">
                          {style.text}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-semibold">Phone: {invite.guestPhone}</p>
                      <p className="text-[9px] text-zinc-500 font-mono">
                        Created: {dateObj.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>

                    {/* Invite Code Box */}
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <div className="bg-zinc-950 px-2.5 py-1.5 rounded-lg border border-zinc-800 flex items-center gap-2">
                        <span className="font-mono text-xs font-bold tracking-wider text-primary">{invite.inviteCode}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(invite.inviteCode, invite.id)}
                          className="text-zinc-500 hover:text-zinc-300"
                        >
                          {copiedCodeId === invite.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No recent invitations generated.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
