import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isFirestoreQuotaOrUnavailableError,
  sanitizeLegacyStrikeStorageUrl,
} from './firestoreQuota';

test('isFirestoreQuotaOrUnavailableError detects quota and availability failures accurately', () => {
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: 8 }), true);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: 14 }), true);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: '8' }), true);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: '14' }), true);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: 'resource-exhausted' }), true);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: 'unavailable' }), true);
  assert.equal(
    isFirestoreQuotaOrUnavailableError(new Error('8 RESOURCE_EXHAUSTED: Quota exceeded.')),
    true
  );

  assert.equal(isFirestoreQuotaOrUnavailableError(null), false);
  assert.equal(isFirestoreQuotaOrUnavailableError(undefined), false);
  assert.equal(isFirestoreQuotaOrUnavailableError({ code: 'auth/invalid-id-token' }), false);
  assert.equal(isFirestoreQuotaOrUnavailableError(new Error('Invalid token')), false);
});

test('sanitizeLegacyStrikeStorageUrl rewrites legacy Strike URLs only for Strike tenant', () => {
  const legacyUrl =
    'https://firebasestorage.googleapis.com/v0/b/faa-test-guide-v2.firebasestorage.app/o/branding%2Flogo-1787065483005.png?alt=media&token=53fb126e-e9a8-4e13-9857-f8d03808a46c';
  const expectedStrikeUrl =
    'https://firebasestorage.googleapis.com/v0/b/strike-production-f5242.firebasestorage.app/o/branding%2Flogo-1787065483005.png?alt=media&token=53fb126e-e9a8-4e13-9857-f8d03808a46c';

  assert.equal(sanitizeLegacyStrikeStorageUrl(legacyUrl, true), expectedStrikeUrl);
  assert.equal(sanitizeLegacyStrikeStorageUrl(legacyUrl, false), legacyUrl);

  const nonLegacyUrl =
    'https://firebasestorage.googleapis.com/v0/b/inzan-crm-spark-26.firebasestorage.app/o/logo.png?alt=media';
  assert.equal(sanitizeLegacyStrikeStorageUrl(nonLegacyUrl, true), nonLegacyUrl);
  assert.equal(sanitizeLegacyStrikeStorageUrl(nonLegacyUrl, false), nonLegacyUrl);

  assert.equal(sanitizeLegacyStrikeStorageUrl('', true), '');
  assert.equal(sanitizeLegacyStrikeStorageUrl(null, true), '');
  assert.equal(sanitizeLegacyStrikeStorageUrl(undefined, false), '');
});
