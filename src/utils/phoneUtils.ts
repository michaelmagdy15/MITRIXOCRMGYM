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
