import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, addDoc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { ShiftHandover, User, Branch } from '../types';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, DollarSign, AlertCircle, CheckCircle2, History, SendHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { addAuditLog } from '../services/auditService';

interface ShiftHandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUser: User | null;
  selectedBranch: Branch;
}

export function ShiftHandoverDialog({ open, onOpenChange, currentUser, selectedBranch }: ShiftHandoverDialogProps) {
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [shiftType, setShiftType] = useState<'Morning' | 'Evening' | 'Night'>('Morning');
  const [cashInDrawer, setCashInDrawer] = useState<string>('');
  const [cashCollected, setCashCollected] = useState<string>('');
  const [unresolvedIssues, setUnresolvedIssues] = useState<string>('');
  const [lostAndFoundCount, setLostAndFoundCount] = useState<string>('0');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('new');

  useEffect(() => {
    if (!open) return;
    const q = query(collection(db, 'shiftHandovers'), orderBy('createdAt', 'desc'), limit(15));
    const unsub = onSnapshot(q, (snapshot) => {
      setHandovers(snapshot.docs.map(d => ({ ...d.data(), id: d.id } as ShiftHandover)));
    });
    return () => unsub();
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      const handoverData: Omit<ShiftHandover, 'id'> = {
        shiftDate: new Date().toISOString().substring(0, 10),
        shiftType,
        branch: selectedBranch || 'Main Branch',
        outgoingStaffId: currentUser.id,
        outgoingStaffName: currentUser.name || 'Staff Member',
        cashInDrawer: parseFloat(cashInDrawer) || 0,
        cashCollected: parseFloat(cashCollected) || 0,
        unresolvedIssues: unresolvedIssues.trim() || undefined,
        lostAndFoundCount: parseInt(lostAndFoundCount) || 0,
        status: 'Pending Acknowledgment',
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'shiftHandovers'), handoverData);

      await addAuditLog(
        'CREATE',
        'SHIFT_HANDOVER',
        docRef.id,
        `Shift Handover submitted by ${currentUser.name} (${shiftType} Shift - ${selectedBranch})`,
        currentUser.name,
        { branch: selectedBranch }
      );

      setCashInDrawer('');
      setCashCollected('');
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
        acknowledgedAt: new Date().toISOString()
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Front Desk Shift Handover
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="new">Log New Handover</TabsTrigger>
            <TabsTrigger value="history">Recent Shift Logs ({handovers.length})</TabsTrigger>
          </TabsList>

          {/* New Handover Form */}
          <TabsContent value="new" className="space-y-4 pt-3">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Shift Period</Label>
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

                <div className="space-y-2">
                  <Label>Current Branch</Label>
                  <Input value={selectedBranch || 'All Branches'} disabled className="bg-muted" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cash in Drawer at End of Shift (EGP)</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    <Input
                      type="number"
                      placeholder="e.g. 2500"
                      className="pl-9"
                      value={cashInDrawer}
                      onChange={(e) => setCashInDrawer(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Total Cash Collected During Shift (EGP)</Label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                    <Input
                      type="number"
                      placeholder="e.g. 8400"
                      className="pl-9"
                      value={cashCollected}
                      onChange={(e) => setCashCollected(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Pending Lost & Found Items Logged</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={lostAndFoundCount}
                  onChange={(e) => setLostAndFoundCount(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Operational Notes & Unresolved Guest Issues</Label>
                <Textarea
                  placeholder="Any locker issues, VIP guests expected on next shift, pending cash drop, or maintenance concerns..."
                  rows={4}
                  value={unresolvedIssues}
                  onChange={(e) => setUnresolvedIssues(e.target.value)}
                />
              </div>

              <DialogFooter className="pt-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting || !cashInDrawer || !cashCollected}>
                  <SendHorizontal className="w-4 h-4 mr-2" />
                  {isSubmitting ? 'Submitting...' : 'Submit Shift Handover'}
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
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">{h.shiftType} Shift</span>
                        <Badge variant="outline" className="text-xs">{h.branch}</Badge>
                        {h.status === 'Acknowledged' ? (
                          <Badge className="bg-emerald-600 text-xs gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Acknowledged
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 text-xs">
                            Pending Handoff
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Logged by <span className="font-semibold">{h.outgoingStaffName}</span> on {h.shiftDate} ({format(new Date(h.createdAt), 'hh:mm a')})
                      </p>
                    </div>

                    {h.status === 'Pending Acknowledgment' && currentUser?.id !== h.outgoingStaffId && (
                      <Button size="sm" onClick={() => handleAcknowledge(h.id)}>
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Acknowledge Handover
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 bg-muted/40 rounded-lg text-xs">
                    <div>
                      <span className="text-muted-foreground">Cash in Drawer:</span>
                      <p className="font-semibold text-sm">EGP {h.cashInDrawer.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Shift Cash Collected:</span>
                      <p className="font-semibold text-sm">EGP {h.cashCollected.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Lost & Found:</span>
                      <p className="font-semibold text-sm">{h.lostAndFoundCount || 0} items</p>
                    </div>
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
                      Handover received and acknowledged by {h.incomingStaffName} at {h.acknowledgedAt ? format(new Date(h.acknowledgedAt), 'hh:mm a') : 'N/A'}.
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
