import { differenceInCalendarDays, parseISO } from 'date-fns';

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

// 1. URL Query Param & Deep Link Resolver Test
function resolveMemberPortalRoute(searchParamsString: string): { tab: string; subtab?: string; action?: string } {
  const params = new URLSearchParams(searchParamsString);
  const tab = params.get('tab') || 'home';
  const subtab = params.get('subtab') || undefined;
  const action = params.get('action') || undefined;
  return { tab, subtab, action };
}

// 2. Expiration Status Resolver Test
function getMembershipAlertStatus(expiryIso: string | undefined | null, clientStatus?: string, referenceDate: Date = new Date()): {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysRemaining: number | null;
  bannerType: 'expired' | 'expiring_soon' | 'active';
} {
  if (clientStatus === 'Expired') {
    return { isExpired: true, isExpiringSoon: false, daysRemaining: null, bannerType: 'expired' };
  }
  if (!expiryIso) {
    return { isExpired: false, isExpiringSoon: false, daysRemaining: null, bannerType: 'active' };
  }
  const diff = differenceInCalendarDays(parseISO(expiryIso), referenceDate);
  if (diff < 0) {
    return { isExpired: true, isExpiringSoon: false, daysRemaining: diff, bannerType: 'expired' };
  }
  if (diff <= 7) {
    return { isExpired: false, isExpiringSoon: true, daysRemaining: diff, bannerType: 'expiring_soon' };
  }
  return { isExpired: false, isExpiringSoon: false, daysRemaining: diff, bannerType: 'active' };
}

// 3. Photo Compliance State Resolver Test
function getPhotoComplianceState(client: {
  photoURL?: string;
  pendingPhotoURL?: string;
  photoModerationStatus?: 'pending' | 'approved' | 'rejected';
  photoRejectionReason?: string;
}): {
  displayPhoto: string | null;
  status: 'missing' | 'pending' | 'rejected' | 'approved';
  showUploadAction: boolean;
  showReviewBadge: boolean;
} {
  if (client.photoModerationStatus === 'rejected') {
    return {
      displayPhoto: client.photoURL || null,
      status: 'rejected',
      showUploadAction: true,
      showReviewBadge: false,
    };
  }
  if (client.photoModerationStatus === 'pending' || (!client.photoURL && client.pendingPhotoURL)) {
    return {
      displayPhoto: client.pendingPhotoURL || client.photoURL || null,
      status: 'pending',
      showUploadAction: false,
      showReviewBadge: true,
    };
  }
  if (client.photoURL) {
    return {
      displayPhoto: client.photoURL,
      status: 'approved',
      showUploadAction: false,
      showReviewBadge: false,
    };
  }
  return {
    displayPhoto: null,
    status: 'missing',
    showUploadAction: true,
    showReviewBadge: false,
  };
}

// 4. Native App Link and Intent Interception Test
function evaluateNativeNavigationIntent(url: string, allowedOrigin: string): {
  action: 'open_native_dialer' | 'open_external_app' | 'open_external_browser' | 'load_in_webview' | 'block';
} {
  if (!url || typeof url !== 'string') return { action: 'block' };
  if (/^tel:/i.test(url)) return { action: 'open_native_dialer' };
  if (/^(whatsapp:|mailto:|sms:)/i.test(url) || /^https?:\/\/(wa\.me|api\.whatsapp\.com|maps\.google\.com|maps\.apple\.com)/i.test(url)) {
    return { action: 'open_external_app' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { action: 'block' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { action: 'block' };
  if (parsed.origin === allowedOrigin) return { action: 'load_in_webview' };
  return { action: 'open_external_browser' };
}

// 5. Test Suite Execution
console.log('--- Running Mobile Portal & App Suite Tests ---');

// Test 1: Deep links
const deepLink1 = resolveMemberPortalRoute('?tab=profile&subtab=membership');
assert(deepLink1.tab === 'profile' && deepLink1.subtab === 'membership', 'Deep link to membership tab failed');

const deepLink2 = resolveMemberPortalRoute('?tab=profile&subtab=settings&action=upload_photo');
assert(deepLink2.tab === 'profile' && deepLink2.action === 'upload_photo', 'Deep link to photo upload action failed');

const deepLink3 = resolveMemberPortalRoute('?tab=packages');
assert(deepLink3.tab === 'packages', 'Deep link to packages failed');

console.log('✅ Test 1 Passed: Deep Link and Query Parameter Routing');

// Test 2: Expiration status & alerts
const today = new Date('2026-10-29T12:00:00Z');

// 3 days left
const res3d = getMembershipAlertStatus('2026-11-01T12:00:00Z', 'Active', today);
assert(res3d.isExpiringSoon === true && res3d.bannerType === 'expiring_soon' && res3d.daysRemaining === 3, '3 days expiry check failed');

// 0 days left (expires today)
const res0d = getMembershipAlertStatus('2026-10-29T18:00:00Z', 'Active', today);
assert(res0d.isExpiringSoon === true && res0d.daysRemaining === 0, 'Expires today check failed');

// Already expired
const resExp = getMembershipAlertStatus('2026-10-25T12:00:00Z', 'Expired', today);
assert(resExp.isExpired === true && resExp.bannerType === 'expired', 'Expired check failed');

// 30 days left (active, no warning)
const resActive = getMembershipAlertStatus('2026-11-29T12:00:00Z', 'Active', today);
assert(resActive.isExpiringSoon === false && resActive.bannerType === 'active', 'Active membership check failed');

console.log('✅ Test 2 Passed: Expiration Calculation & Warning Thresholds');

// Test 3: Photo Compliance States
const stateMissing = getPhotoComplianceState({});
assert(stateMissing.status === 'missing' && stateMissing.showUploadAction === true, 'Missing photo check failed');

const statePending = getPhotoComplianceState({
  pendingPhotoURL: 'https://storage/photo_pending.jpg',
  photoModerationStatus: 'pending'
});
assert(statePending.status === 'pending' && statePending.showReviewBadge === true && statePending.displayPhoto === 'https://storage/photo_pending.jpg', 'Pending photo check failed');

const stateRejected = getPhotoComplianceState({
  photoURL: 'https://storage/old.jpg',
  photoModerationStatus: 'rejected',
  photoRejectionReason: 'Sunglasses not allowed'
});
assert(stateRejected.status === 'rejected' && stateRejected.showUploadAction === true, 'Rejected photo check failed');

const stateApproved = getPhotoComplianceState({
  photoURL: 'https://storage/approved.jpg',
  photoModerationStatus: 'approved'
});
assert(stateApproved.status === 'approved' && stateApproved.displayPhoto === 'https://storage/approved.jpg', 'Approved photo check failed');

console.log('✅ Test 3 Passed: Profile Photo Moderation & Compliance States');

// Test 4: Native App Link and External Intent Handling
const strikeOrigin = 'https://strike-egy.com';

const testTel = evaluateNativeNavigationIntent('tel:01001234567', strikeOrigin);
assert(testTel.action === 'open_native_dialer', 'Phone dialer intent failed');

const testWa = evaluateNativeNavigationIntent('https://wa.me/201001234567?text=Hello', strikeOrigin);
assert(testWa.action === 'open_external_app', 'WhatsApp web URL intent failed');

const testWaApp = evaluateNativeNavigationIntent('whatsapp://send?phone=201001234567', strikeOrigin);
assert(testWaApp.action === 'open_external_app', 'WhatsApp native scheme intent failed');

const testMaps = evaluateNativeNavigationIntent('https://maps.google.com/?q=Strike+Gym', strikeOrigin);
assert(testMaps.action === 'open_external_app', 'Google maps intent failed');

const testSameOrigin = evaluateNativeNavigationIntent('https://strike-egy.com/member?tab=profile', strikeOrigin);
assert(testSameOrigin.action === 'load_in_webview', 'Same-origin webview load failed');

const testExternal = evaluateNativeNavigationIntent('https://instapay.eg/pay/123', strikeOrigin);
assert(testExternal.action === 'open_external_browser', 'External browser intent failed');

console.log('✅ Test 4 Passed: Native WebView Safe Origin and External Intent Resolution');
console.log('🎉 ALL MOBILE PORTAL AND APP SUITE TESTS PASSED 100% GREEN!');
