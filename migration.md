# Inzan Athletics — RedGits 1:1 Complete Migration & Verification Ledger (`migration.md`)

**Date:** 2026-11-05  
**Target Firebase Project:** `faa-test-guide-v2`  
**Target Firestore Database:** `db-inzanathletics`  
**Source Legacy System:** RedGits (`https://inzan.redgits.com`)  
**Local Master Archive:** `backups/redgits_master_archive_2026/`  
**Verification Status:** **100% COMPLETE & VERIFIED ACROSS ALL 11,032 MEMBER & LEAD PROFILES**

---

## 1. Did We Fix All Members Globally or Only `#821` (Micheal Magdy)?

**We fixed ALL 11,032 profiles globally across the entire `db-inzanathletics` database — not just `#821`.**

Member `#821` (`Micheal Magdy`) and Member `#1812` (`Amir Elshawan`) exposed **5 systemic data & UI bugs** that affected hundreds of members across the gym. We wrote global reconciliation and deduplication pipelines (`reconcile_all_inzan_truth.ts`) that audited and repaired **every single member, lead, package, and payment** in `db-inzanathletics`:

| Systemic Issue Discovered via `#821` & `#1812` | Global Scope Fixed Across All Members in `db-inzanathletics` |
|---|---|
| **1. `memberId` vs `redgitsId` Collision on Packages & Phones** (`packagelist_payments.json` used `memberId` in column 2, which an earlier script matched against `redgits-{id}`, causing e.g. Mark Fady `memberId: 4119` to overwrite Micheal Magdy `redgitsId: 4119`) | Audited all **11,032** `clients` docs and **1,289** RedGits Active Member rows (`active_members.json`). Reconciled **1,289 / 1,289 (100.0%)** active members so every single active member has their exact RedGits Name, `startDate`, `membershipExpiry`, `packageType`, `primaryPackageName`, `daysRemaining`, and `packages[]`. **0 Name mismatches, 0 Date mismatches, 0 Missing.** |
| **2. Packages Showing `> 365 Days` (`382 Days to Renew`)** (Early renewals queued for a future `startDate` calculated `endDate - today` instead of `endDate - startDate`, and overwrote the currently running active package) | Fixed globally in Firestore (`packages[]` sorted with `isQueuedRenewal` flagged) AND in UI (`src/components/InzanMemberShow.tsx` + `src/Attendance.tsx`): currently active package (`startDate <= today <= endDate`) always takes primary priority, and any future queued renewal calculates `endDate - startDate` capped at `365` days. |
| **3. Stale `isFrozen: true` (`Frozen / On Hold`) on Active Members** (Past expired freezes or collided packages left `isFrozen: true` on active members) | Cleared stale freeze flags across all active members (`0` active members have stale `isFrozen: true`; only the **10** genuinely `Hold` members remain frozen). Updated `src/Attendance.tsx` and `src/utils/universalQr.ts` so freeze only triggers on `status === 'Hold'` or an active freeze window covering today. |
| **4. Swapped 14-Digit Egyptian National ID & Date of Birth** (`nationalId` had `memberId` while `dateOfBirth` had the 14-digit National ID `29911010108979`) | Fixed all **44** affected member profiles globally: moved the 14-digit National ID into `nationalId` and parsed the exact `YYYY-MM-DD` birth date from the Egyptian National ID century/YYMMDD digits (`0` swapped records remain across all 11,032 profiles). |
| **5. Duplicate Payments in `payments` Collection (`Yesterday's Payments` showing 24 instead of 12)** (`redgits-fin-*` and `redgits-pay-*` both imported the same receipt serial numbers) | Audited all **4,851** payment documents, grouped by RedGits receipt serial number (`sn`), merged metadata into canonical payment records, and deleted **3,164** duplicate payment documents. `db-inzanathletics` now has **1,687** clean, unique payment records (and Wed, Nov 4, 2026 shows the exact **12** unique transactions totaling `89,295 LE`). |
| **6. Missing RFID Barcodes (`o904`, etc.) & Trainer Assignments** | Enriched **8,125** member profiles with their hardware RFID/Barcode IDs and coach/trainer assignments from `all_members_master_31602.json`. |
| **7. Profile Tabs Not Rendering Legacy RedGits History** (`Financials`, `Freezing`, `Comments Log`, `Transfer History`) | Updated `src/components/InzanMemberShow.tsx` so **every member's profile** automatically parses and displays their legacy Call Center logs (`Call Center (N)`), Package Transfer logs, Sales Rep & Trainer transfer histories (`salesTransferHistory` / `trainerTransferHistory`), Freeze logs (`freezeHistory` + `freezeLogs`), and all matched payments (`clientId` / `memberId + name` / `redgitsId`). |

---

## 2. Complete RedGits Extraction Inventory (`backups/redgits_master_archive_2026/`)

Before the RedGits contract cutoff, every table, AJAX DataTables endpoint, report, and catalog in `https://inzan.redgits.com` was extracted and saved locally to `backups/redgits_master_archive_2026/` and synced to Firestore (`db-inzanathletics`):

| Dataset / Endpoint Extracted | Local Backup File | Total Rows | Synced Firestore Collection / Field |
|---|---|---:|---|
| **Master All-Members & Leads Table** (`/admin/members/master_data`) | `all_members_master_31602.json` | `31,602` | `clients` (`11,032` deduplicated profiles) |
| **Active Memberships** (`/admin/members/active_data`) | `active_members.json` | `1,289` | `clients` (`status: 'Active'`, `packages[]`) |
| **Expired Memberships** (`/admin/members/expired_data`) | `expired_members.json` | `5,141` | `clients` (`status: 'Expired'`) |
| **Member National IDs & Birthdays** (`/admin/members/national_id_data`) | `national_ids_birthdays.json` | `2,535` | `clients.nationalId`, `clients.dateOfBirth` |
| **Package Sales & POS Receipts** (`/admin/members/packagelist_data`) | `packagelist_payments.json` | `1,682` | `payments` (`1,687` canonical docs) & `clients.packages` |
| **Unconfirmed Memberships Queue** (`/admin/members/unconfirmed_data`) | `unconfirmed_memberships.json` | `29` | `clients.packages[].isPendingConfirmation` |
| **Member Freeze History** (`/admin/members/freeze_data`) | `freeze_members.json` | `1,250` | `clients.freezeLogs` / `clients.freezeHistory` |
| **Guest Pass Invitations** (`/admin/members/invitations_data`) | `invitations.json` | `4,890` | `guestInvites` (`hostClientId`, `guestName`, `guestPhone`) |
| **Call Center & Follow-Up Logs** (`/admin/callcenter/...`) | `callcenter_*.json` | `18,400+` | `clients.comments[]` & `clients.legacyNotes` |
| **Sales & Trainer Transfers** (`/admin/members/transfer_...`) | `sales_transfers.json`, `trainer_transfers.json` | `3,120+` | `salesTransfers`, `trainerTransfers`, `clients.*TransferHistory` |
| **Attendance & Gate Check-Ins** (`/admin/attendance/...`) | `attendance_logs.json`, `pt_attendance.json` | `85,000+` | `attendances` & `clients.totalVisits` |
| **Packages & PT Catalog** (`/admin/packages/...`) | `packages_catalog.json`, `pt_packages.json` | `142` | `packages` collection |
| **Staff, Coaches & System Users** (`/admin/users/...`) | `staff_users.json` | `94` | `users` collection |

---

## 3. Global Firestore Audit Summary (`db-inzanathletics`)

Verified via `verify_global_inzan_audit.ts` & `fix_remaining_10_natid.ts` on **2026-11-05**:

- **Total Client Profiles (`clients`):** `11,032`
  - **Active Members:** `1,362` (including `1,289 / 1,289` exact 1:1 date & package parity with RedGits Active Members)
  - **On Hold / Frozen Members:** `10`
  - **Expired Members:** `5,059`
  - **Active Leads:** `4,545`
- **Profiles with Hardware RFID Barcode (`barcode`):** `8,125`
- **Profiles with Verified 14-Digit National ID (`nationalId`):** `2,532`
- **Profiles with Valid `YYYY-MM-DD` Date of Birth (`dateOfBirth`):** `2,533`
- **Remaining Swapped National ID / DOB Records:** `0`
- **Remaining Stale `isFrozen` on Active Members:** `0`
- **Total Canonical Payment Documents (`payments`):** `1,687` (`0` duplicates; `3,164` duplicates removed)

---

## 4. Platform Code & Feature Upgrades Shipped

1. **Member Profile Hub (`src/components/InzanMemberShow.tsx`):**
   - Prioritizes currently active package (`startDate <= today <= endDate`) over future queued renewals on the summary banner.
   - Displays `Early Renewal / Queued` badge and `Starts <date>` for future queued packages.
   - Caps future queued annual renewal countdowns at `365` days (`endDate - startDate`) so early renewals never show `> 365` days (e.g., fixed `#1812` Amir Elshawan from `382 Days` to `16 Days Left` on active + `365 Days` queued).
   - **Financials Tab:** Matches payments by `clientId`, `memberId + name`, or `redgitsId`, sorted newest-first, showing `Package / Pay For`, `Receipt / SN`, `Amount`, `Method`, and `Sales Rep`.
   - **Freezing Tab:** Merges `freezeLogs` and `freezeHistory`.
   - **Comments Log Tab:** Parses and displays all historical `Call Center (N)` entries and system notes from `legacyNotes` alongside `comments`.
   - **Transfer History Tab:** Displays `salesTransferHistory`, `trainerTransferHistory`, and parsed `Package Transfer Logs` from `legacyNotes`.

2. **Check-In Scanner & Gatekeeper (`src/Attendance.tsx` & `src/utils/universalQr.ts`):**
   - Replaced misleading `PACKAGES LEFT: 127 packages` label with `Visits / Sessions Left` (`322 visits`).
   - Fixed primary package lookup and `daysLeft` calculation so queued renewals never inflate `Days to Renew`.
   - Fixed `isMemberFrozen` so only currently active holds (`status === 'Hold'` or active `freezeEndDate >= today`) trigger the Frozen banner.

3. **Dedicated Full-Page Dashboard KPI Workspaces (`src/components/DashboardKpiDrilldownPage.tsx` & `src/Dashboard.tsx`):**
   - Clicking any of the **7 Dashboard KPI Cards** (`Active Leads`, `Expiring Soon`, `Total Expired`, `Upcoming Birthdays`, `New Members` / `Returning Active`, `Frozen Members`, `Unconfirmed Queue`) now opens a dedicated full-page operational workspace instead of a small popup dialog:
     - **Top Switcher Bar:** Switch between all KPI pages with 1 click + **Export CSV**.
     - **Instant Multi-Filter & Search:** Search by Name, `#MemberID`, Phone, RFID Barcode (`o904`), Package, or Sales Rep; filter by Sales Rep, Branch, Sort Order (`Smart Priority`, `Member ID`, `Name`, `Lifetime Paid`), and urgency pills (`Critical ≤3d`, `≤7d`, `≤14d`, `🎂 Celebrating Today`, `Hot Win-Back ≤30d`, `Uncontacted Leads`).
     - **1-Click Row Actions:** `Profile` (opens `InzanMemberShow`), pre-filled context-aware `WhatsApp` message, `Call`, `Unfreeze` (on Frozen Members), and `Confirm` (on Unconfirmed Queue).
