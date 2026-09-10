export interface CountryCode {
  name: string;
  code: string; // ISO 3166-1 alpha-2
  dialCode: string; // e.g. "+20"
  flag: string;
  priority?: number;
  sample?: string;
}

export const COUNTRY_CODES: CountryCode[] = [
  // Primary regional gym markets
  { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬', priority: 1, sample: '10 1234 5678' },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦', priority: 2, sample: '50 123 4567' },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪', priority: 3, sample: '50 123 4567' },
  { name: 'Kuwait', code: 'KW', dialCode: '+965', flag: '🇰🇼', priority: 4, sample: '5123 4567' },
  { name: 'Qatar', code: 'QA', dialCode: '+974', flag: '🇶🇦', priority: 5, sample: '3312 3456' },
  { name: 'Bahrain', code: 'BH', dialCode: '+973', flag: '🇧🇭', priority: 6, sample: '3612 3456' },
  { name: 'Oman', code: 'OM', dialCode: '+968', flag: '🇴🇲', priority: 7, sample: '9123 4567' },
  { name: 'Jordan', code: 'JO', dialCode: '+962', flag: '🇯🇴', priority: 8, sample: '7 9123 4567' },
  { name: 'Lebanon', code: 'LB', dialCode: '+961', flag: '🇱🇧', priority: 9, sample: '70 123 456' },
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸', priority: 10, sample: '(555) 123-4567' },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧', priority: 11, sample: '7911 123456' },

  // Worldwide countries alphabetical
  { name: 'Algeria', code: 'DZ', dialCode: '+213', flag: '🇩🇿' },
  { name: 'Argentina', code: 'AR', dialCode: '+54', flag: '🇦🇷' },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺' },
  { name: 'Austria', code: 'AT', dialCode: '+43', flag: '🇦🇹' },
  { name: 'Bangladesh', code: 'BD', dialCode: '+880', flag: '🇧🇩' },
  { name: 'Belgium', code: 'BE', dialCode: '+32', flag: '🇧🇪' },
  { name: 'Brazil', code: 'BR', dialCode: '+55', flag: '🇧🇷' },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦' },
  { name: 'Chile', code: 'CL', dialCode: '+56', flag: '🇨🇱' },
  { name: 'China', code: 'CN', dialCode: '+86', flag: '🇨🇳' },
  { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴' },
  { name: 'Cyprus', code: 'CY', dialCode: '+357', flag: '🇨🇾' },
  { name: 'Denmark', code: 'DK', dialCode: '+45', flag: '🇩🇰' },
  { name: 'Finland', code: 'FI', dialCode: '+358', flag: '🇫🇮' },
  { name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷' },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪' },
  { name: 'Greece', code: 'GR', dialCode: '+30', flag: '🇬🇷' },
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳' },
  { name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩' },
  { name: 'Iraq', code: 'IQ', dialCode: '+964', flag: '🇮🇶' },
  { name: 'Ireland', code: 'IE', dialCode: '+353', flag: '🇮🇪' },
  { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹' },
  { name: 'Japan', code: 'JP', dialCode: '+81', flag: '🇯🇵' },
  { name: 'Kenya', code: 'KE', dialCode: '+254', flag: '🇰🇪' },
  { name: 'Libya', code: 'LY', dialCode: '+218', flag: '🇱🇾' },
  { name: 'Malaysia', code: 'MY', dialCode: '+60', flag: '🇲🇾' },
  { name: 'Mexico', code: 'MX', dialCode: '+52', flag: '🇲🇽' },
  { name: 'Morocco', code: 'MA', dialCode: '+212', flag: '🇲🇦' },
  { name: 'Netherlands', code: 'NL', dialCode: '+31', flag: '🇳🇱' },
  { name: 'New Zealand', code: 'NZ', dialCode: '+64', flag: '🇳🇿' },
  { name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬' },
  { name: 'Norway', code: 'NO', dialCode: '+47', flag: '🇳🇴' },
  { name: 'Pakistan', code: 'PK', dialCode: '+92', flag: '🇵🇰' },
  { name: 'Palestine', code: 'PS', dialCode: '+970', flag: '🇵🇸' },
  { name: 'Philippines', code: 'PH', dialCode: '+63', flag: '🇵🇭' },
  { name: 'Poland', code: 'PL', dialCode: '+48', flag: '🇵🇱' },
  { name: 'Portugal', code: 'PT', dialCode: '+351', flag: '🇵🇹' },
  { name: 'Russia', code: 'RU', dialCode: '+7', flag: '🇷🇺' },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬' },
  { name: 'South Africa', code: 'ZA', dialCode: '+27', flag: '🇿🇦' },
  { name: 'South Korea', code: 'KR', dialCode: '+82', flag: '🇰🇷' },
  { name: 'Spain', code: 'ES', dialCode: '+34', flag: '🇪🇸' },
  { name: 'Sudan', code: 'SD', dialCode: '+249', flag: '🇸🇩' },
  { name: 'Sweden', code: 'SE', dialCode: '+46', flag: '🇸🇪' },
  { name: 'Switzerland', code: 'CH', dialCode: '+41', flag: '🇨🇭' },
  { name: 'Syria', code: 'SY', dialCode: '+963', flag: '🇸🇾' },
  { name: 'Tunisia', code: 'TN', dialCode: '+216', flag: '🇹🇳' },
  { name: 'Turkey', code: 'TR', dialCode: '+90', flag: '🇹🇷' },
  { name: 'Yemen', code: 'YE', dialCode: '+967', flag: '🇾🇪' }
];

export const DEFAULT_COUNTRY = COUNTRY_CODES[0]!; // Egypt +20

/**
 * Parses an arbitrary phone string into country and national number.
 */
export function parsePhoneNumber(phone?: string | null, fallbackCountryCode: string = 'EG'): {
  country: CountryCode;
  nationalNumber: string;
} {
  const defaultCountry = COUNTRY_CODES.find(c => c.code === fallbackCountryCode) || DEFAULT_COUNTRY;
  if (!phone) {
    return { country: defaultCountry, nationalNumber: '' };
  }

  const raw = phone.toString().trim();
  const digits = raw.replace(/\D/g, '');

  // 1. Check if string starts with + or 00
  if (raw.startsWith('+') || raw.startsWith('00')) {
    const cleanDigits = raw.startsWith('00') ? digits.slice(2) : digits;

    // Match longest dial code first
    const sortedByDial = [...COUNTRY_CODES].sort((a, b) => b.dialCode.length - a.dialCode.length);
    for (const c of sortedByDial) {
      const dialDigits = c.dialCode.replace(/\D/g, '');
      if (cleanDigits.startsWith(dialDigits)) {
        let nat = cleanDigits.slice(dialDigits.length);
        // Strip leading trunk zero if present (e.g. +20010 -> 10)
        if (nat.startsWith('0') && (c.code === 'EG' || c.code === 'GB' || c.code === 'SA')) {
          nat = nat.replace(/^0+/, '');
        }
        return { country: c, nationalNumber: nat };
      }
    }
  }

  // 2. Egyptian special handling (since 95%+ of platform users are in Egypt)
  if (fallbackCountryCode === 'EG') {
    if (digits.startsWith('20') && digits.length >= 11) {
      let nat = digits.slice(2);
      if (nat.startsWith('0')) nat = nat.slice(1);
      return { country: DEFAULT_COUNTRY, nationalNumber: nat };
    }
    if (digits.startsWith('01') && digits.length === 11) {
      return { country: DEFAULT_COUNTRY, nationalNumber: digits.slice(1) };
    }
    if (digits.startsWith('1') && digits.length === 10) {
      return { country: DEFAULT_COUNTRY, nationalNumber: digits };
    }
  }

  return { country: defaultCountry, nationalNumber: digits };
}

/**
 * Formats country and national number into canonical E.164 string.
 */
export function formatToE164(country: CountryCode, nationalNumber: string): string {
  let clean = nationalNumber.replace(/\D/g, '');
  if (!clean) return '';

  // If user typed leading 0 (trunk code) for Egypt, Saudi, UK, etc., strip it
  if (clean.startsWith('0') && (country.code === 'EG' || country.code === 'SA' || country.code === 'GB' || country.code === 'AE')) {
    clean = clean.replace(/^0+/, '');
  }

  return `${country.dialCode}${clean}`;
}
