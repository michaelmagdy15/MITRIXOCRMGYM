import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { ShieldAlert, CalendarClock, Plus, Minus } from 'lucide-react';
import { addDays, differenceInCalendarDays, parseISO, isValid, format } from 'date-fns';
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
 * Admin-only "Adjust Dates / Change Start Date / Add-Minus Days" drawer:
 * requires a reason and an explicit confirmation step before a package's validity window can be changed.
 */
export function AdjustPackageDatesDialog({ pkg, onOpenChange, onConfirm }: AdjustPackageDatesDialogProps) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [keepDurationOnStartChange, setKeepDurationOnStartChange] = useState(true);
  const [customDaysDelta, setCustomDaysDelta] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pkg) {
      setStart(pkg.startDate ? safeFormatDate(pkg.startDate, 'yyyy-MM-dd', '') : '');
      setEnd(pkg.endDate ? safeFormatDate(pkg.endDate, 'yyyy-MM-dd', '') : '');
      setReason('');
      setCustomDaysDelta('');
      setKeepDurationOnStartChange(true);
      setStep('edit');
      setError(null);
    }
  }, [pkg]);

  const fmt = (v?: string) => (v ? safeFormatDate(v, 'dd MMM yyyy', '—') : '—');

  const handleStartDateChange = (newStartStr: string) => {
    if (keepDurationOnStartChange && start && end && newStartStr) {
      const oldStart = parseISO(start);
      const oldEnd = parseISO(end);
      const nextStart = parseISO(newStartStr);
      if (isValid(oldStart) && isValid(oldEnd) && isValid(nextStart)) {
        const deltaDays = differenceInCalendarDays(nextStart, oldStart);
        const shiftedEnd = format(addDays(oldEnd, deltaDays), 'yyyy-MM-dd');
        setEnd(shiftedEnd);
        if (!reason.trim()) {
          setReason(`Change Start Date: shifted start & expiry by ${deltaDays >= 0 ? `+${deltaDays}` : deltaDays} days`);
        }
      }
    }
    setStart(newStartStr);
  };

  const applyDaysDelta = (days: number) => {
    if (!days || isNaN(days)) return;
    const baseEnd = end ? parseISO(end) : new Date();
    if (!isValid(baseEnd)) return;
    const nextEnd = format(addDays(baseEnd, days), 'yyyy-MM-dd');
    setEnd(nextEnd);
    const label = days > 0 ? `+${days} compensation days added` : `${days} days deducted`;
    setReason(prev => (prev.trim() ? `${prev.trim()} (${label})` : `RedGITS Add/Minus Days: ${label}`));
  };

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
      <DialogContent className="max-w-lg rounded-2xl p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <ShieldAlert className="h-5 w-5" /> Adjust Dates / Change Start / Add-Minus Days
          </DialogTitle>
        </DialogHeader>
        {pkg && step === 'edit' && (
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">{pkg.packageName}</strong> — currently {fmt(pkg.startDate)} → {fmt(pkg.endDate)}
            </p>

            <label className="flex items-center gap-2.5 text-xs bg-amber-500/10 border border-amber-500/30 rounded-xl p-2.5 cursor-pointer">
              <Checkbox
                checked={keepDurationOnStartChange}
                onCheckedChange={(v) => setKeepDurationOnStartChange(!!v)}
              />
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5 text-amber-500" />
                Change Start Date Mode (auto-shift Expiry Date to preserve duration)
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start Date</Label>
                <Input type="date" value={start} onChange={e => handleStartDateChange(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Expiry Date</Label>
                <Input type="date" value={end} onChange={e => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2 p-3 rounded-xl bg-muted/40 border border-border">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                RedGITS Add / Minus Compensation Days (Adjust Expiry)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {[-7, -3, -1, 1, 3, 7, 14, 30].map((d) => (
                  <Button
                    key={d}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={`h-7 px-2 text-xs font-bold ${d > 0 ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400' : 'border-rose-500/40 text-rose-600 dark:text-rose-400'}`}
                    onClick={() => applyDaysDelta(d)}
                  >
                    {d > 0 ? `+${d}d` : `${d}d`}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Input
                  type="number"
                  placeholder="Custom days (e.g. 10)"
                  value={customDaysDelta}
                  onChange={(e) => setCustomDaysDelta(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-emerald-500/40 text-emerald-600"
                  onClick={() => {
                    const n = parseInt(customDaysDelta, 10);
                    if (n) { applyDaysDelta(Math.abs(n)); setCustomDaysDelta(''); }
                  }}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-rose-500/40 text-rose-600"
                  onClick={() => {
                    const n = parseInt(customDaysDelta, 10);
                    if (n) { applyDaysDelta(-Math.abs(n)); setCustomDaysDelta(''); }
                  }}
                >
                  <Minus className="h-3 w-3 mr-1" /> Minus
                </Button>
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
