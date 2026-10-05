/**
 * Shared pricing calculation for package sales.
 *
 * All checkout paths should use `calculatePricing` so discount, net amount,
 * collected amount, and remaining balance are computed consistently.
 *
 * Semantics:
 * - grossAmount: catalogue or list price (before upgrade credit / discount).
 * - upgradeCredit: value already paid from a previous package (upgrade flow).
 * - chargeBeforeDiscount: grossAmount - upgradeCredit (cannot be negative).
 * - discountAmount: computed discount applied to chargeBeforeDiscount.
 * - netAmount: chargeBeforeDiscount - discountAmount.
 * - amountPaid: actual money collected now (defaults to netAmount).
 * - remainingBalance: netAmount - amountPaid (cannot be negative).
 */

export type DiscountType = 'percentage' | 'amount' | 'none';

export type DiscountReason =
  | 'Promotional'
  | 'Referral'
  | 'Corporate'
  | 'Retention'
  | 'Other'
  | 'Standard';

export interface PricingInput {
  /** Catalogue or gross amount before any discount (must be >= 0). */
  grossAmount: number;
  /** Discount type; omit or 'none' for no discount. */
  discountType?: DiscountType;
  /** Percentage (0-100) or fixed amount (>= 0), depending on discountType. */
  discountValue?: number;
  /** Actual money collected now. Defaults to netAmount. Can be 0. */
  amountPaid?: number;
  /** Credit from previous package payment in upgrade flow (>= 0). */
  upgradeCredit?: number;
}

export interface PricingResult {
  /** Original gross amount. */
  grossAmount: number;
  /** Upgrade credit applied. */
  upgradeCredit: number;
  /** Charge before discount but after upgrade credit. */
  chargeBeforeDiscount: number;
  /** Discount type used. */
  discountType: DiscountType;
  /** Raw discount value entered. */
  discountValue: number;
  /** Computed discount amount (>= 0). */
  discountAmount: number;
  /** Net amount due after discount. */
  netAmount: number;
  /** Actual money collected. */
  amountPaid: number;
  /** Remaining balance (netAmount - amountPaid, >= 0). */
  remainingBalance: number;
  /** Whether the input was valid. */
  valid: boolean;
  /** Validation error message if invalid. */
  error?: string;
}

const CURRENCY_PRECISION = 2;
const SCALE = 10 ** CURRENCY_PRECISION;

/**
 * Round to configured currency precision using integer scaling to avoid
 * classic floating-point artifacts (e.g. 1.005 -> 1.01).
 */
export function roundCurrency(value: number): number {
  if (!Number.isFinite(value) || Number.isNaN(value)) return NaN;
  return Math.round((value + Number.EPSILON) * SCALE) / SCALE;
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
}

/**
 * Compute a complete pricing breakdown from raw inputs.
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const result: PricingResult = {
    grossAmount: 0,
    upgradeCredit: 0,
    chargeBeforeDiscount: 0,
    discountType: 'none',
    discountValue: 0,
    discountAmount: 0,
    netAmount: 0,
    amountPaid: 0,
    remainingBalance: 0,
    valid: false,
  };

  if (!input || typeof input !== 'object') {
    result.error = 'Missing pricing input';
    return result;
  }

  if (!isValidNumber(input.grossAmount)) {
    result.error = 'Gross amount must be a valid number';
    return result;
  }
  if (input.grossAmount < 0) {
    result.error = 'Gross amount cannot be negative';
    return result;
  }

  const grossAmount = roundCurrency(input.grossAmount);
  result.grossAmount = grossAmount;

  let upgradeCredit = 0;
  if (input.upgradeCredit !== undefined) {
    if (!isValidNumber(input.upgradeCredit)) {
      result.error = 'Upgrade credit must be a valid number';
      return result;
    }
    if (input.upgradeCredit < 0) {
      result.error = 'Upgrade credit cannot be negative';
      return result;
    }
    upgradeCredit = roundCurrency(input.upgradeCredit);
  }
  result.upgradeCredit = upgradeCredit;

  const chargeBeforeDiscount = roundCurrency(Math.max(0, grossAmount - upgradeCredit));
  result.chargeBeforeDiscount = chargeBeforeDiscount;

  let discountType: DiscountType = 'none';
  let discountValue = 0;

  if (input.discountType && input.discountType !== 'none') {
    if (input.discountType !== 'percentage' && input.discountType !== 'amount') {
      result.error = 'Unsupported discount type';
      return result;
    }
    discountType = input.discountType;

    if (!isValidNumber(input.discountValue)) {
      result.error = 'Discount value must be a valid number';
      return result;
    }
    if (input.discountValue < 0) {
      result.error = 'Discount value cannot be negative';
      return result;
    }
    discountValue = roundCurrency(input.discountValue);

    if (discountType === 'percentage' && discountValue > 100) {
      result.error = 'Percentage discount cannot exceed 100%';
      return result;
    }
  }

  result.discountType = discountType;
  result.discountValue = discountValue;

  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = roundCurrency(chargeBeforeDiscount * (discountValue / 100));
  } else if (discountType === 'amount') {
    discountAmount = Math.min(discountValue, chargeBeforeDiscount);
  }
  // Guard against floating-point edge cases that could exceed the charge.
  discountAmount = roundCurrency(Math.min(discountAmount, chargeBeforeDiscount));
  result.discountAmount = discountAmount;

  const netAmount = roundCurrency(Math.max(0, chargeBeforeDiscount - discountAmount));
  result.netAmount = netAmount;

  let amountPaid = netAmount;
  if (input.amountPaid !== undefined) {
    if (!isValidNumber(input.amountPaid)) {
      result.error = 'Amount paid must be a valid number';
      return result;
    }
    if (input.amountPaid < 0) {
      result.error = 'Amount paid cannot be negative';
      return result;
    }
    amountPaid = roundCurrency(input.amountPaid);
  }
  result.amountPaid = amountPaid;

  result.remainingBalance = roundCurrency(Math.max(0, netAmount - amountPaid));
  result.valid = true;
  return result;
}

export function formatCurrencyAmount(value: number, currency = 'LE'): string {
  if (!Number.isFinite(value)) return `— ${currency}`;
  return `${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${currency}`;
}

export const DISCOUNT_REASONS: Exclude<DiscountReason, 'Standard'>[] = [
  'Promotional',
  'Referral',
  'Corporate',
  'Retention',
  'Other',
];

export function isValidDiscountReason(reason?: string): reason is DiscountReason {
  if (!reason) return false;
  return ['Promotional', 'Referral', 'Corporate', 'Retention', 'Other', 'Standard'].includes(reason);
}

/**
 * Coerce a free-form discount type string into the canonical union.
 */
export function normalizeDiscountType(value?: string | null): DiscountType {
  if (value === 'percentage' || value === 'amount') return value;
  return 'none';
}

/**
 * Parse a discount value entered by a user, returning NaN for invalid input.
 */
export function parseDiscountValue(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return NaN;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return NaN;
  return parsed;
}
