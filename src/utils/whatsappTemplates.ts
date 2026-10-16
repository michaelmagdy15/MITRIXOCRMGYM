import type { Client, Payment, ClientPackage } from '../types';

/**
 * Normalizes a phone number into international WhatsApp format (digits only, E.164 without '+').
 * Defaults 11-digit Egyptian mobile numbers starting with '01' to '201...'.
 */
export function normalizeWhatsAppPhone(rawPhone?: string | null): string {
  if (!rawPhone) return '';
  const digits = String(rawPhone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) {
    return digits.slice(2);
  }
  if (digits.length === 11 && digits.startsWith('01')) {
    return `2${digits}`;
  }
  if (digits.length === 10 && digits.startsWith('1')) {
    return `20${digits}`;
  }
  return digits;
}

export interface WhatsAppReceiptParams {
  payment: Payment;
  client?: Client | null;
  clubName?: string;
  currency?: string;
}

/**
 * Generates a 1-tap WhatsApp URL with a formatted digital payment receipt.
 */
export function buildWhatsAppPaymentReceiptUrl({
  payment,
  client,
  clubName = 'Gym Administration',
  currency = 'LE',
}: WhatsAppReceiptParams): string | null {
  const phone = normalizeWhatsAppPhone(client?.phone);
  if (!phone) return null;

  const memberName = client?.name || payment.clientName || payment.client_name || payment.guestName || 'Member';
  const paidAmount = Number(payment.amount_paid ?? payment.amount ?? 0);
  const netAmount = Number(payment.discountedAmount ?? payment.amount ?? paidAmount);
  const remaining = Math.max(0, Number(payment.remainingBalance ?? (netAmount - paidAmount)));
  const dateStr = (payment.date || payment.created_at || '').substring(0, 10);

  const lines: string[] = [
    `✅ *${clubName} — Official Payment Receipt*`,
    ``,
    `Hello *${memberName}*, thank you for your payment!`,
    ``,
    `📦 *Package:* ${payment.packageType || 'Membership'}`,
    `💳 *Amount Paid:* ${paidAmount.toLocaleString()} ${currency}`,
  ];

  if (payment.discountValue && payment.discountValue > 0) {
    lines.push(`🏷️ *Net Package Total:* ${netAmount.toLocaleString()} ${currency}`);
  }

  if (remaining > 0) {
    lines.push(`⏳ *Remaining Balance:* ${remaining.toLocaleString()} ${currency}`);
  }

  lines.push(`🧾 *Payment Method:* ${payment.method}${payment.notes?.includes('Split Tender') ? ' (Split Tender)' : ''}`);

  if (payment.receiptSerial) {
    lines.push(`🔢 *Receipt #:* ${payment.receiptSerial}`);
  }
  if (dateStr) {
    lines.push(`📅 *Date:* ${dateStr}`);
  }

  lines.push(``, `See you at the club! 💪`);

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export interface WhatsAppRenewalParams {
  client: Client;
  pkg?: ClientPackage | null;
  clubName?: string;
}

/**
 * Generates a 1-tap WhatsApp URL for membership renewal / expiry reminder.
 */
export function buildWhatsAppRenewalReminderUrl({
  client,
  pkg,
  clubName = 'Gym Administration',
}: WhatsAppRenewalParams): string | null {
  const phone = normalizeWhatsAppPhone(client.phone);
  if (!phone) return null;

  const pkgName = pkg?.packageName || client.packageType || 'Membership';
  const expiryDate = (pkg?.endDate || client.membershipExpiry || '').substring(0, 10);
  const isExpired = pkg?.status === 'Expired' || client.status === 'Expired';

  const lines: string[] = [
    `👋 Hello *${client.name}*,`,
    ``,
    isExpired
      ? `Your *${pkgName}* at *${clubName}* expired${expiryDate ? ` on *${expiryDate}*` : ''}.`
      : `Friendly reminder from *${clubName}*: your *${pkgName}*${expiryDate ? ` is scheduled to expire on *${expiryDate}*` : ' is coming up for renewal'}.`,
    ``,
    `Reply to this message or visit the front desk anytime to renew and keep your training streak going! 🔥💪`,
  ];

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export interface WhatsAppWaitlistPromotionParams {
  clientName: string;
  clientPhone?: string | null;
  className: string;
  classDate?: string;
  classTime?: string;
  branch?: string;
  clubName?: string;
}

/**
 * Generates a 1-tap WhatsApp URL to notify a member promoted from the class waitlist.
 */
export function buildWhatsAppWaitlistPromotionUrl({
  clientName,
  clientPhone,
  className,
  classDate,
  classTime,
  branch,
  clubName = 'Gym Administration',
}: WhatsAppWaitlistPromotionParams): string | null {
  const phone = normalizeWhatsAppPhone(clientPhone);
  if (!phone) return null;

  const lines: string[] = [
    `🎉 *Spot Confirmed — ${clubName}*`,
    ``,
    `Great news *${clientName}*! A spot opened up and you have been automatically promoted from the Waiting List to *Attending* for:`,
    ``,
    `🏋️ *Class:* ${className}`,
  ];

  if (classDate) lines.push(`📅 *Date:* ${classDate}`);
  if (classTime) lines.push(`⏰ *Time:* ${classTime}`);
  if (branch) lines.push(`📍 *Branch:* ${branch}`);

  lines.push(``, `We look forward to seeing you in class! 🙌`);

  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}
