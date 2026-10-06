import { Payment, Branch } from '../types';
import { safeIsoDate } from './dateUtils';

export interface DeclaredShiftAmounts {
  cash: number;
  visa: number;
  bankTransfer: number;
  instapay: number;
  other: number;
}

export interface SystemShiftAmounts {
  cash: number;
  visa: number;
  bankTransfer: number;
  instapay: number;
  other: number;
  totalCollected: number;
  refundsCount: number;
  refundsTotal: number;
  discountsTotal: number;
  outstandingBalancesTotal: number;
  transactionCount: number;
}

export interface ShiftVariance {
  cash: number;
  visa: number;
  bankTransfer: number;
  instapay: number;
  other: number;
  total: number;
  hasDiscrepancy: boolean;
}

export interface ShiftReconciliationReport {
  date: string; // YYYY-MM-DD
  branch?: string;
  shiftType: 'Morning' | 'Evening' | 'Night' | 'Full Day';
  cashierId?: string;
  cashierName?: string;
  managerId?: string;
  managerName?: string;
  system: SystemShiftAmounts;
  declared: DeclaredShiftAmounts & { total: number };
  variance: ShiftVariance;
  notes?: string;
  managerNotes?: string;
  status: 'Balanced' | 'Discrepancy' | 'Draft' | 'Approved';
  createdAt: string;
}

export interface ReconciliationOptions {
  date: string; // YYYY-MM-DD
  branch?: Branch | string;
  shiftType?: 'Morning' | 'Evening' | 'Night' | 'Full Day';
  cashierId?: string;
  cashierName?: string;
  declared?: Partial<DeclaredShiftAmounts>;
  notes?: string;
}

/**
 * Normalizes payment methods into standard categories:
 * - Cash
 * - Visa (Credit Card, Debit, Card)
 * - Bank Transfer
 * - Instapay
 * - Other
 */
export function normalizeMethodCategory(method?: string): 'cash' | 'visa' | 'bankTransfer' | 'instapay' | 'other' {
  if (!method) return 'other';
  const m = method.trim().toLowerCase();
  if (m === 'cash') return 'cash';
  if (m === 'credit card' || m === 'visa' || m === 'card' || m === 'mastercard') return 'visa';
  if (m === 'bank transfer' || m === 'bank') return 'bankTransfer';
  if (m === 'instapay') return 'instapay';
  return 'other';
}

/**
 * Computes shift reconciliation metrics from raw payments.
 * Strictly adheres to Inzan PRD §7, §18, §19:
 * - Excludes soft-deleted payments (deleted_at != null)
 * - Excludes pending and failed payments
 * - Excludes refunded payments from collected totals (and records them separately)
 * - Uses money actually collected (amount_paid ?? amount)
 * - Computes discounts granted separately
 * - Tracks partial-payment outstanding balances
 */
export function calculateShiftReconciliation(
  payments: Payment[],
  options: ReconciliationOptions
): ShiftReconciliationReport {
  const targetDate = options.date;
  const targetBranch = options.branch && options.branch !== 'ALL' ? options.branch.trim().toLowerCase() : null;

  const system: SystemShiftAmounts = {
    cash: 0,
    visa: 0,
    bankTransfer: 0,
    instapay: 0,
    other: 0,
    totalCollected: 0,
    refundsCount: 0,
    refundsTotal: 0,
    discountsTotal: 0,
    outstandingBalancesTotal: 0,
    transactionCount: 0
  };

  for (const p of payments) {
    // 1. Soft-delete exclusion
    if (p.deleted_at !== null && p.deleted_at !== undefined) continue;

    // 2. Date match (compare YYYY-MM-DD from ISO payment date)
    const iso = p.date ? safeIsoDate(p.date, false) : '';
    const pDate = iso.length >= 10 ? iso.substring(0, 10) : '';
    if (pDate !== targetDate) continue;

    // 3. Branch filter (if branch is specified)
    if (targetBranch) {
      const pBranch = (p.branch || p.clientBranch || '').trim().toLowerCase();
      if (pBranch && pBranch !== targetBranch && pBranch !== 'all branches' && pBranch !== 'all') {
        continue;
      }
    }

    // 4. Refund handling
    if (p.status === 'refunded' || (p.refundAmount && p.refundAmount > 0)) {
      system.refundsCount += 1;
      const refAmt = p.refundAmount ?? p.amount_paid ?? p.amount ?? 0;
      system.refundsTotal += Math.round(refAmt * 100) / 100;
      // Do not count refunded payments as collected revenue
      continue;
    }

    // 5. Exclude pending and failed payments
    if (p.status === 'pending' || p.status === 'failed') {
      continue;
    }

    // 6. Valid collected money
    const actualCollected = p.amount_paid !== undefined ? p.amount_paid : p.amount;
    const cat = normalizeMethodCategory(p.method);
    system[cat] += Math.round(actualCollected * 100) / 100;
    system.totalCollected += Math.round(actualCollected * 100) / 100;
    system.transactionCount += 1;

    // 7. Discounts granted
    if (p.originalAmount && p.originalAmount > actualCollected) {
      system.discountsTotal += Math.round((p.originalAmount - actualCollected) * 100) / 100;
    } else if (p.discountedAmount !== undefined && p.amount > p.discountedAmount) {
      system.discountsTotal += Math.round((p.amount - p.discountedAmount) * 100) / 100;
    }

    // 8. Outstanding partial balance
    if (p.amount > actualCollected) {
      system.outstandingBalancesTotal += Math.round((p.amount - actualCollected) * 100) / 100;
    }
  }

  // Round system sums
  system.cash = Math.round(system.cash * 100) / 100;
  system.visa = Math.round(system.visa * 100) / 100;
  system.bankTransfer = Math.round(system.bankTransfer * 100) / 100;
  system.instapay = Math.round(system.instapay * 100) / 100;
  system.other = Math.round(system.other * 100) / 100;
  system.totalCollected = Math.round(system.totalCollected * 100) / 100;

  // Declared amounts
  const declared: DeclaredShiftAmounts & { total: number } = {
    cash: Math.round((options.declared?.cash ?? 0) * 100) / 100,
    visa: Math.round((options.declared?.visa ?? 0) * 100) / 100,
    bankTransfer: Math.round((options.declared?.bankTransfer ?? 0) * 100) / 100,
    instapay: Math.round((options.declared?.instapay ?? 0) * 100) / 100,
    other: Math.round((options.declared?.other ?? 0) * 100) / 100,
    total: 0
  };
  declared.total = Math.round((declared.cash + declared.visa + declared.bankTransfer + declared.instapay + declared.other) * 100) / 100;

  // Variances
  const variance: ShiftVariance = {
    cash: Math.round((declared.cash - system.cash) * 100) / 100,
    visa: Math.round((declared.visa - system.visa) * 100) / 100,
    bankTransfer: Math.round((declared.bankTransfer - system.bankTransfer) * 100) / 100,
    instapay: Math.round((declared.instapay - system.instapay) * 100) / 100,
    other: Math.round((declared.other - system.other) * 100) / 100,
    total: Math.round((declared.total - system.totalCollected) * 100) / 100,
    hasDiscrepancy: false
  };
  variance.hasDiscrepancy = Math.abs(variance.total) > 0.01;

  const status: ShiftReconciliationReport['status'] = variance.hasDiscrepancy ? 'Discrepancy' : 'Balanced';

  return {
    date: targetDate,
    branch: typeof options.branch === 'string' ? options.branch : undefined,
    shiftType: options.shiftType || 'Full Day',
    cashierId: options.cashierId,
    cashierName: options.cashierName,
    system,
    declared,
    variance,
    notes: options.notes,
    status,
    createdAt: new Date().toISOString()
  };
}

/**
 * Emits an exportable CSV string for a Shift Reconciliation report.
 */
export function generateShiftReconciliationCSV(report: ShiftReconciliationReport): string {
  const lines: string[] = [];
  lines.push('INZAN ATHLETICS — FRONT DESK SHIFT RECONCILIATION REPORT');
  lines.push(`Date,${report.date}`);
  lines.push(`Branch,${report.branch || 'All Branches'}`);
  lines.push(`Shift,${report.shiftType}`);
  lines.push(`Cashier,${report.cashierName || 'N/A'}`);
  lines.push(`Status,${report.status}`);
  lines.push(`Generated At,${report.createdAt}`);
  lines.push('');
  lines.push('Payment Method,System Expected (EGP),Declared Cashier (EGP),Variance (EGP),Status');
  lines.push(`Cash,${report.system.cash.toFixed(2)},${report.declared.cash.toFixed(2)},${report.variance.cash.toFixed(2)},${report.variance.cash === 0 ? 'OK' : 'MISMATCH'}`);
  lines.push(`Card / Visa,${report.system.visa.toFixed(2)},${report.declared.visa.toFixed(2)},${report.variance.visa.toFixed(2)},${report.variance.visa === 0 ? 'OK' : 'MISMATCH'}`);
  lines.push(`Bank Transfer,${report.system.bankTransfer.toFixed(2)},${report.declared.bankTransfer.toFixed(2)},${report.variance.bankTransfer.toFixed(2)},${report.variance.bankTransfer === 0 ? 'OK' : 'MISMATCH'}`);
  lines.push(`Instapay,${report.system.instapay.toFixed(2)},${report.declared.instapay.toFixed(2)},${report.variance.instapay.toFixed(2)},${report.variance.instapay === 0 ? 'OK' : 'MISMATCH'}`);
  lines.push(`Other,${report.system.other.toFixed(2)},${report.declared.other.toFixed(2)},${report.variance.other.toFixed(2)},${report.variance.other === 0 ? 'OK' : 'MISMATCH'}`);
  lines.push(`TOTAL COLLECTED,${report.system.totalCollected.toFixed(2)},${report.declared.total.toFixed(2)},${report.variance.total.toFixed(2)},${!report.variance.hasDiscrepancy ? 'BALANCED' : 'DISCREPANCY'}`);
  lines.push('');
  lines.push('ADDITIONAL REVENUE ADJUSTMENTS');
  lines.push(`Total Transactions,${report.system.transactionCount}`);
  lines.push(`Discounts Granted (EGP),${report.system.discountsTotal.toFixed(2)}`);
  lines.push(`Refunds Excluded (Count / EGP),${report.system.refundsCount} / ${report.system.refundsTotal.toFixed(2)}`);
  lines.push(`Outstanding Partial Balances (EGP),${report.system.outstandingBalancesTotal.toFixed(2)}`);
  if (report.notes) {
    lines.push(`Operational Notes,"${report.notes.replace(/"/g, '""')}"`);
  }
  return lines.join('\r\n');
}
