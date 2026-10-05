import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ShieldAlert } from 'lucide-react';
import { ClientPackage, User } from '../types';
import { safeFormatDate, safeIsoDate } from '../utils/dateUtils';

/** Roles allowed to override package validity dates (Inzan date-lock policy). */
export const canOverridePackageDates = (user: User | null | undefined): boolean =>
  !!user && ['manager', 'admin', 'super_admin', 'crm_admin'].includes(user.role);

/** Derives the top-level client fields that mirror the active package. */
export const buildPackageUpdates = (newPkgs: ClientPackage[]): Record<string, unknown> => {
  const activePkg = newPkgs.find(p => p.status === 'Active');
  const updates: Record<string, unknown> = {
    packages: newPkgs,
    sessionsRemaining: activePkg ? (activePkg.sessionsRemaining !== undefined ? activePkg.sessionsRemaining : 0) : 0,
  };
  if (activePkg) {
    updates.packageType = activePkg.packageName || '';
    if (activePkg.startDate) updates.startDate = activePkg.startDate;
    updates.membershipExpiry = activePkg.endDate || '';
  } else {
    updates.packageType = '';
    updates.startDate = '';
    updates.membershipExpiry = '';
  }
  return updates;
};

interface AdjustPackageDatesDialogProps {
  pkg: ClientPackage | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (startIso: string, endIso: string, reason: string) => Promise<void>;
}

/**
 * Admin-only "Adjust Dates" drawer: requires a reason and an explicit confirmation step
 * before a package's validity window can be changed.
 */
export function AdjustPackageDatesDialog({ pkg, onOpenChange, onConfirm }: AdjustPackageDatesDialogProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pkg) {
      setStart(pkg.startDate ? safeFormatDate(pkg.startDate, 'yyyy-MM-dd', '') : '');
      setEnd(pkg.endDate ? safeFormatDate(pkg.endDate, 'yyyy-MM-dd', '') : '');
      setReason('');
      setStep('edit');
      setError(null);
    }
  }, [pkg]);

  const fmt = (v?: string) => (v ? safeFormatDate(v, 'dd MMM yyyy', '—') : '—');

  const handleReview = () => {
    if (!start || !end) { setError('Both start and expiry dates are required.'); return; }
    if (end < start) { setError('Expiry date cannot be before the start date.'); return; }
    if (reason.trim().length < 5) { setError('Please enter a reason (at least 5 characters).'); return; }
    setError(null);
    setStep('confirm');
  };

  const handleConfirm = async () => {
    setSaving(true);
    try {
      await onConfirm(safeIsoDate(start), safeIsoDate(end), reason.trim());
      onOpenChange(false);
    } catch (err) {
      console.error('[AdjustPackageDates] Failed to save:', err);
      setError(err instanceof Error ? err.message : 'Failed to save the new dates.');
      setStep('edit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!pkg} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <ShieldAlert className="h-5 w-5" /> Adjust Package Dates
          </DialogTitle>
        </DialogHeader>
        {pkg && step === 'edit' && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{pkg.packageName}</strong> — currently {fmt(pkg.startDate)} → {fmt(pkg.endDate)}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={start} onChange={e => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry Date</Label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason (required)</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why are these dates being changed?" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button size="sm" onClick={handleReview}>Review Change</Button>
            </div>
          </div>
        )}
        {pkg && step === 'confirm' && (
          <div className="space-y-4 py-2 text-sm">
            <p>
              Confirm changing membership validity from{' '}
              <strong>{fmt(pkg.startDate)} → {fmt(pkg.endDate)}</strong> to{' '}
              <strong className="text-emerald-600">{fmt(start)} → {fmt(end)}</strong>?
            </p>
            <p className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-xl border">
              Reason: {reason}. This change will be recorded in the audit log.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setStep('edit')}>Back</Button>
              <Button size="sm" disabled={saving} className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleConfirm}>
                {saving ? 'Saving...' : 'Confirm Change'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
