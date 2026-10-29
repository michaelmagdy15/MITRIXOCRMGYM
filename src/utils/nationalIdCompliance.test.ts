import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  validateEgyptianNationalId,
  hasScannedIdDocument,
  isMemberUnder16,
  validateMemberIdCompliance
} from './nationalIdCompliance';
import {
  assertMembershipCompliance,
  MembershipComplianceError
} from './membershipRules';

describe('Egyptian National ID and Scanned ID Upload Compliance', () => {
  // Test valid IDs:
  // 1. Adult born Oct 15, 1990 in Cairo (gov 01), Male
  const validId1990Male = '29010150112314';
  // 2. Adult born Jan 5, 2002 in Alexandria (gov 02), Female
  const validId2002Female = '30201050212328';
  // 3. Born Feb 29, 2004 (leap year) in Giza (gov 21), Male
  const validIdLeapYear2004 = '30402292112315';
  // 4. Born outside Egypt (gov 88) in 1985, Male
  const validIdBornAbroad = '28507208800139';
  // 5. Kid born in 2015 in Cairo (gov 01), under 16
  const validIdKid2015 = '31505120112311';

  describe('1. validateEgyptianNationalId', () => {
    it('validates correct 14-digit Egyptian National IDs', () => {
      const res1 = validateEgyptianNationalId(validId1990Male);
      assert.strictEqual(res1.valid, true);
      assert.strictEqual(res1.governorateCode, '01');
      assert.strictEqual(res1.governorateName, 'Cairo');
      assert.strictEqual(res1.gender, 'Male');
      assert.strictEqual(res1.dobFormatted, '1990-10-15');

      const res2 = validateEgyptianNationalId(validId2002Female);
      assert.strictEqual(res2.valid, true);
      assert.strictEqual(res2.governorateCode, '02');
      assert.strictEqual(res2.governorateName, 'Alexandria');
      assert.strictEqual(res2.gender, 'Female');
      assert.strictEqual(res2.dobFormatted, '2002-01-05');

      const resLeap = validateEgyptianNationalId(validIdLeapYear2004);
      assert.strictEqual(resLeap.valid, true);
      assert.strictEqual(resLeap.dobFormatted, '2004-02-29');

      const resAbroad = validateEgyptianNationalId(validIdBornAbroad);
      assert.strictEqual(resAbroad.valid, true);
      assert.strictEqual(resAbroad.governorateCode, '88');
      assert.strictEqual(resAbroad.governorateName, 'Born Outside Egypt');
    });

    it('rejects IDs with invalid length or non-digits', () => {
      assert.strictEqual(validateEgyptianNationalId('').valid, false);
      assert.strictEqual(validateEgyptianNationalId('12345').valid, false);
      assert.strictEqual(validateEgyptianNationalId('2901015011231').valid, false); // 13 digits
      assert.strictEqual(validateEgyptianNationalId('290101501123145').valid, false); // 15 digits
      assert.strictEqual(validateEgyptianNationalId('2901015011231A').valid, false); // Alpha char
    });

    it('rejects invalid century digit (must be 2 or 3)', () => {
      // Century 1
      const res1 = validateEgyptianNationalId('19010150112314');
      assert.strictEqual(res1.valid, false);
      assert.match(res1.reason || '', /century digit/i);

      // Century 4
      const res4 = validateEgyptianNationalId('49010150112314');
      assert.strictEqual(res4.valid, false);
      assert.match(res4.reason || '', /century digit/i);
    });

    it('rejects invalid birth month (must be 01-12)', () => {
      const res00 = validateEgyptianNationalId('29000150112314');
      assert.strictEqual(res00.valid, false);
      assert.match(res00.reason || '', /birth month/i);

      const res13 = validateEgyptianNationalId('29013150112314');
      assert.strictEqual(res13.valid, false);
      assert.match(res13.reason || '', /birth month/i);
    });

    it('rejects invalid birth day for the month and leap year rules', () => {
      // Day 00
      const res00 = validateEgyptianNationalId('29005000112314');
      assert.strictEqual(res00.valid, false);

      // Day 32 in January
      const res32 = validateEgyptianNationalId('29001320112314');
      assert.strictEqual(res32.valid, false);

      // Day 31 in April (April has 30 days)
      const resApr31 = validateEgyptianNationalId('29004310112314');
      assert.strictEqual(resApr31.valid, false);

      // Feb 29 in non-leap year (1991 is not a leap year)
      const resFeb29NonLeap = validateEgyptianNationalId('29102290112314');
      assert.strictEqual(resFeb29NonLeap.valid, false);
      assert.match(resFeb29NonLeap.reason || '', /birth day/i);

      // Feb 30 in leap year
      const resFeb30 = validateEgyptianNationalId('30402302112315');
      assert.strictEqual(resFeb30.valid, false);
    });

    it('rejects birth dates in the future', () => {
      // Born in year 2095
      const resFuture = validateEgyptianNationalId('39512250112314');
      assert.strictEqual(resFuture.valid, false);
      assert.match(resFuture.reason || '', /future/i);
    });

    it('rejects invalid governorate codes (must be 01-35 or 88)', () => {
      // Gov 00
      const res00 = validateEgyptianNationalId('29010150012314');
      assert.strictEqual(res00.valid, false);
      assert.match(res00.reason || '', /governorate code/i);

      // Gov 36
      const res36 = validateEgyptianNationalId('29010153612314');
      assert.strictEqual(res36.valid, false);
      assert.match(res36.reason || '', /governorate code/i);

      // Gov 99
      const res99 = validateEgyptianNationalId('29010159912314');
      assert.strictEqual(res99.valid, false);
      assert.match(res99.reason || '', /governorate code/i);
    });
  });

  describe('2. hasScannedIdDocument', () => {
    it('detects direct nationalIdScanUrl and nationalIdPhotoUrl', () => {
      assert.strictEqual(
        hasScannedIdDocument({ nationalIdScanUrl: 'https://cdn.gym.com/id.jpg' }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ nationalIdPhotoUrl: 'https://cdn.gym.com/id_scan.png' }),
        true
      );
    });

    it('detects documents whose name includes national, id, or nid', () => {
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'national_id_front.jpg', url: '...' }] }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'member_id_card.png', url: '...' }] }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'nid_scan.pdf', url: '...' }] }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: ['https://cdn.gym.com/member_id.pdf'] }),
        true
      );
    });

    it('detects documents whose type includes national, id, or nid', () => {
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'scan_file.jpg', type: 'national_id' }] }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'scan_file.jpg', category: 'id' }] }),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'scan_file.jpg', documentType: 'nid' }] }),
        true
      );
    });

    it('returns false for unrelated documents without ID keywords', () => {
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'contract.pdf', url: '...' }] }),
        false
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'waiver.pdf', type: 'contract' }] }),
        false
      );
      assert.strictEqual(hasScannedIdDocument({ documents: [] }), false);
      assert.strictEqual(hasScannedIdDocument({}), false);
    });

    it('detects birth certificates and guardian IDs for under-16 members', () => {
      assert.strictEqual(
        hasScannedIdDocument({ birthCertificateScanUrl: 'https://cdn.gym.com/birth.jpg' }, true),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ guardianNationalIdScanUrl: 'https://cdn.gym.com/guardian.jpg' }, true),
        true
      );
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'birth_certificate.pdf' }] }, true),
        true
      );
      // Birth certificate does not satisfy adult requirement
      assert.strictEqual(
        hasScannedIdDocument({ documents: [{ name: 'birth_certificate.pdf' }] }, false),
        false
      );
    });
  });

  describe('3. validateMemberIdCompliance', () => {
    it('returns non-compliant with missingFields: [nationalId, nationalIdScan] when both are missing', () => {
      const res = validateMemberIdCompliance({});
      assert.strictEqual(res.compliant, false);
      assert.deepStrictEqual(res.missingFields, ['nationalId', 'nationalIdScan']);
      assert.strictEqual(res.errors.length, 2);
    });

    it('returns non-compliant with missingFields: [nationalIdScan] when nationalId is valid but scan is missing', () => {
      const res = validateMemberIdCompliance({ nationalId: validId1990Male });
      assert.strictEqual(res.compliant, false);
      assert.deepStrictEqual(res.missingFields, ['nationalIdScan']);
      assert.strictEqual(res.errors.length, 1);
      assert.match(res.errors[0], /scan is missing/i);
    });

    it('returns non-compliant with missingFields: [nationalId] when scan is uploaded but nationalId is missing', () => {
      const res = validateMemberIdCompliance({
        nationalIdScanUrl: 'https://cdn.gym.com/scan.png'
      });
      assert.strictEqual(res.compliant, false);
      assert.deepStrictEqual(res.missingFields, ['nationalId']);
      assert.strictEqual(res.errors.length, 1);
      assert.match(res.errors[0], /national id is missing/i);
    });

    it('returns non-compliant with missingFields: [nationalId] when nationalId is invalid', () => {
      const res = validateMemberIdCompliance({
        nationalId: '29010159912314', // Invalid governorate 99
        nationalIdScanUrl: 'https://cdn.gym.com/scan.png'
      });
      assert.strictEqual(res.compliant, false);
      assert.deepStrictEqual(res.missingFields, ['nationalId']);
      assert.match(res.errors[0], /governorate code/i);
    });

    it('returns compliant: true when both valid nationalId and scanned ID are provided', () => {
      const res = validateMemberIdCompliance({
        nationalId: validId1990Male,
        nationalIdScanUrl: 'https://cdn.gym.com/national_id.jpg'
      });
      assert.strictEqual(res.compliant, true);
      assert.deepStrictEqual(res.missingFields, []);
      assert.deepStrictEqual(res.errors, []);
    });

    it('returns compliant: true when valid nationalId and ID document in documents array are provided', () => {
      const res = validateMemberIdCompliance({
        nationalId: validId2002Female,
        documents: [
          { id: 'doc-1', name: 'gym_membership_contract.pdf', url: '...' },
          { id: 'doc-2', name: 'national_id_card.jpg', url: '...' }
        ]
      });
      assert.strictEqual(res.compliant, true);
      assert.deepStrictEqual(res.missingFields, []);
      assert.deepStrictEqual(res.errors, []);
    });

    it('handles kids under 16 with flag isUnder16 using guardian National ID', () => {
      const res = validateMemberIdCompliance({
        isUnder16: true,
        guardianNationalId: validId1990Male,
        guardianNationalIdScanUrl: 'https://cdn.gym.com/guardian_id.jpg'
      });
      assert.strictEqual(res.compliant, true);
      assert.deepStrictEqual(res.missingFields, []);
      assert.deepStrictEqual(res.errors, []);
    });

    it('handles kids under 16 using birth certificate scan and national number', () => {
      const res = validateMemberIdCompliance({
        isUnder16: true,
        nationalId: validIdKid2015,
        birthCertificateScanUrl: 'https://cdn.gym.com/birth_certificate.jpg'
      });
      assert.strictEqual(res.compliant, true);
      assert.deepStrictEqual(res.missingFields, []);
    });

    it('detects kids under 16 automatically via dateOfBirth', () => {
      // 10-year-old child born in 2016
      const childMember = {
        dateOfBirth: '2016-04-12',
        guardianNationalId: validId1990Male,
        documents: [{ name: 'birth_cert.pdf', url: '...' }]
      };
      assert.strictEqual(isMemberUnder16(childMember), true);
      const res = validateMemberIdCompliance(childMember);
      assert.strictEqual(res.compliant, true);
    });
  });

  describe('4. assertMembershipCompliance in membershipRules.ts', () => {
    it('enforces compliance on actionType: "new"', () => {
      const invalidMember = {
        name: 'Ahmed Hassan'
      };
      const res = assertMembershipCompliance(invalidMember, 'new');
      assert.strictEqual(res.compliant, false);
      assert.strictEqual(res.allowed, false);
      assert.deepStrictEqual(res.missingFields, ['nationalId', 'nationalIdScan']);
      assert.ok(res.reason && res.reason.includes('National ID'));
    });

    it('passes compliant member on actionType: "new"', () => {
      const validMember = {
        name: 'Youssef Mansour',
        nationalId: validId1990Male,
        nationalIdScanUrl: 'https://storage.gym.com/id.jpg'
      };
      const res = assertMembershipCompliance(validMember, 'new');
      assert.strictEqual(res.compliant, true);
      assert.strictEqual(res.allowed, true);
      assert.deepStrictEqual(res.missingFields, []);
      assert.deepStrictEqual(res.errors, []);
    });

    it('enforces compliance on actionType: "renewal"', () => {
      const expiredMember = {
        name: 'Sara Ali',
        nationalId: validId2002Female
        // missing scan
      };
      const res = assertMembershipCompliance(expiredMember, 'renewal');
      assert.strictEqual(res.compliant, false);
      assert.strictEqual(res.allowed, false);
      assert.deepStrictEqual(res.missingFields, ['nationalIdScan']);
    });

    it('passes compliant member on actionType: "renewal"', () => {
      const renewingMember = {
        name: 'Sara Ali',
        nationalId: validId2002Female,
        documents: [{ name: 'id_front.jpg', url: '...' }]
      };
      const res = assertMembershipCompliance(renewingMember, 'renewal');
      assert.strictEqual(res.compliant, true);
      assert.strictEqual(res.allowed, true);
      assert.deepStrictEqual(res.missingFields, []);
    });

    it('bypasses compliance check on other action types (e.g. "check-in", "view")', () => {
      const unverifiedMember = {
        name: 'Guest User'
      };
      const res = assertMembershipCompliance(unverifiedMember, 'check-in');
      assert.strictEqual(res.compliant, true);
      assert.strictEqual(res.allowed, true);
      assert.deepStrictEqual(res.missingFields, []);
    });

    it('supports kids under 16 with guardian National ID or birth certificate', () => {
      const kidMember = {
        name: 'Omar Sherif',
        isUnder16: true,
        guardianNationalId: validId1990Male,
        documents: [{ name: 'birth_cert.jpg', url: '...' }]
      };
      const resNew = assertMembershipCompliance(kidMember, 'new');
      assert.strictEqual(resNew.compliant, true);
      assert.strictEqual(resNew.allowed, true);

      const resRenewal = assertMembershipCompliance(kidMember, 'renewal');
      assert.strictEqual(resRenewal.compliant, true);
      assert.strictEqual(resRenewal.allowed, true);
    });

    it('throws MembershipComplianceError when throwOnError is true on non-compliance', () => {
      const invalidMember = {
        name: 'Incomplete User'
      };
      assert.throws(
        () => assertMembershipCompliance(invalidMember, 'new', { throwOnError: true }),
        (err: any) => {
          assert.strictEqual(err.name, 'MembershipComplianceError');
          assert.deepStrictEqual(err.missingFields, ['nationalId', 'nationalIdScan']);
          return true;
        }
      );
    });

    it('does not throw when throwOnError is true and member is compliant', () => {
      const validMember = {
        name: 'Omar Khaled',
        nationalId: validId1990Male,
        nationalIdScanUrl: 'https://cdn.gym.com/scan.png'
      };
      const res = assertMembershipCompliance(validMember, 'new', { throwOnError: true });
      assert.strictEqual(res.compliant, true);
      assert.strictEqual(res.allowed, true);
    });
  });
});
