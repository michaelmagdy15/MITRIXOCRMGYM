# INZAN PRD → 100% Coverage — Standalone Prompts

> **How to use:** Copy each prompt into a **fresh Antigravity/AI session**. Each is fully self-contained — no prior context needed. Run them in order (dependencies noted). After all 11, the INZAN Integrated System PRD is at 100% MVP coverage.

---

## Prompt 1 of 11 — 🔴 Nutrition Module (PRD §11)

> **Dependencies:** None — can run first
> **Estimated CC time:** ~2-3 hours
> **Files created:** ~5 new files + edits to 4 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Build the complete Nutrition Module per INZAN PRD §11
Recommended order: 1 → 2 → 4 → 3 → 5 → 6 → 8 → 7 → 9 → 10 → 11

Each prompt is fully self-contained with file paths, types, Firestore collections, and exact patterns from your codebase — just paste into a fresh session and go. Want to start with Prompt 1 (Nutrition Module) now, or commit your current work first?
CONTEXT:
- This is a React/TypeScript + Firebase Firestore multi-tenant gym CRM
- Firestore is accessed via `db` from `src/firebase.ts`
- Types are in `src/types.ts` — follow existing patterns (Coach, Session, ClassSchedule etc.)
- Feature flags are in `src/types.ts` → `FeatureFlags` interface — add `nutrition?: boolean`
- Navigation is in `src/App.tsx` around line 600-700 — add a nav item gated by `features.nutrition`
- Hooks pattern: `src/hooks/useXxx.ts` using Firestore `onSnapshot` for real-time data
- Existing session types already include `'Nutrition'` in `SessionType`
- Settings page is `src/Settings.tsx` (59KB) — add nutrition config section
- Member portal is `src/member/MemberPortal.tsx` — add nutrition tab

REQUIREMENTS FROM PRD §11:
1. Nutritionist profile and availability (reuse CoachSchedule pattern but for nutritionists)
2. Appointment calendar with time slots
3. Booking with payment status validation
4. Client queue (today's appointments)
5. Appointment statuses: Scheduled, Completed, Cancelled, Rescheduled, No-show
6. Consultation notes and follow-up tasks (private, role-based access)
7. Member nutrition service history
8. Package/service balance if nutrition packages exist
9. Manager reporting: appointments, attendance, utilization, revenue, follow-up
10. Role-based access to sensitive consultation information

CREATE THESE FILES:
1. `src/types/nutrition.ts` — Types: NutritionAppointment, NutritionConsultation, NutritionPackage, NutritionistProfile
2. `src/hooks/useNutrition.ts` — Firestore real-time hooks for nutrition data (follow useClasses.ts pattern)
3. `src/NutritionModule.tsx` — Admin/manager view: appointment list, nutritionist management, reporting
4. `src/member/MemberNutrition.tsx` — Member portal: book appointments, view history, upcoming
5. `src/components/NutritionAnalytics.tsx` — Manager dashboard: utilization, revenue, follow-up rates

EDIT THESE FILES:
1. `src/types.ts` — Add `nutrition?: boolean` to FeatureFlags
2. `src/App.tsx` — Add 'nutrition' nav item (follow the 'class-manager' pattern around line 620)
3. `src/App.tsx` — Add NutritionModule render case in the content area
4. `src/member/MemberPortal.tsx` — Add nutrition tab to member portal
5. `src/Settings.tsx` — Add nutrition configuration section (appointment duration, cancellation window, etc.)

Firestore collection: `nutritionAppointments` (top-level, tenant-scoped via db)
Subcollection: `nutritionAppointments/{id}/notes` (for consultation notes — restricted access)

RULES:
- Multi-tenant isolation is sacred. Use `db` from firebase.ts for all Firestore ops.
- No `any` types. Properly type everything.
- Use existing UI patterns (shadcn components: Card, Button, Dialog, Badge, etc.)
- Add audit logging via `addAuditLog` from `src/services/auditService.ts`
- Build passes with 0 errors (`npm run build`)
- Follow dark-mode-compatible styling (use existing CSS variables)
```

---

## Prompt 2 of 11 — 🔴 Entitlement Engine (PRD §12-13)

> **Dependencies:** None
> **Estimated CC time:** ~2-4 hours
> **Files created:** ~3 new files + edits to ~5 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Build the Membership & Product Entitlement Engine per INZAN PRD §12-13

CONTEXT:
- React/TypeScript + Firebase Firestore multi-tenant CRM
- Current state: Packages exist (`src/Packages.tsx`, type `Package` in `src/types.ts`) with fields: name, price, sessions, expiryDays, branch, type
- Members have `ClientPackage[]` on their profile with status: Active/Expired/Cancelled/Pending/Hold
- Payments are in `src/Payments.tsx` (112KB) with `Payment` type in types.ts
- PT sessions use `Session` type with booking against packages
- Class bookings use `ClassBooking` type in `src/types/class.ts`
- There is NO formal "purchase → entitlement → booking access" chain currently

WHAT THE PRD REQUIRES (§12-13):
1. Central product catalogue: memberships, PT packages, paid classes, nutrition services, future products
2. Each product defines: price, validity, included services/sessions, eligibility rules, cancellation rules, freeze rules, expiration
3. Purchase creates a **service entitlement** for the member
4. Entitlement controls what the member can book/use
5. Payment confirmation **activates** the entitlement (payment-gated)
6. Expiration automatically blocks new bookings (preserves history)
7. Refunds/credits create traceable financial adjustments (never silently alter history)
8. Common booking engine validates: member status, payment status, entitlement balance, service validity, capacity, policy eligibility BEFORE every booking

BUILD:
1. `src/types/entitlement.ts` — New types:
   - `Product` (extends current Package with: eligibilityRules, cancellationWindowHours, freezeRules, maxFreezes, services: ServiceType[])
   - `Entitlement` (id, memberId, productId, productName, type: 'membership'|'pt'|'class'|'nutrition', status: 'pending'|'active'|'expired'|'cancelled'|'frozen', sessionsTotal, sessionsUsed, validFrom, validUntil, paymentId, createdAt, frozenAt?, unfreezeAt?)
   - `EntitlementAdjustment` (id, entitlementId, type: 'deduct'|'refund'|'credit'|'freeze'|'unfreeze'|'extend', amount, reason, performedBy, createdAt)

2. `src/services/entitlementService.ts` — Core logic:
   - `createEntitlement(memberId, productId, paymentId)` — creates entitlement after payment
   - `activateEntitlement(entitlementId)` — sets status to 'active' after payment confirmation
   - `checkEntitlement(memberId, serviceType)` — returns { canBook: boolean, reason?: string, entitlement?: Entitlement }
   - `deductSession(entitlementId, sessionId)` — atomic deduction with audit
   - `refundEntitlement(entitlementId, reason, performedBy)` — creates adjustment + audit
   - `freezeEntitlement(entitlementId, reason, performedBy)` — freeze with rules check
   - `checkExpiredEntitlements()` — batch job to expire old entitlements

3. `src/hooks/useEntitlements.ts` — Real-time hook for member's entitlements

4. `src/components/EntitlementManager.tsx` — Admin UI: view/manage member entitlements, adjustments

EDIT EXISTING:
- `src/services/transactionService.ts` — After payment creation, call `createEntitlement`
- `src/member/MemberSessions.tsx` — Before booking, call `checkEntitlement`
- `src/member/MemberClasses.tsx` — Before booking, call `checkEntitlement`
- `src/Payments.tsx` — Show entitlement status on payment records
- `src/components/InzanMemberShow.tsx` — Show member's entitlements tab

Firestore collections:
- `entitlements` — one doc per purchased entitlement
- `entitlements/{id}/adjustments` — subcollection for deductions/refunds/freezes

RULES:
- Entitlement checks must be the SINGLE source of truth for "can this member book?"
- Use Firestore transactions where atomicity matters
- All adjustments are append-only (never delete/modify past adjustments)
- Build must pass with 0 errors
```

---

## Prompt 3 of 11 — 🔴 Firestore Security Rules (PRD §4, §22)

> **Dependencies:** Run after Prompts 1-2 so rules cover nutrition + entitlements
> **Estimated CC time:** ~2-3 hours
> **Files created:** 1 file + validation

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Write production Firestore Security Rules enforcing server-side RBAC per PRD §4, §22

CONTEXT:
- Multi-tenant system. Each tenant has its own Firestore database.
- User roles: manager, rep, admin, super_admin, crm_admin, coach, client
- Users collection stores role + granular permissions (can_delete_payments, etc.)
- The PRD §22 says: "RBAC enforced server-side; hiding a button is not sufficient security"
- PRD §22: "Members can only access their own data"
- PRD §22: "Staff can only access authorized departments/data"
- PRD §22: "Audit logs must not be editable by ordinary users"
- Firebase Auth is used. `request.auth.uid` maps to the users collection doc ID.

FIRESTORE COLLECTIONS TO SECURE:
- `clients` — member profiles (client role: own doc only; staff: read all, write by role)
- `payments` — financial transactions (client: own only; rep: create; manager+: full CRUD)
- `sessions` — PT sessions (client: own only; coach: assigned; manager+: all)
- `packages` — product definitions (anyone: read; manager+: write)
- `attendance` — check-in records (staff: create; manager+: edit/delete)
- `auditLogs` — immutable audit trail (anyone authenticated: create; nobody: update/delete)
- `users` — user accounts (self: read own; manager+: read all, write)
- `coaches` — coach profiles (coach: own; manager+: all)
- `tasks` — task assignments (assigned user: read/update; manager+: all)
- `classSchedules` — class definitions (anyone: read; manager+: write)
- `classBookings` — class reservations (client: own; staff: all)
- `entitlements` — service entitlements (client: own; staff: read; manager+: write)
- `nutritionAppointments` — nutrition bookings (client: own; nutritionist: assigned; manager+: all)
- `settings` — tenant settings (manager+: read/write)
- `announcements` — public announcements (anyone: read; manager+: write)
- `complaints` — complaint tickets (creator: own; manager+: all)
- `lostFoundItems` — lost & found (staff+: all)

WRITE:
1. `firestore.rules` — Complete security rules file

RULES STRUCTURE:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() { ... }
    function getUserRole() { ... }  // reads from users collection
    function isManager() { ... }
    function isSuperAdmin() { ... }
    function isOwner(userId) { ... }
    function isCoach() { ... }
    function isClient() { ... }
    
    // Per-collection rules...
  }
}
```

KEY SECURITY REQUIREMENTS:
- Audit logs: create-only for authenticated users, no update/delete ever
- Payments: only users with can_delete_payments can delete (soft-delete)
- Client data: role=client can only read/write their own document
- Coach data: role=coach can only read/write their own schedule + assigned sessions
- Settings: only manager/super_admin/crm_admin can modify
- All write operations require authentication
- No public read access to any collection except announcements

ALSO:
- Validate the rules using the Firebase MCP tool `firebase_validate_security_rules` if available
- Create `firestore.rules` in the project root
- Build must still pass
```

---

## Prompt 4 of 11 — 🔴 Atomic Booking with Firestore Transactions (PRD §13)

> **Dependencies:** Prompt 2 (Entitlement Engine) should be done first
> **Estimated CC time:** ~1-2 hours
> **Files edited:** ~4 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Add Firestore transaction-level atomic booking to prevent double-booking per PRD §13

CONTEXT:
- PRD §13 says: "Use transaction locking/atomic booking logic so two users cannot reserve the same final slot simultaneously"
- PRD §13: "Prevent overbooking at database level, not only in the interface"
- Currently, bookings check capacity in code but don't use Firestore transactions
- Class bookings are in `src/hooks/useClassBookings.ts` and `src/components/InzanClassManager.tsx`
- PT session bookings are in `src/hooks/useSessions.ts` and `src/services/sharedServices.ts`
- Firestore is accessed via `db` from `src/firebase.ts`
- Firestore supports `runTransaction()` for atomic operations

FILES TO MODIFY:

1. `src/hooks/useClassBookings.ts` — Wrap the booking function in `runTransaction()`:
   - Read current class doc (get attendees count)
   - Check capacity atomically
   - If capacity available: add booking + update class attendees array
   - If full: add to waitlist OR reject
   - Return success/failure

2. `src/hooks/useSessions.ts` — Wrap PT session creation in `runTransaction()`:
   - Read coach's sessions for that timeslot
   - Check capacity by session type (1-on-1=1, Partner=2, Small Group=3-5)
   - If available: create session doc
   - If full: reject with clear error message

3. `src/member/MemberClasses.tsx` — Update booking handler to use the new atomic function and handle race-condition errors gracefully (show "slot just filled" message)

4. `src/member/MemberSessions.tsx` — Same for PT booking

PATTERN TO FOLLOW:
```typescript
import { runTransaction, doc, getDoc } from 'firebase/firestore';

async function bookClassAtomically(classId: string, memberId: string, memberName: string) {
  return runTransaction(db, async (transaction) => {
    const classRef = doc(db, 'classSchedules', classId);
    const classDoc = await transaction.get(classRef);
    if (!classDoc.exists()) throw new Error('Class not found');
    
    const data = classDoc.data();
    const attendees = data.attendees || [];
    
    if (attendees.length >= data.capacity) {
      // Add to waitlist instead
      const waitlist = data.waitlist || [];
      transaction.update(classRef, { waitlist: [...waitlist, memberId] });
      return { status: 'waitlisted' };
    }
    
    // Atomically add to attendees
    transaction.update(classRef, { attendees: [...attendees, memberId] });
    
    // Create booking document
    const bookingRef = doc(db, 'classBookings', `${classId}_${memberId}`);
    transaction.set(bookingRef, { classId, memberId, memberName, status: 'booked', bookedAt: new Date().toISOString() });
    
    return { status: 'booked' };
  });
}
```

RULES:
- Every booking path (class, PT, nutrition) must use runTransaction
- If transaction fails due to contention, retry once then show user-friendly error
- Add audit log entry after successful booking
- Build must pass with 0 errors
```

---

## Prompt 5 of 11 — 🔴 Coach/Instructor Payout Calculations (PRD §9, §10)

> **Dependencies:** None
> **Estimated CC time:** ~1-2 hours
> **Files created:** ~2 new files + edits to ~3 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Build coach/instructor payout calculation system per PRD §9, §10

CONTEXT:
- PRD §9: "Coach payout calculation support" and "Revenue linked to PT packages"
- PRD §10: "Automated instructor payout calculations for free and paid classes"
- PRD §10: "Free and paid class instructor payouts use configurable fixed/revenue-share logic"
- PRD §17: "PT paid-class and fixed/percentage payout calculations should be configurable"
- Coaches are in `src/Coaches.tsx`, type `Coach` in `src/types.ts`
- Sessions (PT) are in `src/hooks/useSessions.ts`, type `Session` in types.ts
- Classes are in `src/types/class.ts`, type `ClassSchedule`
- Commission rates exist in SettingsContext: `commissionRates: { ptRate: number; groupRate: number }`
- Payments link to coaches via `coachName` field

BUILD:
1. `src/types/payout.ts` — Types:
   - `PayoutConfig` { coachId, ptFixedRate?: number, ptPercentage?: number, freeClassRate?: number, paidClassPercentage?: number, paidClassFixedRate?: number }
   - `PayoutRecord` { id, coachId, coachName, period: string (YYYY-MM), ptSessions: number, ptRevenue: number, ptPayout: number, freeClasses: number, freeClassPayout: number, paidClasses: number, paidClassRevenue: number, paidClassPayout: number, totalPayout: number, status: 'draft'|'approved'|'paid', generatedAt: string, approvedBy?: string, approvedAt?: string }

2. `src/components/PayoutCalculator.tsx` — Admin UI:
   - Select month/coach to calculate
   - Show breakdown: PT sessions × rate, free classes × fixed rate, paid classes × percentage
   - Generate draft payout records
   - Manager can approve → status changes to 'approved'
   - Export to CSV
   - Per-coach configurable rates (stored in `payoutConfigs` Firestore collection)

3. `src/coach/CoachEarnings.tsx` — Coach portal view: see their own payout history

EDIT:
- `src/Coaches.tsx` — Add "Payouts" tab/section with link to PayoutCalculator
- `src/coach/CoachPortal.tsx` — Add "Earnings" tab linking to CoachEarnings
- `src/Settings.tsx` — Add default payout rates configuration section
- `src/App.tsx` — If needed, add admin nav item or nest under existing admin-hub

Firestore collections:
- `payoutConfigs` — per-coach rate overrides
- `payoutRecords` — generated payout records

RULES:
- Calculations must be deterministic and auditable
- Manager/CEO approval required before marking as 'paid'
- Add audit log for payout approvals
- Build passes with 0 errors
```

---

## Prompt 6 of 11 — 🟡 Approval Workflows (PRD §20)

> **Dependencies:** None
> **Estimated CC time:** ~2 hours
> **Files created:** ~2 new files + edits to ~4 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Formalize approval workflows per PRD §20

CONTEXT:
- PRD §20 defines 6 approval workflows (TABLE 3 in the document):
  1. Instructor class cancellation → Class Manager approves → cancel + notify + refund/credit
  2. PT exception/cancellation override → Fitness Manager approves → apply + audit + notify
  3. Discount exception → Sales Manager/CEO approves → apply discount + audit
  4. Refund → Manager/CEO approves → process refund/credit + audit
  5. Manual balance adjustment → Manager/CEO approves → adjust entitlement + reason + audit
  6. Staff permission change → CEO/Super Admin approves → update role + audit
- Currently: `src/admin/AdminRequests.tsx` (14KB) has a basic request system
- CancellationRequest type exists in `src/types/class.ts`

ENHANCE THE SYSTEM:
1. `src/types/approval.ts` — Unified approval types:
   - `ApprovalRequest` { id, type: 'class_cancellation'|'pt_override'|'discount'|'refund'|'balance_adjustment'|'permission_change', status: 'pending'|'approved'|'rejected', requesterId, requesterName, requesterRole, targetEntityId, targetEntityType, details: Record<string, any>, reason: string, approverRole: string (required role), approvedBy?: string, approvedAt?: string, rejectionReason?: string, createdAt: string }

2. `src/services/approvalService.ts` — Approval logic:
   - `createApprovalRequest(type, details, reason, requesterId)` — creates pending request + notifies approvers
   - `approveRequest(requestId, approverId)` — validates approver has required role → executes the post-approval action
   - `rejectRequest(requestId, approverId, reason)` — rejects with reason
   - Post-approval actions per type:
     * class_cancellation → update class status, notify members, process refunds
     * refund → call refund logic in transactionService
     * discount → apply discount to payment
     * balance_adjustment → adjust entitlement
     * permission_change → update user role

EDIT:
- `src/admin/AdminRequests.tsx` — Upgrade to use the unified ApprovalRequest type, show all request types in tabs, allow approve/reject with reason
- `src/Payments.tsx` — "Request Refund" button creates an approval request instead of direct refund
- `src/components/InzanClassManager.tsx` — Instructor cancel button creates approval request
- `src/member/MemberSessions.tsx` — Cancellation/reschedule creates approval if outside free-cancel window

Firestore collection: `approvalRequests`

RULES:
- Approver must have the correct role (server-side check)
- Every approval/rejection creates an audit log entry
- Pending requests show as badge count on AdminRequests nav item
- Build passes with 0 errors
```

---

## Prompt 7 of 11 — 🟡 Auto No-Show Cloud Function (PRD §14)

> **Dependencies:** None
> **Estimated CC time:** ~30-45 minutes
> **Files created:** 1 Cloud Function file

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Create a Cloud Function that auto-flags class no-shows per PRD §14

CONTEXT:
- PRD §14: "Class: members not marked present 10 minutes after class start are automatically flagged No-show"
- PRD §14 also says: "PT: Completed and No-show deduct one session; Rescheduled does not deduct"
- Cloud Functions are in `functions/src/` directory
- The functions project uses TypeScript
- Class schedules are in `classSchedules` collection with `startTime` (ISO string), `attendees`, `checkedIn`, `noShows` arrays
- Class bookings are in `classBookings` collection with `status` field
- Firestore admin SDK is used in functions: `import * as admin from 'firebase-admin'`
- Multi-tenant: the function needs to run against the correct tenant database
- Existing functions may use `getDbForRequest()` pattern from functions/src

BUILD:
1. `functions/src/scheduled/autoNoShow.ts` — Scheduled Cloud Function:
   - Runs every 5 minutes via Cloud Scheduler (`functions.pubsub.schedule('every 5 minutes')`)
   - For each tenant database:
     * Query `classSchedules` where `startTime` is 10+ minutes ago AND `status` is 'active' AND `noShowsProcessed` is not true
     * For each class: find members in `attendees` who are NOT in `checkedIn`
     * Update those members' bookings to status='no-show' in `classBookings`
     * Add them to the class's `noShows` array
     * Set `noShowsProcessed = true` on the class
     * Create audit log entry
     * Send push notification to no-show members (optional)

2. Also verify PT deduction logic exists correctly:
   - When a PT session status changes to 'Completed' or 'No Show' → deduct 1 from package balance
   - When status changes to 'Rescheduled' → do NOT deduct
   - This logic should be in `src/hooks/useSessions.ts` or a service file — verify and fix if needed

RULES:
- Function must handle multiple tenants
- Idempotent — running twice on same class must not double-process
- Log all actions for debugging
- Export the function properly in `functions/src/index.ts`
```

---

## Prompt 8 of 11 — 🟡 Payment Status & Refund Workflow (PRD §17)

> **Dependencies:** Prompt 6 (Approval Workflows) should be done first
> **Estimated CC time:** ~1 hour
> **Files edited:** ~3 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Add formal payment statuses and refund workflow per PRD §17

CONTEXT:
- PRD §17 requires payment statuses: Pending, Paid, Failed, Refunded, Partially Refunded, Cancelled/Voided
- Current `Payment` type in `src/types.ts` has: amount, amount_paid, method, date, deleted_at (soft delete)
- But NO formal `paymentStatus` field
- PRD §17: "Refund/credit workflow with permission control"
- PRD §17: "Revenue reports by department, product, coach/instructor and date"
- Payments component: `src/Payments.tsx` (112KB)
- Transaction service: `src/services/transactionService.ts`

CHANGES:

1. `src/types.ts` — Add to Payment type:
   ```typescript
   paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'voided';
   refundAmount?: number;
   refundDate?: string;
   refundReason?: string;
   refundApprovedBy?: string;
   refundApprovalId?: string; // links to approvalRequests
   ```

2. `src/services/transactionService.ts` — Add:
   - `requestRefund(paymentId, reason, requestedBy)` — creates an approval request (if approval workflow exists) OR processes directly for CEO/super_admin
   - `processRefund(paymentId, amount, approvedBy)` — sets paymentStatus to 'refunded' or 'partially_refunded', creates audit log, creates entitlement adjustment
   - Default new payments to `paymentStatus: 'paid'` (or 'pending' if payment method requires confirmation)

3. `src/Payments.tsx` — Add:
   - Payment status badge/column in the payments table
   - "Request Refund" button (creates approval request for non-CEO, direct refund for CEO)
   - Filter by payment status
   - Visual indicator for refunded payments

4. `src/Reports.tsx` / `src/AdvancedReports.tsx` — Ensure revenue reports exclude refunded payments from totals

RULES:
- Never delete payment records — use paymentStatus changes instead
- Refund creates a traceable adjustment (PRD: "never silently alter history")
- Audit log for every status change
- Build passes with 0 errors
```

---

## Prompt 9 of 11 — 🟡 Notification Templates & Preferences (PRD §15)

> **Dependencies:** None
> **Estimated CC time:** ~1-1.5 hours
> **Files created:** ~2 new files + edits to ~3 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Build notification template management and user preferences per PRD §15

CONTEXT:
- PRD §15 requires: "Templates managed by authorized admin"
- PRD §15 event list: booking confirmation, reminders, cancellation, reschedule, waitlist promotion, instructor cancellation, payment confirmation, membership expiry, PT balance low, lead follow-up, renewal reminders, operational alerts
- PRD §15: "Users can manage non-critical notification preferences"
- PRD §15: "Notification log: event, recipient, channel, sent time, delivery status, failure reason"
- Current: `src/services/pushService.ts` sends push notifications but uses hardcoded message strings
- Current: `src/components/NotificationCenter.tsx` shows in-app notifications
- Settings are in `src/Settings.tsx`

BUILD:
1. `src/types/notification.ts` — Types:
   - `NotificationTemplate` { id, eventType: NotificationEventType, title: string, body: string, channel: 'push'|'email'|'sms', enabled: boolean, variables: string[] (e.g., ['memberName', 'className', 'date']) }
   - `NotificationEventType` = 'booking_confirmation' | 'booking_reminder' | 'cancellation' | 'reschedule' | 'waitlist_promotion' | 'instructor_cancellation' | 'payment_confirmation' | 'membership_expiry' | 'pt_balance_low' | 'lead_followup' | 'renewal_reminder' | 'operational_alert'
   - `NotificationLog` { id, eventType, recipientId, recipientName, channel, title, body, sentAt, deliveryStatus: 'sent'|'delivered'|'failed', failureReason?: string }
   - `NotificationPreference` { userId, disabledEvents: NotificationEventType[] }

2. `src/components/NotificationTemplateManager.tsx` — Admin UI:
   - List all event types with their templates
   - Edit template title/body with variable placeholders (e.g., {{memberName}})
   - Enable/disable per event type
   - Preview rendered template

3. `src/services/pushService.ts` — Refactor:
   - Load templates from Firestore `notificationTemplates` collection
   - Replace hardcoded strings with template rendering
   - Check user preferences before sending
   - Log every notification to `notificationLogs` collection
   - Add `renderTemplate(template, variables)` function

EDIT:
- `src/Settings.tsx` — Add "Notification Templates" section linking to template manager
- `src/member/MemberProfile.tsx` — Add notification preferences section (toggle per event type)
- `src/components/NotificationCenter.tsx` — Show notification history from logs

Firestore collections:
- `notificationTemplates` — one doc per event type
- `notificationLogs` — append-only log of sent notifications
- User docs get a `notificationPreferences` field

RULES:
- Seed default templates on first load if collection is empty
- Templates use {{variable}} syntax for dynamic content
- Admin can customize but cannot delete system event types
- Build passes with 0 errors
```

---

## Prompt 10 of 11 — 🟡 Calendar Sync (PRD §6.3)

> **Dependencies:** None
> **Estimated CC time:** ~1 hour
> **Files created:** ~1 new utility file + edits to ~3 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Add calendar sync (ICS export) for member bookings per PRD §6.3

CONTEXT:
- PRD §6.3: "Calendar sync" for class bookings
- Member portal: `src/member/MemberClasses.tsx`, `src/member/MemberSessions.tsx`
- Sessions have: date, startTime, endTime, coachName
- Classes have: name, startTime, endTime, instructorName
- This should generate .ics files for download (works with Google Calendar, Apple Calendar, Outlook)
- No external API needed — just generate iCalendar format files

BUILD:
1. `src/utils/calendarSync.ts` — Utility:
   - `generateICSEvent(event: { title, description, startTime, endTime, location? })` → returns ICS string
   - `generateICSCalendar(events[])` → returns multi-event ICS string
   - `downloadICS(filename, icsContent)` → triggers browser download
   - `addToGoogleCalendar(event)` → opens Google Calendar URL with pre-filled event
   - ICS format: BEGIN:VCALENDAR / BEGIN:VEVENT / DTSTART / DTEND / SUMMARY / DESCRIPTION / END:VEVENT / END:VCALENDAR

EDIT:
- `src/member/MemberClasses.tsx` — Add "Add to Calendar" button on each booked class card
- `src/member/MemberSessions.tsx` — Add "Add to Calendar" button on each upcoming PT session
- `src/member/MemberHome.tsx` — Add "Export All Upcoming to Calendar" button

UI: Each booking card gets a small calendar icon button. Clicking it shows options:
- "Download .ics file" (universal)
- "Add to Google Calendar" (opens URL)

RULES:
- Use proper iCalendar RFC 5545 format
- Include timezone (Africa/Cairo for INZAN)
- Include coach/instructor name in description
- Build passes with 0 errors
```

---

## Prompt 11 of 11 — 🟡 Front Desk Shift Reports (PRD §7)

> **Dependencies:** None
> **Estimated CC time:** ~1-1.5 hours
> **Files created:** ~1 new file + edits to ~2 existing files

```
PROJECT: MitrixoGYM CRM Platform (c:\Users\Mi5a\MitrixoGYMCRMPlatform)
TASK: Build Front Desk daily handover/shift report per PRD §7

CONTEXT:
- PRD §7: "Daily handover/shift report" for Front Desk staff
- PRD §7: "Operational notes"
- Dashboard: `src/Dashboard.tsx` (86KB) — already shows today's stats
- Attendance: `src/Attendance.tsx` (42KB) — has check-in data
- Payments: payments for today are available
- Sessions: today's PT sessions available
- Classes: today's classes available
- Club Operations: `src/ClubOperations.tsx` (32KB) — operational features

BUILD:
1. `src/components/ShiftReport.tsx` — Shift handover report:
   - Auto-generated summary of the current shift:
     * Total check-ins today (from attendance collection)
     * New member sign-ups today
     * Payments collected today (total + breakdown by method)
     * PT sessions completed/no-shows today
     * Classes completed today with attendance counts
     * Open complaints/service requests
     * Lost & found items logged today
     * Operational notes (free-text field for shift notes)
   - "Save & Hand Over" button — saves report to Firestore
   - "View Past Reports" — list of previous shift reports
   - Print-friendly layout
   - Manager can review and sign off

Firestore collection: `shiftReports` { id, date, shift: 'morning'|'evening'|'night', createdBy, createdByName, summary: { checkIns, newSignups, paymentsTotal, paymentsByMethod, ptSessionsCompleted, ptNoShows, classesCompleted, classAttendance, openComplaints, lostFoundItems }, notes: string, handedOverTo?: string, managerSignOff?: boolean, managerSignOffBy?: string, createdAt: string }

EDIT:
- `src/App.tsx` — Add 'shift-report' to nav items (show for Front Desk staff + managers, around line 660)
- `src/Dashboard.tsx` — Add "Generate Shift Report" quick action button

RULES:
- Report auto-populates from real data (queries attendance, payments, sessions, classes for today)
- Notes are free-text for staff to write handover items
- Reports are immutable after submission (append-only)
- Add audit log for report creation
- Build passes with 0 errors
```

---

## Execution Checklist

| # | Prompt | Priority | Status |
|---|---|---|---|
| 1 | Nutrition Module | 🔴 Critical | ☐ |
| 2 | Entitlement Engine | 🔴 Critical | ☐ |
| 3 | Firestore Security Rules | 🔴 Critical | ☐ |
| 4 | Atomic Booking | 🔴 Critical | ☐ |
| 5 | Payout Calculations | 🔴 Critical | ☐ |
| 6 | Approval Workflows | 🟡 Important | ☐ |
| 7 | Auto No-Show Function | 🟡 Important | ☐ |
| 8 | Payment Status & Refund | 🟡 Important | ☐ |
| 9 | Notification Templates | 🟡 Important | ☐ |
| 10 | Calendar Sync | 🟡 Important | ☐ |
| 11 | Shift Reports | 🟡 Important | ☐ |

> **Recommended order:** 1 → 2 → 4 → 3 → 5 → 6 → 8 → 7 → 9 → 10 → 11
> 
> **Total estimated CC time:** ~15-20 hours across all 11 prompts
> **Human team equivalent:** ~3-4 months of development
