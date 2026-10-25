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

export type WhatsAppRoutingMode = 'auto' | 'desktop' | 'web';

export interface OpenWhatsAppOptions {
  phone: string;
  text?: string;
  /**
   * 'auto': Try native whatsapp:// deep link first; fall back to a single reused named tab if app doesn't take focus.
   * 'desktop': Trigger native whatsapp:// protocol directly (zero browser tabs).
   * 'web': Reuse a single named 'whatsapp_crm' tab pointing directly to web.whatsapp.com/send.
   */
  mode?: WhatsAppRoutingMode;
  /** Timeout in ms before falling back to WhatsApp Web when mode === 'auto' (default: 1200ms) */
  fallbackTimeoutMs?: number;
  /** Named window target for tab reuse (default: 'whatsapp_crm') */
  windowTarget?: string;
}

const WHATSAPP_WINDOW_TARGET = 'whatsapp_crm';
const WHATSAPP_PREF_STORAGE_KEY = 'crm_whatsapp_routing_mode';

// Singleton reference to the reused WhatsApp Web tab in the current session
let activeWhatsAppTab: Window | null = null;

/**
 * Builds the three canonical WhatsApp URI variants for a normalized phone number and message.
 */
export function buildWhatsAppTargets(rawPhone: string, text?: string) {
  const phone = normalizeWhatsAppPhone(rawPhone);
  if (!phone) return null;

  const queryParams = new URLSearchParams({ phone });
  if (text && text.trim().length > 0) {
    queryParams.set('text', text);
  }
  const queryString = queryParams.toString();

  return {
    phone,
    /** Native OS protocol URI (Windows / macOS / iOS / Android WhatsApp app) */
    nativeUri: `whatsapp://send?${queryString}`,
    /** Direct WhatsApp Web deep link (skips the wa.me landing page hop on desktop) */
    webDirectUrl: `https://web.whatsapp.com/send?${queryString}`,
    /** Universal fallback link */
    universalUrl: `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`,
  };
}

/**
 * Extracts `{ phone, text }` from an existing `https://wa.me/...` or `web.whatsapp.com/send?...` URL.
 */
export function parseWhatsAppUrl(url: string): { phone: string; text?: string } | null {
  try {
    const parsed = new URL(url);
    const text = parsed.searchParams.get('text') ?? undefined;
    const phoneParam = parsed.searchParams.get('phone');
    if (phoneParam) {
      return { phone: normalizeWhatsAppPhone(phoneParam), text };
    }
    const pathPhone = parsed.pathname.replace(/^\/+/, '');
    if (pathPhone) {
      return { phone: normalizeWhatsAppPhone(pathPhone), text };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Opens or reuses the single named WhatsApp Web tab (`whatsapp_crm`) without `noopener`
 * so the browser can target and focus the existing tab rather than spawning duplicates.
 */
export function openReusableWhatsAppWebTab(
  webUrl: string,
  targetName: string = WHATSAPP_WINDOW_TARGET
): Window | null {
  if (typeof window === 'undefined') return null;

  // Reuse existing WindowProxy if still open, or target by name
  if (activeWhatsAppTab && !activeWhatsAppTab.closed) {
    try {
      activeWhatsAppTab.location.href = webUrl;
      activeWhatsAppTab.focus();
      return activeWhatsAppTab;
    } catch {
      // Cross-Origin-Opener-Policy may block direct location assignment; fall through to named window.open
    }
  }

  // IMPORTANT: Do NOT pass 'noopener' here — 'noopener' severs the browsing context name
  // and forces the browser to open a brand new tab on every click.
  activeWhatsAppTab = window.open(webUrl, targetName);
  if (activeWhatsAppTab) {
    try {
      activeWhatsAppTab.focus();
    } catch {
      // Ignore cross-origin focus restrictions
    }
  }
  return activeWhatsAppTab;
}

/**
 * Smart WhatsApp Router:
 * Prevents multiple WhatsApp Web tabs from spawning by either handing off to the native
 * `whatsapp://` desktop/mobile app or reusing a single named `'whatsapp_crm'` browser tab.
 */
export function openWhatsAppChat(options: OpenWhatsAppOptions): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const targets = buildWhatsAppTargets(options.phone, options.text);
  if (!targets) return;

  const savedPref = (() => {
    try {
      return localStorage.getItem(WHATSAPP_PREF_STORAGE_KEY) as WhatsAppRoutingMode | null;
    } catch {
      return null;
    }
  })();

  const mode: WhatsAppRoutingMode = options.mode || savedPref || 'auto';
  const targetName = options.windowTarget || WHATSAPP_WINDOW_TARGET;
  const fallbackTimeoutMs = options.fallbackTimeoutMs ?? 1200;

  // 1. Explicit Web Mode: Reuse single named WhatsApp Web tab directly
  if (mode === 'web') {
    openReusableWhatsAppWebTab(targets.webDirectUrl, targetName);
    return;
  }

  // 2. Explicit Desktop / Native Mode: Fire custom URI scheme without opening any tab
  if (mode === 'desktop') {
    triggerNativeProtocol(targets.nativeUri);
    return;
  }

  // 3. Auto Mode: Detect mobile vs desktop, attempt native `whatsapp://` protocol first,
  // and gracefully fall back to the single reused named tab if the OS doesn't steal focus.
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = targets.nativeUri;
    return;
  }

  let appTookFocus = false;

  const markFocusLost = () => {
    appTookFocus = true;
  };

  const handleVisibilityChange = () => {
    if (document.hidden || document.visibilityState === 'hidden') {
      appTookFocus = true;
    }
  };

  window.addEventListener('blur', markFocusLost, { once: true });
  document.addEventListener('visibilitychange', handleVisibilityChange);

  triggerNativeProtocol(targets.nativeUri);

  window.setTimeout(() => {
    window.removeEventListener('blur', markFocusLost);
    document.removeEventListener('visibilitychange', handleVisibilityChange);

    if (!appTookFocus && document.hasFocus()) {
      // Native desktop app did not intercept; reuse the single named WhatsApp Web tab
      openReusableWhatsAppWebTab(targets.webDirectUrl, targetName);
    }
  }, fallbackTimeoutMs);
}

/**
 * Convenience helper to route an already-built `https://wa.me/...` URL through `openWhatsAppChat`.
 */
export function openWhatsAppUrl(url: string, mode?: WhatsAppRoutingMode): void {
  const parsed = parseWhatsAppUrl(url);
  if (!parsed) {
    openReusableWhatsAppWebTab(url);
    return;
  }
  openWhatsAppChat({ phone: parsed.phone, text: parsed.text, mode });
}

/**
 * Triggers a custom URI scheme (`whatsapp://...`) using a hidden iframe / anchor
 * so the current CRM page does not navigate away or abort active Firestore WebSocket listeners.
 */
function triggerNativeProtocol(uri: string): void {
  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iframe);

  try {
    if (iframe.contentWindow) {
      iframe.contentWindow.location.href = uri;
    } else {
      window.location.assign(uri);
    }
  } catch {
    // Fallback if iframe navigation is restricted by CSP
    const anchor = document.createElement('a');
    anchor.href = uri;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    window.setTimeout(() => {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    }, 3000);
  }
}

