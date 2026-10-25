/**
 * Phone number normalization utilities
 * Enforces strict E.164 formatting for Egyptian mobile numbers
 * and provides robust multi-format search matching.
 */

/**
 * Converts Eastern Arabic numerals (٠-٩) to standard Western digits (0-9).
 */
export function convertArabicNumerals(str?: string | null): string {
  if (!str) return '';
  return str.toString().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString());
}

/**
 * Strips all non-digits, country code (+20 or 20), and leading zero,
 * returning the canonical national mobile digits (e.g., '1000400127').
 */
export function getCorePhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  let digits = convertArabicNumerals(phone).replace(/\D/g, '');
  if (digits.startsWith('20')) {
    digits = digits.substring(2);
  }
  return digits.replace(/^0+/, '');
}

export function normalizeEgyptPhone(phone?: string | null): string {
  if (!phone) return '';
  let clean = convertArabicNumerals(phone).replace(/\D/g, '');
  if (clean.startsWith('20')) clean = clean.substring(2);
  if (clean.startsWith('0')) clean = clean.substring(1);
  return `+20${clean}`;
}

/**
 * Returns all common search variations of an Egyptian phone number
 * to ensure backward-compatibility with historical un-normalized records.
 */
export function getEgyptPhoneVariants(phone?: string | null): string[] {
  if (!phone) return [];
  const raw = convertArabicNumerals(phone).trim();
  const digits = raw.replace(/\D/g, '');
  const e164 = normalizeEgyptPhone(phone);
  const withoutPlus = e164.replace(/^\+/, '');
  const localWithZero = digits.startsWith('0') ? digits : `0${digits.replace(/^20/, '')}`;
  const unPrefixed = localWithZero.replace(/^0/, '');

  return [...new Set([
    raw,
    e164,
    withoutPlus,
    localWithZero,
    unPrefixed,
    digits
  ])].filter(Boolean);
}

/**
 * Checks if a stored member phone matches a user-entered search query.
 * Handles:
 * - Leading zero discrepancies ('01000400127' vs '1000400127')
 * - International prefix (+2010... vs 010...)
 * - Arabic numerals (٠١٠٠...)
 * - Partial search strings (e.g. typing '010004' matches '1000400127')
 * - Punctuation/spaces/dashes
 */
export function matchesPhoneSearch(storedPhone?: string | null, searchQuery?: string | null): boolean {
  if (!storedPhone || !searchQuery) return false;
  
  const rawTarget = convertArabicNumerals(storedPhone).toLowerCase().trim();
  const rawQuery = convertArabicNumerals(searchQuery).toLowerCase().trim();
  
  // 1. Direct raw substring match
  if (rawTarget.includes(rawQuery)) return true;
  
  // 2. Core digit comparison (e.g., '1000400127' vs '01000400127' or partials)
  const targetCore = getCorePhoneDigits(storedPhone);
  const queryCore = getCorePhoneDigits(searchQuery);
  
  if (queryCore.length >= 3 && targetCore.includes(queryCore)) return true;

  // 3. Raw digit comparison
  const targetDigits = convertArabicNumerals(storedPhone).replace(/\D/g, '');
  const queryDigits = convertArabicNumerals(searchQuery).replace(/\D/g, '');
  if (queryDigits.length >= 3 && targetDigits.includes(queryDigits)) return true;
  
  return false;
}

/**
 * Normalizes raw phone input into strict E.164 format for Twilio WhatsApp / SMS broadcasting.
 * Handles Egyptian local numbers (010xxxxxxxx, 10xxxxxxxx, +2010xxxxxxxx, 002010xxxxxxxx),
 * Arabic numerals, and international numbers (+1..., +971..., +966..., etc.).
 * Returns null if the number is invalid or a placeholder (e.g. 000-000-0000, 01111111111).
 */
export function normalizeBroadcastPhone(raw?: string | null): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const converted = convertArabicNumerals(raw)
    .replace(/^whatsapp:/i, '')
    .trim();

  const hasPlus = converted.startsWith('+');
  let digits = converted.replace(/\D/g, '');

  if (!digits || digits.length < 9) return null;
  if (/^0+$/.test(digits)) return null;

  if (digits.startsWith('00') && digits.length >= 12) {
    digits = digits.slice(2);
  }

  let e164 = '';
  if (digits.startsWith('201') && digits.length === 12) {
    e164 = `+${digits}`;
  } else if (digits.startsWith('01') && digits.length === 11) {
    e164 = `+20${digits.slice(1)}`;
  } else if (/^1[0125]\d{8}$/.test(digits)) {
    e164 = `+20${digits}`;
  } else if (hasPlus && digits.length >= 10 && digits.length <= 15) {
    e164 = `+${digits}`;
  } else if (digits.length >= 10 && digits.length <= 15 && !digits.startsWith('0')) {
    e164 = `+${digits}`;
  } else {
    return null;
  }

  if (e164.startsWith('+20')) {
    if (!/^\+201[0125]\d{8}$/.test(e164)) {
      return null;
    }
    if (/^\+201[0125](\d)\1{7}$/.test(e164)) {
      return null;
    }
  }

  return e164;
}

/**
 * Formats the outgoing broadcast message so the recipient clearly sees the sender brand ("INZAN Athletics")
 * and personalizes {memberName} / {firstName} / {clubName} placeholders.
 */
export function formatBrandedMessage(params: {
  body: string;
  title?: string;
  brandName: string;
  channel: 'whatsapp' | 'sms';
  recipientName?: string;
  includeBrandHeader?: boolean;
}): string {
  const {
    body,
    title,
    brandName,
    channel,
    recipientName = 'Member',
    includeBrandHeader = true,
  } = params;

  const cleanName = recipientName.trim() || 'Member';
  const firstName = cleanName.split(/\s+/)[0] || cleanName;

  const replacePlaceholders = (text: string) =>
    text
      .replace(/\{memberName\}/gi, cleanName)
      .replace(/\{name\}/gi, cleanName)
      .replace(/\{firstName\}/gi, firstName)
      .replace(/\{clubName\}/gi, brandName);

  const personalizedBody = replacePlaceholders(body.trim());
  const personalizedTitle = title ? replacePlaceholders(title.trim()) : '';

  const alreadyHasBrand = personalizedBody
    .toLowerCase()
    .includes(brandName.toLowerCase());

  if (channel === 'whatsapp') {
    const lines: string[] = [];
    if (includeBrandHeader && !alreadyHasBrand) {
      lines.push(`🏋️ *${brandName}*`);
      lines.push('');
    }
    if (personalizedTitle) {
      lines.push(`📢 *${personalizedTitle}*`);
      lines.push('');
    }
    lines.push(personalizedBody);
    return lines.join('\n');
  }

  const parts: string[] = [];
  if (includeBrandHeader && !alreadyHasBrand) {
    parts.push(`${brandName}:`);
  }
  if (personalizedTitle) {
    parts.push(`${personalizedTitle} -`);
  }
  parts.push(personalizedBody);
  return parts.join(' ');
}

