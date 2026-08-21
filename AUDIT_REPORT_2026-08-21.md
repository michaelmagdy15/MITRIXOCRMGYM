# MitrixoGYM CRM — Full Platform Audit Report

**Date:** 2026-08-21
**Baseline:** `npm run lint` ✅ (fixed stray brace in `useClients.ts:555` this session) · `npm run build` ✅
**Scope:** server.ts, sqlApi.ts, provisioning.ts, firestore.rules, firestore-tenant.rules, all frontend hooks/services/contexts, dead-code & config scan.

---

## Summary

| Severity | Count |
|---|---|
| CRITICAL | 9 |
| HIGH | 14 |
| MEDIUM | 20 |
| LOW | 21 |
| **Total** | **64** |

The most dangerous class of bug is **privilege escalation / auth bypass on API routes** (several `requireAuth`-only routes with no role check, plus public unauthenticated write endpoints) and **cross-tenant isolation gaps** (host-header trust + default-DB fallback). These are fix-forward items — do not ship user features on top of them.

---

# CRITICAL (9)

### C-1. [sqlApi.ts:559,575,591] `/api/users/*` write routes have no role check — privilege escalation
- **What:** `POST /api/users/add`, `/update`, `/delete` only call `requireAuth` (verifies membership, not role). Any authenticated member can write/update/delete any user doc, including setting `role: 'super_admin'` on themselves.
- **Impact:** Full account takeover / admin escalation by any member.
- **Fix:** Gate with `ADMIN_ROLES` check (like `/api/tenant/*` routes in server.ts).

### C-2. [sqlApi.ts:723] `/api/settings/update` has no role check
- **What:** Any authenticated member can `set()` any settings doc (branding, features, subscription, commission).
- **Impact:** Billing bypass, feature unlock, brand hijack.
- **Fix:** Staff/admin role gate.

### C-3. [server.ts:971–1064] Public account-takeover via `/api/self-reset-member-password`
- **What:** Public (no auth) endpoint verifies `memberId + phone` against the **default DB only**, then calls `admin.auth().updateUser(uid, { email: attackerEmail })` — swapping the global Auth email, then returning success so the client fires a password reset to the attacker's email.
- **Impact:** Full account takeover using obtainable PII (memberId + phone). Also breaks multi-tenancy (only checks default DB; Auth is global).
- **Fix:** Require auth OR a signed reset token; never change email without verified ownership; use `getDbForRequest`.

### C-4. [server.ts:112–138] Cross-tenant auth bypass — membership check skipped for unresolvable hosts
- **What:** `requireAuth` only enforces tenant membership `if (resolvedTenantId)`. Unknown hosts fall back to `defaultFirebaseConfig` (status `not_found`) → `tenantId === undefined` → membership check skipped.
- **Impact:** Any authenticated user can spoof `x-original-host` to an unknown hostname, resolve to the default DB, and read/write with no membership check. Violates AGENTS.md non-negotiable #3.
- **Fix:** Deny requests from unresolvable hosts; never fall back to default DB for authenticated routes.

### C-5. [server.ts:813–964] Public unauthenticated write endpoint `/api/attendance/qr-checkin`
- **What:** No `requireAuth`, no rate limit. Accepts qrData, writes attendance doc, decrements `sessionsRemaining`, marks PT sessions attended, writes audit log.
- **Impact:** Attacker can enumerate member IDs → fake check-ins → drain members' remaining sessions to 0 → spam audit logs.
- **Fix:** Require auth or a signed QR token + rate limit.

### C-6. [firestore.rules:336-339,641-647,679-681] Duplicate `payments` match block defeats ownership rules
- **What:** `payments` matched twice; Block B adds `allow read, create, update: if isStaff()`. Firestore unions overlapping blocks → least-restrictive wins. Per-rep ownership + `isValidPaymentCreate` validator in Block A are dead.
- **Impact:** Every staff member (incl. sales reps) can read ALL payments; payment fabrication bypasses validator.
- **Fix:** Remove the duplicate broad `payments` block in `firestore.rules` (tenant file is correct).

### C-7. [firestore.rules:679-681] `match_messages` — any authenticated user can read/write ALL messages
- **What:** `allow read, write: if isMatchAdmin() || isAuthenticated()` — no recipient/owner check.
- **Impact:** Private matchmaking correspondence exposed/mutable by any signed-in user.
- **Fix:** Scope to sender/recipient ownership.

### C-8. [firestore.rules:554, firestore-tenant.rules:448] `counters` — any authenticated user has full read+write
- **What:** `allow read, write: if isAuthenticated()` — no role/field restriction.
- **Impact:** Any client can overwrite ID-generation counters → poison/collide IDs, forge counts, DoS create flows.
- **Fix:** Staff-only write; read-only for authed users.

### C-9. [clientService.ts:203-219] Forbidden legacy `fetch('/api/clients/delete-multiple')` for inzanathletics survived refactor
- **What:** `deleteMultipleClients` branches on `getTenantId() === 'inzanathletics'` and calls `fetch('/api/clients/delete-multiple')`.
- **Impact:** Violates AGENTS.md Landmine rule (all tenants must use direct Firestore SDK); feature may break + isolation risk.
- **Fix:** Remove the tenant branch; use `writeBatch` for all tenants.

---

# HIGH (14)

### H-1. [sqlApi.ts:1403] `self-checkin` crashes — `brandingSnap.exists()` called as a function
- **What:** firebase-admin `DocumentSnapshot.exists` is a **property**, not a method. `brandingSnap.exists()` throws `TypeError`.
- **Impact:** `/api/attendance/self-checkin` returns 500 for every tenant with a branding doc. Self-checkin completely broken.
- **Fix:** `brandingSnap.exists` (no parens). Compare correct usage server.ts:829.

### H-2. [sqlApi.ts:742–755] `GET /api/user-targets` returns `undefined` — never fetches from Firestore
- **What:** `let userTargets;` declared, never assigned, no Firestore read. Returns `{ userTargets: undefined }`.
- **Impact:** User-targets feature is dead. Matches AGENTS.md landmine pattern.
- **Fix:** Actually query `db.collection('userTargets')`.

### H-3. [sqlApi.ts:37,99,117] `/api/clients/add`, `/delete`, `/delete-multiple` — no role check
- **What:** Any authenticated member can `set()` a client by arbitrary id (overwrite) or delete any/all clients.
- **Impact:** Member-level user can destroy/overwrite the tenant's entire client base.
- **Fix:** Staff/admin role gate.

### H-4. [sqlApi.ts:161,179,197] `/api/payments/add`, `/update`, `/delete` — no role check
- **What:** Any member can create/modify/delete payment records.
- **Impact:** Financial-data forgery; member can mark themselves paid.
- **Fix:** Staff/admin role gate.

### H-5. [sqlApi.ts:1391–1406] `self-checkin` PIN is optional — unauthenticated write path
- **What:** `if (dailyCheckinPin && pin !== dailyCheckinPin)` — if tenant has no pin set, guard vanishes. Endpoint is public.
- **Impact:** Anyone who knows a memberId/phone can record attendance + decrement sessions.
- **Fix:** Require PIN always, or require auth.

### H-6. [server.ts:727–744] `create-auth-user` returns cross-tenant uid without ownership check
- **What:** `getUserByEmail(email)` may find a user belonging to another tenant (Auth is a single global pool); returns that uid as success.
- **Impact:** Cross-tenant account linking; admin of tenant A gets uid of tenant B's user.
- **Fix:** Verify the existing user's `users` doc belongs to this tenant before returning uid.

### H-7. [sqlApi.ts:1256,1276] Public member/coach email-resolution endpoints — no rate limit
- **What:** `/api/member/resolve-email`, `/api/coach/resolve-email` are public, unrate-limited, return Auth email for memberId/coachId.
- **Impact:** Email enumeration / PII leak; reconnaissance aid for C-3 takeover + phishing.
- **Fix:** Add `isRateLimited(ip)` gate (the helper exists in server.ts but isn't applied here).

### H-8. [firestore.rules:380, tenant:306] `payments` create lacks ownership — payment fabrication
- **What:** `allow create: if isAuthenticated() && isValidPaymentCreate(...)`. Validator only checks field types, not that caller is staff or owns the client.
- **Impact:** Any client can forge a payment against any client + impersonate `sales_rep_id`.
- **Fix:** Gate create on staff role or `isOwnClientRecord(clientId)`.

### H-9. [firestore.rules:367,379 + tenant 293,305] Sales reps can `list` ALL targets/payments, not just their own
- **What:** `list` allowed for any `isSalesRep()`; only `get` is scoped to `sales_rep_id == uid`. List bypasses per-doc get restriction.
- **Impact:** Rep enumerates every other rep's targets/payments via collection query.
- **Fix:** Remove rep `list` or enforce ownership in query rules.

### H-10. [firestore.rules:428, tenant:399] `memberBadges` — clients self-award badges
- **What:** `allow create, update: if isAuthenticated() && isOwnClientRecord(memberId)` — no badgeId/count allowlist.
- **Impact:** Members fabricate achievements; chains into reward fraud.
- **Fix:** Staff-only create; client read only.

### H-11. [firestore.rules:410, tenant:381] `coinsTransactions` — clients mint their own coins
- **What:** `allow create: if isAuthenticated() && isOwnClientRecord(memberId)` — no staff gate, no schema check.
- **Impact:** Member writes coin credit to own wallet; loyalty currency fully client-controllable.
- **Fix:** Staff-only create.

### H-12. [firestore.rules:209-222, tenant:154-167] `isSafeUserSelfEdit` allows clearing `mustChangePassword` + changing `email`
- **What:** Allowed keys include `mustChangePassword` and `email`.
- **Impact:** Forced-credential-reset users self-clear the flag; email mutation corrupts audit/identity linkage.
- **Fix:** Remove `mustChangePassword` and `email` from self-edit allowlist.

### H-13. [errorHandler.ts:50-52] Write failures silently swallowed — UI reports success on Firestore failure
- **What:** `handleFirestoreError` only `console.error`s, explicitly does NOT throw. Used in catch of every write in useClients/useCoaches/usePayments.
- **Impact:** AGENTS.md §2 violation. Users get no error feedback; app appears to succeed while data never persisted. Compounds H-14.
- **Fix:** Re-throw or return an error result so callers can surface failure to UI.

### H-14. [useClients.ts:429-449, useCoaches.ts:58-83 & 111-135] Auth user created BEFORE Firestore write — orphaned accounts on failure
- **What:** `createPortalAccount`/`createFirebaseUser` runs before `batch.commit()`. If batch fails, Auth account + `/users` doc are orphaned (Auth can't roll back).
- **Impact:** Orphaned auth accounts accumulate; user can't retry (email/uid taken); Auth↔Firestore inconsistency.
- **Fix:** Write Firestore first, then create Auth user; or compensate with Auth user deletion in catch.

### H-15. [useCoaches.ts:63,117 + AuthContext.tsx:649] Coach synthetic emails not tenant-scoped — cross-tenant collision
- **What:** Coach email hardcoded `coach-<name>-<num>@mitrixogymcrm-coach.local` (no tenant). `getMemberEmail()` namespaces by tenant; coach equivalent does not.
- **Impact:** Two tenants with a coach "ahmed" → same Auth email → create fails or cross-tenant user attachment. Violates AGENTS.md §2.3.
- **Fix:** Namespace coach emails with `getTenantId()` like `getMemberEmail()` does.

---

# MEDIUM (20)

### M-1. [server.ts:313–322] `getRequestHostname` trusts `x-original-host`/`x-forwarded-host` (attacker-controllable)
- Engine for C-4. Even where membership check runs, attacker picks which tenant DB is queried. Strip/overwrite these headers at the proxy or reject if present from untrusted source.

### M-2. [server.ts:858 + sqlApi.ts:1476,1596,1698] Hardcoded "STRIKE branch" in shared error text
- Violates AGENTS.md §2.6. Replace with tenant branding `companyName`.

### M-3. [sqlApi.ts ~17 routes] Silent error swallowing — `catch(err){ res.status(500).json({error: err.message}) }` with no `console.error`
- Affects call-center, complaints, lost-and-found, calendar, bookings, club-operations. Violates AGENTS.md §2. Un-greppable for `[API]`.
- Fix: add `console.error('[API] ...', err)` before responding.

### M-4. [sqlApi.ts:1061–1107] No-op stub routes return `{ success: true }` without doing anything
- `GET /api/booking-requests` → `[]`; `POST /api/booking-requests/update-status`, `/api/clients/update-from-booking`, duplicate `/api/tasks/add` return success with no DB call. Silent data loss.

### M-5. [server.ts:630,663,696] Weak default password `'12345678'` echoed in API response
- Both reset endpoints reset to `12345678` and expose it in the message. Generate a random temp password or force in-app set.

### M-6. [server.ts:672,712,762] `getFirestore('(default)')` literal-string vs `getFirestore()` inconsistency
- Inline tenant reset/create/activate routes use literal `'(default)'` instead of no-arg `getFirestore()`. May not resolve to the actual default instance → breaks Strike tenant endpoints. `getDbForRequest` special-cases this; these don't.

### M-7. [server.ts:1072–1101] `/api/proxy-push` forwards arbitrary Expo push tokens with no ownership/tenant scoping
- Any authenticated user can push notifications (with deep-link `url`) to ANY Expo token, including other tenants' devices.
- Fix: Validate token belongs to caller's tenant/users doc.

### M-8. [server.ts:69] `requirePlatformAdmin` only checks `platform_admin`, not `super_admin` (contradicts comment)
- Either fix the code to admit both, or fix the comment.

### M-9. [provisioning.ts:54–55] Module-import side effect overwrites `GOOGLE_CLOUD_PROJECT`/`GCP_PROJECT` env
- Mutates global env at import time for the whole server process. Move into the provision function.

### M-10. [provisioning.ts:436] `sendWelcomeEmail` hardcodes `mitrixo.com` domain
- Tenants with custom domains get wrong portal URL in welcome email.

### M-11. [server.ts:31–44] Rate limiter is per-instance + map grows unbounded
- In-memory; on horizontal scaling effective limit = max × instances. Expired entries never pruned. Use a shared store (KV/Firestore) + cleanup interval.

### M-12. [server.ts:483–499] `/api/provision` does not validate `packageTier`
- Unknown tier silently defaults to `premium` in provisioning.ts. Validate against `starter|professional|premium`.

### M-13. [sqlApi.ts:1573,1674,1798] Booking/session endpoints have TOCTOU races
- Capacity/conflict checks then non-atomic writes; `sessionsRemaining` read-then-write outside a transaction. Double-booking / over-decrement possible.
- Fix: use `runTransaction`.

### M-14. [server.ts:800–802] `activate-user` lets admin delete arbitrary user docs via `pendingDocId`
- No verification that `pendingDocId` is actually a pending placeholder. Malicious admin deletes any user profile.
- Fix: Verify the doc is a pending placeholder before deleting.

### M-15. [sqlApi.ts:543–557] `GET /api/users` returns all users to any member — PII leak
- No role check; dumps entire `users` collection (emails, roles, names).
- Fix: Staff-only, or filter to own record for clients.

### M-16. [sqlApi.ts:779–799] `GET /api/audit-logs` returns all logs to any member
- No role check. Audit logs typically admin-only.
- Fix: Staff-only.

### M-17. [firestore.rules:350 vs tenant:276] DRIFT — `attendance` read world-readable to any authed user in root
- Root: `allow read: if isAuthenticated()` (any client reads ALL attendance). Tenant: correctly scoped to staff or own record.
- Fix: Reconcile root to tenant's stricter rule.

### M-18. [firestore.rules:503,508,513 vs tenant] DRIFT — `packages`/`coaches`/`coachSchedules` reads `if true` in root
- Public exposure of pricing + staff schedules on default (Strike) DB. Tenant requires auth.
- Fix: Reconcile to `isAuthenticated()`.

### M-19. [firestore.rules:442-444 vs tenant] DRIFT — `announcements` public read in root, absent in tenant
- Tenant portals can't read announcements (fall through to super-admin deny) OR root leaks publicly.
- Fix: Add `announcements` block to tenant file; align read rule.

### M-20. [firestore.rules:838-840 vs tenant:519-521] DRIFT — global super-admin set differs
- Root: 6 hardcoded emails + `crm_admin` role. Tenant: only `michaelmitry13@gmail.com`. A `crm_admin` has unrestricted write to every collection in the default DB but not in tenant DBs.
- Fix: Reconcile the god-mode surface area per a documented policy.

---

# FRONTEND MEDIUM (additional)

### F-1. [useClients.ts:568-601,693-710] Optimistic update applied before write; no rollback on commit failure
- `applyOptimisticUpdate()` runs before `batch.commit()`. If commit fails (swallowed per H-13), UI permanently shows un-persisted data (snapshot listener won't correct a write that never landed).
- Fix: Roll back optimistic state in catch.

### F-2. [useClients.ts:719-747] `deleteClient`/`deleteMultipleClients` leave orphaned `linkedClientIds` on siblings
- Deleted client's id stays in siblings' `linkedClientIds`; `linkedAccount` stays true. Dangling references.
- Fix: Update siblings in the batch.

### F-3. [useClients.ts:245-291] Search effect race condition — out-of-order results overwrite newer queries
- Debounce timer cleanup only `clearTimeout`; in-flight `getDocs` promises continue and `setSearchResults` runs after cleanup. No version/abort guard.
- Fix: Use an incrementing request-id flag.

### F-4. [MemberProfile.tsx:259-269] Family linking uses two separate `updateDoc` calls, not a batch
- Partial failure → one-directional link. Use `writeBatch`.

### F-5. [MemberProfile.tsx:124-143] Attendance query errors silently swallowed (`catch(() => {})`)
- AGENTS.md §2 violation. Empty catch.
- Fix: Log + surface.

### F-6. [MemberProfile.tsx:67-68] Form state initialized once from `client` prop; never resyncs
- No `useEffect` syncing `name`/`phone` when `client` prop changes → stale form after external updates.
- Fix: Add syncing effect.

### F-7. [usePayments.ts:35,60,83] `deletePayment` hard-deletes despite `deleted_at` soft-delete schema
- Listener filters `!p.deleted_at`; `addPayment` sets `deleted_at: null`; but delete calls `deleteDoc`. Inconsistent with intended soft-delete.
- Fix: `updateDoc({ deleted_at: new Date().toISOString() })`.

### F-8. [usePayments.ts:25] Role gate uses `currentUser.role` instead of `effectiveRole`
- Sibling hooks use `effectiveRole` from `useAuth()`. Inconsistent → incorrectly permissive/restrictive.
- Fix: Use `effectiveRole`.

### F-9. [useCoaches.ts:41-51] `generateCoachId` race condition — concurrent creation produces duplicate IDs
- Query max+1 with no transaction. Two concurrent `addCoach` → same `COACH-###` → email collision.
- Fix: Use `counters/coachIds` transaction (like `registerFreeUser`).

### F-10. [usePayments.ts:63-66] `addPayment` logs a phantom docId in the audit trail
- `doc(collection(...)).id` generates a throwaway id; `addDoc` creates a different id; audit logs the wrong one.
- Fix: Capture the real id from `addDoc` result ref.

---

# LOW (21)

- **L-1.** [sqlApi.ts:1097,1230] Duplicate route registrations (`/api/tasks/add`, `/api/audit-logs/add`) — dead but latent shadowing risk.
- **L-2.** [sqlApi.ts:315] `GET /api/packages` public (no auth) — may be intentional storefront; confirm.
- **L-3.** [sqlApi.ts:608–625] `GET /api/settings` swallows invalid token silently (no log).
- **L-4.** [provisioning.ts:15] Reserved-IDs set has duplicate `'test'` entry.
- **L-5.** [provisioning.ts:469–500] `awaitDatabaseReady` proceeds to seed after timeout.
- **L-6.** [provisioning.ts:293–297] `createUser` doesn't pre-check/catch `email-already-exists`.
- **L-7.** [server.ts:1142–1153] Production `index.html` cached once at startup (cache-busting script won't reload until restart).
- **L-8.** [sqlApi.ts:837] `call-center/add` uses `log.id` as doc id with no validation.
- **L-9.** [firestore.rules:525, tenant:425] `classes` read `if true` (public) — likely intentional; ensure no PII on docs.
- **L-10.** [firestore.rules:752] `atpl_testimonials` write `isAuthenticated()` — spam/fake-review vector.
- **L-11.** [firestore.rules:831] `gamen_traffic` create `if true` — writable spam surface.
- **L-12.** [firestore.rules:232-236, tenant:177-181] `isValidClient` validator defined but never used in `clients` create rule.
- **L-13.** [firestore.rules:755-758] `atpl_access_codes` `get` for any authed user — enumeration if ids guessable.
- **L-14.** [firestore.rules:384-391 vs tenant] DRIFT — `pointsWallets`/`pointsTransactions` exist in root, absent in tenant.
- **L-15.** [firestore.rules:454, tenant:322] `mail` create `if true` — unauthenticated email-trigger injection.
- **L-16.** [firestore.rules:548-552, tenant:442-446] `bookingRequests` create `if true` — booking spam/DoS.
- **L-17.** [firestore.rules:448, tenant:317] `auditLogs` create `isAuthenticated()` with no schema gate; `isValidAuditLog` defined but unreferenced → audit-tray pollution.
- **L-18.** [firestore.rules:396-400, tenant:367-371] `rewards` `claimed` increment has no ownership/eligibility check → reward farming.
- **L-19.** [functions/src/utils/mailer.ts:16-42] `getBranding()` reads only default DB + hardcoded STRIKE fallback → brand leakage to non-Strike tenants.
- **L-20.** [DC-4] Hardcoded `'inzanathletics'` literals in shared code (App.tsx, Clients.tsx, CRMContext.tsx, clientService.ts) — should be feature flags.
- **L-21.** [tsconfig.json:39-40] `noUnusedLocals`/`noUnusedParameters` disabled → lint won't catch dead code.

---

# DEAD CODE / CONFIG

- **DC-A.** [src/db/db.ts, dbOperations.ts, fixMigration.ts, migrate-to-cockroach.ts, schema.sql] Fully dead CockroachDB code. `pg` + `@types/pg` unused outside this cluster. **Delete files + remove `pg`/`@types/pg` from package.json.**
- **DC-B.** [server.ts:1182] Logs "CockroachDB has been removed" yet dead code remains.
- **DC-C.** [src/App.tsx:593-596] Dead `isSyncingData` block (hardcoded `false`).
- **DC-D.** [useClients.ts:185-187,554,789] `refetchData` empty stub (never returned); `invalidateServerCache` no-op but still called.
- **DC-E.** [server.ts:730,738,804,1054,652,695] `console.log` emits auth PII (emails + UIDs) in production.
- **DC-F.** [MemberClasses.tsx:41] Stray `console.log` in production UI.
- **DC-G.** ~94 `fetch('/api/…')` call sites remain across `src/` (useTasks, usePackages, useAttendance, useImportBatches, useUserTargets, CRMContext, AuthContext, SettingsContext, many page components). The recent refactor only touched useClients/useCoaches/usePayments — the rest still violate the AGENTS.md Landmine rule.

---

# Recommended Fix Order (by risk × leverage)

1. **C-1, C-2, H-3, H-4** — Add role checks to all `/api/users/*`, `/api/clients/*`, `/api/payments/*`, `/api/settings/*` write routes. (Single pattern, blocks the biggest escalation paths.)
2. **C-3** — Gate or remove public `/api/self-reset-member-password`; never change Auth email without verified ownership.
3. **C-4, M-1** — Harden host resolution; deny unresolvable hosts; stop default-DB fallback for authed routes.
4. **C-5, H-1, H-5** — Auth + fix `.exists` property + enforce PIN on all self-checkin paths.
5. **C-6, C-7, C-8, H-8..H-12, M-17..M-20** — Reconcile `firestore.rules` with `firestore-tenant.rules` (remove duplicate payments block, scope match_messages/counters/badges/coins, fix drift). One rules-deploy session.
6. **C-9** — Remove forbidden legacy `fetch` in clientService.ts.
7. **H-13, H-14, F-1..F-10** — Frontend error surfacing + atomicity + race fixes.
8. **H-15** — Namespace coach emails by tenant.
9. **DC-A** — Delete dead CockroachDB files + drop `pg` dep.
10. **DC-G** — Migrate remaining ~94 `fetch('/api/…')` sites to direct Firestore SDK (per AGENTS.md Landmine).

---

*Baseline fix applied this session: removed stray `}` at `src/hooks/useClients.ts:555` (leftover from the inzanathletics fetch-removal refactor) — restored `npm run lint` to green.*
