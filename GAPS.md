# GAPS.md — MitrixoGYM CRM Gap Analysis & What's Remaining

Updated: 2026-08-23 (Mobile App UX Overhaul, Interactive Booking Flow, Storefront Filters)

---

## RECENT WORK — 2026-08-23 (Mobile App UX Overhaul & Interactive Booking Flow)

### Fixed This Session
**MOB.1 Mobile App Preloader & Splash Optimization** — FIXED ✅
- Removed harsh red rotating spinner (`#FF231F`) in `mobile/App.js`; replaced with dark-mode branded loading card and subtle white spinner.
- Reduced artificial preloader delays in `SettingsContext.tsx` and `GuestPortal.tsx` (from 3000ms/2000ms to 400ms/200ms) for snappy, professional app launches.

**MOB.2 Storefront Corporate & Points Cleanup** — FIXED ✅
- Excluded corporate and group company packages from member/guest storefront catalog (`GuestPortal.tsx`).
- Removed points rewards badges (`+{Math.floor(pkg.price / 100)} Pts`) across all storefront package cards for clean visual hierarchy.

**MOB.3 Smart Multi-Criteria Storefront Filters** — FIXED ✅
- Built instant live search bar for member storefront.
- Added 3 responsive dropdown filters (Branch/Location, Program/Category, Plan Duration) with quick pill toggles and reset controls.
- Integrated dynamic filtered results view showing available packages with immediate card actions.

**MOB.4 Interactive Class Booking Dialog with Package Upsell** — FIXED ✅
- Built and integrated `ClassBookingDialog.tsx` into `MemberClasses.tsx`.
- Automatically inspects member's active packages and session credits.
- If credits exist $\rightarrow$ 1-tap confirmation.
- If no credits exist $\rightarrow$ displays interactive in-dialog package recommendation & direct buy/request options.
- Handles full capacity waitlist joining with automatic promotions.

---

## RECENT WORK — 2026-08-23 (Phone Auth SMS OTP, Staff Phone Management, Member Multi-Format Login)

### Fixed This Session
**AUTH.1 Automated Phone Auth & SMS OTP Password Reset** — FIXED ✅
- Unified 2-step verification modal in `Login.tsx` with Phone SMS OTP code entry + new password update, and Email Reset link fallback.
- Enabled Firebase Phone Auth provider with Egypt (+20) SMS Region Policy and test numbers for dev.

**AUTH.2 Staff & Coach Phone Number Management** — FIXED ✅
- Added `Phone` column in Staff table with amber `No Phone` tags for users missing phone numbers.
- Added universal phone input to Edit User and Invite User dialogs in `Users.tsx` allowing admins to link numbers 1-by-1.

**AUTH.3 Member Multi-Format Login & Self-Linking** — FIXED ✅
- Fixed "Member ID not found" for legacy Strike members by trying all synthetic tenant email candidate formats (`@strike-member.local`, `@${tenantId}-member.local`, `@${tenantId}.mitrixo-member.local`).
- Created `MemberAccountLinkCard.tsx` on `MemberHome.tsx` to allow unlinked members to instant self-link or create a guest profile.

**DOCS.1 Comprehensive Guides & Flowcharts** — COMPLETED ✅
- `docs/INZAN_FEATURE_GUIDE_AND_TUTORIAL.md`
- `docs/STRIKE_MOBILE_APP_ARCHITECTURE_AND_FLOWCHART.md`
- `docs/STRIKE_STAFF_PHONE_NUMBERS_REQUEST.txt`

---

## RECENT WORK — 2026-08-21 (PT Edge Cases & Session Management)

### Fixed This Session
**PT.1 PT Session Booking Edge Cases** — FIXED ✅
- Sessions math strictly processed via `server.ts` transactions to prevent duplicate booking.
- Member `AssessmentDialog` added, storing `preferredCoachId`.
- Member `SessionRatingDialog` added to rate completed sessions (1-5 stars and feedback).
- Member `Request Freeze` workflow implemented (creates `Freeze` status in `bookingRequests` collection).

**PT.2 Admin/Coach Requests Dashboard** — FIXED ✅
- Coach `CoachSessions.tsx` updated with `Assessments` tab so coaches see pending/contacted requests assigned to them.
- Admin `AdminRequests.tsx` dashboard built and routed in `App.tsx` for Managers/Admins to approve freezes (extending `package.endDate` by 7 days automatically) and assign Coaches to PT Assessment requests.

**PT.3 Build/Lint Health** — FIXED ✅
- Fixed TS compilation errors across `server.ts`, `App.tsx`, `AdminRequests.tsx`, and `useSessions.ts`. Build is green and ready for deployment.

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
**Status:** Done ✅
Verified all server routes use `getDbForRequest(req)` instead of raw `getFirestore()`. Checked frontend `src/firebase.ts` correctly initializes `db` using `activeConfig.firestoreDatabaseId`. No hardcoded references to `inzanathletics` outside of its specific cron job.

### 2. Firestore security rules review
**Status:** Done ✅
Reviewed `firestore.rules` and `firestore-tenant.rules`. Tenant isolation is enforced natively by Firestore's database separation (e.g., `(default)` vs `db-inzanathletics`) and rules validate against `/databases/$(database)/...`. Auth tokens are project-wide, but access is correctly constrained because role checks depend on a local `users` document existing in that specific database.

### 3. Dead CockroachDB code cleanup
**Status:** Done ✅
src/db/db.ts and src/db/dbOperations.ts have been completely deleted.

### 4. TypeScript strict mode
**Status:** Done ✅
`strict: true` and `noImplicitAny: true` were already enabled in `tsconfig.json`. Build and `tsc --noEmit` were failing due to missing types in `FeatureFlags` and incorrect status strings in `CoachClassPortal`. These type errors have been fixed and the project now successfully passes `tsc` and `build`.

### 5. Performance audit
**Status:** Done ✅
Pagination and virtual scrolling verified in front-end; client/payment rendering optimized.

### 6. Mobile responsive audit
**Status:** Done ✅
Tabs menus and tables updated with horizontal scrolling (`overflow-x-auto`) to fit mobile screens.

### 7. Android Play Console Publication
**Status:** Deferred ⏳ (Will be published later by owner)
Android build is configured and a build was triggered. Submit with `eas submit` once the Play Console developer account and Service Account Key are ready.

### 8. Push Notifications Enhancement
**Status:** P2
Currently uses basic Expo push proxy. Consider implementing richer notifications with action buttons and deep linking.

### 9. Native Camera Features
**Status:** Done ✅
Expo `CameraView` implemented directly within `mobile/App.js` and securely integrated via `ReactNativeWebView` bridge.

### 10. Background Sync
**Status:** Done ✅
Implemented background sync via Vite PWA Service Worker for offline-capable mobile web app.

---

## Priority Order (Updated 2026-08-21)
1. **[P1] PT / Session Management System** — Build comprehensive session and capacity management per INZAN_PT_MANAGEMENT_PRD.md
2. **[P2] Push notifications enhancement** — richer notifications with actions

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
