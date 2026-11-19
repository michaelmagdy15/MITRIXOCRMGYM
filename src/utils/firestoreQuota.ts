/**
 * Helpers for handling Firestore Spark quota/availability errors gracefully
 * and sanitizing legacy Strike storage bucket URLs across cached clients.
 */

export function isFirestoreQuotaOrUnavailableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') {
    const raw = typeof err === 'string' ? err : '';
    return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(raw);
  }

  const anyErr = err as { code?: unknown; message?: unknown; details?: unknown };
  const code = anyErr.code;
  const codeStr = typeof code === 'string' ? code.toLowerCase().trim() : '';

  if (
    code === 8 ||
    code === 14 ||
    codeStr === '8' ||
    codeStr === '14' ||
    codeStr === 'resource-exhausted' ||
    codeStr === 'unavailable'
  ) {
    return true;
  }

  const msg = [anyErr.message, anyErr.details]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' ');

  return /RESOURCE_EXHAUSTED|Quota exceeded|quota_exceeded/i.test(msg);
}

const LEGACY_STRIKE_BUCKET_HOST = 'faa-test-guide-v2.firebasestorage.app';
const DEDICATED_STRIKE_BUCKET_HOST = 'strike-production-f5242.firebasestorage.app';

/**
 * Rewrites legacy deactivated `faa-test-guide-v2.firebasestorage.app` asset URLs
 * to `strike-production-f5242.firebasestorage.app` ONLY for the Strike tenant.
 */
export function sanitizeLegacyStrikeStorageUrl(
  url: string | undefined | null,
  isStrikeTenant: boolean
): string {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) return '';
  if (!isStrikeTenant) return trimmed;
  if (trimmed.includes(LEGACY_STRIKE_BUCKET_HOST)) {
    return trimmed.split(LEGACY_STRIKE_BUCKET_HOST).join(DEDICATED_STRIKE_BUCKET_HOST);
  }
  return trimmed;
}
