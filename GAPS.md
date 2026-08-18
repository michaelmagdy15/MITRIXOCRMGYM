# GAPS.md — MitrixoGYM CRM Gap Analysis & What's Remaining

Updated: 2026-08-18 (third pass — member portal permission architecture hardened, baseline lint fixed)

---

## CRITICAL GAPS — Audit 2026-08-18 (Member Portal Permissions)

### Fixed This Session

**C5. Member login broken ("missing or insufficient permissions", member 624)** — FIXED ✅
- Root cause: commit 703db01 restricted `users` reads to owner+staff; `loginWithMemberId` queried `users where clientRecordId == id` BEFORE auth → permission denied
- Fix: login now tries the deterministic tenant email (`member-{id}@{tenant}.mitrixo-member.local` via `getMemberEmail()`) first, then falls back to the new public `POST /api/member/resolve-email` server endpoint for legacy emails

**C6. Member-facing reads of protected collections moved server-side** — FIXED ✅
- `loginWithCoachId` → new public `POST /api/coach/resolve-email` (server-side 3-step lookup)
- `submitMemberPasswordResetRequest` → new public `POST /api/member/request-password-reset` (server-side phone verify + rate limit)
- PT coach list in MemberSessions → new public `GET /api/member/coaches` (id/name/branch only, no emails)
- New public `POST /api/attendance/self-checkin` — full check-in math (PIN, member lookup, double-check-in, decrement) moved to server; kiosk no longer needs anonymous sign-in or client rule grants

**C7. Server-authoritative session math (members can no longer self-grant sessions)** — FIXED ✅
- New authenticated endpoints: `POST /api/classes/book`, `POST /api/sessions/book`, `POST /api/sessions/cancel`, `POST /api/sessions/reschedule`
- MemberClasses join/leave, MemberSessions book/cancel/reschedule now call these; all package/session decrements validated server-side
- Rules tightened: `sessions` create/update = staff only; `classes` update = staff only; `isSafeClientSelfEdit` no longer allows `packages`/`sessionsRemaining` (kept `name/phone/portalUserId`, added `photoURL`); `tasks` create = staff or Package Purchase Request prefix only

**C8. Staff escalation via users self-create closed** — FIXED ✅
- `users` create rule: self-create now only role `'client'` (was `'client' or 'coach'` — any authenticated user could self-promote to coach = staff)

**C9. `/api/clients/update` role check** — FIXED ✅
- Was requireAuth only: any tenant member could update ANY client
- Now: non-staff callers may only update their own client doc (clientDocId + linkedClientIds) with safe fields (name/phone/photoURL/portalUserId)

**C10. Notifications collection had no rules** — FIXED ✅
- Fell through to super-admin-only fallback; member bell read/update denied
- Added rules: read own (recipientUid == uid) or staff; update own read flag only; create/delete staff

**C11. registerFreeUser (Join Club) broken for new users** — FIXED ✅
- Scanned all `clients` to compute the next MEM- ID — denied for brand-new users (no users doc yet)
- Now uses atomic `counters/memberIds` transaction

**C12. Baseline lint errors fixed** — FIXED ✅
- Dead CockroachDB-era `/api/admin/fix-migration` route removed from server.ts (referenced non-existent `fixMigrationData`)
- `GET /api/settings` no longer imports missing `./firebaseAdmin` module (uses `firebase-admin` directly)

### Public endpoints added (documented per AGENTS.md §5)
- `POST /api/member/resolve-email` — resolve auth email by member ID (pre-auth login/fallback)
- `POST /api/coach/resolve-email` — resolve auth email by coach ID/name (pre-auth login)
- `POST /api/member/request-password-reset` — member password reset request (pre-auth)
- `GET /api/member/coaches` — coach list for member portal (id/name/branch only)
- `POST /api/attendance/self-checkin` — PIN-validated self check-in (kiosk, pre-auth)

### Deployed rules changes (firestore.rules + firestore-tenant.rules kept in sync)
- users: self-create role == 'client' only
- sessions: create/update staff-only
- classes: update staff-only
- clients: self-edit allowed keys = name/phone/portalUserId/photoURL (packages/sessionsRemaining removed)
- tasks: create = staff OR status Pending + title starts with "Package Purchase Request:"
- notifications: NEW rule (read own / mark-read only / staff manage)

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
| C5: Member login 624 | 2026-08-18 | Deterministic member email + server resolve fallback |
| C6: Member portal reads | 2026-08-18 | resolve-email / password-reset / coaches / self-checkin endpoints |
| C7: Server-authoritative session math | 2026-08-18 | classes/book + sessions book/cancel/reschedule endpoints; rules tightened |
| C8: users self-create role | 2026-08-18 | Self-create now role 'client' only (coach escalation closed) |
| C9: clients/update role check | 2026-08-18 | Non-staff limited to own client doc + safe fields |
| C10: notifications rules | 2026-08-18 | Added collection rules (was super-admin fallback only) |
| C11: registerFreeUser | 2026-08-18 | Atomic counters/memberIds instead of clients scan |
| C12: baseline lint | 2026-08-18 | Removed dead fix-migration route + firebaseAdmin import |
