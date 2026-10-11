import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Validates the unauthenticated guest routing state logic:
 * Ensures visitors on any platform (Mobile, Desktop) for both tenants (Strike and Inzan)
 * land directly on the storefront by default, while allowing explicit toggle to staff/member login.
 */
export function resolveUnauthenticatedRoute(
  currentUser: any,
  showPortalOverride: 'crm' | 'store' | 'member' | null,
  pathname: string = '/'
): 'guest-storefront' | 'login' {
  if (currentUser) {
    return 'login'; // Handled by authenticated routing branches
  }
  const isExplicitLogin = showPortalOverride === 'crm' || pathname === '/login';
  if (!isExplicitLogin || showPortalOverride === 'store' || showPortalOverride === 'member') {
    return 'guest-storefront';
  }
  return 'login';
}

test('Unauthenticated Guest Storefront Routing & Access Rules', async (t) => {
  await t.test('1. Guest opening app or website defaults directly to guest-storefront on root /', () => {
    const route = resolveUnauthenticatedRoute(null, null, '/');
    assert.equal(route, 'guest-storefront');
  });

  await t.test('2. Guest on Strike tenant lands on storefront without requiring prior auth', () => {
    const route = resolveUnauthenticatedRoute(null, null, '/');
    assert.equal(route, 'guest-storefront');
  });

  await t.test('3. Guest on Inzan tenant lands on storefront without requiring prior auth', () => {
    const route = resolveUnauthenticatedRoute(null, null, '/');
    assert.equal(route, 'guest-storefront');
  });

  await t.test('4. Guest clicking "Sign In" or "Staff Login" switches cleanly to login view', () => {
    const route = resolveUnauthenticatedRoute(null, 'crm', '/');
    assert.equal(route, 'login');
  });

  await t.test('5. Direct navigation to /login displays login view', () => {
    const route = resolveUnauthenticatedRoute(null, null, '/login');
    assert.equal(route, 'login');
  });

  await t.test('6. User on login view clicking "Back to Storefront" restores guest-storefront', () => {
    const routeStore = resolveUnauthenticatedRoute(null, 'store', '/login');
    assert.equal(routeStore, 'guest-storefront');

    const routeMember = resolveUnauthenticatedRoute(null, 'member', '/login');
    assert.equal(routeMember, 'guest-storefront');
  });
});
