/**
 * Comprehensive validation rules and utilities for Egyptian National IDs and universal input fields.
 */
import { convertArabicNumerals } from './phoneUtils';
import type { Client } from '../types';

export interface NationalIdValidationResult {
  valid: boolean;
  error?: string;
  birthDate?: Date;
  gender?: 'male' | 'female';
  governorate?: string;
}

export interface PhoneValidationResult {
  valid: boolean;
  normalized?: string;
  error?: string;
}

export interface NameValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

export interface ValidationOutcome {
  valid: boolean;
  normalized: string;
  error?: string;
}

/**
 * Egyptian Governorate code mapping according to the Egyptian Civil Registry (Ministry of Interior).
 * 01: Cairo, 02: Alexandria, 03: Port Said, 04: Suez, 11: Damietta, 12: Dakahlia, 13: Sharkia,
 * 14: Qalyubia, 15: Kafr El Sheikh, 16: Gharbia, 17: Menofia, 18: Beheira, 19: Ismailia,
 * 21: Giza, 22: Beni Suef, 23: Fayoum, 24: Minya, 25: Asyut, 26: Sohag, 27: Qena,
 * 28: Aswan, 29: Luxor, 31: Red Sea, 32: New Valley, 33: Matrouh, 34: North Sinai,
 * 35: South Sinai, 88: Foreign / Born abroad.
 */
export const EGYPTIAN_GOVERNORATES: Readonly<Record<string, string>> = {
  '01': 'Cairo',
  '02': 'Alexandria',
  '03': 'Port Said',
  '04': 'Suez',
  '11': 'Damietta',
  '12': 'Dakahlia',
  '13': 'Sharkia',
  '14': 'Qalyubia',
  '15': 'Kafr El Sheikh',
  '16': 'Gharbia',
  '17': 'Menofia',
  '18': 'Beheira',
  '19': 'Ismailia',
  '21': 'Giza',
  '22': 'Beni Suef',
  '23': 'Fayoum',
  '24': 'Minya',
  '25': 'Asyut',
  '26': 'Sohag',
  '27': 'Qena',
  '28': 'Aswan',
  '29': 'Luxor',
  '31': 'Red Sea',
  '32': 'New Valley',
  '33': 'Matrouh',
  '34': 'North Sinai',
  '35': 'South Sinai',
  '88': 'Foreign / Born abroad',
};

/**
 * Checks whether a given Gregorian year is a leap year.
 */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Gets the number of days in a given month and year.
 */
function getDaysInMonth(year: number, month: number): number {
  const daysPerMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return daysPerMonth[month - 1] ?? 0;
}

/**
 * Validates a 14-digit Egyptian National ID number and decodes:
 * - Century & Birth date (century 2 = 1900-1999, century 3 = 2000-2099)
 * - Governorate of birth registration
 * - Gender (13th digit: odd = male, even = female)
 */
export function validateEgyptianNationalId(id: string): NationalIdValidationResult {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'National ID is required' };
  }

  const cleanId = convertArabicNumerals(id).trim();

  if (!/^\d{14}$/.test(cleanId)) {
    return { valid: false, error: 'National ID must be exactly 14 numeric digits' };
  }

  // Digit 1: Century indicator
  const centuryDigit = cleanId.charAt(0);
  let centuryPrefix: number;
  if (centuryDigit === '2') {
    centuryPrefix = 1900;
  } else if (centuryDigit === '3') {
    centuryPrefix = 2000;
  } else {
    return {
      valid: false,
      error: 'Invalid century code in National ID (must begin with 2 for 1900s or 3 for 2000s)',
    };
  }

  // Digits 2-7: YYMMDD
  const yy = parseInt(cleanId.substring(1, 3), 10);
  const mm = parseInt(cleanId.substring(3, 5), 10);
  const dd = parseInt(cleanId.substring(5, 7), 10);

  const fullYear = centuryPrefix + yy;

  if (mm < 1 || mm > 12) {
    return { valid: false, error: `Invalid birth month: ${mm}. Must be between 01 and 12.` };
  }

  const maxDays = getDaysInMonth(fullYear, mm);
  if (dd < 1 || dd > maxDays) {
    return {
      valid: false,
      error: `Invalid birth day: ${dd}. Month ${mm} in ${fullYear} has ${maxDays} days.`,
    };
  }

  const birthDate = new Date(fullYear, mm - 1, dd);
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (birthDate > endOfToday) {
    return { valid: false, error: 'Birth date cannot be in the future' };
  }

  // Digits 8-9: Governorate Code
  const govCode = cleanId.substring(7, 9);
  const governorate = EGYPTIAN_GOVERNORATES[govCode];
  if (!governorate) {
    return { valid: false, error: `Invalid Egyptian governorate code: ${govCode}` };
  }

  // Digit 13: Gender (odd = male, even = female)
  const genderDigit = parseInt(cleanId.charAt(12), 10);
  const gender: 'male' | 'female' = genderDigit % 2 === 1 ? 'male' : 'female';

  return {
    valid: true,
    birthDate,
    gender,
    governorate,
  };
}

/**
 * Validates Egyptian mobile numbers (010, 011, 012, 015) and standard international E.164 phone numbers.
 * Normalizes valid numbers to standard E.164 format (+2010..., +1..., etc.).
 */
export function validateEgyptianPhone(phone: string): PhoneValidationResult {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, error: 'Phone number is required' };
  }

  const converted = convertArabicNumerals(phone).trim();
  if (!converted) {
    return { valid: false, error: 'Phone number cannot be empty' };
  }

  // Strip common separating punctuation
  const cleaned = converted.replace(/[\s\-\(\)\.]/g, '');

  // 1. Egyptian mobile formats:
  // - Local 11 digits: 010xxxxxxxx, 011xxxxxxxx, 012xxxxxxxx, 015xxxxxxxx
  // - 10 digits without leading zero: 10xxxxxxxx, 11xxxxxxxx, 12xxxxxxxx, 15xxxxxxxx
  // - +20 prefix: +2010xxxxxxxx, +2011xxxxxxxx, etc.
  // - 0020 prefix: 002010xxxxxxxx, etc.
  // - 20 prefix: 2010xxxxxxxx, etc.
  // - Accidental duplicate 0 after country code: +20010xxxxxxxx, 0020010xxxxxxxx
  if (/^01[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+20${cleaned.slice(1)}` };
  }
  if (/^1[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+20${cleaned}` };
  }
  if (/^\+201[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: cleaned };
  }
  if (/^00201[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+${cleaned.slice(2)}` };
  }
  if (/^201[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+${cleaned}` };
  }
  if (/^\+2001[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+20${cleaned.slice(5)}` };
  }
  if (/^002001[0125]\d{8}$/.test(cleaned)) {
    return { valid: true, normalized: `+20${cleaned.slice(6)}` };
  }

  // If clearly an Egyptian prefix attempt but wrong digits/operator:
  if (
    cleaned.startsWith('01') ||
    cleaned.startsWith('+20') ||
    cleaned.startsWith('0020') ||
    (cleaned.startsWith('201') && cleaned.length <= 13)
  ) {
    return {
      valid: false,
      error: 'Invalid Egyptian mobile number. Must start with 010, 011, 012, or 015 and be 11 digits.',
    };
  }

  // 2. International numbers (E.164 format: +[country code][number], 7 to 15 digits total)
  let intlCandidate = cleaned;
  if (intlCandidate.startsWith('00')) {
    intlCandidate = `+${intlCandidate.slice(2)}`;
  }

  if (/^\+[1-9]\d{6,14}$/.test(intlCandidate)) {
    return { valid: true, normalized: intlCandidate };
  }

  return {
    valid: false,
    error: 'Invalid phone number format. Must be an 11-digit Egyptian mobile or a valid international number.',
  };
}

/**
 * Validates member names:
 * - Must contain at least 2 words (first name and last name)
 * - Allows Arabic letters, Latin letters (including accented), spaces, and hyphens
 * - Rejects numbers and special symbols
 */
export function validateMemberName(name: string): NameValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Member name is required' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Member name cannot be empty' };
  }

  // Allowed: Latin (including accents), Arabic unicode blocks, spaces, hyphens
  const allowedCharsPattern =
    /^[a-zA-Z\u00C0-\u024F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s-]+$/;
  if (!allowedCharsPattern.test(trimmed)) {
    return {
      valid: false,
      error: 'Name cannot contain numbers or special symbols (only Arabic/Latin letters, spaces, and hyphens allowed)',
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return {
      valid: false,
      error: 'Member name must contain at least 2 words (first name and last name)',
    };
  }

  // Ensure each word has at least one valid letter (reject standalone hyphens e.g. "Ahmed -")
  const letterPattern =
    /[a-zA-Z\u00C0-\u024F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  for (const word of words) {
    if (!letterPattern.test(word)) {
      return {
        valid: false,
        error: 'Each word in member name must contain valid letters',
      };
    }
  }

  return { valid: true, normalized: trimmed.replace(/\s+/g, ' ') };
}

// Practical RFC 5322 compliant email regex
const RFC_EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Validates email addresses following RFC 5322 standards.
 */
export function validateEmail(email: string): EmailValidationResult {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email address is required' };
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email address cannot be empty' };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: 'Email address cannot exceed 254 characters' };
  }

  if (!RFC_EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Invalid email address format' };
  }

  return { valid: true };
}

// Backward compatibility helpers
export function validateEgyptPhone(phoneRaw: string | undefined | null): ValidationOutcome {
  const res = validateEgyptianPhone(String(phoneRaw || ''));
  return {
    valid: res.valid,
    normalized: res.normalized || '',
    error: res.error,
  };
}

export function validateEgyptNationalId(
  nationalIdRaw: string | undefined | null
): ValidationOutcome & { birthDate?: string } {
  const res = validateEgyptianNationalId(String(nationalIdRaw || ''));
  let dateStr: string | undefined;
  if (res.birthDate) {
    const y = res.birthDate.getFullYear();
    const m = String(res.birthDate.getMonth() + 1).padStart(2, '0');
    const d = String(res.birthDate.getDate()).padStart(2, '0');
    dateStr = `${y}-${m}-${d}`;
  }
  return {
    valid: res.valid,
    normalized: String(nationalIdRaw || '').trim(),
    error: res.error,
    birthDate: dateStr,
  };
}

export function validateEmailFormat(emailRaw: string | undefined | null): ValidationOutcome {
  const raw = String(emailRaw || '').trim();
  if (!raw) return { valid: true, normalized: '' };
  const res = validateEmail(raw);
  return {
    valid: res.valid,
    normalized: res.valid ? raw.toLowerCase() : raw,
    error: res.error,
  };
}

export function getMemberNationalIdScanUrl(client?: Partial<Client> | null, overridePhotoUrl?: string): string {
  if (overridePhotoUrl && overridePhotoUrl.trim()) return overridePhotoUrl.trim();
  if (!client) return '';
  if (client.nationalIdPhotoUrl && client.nationalIdPhotoUrl.trim()) {
    return client.nationalIdPhotoUrl.trim();
  }
  if (Array.isArray(client.documents) && client.documents.length > 0) {
    const idDoc = client.documents.find((d) => {
      const name = String(d?.name || '').toLowerCase();
      return (
        name.includes('id') ||
        name.includes('national') ||
        name.includes('passport') ||
        name.includes('scan') ||
        Boolean(d?.url)
      );
    });
    if (idDoc?.url) return idDoc.url;
  }
  return '';
}

export function validateMemberNationalIdAndScan(
  client?: Partial<Client> | null,
  overrideNationalId?: string,
  overrideScanUrl?: string
): { valid: boolean; nationalId: string; scanUrl: string; error?: string } {
  const effectiveNatId = (overrideNationalId !== undefined ? overrideNationalId : client?.nationalId) || '';
  const natCheck = validateEgyptianNationalId(effectiveNatId);
  const scanUrl = getMemberNationalIdScanUrl(client, overrideScanUrl);

  if (!natCheck.valid) {
    return {
      valid: false,
      nationalId: effectiveNatId,
      scanUrl,
      error: natCheck.error || 'A valid 14-digit National ID number is required before enrolling or renewing.',
    };
  }

  if (!scanUrl) {
    return {
      valid: false,
      nationalId: effectiveNatId,
      scanUrl: '',
      error: "A scanned image/photo of the member's National ID must be uploaded before completing enrollment or renewal.",
    };
  }

  return {
    valid: true,
    nationalId: effectiveNatId,
    scanUrl,
  };
}
