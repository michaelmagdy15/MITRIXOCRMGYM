import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Validates the unauthenticated guest routing state logic:
 * - Strike: Unauthenticated guests land on storefront by default, with toggle to login.
 * - Inzan Athletics: Storefront is disabled per operations request; unauthenticated guests land directly on Login.
 */
export function resolveUnauthenticatedRoute(
  currentUser: any,
  showPortalOverride: 'crm' | 'store' | 'member' | null,
  pathname: string = '/',
  tenantOptions?: { isInzan?: boolean; storefrontEnabled?: boolean }
): 'guest-storefront' | 'login' {
  if (currentUser) {
    return 'login';
  }
  // If Inzan Athletics or storefront is disabled, direct unauthenticated visitors straight to Login
  if (tenantOptions?.isInzan || tenantOptions?.storefrontEnabled === false) {
    return 'login';
  }
  const isExplicitLogin = showPortalOverride === 'crm' || pathname === '/login';
  if (!isExplicitLogin || showPortalOverride === 'store' || showPortalOverride === 'member') {
    return 'guest-storefront';
  }
  return 'login';
}

test('Unauthenticated Guest Storefront Routing & Access Rules', async (t) => {
  await t.test('1. Guest opening app on Strike tenant defaults directly to guest-storefront on root /', () => {
    const route = resolveUnauthenticatedRoute(null, null, '/', { isInzan: false });
    assert.equal(route, 'guest-storefront');
  });

  await t.test('2. Guest on Strike tenant clicking "Sign In" or "Staff Login" switches to login view', () => {
    const route = resolveUnauthenticatedRoute(null, 'crm', '/', { isInzan: false });
    assert.equal(route, 'login');
  });

  await t.test('3. Guest on Inzan tenant lands directly on Login screen (storefront disabled)', () => {
    const routeRoot = resolveUnauthenticatedRoute(null, null, '/', { isInzan: true });
    assert.equal(routeRoot, 'login');

    const routeStoreOverride = resolveUnauthenticatedRoute(null, 'store', '/', { isInzan: true });
    assert.equal(routeStoreOverride, 'login');
  });

  await t.test('4. Direct navigation to /login displays login view on any tenant', () => {
    const routeStrike = resolveUnauthenticatedRoute(null, null, '/login', { isInzan: false });
    assert.equal(routeStrike, 'login');

    const routeInzan = resolveUnauthenticatedRoute(null, null, '/login', { isInzan: true });
    assert.equal(routeInzan, 'login');
  });

  await t.test('5. Strike user on login view clicking "Back to Storefront" restores guest-storefront', () => {
    const routeStore = resolveUnauthenticatedRoute(null, 'store', '/login', { isInzan: false });
    assert.equal(routeStore, 'guest-storefront');
  });
});
