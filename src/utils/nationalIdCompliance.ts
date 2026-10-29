/**
 * National ID and Scanned ID Upload Compliance Utility
 *
 * Requirements & Invariants:
 * 1. Egyptian National ID Rules (14 numeric digits):
 *    - Digit 1: Century (2 = 1900-1999, 3 = 2000-2099)
 *    - Digits 2-3: Birth Year (YY)
 *    - Digits 4-5: Birth Month (MM: 01-12)
 *    - Digits 6-7: Birth Day (DD: 01-31, validated against month & leap years)
 *    - Digits 8-9: Governorate Code (01-35 or 88 for born abroad)
 *    - Digits 10-13: Sequence number (odd = Male, even = Female)
 *    - Digit 14: Verification check digit
 *    - Birth date cannot be in the future
 *
 * 2. Scanned ID Upload:
 *    - Must have either `nationalIdScanUrl` (or `nationalIdPhotoUrl`), OR
 *    - A document in `documents` whose name or type includes 'national', 'id', or 'nid'.
 *
 * 3. Kids / Minors Under 16:
 *    - In Egypt, plastic national ID cards are not legally required/issued until age 15/16.
 *    - Under-16 members (`isUnder16: true` or inferred from DOB / junior category) may be validated using:
 *      a) A birth certificate (national ID number + birth certificate scan/document), OR
 *      b) A guardian's National ID (valid 14-digit Egyptian ID + guardian ID scan/document).
 */

export interface EgyptianNationalIdValidation {
  valid: boolean;
  reason?: string;
  birthDate?: Date;
  dobFormatted?: string;
  governorateCode?: string;
  governorateName?: string;
  gender?: 'Male' | 'Female';
}

export interface MemberComplianceInput {
  nationalId?: string;
  documents?: any[];
  nationalIdScanUrl?: string;
  nationalIdPhotoUrl?: string;
  isUnder16?: boolean;
  guardianNationalId?: string;
  guardianNationalIdScanUrl?: string;
  birthCertificateScanUrl?: string;
  dateOfBirth?: string;
  memberCategory?: string;
  [key: string]: any;
}

export interface MemberComplianceResult {
  compliant: boolean;
  missingFields: string[];
  errors: string[];
}

export const EGYPTIAN_GOVERNORATES: Record<string, string> = {
  '01': 'Cairo',
  '02': 'Alexandria',
  '03': 'Port Said',
  '04': 'Suez',
  '11': 'Damietta',
  '12': 'Dakahlia',
  '13': 'Ash Sharqia',
  '14': 'Kaliobeya',
  '15': 'Kafr El-Sheikh',
  '16': 'Gharbeya',
  '17': 'Menoufia',
  '18': 'Beheira',
  '19': 'Ismailia',
  '21': 'Giza',
  '22': 'Beni Suef',
  '23': 'Faiyum',
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
  '88': 'Born Outside Egypt'
};

/**
 * Validates a 14-digit Egyptian National ID.
 * Enforces century (2 or 3), valid birth date with leap years, governorate (01-35 or 88), and non-future date.
 */
export function validateEgyptianNationalId(rawId?: string | null): EgyptianNationalIdValidation {
  if (!rawId || typeof rawId !== 'string') {
    return { valid: false, reason: 'National ID is required and must be a string.' };
  }

  const clean = rawId.trim();

  if (!/^\d{14}$/.test(clean)) {
    return {
      valid: false,
      reason: `National ID must be exactly 14 digits (received ${clean.length} characters).`
    };
  }

  const centuryChar = clean[0];
  if (centuryChar !== '2' && centuryChar !== '3') {
    return {
      valid: false,
      reason: `Invalid century digit '${centuryChar}'. Egyptian National IDs must begin with 2 (1900-1999) or 3 (2000-2099).`
    };
  }

  const century = centuryChar === '2' ? 1900 : 2000;
  const yy = parseInt(clean.slice(1, 3), 10);
  const mm = parseInt(clean.slice(3, 5), 10);
  const dd = parseInt(clean.slice(5, 7), 10);
  const fullYear = century + yy;

  if (mm < 1 || mm > 12) {
    return {
      valid: false,
      reason: `Invalid birth month '${clean.slice(3, 5)}'. Month must be between 01 and 12.`
    };
  }

  // Calculate days in month taking leap year into account
  const isLeapYear = (fullYear % 4 === 0 && fullYear % 100 !== 0) || fullYear % 400 === 0;
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const maxDays = daysInMonth[mm - 1] ?? 31;

  if (dd < 1 || dd > maxDays) {
    return {
      valid: false,
      reason: `Invalid birth day '${clean.slice(5, 7)}' for month ${mm} and year ${fullYear} (maximum allowed is ${maxDays}).`
    };
  }

  const birthDate = new Date(fullYear, mm - 1, dd);
  const now = new Date();
  if (birthDate > now) {
    return {
      valid: false,
      reason: `Birth date ${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')} cannot be in the future.`
    };
  }

  const govCode = clean.slice(7, 9);
  const govNum = parseInt(govCode, 10);
  const isValidGov = (govNum >= 1 && govNum <= 35) || govNum === 88;
  if (!isValidGov) {
    return {
      valid: false,
      reason: `Invalid governorate code '${govCode}'. Governorate code must be between 01-35 or 88 (born outside Egypt).`
    };
  }

  const seqNum = parseInt(clean.slice(9, 13), 10);
  const gender = seqNum % 2 !== 0 ? 'Male' : 'Female';
  const govName = EGYPTIAN_GOVERNORATES[govCode] || 'Unknown';
  const dobFormatted = `${fullYear}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

  return {
    valid: true,
    birthDate,
    dobFormatted,
    governorateCode: govCode,
    governorateName: govName,
    gender
  };
}

/**
 * Checks whether a member is considered under 16 years of age.
 */
export function isMemberUnder16(member?: MemberComplianceInput | null): boolean {
  if (!member) return false;
  if (member.isUnder16 === true) return true;

  const cat = String(member.memberCategory || '').toLowerCase();
  if (cat.includes('kids') || cat.includes('junior')) {
    return true;
  }

  if (member.dateOfBirth) {
    const dob = new Date(member.dateOfBirth);
    if (!isNaN(dob.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const m = today.getMonth() - dob.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
        age--;
      }
      if (age < 16) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a scanned copy/image of the National ID (or birth certificate for minors) is uploaded.
 */
export function hasScannedIdDocument(member: MemberComplianceInput, isUnder16: boolean = false): boolean {
  // Direct scan URL fields
  if (typeof member.nationalIdScanUrl === 'string' && member.nationalIdScanUrl.trim().length > 0) {
    return true;
  }
  if (typeof member.nationalIdPhotoUrl === 'string' && member.nationalIdPhotoUrl.trim().length > 0) {
    return true;
  }

  if (isUnder16) {
    if (typeof member.guardianNationalIdScanUrl === 'string' && member.guardianNationalIdScanUrl.trim().length > 0) {
      return true;
    }
    if (typeof member.birthCertificateScanUrl === 'string' && member.birthCertificateScanUrl.trim().length > 0) {
      return true;
    }
  }

  // Documents collection inspection
  if (Array.isArray(member.documents) && member.documents.length > 0) {
    return member.documents.some((doc) => {
      if (!doc) return false;
      if (typeof doc === 'string') {
        const lower = doc.toLowerCase();
        if (isUnder16 && (lower.includes('birth') || lower.includes('certificate') || lower.includes('cert'))) {
          return true;
        }
        return lower.includes('national') || lower.includes('nid') || lower.includes('id');
      }

      const name = String(doc.name || doc.title || doc.fileName || doc.filename || '').toLowerCase();
      const type = String(doc.type || doc.category || doc.documentType || '').toLowerCase();

      if (isUnder16) {
        if (
          name.includes('birth') ||
          name.includes('certificate') ||
          name.includes('cert') ||
          type.includes('birth') ||
          type.includes('certificate') ||
          type.includes('cert')
        ) {
          return true;
        }
      }

      const hasNameMatch = name.includes('national') || name.includes('nid') || name.includes('id');
      const hasTypeMatch = type.includes('national') || type.includes('nid') || type.includes('id');

      return hasNameMatch || hasTypeMatch;
    });
  }

  return false;
}

/**
 * Validates member compliance with National ID and scanned ID upload regulations.
 * Returns { compliant: boolean, missingFields: string[], errors: string[] }.
 */
export function validateMemberIdCompliance(
  member?: MemberComplianceInput | null
): MemberComplianceResult {
  const missingFields: string[] = [];
  const errors: string[] = [];

  if (!member) {
    return {
      compliant: false,
      missingFields: ['nationalId', 'nationalIdScan'],
      errors: [
        'National ID is missing. A valid 14-digit Egyptian National ID is required.',
        'National ID scan is missing. A scanned copy or photo of the ID must be uploaded.'
      ]
    };
  }

  const isUnder16 = isMemberUnder16(member);

  // 1. National ID validation
  if (isUnder16) {
    // Under 16: can use member's nationalId (from birth cert) OR guardian's nationalId
    const effectiveId = (member.nationalId || member.guardianNationalId || '').trim();
    if (!effectiveId) {
      missingFields.push('nationalId');
      errors.push('National ID, birth certificate national number, or Guardian National ID is required for minor members.');
    } else {
      const validation = validateEgyptianNationalId(effectiveId);
      if (!validation.valid) {
        missingFields.push('nationalId');
        errors.push(`Invalid National ID: ${validation.reason}`);
      }
    }
  } else {
    // Adult: must have their own valid 14-digit Egyptian National ID
    const nationalId = (member.nationalId || '').trim();
    if (!nationalId) {
      missingFields.push('nationalId');
      errors.push('National ID is missing. A valid 14-digit Egyptian National ID is required.');
    } else {
      const validation = validateEgyptianNationalId(nationalId);
      if (!validation.valid) {
        missingFields.push('nationalId');
        errors.push(`Invalid National ID: ${validation.reason}`);
      }
    }
  }

  // 2. Scanned ID validation
  const hasScan = hasScannedIdDocument(member, isUnder16);
  if (!hasScan) {
    missingFields.push('nationalIdScan');
    if (isUnder16) {
      errors.push('Scanned document is missing. Please upload a National ID scan, Guardian ID scan, or Birth Certificate.');
    } else {
      errors.push('National ID scan is missing. Please upload a scanned copy or photo of the National ID.');
    }
  }

  return {
    compliant: missingFields.length === 0,
    missingFields,
    errors
  };
}
