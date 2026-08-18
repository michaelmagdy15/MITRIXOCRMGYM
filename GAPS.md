# GAPS.md — MitrixoGYM CRM Gap Analysis & What's Remaining

Updated: 2026-08-18 (second pass — branding fix deployed, CockroachDB removed, second preloader disabled)

---

## CRITICAL GAPS — Audit 2026-08-18

### Fixed This Session

**C1. Branding settings not loading** — FIXED ✅
- GET /api/settings was returning empty `settingsObj` without fetching from Firestore
- Caused all tenants to show "mitrixogymcrm" and logos not persisting
- POST /api/settings/update was working correctly
- Fixed by adding actual Firestore reads to fetch branding, features, storefront, branches, commission, and sales-target

**C2. Logo upload not persisting** — FIXED ✅ (same root cause as C1)
- Logo uploads to Firebase Storage worked correctly
- But GET /api/settings never loaded the saved logoUrl
- Fixed by C1 fix

**C3. CockroachDB removed** — FIXED ✅
- All club operations migrated from CockroachDB to Firestore:
  - juiceBarOrders → Firestore collection
  - lockers → Firestore collection
  - lockerRequests → Firestore collection
  - guestInvites → Firestore collection
  - auditLogs → Firestore collection
- Server startup no longer tests CockroachDB connection
- Imports removed from server.ts

**C4. Second preloader disabled** — FIXED ✅
- "Loading CRM Data" / "Pulling secure data..." preloader in App.tsx disabled
- Only SettingsContext logo preloader remains

---

## What's Built ✅

| Layer | Status |
|---|---|
| Multi-tenant architecture (Strike + Inzan Athletics) | Done |
| Firebase Firestore backend (CockroachDB removed) | Done |
| Clients/Members management | Done |
| Leads management | Done |
| Payments tracking | Done |
| Packages management | Done |
| Coaches management | Done |
| Attendance tracking | Done |
| Announcements system | Done |
| Club Operations (juice bar, lockers, guest invites) | Done |
| Branding/Settings per tenant | Done (fixed 2026-08-18) |
| Audit logs | Done |
| Tasks | Done |
| Calendar/Bookings | Done |
| QR Check-in | Done |
| Commission tracking | Done |
| Points system | Done |
| Gamification | Done |
| Storefront CMS | Done |

---

## MODERATE GAPS — Still Open

### 1. Tenant isolation verification needed
**Status:** P1
Verify that Strike data cannot be seen by Inzan Athletics users and vice versa. Check all Firestore queries use `getDbForRequest(req)`.

### 2. Firestore security rules review
**Status:** P1
Audit firestore.rules and firestore-tenant.rules to ensure tenant isolation is properly enforced at the database level.

### 3. Dead CockroachDB code cleanup
**Status:** P2
src/db/db.ts and src/db/dbOperations.ts are no longer imported but still exist. Should be deleted or clearly marked as obsolete.

### 4. TypeScript strict mode
**Status:** P2
Project should enable strict TypeScript checking. Current: many `any` types in use.

### 5. Performance audit
**Status:** P1
Client list and payment list loading times should be measured. Implement pagination or virtual scrolling if needed.

### 6. Mobile responsive audit
**Status:** P1
All pages should be tested on mobile viewports. Some UI components may need responsive adjustments.

### 7. Android Play Console Publication
**Status:** P1
Android build is configured but not yet submitted to Play Console. Use `eas build --profile production-strike --platform android` to build, then submit with `eas submit`.

### 8. Push Notifications Enhancement
**Status:** P2
Currently uses basic Expo push proxy. Consider implementing richer notifications with action buttons and deep linking.

### 9. Native Camera Features
**Status:** P2
QR code scanning for attendance is configured but could be enhanced with native camera integration for better performance.

### 10. Background Sync
**Status:** P2
Implement background sync for offline-capable mobile experience when app is in background.

---

## Priority Order (Updated 2026-08-18)

1. **[P1] Tenant isolation verification** — verify no data cross-contamination between Strike and Inzan Athletics
2. **[P1] Performance audit** — client/payment list loading times
3. **[P1] Mobile responsive audit** — test all pages on mobile
4. **[P1] Android Play Console publication** — submit Android build to Play Console
5. **[P2] Firestore security rules review** — ensure tenant isolation enforced at DB level
6. **[P2] Dead code cleanup** — remove CockroachDB files
7. **[P2] TypeScript strict mode** — enable stricter type checking
8. **[P2] Push notifications enhancement** — richer notifications with actions
9. **[P2] Native camera features** — enhance QR scanning
10. **[P2] Background sync** — offline-capable mobile experience

---

## Recently Fixed

| Gap | Date Fixed | Notes |
|---|---|---|
| C1: Branding settings load | 2026-08-18 | GET /api/settings now fetches from Firestore |
| C2: Logo persistence | 2026-08-18 | Same root cause as C1 |
| C3: CockroachDB removal | 2026-08-18 | All club ops migrated to Firestore |
| C4: Second preloader | 2026-08-18 | Disabled "Loading CRM Data" preloader |
