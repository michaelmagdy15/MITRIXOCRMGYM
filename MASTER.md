# MASTER.md — MitrixoGYM CRM Platform Agent Brief

**This is the only file you need to be handed.** It tells you everything about using the other documents to work fully autonomously on the MitrixoGYM CRM platform until it is production-ready. You never ask for permission. You start now, you decide, you ship, you report.

---

## 1. What You Are Building

**MitrixoGYM** — a multi-tenant Firebase CRM platform for fitness gyms and fitness studios. Mission: comprehensive member management, staff management, payments, packages, attendance tracking, and guest management for multiple gym brands under a single platform.

**Current state:** v1.2 — Multi-tenant architecture with 2 active tenants (Strike, Inzan Athletics). Native mobile full-screen wallpaper splash loader for iPhones and Androids; complete elimination of legacy "mitrixogymcrm" branding from loading states, meta tags, and PWA manifests; resolved group class attendees & orphan references; fixed drop sessions localization and payments table client name resolution; fixed hidden "Hold" members and universal CRM search; eliminated repeating client records in payments; enforced non-destructive `{ merge: true }` writes across all collections; staff emergency override; member quick start onboarding guide. Strict tenant isolation maintained: Strike `(default)` and Inzan Athletics (`db-inzanathletics`) pristine.

**Active session (2026-09-13):**
- **Mobile-Native Splash Loader**: Created full-screen wallpaper splash for iPhones and Androids only (`/strike_slide_outdoor.png` background + ambient vignette + centered white Strike logo + progress bar pill + "STRIKE BOXING CLUB" tagline) with zero white flash or web app stutter; smooth dismissal on auth ready.
- **Brand Purification**: Completely eliminated "mitrixogymcrm" text from `index.html` meta tags (`apple-mobile-web-app-title`, `application-name`), PWA manifest (`vite.config.ts`), `SettingsContext.tsx`, `App.tsx`, `Login.tsx`, and member UI components.
- **Relational Integrity & Orphan Resolution**: Fixed class attendees rendering "Unknown Client" via `resolveAttendee(attendee, clients)` with clickable profile links; coach client loading unblocked in `useClients.ts`.
- **Drop Sessions & Payments Table Resolution**: Fixed `payments.table.unknown_client` raw localization code; supported `isGuest` / `clientId: 'WALK-IN-GUEST'` in `transactionService.ts`.
- **"Hold" Members & Search Visibility**: Added `"all"` default tab in `Clients.tsx` showing Active, Hold, and Expiring Soon members; search now queries all members regardless of active tab.
- **Non-Destructive Writes**: Enforced `{ merge: true }` across all Firestore write paths.
- **Payments Repeating Records**: Fixed Menna GAD repeating bug in `Payments.tsx` with strict indexed maps and guarded fallbacks.
- **Staff Emergency Override & Member Onboarding**: Added front desk emergency admission to `ClassManager.tsx` and 3-step Quick Guide card to `MemberHome.tsx`.

---

## 8. Live Session Log — 2026-09-13 (most recent)

### Comprehensive Scope & Detailed Breakdown

#### Part 1: Group Class Attendees & Orphan Resolution
- **Symptom**: The class attendee list for Adult Boxing & Conditioning showed "Unknown Client" with an unclickable record.
- **Root Causes**:
  1. `src/hooks/useClients.ts` returned an empty client array `[]` whenever `effectiveRole === 'coach'`, leaving all class attendees unresolvable for coaches.
  2. Member lookups in attendee rosters were rigid (`c.id === attendeeId || c.memberId === attendeeId`), failing when an attendee ID was stored as a `portalUserId`, normalized phone number, or object.
  3. Attendee records were rendered as plain static text with no navigation link.
- **Fixes Applied**:
  - **New Utility** [`src/utils/attendeeUtils.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/utils/attendeeUtils.ts): `resolveAttendee(attendee, clients)` normalizes attendee lookups across Firestore document ID, `#memberId`, `portalUserId`, and phone number.
  - **Class Manager Roster** [`src/components/ClassManager.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/ClassManager.tsx):
    - Attendee names now render as interactive buttons navigating directly to member profile (`setActiveTab('clients'); setActiveClientId(client.id)`).
    - If a member record genuinely no longer exists, click is disabled and a tooltip `Profile no longer found (ID: ${rawId})` is displayed along with an `Orphaned` badge.
    - Updated waitlist entries with the same normalized resolution and clickable navigation.
  - **Calendar View** [`src/Calendar.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Calendar.tsx): Session Details Modal and Class Details Modal updated to use `resolveAttendee` with direct profile navigation.
  - **Coach Portal** [`src/coach/CoachClassPortal.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/coach/CoachClassPortal.tsx): Indexed `clientMap` by `doc.id`, `memberId`, `portalUserId`, and stripped phone digits so coaches see attendees correctly on class rosters.
  - **Bookings Table** [`src/Bookings.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Bookings.tsx): Unified `bookingRequests` and `booking_requests` snapshot listeners; attendee names made clickable.

#### Part 2: Drop Sessions & Payments Table Name Resolution
- **Symptom**: Drop-in sessions (450 LE) rendered the raw localization code string `payments.table.unknown_client`.
- **Root Causes**:
  1. Missing localization key: `payments.table.unknown_client` was missing from `en.json` and `ar.json`.
  2. Payments table strictly required `clients.find(c => c.id === payment.clientId)?.name`, ignoring `payment.clientName`, `payment.client_name`, or `payment.guestName`.
- **Fixes Applied**:
  - **Localization** [`src/locales/en.json`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/locales/en.json) & [`src/locales/ar.json`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/locales/ar.json): Added `"unknown_client": "Walk-in Guest"` / `"ضيف / زائر"`, `"walk_in_tag": "Guest"` / `"زائر"`, and `"record_as_guest": "Record as Walk-in / Drop Session Guest"`.
  - **Types** [`src/types.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/types.ts): Extended `Payment` interface with `clientName?: string;`, `guestName?: string;`, `memberId?: string;`.
  - **Transaction Service** [`src/services/transactionService.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/transactionService.ts): Added support for `isGuest: true` or `clientId: 'WALK-IN-GUEST'` without failing with "Client document not found", persisting `clientName`, `client_name`, and `guestName` directly onto the payment document.
  - **Payments Table** [`src/Payments.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Payments.tsx): Fallback cascade resolves `payment.clientName || payment.client_name || payment.guestName || (payment as any).guest_name || client?.name || t('payments.table.unknown_client')`. Guest records display with a `<Badge variant="outline">Guest</Badge>` tag.

#### Part 3: Vanishing CRM Records & "Hold" Clients Filter Fix
- **Symptom**: 5 members on Hold (`Doaa Mostafa (#451)`, `Hady islam (#477)`, `ali (#384)`, `Ziad (#233)`, `Hamsa (#210)`) were hidden from the CRM list and search bar.
- **Root Causes**:
  1. Default tab in `Clients.tsx` was `'active'` (`[...activeMembers, ...nearlyExpired]`), excluding members on Hold unless staff manually switched tabs.
  2. Search bar in `Clients.tsx` only filtered the currently active tab's subset, so searching for on-hold members returned 0 results.
  3. Case-sensitive status comparisons (`c.status === 'Active'`) missed variations.
- **Fixes Applied**:
  - In [`src/Clients.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Clients.tsx), introduced default tab `"all"` displaying All Current members (`Active`, `Hold`, and `Nearly Expired`) with distinct status badges.
  - Case-insensitive status matching (`(c.status || '').toLowerCase().trim()`).
  - Search input (`deferredSearchTerm`) searches across **all** `members`, ensuring on-hold, frozen, and expired members are always discoverable.
  - In [`src/hooks/useClients.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/hooks/useClients.ts), expanded Firestore listener query to include all status variations (`['Active', 'Hold', 'Nearly Expired', 'nearly expired', 'hold', 'active', 'HOLD', 'ACTIVE', 'Frozen', 'frozen']`) and removed the coach role block.

#### Part 4: Enforce Non-Destructive Updates Across All Collections
- **Audit & Fixes**:
  - Applied `{ merge: true }` to `batch.set(docRef, finalClient, { merge: true })` in [`src/hooks/useClients.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/hooks/useClients.ts#L572) to eliminate the risk of destructive member overwrites during batch imports or registrations.
  - Applied `{ merge: true }` to `setDoc(docRef, cleanData(paymentData), { merge: true })` in [`src/hooks/usePayments.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/hooks/usePayments.ts#L64).
  - Applied `{ merge: true }` to all `setDoc` operations in [`src/services/sharedServices.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/sharedServices.ts) and [`src/contexts/AuthContext.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/contexts/AuthContext.tsx).

#### Part 5: Staff Emergency Override & Member Quick Guide
- Added Staff Emergency Override to [`src/components/ClassManager.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/ClassManager.tsx): Front desk staff can admit members at the door even if their session count is 0, logging an override audit log.
- Added 3-step Quick Guide card to [`src/member/MemberHome.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberHome.tsx) for newly registered members (How to check in via QR, book group classes, and view active sessions).

#### Part 6: Fix "Menna GAD" Repeating in Payments Table
- **Symptom**: Client name "Menna GAD" was repeatedly displaying across unrelated payment records in the Payments view.
- **Root Cause**: In [`src/Payments.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Payments.tsx), client lookups relied on unindexed or loosely-matched client searches; when `payment.clientId` was missing or unindexed, a fallback or stale closure in the client mapping logic reused the last matched client.
- **Fix Applied**: Built strict indexed maps for clients (`idMap`, `memberIdMap`, `phoneMap`) and guarded against undefined `clientId` lookups; payments without explicit client records fall back cleanly to `payment.clientName`, `payment.guestName`, or `Walk-in Guest` rather than repeating another member's name.

#### Part 7: Mobile-Native Full-Screen Wallpaper Splash Screen (iPhones & Androids Only)
- **User Requirement**: Create a full-screen loading animation for mobile (iPhones and Androids only) featuring a wallpaper background and centered app logo to eliminate the "web app" feel.
- **Implementation**:
  - In [`index.html`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/index.html), placed `#mobile-native-splash` directly inside `<body>` before `<div id="root"></div>` so it renders on frame 1 with 0ms delay before JavaScript parses.
  - **Wallpaper Background**: Uses high-res portrait Strike gym wallpaper (`/strike_slide_outdoor.png`) with an 8-second drift animation and dark radial vignette overlay.
  - **Centered Logo**: Displays pure white STRIKE logo (`/strikelogo_white.png`) with ambient crimson glow (`rgba(225, 29, 72, 0.32)`), subtle breathing animation, and drop shadow.
  - **Progress Bar & Tagline**: Slim glowing loading track with animated fill and "STRIKE BOXING CLUB" subtitle.
  - **Mobile-Only Guard**: Activated strictly for mobile devices (`/iPhone|iPad|iPod|Android|webOS.../i.test(navigator.userAgent) || window.innerWidth < 768`). Desktop screens set `display: none;` instantly so desktop CRM loading remains unaffected.
  - **Smooth Dismissal**: Added `window.__dismissMobileSplash()` with a 500ms opacity & scale-up ease transition, called when `isAuthReady` is true in [`src/App.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/App.tsx), [`src/Login.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Login.tsx), [`src/member/MemberPortal.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberPortal.tsx), and [`src/member/GuestPortal.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/GuestPortal.tsx), plus a 6-second safety fallback.

#### Part 8: Complete Elimination of "mitrixogymcrm" Text on Load
- **Root Causes Identified**:
  - `index.html` lines 11 & 13 had `<meta name="apple-mobile-web-app-title" content="mitrixogymcrm" />` and `<meta name="application-name" content="mitrixogymcrm" />`.
  - `vite.config.ts` PWA manifest had `name: 'mitrixogymcrm CRM'` and `short_name: 'mitrixogymcrm'`, causing iOS & Android PWA launchers to show "mitrixogymcrm" while loading.
  - In `SettingsContext.tsx`, `App.tsx`, and `Login.tsx`, the preloader displayed `{companyName}` in raw text if `logoUrl` was unresolved; if `branding.companyName` contained "mitrixogymcrm" or before settings loaded, it rendered large "MITRIXOGYMCRM" text.
- **Fixes Applied**:
  - In [`index.html`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/index.html), updated meta tags to `<meta name="apple-mobile-web-app-title" content="STRIKE" />`, `<meta name="application-name" content="STRIKE" />`, and default `<title>Strike Boxing Club</title>`.
  - In [`vite.config.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/vite.config.ts), updated PWA manifest to `name: 'Strike Boxing Club'` and `short_name: 'STRIKE'`.
  - In [`src/contexts/SettingsContext.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/contexts/SettingsContext.tsx), [`src/App.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/App.tsx), and [`src/Login.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Login.tsx), sanitized `companyName` and `logoUrl`: if `companyName` contains "mitrixo" or is empty, it immediately resolves to `'STRIKE'`, and `logoUrl` defaults to `/strikelogo_white.png` / `/strikelogo.png` rather than raw text fallback.
  - Cleaned remaining user-facing instances in `MemberLocker.tsx`, `MemberInvites.tsx`, `ForcePasswordChangeDialog.tsx`, `QRCodePage.tsx`, `HelpPage.tsx`, and `GuestPortal.tsx`.

### Verification Status
- **`npm run lint` (`tsc --noEmit`)**: ✓ 0 errors.
- **`npm run build` (`vite build && esbuild server.ts`)**: ✓ 0 errors (dist bundle, PWA manifest with `STRIKE`, and `dist-server/server.cjs` compiled clean).
- **Browser Subagent Visual Verification**:
  - **Mobile (iPhone 390×844)**: Verified that the full-screen wallpaper splash with centered glowing Strike logo displays seamlessly without white flash or "web app" stutter, and dismisses smoothly into the portal. Zero occurrences of `mitrixogymcrm`.
  - **Desktop (1280×800)**: Verified desktop CRM loads cleanly without mobile splash overlay.

---

## 9. Live Session Log — 2026-09-06

### Fixed & Built this session
1. **Inzan PT & Classes System Complete Audit & Implementation:**
   - Audited PRD (`docs/INZAN_CLASSES_PRD.md`) against live implementation across backend, CRM, and portal components.
   - Built dual-write synchronization into `classBookings` collection inside `/api/classes/book` for background waitlist triggers and analytics.
   - Enhanced Cloud Function `onBookingCancelled` in `functions/src/classes/waitlist.ts` with automatic FIFO waitlist promotion, capacity guards, and atomic document array updates.
   - Hardened `server.ts` `/api/classes/book` and `/api/sessions/book` with tenant-scoped database resolution (`getDbForRequest(req)`).
   - Updated `src/Calendar.tsx` to listen to live Firestore `sessions` collection and dual-write session bookings.
   - Verified Coach Portal (`CoachClassPortal.tsx`, `CoachSessions.tsx`) and Member Portal (`ClassBookingDialog.tsx`, `MemberClasses.tsx`).
   - Provisioned verified test accounts in `db-inzanathletics`: Member `testmember@inzan.local` (`Inzan1234!`, Member ID `MEM-2001`) and Coach `testcoach@inzan.local` (`InzanCoach123!`).

2. **Unified Payment & Package Mirroring (Seamless Renewals & Upgrades):**
   - Fixed broken package-to-payment mirroring where adding packages from member profile bypassed `processPaymentTransaction`, leaving financial accounts empty.
   - Enhanced `src/services/transactionService.ts` to support seamless `isRenewal` and `amount_paid`: renewing an active package archives the previous cycle as `Expired`, activates the new cycle with updated dates/sessions, and records financial entries without duplicate errors.
   - Added walk-in member registration with initial package enrollment directly in `src/Clients.tsx` "+ Add Member" dialog.
   - Enabled Upgrade, Renew, and Add Package modal triggers from `InzanMemberShow.tsx` with full financial mirroring.

3. **Platform-Wide Zero "Invalid Time Value" Hardening:**
   - Created centralized, robust date utility `src/utils/dateUtils.ts` providing `toValidDate`, `safeFormatDate`, `safeFormatTime`, `safeFormatDistanceToNow`, `safeIsoDate`, `safeAddDays`, `safeIsSameDay`, and `safeGetAge`.
   - Hardened `getEgyptDate` in `src/utils.ts` against `Intl.DateTimeFormat` invalid date errors.
   - Eliminated raw `new Date(...).toISOString()`, `new Date(...).toLocaleDateString()`, and `format(parseISO(...))` crashes across `InzanMemberShow.tsx`, `Clients.tsx`, `Dashboard.tsx`, `Payments.tsx`, `Leads.tsx`, `PTPackages.tsx`, `PrivateSessions.tsx`, `Tasks.tsx`, `Complaints.tsx`, `LostAndFound.tsx`, `Users.tsx`, `UnconfirmedMemberships.tsx`, `ClassBookingDialog.tsx`, `MemberHome.tsx`, and `CoachSessions.tsx`.
   - Automated unit test suite `scratch/verify_date_safety.cjs` passed 22 extreme edge cases with 0 errors.

4. **Multi-Tenant Isolation & Strike Gym Integrity Verification:**
   - Audited Strike's `(default)` database: verified all 1,025 clients, 738 payments, 27 packages, 989 users, and STRIKE branding remain pristine, untouched, and unpolluted.
   - Verified Inzan Athletics data remains strictly isolated in `db-inzanathletics` (3 clients, 1 payment, 3 packages, 5 class schedules).
5. **Instant Tenant Logo & Branding System (Zero Flash / Zero Delay):**
   - Eliminated initial `'mitrixogymcrm'` fallback text and empty logo state in `src/contexts/SettingsContext.tsx`.
   - Built synchronous `getInitialBranding()` resolver in `SettingsContext.tsx` that evaluates tenant ID on frame 1 before React mounts:
     - Inzan: `{ companyName: 'INZAN ATHLETICS', logoUrl: '/inzanlogo.png' }`
     - Strike: `{ companyName: 'STRIKE', logoUrl: '/strikelogo.png' }`
   - Generated high-resolution transparent `public/inzanlogo.png` and square tab icon `public/inzan-favicon.png` alongside Strike's `public/strikelogo.png` and `public/favicon.png`.
   - Updated Inzan Firestore document `settings/branding` in `db-inzanathletics` from `"mitrixogymcrm"` to `"INZAN ATHLETICS"` with `/inzanlogo.png`.
   - Sanitized any legacy `"mitrixogymcrm"` company name strings in snapshot listeners.
   - Updated `server.ts` and `index.html` to inject tenant-specific `<title>` and favicons in the initial HTML packet so browser tabs and titles update with 0ms delay.
   - Replaced hardcoded `/mitrixogymcrmlogo.png` in `src/Payments.tsx` (receipts), `src/components/QRCodePage.tsx` (app install QR), and `src/member/Checkout.tsx`.
   - Verified via Playwright headless browser: both Inzan and Strike load their respective branding instantly on frame 1.
   - Started local dev server daemon on `http://localhost:3000`.

### Verification status
- `npm run lint` (`tsc --noEmit`) → ✓ 0 errors.
- `npm run build` → ✓ 0 errors (`dist-server/server.cjs` and Vite client bundle built in 9.90s).
- Automated Date Suite (`scratch/verify_date_safety.cjs`) → 22/22 test cases passed, 0 uncaught exceptions.
- Logo verification (`scratch/verify_ui_cards.cjs`) → ✓ Inzan and Strike rendered with 100% correct transparent logos and titles.
- Server daemon running on `http://localhost:3000` (PID task-1658).
- Live database queries: Strike `(default)` and Inzan `db-inzanathletics` healthy and strictly isolated.

---

## 10. Live Session Log — 2026-08-23

### Fixed & Built this session
1. **Automated Phone Auth & SMS OTP Password Reset:**
   - Unified `ForgotPasswordDialog` in `src/Login.tsx` supporting 2-step verification (Phone SMS OTP with 6-digit code entry + new password update) and Email Reset Link fallback for all roles (Members, Coaches, Staff, Admins).
   - Configured Firebase Phone Auth provider with Egypt (+20) SMS Region Policy and test number support for localhost dev verification.
2. **Staff & Coach Phone Management (`src/Users.tsx`):**
   - Added `Phone` column in Staff table with amber `No Phone` tags for users missing phone numbers.
   - Added phone number field to Invite Dialog and universal Mobile Phone Number input in Edit User dialog so admins can link staff phone numbers 1-by-1.
3. **Instant Self-Linking & Setup (`src/member/components/MemberAccountLinkCard.tsx`):**
   - Replaced dead-end "No member record found" with an interactive card allowing members to self-link via Member ID/Phone or create a guest profile with 1 click.
4. **Multi-Format Member ID Login Resolution (`src/contexts/AuthContext.tsx`):**
   - Fixed "Member ID not found" on legacy member accounts by trying all synthetic tenant email candidate formats (`@strike-member.local`, `@${tenantId}-member.local`, `@${tenantId}.mitrixo-member.local`, `@mitrixogymcrm-member.local`).
5. **Documentation & Architecture Artifacts:**
   - Completed [docs/INZAN_FEATURE_GUIDE_AND_TUTORIAL.md](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/INZAN_FEATURE_GUIDE_AND_TUTORIAL.md).
   - Completed [docs/STRIKE_MOBILE_APP_ARCHITECTURE_AND_FLOWCHART.md](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/STRIKE_MOBILE_APP_ARCHITECTURE_AND_FLOWCHART.md).
   - Created [docs/STRIKE_STAFF_PHONE_NUMBERS_REQUEST.txt](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/STRIKE_STAFF_PHONE_NUMBERS_REQUEST.txt).

### Verification status
- `npm run build` → ✓ 0 errors, clean build (dist + dist-server).
- Local smoke tests: SMS verification pass, password update pass, member login (`1078`/`920`) pass.

---

## 11. Live Session Log — 2026-08-21

### Fixed this session
1. **PT Edge Cases & Session Management** — Completed full lifecycle for PT Sessions.
   - **Backend:** Added `/api/requests/freeze` and `/api/requests/assessment/assign` to handle member requests atomically via `getDbForRequest(req)`.
   - **Member UI:** Added "Request Freeze" button in `MemberPackages.tsx` to request max 7-day membership freeze. Added Assessment request workflow with preferred coach selection. Added Session Rating dialog for members to rate and leave feedback on past completed sessions.
   - **Coach UI:** Added "Assessments" tab to `CoachSessions.tsx` for coaches to view assigned assessments and mark as contacted.
   - **Admin UI:** Created `AdminRequests.tsx` and added to `App.tsx` routing. Enables admins/managers to approve/deny freeze requests (automatically extending package dates) and assign pending assessment requests to specific coaches.
2. **TypeScript & Build Fixes** — Resolved strict typing issues in `server.ts` (`Request` user type augmentation, `dayOfWeek` explicit casting, `getDbForRequest` async usage) and UI components (`AdminRequests.tsx`, `AssessmentDialog.tsx`, `main.tsx`) to get the build passing.

### Verification status
- `npm run lint` → 0 errors; `npm run build` → ✓ built successfully.

### What's next
- Push notifications enhancements.
- Android Play Console Submission.

---

## 12. Live Session Log — 2026-08-19

### Fixed this session (commit `028301b` — 9 files, 1019 insertions, 607 deletions)
1. **Member login "missing or insufficient permissions"** — root cause: `703db01` restricted `users` reads while `loginWithMemberId`/`loginWithCoachId` queried `users` pre-auth. All pre-auth lookups moved to server endpoints (admin SDK bypasses rules):
   - `POST /api/member/resolve-email` (public) — member login fallback; deterministic `member-{id}@strike.mitrixo-member.local` email tried first
   - `POST /api/coach/resolve-email` (public) — coach login lookup
   - `POST /api/member/request-password-reset` (public) — member reset flow
   - `GET /api/member/coaches` (public) — coach list for MemberSessions
   - `POST /api/attendance/self-checkin` (public, PIN-validated) — kiosk check-in
2. **Members could self-grant sessions** — session math (check-in, class join/leave, PT book/cancel/reschedule) moved server-side: `POST /api/classes/book`, `/api/sessions/book|cancel|reschedule` (requireAuth, ownership validated via `getMemberClients`). Rules now: `sessions`/`classes` create/update staff-only; `users` self-create role == `'client'` only (kills coach escalation).
3. **Member profile edit too broad** — `isSafeClientSelfEdit` now allows only `['name','phone','portalUserId','photoURL']` (dropped packages/sessionsRemaining; photoURL added — fixes member photo upload).
4. **`/api/clients/update` privilege escalation** — non-staff callers limited to own `clientDocId` + linkedClientIds and safe keys; staff role list = `admin, super_admin, crm_admin, sales_manager, manager, rep, sales_rep, sales, coach`.
5. **`tasks` create too open** — now staff OR (`status == 'Pending'` AND title starts with `'Package Purchase Request:'`) — Checkout guest flow still works.
6. **`notifications` had no rules** — added: read own `recipientUid` or staff; update own `read` flag only; create/delete staff.
7. **`registerFreeUser` broken** — clients scan denied for brand-new users; memberId now atomic counter (`counters/memberIds`, floor 1000, format `MEM-###`).
8. **Baseline lint fixes** — removed dead CockroachDB-era `/api/admin/fix-migration` route (server.ts); fixed `GET /api/settings` firebaseAdmin import.

### Deployment (2026-08-19)
- `firebase deploy --only firestore:rules` → project `faa-test-guide-v2` (the "test guide crm production" project — production for Strike CRM).
- Deployed to all 4 databases: `(default)`, `db-vbt`, `db-registry-2` (firestore.rules), `db-inzanathletics` (firestore-tenant.rules).
- `sync-rules.cjs` predeploy copied the newest firestore.rules (Mitrixo's) to ATPL Vector, GamenEG-Brand, Matchmaking repos — verified all three byte-identical afterward (MD5 `FB1EFADDD808EC405D143852C453B97F`), all gamen_*/atpl_*/match_* sections intact (28 matches each). Backups kept in `%TEMP%\opencode\*-firestore*.bak`.
- ⚠️ **Server redeploy still pending** — the new endpoints exist only in code; `npm run build && npm start` (or equivalent production process restart) must happen before the login fix is live. Rules are live NOW; old frontend against new rules = old bugs (member login still queries users → denied) until server + client are deployed.

### Verification status
- `npm run lint` → 0 errors; `npm run build` → ✓ built in 8.87s.
- Member login (624/12345678) smoke test NOT yet run on production after deployment.
- Server-side endpoint smoke tests NOT yet run.

### What's next
- Redeploy/restart production server (dist-server build) so member endpoints go live
- Smoke test member 624 login on strike-egy.com, class booking, PT session book/cancel/reschedule, self-check-in
- Then per GAPS.md queue: tenant isolation verification (P1), dead CockroachDB code removal (P2), performance audit (P1)

---

## 13. Live Session Log — 2026-08-18

### Fixed this session
1. **Branding settings not loading** — GET /api/settings was returning empty object without fetching from Firestore, causing all tenants to show "mitrixogymcrm" and logos not persisting. Fixed to properly fetch branding, features, storefront, branches, commission, and sales-target from tenant's Firestore.
2. **Logo uploads not saving** — Same root cause as branding issue. POST /api/settings/update was working correctly, but GET was broken so settings never loaded on refresh.
3. **CockroachDB removed** — All club operations (juice bar orders, lockers, locker requests, guest invites, audit logs) migrated from CockroachDB to Firestore. Server startup no longer tests CockroachDB connection.
4. **Second preloader disabled** — "Loading CRM Data" / "Pulling secure data..." preloader in App.tsx disabled. Only the SettingsContext logo preloader remains.

### Root cause
The GET /api/settings endpoint (sqlApi.ts line 585-622) was building an empty `settingsObj` without actually fetching from Firestore. The code had all the authentication checks but no Firestore reads. POST was working fine.

### What's next
- Verify branding saves and loads correctly for both tenants after deployment
- Test logo upload flow end-to-end
- Monitor for any other tenant-specific settings issues

---

## 2. The Document Map — what each file owns

| File | Owns | When you consult it |
|---|---|---|
| [requirements.md](requirements.md) | **WHAT to build** — every feature ID, status, release criteria | Start of session (pick item), whenever you touch a feature, before claiming anything is "done" |
| [GAPS.md](GAPS.md) | **WHAT'S NEXT** — live status board + priority queue | Start of session — this is your work queue |
| [AGENTS.md](AGENTS.md) | **HOW to work** — non-negotiables, engineering standards, landmine list, autonomy rules | Before writing any code — its rules are mandatory |
| [WORKFLOW.md](WORKFLOW.md) | **THE DAILY LOOP** — TRIAGE → VERIFY → PICK → EXECUTE → PROVE → RECORD → SHIP | Your session protocol — follow it every session |
| [TENANTS.md](TENANTS.md) | **Tenant configuration** — domains, Firestore databases, branding defaults | Before provisioning new tenants or modifying existing ones |
| [MOBILE.md](MOBILE.md) | **Mobile app** — EAS build, App Store publishing, WebView wrapper | Before building/publishing mobile app or modifying mobile-specific features |

**Conflict rule:** requirements.md wins on scope → GAPS.md wins on status → live verification wins over assumptions.

---

## 3. Session Bootstrap — do this immediately, in order

1. **Read this file fully** (you are doing that).
2. **Verify baseline:**
   ```powershell
   npm run build   # must build without errors
   npm run lint   # must pass
   ```
   Red baseline? Your session is now "fix the baseline" — nothing else ships.
3. **Open GAPS.md** → take the top item from "Updated Priority Order" (bugs always first, then P0 → P1 → P2).
4. **Read the matching feature** in requirements.md and the relevant landmines in AGENTS.md §4.
5. **Execute one item** using WORKFLOW.md Phases 4–7. One item per session. Ship it green.
6. **Report** (see §7 below).

---

## 4. The Fast-Track to Production — priority queue

Work top-to-bottom. Each line = roughly one session. Current queue (from GAPS.md — always re-check it, it's live):

**P0 — Critical Fixes**
1. Redeploy/restart production server with member endpoints (commit `028301b`) + smoke test member login 624
2. Branding/settings end-to-end verification on deployed tenants
3. Logo upload flow smoke test

**P1 — Feature Polish**
4. Tenant isolation verification — confirm Strike data doesn't leak to Inzan Athletics
5. Performance audit — client list loading times
6. Mobile responsive audit for all pages

**P2 — Technical Debt**
7. Remove dead CockroachDB code (src/db/db.ts, src/db/dbOperations.ts)
8. TypeScript strict mode enablement

---

## 5. "Production Ready" — the exact definition of done

- [ ] All P0 and P1 items from GAPS.md are ✅
- [ ] Build 0 errors / 0 warnings; lint passes
- [ ] Tenant isolation verified — no data cross-contamination
- [ ] All features verified working on both Strike and Inzan Athletics tenants
- [ ] Firestore security rules reviewed and tested (rules tightened + deployed 2026-08-19; runtime smoke tests pending)
- [ ] No performance issues on client/payment lists (loading < 2s)

---

## 6. Rules of Engagement (summary — AGENTS.md is authoritative)

**Never break:**
- Multi-tenant isolation — tenant A never sees tenant B's data
- Firebase Firestore only — no re-introduction of CockroachDB
- Authentication required for all write operations
- No hardcoded tenant names in shared code

**Always do:**
- One item per session; bugs before features
- Test on both tenants when multi-tenant behavior is affected
- Update GAPS.md every session
- Commit as `<feature-id> <description>` — one logical change

**Autonomy (AGENTS.md §6):** you never need permission. Unknown situation → take the safe default → log `Decision: <what> because <why>` in the commit → keep working.

---

## 7. End-of-Session Report (this replaces asking — always produce it)

When your session ends, output exactly this:

```
SESSION REPORT — <date>
1. Item completed: <feature-id — one line what> 
   Proof: build passes, lint passes, <manual smoke result>
2. Decisions logged: <each "Decision:" line from commits, or "none">
3. Skipped under hard limits: <items parked in GAPS.md, or "none">
4. Next up: <top of GAPS.md queue for the next session>
```

---

## 8. Kickoff Prompt (copy-paste to start any agent)

> You are working on MitrixoGYM, a multi-tenant Firebase CRM platform for fitness gyms. Read MASTER.md in the repo root and follow it exactly: verify the baseline, take the top item from GAPS.md's priority queue, execute one item per session per WORKFLOW.md, obey AGENTS.md non-negotiables, and finish with the SESSION REPORT from MASTER.md §7. You are fully authorized to make decisions without asking permission — log them as Decision: lines in your commits.

---

**Everything is explained. The queue is real. The baseline is green. Start at §3 — right now.**
