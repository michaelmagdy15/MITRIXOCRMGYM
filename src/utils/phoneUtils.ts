/**
 * Phone number normalization utilities
 * Enforces strict E.164 formatting for Egyptian mobile numbers.
 */

export function normalizeEgyptPhone(phone?: string | null): string {
  if (!phone) return '';
  let clean = phone.toString().replace(/\D/g, '');
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
  const raw = phone.toString().trim();
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
