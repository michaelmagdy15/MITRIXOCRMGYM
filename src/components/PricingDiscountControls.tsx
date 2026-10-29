import React, { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculatePricing, DiscountType, DiscountReason, DISCOUNT_REASONS, formatCurrencyAmount } from '../utils/pricing';
import { isTenantInzan } from '../utils/inzanOrg';
import { getTenantId } from '../firebase';

export interface PricingControlsState {
  discountType: DiscountType;
  discountValue: string;
  amountPaid: string;
  discountReason: DiscountReason;
  discountExplanation?: string;
  discountReasonText: string;
  corporateProofUrl: string;
  corporateCompanyId?: string;
  corporateCompanyName?: string;
}

export const DEFAULT_PRICING_STATE: PricingControlsState = {
  discountType: 'none',
  discountValue: '',
  amountPaid: '',
  discountReason: 'Standard',
  discountExplanation: '',
  discountReasonText: '',
  corporateProofUrl: '',
  corporateCompanyId: '',
  corporateCompanyName: '',
};

export const QUICK_DISCOUNT_REASONS = [
  'Corporate Deal',
  'Family / Sibling',
  'Management Discretion',
  'Promo / Campaign',
  'Retention / Renewal',
  'Other',
] as const;

export function validateDiscountJustification(state: PricingControlsState): { valid: boolean; error?: string } {
  if (!state || state.discountType === 'none' || !state.discountValue || Number(state.discountValue) <= 0) {
    return { valid: true };
  }
  const explanation = String(state.discountReasonText || state.discountExplanation || '').trim();
  if (explanation.length < 3) {
    return {
      valid: false,
      error: 'Discount reason is mandatory when applying a discount.',
    };
  }
  return { valid: true };
}

export interface PricingDiscountControlsProps {
  /** Catalogue/gross amount before discount. */
  grossAmount: number;
  /** Current control state (strings for inputs). */
  value: PricingControlsState;
  /** Called whenever state or computed pricing changes. */
  onChange: (state: PricingControlsState, pricing: ReturnType<typeof calculatePricing>) => void;
  /** Whether the current user may apply a custom discount. */
  canApplyDiscount: boolean;
  /** Currency label. */
  currency?: string;
  /** Credit already paid from a previous package (upgrade flow). */
  upgradeCredit?: number;
  /** Show the partial-payment "Amount Paid" input. */
  showAmountPaid?: boolean;
  /** Show discount reason selector. */
  showReason?: boolean;
  /** Show corporate proof upload for Inzan corporate discounts. */
  showCorporateProof?: boolean;
  /** Injected corporate proof upload UI (keeps this component free of storage logic). */
  corporateProofUploader?: React.ReactNode;
  /** Unique id prefix for labels/inputs. */
  idPrefix?: string;
}

export const PricingDiscountControls: React.FC<PricingDiscountControlsProps> = ({
  grossAmount,
  value,
  onChange,
  canApplyDiscount,
  currency = 'LE',
  upgradeCredit = 0,
  showAmountPaid = true,
  showReason = true,
  showCorporateProof = false,
  corporateProofUploader,
  idPrefix = 'pricing',
}) => {
  const isInzan = isTenantInzan() || getTenantId().toLowerCase().includes('inzan');

  const pricing = useMemo(() => {
    return calculatePricing({
      grossAmount,
      upgradeCredit,
      discountType: value.discountType,
      discountValue: value.discountValue ? Number(value.discountValue) : undefined,
      amountPaid: value.amountPaid ? Number(value.amountPaid) : undefined,
      discountReasonText: value.discountReasonText || value.discountExplanation,
    });
  }, [grossAmount, upgradeCredit, value.discountType, value.discountValue, value.amountPaid, value.discountReasonText, value.discountExplanation]);

  // Sync pricing to parent if external grossAmount or upgradeCredit changes
  useEffect(() => {
    onChange(value, pricing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grossAmount, upgradeCredit]);

  const updateState = (next: PricingControlsState) => {
    const nextPricing = calculatePricing({
      grossAmount,
      upgradeCredit,
      discountType: next.discountType,
      discountValue: next.discountValue ? Number(next.discountValue) : undefined,
      amountPaid: next.amountPaid ? Number(next.amountPaid) : undefined,
      discountReasonText: next.discountReasonText || next.discountExplanation,
    });
    onChange(next, nextPricing);
  };

  const handleChipClick = (chip: string) => {
    const current = (value.discountReasonText || value.discountExplanation || '').trim();
    let nextText = '';
    if (!current) {
      nextText = chip;
    } else {
      const existingChip = QUICK_DISCOUNT_REASONS.find(
        (c) => current === c || current.startsWith(`${c} - `) || current.startsWith(`${c}: `)
      );
      if (existingChip) {
        if (existingChip === chip) return;
        if (current === existingChip) {
          nextText = chip;
        } else if (current.startsWith(`${existingChip} - `)) {
          nextText = `${chip} - ${current.slice(existingChip.length + 3)}`;
        } else if (current.startsWith(`${existingChip}: `)) {
          nextText = `${chip}: ${current.slice(existingChip.length + 2)}`;
        } else {
          nextText = `${chip} - ${current}`;
        }
      } else {
        nextText = `${chip} - ${current}`;
      }
    }
    updateState({
      ...value,
      discountReasonText: nextText,
      discountExplanation: nextText,
    });
  };

  const setField = <K extends keyof PricingControlsState>(field: K, fieldValue: PricingControlsState[K]) => {
    updateState({ ...value, [field]: fieldValue });
  };

  const discountTypeId = `${idPrefix}-discount-type`;
  const discountValueId = `${idPrefix}-discount-value`;
  const amountPaidId = `${idPrefix}-amount-paid`;
  const discountReasonId = `${idPrefix}-discount-reason`;

  return (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-muted/20 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Price Breakdown</span>
        <span className="text-sm font-semibold font-mono text-emerald-600 dark:text-emerald-400">
          {formatCurrencyAmount(grossAmount, currency)}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor={discountTypeId} className="text-xs font-semibold">Discount Type</Label>
          <Select
            value={value.discountType}
            onValueChange={(v) => {
              const dt = v as DiscountType;
              const next: PricingControlsState = {
                ...value,
                discountType: dt,
                discountValue: dt === 'none' ? '' : value.discountValue,
                discountReason: dt === 'none' ? 'Standard' : value.discountReason,
                discountReasonText: dt === 'none' ? '' : value.discountReasonText,
                discountExplanation: dt === 'none' ? '' : value.discountExplanation,
              };
              updateState(next);
            }}
            disabled={!canApplyDiscount}
          >
            <SelectTrigger id={discountTypeId} className="h-10 rounded-xl bg-background/80">
              <SelectValue placeholder="No Discount" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Discount</SelectItem>
              <SelectItem value="percentage">Percentage (%)</SelectItem>
              <SelectItem value="amount">Fixed Amount ({currency})</SelectItem>
            </SelectContent>
          </Select>
          {!canApplyDiscount && (
            <p className="text-[10px] text-muted-foreground">You do not have permission to apply discounts.</p>
          )}
        </div>

        {value.discountType !== 'none' && (
          <div className="space-y-1.5">
            <Label htmlFor={discountValueId} className="text-xs font-semibold">
              {value.discountType === 'percentage' ? 'Discount %' : `Discount (${currency})`}
            </Label>
            <Input
              id={discountValueId}
              type="number"
              min={0}
              max={value.discountType === 'percentage' ? 100 : grossAmount}
              step={value.discountType === 'percentage' ? 1 : 0.01}
              placeholder={value.discountType === 'percentage' ? 'e.g. 15' : 'e.g. 500'}
              className="h-10 rounded-xl bg-background/80 font-mono"
              value={value.discountValue}
              onChange={(e) => setField('discountValue', e.target.value)}
              disabled={!canApplyDiscount}
            />
          </div>
        )}
      </div>

      {showAmountPaid && (
        <div className="space-y-1.5">
          <Label htmlFor={amountPaidId} className="text-xs font-semibold">Amount Paid Now ({currency})</Label>
          <Input
            id={amountPaidId}
            type="number"
            min={0}
            step={0.01}
            placeholder={pricing.netAmount.toFixed(2)}
            className="h-10 rounded-xl bg-background/80 font-mono font-bold"
            value={value.amountPaid}
            onChange={(e) => setField('amountPaid', e.target.value)}
          />
          {value.amountPaid && Number(value.amountPaid) < pricing.netAmount && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              Partial payment. Remaining balance: {formatCurrencyAmount(pricing.remainingBalance, currency)}
            </p>
          )}
        </div>
      )}

      {showReason && value.discountType !== 'none' && (
        <div className="space-y-1.5">
          <Label htmlFor={discountReasonId} className="text-xs font-semibold">Discount Category</Label>
          <Select
            value={value.discountReason}
            onValueChange={(v) => setField('discountReason', v as DiscountReason)}
          >
            <SelectTrigger id={discountReasonId} className="h-10 rounded-xl bg-background/80">
              <SelectValue placeholder="Select reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Standard">Standard</SelectItem>
              {DISCOUNT_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>{reason}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {value.discountType !== 'none' && Number(value.discountValue) > 0 && (
        <div className="space-y-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${idPrefix}-discount-reason-text`} className="text-xs font-semibold flex items-center gap-1.5">
              <span>Discount Reason / Justification</span>
              <span className="text-destructive font-bold text-xs">* Required</span>
            </Label>
            {(value.discountReasonText || value.discountExplanation || '').trim().length >= 3 ? (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                ✓ Validated
              </span>
            ) : (
              <span className="text-[10px] text-destructive font-semibold">
                * Required
              </span>
            )}
          </div>

          {/* Quick-select chips/tags */}
          <div className="space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">Quick Select:</span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_DISCOUNT_REASONS.map((chip) => {
                const text = (value.discountReasonText || value.discountExplanation || '').trim();
                const isSelected = text === chip || text.startsWith(`${chip} - `) || text.startsWith(`${chip}: `);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-all font-medium cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm font-semibold'
                        : 'bg-background/90 hover:bg-muted border-border/70 text-foreground/80 hover:text-foreground'
                    }`}
                  >
                    {chip}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Text input / textarea for specific explanation */}
          <div className="space-y-1">
            <Input
              id={`${idPrefix}-discount-reason-text`}
              type="text"
              placeholder="e.g. Approved by GM for CIB employee"
              className={`h-10 rounded-xl bg-background/90 text-xs ${
                (!value.discountReasonText && !value.discountExplanation) ||
                (value.discountReasonText || value.discountExplanation || '').trim().length < 3
                  ? 'border-destructive/70 ring-1 ring-destructive/30'
                  : 'border-emerald-500/50'
              }`}
              value={value.discountReasonText || value.discountExplanation || ''}
              onChange={(e) => {
                const val = e.target.value;
                updateState({
                  ...value,
                  discountReasonText: val,
                  discountExplanation: val,
                });
              }}
            />
            {((!value.discountReasonText && !value.discountExplanation) ||
              (value.discountReasonText || value.discountExplanation || '').trim().length < 3) && (
              <p className="text-[11px] font-medium text-destructive">
                * Discount reason is mandatory when applying a discount (minimum 3 characters).
              </p>
            )}
          </div>
        </div>
      )}

      {showCorporateProof && value.discountReason === 'Corporate' && (
        <div className="space-y-1.5">
          <span className="text-xs font-semibold">Corporate Proof Document</span>
          {corporateProofUploader ? (
            corporateProofUploader
          ) : (
            <p className="text-[10px] text-muted-foreground">Attach corporate proof using the upload control provided by the caller.</p>
          )}
          {!value.corporateProofUrl && (
            <p className="text-[10px] text-destructive">Corporate discounts require a proof document.</p>
          )}
        </div>
      )}

      {/* Visual Summary: Package Cost | Discount | Paid Amount | Unpaid (Red Border) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center pt-1">
        <div className="p-2.5 rounded-xl bg-background/80 border border-border/50">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Package Cost</span>
          <span className="text-sm sm:text-base font-bold font-mono">{formatCurrencyAmount(pricing.grossAmount, currency)}</span>
        </div>
        <div className="p-2.5 rounded-xl bg-background/80 border border-border/50">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Discount</span>
          <span className="text-sm sm:text-base font-bold font-mono text-rose-500">
            {pricing.discountAmount > 0 ? `-${formatCurrencyAmount(pricing.discountAmount, currency)}` : `0 ${currency}`}
          </span>
        </div>
        <div className="p-2.5 rounded-xl bg-background/80 border border-border/50">
          <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Paid Amount *</span>
          <span className="text-sm sm:text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatCurrencyAmount(pricing.amountPaid, currency)}
          </span>
        </div>
        <div className="p-2.5 rounded-xl border-2 border-rose-500/80 bg-rose-500/5 shadow-sm ring-1 ring-rose-500/20">
          <span className="text-[10px] text-rose-500 uppercase font-bold tracking-wider block">Unpaid</span>
          <span className="text-sm sm:text-base font-bold font-mono text-rose-600 dark:text-rose-400">
            {formatCurrencyAmount(pricing.remainingBalance, currency)}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-background/60 border border-border/40 p-3 text-sm space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Original Price:</span>
          <span className="font-mono">{formatCurrencyAmount(pricing.grossAmount, currency)}</span>
        </div>
        {pricing.upgradeCredit > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Upgrade Credit:</span>
            <span className="font-mono text-amber-600">-{formatCurrencyAmount(pricing.upgradeCredit, currency)}</span>
          </div>
        )}
        {pricing.discountAmount > 0 && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Discount:</span>
            <span className="font-mono text-rose-600">-{formatCurrencyAmount(pricing.discountAmount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between border-t border-border/40 pt-1.5">
          <span className="font-semibold">Net Due:</span>
          <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">{formatCurrencyAmount(pricing.netAmount, currency)}</span>
        </div>
        {showAmountPaid && (
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Paid Now:</span>
            <span className="font-mono">{formatCurrencyAmount(pricing.amountPaid, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Remaining Balance (Unpaid):</span>
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{formatCurrencyAmount(pricing.remainingBalance, currency)}</span>
        </div>
      </div>

      {!pricing.valid && pricing.error && (
        <p className="text-xs text-destructive">{pricing.error}</p>
      )}
    </div>
  );
};

export default PricingDiscountControls;
