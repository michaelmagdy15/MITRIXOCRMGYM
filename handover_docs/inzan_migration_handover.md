# Inzan Athletics → Mitrixo CRM: Migration Handover (June 22, 2026)

This file captures the full context of the Inzan Athletics migration audit session.
Pick up from here in any new Antigravity session.

---

## 🎯 What This Is About

Inzan Athletics is a new gym client. They currently use **Redgits Egypt "Smart Operating System"** (inzan.redgits.com).
They want to migrate all their data into the **Mitrixo GYM CRM Platform**.

A full live audit of their CRM was completed. The findings are documented below.

---

## 🔐 Inzan CRM Access (for future reference)

- **URL:** https://inzan.redgits.com
- **Username:** mi5a
- **Password:** 12345678

---

## 📊 Inzan Data Scale

- ~30,000+ member records (member codes go up to ~31,000)
- 503+ unconfirmed membership entries
- Multiple active salespeople
- Currency: Egyptian Pounds (L.E.)

---

## ✅ What Mitrixo Already Handles (~85%)

These Inzan fields map directly to existing Mitrixo types with no changes:

| Inzan Field | Mitrixo Field |
|---|---|
| Full Name | `client.name` |
| Mobile | `client.phone` |
| Gender | `client.gender` |
| Date of Birth | `client.dateOfBirth` |
| SalesMan | `client.salesName` |
| Member Package | `client.packageType` |
| Package Status | `client.status` |
| Start Date | `client.startDate` |
| Branch | `client.branch` |
| Member ID | `client.memberId` |
| Amount / Paid / Remaining | `payment.amount` / `payment.amount_paid` |
| Payment Method | `payment.method` |
| Discount | `payment.discountValue` |
| Notes | `payment.notes` |

---

## ❌ What's Missing — MUST BUILD BEFORE MIGRATION

### 1. Schema Changes to `src/types.ts` (Client model)

Add these fields to the `Client` interface:

```typescript
// HIGH PRIORITY — Inzan required fields
nationalId?: string;          // Required in Inzan's "Add Member" form
email?: string;               // Add Member form field
backupPhone?: string;         // "Backup Mobile" field
isBlacklisted?: boolean;      // Seen in members list (Sales column shows "Black-List")

// MEDIUM PRIORITY
photoURL?: string;            // Member photo/image upload
advertisingSource?: string;   // "Come From" dropdown (Walk-in, Instagram, etc.)

// LOW PRIORITY
country?: string;
city?: string;
address?: string;
homePhone?: string;
nationality?: string;
jobTitle?: string;
guestSerial?: string;
civilianOrMilitary?: 'None' | 'Civilian' | 'Military';
referredByName?: string;      // "Ask For" field
```

Add to `ClientPackage` interface:

```typescript
subscriptionType?: 'new' | 'renew' | 'upgrade' | 'wrongentry';
isPendingConfirmation?: boolean;  // For unconfirmed memberships queue
```

Add to `Payment` interface:

```typescript
currency?: string;            // 'L.E.', 'USD', etc.
receiptSerial?: string;       // "Serial Number Receipt"
```

---

### 2. Debtors Module (HIGH PRIORITY — their most-used feature)

Build a **Debtors page** under Finance section. Query: members where `amount_paid < amount`.

**Columns to show:**
- Member Name, Member ID, Mobile, Sales Rep
- Start Date, Package Name
- Total (Active), Paid, Remaining
- Last Seen
- Quick "Pay" button (inline)

**Also needs:**
- Date range filter
- Export to CSV

---

### 3. Unconfirmed Memberships Queue (HIGH PRIORITY — 503 entries pending)

Build an **Unconfirmed Memberships** page under Finance section.

**Types to handle:** `new`, `renew`, `upgrade`, `wrongentry`

**Workflow:**
- Manager views queue
- Approves → sets `isPendingConfirmation = false`, activates package
- Rejects / flags as `wrongentry`

**Also needs:** Dashboard widget showing pending count

---

### 4. Frozen Members KPI on Dashboard (MEDIUM PRIORITY)

Inzan shows a "Freezing" count as a top-level dashboard widget.
Mitrixo has `isOnHold` on `ClientPackage` but no dashboard KPI or list view.

**Build:**
- Dashboard KPI card showing frozen member count
- Filtered list view of all frozen members

---

### 5. Update `ImportData.tsx` Field Aliases (HIGH PRIORITY for migration day)

Add new column header mappings to `ImportData.tsx` for Inzan's CSV export format:

```typescript
// Add to aliases in IMPORT_FIELDS:
nationalId: ['national id', 'national_id', 'nationalid', 'national'],
email: ['email', 'e-mail', 'email address'],
backupPhone: ['backup mobile', 'backup phone', 'secondary mobile'],
advertisingSource: ['come from', 'source', 'advertising source', 'ad source'],
isBlacklisted: ['blacklist', 'black list', 'black-list'],
```

---

## 📅 Recommended Implementation Timeline

| Phase | Tasks | Timeline |
|---|---|---|
| **Phase 1** | Schema changes to `types.ts` + `ImportData.tsx` aliases | Week 1 (Days 1–2) |
| **Phase 2** | Debtors Module | Week 1 (Days 3–5) |
| **Phase 3** | Unconfirmed Memberships Queue | Week 2 (Days 1–3) |
| **Phase 4** | Frozen Members KPI widget | Week 2 (Days 4–5) |
| **Phase 5** | Test CSV import with 100 records → Full migration | Week 3 |

**Total: ~2–3 weeks before migration day is safe.**

---

## 📁 Full Audit Report Location

The detailed audit report with screenshots is saved at:
`C:\Users\Mi5a\.gemini\antigravity-ide\brain\d3559d91-32ae-41ca-afbe-b3bc58532fe7\inzan_migration_audit_report.md`

Screenshots from the live Inzan CRM audit are in:
`C:\Users\Mi5a\.gemini\antigravity-ide\brain\d3559d91-32ae-41ca-afbe-b3bc58532fe7\`

Key screenshots:
- `add_member_form_filled_*.png` — Full member registration form fields
- `debtors_page_table_*.png` — Debtors module layout
- `subscription_detail_form_*.png` — Package subscription/upgrade form
- `members_search_table_*.png` — Members list columns
- `dashboard_page_*.png` — Dashboard KPIs
- `payment_invoice_form_*.png` — Pay Package form (receipt fields)

---

## 🔑 Key Files to Edit in Mitrixo Repo

| File | What to Change |
|---|---|
| `src/types.ts` | Add 12+ new fields to `Client`, `ClientPackage`, `Payment` interfaces |
| `src/ImportData.tsx` | Add field aliases for Inzan CSV headers (lines ~110-122) |
| New: `src/pages/Debtors.tsx` | Build debtors module |
| New: `src/pages/UnconfirmedMemberships.tsx` | Build unconfirmed queue |
| `src/components/Dashboard.tsx` | Add frozen members KPI widget |

---

*Handover saved: June 22, 2026 | Session: d3559d91-32ae-41ca-afbe-b3bc58532fe7*
