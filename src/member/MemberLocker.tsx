import React, { useState, useEffect } from 'react';
import { Client, Locker, LockerRequest } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock, Key, ShieldCheck, HelpCircle, Send, CheckCircle2 } from 'lucide-react';

export default function MemberLocker({ client }: { client: Client | null }) {
  const [assignedLocker, setAssignedLocker] = useState<Locker | null>(null);
  const [pendingRequest, setPendingRequest] = useState<LockerRequest | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [loading, setLoading] = useState(true);

  const branches = ['Heliopolis', 'Fifth Settlement', 'Zamalek', 'Sheikh Zayed'];

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    // 1. Subscribe to lockers assigned to this client
    const lockersQ = query(
      collection(db, 'lockers'),
      where('assignedTo', '==', client.id)
    );
    const unsubLockers = onSnapshot(lockersQ, (snap) => {
      if (!snap.empty && snap.docs[0]) {
        const docSnap = snap.docs[0];
        setAssignedLocker({ id: docSnap.id, ...docSnap.data() } as Locker);
      } else {
        setAssignedLocker(null);
      }
    });

    // 2. Subscribe to pending locker requests by this client
    const requestsQ = query(
      collection(db, 'lockerRequests'),
      where('clientId', '==', client.id),
      where('status', '==', 'Pending')
    );
    const unsubRequests = onSnapshot(requestsQ, (snap) => {
      if (!snap.empty && snap.docs[0]) {
        const docSnap = snap.docs[0];
        setPendingRequest({ id: docSnap.id, ...docSnap.data() } as LockerRequest);
      } else {
        setPendingRequest(null);
      }
      setLoading(false);
    }, (err) => {
      console.error("Error loading locker requests:", err);
      setLoading(false);
    });

    return () => {
      unsubLockers();
      unsubRequests();
    };
  }, [client?.id]);

  const handleRequestLocker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !selectedBranch) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      await addDoc(collection(db, 'lockerRequests'), {
        clientId: client.id,
        clientName: client.name,
        branch: selectedBranch,
        status: 'Pending',
        requestedAt: new Date().toISOString()
      });

      // Write to auditLogs
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} requested a locker room assignment at branch: ${selectedBranch}`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      setSubmitSuccess(true);
      setSelectedBranch('');
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to request locker:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
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
          <Lock className="h-5 w-5 text-primary" /> Smart Locker Integration
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          View your assigned gym locker details or request lockbox access.
        </p>
      </div>

      {assignedLocker ? (
        /* Assigned Locker Details */
        <div className="relative group overflow-hidden rounded-3xl p-0.5 bg-gradient-to-br from-primary via-primary/30 to-background/50 shadow-2xl">
          <div className="absolute inset-0 bg-grid-white/[0.02] rounded-3xl" />
          
          <Card className="relative border-0 rounded-[22px] overflow-hidden bg-zinc-950 text-white shadow-none">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <CardContent className="p-6 space-y-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-400">MITRIXOGYMCRM BOXING CLUB</p>
                  <p className="text-xs font-mono text-primary mt-0.5">SMART LOCKER ACCESS</p>
                </div>
                <Badge className="px-2.5 py-0.5 text-[10px] font-semibold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20" variant="outline">
                  ACTIVE ASSIGNMENT
                </Badge>
              </div>

              {/* Locker info */}
              <div className="flex flex-col items-center py-4 space-y-2">
                <div className="h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 text-primary">
                  <Key className="h-8 w-8" />
                </div>
                <div className="text-center">
                  <span className="text-xs text-zinc-500 uppercase font-bold tracking-widest block">Locker Number</span>
                  <span className="text-3xl font-extrabold tracking-tight text-white">{assignedLocker.number}</span>
                </div>
              </div>

              {/* Digital Lock PIN and Location details */}
              <div className="flex justify-between items-end border-t border-white/5 pt-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">LOCK PIN</span>
                  <strong className="text-xl font-mono tracking-widest text-primary">
                    {assignedLocker.code || '----'}
                  </strong>
                </div>
                <div className="text-right space-y-0.5">
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider block">BRANCH LOCATION</span>
                  <span className="text-xs font-semibold text-zinc-300 uppercase">{assignedLocker.branch}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : pendingRequest ? (
        /* Request Pending Review */
        <Card className="border bg-card/40 shadow-sm">
          <CardContent className="p-6 flex flex-col items-center text-center space-y-4">
            <div className="h-12 w-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <HelpCircle className="h-6 w-6 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-sm font-bold">Locker Assignment Pending</h3>
              <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px]">
                Your request for a locker at the <strong>{pendingRequest.branch}</strong> branch has been submitted and is currently pending administrator approval.
              </p>
            </div>
            <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs px-3 py-1 font-semibold rounded-full">
              STATUS: PENDING APPROVAL
            </Badge>
          </CardContent>
        </Card>
      ) : (
        /* Locker Request Form */
        <Card className="border bg-card/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Send className="h-4 w-4 text-primary" /> Request Locker Access
            </CardTitle>
            <CardDescription className="text-[11px]">
              Request a designated physical locker for storing your sports gear.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRequestLocker} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="branchSelect" className="text-xs font-bold text-muted-foreground">Choose Branch Location</Label>
                <Select value={selectedBranch} onValueChange={(val) => setSelectedBranch(val || '')} required>
                  <SelectTrigger id="branchSelect" className="bg-background">
                    <SelectValue placeholder="Select target branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(br => (
                      <SelectItem key={br} value={br}>
                        {br} Branch
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {submitSuccess && (
                <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Request submitted successfully! Admins will assign a locker shortly.</span>
                </div>
              )}

              <Button type="submit" disabled={isSubmitting || !selectedBranch} className="w-full font-bold">
                {isSubmitting ? 'Submitting...' : 'Submit Request'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Security Guidance Card */}
      <Card className="border border-dashed bg-muted/20">
        <CardContent className="p-4 flex gap-3 text-xs leading-relaxed text-muted-foreground">
          <ShieldCheck className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold text-foreground block">Digital Lock System</span>
            <p>Smart lockers use digital pin locks. Keep your lock PIN private. To open your locker, enter your 4-digit code on the lock keypad followed by the key symbol.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
