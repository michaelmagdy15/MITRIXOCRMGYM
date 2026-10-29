import assert from 'assert';
import {
  validateEgyptianNationalId,
  validateEgyptianPhone,
  validateMemberName,
  validateEmail,
  EGYPTIAN_GOVERNORATES,
} from './validationRules';

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

function runValidationSuite() {
  console.log('Running validation rules test suite...\n');

  // ==========================================
  // 1. EGYPTIAN NATIONAL ID TESTS
  // ==========================================
  console.log('--- Egyptian National ID Tests ---');

  test('Valid National ID (Born 1995 in Cairo, Male)', () => {
    // 2 (century 1900s) + 95 (1995) + 05 (May) + 14 (14th) + 01 (Cairo) + 012 + 1 (odd=male) + 5
    const res = validateEgyptianNationalId('29505140101215');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.governorate, 'Cairo');
    assert.strictEqual(res.gender, 'male');
    assert.ok(res.birthDate instanceof Date);
    assert.strictEqual(res.birthDate?.getFullYear(), 1995);
    assert.strictEqual(res.birthDate?.getMonth(), 4); // May is 4 (0-indexed)
    assert.strictEqual(res.birthDate?.getDate(), 14);
  });

  test('Valid National ID (Born 2002 in Giza, Female)', () => {
    // 3 (century 2000s) + 02 (2002) + 08 (August) + 21 (21st) + 21 (Giza) + 004 + 2 (even=female) + 9
    const res = validateEgyptianNationalId('30208212100429');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.governorate, 'Giza');
    assert.strictEqual(res.gender, 'female');
    assert.ok(res.birthDate instanceof Date);
    assert.strictEqual(res.birthDate?.getFullYear(), 2002);
    assert.strictEqual(res.birthDate?.getMonth(), 7); // August is 7 (0-indexed)
    assert.strictEqual(res.birthDate?.getDate(), 21);
  });

  test('Valid National ID with Eastern Arabic numerals', () => {
    // ٢٩٥٠٥١٤٠١٠١٢١٥ -> 29505140101215
    const res = validateEgyptianNationalId('٢٩٥٠٥١٤٠١٠١٢١٥');
    assert.strictEqual(res.valid, true);
    assert.strictEqual(res.governorate, 'Cairo');
    assert.strictEqual(res.gender, 'male');
    assert.strictEqual(res.birthDate?.getFullYear(), 1995);
  });

  test('Rejects invalid century indicators (starts with 1, 4, 0)', () => {
    assert.strictEqual(validateEgyptianNationalId('19505140101215').valid, false);
    assert.strictEqual(validateEgyptianNationalId('40208212100429').valid, false);
    assert.strictEqual(validateEgyptianNationalId('09505140101215').valid, false);
  });

  test('Rejects invalid lengths or non-numeric strings', () => {
    assert.strictEqual(validateEgyptianNationalId('').valid, false);
    assert.strictEqual(validateEgyptianNationalId('2950514010121').valid, false); // 13 digits
    assert.strictEqual(validateEgyptianNationalId('295051401012155').valid, false); // 15 digits
    assert.strictEqual(validateEgyptianNationalId('2950514010121A').valid, false); // letters
  });

  test('Validates leap year birth dates correctly', () => {
    // 2004-02-29 is a leap day -> valid
    const validLeapRes = validateEgyptianNationalId('30402290100115');
    assert.strictEqual(validLeapRes.valid, true);
    assert.strictEqual(validLeapRes.birthDate?.getFullYear(), 2004);
    assert.strictEqual(validLeapRes.birthDate?.getMonth(), 1);
    assert.strictEqual(validLeapRes.birthDate?.getDate(), 29);

    // 2000-02-29 is a leap day (century divisible by 400) -> valid
    const validCenturyLeapRes = validateEgyptianNationalId('30002290100115');
    assert.strictEqual(validCenturyLeapRes.valid, true);

    // 2003-02-29 is NOT a leap day -> invalid
    const invalidLeapRes = validateEgyptianNationalId('30302290100115');
    assert.strictEqual(invalidLeapRes.valid, false);

    // 1900-02-29 is NOT a leap day (1900 not divisible by 400) -> invalid
    const invalid1900Leap = validateEgyptianNationalId('20002290100115');
    assert.strictEqual(invalid1900Leap.valid, false);
  });

  test('Rejects invalid months and out-of-range days', () => {
    // Month 00
    assert.strictEqual(validateEgyptianNationalId('29500140101215').valid, false);
    // Month 13
    assert.strictEqual(validateEgyptianNationalId('29513140101215').valid, false);
    // Day 00
    assert.strictEqual(validateEgyptianNationalId('29505000101215').valid, false);
    // Day 32
    assert.strictEqual(validateEgyptianNationalId('29505320101215').valid, false);
    // April 31 (April has only 30 days)
    assert.strictEqual(validateEgyptianNationalId('29504310101215').valid, false);
  });

  test('Rejects future birth dates', () => {
    // Year 2099
    const futureRes = validateEgyptianNationalId('39901010100115');
    assert.strictEqual(futureRes.valid, false);
    assert.ok(futureRes.error?.includes('future'));
  });

  test('Validates all 28 Egyptian governorate codes', () => {
    const codes = Object.keys(EGYPTIAN_GOVERNORATES);
    assert.strictEqual(codes.length, 28);

    for (const code of codes) {
      // 2 (1900s) + 90 (1990) + 01 (Jan) + 01 (1st) + code + 001 + 1 (male) + 0
      const id = `2900101${code}00110`;
      const res = validateEgyptianNationalId(id);
      assert.strictEqual(res.valid, true, `Failed on governorate code ${code}`);
      assert.strictEqual(res.governorate, EGYPTIAN_GOVERNORATES[code]);
    }
  });

  test('Rejects invalid governorate codes (e.g. 00, 05, 20, 99)', () => {
    assert.strictEqual(validateEgyptianNationalId('29505140001215').valid, false);
    assert.strictEqual(validateEgyptianNationalId('29505140501215').valid, false);
    assert.strictEqual(validateEgyptianNationalId('29505142001215').valid, false);
    assert.strictEqual(validateEgyptianNationalId('29505149901215').valid, false);
  });

  test('Decodes gender accurately from digit 13 (odd=male, even=female)', () => {
    // Odd digits: 1, 3, 5, 7, 9 -> male
    for (const digit of [1, 3, 5, 7, 9]) {
      const res = validateEgyptianNationalId(`295051401012${digit}0`);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.gender, 'male');
    }

    // Even digits: 0, 2, 4, 6, 8 -> female
    for (const digit of [0, 2, 4, 6, 8]) {
      const res = validateEgyptianNationalId(`295051401012${digit}0`);
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.gender, 'female');
    }
  });

  // ==========================================
  // 2. PHONE NUMBER VALIDATION TESTS
  // ==========================================
  console.log('\n--- Egyptian & International Phone Validation Tests ---');

  test('Valid Egyptian mobile numbers (010, 011, 012, 015)', () => {
    const vodafone = validateEgyptianPhone('01012345678');
    assert.strictEqual(vodafone.valid, true);
    assert.strictEqual(vodafone.normalized, '+201012345678');

    const etisalat = validateEgyptianPhone('01123456789');
    assert.strictEqual(etisalat.valid, true);
    assert.strictEqual(etisalat.normalized, '+201123456789');

    const orange = validateEgyptianPhone('01234567890');
    assert.strictEqual(orange.valid, true);
    assert.strictEqual(orange.normalized, '+201234567890');

    const we = validateEgyptianPhone('01512345678');
    assert.strictEqual(we.valid, true);
    assert.strictEqual(we.normalized, '+201512345678');
  });

  test('Valid Egyptian phone with international prefixes (+20, 0020, 20)', () => {
    const withPlus = validateEgyptianPhone('+201012345678');
    assert.strictEqual(withPlus.valid, true);
    assert.strictEqual(withPlus.normalized, '+201012345678');

    const withDoubleZero = validateEgyptianPhone('00201123456789');
    assert.strictEqual(withDoubleZero.valid, true);
    assert.strictEqual(withDoubleZero.normalized, '+201123456789');

    const withDirect20 = validateEgyptianPhone('201234567890');
    assert.strictEqual(withDirect20.valid, true);
    assert.strictEqual(withDirect20.normalized, '+201234567890');

    const withoutZero = validateEgyptianPhone('1012345678');
    assert.strictEqual(withoutZero.valid, true);
    assert.strictEqual(withoutZero.normalized, '+201012345678');
  });

  test('Handles punctuation, formatting spaces, and Eastern Arabic numerals in phone', () => {
    const formatted = validateEgyptianPhone('+20 (10) 1234-5678');
    assert.strictEqual(formatted.valid, true);
    assert.strictEqual(formatted.normalized, '+201012345678');

    const arabicNumerals = validateEgyptianPhone('٠١٠١٢٣٤٥٦٧٨');
    assert.strictEqual(arabicNumerals.valid, true);
    assert.strictEqual(arabicNumerals.normalized, '+201012345678');
  });

  test('Rejects invalid Egyptian mobile operator prefixes and bad lengths', () => {
    // 013 is not a mobile operator in Egypt
    const invalidOp = validateEgyptianPhone('01312345678');
    assert.strictEqual(invalidOp.valid, false);

    // 017 is not an Egyptian mobile operator
    assert.strictEqual(validateEgyptianPhone('01712345678').valid, false);

    // Too short (10 digits starting with 010)
    assert.strictEqual(validateEgyptianPhone('0101234567').valid, false);

    // Too long (12 digits starting with 010)
    assert.strictEqual(validateEgyptianPhone('010123456789').valid, false);
  });

  test('Validates international phone numbers in E.164 format', () => {
    // US (+1)
    const usPhone = validateEgyptianPhone('+14155552671');
    assert.strictEqual(usPhone.valid, true);
    assert.strictEqual(usPhone.normalized, '+14155552671');

    // UK (+44) with spaces and dashes
    const ukPhone = validateEgyptianPhone('+44 7911 123456');
    assert.strictEqual(ukPhone.valid, true);
    assert.strictEqual(ukPhone.normalized, '+447911123456');

    // UAE (+971) with 00 prefix
    const uaePhone = validateEgyptianPhone('00971501234567');
    assert.strictEqual(uaePhone.valid, true);
    assert.strictEqual(uaePhone.normalized, '+971501234567');
  });

  test('Rejects invalid / garbage phone numbers', () => {
    assert.strictEqual(validateEgyptianPhone('').valid, false);
    assert.strictEqual(validateEgyptianPhone('not-a-number').valid, false);
    assert.strictEqual(validateEgyptianPhone('12345').valid, false);
  });

  // ==========================================
  // 3. MEMBER NAME VALIDATION TESTS
  // ==========================================
  console.log('\n--- Member Name Validation Tests ---');

  test('Valid English and Arabic names with at least 2 words', () => {
    assert.strictEqual(validateMemberName('Ahmed Ali').valid, true);
    assert.strictEqual(validateMemberName('أحمد علي').valid, true);
    assert.strictEqual(validateMemberName('Mohamed Ahmed Mahmoud Ali').valid, true);
    assert.strictEqual(validateMemberName('مي حسن').valid, true);
  });

  test('Valid names with hyphens and accented letters', () => {
    assert.strictEqual(validateMemberName('Jean-Luc Picard').valid, true);
    assert.strictEqual(validateMemberName('Fatima El-Zahraa').valid, true);
    assert.strictEqual(validateMemberName('René Dupont').valid, true);
  });

  test('Rejects single-word names', () => {
    const singleWord = validateMemberName('Ahmed');
    assert.strictEqual(singleWord.valid, false);
    assert.ok(singleWord.error?.includes('2 words'));

    const singleArabic = validateMemberName('محمود');
    assert.strictEqual(singleArabic.valid, false);
  });

  test('Rejects names containing numbers or forbidden symbols', () => {
    assert.strictEqual(validateMemberName('Ahmed123 Ali').valid, false);
    assert.strictEqual(validateMemberName('Ahmed_Ali').valid, false);
    assert.strictEqual(validateMemberName('Ahmed @ Ali').valid, false);
    assert.strictEqual(validateMemberName('Ali & Sons').valid, false);
    assert.strictEqual(validateMemberName('Ahmed! Ali').valid, false);
  });

  test('Rejects empty or blank name strings', () => {
    assert.strictEqual(validateMemberName('').valid, false);
    assert.strictEqual(validateMemberName('   ').valid, false);
    assert.strictEqual(validateMemberName(' - ').valid, false);
    assert.strictEqual(validateMemberName('Ahmed -').valid, false);
  });

  // ==========================================
  // 4. EMAIL VALIDATION TESTS
  // ==========================================
  console.log('\n--- Email Validation Tests ---');

  test('Valid RFC email addresses', () => {
    assert.strictEqual(validateEmail('test@example.com').valid, true);
    assert.strictEqual(validateEmail('ahmed.ali@inzanathletics.com').valid, true);
    assert.strictEqual(validateEmail('coach+boxing@sub.domain.co.uk').valid, true);
    assert.strictEqual(validateEmail('user_123.test@domain.org').valid, true);
  });

  test('Rejects invalid email formats', () => {
    assert.strictEqual(validateEmail('').valid, false);
    assert.strictEqual(validateEmail('not-an-email').valid, false);
    assert.strictEqual(validateEmail('user@').valid, false);
    assert.strictEqual(validateEmail('@domain.com').valid, false);
    assert.strictEqual(validateEmail('user@domain').valid, false);
    assert.strictEqual(validateEmail('user@.com').valid, false);
    assert.strictEqual(validateEmail('user name@domain.com').valid, false);
    assert.strictEqual(validateEmail('user@domain..com').valid, false);
  });

  console.log('\n✅ All Egyptian National ID and Universal Input Validation tests passed successfully!\n');
}

runValidationSuite();
