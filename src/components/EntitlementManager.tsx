import React, { useState } from 'react';
import { useEntitlements, useEntitlementAdjustments } from '../hooks/useEntitlements';
import { Entitlement, EntitlementAdjustment } from '../types/entitlement';
import { refundEntitlement, freezeEntitlement, unfreezeEntitlement } from '../services/entitlementService';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format, parseISO } from 'date-fns';
import { Shield, Snowflake, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

export default function EntitlementManager({ memberId }: { memberId: string }) {
  const { entitlements, loading } = useEntitlements(memberId);
  const { currentUser } = useAuth();
  
  const [selectedEntitlement, setSelectedEntitlement] = useState<Entitlement | null>(null);
  const [actionType, setActionType] = useState<'freeze' | 'unfreeze' | 'refund' | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewHistoryId, setViewHistoryId] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-500/10 text-emerald-500 border-emerald-200/50';
      case 'pending': return 'bg-amber-500/10 text-amber-500 border-amber-200/50';
      case 'frozen': return 'bg-blue-500/10 text-blue-500 border-blue-200/50';
      case 'expired': return 'bg-zinc-500/10 text-zinc-500 border-zinc-200/50';
      case 'cancelled': return 'bg-red-500/10 text-red-500 border-red-200/50';
      default: return 'bg-secondary text-secondary-foreground';
    }
  };

  const handleAction = async () => {
    if (!selectedEntitlement || !actionType || !currentUser?.id) return;
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    setIsSubmitting(true);
    try {
      if (actionType === 'freeze') {
        await freezeEntitlement(selectedEntitlement.id, reason, currentUser.id);
        toast.success("Entitlement frozen successfully.");
      } else if (actionType === 'unfreeze') {
        await unfreezeEntitlement(selectedEntitlement.id, reason, currentUser.id);
        toast.success("Entitlement unfrozen successfully.");
      } else if (actionType === 'refund') {
        await refundEntitlement(selectedEntitlement.id, reason, currentUser.id);
        toast.success("Entitlement refunded and cancelled.");
      }
      setSelectedEntitlement(null);
      setActionType(null);
      setReason('');
    } catch (error: any) {
      toast.error(error.message || "Action failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-muted-foreground animate-pulse">Loading entitlements...</div>;
  }

  if (entitlements.length === 0) {
    return (
      <Card className="border-dashed bg-muted/20">
        <CardContent className="flex flex-col items-center justify-center p-8 text-center">
          <Shield className="h-8 w-8 text-muted-foreground mb-4 opacity-50" />
          <p className="text-muted-foreground font-medium">No entitlements found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">This member has no active or past service entitlements.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {entitlements.map(ent => (
        <Card key={ent.id} className="overflow-hidden border-border/50">
          <CardHeader className="bg-muted/30 pb-4">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  {ent.productName}
                </CardTitle>
                <CardDescription className="mt-1">
                  {ent.type.toUpperCase()} • ID: {ent.id.slice(0, 8)}
                </CardDescription>
              </div>
              <Badge variant="outline" className={getStatusColor(ent.status)}>
                {ent.status.toUpperCase()}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Sessions</p>
                <p className="text-sm font-medium">
                  {ent.sessionsTotal === 'unlimited' ? 'Unlimited' : `${ent.sessionsUsed} / ${ent.sessionsTotal} used`}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Valid From</p>
                <p className="text-sm font-medium">{format(parseISO(ent.validFrom), 'MMM d, yyyy')}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Valid Until</p>
                <p className="text-sm font-medium">
                  {ent.validUntil ? format(parseISO(ent.validUntil), 'MMM d, yyyy') : 'No Expiry'}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">Purchased</p>
                <p className="text-sm font-medium">{format(parseISO(ent.createdAt), 'MMM d, yyyy')}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-border/50">
              {ent.status === 'active' && (
                <Button size="sm" variant="outline" onClick={() => { setSelectedEntitlement(ent); setActionType('freeze'); }}>
                  <Snowflake className="h-4 w-4 mr-2" /> Freeze
                </Button>
              )}
              {ent.status === 'frozen' && (
                <Button size="sm" variant="outline" onClick={() => { setSelectedEntitlement(ent); setActionType('unfreeze'); }}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Unfreeze
                </Button>
              )}
              {(ent.status === 'active' || ent.status === 'pending' || ent.status === 'frozen') && (
                <Button size="sm" variant="outline" className="text-red-500 hover:text-red-600" onClick={() => { setSelectedEntitlement(ent); setActionType('refund'); }}>
                  <AlertCircle className="h-4 w-4 mr-2" /> Refund & Cancel
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setViewHistoryId(viewHistoryId === ent.id ? null : ent.id)}>
                <Clock className="h-4 w-4 mr-2" /> {viewHistoryId === ent.id ? 'Hide History' : 'View History'}
              </Button>
            </div>

            {viewHistoryId === ent.id && (
              <div className="mt-4 pt-4 border-t border-border/50">
                <AdjustmentHistory entitlementId={ent.id} />
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Dialog open={!!selectedEntitlement && !!actionType} onOpenChange={(open) => {
        if (!open) { setSelectedEntitlement(null); setActionType(null); setReason(''); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="capitalize">{actionType} Entitlement</DialogTitle>
            <DialogDescription>
              {actionType === 'refund' && "This will permanently cancel the entitlement and record a refund adjustment."}
              {actionType === 'freeze' && "This will pause the validity of the entitlement until unfrozen."}
              {actionType === 'unfreeze' && "This will reactivate the entitlement and extend its validity by the frozen duration."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason</Label>
              <Input 
                value={reason} 
                onChange={(e) => setReason(e.target.value)}
                placeholder={`Reason for ${actionType}...`}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedEntitlement(null); setActionType(null); }} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button variant={actionType === 'refund' ? 'destructive' : 'default'} onClick={handleAction} disabled={isSubmitting || !reason.trim()}>
              {isSubmitting ? 'Processing...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdjustmentHistory({ entitlementId }: { entitlementId: string }) {
  const { adjustments, loading } = useEntitlementAdjustments(entitlementId);

  if (loading) return <div className="text-sm text-muted-foreground py-2">Loading history...</div>;
  if (adjustments.length === 0) return <div className="text-sm text-muted-foreground py-2">No adjustments recorded.</div>;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Adjustment History</h4>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Amount/Days</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adjustments.map(adj => (
            <TableRow key={adj.id}>
              <TableCell className="text-sm">{format(parseISO(adj.createdAt), 'MMM d, yyyy h:mm a')}</TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">{adj.type}</Badge>
              </TableCell>
              <TableCell className="text-sm">{adj.amount}</TableCell>
              <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">{adj.reason}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
