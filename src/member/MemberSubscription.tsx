import React, { useState, useEffect } from 'react';
import { Client, Package } from '../types';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreditCard, ShieldAlert, CheckCircle2, History, Send } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useLanguage } from '../contexts/LanguageContext';

interface SubscriptionRequest {
  id: string;
  memberId: string;
  memberName: string;
  currentTier: string;
  requestedTier: string;
  type: 'Upgrade' | 'Downgrade' | 'Change';
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: string;
  notes?: string;
}

export default function MemberSubscription({ client }: { client: Client | null }) {
  const { t } = useLanguage();
  const [availablePackages, setAvailablePackages] = useState<Package[]>([]);
  const [requestsHistory, setRequestsHistory] = useState<SubscriptionRequest[]>([]);
  const [selectedPackageName, setSelectedPackageName] = useState<string>('');
  const [requestNotes, setRequestNotes] = useState<string>('');
  
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (!client?.id) {
      setLoading(false);
      return;
    }

    // 1. Fetch available packages for dropdown
    const packagesRef = collection(db, 'packages');
    const unsubPackages = onSnapshot(packagesRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Package));
      // Filter out packages that are branch-specific if needed, or sort
      setAvailablePackages(list);
    }, (err) => {
      console.error("Error loading packages:", err);
    });

    // 2. Fetch subscription requests for this member
    const requestsQ = query(
      collection(db, 'subscriptionRequests'),
      where('memberId', '==', client.memberId || client.id)
    );
    const unsubRequests = onSnapshot(requestsQ, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as SubscriptionRequest));
      list.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
      setRequestsHistory(list);
      setLoading(false);
    }, (err) => {
      console.error("Error loading requests history:", err);
      setLoading(false);
    });

    return () => {
      unsubPackages();
      unsubRequests();
    };
  }, [client?.id, client?.memberId]);

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client || !selectedPackageName) return;

    setIsSubmitting(true);
    setSubmitSuccess(false);

    try {
      const currentTier = client.packageType || 'None';
      const requestedTier = selectedPackageName;

      // Log request in Firestore
      await addDoc(collection(db, 'subscriptionRequests'), {
        memberId: client.memberId || client.id,
        memberName: client.name,
        currentTier,
        requestedTier,
        type: 'Change', // Generic type
        status: 'Pending',
        requestedAt: new Date().toISOString(),
        notes: requestNotes.trim() || ''
      });

      // Write an audit log entry
      await addDoc(collection(db, 'auditLogs'), {
        action: 'CREATE',
        entityType: 'SYSTEM',
        entityId: client.id,
        details: `Member ${client.name} requested package change to: ${requestedTier}`,
        timestamp: new Date().toISOString(),
        userId: client.portalUserId || client.id,
        userName: client.name,
      });

      setSubmitSuccess(true);
      setSelectedPackageName('');
      setRequestNotes('');

      setTimeout(() => {
        setSubmitSuccess(false);
      }, 3000);

    } catch (err) {
      console.error("Failed to submit request:", err);
      alert("Failed to submit request. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: SubscriptionRequest['status']) => {
    switch (status) {
      case 'Pending':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'Approved':
        return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'Rejected':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      default:
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

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
          <CreditCard className="h-5 w-5 text-primary" /> Subscription Management
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">View your current subscription tier and request membership changes.</p>
      </div>

      {/* Current Package Overview */}
      <Card className="border bg-gradient-to-br from-primary/5 via-card to-card shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Current Membership Tier</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-lg font-bold tracking-tight">{client?.packageType || 'No Active Subscription'}</p>
          {client?.membershipExpiry && (
            <p className="text-xs text-muted-foreground">
              Expires: <strong>{format(parseISO(client.membershipExpiry), 'dd MMM yyyy')}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Upgrade/Downgrade Request Form */}
      <Card className="border bg-card/40 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Request Membership Change
          </CardTitle>
          <CardDescription className="text-[11px]">Choose a target subscription package. Gym administrators will review and approve your request.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmitRequest} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="targetTier" className="text-xs font-bold text-muted-foreground">Select New Package</Label>
              <Select value={selectedPackageName} onValueChange={(val) => setSelectedPackageName(val || '')} required>
                <SelectTrigger id="targetTier" className="bg-background">
                  <SelectValue placeholder="Select target package" />
                </SelectTrigger>
                <SelectContent>
                  {availablePackages.map(pkg => (
                    <SelectItem key={pkg.id} value={pkg.name}>
                      {pkg.name} — {t('payments.currency_le')} {pkg.price} ({pkg.type} Package)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="changeNotes" className="text-xs font-bold text-muted-foreground">Reason / Comments (Optional)</Label>
              <Textarea
                id="changeNotes"
                placeholder="e.g. I would like to upgrade to get more weekly training slots..."
                value={requestNotes}
                onChange={e => setRequestNotes(e.target.value)}
                rows={3}
                className="bg-background resize-none"
              />
            </div>

            {submitSuccess && (
              <div className="bg-green-500/10 border border-green-500/20 text-green-600 p-3 rounded-lg flex items-center gap-2.5 text-xs font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Request submitted successfully! Admins will verify it soon.</span>
              </div>
            )}

            <Button type="submit" disabled={isSubmitting || !selectedPackageName} className="w-full font-bold">
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change Requests History */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold uppercase tracking-widest text-primary flex items-center gap-1.5">
          <History className="h-4 w-4 text-primary" /> Request History
        </h3>
        {requestsHistory.length > 0 ? (
          <div className="space-y-3">
            {requestsHistory.map(req => (
              <Card key={req.id} className="border bg-card/40 shadow-sm">
                <CardContent className="p-4 flex justify-between items-center gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-foreground">Requested: {req.requestedTier}</p>
                    <p className="text-[10px] text-muted-foreground">
                      Current at time: {req.currentTier} · {format(parseISO(req.requestedAt), 'dd MMM yyyy')}
                    </p>
                    {req.notes && (
                      <p className="text-[10px] text-muted-foreground italic mt-1 bg-muted/20 p-2 rounded-lg border">
                        "{req.notes}"
                      </p>
                    )}
                  </div>
                  <Badge className={`border text-xs px-2.5 py-0.5 rounded-full ${getStatusBadge(req.status)}`} variant="outline">
                    {req.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-dashed bg-muted/20">
            <CardContent className="py-8 text-center text-muted-foreground text-xs italic">
              No subscription change requests submitted yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
