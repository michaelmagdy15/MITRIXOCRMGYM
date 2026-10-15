/**
 * Clean-room Egyptian Commercial Gym Financial Calculators
 * Implements RedGITS v17.5 / v17.12:
 * 1. Dynamic Installment Row Splitter ("add one more row and split the same amount evenly")
 * 2. Dual-Tender Split Payment Calculator (`Cash`, `Credit Card`, `Instapay`, `Vodafone Cash`, `Bank Transfer`, `Wallet`)
 * 3. Corporate Financial Request 14% Egyptian VAT Calculator (`tax_code` + ETA invoice breakdown)
 */

export interface InstallmentRow {
  index: number;
  amount: number;
  dueDate: string; // YYYY-MM-DD
  notes?: string;
}

export interface CorporateVatBreakdown {
  subtotal: number;
  vatRatePercent: number;
  vatAmount: number;
  grandTotal: number;
  companyName: string;
  taxCode: string;
}

/**
 * Splits a remaining balance evenly across `count` installments, assigning monthly due dates
 * starting from `firstDueDate` (defaults to +30 days from today) and placing any 1-piastre/pound
 * rounding remainder on the first installment.
 */
export function splitInstallmentsEvenly(
  remainingBalance: number,
  count: number,
  firstDueDate?: string,
  intervalDays = 30
): InstallmentRow[] {
  const safeTotal = Math.max(0, Math.round(Number(remainingBalance) || 0));
  const safeCount = Math.max(1, Math.min(24, Math.floor(Number(count) || 1)));

  const baseAmount = Math.floor(safeTotal / safeCount);
  const remainder = safeTotal - baseAmount * safeCount;

  const baseDate = firstDueDate ? new Date(firstDueDate) : new Date();
  const validStart = isNaN(baseDate.getTime()) ? new Date() : baseDate;

  const rows: InstallmentRow[] = [];
  for (let i = 0; i < safeCount; i++) {
    const d = new Date(validStart);
    d.setDate(d.getDate() + (i + (firstDueDate ? 0 : 1)) * intervalDays);
    const isoDate = d.toISOString().slice(0, 10);
    rows.push({
      index: i + 1,
      amount: i === 0 ? baseAmount + remainder : baseAmount,
      dueDate: isoDate,
    });
  }
  return rows;
}

/**
 * Adds one more installment row and re-splits the exact same total amount evenly across all rows
 * (RedGITS v17.5 feature: "Installments now can add one more row and split the same amount").
 */
export function addInstallmentRowAndResplit(
  currentRows: InstallmentRow[],
  totalRemainingBalance: number,
  intervalDays = 30
): InstallmentRow[] {
  const nextCount = currentRows.length + 1;
  const firstDueDate = currentRows[0]?.dueDate;
  return splitInstallmentsEvenly(totalRemainingBalance, nextCount, firstDueDate, intervalDays);
}

/**
 * Dual-tender split payment calculator (`getremaining` equivalent).
 */
export function calculateSplitTenderRemaining(
  packageTotalAfterDiscount: number,
  primaryPaidAmount: number,
  secondaryPaidAmount = 0
): {
  totalPaidNow: number;
  remainingDebt: number;
  isFullyPaid: boolean;
  isOverpaid: boolean;
} {
  const total = Math.max(0, Number(packageTotalAfterDiscount) || 0);
  const p1 = Math.max(0, Number(primaryPaidAmount) || 0);
  const p2 = Math.max(0, Number(secondaryPaidAmount) || 0);
  const totalPaidNow = p1 + p2;
  const remainingDebt = Math.max(0, total - totalPaidNow);

  return {
    totalPaidNow,
    remainingDebt,
    isFullyPaid: remainingDebt === 0 && totalPaidNow <= total,
    isOverpaid: totalPaidNow > total,
  };
}

/**
 * Calculates the Egyptian 14% VAT Corporate Financial Request breakdown
 * (`/admin/incomes/financial_requests` parity).
 */
export function calculateCorporateVatInvoice(
  subtotal: number,
  companyName = '',
  taxCode = '',
  vatRatePercent = 14
): CorporateVatBreakdown {
  const cleanSubtotal = Math.max(0, Number(subtotal) || 0);
  const vatAmount = Math.round(cleanSubtotal * (vatRatePercent / 100) * 100) / 100;
  const grandTotal = Math.round((cleanSubtotal + vatAmount) * 100) / 100;

  return {
    subtotal: cleanSubtotal,
    vatRatePercent,
    vatAmount,
    grandTotal,
    companyName: companyName.trim(),
    taxCode: taxCode.trim(),
  };
}
