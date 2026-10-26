import type { Client, Payment, PaymentMethodType } from '../types';
import { getTenantId } from '../firebase';
import { normalizeWhatsAppPhone } from './whatsappTemplates';

const getDefaultClubName = () => {
  try {
    return getTenantId().toLowerCase().includes('inzan') ? 'Inzan Athletics' : 'STRIKE';
  } catch {
    return 'STRIKE';
  }
};

export interface InstapayValidationResult {
  valid: boolean;
  normalizedRef: string;
  extractedAmount?: number;
  reason?: string;
}

/**
 * Validates or extracts an Egyptian InstaPay reference number (10–16 digits or IPN code)
 * from either a direct reference input or pasted bank/InstaPay SMS notification text.
 */
export function validateOrExtractInstapayRef(rawInput: string): InstapayValidationResult {
  const trimmed = String(rawInput || '').trim();
  if (!trimmed) {
    return { valid: false, normalizedRef: '', reason: 'InstaPay reference is required.' };
  }

  // Direct 10 to 16 digit reference number
  if (/^\d{10,16}$/.test(trimmed)) {
    return { valid: true, normalizedRef: trimmed };
  }

  // Alphanumeric IPN reference e.g. IPN20261016123456
  if (/^(?:IPN|REF)[-\s]?(\d{8,16})$/i.test(trimmed)) {
    const digits = trimmed.replace(/\D/g, '');
    return { valid: true, normalizedRef: digits };
  }

  // Extract from pasted InstaPay / bank SMS text
  const refMatch =
    trimmed.match(/(?:ref(?:erence)?|ipn|transaction\s*(?:id|no)|رقم\s*المرجع|مرجع)[:\s#]*(\d{10,16})/i) ||
    trimmed.match(/\b(\d{12})\b/);

  const amountMatch = trimmed.match(/(?:EGP|LE|ج\.م|جنيه)\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(?:EGP|LE|ج\.م|جنيه)/i);
  const extractedAmount = amountMatch
    ? parseFloat((amountMatch[1] || amountMatch[2] || '0').replace(/,/g, ''))
    : undefined;

  if (refMatch && refMatch[1]) {
    return {
      valid: true,
      normalizedRef: refMatch[1],
      extractedAmount: extractedAmount && !isNaN(extractedAmount) ? extractedAmount : undefined,
    };
  }

  return {
    valid: false,
    normalizedRef: trimmed.replace(/\s+/g, ''),
    reason: 'Enter a valid 10–16 digit InstaPay reference number or paste the InstaPay SMS.',
  };
}

export interface BnplPlanEstimate {
  provider: 'ValU' | 'Sympl' | 'Souhoola';
  months: number;
  principalAmount: number;
  adminFeePercent: number;
  totalPayable: number;
  monthlyInstallment: number;
}

/**
 * Computes an estimated BNPL schedule for Egyptian consumer finance providers (ValU, Sympl, Souhoola).
 */
export function calculateBnplSchedule(
  principalAmount: number,
  provider: 'ValU' | 'Sympl' | 'Souhoola',
  months: 3 | 6 | 9 | 12 = 6
): BnplPlanEstimate {
  const safePrincipal = Math.max(0, Number(principalAmount) || 0);
  // Sympl is typically 0% interest over 3-5 payments; ValU/Souhoola have tenure-based admin fees unless 0% promo
  const feeMap: Record<'ValU' | 'Sympl' | 'Souhoola', Record<number, number>> = {
    Sympl: { 3: 0, 6: 0, 9: 5, 12: 8 },
    ValU: { 3: 0, 6: 6, 9: 9, 12: 12 },
    Souhoola: { 3: 0, 6: 5.5, 9: 8.5, 12: 11.5 },
  };
  const adminFeePercent = feeMap[provider]?.[months] ?? 0;
  const totalPayable = Math.round(safePrincipal * (1 + adminFeePercent / 100));
  const monthlyInstallment = months > 0 ? Math.ceil(totalPayable / months) : totalPayable;

  return {
    provider,
    months,
    principalAmount: safePrincipal,
    adminFeePercent,
    totalPayable,
    monthlyInstallment,
  };
}

export interface WhatsAppPaymentLinkParams {
  clientPhone?: string | null;
  clientName: string;
  packageName: string;
  amount: number;
  method: PaymentMethodType;
  clubName?: string;
  instapayIpa?: string;
  bnplMonths?: 3 | 6 | 9 | 12;
}

/**
 * Generates a 1-tap WhatsApp checkout link with InstaPay IPA handle, Fawry code, or BNPL instructions.
 */
export function buildWhatsAppPaymentLinkUrl({
  clientPhone,
  clientName,
  packageName,
  amount,
  method,
  clubName = getDefaultClubName(),
  instapayIpa,
  bnplMonths = 6,
}: WhatsAppPaymentLinkParams): string | null {
  const phone = normalizeWhatsAppPhone(clientPhone);
  if (!phone) return null;

  const formattedAmount = Math.round(Number(amount) || 0).toLocaleString();
  const lines: string[] = [
    `💳 *${clubName} — Quick Payment Instructions*`,
    ``,
    `Hello *${clientName}*, here are your payment details for:`,
    `📦 *Package:* ${packageName}`,
    `💰 *Amount Due:* ${formattedAmount} EGP`,
    `🧾 *Selected Method:* ${method}`,
    ``,
  ];

  if (method === 'Instapay') {
    const handle = instapayIpa || `${clubName.toLowerCase().replace(/[^a-z0-9]/g, '')}@instapay`;
    lines.push(
      `📲 *InstaPay Transfer Steps:*`,
      `1. Open your *InstaPay* app`,
      `2. Send *${formattedAmount} EGP* to IPA: *${handle}*`,
      `3. Reply to this WhatsApp message with your screenshot or 12-digit Reference # for instant activation!`
    );
  } else if (method === 'ValU' || method === 'Sympl' || method === 'Souhoola') {
    const plan = calculateBnplSchedule(amount, method, bnplMonths);
    lines.push(
      `✨ *${method} BNPL Plan (${plan.months} Months):*`,
      `• Monthly Installment: *~${plan.monthlyInstallment.toLocaleString()} EGP / month*`,
      `• Show your *${method}* app QR/OTP at reception or reply here to complete instant approval.`
    );
  } else if (method === 'Fawry') {
    lines.push(
      `🏪 *Fawry Pay:*`,
      `• Visit any Fawry POS machine or open the MyFawry app to complete your *${formattedAmount} EGP* payment and share the receipt number here.`
    );
  } else {
    lines.push(`Visit the reception desk or reply here to complete your registration. See you at the club! 💪`);
  }

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export interface EtaTaxExportRow {
  receiptSerial: string;
  date: string;
  memberId: string;
  memberName: string;
  nationalId: string;
  branch: string;
  packageType: string;
  category: string;
  method: string;
  instapayRef: string;
  instapayVerified: string;
  netBeforeVatEgp: number;
  vat14PercentEgp: number;
  grossPaidEgp: number;
  remainingDebtEgp: number;
}

/**
 * Generates an Egyptian Tax Authority (ETA E-Receipt) & Accountant-ready CSV string
 * with 14% Egyptian VAT decomposition.
 */
export function generateEgyptianEtaTaxCsv(
  payments: Payment[],
  clients: Client[],
  vatRate = 0.14
): { csv: string; rows: EtaTaxExportRow[]; totalGrossEgp: number; totalVatEgp: number; totalNetEgp: number } {
  const clientById = new Map<string, Client>();
  for (const c of clients) {
    clientById.set(c.id, c);
  }

  const activePayments = payments.filter((p) => !p.deleted_at && p.status !== 'refunded');
  const rows: EtaTaxExportRow[] = [];
  let totalGrossEgp = 0;
  let totalVatEgp = 0;
  let totalNetEgp = 0;

  for (const p of activePayments) {
    const client = clientById.get(p.clientId);
    const grossPaid = Math.max(0, Number(p.amount_paid ?? p.amount ?? 0));
    const netPackageTotal = Math.max(0, Number(p.discountedAmount ?? p.amount ?? grossPaid));
    const remainingDebt = Math.max(0, netPackageTotal - grossPaid);

    const netBeforeVat = Number((grossPaid / (1 + vatRate)).toFixed(2));
    const vatAmount = Number((grossPaid - netBeforeVat).toFixed(2));

    totalGrossEgp += grossPaid;
    totalNetEgp += netBeforeVat;
    totalVatEgp += vatAmount;

    const methodDesc =
      p.secondaryMethod && p.secondaryTenderAmount
        ? `${p.method} (${p.primaryTenderAmount || 0}) + ${p.secondaryMethod} (${p.secondaryTenderAmount})`
        : p.method;

    rows.push({
      receiptSerial: p.receiptSerial || p.id.substring(0, 8).toUpperCase(),
      date: (p.date || p.created_at || '').substring(0, 10),
      memberId: client?.memberId || p.memberId || 'WALK-IN',
      memberName: client?.name || p.clientName || p.client_name || 'Walk-In',
      nationalId: client?.nationalId || '',
      branch: p.branch || client?.branch || 'MAIN',
      packageType: p.packageType || '',
      category: p.package_category_type || 'Memberships',
      method: methodDesc,
      instapayRef: p.instapayRef || '',
      instapayVerified: p.method === 'Instapay' || p.secondaryMethod === 'Instapay'
        ? p.instapayVerified
          ? 'Verified'
          : 'Pending'
        : 'N/A',
      netBeforeVatEgp: netBeforeVat,
      vat14PercentEgp: vatAmount,
      grossPaidEgp: grossPaid,
      remainingDebtEgp: remainingDebt,
    });
  }

  const escapeCsv = (val: string | number) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const headers = [
    'Receipt Serial',
    'Date',
    'Member ID',
    'Member Name',
    'National ID',
    'Branch',
    'Package',
    'Category',
    'Payment Method',
    'InstaPay Reference',
    'InstaPay Verification',
    'Net Before VAT (EGP)',
    'Egyptian VAT 14% (EGP)',
    'Gross Paid (EGP)',
    'Remaining Debt (EGP)',
  ];

  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      [
        r.receiptSerial,
        r.date,
        r.memberId,
        r.memberName,
        r.nationalId,
        r.branch,
        r.packageType,
        r.category,
        r.method,
        r.instapayRef,
        r.instapayVerified,
        r.netBeforeVatEgp.toFixed(2),
        r.vat14PercentEgp.toFixed(2),
        r.grossPaidEgp.toFixed(2),
        r.remainingDebtEgp.toFixed(2),
      ]
        .map(escapeCsv)
        .join(',')
    ),
  ];

  return {
    csv: lines.join('\n'),
    rows,
    totalGrossEgp: Number(totalGrossEgp.toFixed(2)),
    totalVatEgp: Number(totalVatEgp.toFixed(2)),
    totalNetEgp: Number(totalNetEgp.toFixed(2)),
  };
}
