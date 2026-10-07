import React, { useEffect, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { calculatePricing, DiscountType, DiscountReason, DISCOUNT_REASONS, formatCurrencyAmount } from '../utils/pricing';

export interface PricingControlsState {
  discountType: DiscountType;
  discountValue: string;
  amountPaid: string;
  discountReason: DiscountReason;
  corporateProofUrl: string;
}

export const DEFAULT_PRICING_STATE: PricingControlsState = {
  discountType: 'none',
  discountValue: '',
  amountPaid: '',
  discountReason: 'Standard',
  corporateProofUrl: '',
};

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
  const pricing = useMemo(() => {
    return calculatePricing({
      grossAmount,
      upgradeCredit,
      discountType: value.discountType,
      discountValue: value.discountValue ? Number(value.discountValue) : undefined,
      amountPaid: value.amountPaid ? Number(value.amountPaid) : undefined,
    });
  }, [grossAmount, upgradeCredit, value.discountType, value.discountValue, value.amountPaid]);

  useEffect(() => {
    onChange(value, pricing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing.grossAmount, pricing.netAmount, pricing.discountAmount, pricing.amountPaid, pricing.remainingBalance, pricing.valid]);

  const setField = <K extends keyof PricingControlsState>(field: K, fieldValue: PricingControlsState[K]) => {
    onChange({ ...value, [field]: fieldValue }, calculatePricing({
      grossAmount,
      upgradeCredit,
      discountType: field === 'discountType' ? (fieldValue as DiscountType) : value.discountType,
      discountValue: field === 'discountValue' ? (fieldValue ? Number(fieldValue) : undefined) : (value.discountValue ? Number(value.discountValue) : undefined),
      amountPaid: field === 'amountPaid' ? (fieldValue ? Number(fieldValue) : undefined) : (value.amountPaid ? Number(value.amountPaid) : undefined),
    }));
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
              const next: PricingControlsState = { ...value, discountType: v as DiscountType };
              if (v === 'none') {
                next.discountValue = '';
                next.discountReason = 'Standard';
              }
              setField('discountType', next.discountType);
              setField('discountValue', next.discountValue);
              setField('discountReason', next.discountReason);
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
          <Label htmlFor={discountReasonId} className="text-xs font-semibold">Discount Reason</Label>
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

      {/* Image 2 Visual Summary: Package Cost | Discount | Paid Amount | Unpaid (Red Border) */}
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
