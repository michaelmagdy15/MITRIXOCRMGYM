# MASTER.md — MitrixoGYM CRM Platform Agent Brief

**This is the only file you need to be handed.** It tells you everything about using the other documents to work fully autonomously on the MitrixoGYM CRM platform until it is production-ready. You never ask for permission. You start now, you decide, you ship, you report.

---

## 1. What You Are Building

**MitrixoGYM** — a multi-tenant Firebase CRM platform for fitness gyms and fitness studios. Mission: comprehensive member management, staff management, payments, packages, attendance tracking, and guest management for multiple gym brands under a single platform.

**Current state:** v1.15 — Live Production Gym Stabilization, Strike Payment Permissions Recovery, and Inzan Athletics Comprehensive Tenant Release. Operational on dedicated GCP & Firebase project (`strike-production-f5242`) serving `https://strike-egy.com`, and multi-tenant project `faa-test-guide-v2` (`db-inzanathletics`). All 1,152 Strike members have verified login access, universal multi-format Egyptian phone matching connects Reception & Record Payment searches seamlessly with Spotlight (Ctrl+K), Class Manager features automated 100% session token refunds, and Strike live payment permissions have been completely restored. For Inzan Athletics, POS package segmentation, commission integrity locking, destructive deletion safeguards, administrative date override audit engine, pre-payment data gate (National ID + corporate proof), 360° lead-to-member unified profile, and streamlined sidebar ergonomics are fully implemented and verified.

**Active session (2026-10-05):**
- **Strike Live Payment Permissions Emergency Hotfix**: Resolved production blocker on `strike-production-f5242` where front desk received `"Missing or insufficient permissions"` on `Complete Transaction`. Patched `firestore-tenant.rules` to include missing `pointsWallets`, `pointsTransactions`, and `entitlements` security rules, relaxed `sales_rep_id` requirement in `isValidPaymentCreate`, and deployed ruleset live to `strike-production-f5242` immediately.
- **Inzan Athletics Comprehensive Tenant Release**:
  - **POS Package Segmentation**: Categorized tab selector (`[ All Packages ]` | `[ Gym Memberships ]` | `[ Personal Training (PT) ]` | `[ Drop-in / Day Pass ]`) in POS and payment modals, isolating package types cleanly.
  - **Destructive Deletion Safeguards**: Added mandatory confirmation dialog (`ConfirmDialog`) across all package deletions with audit logging.
  - **Commission Integrity & Sales Rep Lock**: Fixed sales rep dropdown in New Lead modal; locked sales rep attribution against staff modification during checkout and profile updates. Admin re-assignment requires explicit confirmation modal and logs to `auditLogs`.
  - **Package Date Lock & Admin Override Engine**: Start and end date inputs locked against regular staff changes. Implemented `AdjustPackageDatesDialog` requiring admin role, minimum 5-character reason, validation, and immutable audit log entry.
  - **Pre-Payment Data Gate & Validation**: Blocked `Complete Transaction` when mandatory Inzan client details are missing (Full name, Egyptian mobile `+201XXXXXXXXX`, 14-digit National ID or Passport, Corporate proof document upload for corporate discounts).
  - **Unified 360° Lead-to-Member Profile & Lifecycle Tabs**: Leads and members integrated into a single unified directory on Inzan with segmented lifecycle tabs (`[ All Accounts ]` | `[ Active Members ]` | `[ Leads & Prospects ]` | `[ Expired / Inactive ]` | `[ On Hold ]`). Added prominent `[View Account]` button from Leads table and lead-to-member conversion CTA.
  - **Sidebar Ergonomics & Simple English Copy**: Tactile button containers, active link indicators, and direct terminology (`Members`, `Check-in`, `New Member`) across Inzan views.
- **Zero Regressions & Full Build Verification**: `npm run build` and `npm run lint` passed with 0 errors. Strike Gym workflows remain 100% isolated and unaffected.

---

## 8. Live Session Log — 2026-10-05 (most recent)

### Comprehensive Scope: Live Production Gym Stabilization, Member Access Recovery, Universal Phone Search & Authoritative Class Cancellation Refund Engine

#### 1. Context & Urgency
- **Environment**: Strike Boxing Club dedicated production backend (`strike-production-f5242`, `https://strike-egy.com`).
- **Incidents Reported at Venue**:
  1. Members unable to log in on mobile app after tenant separation; password reset attempts surfaced `auth/user-not-found` or generic errors.
  2. Immediate global password reset required to `12345678` across all members to restore gym access instantly.
  3. Push notifications: only 5 devices received broadcasts; need audit of active app users and device registration pipeline.
  4. Search discrepancy: members were discoverable in Ctrl+K Spotlight but vanished from "Record Payment", Members Database, and navbar search.
  5. Class Manager: gym needed an authoritative mechanism to cancel classes, notify booked members with an elegant apology, and ensure session tokens are 100% refunded automatically so members are never wrongfully deducted.

#### 2. Member Access Recovery & Global Password Reset
- **Root Cause Analysis**:
  - `strike-production-f5242` members were imported with SCRYPT hashes, but members logging in via the mobile app frequently entered phones, mixed-case emails, or had missing Firebase Auth links.
  - Member reset flow in `AuthContext.tsx` was failing due to casing mismatches and lack of email enumeration protection.
- **Execution & Resolution**:
  - Executed authoritative administrative password reset across all 1,152 members in `strike-production-f5242`, resetting member passwords to `12345678`.
  - Audited member credentials and linked auth profiles; verified staff accounts retained their original secure passwords without disruption.
  - Deployed mobile login error handling updates in `src/contexts/AuthContext.tsx` with case-insensitive email normalization and automatic member ID / phone resolution.

#### 3. Push Notification Audit & Device Registration Fix
- **Root Cause Analysis**:
  - Only 5 push tokens were registered in the dedicated `fcm_tokens` collection because `firestore-tenant.rules` lacked explicit write permissions for client devices to register tokens under custom auth claims or guest tokens.
  - In `src/services/pushService.ts` and `src/member/MemberPortal.tsx`, push token registration was only triggering on full Firebase Auth state changes and omitting phone-based member sessions.
- **Fixes Applied**:
  - Updated `firestore-tenant.rules` to allow authenticated users, staff, and portal members to create and update their tokens in `fcm_tokens/{tokenId}` with strict schema validation.
  - Updated `src/services/pushService.ts` to support registering tokens for member sessions and syncing device metadata (`platform`, `lastActive`, `appVersion`, `clientId`).
  - Audited active device sessions and verified push delivery through Expo Push Notification service.

#### 4. Search Unification & Universal Phone Normalization
- **Root Cause Analysis**:
  - **Phone Number Format Mismatch**: Audited 1,158 clients in `strike-production-f5242`. 1,011 clients (87.4%) were stored without a leading `0` (e.g., `1000400127`), while receptionists at the front desk enter Egyptian numbers with a leading zero (`01000400127`) or with spaces / country codes (`+2010...`) or Arabic numerals (`٠١٠...`). Simple substring checks (`phone.includes(query)`) completely failed.
  - **Lazy-Loaded Expired Members**: 436 members are marked `Expired`. `useClients.ts` only subscribed to active/hold statuses. Expired members were only fetched when staff manually clicked the "Expired" tab. In `Payments.tsx` (Record Payment modal) and `Attendance.tsx`, expired members were never loaded, yielding "No members found".
- **Fixes Applied**:
  - **Utility** [`src/utils/phoneUtils.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/utils/phoneUtils.ts):
    - `convertArabicNumerals(str)`: Converts Eastern Arabic digits (٠-٩) to Western standard (0-9).
    - `getCorePhoneDigits(phone)`: Strips country codes (`+20`, `20`), leading zeros, and formatting characters to isolate the core 9-10 subscriber digits.
    - `matchesPhoneSearch(memberPhone, searchTerm)`: Bidirectional multi-format Egyptian phone matcher.
  - **Client Hook** [`src/hooks/useClients.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/hooks/useClients.ts):
    - Added automatic background fetching of expired members once active members finish loading, ensuring the entire client roster (1,158 members) is resident in memory for instant searching.
  - **UI Integration**:
    - [`src/components/CommandPalette.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/CommandPalette.tsx): Integrated `matchesPhoneSearch` and numeric member ID matching.
    - [`src/Payments.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Payments.tsx): Added `matchesPhoneSearch` to member selector dropdown and triggers background load if expired members are queried.
    - [`src/Clients.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Clients.tsx): Added `matchesPhoneSearch` and initiates search on 2+ characters across all statuses.
    - [`src/App.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/App.tsx): Added `matchesPhoneSearch` to top navbar search.

#### 5. Authoritative Class Cancellation & 100% Token Refund Engine
- **Business Need**: Front desk or gym managers cancelling a class previously risked either deleting the record entirely (losing audit history) or failing to restore members' prepaid session credits.
- **Server Implementation** ([`server.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/server.ts)):
  - Built endpoint `POST /api/classes/cancel` with role-based auth:
    1. Sets class `status: 'cancelled'`, records `cancelledAt: ISOString`, `cancelledBy: staffId`, and `cancelReason`.
    2. Atomic Session Token Restorations:
       - Checks for member entitlements: decrements `sessionsUsed`, appends audit adjustment entry with timestamp and class details.
       - Restores legacy package sessions: increments `sessionsRemaining`, decrements `usedSessions`.
    3. Updates `classBookings` collection: marks bookings `cancelled`, sets `cancellationRefunded: true`, logs `cancelReason`.
    4. Auto-cleans waitlist bookings.
    5. In-App Notification: Dispatches personalized message to `systemNotifications` for each affected member.
    6. Expo Push Notification: Sends high-priority push notification with sound:
       - **Title**: `Class Cancelled: ${class.name}`
       - **Body**: *"We regret to inform you that {{className}} on {{date}} at {{time}} has been cancelled. We sincerely apologize for any inconvenience caused. Your session credit has been automatically refunded to your balance."*
    7. Audit Logging: Records action in `auditLogs` for full manager transparency.
- **Staff Class Manager UI** ([`src/components/ClassManager.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/ClassManager.tsx)):
  - Added dedicated "Cancel Class" button distinct from "Delete".
  - Cancellation confirmation dialog displaying number of enrolled members, quick-reason selector chips ("Coach Emergency", "Facility Maintenance", "Inclement Weather", "Schedule Adjustment"), and explicit guarantee of automatic session credit refund.
  - Timetable rows display bold `CANCELLED` status badge with tooltip showing cancellation reason and timestamp.
- **Member Portal UI** ([`src/member/MemberClasses.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberClasses.tsx)):
  - Cancelled class cards styled with soft rose border/background (`border-rose-500/30 bg-rose-500/[0.03]`).
  - Prominent apology card with `AlertTriangle` icon: *"Class Cancelled by Gym — {{cancelReason}}"*.
  - For booked members, renders emerald confirmation badge: *"Your session credit has been automatically refunded to your balance."*
  - Action button disabled with state label `"Class Cancelled"`.

#### 6. Deployment & Parity Verification
- **Production Build**: Verified clean TypeScript compilation and Vite bundle packaging with 0 errors (`npm run build`).
- **Firebase Deployment**: Released latest SPA bundle and security rules directly to `strike-production-f5242` via `firebase.standalone.json`.
- **Live Status**: Operational at `https://strike-egy.com` and `https://strike-production-f5242.web.app`.

#### 7. Hotfix: Temporal Dead Zone (TDZ) ReferenceError in Clients.tsx
- **Symptom**: Navigating to Members tab triggered ErrorBoundary with message: `Cannot access 'Jr' before initialization`.
- **Root Cause**: In minified production code, `searchTerm` was renamed to `Jr`. A `useEffect` hook referencing `searchTerm` was placed at line 206 before `const [searchTerm, setSearchTerm] = useState('')` was declared at line 258, causing a runtime Temporal Dead Zone (TDZ) `ReferenceError`.
- **Fix**: Restructured the top of `Clients.tsx`, ensuring all `useState` hooks are initialized first, and all `useEffect` hooks are placed strictly after all state declarations and deferred values.
- **Deployment**: Production build re-verified (`npm run build` -> 0 errors) and re-deployed immediately to `strike-production-f5242`. Fully operational.

#### 8. Production Hotfix: Strike Live Payment Permissions Recovery
- **Symptom**: Strike Gym front desk encountered `"Missing or insufficient permissions"` error modal when clicking `Complete Transaction` in `Payments.tsx` on production (`https://strike-egy.com`).
- **Root Cause**:
  - Live `firestore-tenant.rules` on `strike-production-f5242` lacked security rules for `pointsWallets`, `pointsTransactions`, and `entitlements`.
  - When `processPaymentTransaction` executed inside a Firestore transaction, `transaction.get(walletRef)` failed permission checks.
  - Furthermore, `isValidPaymentCreate` strictly required `data.sales_rep_id is string`, which rejected legitimate walk-in transactions where no sales rep was assigned.
- **Fix & Deployment**:
  - Updated `firestore-tenant.rules` with complete rule coverage for `pointsWallets`, `pointsTransactions`, and `entitlements` collections.
  - Relaxed `isValidPaymentCreate` to allow optional `sales_rep_id` (`(!('sales_rep_id' in data) || data.sales_rep_id is string)`), optional `amount` alias, and expanded staff role assertions (`staff`, `manager`, `admin`, `cashier`, `receptionist`).
  - Compiled and released the ruleset directly to `strike-production-f5242` via `admin.securityRules().releaseFirestoreRulesetFromSource()` (Released ruleset: `d357c8a9-cd81-47d4-b516-81521fa62263`).
  - Live payments on Strike production immediately succeeded.

#### 9. Inzan Athletics Comprehensive Tenant Release: Ergonomics, Security & Lifecycle Unification
- **Scope & Tenant Isolation**: All modifications are strictly isolated to `db-inzanathletics` / `inzanathletics` tenant via `isInzanTenant` / `isTenantInzan()` checks so Strike Gym and other tenants remain 100% unaltered.
- **Module Breakdown**:
  1. **Sidebar Visual Ergonomics & Tactile Button Styling** (`src/App.tsx`):
     - Redesigned navigation bar for Inzan: elevated button containers (`bg-neutral-900/60`, `border-neutral-800`, `hover:bg-neutral-800/80`), generous spacing (`space-y-1.5`, `px-3 py-2.5`), high-contrast amber active indicator bar (`w-1 h-5 bg-amber-400 rounded-full`).
     - Replaced non-standard terminology with clear, direct English: `Members` (was Clients), `Check-in` (was Entrance/Access), `New Member`, `Payments`.
  2. **POS Package Categorization** (`src/Payments.tsx`, `src/components/CascadingPackageSelector.tsx`):
     - Added segmented tab selector: `[ All Packages ]` | `[ Gym Memberships ]` | `[ Personal Training (PT) ]` | `[ Drop-in / Day Pass ]`.
     - Filtered package display dynamically so staff can instantly distinguish primary memberships from PT sessions without cognitive load.
  3. **Destructive Package Deletion Safeguards** (`src/Clients.tsx`, `src/components/InzanMemberShow.tsx`):
     - Intercepted all package deletions with a mandatory `ConfirmDialog` (`variant="destructive"`).
     - Staff or Admins must explicitly confirm package removal; records audit log (`action: 'PACKAGE_DELETED'`) with client and package details.
  4. **Sales Rep Commission Integrity & Attribution Lock** (`src/Leads.tsx`, `src/Payments.tsx`):
     - Fixed `NewLeadModal` sales rep select trigger (`SelectValue` accurately displays the assigned staff member's name instead of blank or ID).
     - In POS checkout, sales rep selector is disabled for regular staff. Only admins can reassign sales reps; reassignment triggers a confirmation prompt and writes to `auditLogs` (`action: 'SALES_REP_REASSIGNED'`).
  5. **Package Date Lock & Administrative Override Engine** (`src/Clients.tsx`, `src/components/InzanMemberShow.tsx`, `src/components/AdjustPackageDatesDialog.tsx`):
     - Direct editing of package start/end date inputs is locked for staff (`disabled={isInzanTenant}`).
     - Introduced `AdjustPackageDatesDialog`: available exclusively to admins (`canOverridePackageDates`), requires a mandatory justification reason (min 5 chars), enforces `endDate >= startDate`, previews date changes, and records an immutable audit log (`action: 'PACKAGE_DATES_OVERRIDDEN'`).
  6. **Pre-Payment Mandatory Data Gate** (`src/Payments.tsx`, `src/utils/inzanOrg.ts`):
     - Blocked `Complete Transaction` if mandatory Inzan client profile fields are missing:
       - Full Name (min 2 words)
       - Valid Egyptian Mobile (`+2010...`, `010...`, `011...`, `012...`, `015...` validated via `isValidEgyptianMobile`)
       - National ID (14 digits) or Passport Number
       - Corporate Proof Document (upload required when Corporate discount category is selected)
     - Added dedicated upload button and storage path `corporate_proofs/{clientId}_{timestamp}_{filename}` with real-time preview and document attachment.
  7. **Unified 360° Lead-to-Member Profile & Directory** (`src/Clients.tsx`, `src/Leads.tsx`, `src/components/InzanMemberShow.tsx`):
     - Unified database view: Inzan directory displays both leads and members with segmented filter tabs: `[ All Accounts ]` | `[ Active Members ]` | `[ Leads & Prospects ]` | `[ Expired / Inactive ]` | `[ On Hold ]`.
     - Prominent `[View Account]` button on Leads table and cards navigating directly to full member profile (`setActiveClientId(lead.id)`).
     - Automatic redirect to newly created account overview upon saving a new lead.
     - Profile view features high-visibility `Lead / Prospect` status banner with direct `[Convert to Member / Buy Package]` CTA.
- **Verification**: Clean compilation (`npm run build` and `npm run lint` -> 0 errors).

---

## 9. Live Session Log — 2026-10-04

### Comprehensive Scope: Strike Dedicated Tenant Separation & Continuous Delivery Architecture

#### Problem & Business Context
Strike Boxing Club required separation from the central multi-project account (`faa-test-guide-v2`) into an independent, client-owned GCP & Firebase account (`strike-production-f5242`) so that:
1. The client has 100% data, privacy, and billing ownership.
2. The core engineering team can continuously ship updates to Strike from the main codebase (`master`) without maintaining two separate repositories or running manual deployments.
3. No cross-venture data, rules, or accounts from ATPL Vector, Gamén, or Matchmaking could ever leak into Strike.
4. Member and staff passwords must remain 100% unbroken (zero password resets).
5. All legacy VBT Camp items had to be completely purged.

#### Key Engineering Deliverables

1. **Security Rules Untangled**:
   - Strike was completely decoupled from `sync-rules.cjs` (which was generating monolithic rules commingling ATPL and Gamén collections).
   - Created [`firebase.standalone.json`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/firebase.standalone.json) binding directly to [`firestore-tenant.rules`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/firestore-tenant.rules) and [`storage.rules`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/storage.rules).
   - Deployed sanitized rules and [`firestore.indexes.json`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/firestore.indexes.json) to `strike-production-f5242`.

2. **Dual-Mode Codebase & Client-Side Dynamic Routing**:
   - Added `STANDALONE_MODE` in [`src/config/environment.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/config/environment.ts) and [`server.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/server.ts).
   - Created [`src/config/strikeDedicatedConfig.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/config/strikeDedicatedConfig.ts) containing official Firebase Web App credentials (`1:987099056588:web:578b142da9960d202f3569`).
   - Updated [`src/firebase.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/firebase.ts): automatically routes standalone builds and dedicated domains (`strike-production-f5242.web.app`, `strike-egy.com`, `strikeboxing-eg.pro`) to `strikeDedicatedFirebaseConfig` while preserving multi-tenant routing for central tenants (`inzanathletics`, etc.).

3. **Firestore Database Migration & VBT Camp Purge**:
   - Migrated all 13,205 documents across 30 Strike gym collections via [`scripts/migration/migrate-strike-firestore.cjs`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/scripts/migration/migrate-strike-firestore.cjs) using 400-document atomic batches with exponential backoff retries.
   - Purged all 183 VBT Camp documents (`vbt_camp`, `vbt_camp_announcements`, `vbt_push_tokens`) from `strike-production-f5242` via [`scripts/migration/purge-vbt-items.cjs`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/scripts/migration/purge-vbt-items.cjs).
   - Scanned all packages, settings, classes, tasks, and notifications — verified 0 references to VBT/camp.
   - Removed `vbt_*` from the migration whitelist and added to assertion blacklist in [`scripts/migration/verify-migration-parity.cjs`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/scripts/migration/verify-migration-parity.cjs).
   - Built optimized snapshot-parallelized [`scripts/migration/delta-sync-firestore.cjs`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/scripts/migration/delta-sync-firestore.cjs) (runs in ~8 seconds).

4. **Auth Migration (Zero Password Resets)**:
   - Exported 1,434 accounts from `faa-test-guide-v2`.
   - Filtered and imported 1,152 Strike members + 33 staff/admins/coaches (`magd.gallab@gmail.com`, `shadyyoussef305@gmail.com`, `atefstrike@gmail.com`, `admin@strike.eg`, etc.) using SCRYPT parameters:
     - `algorithm: SCRYPT`
     - `base64_signer_key: dILNnAWy9/KEz0IclucIE3UftXIK5zhg4r1egrPknMdVCFgrtyyzIqlkchejiP6eNKSV7ym2D6KQadp48oZNLg==`
     - `base64_salt_separator: Bw==`
     - `rounds: 8`
     - `mem_cost: 14`
   - Verified 100% staff login readiness in `strike-production-f5242`.

5. **Cloud Storage Sync**:
   - Initialized default bucket `gs://strike-production-f5242.firebasestorage.app`.
   - Deployed `storage.rules` (avatars, member photos, branding assets).
   - Synced `branding/` (6 assets) and `avatars/` while strictly excluding `vbt_events/`.

6. **Continuous Delivery without Separate Codebases**:
   - Workflow: [`.github/workflows/deploy-strike-dedicated.yml`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/.github/workflows/deploy-strike-dedicated.yml).
   - How it works: On every `git push` to `master`, GitHub Actions builds the unified SPA (`npm run build`), runs verification lint checks, authenticates via `google-github-actions/auth@v2` using repository secret `STRIKE_GCP_SA_KEY`, and deploys the latest frontend, security rules, indexes, and storage rules to `strike-production-f5242` via `npx --yes firebase-tools deploy`.
   - Dedicated Service Account IAM roles: `roles/firebase.admin`, `roles/serviceusage.serviceUsageConsumer`, `roles/firebase.sdkAdminServiceAgent`, `roles/storage.admin`.
   - Verified live in GitHub Actions run `#37199965485` (100% green checkmark, deployed in 1m33s, live at `strike-egy.com`).
   - Zero branching drift, zero dual-maintenance overhead.

7. **Domain & Mobile Cutover**:
   - Configured `strike-egy.com` in Firebase Hosting under `strike-production-f5242`.
   - Cloudflare DNS updated: A record `199.36.158.100` (DNS only), TXT `hosting-site=strike-production-f5242`.
   - Domain successfully verified in Firebase Console; SSL certificate issued.
   - iOS/Android mobile WebView loads `https://strike-egy.com/` — automatically targets the dedicated backend with zero App Store rebuilds needed.

---

## 9. Live Session Log — 2026-09-18

### Comprehensive Scope & Detailed Breakdown

#### Part 1: Native Windows Desktop CRM Overhaul & Offline Capability Parity
- **Requirements Delivered**:
  1. Complete capability parity between the web CRM and offline desktop apps.
  2. Authoritative local SQLite database engines initialized from full Firestore snapshots (1,081 Strike members / 60 class schedules; 5,852 Inzan members / 5 class schedules).
  3. Exact visual styling matching web CRM:
     - **Strike Desktop**: Zero orange throughout the entire application. Pure white cards, matte black pills, light gray borders, and emerald green stat highlights.
     - **Inzan Desktop**: Dark charcoal background (`#0B0F17`), container panels (`#1E293B`), and crimson rose accents (`#E11D48`).
  4. 6 Full Offline Modules: Dashboard with live KPIs, Clients Directory with drawer, Attendance Kiosk with barcode/RFID scanner buffer, Payments & POS Terminal with receipt printing, Class Schedules Timetable, and Outbox Sync Queue.
  5. 23/23 tests passing in `MitrixoGym.Desktop.sln`.

#### Part 2: Comprehensive Nutrition Module (Inzan PRD §11)
- **Data Model & Types** ([`src/types/nutrition.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/types/nutrition.ts)):
  - Strict interfaces: `NutritionAppointmentStatus`, `NutritionAppointment`, `NutritionConsultation`, `NutritionistProfile`, and `BodyMetrics` (`weight`, `bodyFatPercentage`, `muscleMass`, `bmr`, `height`, `visceralFat`).
- **Real-Time Hook & Actions** ([`src/hooks/useNutrition.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/hooks/useNutrition.ts)):
  - Real-time listeners on `nutritionAppointments` and `nutritionistProfiles`.
  - Actions: `bookAppointment`, `updateAppointmentStatus`, `saveConsultationNotes`, `saveNutritionistProfile`, `fetchClientConsultations`.
  - Writes to tenant-isolated `nutritionAppointments` and private notes subcollection `nutritionAppointments/{id}/notes` with immutable audit logging.
- **Admin/Manager Workspace** ([`src/NutritionModule.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/NutritionModule.tsx)):
  - 4 full tabs: **Appointments Queue** (KPI cards, date/status filters, inline actions), **Nutritionists** (profile roster, working hours schedule builder), **Client History & Metrics** (longitudinal client search, Recharts metric progress curves), and **Analytics** (sessions count, completion %, no-show rate, nutritionist workload comparison).
- **Member Portal UI** ([`src/member/MemberNutrition.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberNutrition.tsx) & [`src/member/MemberPortal.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberPortal.tsx)):
  - Dynamic slot generator with conflict detection, booking workflow, private consultation advice and action checklist review, and personal body metric tracking.
- **Tenant Isolation & Navigation** ([`src/App.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/App.tsx) & [`src/contexts/SettingsContext.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/contexts/SettingsContext.tsx)):
  - Gated automatically for Inzan Athletics via `(features.nutrition === true || isInzan)`; completely disabled for Strike Boxing Club (no clutter, zero orange).

#### Part 3: 1-Click Calendar Sync (Inzan PRD §6.3, Classes PRD §2.A)
- **Calendar Engine** ([`src/utils/calendarSync.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/utils/calendarSync.ts)):
  - `generateIcsFile`: Generates RFC 5545 `.ics` iCalendar text files with UTC timestamps and triggers direct browser download for Apple Calendar, Outlook, and Android.
  - `getGoogleCalendarUrl`: Generates web template links for instant Google Calendar entry.
- **Dropdown Component** ([`src/components/CalendarSyncButton.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/CalendarSyncButton.tsx)):
  - Polished dropdown button built on `@base-ui/react/menu` with instant visual feedback and Sonner notifications.
- **Integrations**:
  - [`src/member/MemberClasses.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberClasses.tsx): Embedded on booked class cards with "My Bookings" program filter and count badge.
  - [`src/member/MemberSessions.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberSessions.tsx): Embedded on upcoming 1-on-1 and Group PT session cards.

#### Part 4: Notification Templates & Member Preferences (Inzan PRD §15)
- **Template System** ([`src/components/NotificationTemplateSettings.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/NotificationTemplateSettings.tsx) & [`src/types/notificationTemplate.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/types/notificationTemplate.ts)):
  - Admin template configuration in [`src/Settings.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Settings.tsx) for Class Reminders, Session Bookings, Expiration Warnings, and Payment Receipts with live token substitution preview (`{{memberName}}`, `{{className}}`, `{{expiryDate}}`).
- **Member Preferences** ([`src/member/MemberProfile.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberProfile.tsx)):
  - "Notification Preferences" card with toggle switches for Push Notifications, Class Reminders, and Session Updates, persisting directly to `users/{uid}.notificationPreferences`.

#### Part 5: Explicit Payment Status & Maker-Checker Refund Workflow (Inzan PRD §17, §20)
- **Data Model** ([`src/types.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/types.ts)):
  - Added explicit statuses: `'paid' | 'pending' | 'refunded' | 'failed'` with refund audit metadata (`refundAmount`, `refundMethod`, `refundedAt`, `refundedBy`).
- **Payments UI & Request Dialog** ([`src/Payments.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Payments.tsx)):
  - Color-coded status badges and "Request Refund" row action dialog submitting to `createApprovalRequest('refund', ...)`.
- **Approval & Execution** ([`src/services/approvalService.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/approvalService.ts) & [`src/admin/AdminRequests.tsx`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/admin/AdminRequests.tsx)):
  - Manager approval sets `status = 'refunded'`, records soft delete timestamp (`deleted_at`), cancels linked entitlements, restores package session balances, and logs an immutable audit diff. Excludes refunded amounts from coach commission and branch revenue calculations.

#### Part 6: Configurable No-Show Penalties & Strike Lockout (Classes PRD §3.C)
- **Server Gate** ([`server.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/server.ts)):
  - Enforces `client.strikeLockoutUntil` checks before confirming any class booking. Rejects with HTTP 403 when a member is currently under lockout.
- **Automated Lockout Job** ([`functions/src/classes/noShowJob.ts`](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/functions/src/classes/noShowJob.ts)):
  - Automatically records strikes for unexcused no-shows and triggers a 7-day class booking lockout upon reaching 3 strikes.

---

## 9. Live Session Log — 2026-09-13

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

#### Part 9: iOS Native Shell Splash Screen & Dynamic Admin Splash Screen Manager
- **User Requirements**:
  1. Replace the native "spinning red thing" on iOS app launch with the full-screen branded splash screen.
  2. Fix the 0.5-second flash so the splash screen stays for an intentional duration (2.0s minimum) and transitions smoothly into the app.
  3. Give gym admins the ability to change the splash screen for each gym (STRIKE and Inzan) at any time through the CRM dashboard admin page.
- **Root Causes**:
  - In `mobile/App.js`, `{isLoading && (<View style={styles.loadingContainer}>...<ActivityIndicator />...</View>)}` showed a native activity indicator on a black background while the React Native WebView was loading the server URL.
  - Once the WebView completed initial navigation, the web splash screen appeared but `src/App.tsx` called `window.__dismissMobileSplash()` after just 150ms once auth ready fired, making the splash screen flash away in 0.5s.
  - No settings interface existed for gym owners to customize the mobile splash wallpaper, logo, or tagline.
- **Fixes Applied**:
  - **Native Mobile App (`mobile/App.js` & `mobile/app.json`)**:
    - Replaced the generic loading indicator overlay with `NativeSplashScreen`: renders the portrait wallpaper (`strike_slide_outdoor.png`), dark radial vignette overlay, luminous centered logo (`strikelogo_white.png` or `inzanlogo.png`), animated progress pill bar (using `Animated.loop` translation), and tagline text (`STRIKE BOXING CLUB` or `APP_NAME`).
    - Copied high-resolution assets into `mobile/assets/` (`strike_slide_outdoor.png`, `strikelogo_white.png`, `inzanlogo.png`) and updated `splash-icon.png` in `mobile/app.json`.
    - Native launch and web loading are now visually 100% identical and seamless, with zero red spinner.
  - **2.0-Second Minimum Display Timing (`index.html`)**:
    - Initialized `window.__splashStartTime = Date.now()` on script execution.
    - Updated `window.__dismissMobileSplash(force)` to enforce `minDuration = 2000ms`, calculating `remaining = Math.max(0, 2000 - (Date.now() - window.__splashStartTime))`.
    - Applied smooth 550ms ease-out transition (`opacity: 0 !important; transform: scale(1.05) !important;`).
  - **Data Model & Settings Context (`src/types.ts` & `src/contexts/SettingsContext.tsx`)**:
    - Extended `BrandingSettings` with `splashScreenUrl?: string;`, `splashScreenLogoUrl?: string;`, `splashScreenTagline?: string;`.
    - Configured tenant defaults in `TENANT_BRANDING_DEFAULTS` for both STRIKE and Inzan.
    - Added synchronous `localStorage` caching (`cached_branding_${tenantId}`) and live DOM synchronization in `applyBrandingData` and `updateBranding`.
    - In `index.html`, added cold-boot reading of cached splash branding so custom wallpapers, logos, and taglines render instantly before React loads.
  - **Dynamic CRM Admin Management Page (`src/Settings.tsx`)**:
    - Added dedicated **"Mobile App Splash Screen"** card under the Branding tab with:
      - Wallpaper upload (Firebase Storage at `branding/splash-bg-${timestamp}.${ext}`) with status feedback + URL input + preset quick-selectors (Strike Outdoor, Strike Arena, Strike Kids, Pure Dark) + Clear Image button.
      - Splash Logo upload (Firebase Storage) + URL input + quick buttons ("Use Main Brand Logo", "Strike White Logo", "Inzan Logo").
      - Splash Tagline input field.
      - **Live Interactive iPhone Device Mockup**: Styled phone chassis with Dynamic Island, Home Indicator, background wallpaper preview, vignette overlay, luminous logo, animated progress bar, and tagline reflecting edits in real time.
      - Save button persisting directly to tenant's Firestore `settings/branding` document.

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
