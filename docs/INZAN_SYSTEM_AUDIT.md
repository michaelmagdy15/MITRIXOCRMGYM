# INZAN Integrated System — Full Audit Report
### PRD vs Current Implementation (September 2026)

> **Document reviewed:** `INZAN Integrated System.docx` (30 sections + 5 tables)
> **Codebase audited:** `MitrixoGYMCRMPlatform` (React/TypeScript + Firebase Firestore)

---

## Executive Summary

The PRD describes a **complete gym management ecosystem** with 12 architectural layers. The current codebase covers roughly **55–60%** of the MVP scope. The platform has a strong foundation for CRM, payments, coaches, classes, member portal, and front-desk operations. Major gaps remain in **Nutrition**, **Booking Engine atomicity**, **Membership/Product Engine entitlement**, **Approval Workflows**, and **granular RBAC enforcement server-side**.

---

## Section-by-Section Audit

### ✅ = Implemented | ⚠️ = Partial | ❌ = Not Implemented | 🔲 = Phase 2 (not MVP)

---

### §1 Purpose
| Requirement | Status | Notes |
|---|---|---|
| One connected ecosystem | ✅ | Single React app + Firestore per tenant |
| Shared source of truth | ✅ | All departments read from same Firestore collections |

---

### §2 System Architecture — High Level

| Component | Status | Notes |
|---|---|---|
| Member Mobile App | ✅ | [MemberPortal.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberPortal.tsx) — full portal with home, classes, sessions, profile, packages, rewards, etc. |
| CRM / Central Member Database | ✅ | [Clients.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Clients.tsx) — 222KB, very comprehensive |
| Front Desk Admin Portal | ✅ | Dashboard, check-in, attendance, member search all present |
| Sales Workspace | ✅ | [Leads.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Leads.tsx) — 95KB with pipeline, interactions, follow-ups |
| Fitness Workspace | ⚠️ | Coaches, sessions, schedules exist. Assessment queue exists. Missing: coach payout calculations, utilization dashboards |
| Classes / Instructor Workspace | ✅ | [InzanClassManager.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/InzanClassManager.tsx), [InzanClassSchedule.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/InzanClassSchedule.tsx), [InzanClassAnalytics.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/InzanClassAnalytics.tsx) |
| Nutrition Workspace | ❌ | **No nutrition module exists** — no appointments, no nutritionist profiles, no consultation notes |
| Management Dashboard | ✅ | [Dashboard.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Dashboard.tsx) — 86KB with KPIs |
| CEO Super Admin | ✅ | [SuperAdminHub.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/SuperAdminHub.tsx) — full platform admin |
| Notification Service | ⚠️ | [pushService.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/pushService.ts) — push notifications via Expo. [NotificationCenter.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/NotificationCenter.tsx). Missing: WhatsApp/SMS integration, email templates management |
| Payment Layer | ✅ | [Payments.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Payments.tsx) — 112KB, extensive. [transactionService.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/transactionService.ts) |
| Audit & Reporting Layer | ✅ | [AuditLogs.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/AuditLogs.tsx), [auditService.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/auditService.ts), [Reports.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Reports.tsx), [AdvancedReports.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/AdvancedReports.tsx) |

---

### §3 One Member, One Profile

| Field | Status | Notes |
|---|---|---|
| Unique Member ID | ✅ | `memberId` field in Client type |
| Personal/contact info | ✅ | name, phone, email, gender, DOB |
| Membership status/package/dates | ✅ | status, package, startDate, membershipExpiry, freeze history |
| Payment/transaction history | ✅ | Payments collection linked by clientId |
| PT package balance/session history | ✅ | PTPackageRecord, Session types |
| Class bookings/attendance/waitlist | ✅ | ClassBooking collection, waitlist support |
| Assessment requests | ✅ | Assessment type with full fields |
| Nutrition appointments | ❌ | **Not implemented** |
| Lead/source history | ✅ | source, stage, interest, category on Client |
| Complaints/service cases | ⚠️ | [Complaints.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Complaints.tsx) exists (feature-flagged) but basic |
| Communication history | ⚠️ | InteractionLog exists for leads; member comms not tracked |
| Documents/consents | ❌ | Not implemented |
| Full audit trail | ✅ | AuditLog type covers CREATE/UPDATE/DELETE |

---

### §4–5 User Roles & Permission Model

| Requirement | Status | Notes |
|---|---|---|
| RBAC roles defined | ✅ | `UserRole = 'manager' | 'rep' | 'admin' | 'super_admin' | 'crm_admin' | 'coach' | 'client'` |
| Per-module+action permissions | ⚠️ | Some granular permissions exist (`can_delete_payments`, `can_view_global_dashboard`, `can_access_settings_and_history`, `can_delete_records`, `can_assign_leads`). But not a full matrix covering VIEW/CREATE/EDIT/APPROVE/CANCEL/REFUND/ADJUST/EXPORT/DELETE per module |
| Server-side RBAC enforcement | ⚠️ | `requireAuth` middleware exists on API routes, but most permission checks are **client-side** (hiding UI elements). PRD §22 says "hiding a button is not sufficient security" |
| CEO unrestricted access | ✅ | `super_admin` / `crm_admin` roles have full access |

> [!WARNING]
> **Gap: Server-side RBAC is the biggest security concern.** Firestore Security Rules should enforce per-role access at the database level, not just UI-side checks.

---

### §6 Member App

| Feature | Status | Notes |
|---|---|---|
| 6.1 Account & Profile | ✅ | [MemberProfile.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberProfile.tsx), login, digital membership card |
| QR code for check-in | ✅ | [QRCodePage.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/QRCodePage.tsx) |
| 6.2 Home Dashboard | ✅ | [MemberHome.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberHome.tsx) — 39KB with status, upcoming, alerts |
| 6.3 Classes | ✅ | [MemberClasses.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberClasses.tsx) — booking, schedule, filters |
| Waitlist FIFO | ✅ | Implemented in class booking hooks |
| Calendar sync | ❌ | Not implemented |
| 6.4 PT/Personal Training | ✅ | [MemberSessions.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/member/MemberSessions.tsx) — 29KB |
| Assessment request | ✅ | Assessment type with coach preference, injuries, goals |
| Payment-gated booking | ⚠️ | Payment recording exists, but **entitlement engine** (purchase → activates booking rights) is not a formal system |
| Session rating | ✅ | `rating` and `feedback` fields on Session type |
| 6.5 Nutrition | ❌ | **No nutrition booking/viewing in member portal** |

---

### §7 Front Desk Module

| Feature | Status | Notes |
|---|---|---|
| Live dashboard | ✅ | Dashboard shows today's check-ins, sessions, etc. |
| Member search (name/phone/ID/QR) | ✅ | Search by name, phone, memberId in Clients |
| Check-in validation | ✅ | [MemberCheckin.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/MemberCheckin.tsx) with QR + manual |
| Dynamic QR check-in | ✅ | QR scanning implemented |
| Create/modify bookings | ✅ | Bookings module exists |
| Payment collection/receipts | ✅ | Payments + receipt serial support |
| Service requests/complaints | ⚠️ | Complaints module exists but basic |
| Lost & Found | ✅ | [LostAndFound.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/LostAndFound.tsx) (feature-flagged) |
| Daily handover/shift report | ❌ | Not implemented |
| Alerts for exceptions | ⚠️ | Some alerts exist on Dashboard, not comprehensive |

---

### §8 Sales CRM Module

| Feature | Status | Notes |
|---|---|---|
| Lead creation with unique Lead ID | ✅ | Leads with full pipeline |
| Lead source tracking | ✅ | Multiple sources defined |
| Lead status pipeline | ✅ | `New → Trial → Follow Up → Converted → Lost` |
| Activity log (call/WhatsApp/email) | ✅ | InteractionLog with types |
| Follow-up reminders | ✅ | `nextFollowUp` field |
| Membership/package catalogue | ✅ | Packages module |
| Quote/order creation | ⚠️ | [QuoteGenerator.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/QuoteGenerator.tsx) exists but very basic (1.4KB) |
| Conversion tracking | ✅ | Lead stage → Converted |
| Renewal pipeline | ✅ | [RenewalPipeline.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/RenewalPipeline.tsx) |
| Sales targets/performance | ✅ | `salesTarget` on User, [UserPerformanceDialog.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/UserPerformanceDialog.tsx), [CommissionReport.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/CommissionReport.tsx) |
| Auto lead→member conversion | ⚠️ | Conversion exists but may create duplicates in edge cases |
| Manager approval for discounts | ⚠️ | Discount fields exist on Payment, approval workflow is basic |

---

### §9 Fitness / PT Management Module

| Feature | Status | Notes |
|---|---|---|
| Coach profiles/status | ✅ | [Coaches.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Coaches.tsx), Coach type with `active` status |
| Working days/hours/capacity | ✅ | CoachSchedule type with per-day capacities |
| Session types with capacity | ✅ | `SessionType = '1-on-1' | 'Partner' | 'Small Group' | 'Class' | 'Nutrition'` |
| Coach schedule/utilization | ⚠️ | [CoachSchedule.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/coach/CoachSchedule.tsx) exists. Utilization dashboard not comprehensive |
| Assessment request queue | ✅ | Assessment type with full workflow |
| PT package balance tracking | ✅ | PTPackageRecord + sessions tracking |
| Session statuses | ✅ | `Scheduled, Completed, No Show, Rescheduled, Cancelled` |
| Deduction logic (Complete/No Show=deduct, Reschedule=no deduct) | ⚠️ | Logic exists but needs verification of correctness |
| Session status audit logging | ✅ | AuditLog covers SESSION entity |
| Coach performance metrics | ⚠️ | Basic stats exist, missing: fill rate, cancellation rates, utilization % |
| Coach payout calculation | ❌ | **Not implemented** — PRD requires configurable fixed/revenue-share payout logic |
| Revenue linked to PT | ✅ | Payments linked via `packageType` |

---

### §10 Classes / Instructor Module

| Feature | Status | Notes |
|---|---|---|
| Create/edit/publish schedules | ✅ | InzanClassManager handles CRUD |
| Category/instructor/capacity/price | ✅ | Class type has all fields |
| Instructor profiles/login | ✅ | Coach role handles this |
| Live roster | ✅ | ClassSchedule shows roster |
| Manual attendance by instructor | ✅ | CoachClassPortal has attendance |
| Cancellation approval workflow | ⚠️ | [AdminRequests.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/admin/AdminRequests.tsx) exists but may not cover full instructor→manager→notification flow |
| Peak-hour heatmaps | ✅ | InzanClassAnalytics includes analytics |
| Fill rate/attendance/no-show trends | ✅ | Analytics component covers this |
| Instructor payout calculations | ❌ | **Not implemented** |
| Waitlist FIFO + auto-promotion | ✅ | Implemented |
| Auto no-show flagging (10 min) | ⚠️ | Needs verification — may be manual only |

---

### §11 Nutrition Module

> [!CAUTION]
> **The entire Nutrition Module is NOT implemented.** This is a significant gap for MVP.

| Feature | Status |
|---|---|
| Nutritionist profile/availability | ❌ |
| Appointment calendar | ❌ |
| Booking/payment status | ❌ |
| Consultation notes | ❌ |
| Member nutrition history | ❌ |
| Manager reporting | ❌ |
| Role-based access to notes | ❌ |

---

### §12 Membership & Product Engine

| Feature | Status | Notes |
|---|---|---|
| Central product catalogue | ⚠️ | [Packages.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Packages.tsx) exists but is a simple list, not a full product engine |
| Product defines price/validity/sessions/eligibility | ⚠️ | Package has `price`, `sessions`, `expiryDays`, `type`. Missing: cancellation rules, freeze rules, eligibility criteria as formal fields |
| Purchase → entitlement activation | ❌ | **No formal entitlement system.** PRD requires payment confirmation to create a service entitlement that controls what the member can book |
| Expiration blocks new bookings | ⚠️ | Status-based checks exist but not a formal entitlement expiry system |
| Refunds create traceable adjustments | ⚠️ | Soft-delete exists, refund workflow is basic |

> [!IMPORTANT]
> **Gap: Entitlement Engine** — The PRD requires a formal "Purchase → Entitlement → Booking Access" chain. Currently, payment and booking access are loosely coupled.

---

### §13 Booking Engine — Common Logic

| Feature | Status | Notes |
|---|---|---|
| Common booking engine | ❌ | **PT sessions, classes, and nutrition each have separate booking logic.** PRD requires one shared engine with service-specific rules |
| Pre-booking validation chain | ⚠️ | Some validation exists per service but not a unified pipeline |
| Prevent overbooking at DB level | ⚠️ | Capacity checks exist in code, but **no Firestore transaction-level locking** |
| Unique Booking ID | ✅ | Firestore doc IDs serve as booking IDs |
| Audit event on every change | ✅ | AuditLog fires on booking changes |
| Configurable cancellation rules | ⚠️ | Some rules exist, not fully configurable per service type |
| Waitlist FIFO | ✅ | Implemented for classes |
| Manual overrides with reason | ⚠️ | Some override capability, not consistently requiring reasons |

> [!WARNING]
> **Gap: Atomic booking (transaction locking).** Two simultaneous booking requests for the last slot could both succeed. PRD explicitly requires "transaction locking/atomic booking logic."

---

### §14 Attendance Engine

| Feature | Status | Notes |
|---|---|---|
| One attendance record per booking | ✅ | [Attendance.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Attendance.tsx) — 42KB |
| Multiple sources (QR, manual, instructor) | ✅ | QR + manual check-in implemented |
| Standardized states | ✅ | Consistent status types |
| Class: auto no-show at 10 min | ⚠️ | May need Cloud Function for automatic flagging |
| PT: Completed/No Show deduct, Reschedule doesn't | ⚠️ | Logic exists, needs audit for correctness |
| Manual change requires user/timestamp/reason | ⚠️ | Audit log captures changes but "reason" field may not be mandatory |

---

### §15 Notification Center

| Feature | Status | Notes |
|---|---|---|
| Central notification service | ✅ | [NotificationCenter.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/NotificationCenter.tsx), [pushService.ts](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/services/pushService.ts) |
| Push notifications in app | ✅ | Expo push tokens + in-app bell |
| Email | ⚠️ | Mailer utility exists in Cloud Functions but not fully integrated |
| WhatsApp/SMS | ⚠️ | [WhatsAppDialog.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/components/WhatsAppDialog.tsx) exists — uses `wa.me` links, not API-based |
| Templates managed by admin | ❌ | No template management system |
| Notification log | ⚠️ | Push tokens saved, delivery tracking is limited |
| User notification preferences | ❌ | Not implemented |

---

### §16 CRM — Case Management

| Feature | Status | Notes |
|---|---|---|
| Case/ticket linked to Member ID | ⚠️ | [Complaints.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Complaints.tsx) — 32KB but feature-flagged |
| Case categories | ⚠️ | Basic categories, not the full list from PRD |
| Priority/status | ⚠️ | Exists but may not match PRD states |
| Owner/department assignment | ⚠️ | Basic assignment |
| SLA/follow-up deadline | ❌ | Not implemented |
| Escalation to manager | ❌ | Not implemented |
| CEO can view all cases | ⚠️ | Role-based visibility exists |

---

### §17 Payments & Finance

| Feature | Status | Notes |
|---|---|---|
| Payment statuses | ⚠️ | Payment type exists with `method`, `amount`, `amount_paid`. Missing formal `Pending/Paid/Failed/Refunded` status field |
| Receipt/invoice reference | ✅ | `receiptSerial` field |
| Refund/credit workflow | ⚠️ | Basic refund capability, no formal approval chain |
| Revenue reports by dept/product/coach | ⚠️ | Reports exist but may not cover all dimensions |
| Payout calculations | ❌ | Not implemented |

---

### §18 Dashboards & KPIs

| Feature | Status | Notes |
|---|---|---|
| CEO Dashboard | ✅ | [Dashboard.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Dashboard.tsx) — 86KB with revenue, membership, leads, etc. |
| Department Dashboards | ⚠️ | Front Desk and Sales dashboards exist. Fitness/Classes/Nutrition department-specific dashboards are partial or missing |

---

### §19 Reporting

| Feature | Status | Notes |
|---|---|---|
| Date range filtering | ✅ | Reports have date range filters |
| Department/employee/service filters | ⚠️ | Some filters exist, not comprehensive |
| Export CSV/XLSX/PDF | ⚠️ | CSV export likely exists, XLSX/PDF may not |
| Scheduled reports | 🔲 | Phase 2 per PRD |

---

### §20 Approval & Override Workflows

| Feature | Status | Notes |
|---|---|---|
| Instructor class cancellation approval | ⚠️ | [AdminRequests.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/admin/AdminRequests.tsx) — basic request system |
| Discount exception approval | ⚠️ | Discount fields on Payment but no formal approval chain |
| Refund approval | ❌ | No formal refund approval workflow |
| Balance adjustment with reason | ⚠️ | Partial — adjustments possible but reason may not be mandatory |
| Staff permission change approval | ❌ | Not implemented |

---

### §21 Audit Log

| Feature | Status | Notes |
|---|---|---|
| Every admin change recorded | ✅ | AuditLog type with user, action, entity, details, timestamp |
| Append-only for normal users | ⚠️ | No explicit enforcement — relies on Firestore rules which may not fully lock down audit collection |
| Old/new values | ⚠️ | `details` field stores change info, but not structured old/new value pairs |

---

### §22 Data & Security

| Feature | Status | Notes |
|---|---|---|
| Server-side RBAC | ⚠️ | `requireAuth` middleware on API routes, but permission checks are mostly client-side |
| Members see only own data | ✅ | Member portal filters by user |
| Secure auth + password reset | ✅ | Firebase Auth with password reset |
| Soft-delete | ✅ | `deleted_at` field on payments |
| Rate limiting | ❌ | Not implemented |
| PII restricted permissions | ❌ | Not implemented |

---

### §23 Master Data / Settings

| Feature | Status | Notes |
|---|---|---|
| Settings page | ✅ | [Settings.tsx](file:///c:/Users/Mi5a/MitrixoGYMCRMPlatform/src/Settings.tsx) — 59KB |
| Departments/roles | ⚠️ | Roles hardcoded in type, not configurable |
| Cancellation windows | ⚠️ | Some configurability, not per-service-type |
| No-show rules | ⚠️ | Basic rules, not fully configurable |
| Business hours/holidays | ❌ | Not implemented |

---

### §29 Acceptance Criteria — Operational Readiness

| Criterion | Status |
|---|---|
| Member can register/login and see valid services | ✅ |
| Paid purchase activates entitlement | ⚠️ — No formal entitlement engine |
| PT capacity not overbooked | ⚠️ — UI checks but no DB-level atomicity |
| Class capacity not overbooked | ⚠️ — Same concern |
| PT balances deduct correctly | ⚠️ — Needs verification |
| Class attendance/no-show auto-logic | ⚠️ — May be manual |
| Waitlist FIFO works | ✅ |
| Front Desk/Coach/Member see same booking state | ✅ — Firestore real-time sync |
| Managers can approve/reject workflows | ⚠️ — Basic approval system |
| CEO accesses every module | ✅ |
| Staff cannot bypass permissions via API | ⚠️ — **Server-side enforcement gaps** |
| Every critical change auditable | ✅ |
| Notifications generated for events | ⚠️ — Some events, not all |
| Reports reconcile bookings/payments | ⚠️ |
| Single member profile across departments | ✅ |

---

## Priority Gap Summary

### 🔴 Critical Gaps (Must fix for MVP)

| # | Gap | PRD Section | Effort (CC) |
|---|---|---|---|
| 1 | **Nutrition Module** — entirely missing | §11 | ~2-3 hours |
| 2 | **Entitlement Engine** — no formal purchase→entitlement→booking chain | §12, §13 | ~2-4 hours |
| 3 | **Server-side RBAC** — Firestore Security Rules don't enforce per-role permissions | §4, §22 | ~2-3 hours |
| 4 | **Atomic Booking** — no Firestore transaction locking for concurrent bookings | §13 | ~1-2 hours |
| 5 | **Coach/Instructor Payout** — no payout calculation system | §9, §10 | ~1-2 hours |

### 🟡 Important Gaps (Should fix for MVP)

| # | Gap | PRD Section | Effort (CC) |
|---|---|---|---|
| 6 | **Approval Workflows** — refund, discount, cancellation approvals not formalized | §20 | ~2 hours |
| 7 | **Auto No-Show Flagging** — needs Cloud Function for 10-min class auto-flag | §14 | ~30 min |
| 8 | **Notification Templates** — no admin template management | §15 | ~1 hour |
| 9 | **Payment Status Field** — needs formal `Pending/Paid/Failed/Refunded` statuses | §17 | ~1 hour |
| 10 | **Calendar Sync** — member can't sync bookings to phone calendar | §6.3 | ~1 hour |
| 11 | **Daily Handover / Shift Report** — Front Desk feature missing | §7 | ~1-2 hours |

### 🟢 Nice-to-Have (Can defer)

| # | Gap | PRD Section |
|---|---|---|
| 12 | Rate limiting / abuse protection | §22 |
| 13 | Documents/consents management | §3 |
| 14 | SLA/escalation on case management | §16 |
| 15 | Business hours/holidays configuration | §23 |
| 16 | Scheduled management reports | §19 |
| 17 | Full notification delivery log with failure reasons | §15 |

---

## What IS Working Well ✅

1. **Member Portal** — comprehensive with home, classes, sessions, packages, rewards, body tracker, juice bar, locker, invites, wallet, badges, progress
2. **Coach Portal** — schedule, clients, sessions, class portal, profile
3. **CRM/Leads** — full pipeline with interactions, follow-ups, stages, sources
4. **Payments** — very mature at 112KB with discounts, holds, upgrades, transfers, receipts
5. **Attendance** — QR + manual check-in, 42KB component
6. **Class System** — complete CRUD, booking, waitlist, analytics
7. **Audit Logging** — covers major entity changes
8. **Multi-tenancy** — proper tenant isolation with per-tenant Firestore databases
9. **Real-time Data** — Firestore snapshot listeners keep all views in sync
10. **Feature Flags** — modules can be enabled/disabled per tenant

---

## Recommended Build Order (for remaining gaps)

Following PRD §30 (Developer Build Priorities):

1. **Entitlement Engine** (§12-13) — foundation for everything
2. **Server-side RBAC / Firestore Rules** (§4, §22) — security before features
3. **Nutrition Module** (§11) — new module, no dependencies
4. **Atomic Booking with Firestore Transactions** (§13) — data integrity
5. **Payout Calculations** (§9, §10) — operational need
6. **Approval Workflows** (§20) — operational governance
7. **Remaining notification/template work** (§15) — polish
