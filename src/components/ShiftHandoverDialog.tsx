import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { ShiftHandover, User, Branch, Payment } from '../types';
import { useAppContext } from '../context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, DollarSign, AlertCircle, CheckCircle2, SendHorizontal, CreditCard, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { addAuditLog } from '../services/auditService';
import { reconcileShiftDrawer } from '../utils/shiftHandover';

interface ShiftHandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: User | null;
  selectedBranch: Branch;
  payments?: Payment[];
}

export function ShiftHandoverDialog({
  open,
  onOpenChange,
  currentUser,
  selectedBranch,
  payments: propPayments,
}: ShiftHandoverDialogProps) {
  const { payments: contextPayments } = useAppContext();
  const payments = propPayments || contextPayments || [];

  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [shiftType, setShiftType] = useState<'Morning' | 'Evening' | 'Night'>('Morning');
  const [openingFloat, setOpeningFloat] = useState<string>('0');
  const [cashInDrawer, setCashInDrawer] = useState<string>('');
  const [countedCard, setCountedCard] = useState<string>('');
  const [countedInstapay, setCountedInstapay] = useState<string>('');
  const [unresolvedIssues, setUnresolvedIssues] = useState<string>('');
  const [lostAndFoundCount, setLostAndFoundCount] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('new');

  const todayStr = useMemo(() => new Date().toISOString().substring(0, 10), []);

  const reconciliation = useMemo(() => {
    return reconcileShiftDrawer({
      payments,
      shiftDate: todayStr,
      branch: selectedBranch,
      openingFloat: parseFloat(openingFloat) || 0,
      countedCash: parseFloat(cashInDrawer) || 0,
      countedCard: parseFloat(countedCard) || 0,
      countedInstapay: parseFloat(countedInstapay) || 0,
    });
  }, [payments, todayStr, selectedBranch, openingFloat, cashInDrawer, countedCard, countedInstapay]);

  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, 'shiftHandovers'), orderBy('createdAt', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      setHandovers(snapshot.docs.map((d) => ({ ...d.data(), id: d.id } as ShiftHandover)));
    });
    return () => unsub();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const handoverData: Omit<ShiftHandover, 'id'> = {
        shiftDate: todayStr,
        shiftType,
        branch: selectedBranch || 'Main Branch',
        outgoingStaffId: currentUser.id,
        outgoingStaffName: currentUser.name || 'Staff Member',
        openingFloat: reconciliation.openingFloat,
        cashInDrawer: reconciliation.cash.counted,
        cashCollected: reconciliation.cashSales,
        expectedCash: reconciliation.expectedCashInDrawer,
        cashDiscrepancy: reconciliation.cash.discrepancy,
        countedCard: reconciliation.card.counted,
        expectedCard: reconciliation.card.expected,
        cardDiscrepancy: reconciliation.card.discrepancy,
        countedInstapay: reconciliation.instapay.counted,
        expectedInstapay: reconciliation.instapay.expected,
        instapayDiscrepancy: reconciliation.instapay.discrepancy,
        unresolvedIssues: unresolvedIssues.trim() || undefined,
        lostAndFoundCount: parseInt(lostAndFoundCount) || 0,
        status: 'Pending Acknowledgment',
        createdAt: new Date().toISOString(),
      };

      const docRef = await addDoc(collection(db, 'shiftHandovers'), handoverData);

      await addAuditLog(
        'CREATE',
        'SHIFT_HANDOVER',
        docRef.id,
        `Shift Handover submitted by ${currentUser.name} (${shiftType} Shift - ${selectedBranch}) [Status: ${reconciliation.overallStatus}, Cash Diff: ${reconciliation.cash.discrepancy} EGP]`,
        currentUser.name,
        { branch: selectedBranch }
      );

      setCashInDrawer('');
      setCountedCard('');
      setCountedInstapay('');
      setUnresolvedIssues('');
      setActiveTab('history');
    } catch (err) {
      console.error('Failed to submit shift handover:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcknowledge = async (handoverId: string) => {
    if (!currentUser) return;
    try {
      await updateDoc(doc(db, 'shiftHandovers', handoverId), {
        status: 'Acknowledged',
        incomingStaffId: currentUser.id,
        incomingStaffName: currentUser.name,
        acknowledgedAt: new Date().toISOString(),
      });

      await addAuditLog(
        'UPDATE',
        'SHIFT_HANDOVER',
        handoverId,
        `Shift Handover acknowledged by incoming staff: ${currentUser.name}`,
        currentUser.name
      );
    } catch (err) {
      console.error('Failed to acknowledge shift handover:', err);
    }
  };

  const renderDiscrepancyBadge = (diff: number, status: 'BALANCED' | 'SHORTAGE' | 'OVERAGE') => {
    if (status === 'BALANCED') {
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[10px]">
          ✓ Balanced
        </Badge>
      );
    }
    if (status === 'SHORTAGE') {
      return (
        <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]">
          Shortage {diff.toLocaleString()} EGP
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px]">
        Overage +{diff.toLocaleString()} EGP
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Front Desk Shift Handover & Cash-Drawer Reconciliation
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="new">Log & Reconcile Shift</TabsTrigger>
            <TabsTrigger value="history">Recent Shift Logs ({handovers.length})</TabsTrigger>
          </TabsList>

          {/* New Handover Form */}
          <TabsContent value="new" className="space-y-4 pt-3">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Shift Period</Label>
                  <Select value={shiftType} onValueChange={(val: any) => setShiftType(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Morning">Morning Shift</SelectItem>
                      <SelectItem value="Evening">Evening Shift</SelectItem>
                      <SelectItem value="Night">Night Shift</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Current Branch</Label>
                  <Input value={selectedBranch || 'All Branches'} disabled className="bg-muted" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Opening Cash Float (EGP)</Label>
                  <Input
                    type="number"
                    value={openingFloat}
                    onChange={(e) => setOpeningFloat(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Multi-Tender Blind Count Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center justify-between">
                    <span>Counted Cash in Drawer *</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Sys: {reconciliation.expectedCashInDrawer.toLocaleString()}
                    </span>
                  </Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      type="number"
                      placeholder="e.g. 8500"
                      className="pl-8"
                      value={cashInDrawer}
                      onChange={(e) => setCashInDrawer(e.target.value)}
                      required
                    />
                  </div>
                  {cashInDrawer !== '' && renderDiscrepancyBadge(reconciliation.cash.discrepancy, reconciliation.cash.status)}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center justify-between">
                    <span>Visa Terminal Batch Slip</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Sys: {reconciliation.card.expected.toLocaleString()}
                    </span>
                  </Label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      type="number"
                      placeholder="e.g. 12000"
                      className="pl-8"
                      value={countedCard}
                      onChange={(e) => setCountedCard(e.target.value)}
                    />
                  </div>
                  {countedCard !== '' && renderDiscrepancyBadge(reconciliation.card.discrepancy, reconciliation.card.status)}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold flex items-center justify-between">
                    <span>InstaPay Settled Total</span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      Sys: {reconciliation.instapay.expected.toLocaleString()}
                    </span>
                  </Label>
                  <div className="relative">
                    <Smartphone className="w-4 h-4 text-muted-foreground absolute left-3 top-2.5" />
                    <Input
                      type="number"
                      placeholder="e.g. 6000"
                      className="pl-8"
                      value={countedInstapay}
                      onChange={(e) => setCountedInstapay(e.target.value)}
                    />
                  </div>
                  {countedInstapay !== '' &&
                    renderDiscrepancyBadge(reconciliation.instapay.discrepancy, reconciliation.instapay.status)}
                </div>
              </div>

              {/* Live Shift Summary Box */}
              <div className="rounded-xl border border-border/70 bg-muted/30 p-3 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold">
                  <span>Today's Recorded Shift Revenue ({reconciliation.transactionCount} txns)</span>
                  <span className="font-mono text-sm text-primary">
                    {reconciliation.totalRecordedRevenue.toLocaleString()} EGP
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-muted-foreground pt-1">
                  <span>Cash Sales: {reconciliation.cashSales.toLocaleString()} EGP</span>
                  <span>Visa Sales: {reconciliation.card.expected.toLocaleString()} EGP</span>
                  <span>InstaPay: {reconciliation.instapay.expected.toLocaleString()} EGP</span>
                  <span>BNPL/Other: {reconciliation.bnplAndOtherSales.toLocaleString()} EGP</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Pending Lost & Found Items Logged</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={lostAndFoundCount}
                  onChange={(e) => setLostAndFoundCount(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold">Operational Notes & Unresolved Guest Issues</Label>
                <Textarea
                  placeholder="Any locker issues, VIP guests expected on next shift, pending cash drop, or maintenance concerns..."
                  rows={3}
                  value={unresolvedIssues}
                  onChange={(e) => setUnresolvedIssues(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !cashInDrawer}>
                  <SendHorizontal className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Submitting...' : 'Submit & Sign Shift Handover'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          {/* Handover History & Acknowledgments */}
          <TabsContent value="history" className="space-y-4 pt-3">
            {handovers.length === 0 ? (
              <p className="text-center py-8 text-sm text-muted-foreground">No shift handovers recorded yet.</p>
            ) : (
              handovers.map((h) => (
                <Card key={h.id} className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">{h.shiftType} Shift</span>
                        <Badge variant="outline" className="text-xs">
                          {h.branch}
                        </Badge>
                        {h.status === 'Acknowledged' ? (
                          <Badge className="bg-emerald-600 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Acknowledged
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                            Pending Handoff
                          </Badge>
                        )}
                        {typeof h.cashDiscrepancy === 'number' && h.cashDiscrepancy !== 0 && (
                          <Badge className="bg-rose-500/15 text-rose-600 border-rose-500/30 text-[10px]">
                            Cash Diff: {h.cashDiscrepancy > 0 ? `+${h.cashDiscrepancy}` : h.cashDiscrepancy} EGP
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Logged by <span className="font-semibold">{h.outgoingStaffName}</span> on {h.shiftDate} (
                        {format(new Date(h.createdAt), 'hh:mm a')})
                      </p>
                    </div>

                    {h.status === 'Pending Acknowledgment' && currentUser?.id !== h.outgoingStaffId && (
                      <Button size="sm" onClick={() => handleAcknowledge(h.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Acknowledge Handover
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 bg-muted/40 rounded-lg text-xs">
                    <div>
                      <span className="text-muted-foreground">Cash in Drawer:</span>
                      <p className="font-semibold text-sm">EGP {h.cashInDrawer.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Shift Cash Sales:</span>
                      <p className="font-semibold text-sm">EGP {h.cashCollected.toLocaleString()}</p>
                    </div>
                    {typeof h.countedCard === 'number' && (
                      <div>
                        <span className="text-muted-foreground">Visa Batch Slip:</span>
                        <p className="font-semibold text-sm">EGP {h.countedCard.toLocaleString()}</p>
                      </div>
                    )}
                    {typeof h.countedInstapay === 'number' && (
                      <div>
                        <span className="text-muted-foreground">InstaPay Total:</span>
                        <p className="font-semibold text-sm">EGP {h.countedInstapay.toLocaleString()}</p>
                      </div>
                    )}
                  </div>

                  {h.unresolvedIssues && (
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200/70 rounded-lg text-xs space-y-1">
                      <span className="font-semibold text-amber-900 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Shift Notes:
                      </span>
                      <p className="text-amber-950 whitespace-pre-wrap">{h.unresolvedIssues}</p>
                    </div>
                  )}

                  {h.status === 'Acknowledged' && h.incomingStaffName && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Handover received and acknowledged by {h.incomingStaffName} at{' '}
                      {h.acknowledgedAt ? format(new Date(h.acknowledgedAt), 'hh:mm a') : 'N/A'}.
                    </p>
                  )}
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
