# Future Updates & Reverted Changes

This document lists the features and code changes introduced after the stable commit `906e42e5cf55abd25b9ab7f28c6570b60ed37c22` that caused system instability and compilation errors. These have been reverted so the platform is in a stable, working state. 

You can refer to [future_updates.diff](file:///c:/Users/Mi5a/mitrixogymcrm-boxing-crm2/future_updates.diff) in the root of the project to view the exact code diff of all reverted modifications.

---

## 1. Summary of Reverted Commits

### Commit 1: `345c7c4`
* **Message**: `feat: add Users management page and update Firestore security rules to include new roles and authorized users`
* **What broke**:
  1. **Syntax / JSX Crash**: `src/Users.tsx` was committed in a broken state, missing a matching closing tag for a `<div>` around line 203. This syntax error completely broke the Vite compilation process, rendering the entire CRM web application inaccessible (white screen of death / overlay error).
  2. **Admin Permission Mismatches**: The Firestore security rules changes added new roles but locked out the primary `'admin'` role from crucial operations like viewing dashboard targets, settings, and reading payments, which broke client-side queries.

### Commit 2: `6f1f488`
* **Message**: `feat: implement comprehensive dashboard with sales performance tracking, filtering, and reporting features`
* **What broke**:
  * Added complex client-side calculations, Recharts dashboard visualizations, and user performance filters. Because it relied on permission-restricted collections (`payments` and `targets`), it displayed `0s` and threw security rule violations when logged in as an `admin`.

---

## 2. Affected Files & Details

Below is the list of key files that were modified:

### 🔐 Firestore Rules & Backend
* **`firestore.rules`**: Unified rules file for mitrixogymcrm, Matchmaking CRM, ATPL Vector, and GamenEG Brand. Modified roles checks for `canmitrixogymcrmViewGlobalDashboard`, `canmitrixogymcrmAccessSettings`, and `canmitrixogymcrmDeletePayments`.
* **`sync-rules.cjs`**: Rules synchronization script used in predeploy.

### 💻 Frontend Source Files
* **`src/Users.tsx`**: Contains the code for managing gym staff, setting sales targets, and managing permissions (broken due to tag mismatch).
* **`src/Dashboard.tsx`**: Displays Recharts figures (Total Payments, Active Leads, Expiring Soon, Leaderboard).
* **`src/Clients.tsx` / `src/Coaches.tsx` / `src/Leads.tsx`**: UI changes for member tables, Pt session bookings, and filters.
* **`src/context.tsx`**: Client-side visibility filtering logic.

---

## 3. How to Restore or Re-implement
If you want to re-apply these changes in a cleaner way:
1. **Apply the diff**: Refer to `future_updates.diff` to see the structure.
2. **Fix `src/Users.tsx`**: Ensure the JSX layout tags are properly balanced and closed.
3. **Fix Firestore Rules Roles**: Ensure the `'admin'` role has full permission matches on the rules level to prevent `0` revenue displays.
