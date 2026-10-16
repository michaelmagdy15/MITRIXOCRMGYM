import type { Payment } from '../types';

export interface ShiftReconciliationInput {
  payments: Payment[];
  shiftDate: string; // YYYY-MM-DD
  branch?: string;
  openingFloat: number;
  countedCash: number;
  countedCard: number;
  countedInstapay: number;
}

export interface TenderReconciliationItem {
  expected: number;
  counted: number;
  discrepancy: number; // counted - expected (negative = shortage, positive = overage)
  status: 'BALANCED' | 'SHORTAGE' | 'OVERAGE';
}

export interface ShiftReconciliationResult {
  shiftDate: string;
  branch: string;
  openingFloat: number;
  cashSales: number;
  expectedCashInDrawer: number; // openingFloat + cashSales
  cash: TenderReconciliationItem;
  card: TenderReconciliationItem;
  instapay: TenderReconciliationItem;
  bnplAndOtherSales: number;
  totalRecordedRevenue: number;
  overallStatus: 'BALANCED' | 'DISCREPANCY';
  transactionCount: number;
}

function buildTenderItem(expected: number, counted: number): TenderReconciliationItem {
  const safeExpected = Math.round((Number(expected) || 0) * 100) / 100;
  const safeCounted = Math.round((Number(counted) || 0) * 100) / 100;
  const discrepancy = Math.round((safeCounted - safeExpected) * 100) / 100;
  const status =
    Math.abs(discrepancy) < 1
      ? 'BALANCED'
      : discrepancy < 0
      ? 'SHORTAGE'
      : 'OVERAGE';
  return { expected: safeExpected, counted: safeCounted, discrepancy, status };
}

/**
 * Reconciles physical cash drawer, Visa terminal Z-slip, and InstaPay settlement
 * against recorded Firestore payments (including Split-Tender primary & secondary amounts).
 */
export function reconcileShiftDrawer({
  payments,
  shiftDate,
  branch,
  openingFloat,
  countedCash,
  countedCard,
  countedInstapay,
}: ShiftReconciliationInput): ShiftReconciliationResult {
  const targetDate = (shiftDate || new Date().toISOString()).substring(0, 10);
  const normBranch = (branch || '').trim().toLowerCase();

  let cashSales = 0;
  let cardSales = 0;
  let instapaySales = 0;
  let bnplAndOtherSales = 0;
  let transactionCount = 0;

  const addByMethod = (method: string | undefined, amount: number) => {
    const val = Math.max(0, Number(amount) || 0);
    if (val <= 0) return;
    if (method === 'Cash') {
      cashSales += val;
    } else if (method === 'Credit Card') {
      cardSales += val;
    } else if (method === 'Instapay') {
      instapaySales += val;
    } else {
      bnplAndOtherSales += val;
    }
  };

  for (const p of payments) {
    if (p.deleted_at || p.status === 'refunded') continue;
    const pDate = (p.date || p.created_at || '').substring(0, 10);
    if (pDate !== targetDate) continue;

    if (normBranch && normBranch !== 'all' && normBranch !== 'all branches') {
      const pBranch = (p.branch || p.clientBranch || '').trim().toLowerCase();
      if (pBranch && pBranch !== normBranch) continue;
    }

    transactionCount += 1;
    const totalPaid = Math.max(0, Number(p.amount_paid ?? p.amount ?? 0));

    if (p.secondaryMethod && Number(p.secondaryTenderAmount) > 0) {
      const primaryAmt = Number(p.primaryTenderAmount ?? Math.max(0, totalPaid - Number(p.secondaryTenderAmount)));
      const secondaryAmt = Number(p.secondaryTenderAmount);
      addByMethod(p.method, primaryAmt);
      addByMethod(p.secondaryMethod, secondaryAmt);
    } else {
      addByMethod(p.method, totalPaid);
    }
  }

  const safeFloat = Math.max(0, Number(openingFloat) || 0);
  const expectedCashInDrawer = safeFloat + cashSales;
  const cash = buildTenderItem(expectedCashInDrawer, countedCash);
  const card = buildTenderItem(cardSales, countedCard);
  const instapay = buildTenderItem(instapaySales, countedInstapay);

  const totalRecordedRevenue = cashSales + cardSales + instapaySales + bnplAndOtherSales;
  const overallStatus =
    cash.status === 'BALANCED' && card.status === 'BALANCED' && instapay.status === 'BALANCED'
      ? 'BALANCED'
      : 'DISCREPANCY';

  return {
    shiftDate: targetDate,
    branch: branch || 'All Branches',
    openingFloat: safeFloat,
    cashSales,
    expectedCashInDrawer,
    cash,
    card,
    instapay,
    bnplAndOtherSales,
    totalRecordedRevenue,
    overallStatus,
    transactionCount,
  };
}
