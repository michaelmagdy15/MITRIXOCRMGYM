# Mitrixo GYM CRM — Full Codebase Review

**Date:** 2026-08-02
**Scope:** Frontend (`src/`), Backend (`server.ts`, `functions/`, `dist-server/`), Firebase config & rules, project hygiene/tooling.

---

## 🔴 Critical — Security

### 1. Cross-tenant data access via spoofable host headers (multi-tenant isolation broken)
- `server.ts:280-289` trusts client-supplied `x-original-host` / `x-forwarded-host` to pick the tenant DB.
- `requireAuth` (`server.ts:99-121`) only verifies the ID token against the single shared Firebase Auth project — it never checks the caller belongs to the resolved tenant.
- All tenants share one Auth pool (configs spread `defaultFirebaseConfig`, `server.ts:132-153`).
- **Impact:** any authenticated user can send `x-forwarded-host: victim-gym.mitrixo.com` and read/write that gym's `clients`, `payments`, etc. via `/api/clients`, `/api/payments`, and every route in `sqlApi.ts`.
- **Fix:** derive tenant from a server-trusted source (validated Host header against a registry + verified tenant claim on the token) and enforce `users/{uid}` membership in the resolved tenant DB inside auth middleware.

### 2. SQL injection via dynamic column names
- `dbOperations.ts:1269-1282` (`updateClient`) and `dbOperations.ts:1385-1402` (`updateLocker`) interpolate user-controlled object keys directly into the SQL `SET` clause (`updates.push(\`${col} = $${i}\`)`) with no column allowlist.
- Reachable via `/api/clients/update-from-booking` (`sqlApi.ts:1318`) and `/api/lockers/update` (`sqlApi.ts:1390`) — the latter is **not** gated on tenant.
- **Fix:** whitelist TS→SQL column mappings (as `updateClientInSQL` already does) and reject unknown keys.

### 3. Unauthenticated data-mutating endpoints
- `/api/attendance/qr-checkin` (`server.ts:803-1062`): no auth, no rate limit; writes attendance, flips sessions to `Attended`, and decrements `sessionsRemaining`. Anyone with a member's ID/phone can burn sessions.
- `/api/self-reset-member-password` (`server.ts:1069-1162`): public; verifies only `memberId` + `phone` (guessable), then **changes the Firebase Auth email** to the attacker's address (`server.ts:1140`) and arms a reset — an account-takeover primitive.
- `/api/proxy-push` (`server.ts:1164-1187`): unauthenticated open relay to the Expo push API.
- **Fix:** authenticate QR check-in (shared reader secret or signed QR), require verified-email/OTP for self-reset and never change email in one shot, remove/authenticate the push proxy.

### 4. `x-audit-bypass` auth backdoor
- `server.ts:100-104`: any request with `x-audit-bypass: true` is fully authenticated when `NODE_ENV=development`.
- Documented in `package.json:14` and present in the shipped bundle (`dist-server/server.cjs`). Inert under the Dockerfile's `NODE_ENV=production` (`Dockerfile:47`), but one misconfigured env var exposes every endpoint.
- **Fix:** remove the bypass; use real test credentials.

### 5. Privilege escalation via weak default passwords & body-supplied roles
- Default reset password is the fixed `'12345678'` (`server.ts:605,638,729`, `functions/src/index.ts:54`, `src/utils/passwordStrength.ts:35`).
- `/api/tenant/reset-user-password` (`server.ts:636`) lets any `admin/manager` reset **any** user's password (including super_admin) to a known value.
- `/api/tenant/activate-user` (`server.ts:727-785`) writes `role` straight from the request body (`server.ts:771`) — a manager can mint a `super_admin` account.
- **Fix:** per-user random one-time tokens for resets; validate/restrict roles server-side against tier.

### 6. Committed credentials & user data
- `scripts/extract_database.js:8-9`: hardcoded third-party admin `username: 'mi5a'`, `password: '12345678'`.
- `test_firestore.js:60`: hardcoded real user password (`Miko0019_!`).
- Committed PII: `auth_export.json`, `users.json` (user emails/UIDs), `strike_crm_backup_2026-05-18.json` (client/CRM dump), `root.crt`.
- `.env` is correctly gitignored (`git ls-files` confirms never committed) — good. Keep it that way.
- **Fix:** scrub these from history; move creds to secrets/env.

### 7. Hardcoded admin allowlists + automatic role escalation (frontend)
- `App.tsx:64-65` (`QUOTE_GENERATOR_EMAILS`, `PLATFORM_ADMIN_EMAILS`), duplicated in `QuoteGenerator.tsx:6-9` and `AuthContext.tsx:126-138` (`OWNER_EMAILS`) and `:175-185` (`OWNER_EMAILS_NEW`) — the same 4-5 emails in 3 files.
- On every login `AuthContext.tsx:132-138` **auto-elevates** `michaelmitry13@gmail.com` to `crm_admin` and owner emails to `super_admin`, then **writes the role back to Firestore**.
- **Fix:** fixed, server-side/claims-based assignment (Firebase custom claims); remove the login-time role writes.

---

## 🔴 Critical — Firebase rules & config

### 8. `users` collection is world-readable (unauthenticated)
- `firestore.rules:359` and `firestore-tenant.rules:285` — `allow read: if true;`.
- **Impact:** anyone without an account can enumerate every user: emails, roles, `clientRecordId`, and `expoPushToken` (usable for push-notification spam to staff phones).

### 9. Tenant databases deploy the wrong rules
- `firestore-tenant.rules` (the intended tenant-safe ruleset) is **never referenced** in `firebase.json`.
- All five non-default DBs (`db-test`, `db-testrules`, `db-gyma`, `db-inzanathletics`, `db-registry-2`) deploy the monolith `firestore.rules` (`firebase.json:26-50`), which contains ATPL/Gamén/Matchmaking collections and hardcoded admin emails — so every tenant DB inherits cross-tenant God-mode.

### 10. Hardcoded admin emails = cross-tenant God mode
- `firestore.rules:31-38, 94, 107, 120` list 6 real email addresses that bypass role checks in **every** database (the tenant rules limit this to one email, `firestore-tenant.rules:34`, but are unused).
- Compromise of any of the 6 accounts = full admin/super-admin on all tenants. `isGamenAdmin` (`:190-193`) and `isAtplSuperAdmin` (`:171-173`) add more.

### 11. Write validation is largely missing — validators are dead code
- `isValidClient`, `isValidRole`, `isValidSession`, `isValidTarget`, `isValidAuditLog`, `isValidTask`, `isValidInteraction`, `isValidCoach`, `isValidPackage`, `paymentImmutableFieldsUnchanged` are **defined but never used** (`firestore.rules:228-312`, same in `firestore-tenant.rules:173-256`).
- Consequences:
  - `payments` create allows **any authenticated user** to create a payment for **any** clientId (`firestore.rules:380`, `firestore-tenant.rules:306`).
  - `clients` create (`firestore.rules:431`) and staff/admin writes (`:432-444`) accept arbitrary fields.
  - `users` create/update (`firestore.rules:360-361`) don't validate `role`, so any admin can create/promote a `super_admin` (role escalation).

### 12. Public exposure of operational secrets via settings
- `settings` allows unauthenticated read of `branding`, `features`, `storefront`, `branches` (`firestore.rules:394`, `firestore-tenant.rules:311`).
- `branding` is allowed to contain `kioskPin` and `dailyCheckinPin` (`isValidBranding`, `firestore.rules:203-207`) — those PINs are therefore readable by anyone.

### 13. Open write/create on sensitive collections
- `mail` create: `if true` (`firestore.rules:411`, tenant `:322`) — combined with the `clients/{clientId}` trigger that emails every rep (`functions/src/index.ts:192`), an unauthenticated attacker can trigger email spam.
- `counters` read/write by any authenticated user (`firestore.rules:514-516`, tenant `:408-410`) — sequence/ID counters can be clobbered.
- `bookingRequests` create `if true` (`:510`), `pendingAccounts`/`passwordResetRequests` create `if true` (`:562`, `:567`), `gamen_traffic` create `if true` (`:781`), `auditLogs` create by any auth (`:405`).

### 14. Duplicate `/payments` match blocks
- `firestore.rules:377-382` and `:454-457` both match `/payments/{paymentId}`; rules are OR-combined, so effectively any staff/admin (including `coach`/`sales` via `ismitrixogymcrmStaff`) can read and **update** payments, undermining the tighter `canmitrixogymcrmDeletePayments` gate. Remove the duplicate.

### 15. `match_messages` open to any authenticated user
- `firestore.rules:629-631` — `allow read, write: if isMatchAdmin() || isAuthenticated()` lets any signed-in user read/write **all** users' private messages. Also `match_favorites` (`:620-622`) and `atpl_testimonials` (`:700-703`).

### 16. `classes` updatable by any authenticated user; `packages`/`coaches` publicly readable
- `firestore.rules:484-488`, `:460`, `:465` (tenant rules use `isAuthenticated` instead, `:359-367`).

### 17. Storage rules
- `storage.rules:17-31` — `member_photos` and `branding` writable by **any authenticated user** (not owner/admin-scoped, only size+content-type checks). Any account can overwrite/delete other members' photos and the publicly displayed brand logos.
- `cors.json:3-5` opens the bucket to all origins/all methods (acceptable given rules, but unnecessarily broad).

### 18. Missing composite indexes
- `pointsTransactions (memberId, createdAt DESC)` — `src/services/pointsService.ts:175-176`
- `memberBadges (memberId, badgeId)` — `src/services/gamificationService.ts:199-200`
- `salesTransferLogs (clientId, createdAt DESC)` — `src/components/InzanMemberShow.tsx:161`
- `trainerTransferLogs (clientId, createdAt DESC)` — `src/components/InzanMemberShow.tsx:170`
- `pendingAccounts (email, status)` — `src/contexts/AuthContext.tsx:429,475`
- `passwordResetRequests (email, status)` — `src/contexts/AuthContext.tsx:519`
- `users (role, name)` — `src/contexts/AuthContext.tsx:351`
- `clients (status, stage)` — `src/hooks/useClients.ts:310-311`

---

## 🟠 High — Backend correctness & performance

### 19. No global error middleware; error messages leak internals
- Handlers echo raw `err.message` to clients (`server.ts:358,422,478`, `sqlApi.ts:39,62,…`) exposing DB/stack details.
- Express 4 doesn't auto-catch async rejections, so any missed `try/catch` crashes the request.
- **Fix:** centralized error handler returning a generic 500, logging details server-side.

### 20. `startServer()` has no rejection handler
- `server.ts:1280` calls the async `startServer()` without `.catch()`; a failure during startup (e.g. `await import("vite")`, `server.ts:1190`) becomes an unhandled rejection. Add `.catch()` plus `process.on('unhandledRejection')`.

### 21. Unbounded full-collection loads & in-memory caches
- `/api/clients` and `/api/payments` fetch entire collections and hold them in process Maps (`server.ts:88-96,337,405`) with a 30s TTL. Cloud Run is capped at 512MiB / 3 instances (`cloudbuild.yaml:25-27`) — many tenants or large collections OOMs the instance.
- No pagination on any list endpoint (`/api/leads`, `/api/attendance`, `/api/audit-logs`, `/api/sessions`, …).
- **Fix:** cursor-based pagination or Firestore live queries; move shared cache to Redis.

### 22. `rateLimitMap` never pruned
- `server.ts:34-47`: unbounded per-IP growth = slow memory leak.
- `req.ip` behind Cloud Run is the load balancer (no `trust proxy`), so the 5/hr limit in `server.ts:36` keys everyone to one bucket — ineffective per-user and globally exhausting after 5 requests.

### 23. QR check-in scans all history then filters in JS
- Firestore path fetches **all** attendance for a client (`server.ts:964-966`), all classes for the date (`server.ts:989-995`), then filters in JS; SQL path loads every attendance row for the client (`dbOperations.ts:1088-1104`).
- **Fix:** index `attendance(clientId, date)` and query the day's slice server-side.

### 24. `functions/` duplicates `server.ts`
- `forcePasswordReset` (`functions/src/index.ts:25-61`) duplicates `/api/tenant/reset-user-password` + `/api/admin/reset-password` (`server.ts:603-676`).
- `ADMIN_ROLES`/admin emails re-declared in `functions/src/index.ts:13-18`, `server.ts:31,655`, and both rules files.
- Nodemailer logic duplicated between `functions/src/utils/mailer.ts` and `provisioning.ts:407-463`.
- **Fix:** extract a shared package.

### 25. `functions/` dead/misconfigured code
- `smsService.ts` (with Twilio secrets) is never imported by `index.ts` — dead code + unused `twilio`/`uuid` deps (`functions/package.json:23-24`).
- `upgradeMemberPackage` (`functions/src/index.ts:64-103`) is an **unauthenticated** `onRequest` stub that validates but never performs an upgrade. Implement with `onCall` + admin check or remove.
- Functions project itself is configured correctly (tsc → `lib/`, `functions/package.json:5-11`, `firebase.json:2-15`), `firebase-admin@12` vs root `@13` is a minor drift.

### 26. Silently broken auth path in `/api/settings`
- `sqlApi.ts:741` dynamic-imports `./firebaseAdmin`, which does **not exist** in `src/db/`. The `catch` swallows it, so the token is never verified and `commission`/`sales-target` settings are always stripped — even for admins.
- **Fix:** implement the per-tenant auth helper or remove the branch.

### 27. Env/SSL config issues
- `provisioning.ts:54-55` mutates `process.env.GOOGLE_CLOUD_PROJECT`/`GCP_PROJECT` at import time (global side effect).
- `db.ts:24,35,40`: falls back to `rejectUnauthorized: false` when the CA cert is missing — silently disables TLS verification for the Inzan DB in production.
- Magic strings duplicated: `'inzanathletics'` special-cased in `server.ts:331,399,815` and ~10 places in `sqlApi.ts`; reserved-subdomain sets duplicated in `server.ts:22-26` vs `provisioning.ts:11-16` (drift risk).
- Missing env validation: if `SMTP_*` is unset, `provisioning.ts:414-424` logs the temporary password to stdout instead of emailing it.
- No CORS config on the Express server while Cloud Run deploys `--allow-unauthenticated` (`cloudbuild.yaml:23`) — endpoints are internet-reachable and rely solely on app-level auth.
- `metaWebhook` secret comparison uses `!==` (`functions/src/index.ts:131`) rather than a constant-time compare.

---

## 🟠 High — Frontend architecture & correctness

### 28. Massive single-file components (no decomposition)
- `src/Clients.tsx` — **3,648 lines**, one `Clients()` component that also mounts `ImportData`, `ImportHistory`, `RenewalPipeline`, `ResyncAssignments`, `ResyncPayments`, and a 1,045-line `InzanMemberShow` (Clients.tsx:23-37, 1477-1886).
- `src/Payments.tsx` — 2,046; `src/Dashboard.tsx` — 1,748; `src/Leads.tsx` — 1,708; `src/member/GuestPortal.tsx` — 1,708; `src/App.tsx` — 1,360; `src/Settings.tsx` — 1,311; `src/AdvancedReports.tsx` — 1,380; `src/SuperAdminHub.tsx` — 1,108; `src/Calendar.tsx` — 1,099.
- These are render-all-in-one "mega-views" (grids, dialogs, drawers, inline `fetch`, alerts all in one file). Hard to test, merge-prone, and every state update re-renders the whole page.

### 29. Duplicated/parallel data layers
- **Two competing "CRM" providers:** live `src/context.tsx` (AppProvider, 695 lines) vs `src/contexts/CRMContext.tsx` (505 lines). `CRMContext`/`useCRMData` is **never imported anywhere** — dead code, but duplicates client/payment/task/package/importBatch subscription + CRUD logic.
- **Two client CRUD implementations:** `src/hooks/useClients.ts` (1,052 lines, live) vs `src/services/clientService.ts` (343 lines). `clientService` only consumed by the dead `CRMContext`; both re-implement `generateMemberId`, `addClient`, `bulkAddClients`, `updateClient`, sibling-linking, etc. (compare useClients.ts:392-965 with clientService.ts:16-229).
- **Two wallet systems:** `pointsWallets`/`pointsTransactions` (`pointsService.ts`, also written by `transactionService.ts:257-295`) and `coinsWallets`/`coinsTransactions` (`gamificationService.ts`). Both power member rewards; `clientUpdate.points` (transactionService.ts:260) and wallet docs are inconsistent with one another.
- **Session-decrement logic written 3+ times:** `context.selfCheckIn` (context.tsx:515-538), `usePTSessions.ts:54-74`, `clientService.recordSessionAttendance` (clientService.ts:268-311).

### 30. Global-state bloat + no memoization → blanket re-renders
- `searchQuery`/`setSearchQuery` and `activeTab` live in AppContext (context.tsx:74-75, 607-612). Typing in the header search (App.tsx:1037-1038) re-renders every one of the **35 files consuming `useAppContext`** on each keystroke.
- **Zero `React.memo`/`memo()`** in the entire codebase (only 176 `useMemo`/`useCallback`), and no `React.lazy`/`Suspense`. The context `value` useMemo (context.tsx:586-680) keeps stable object identity, but consumers don't take advantage of it.

### 31. Dead code & stubs shipped in the app
- `src/contexts/CRMContext.tsx` (505 lines) — unused.
- `src/components/dashboard/` (`ConversionFunnel.tsx`, `KPICard.tsx`, `RevenueChart.tsx`) — nothing imports them (`Reports.tsx` defines its own local `KPICard` at Reports.tsx:30).
- No-op stubs exposed as real APIs: `recalculateAllPackages` (usePackages.ts:91), `importBackup` (CRMContext.tsx:402), `refreshUserData` & `updateBranding` (AuthContext.tsx:336-337) — but callers (e.g. Clients.tsx) still invoke them expecting behavior.
- `src/db/migrate-to-cockroach.ts` (987 lines) and `fixMigration.ts` — one-off scripts living in `src/` (they get type-checked with the app and inflate the lint surface).

### 32. Full-collection real-time subscriptions & polling
- Unfiltered `onSnapshot` of entire collections: `payments` (usePayments.ts:58), `sessions` (usePTSessions.ts:22), `classes` from the public storefront (GuestPortal.tsx:230-245), and six collections in the dead CRMContext (CRMContext.tsx:185-245).
- Background polling in providers: `/api/users` every 15s (AuthContext.tsx:305) and `/api/settings` every 30s (SettingsContext.tsx:227) — plus a presence write every 2 min (AuthContext.tsx:255). Three global timers regardless of active tab.

### 33. Inconsistent error handling
- `CRMContext.fetchAllData` fires 8 `fetch().then().then()` chains with no per-request error handling (CRMContext.tsx:113-171).
- `SettingsContext.fetchSettings` does `response.json()` without checking `res.ok` (SettingsContext.tsx:181-183).
- `handleFirestoreError` only `console.error`s — no user-visible feedback path (errorHandler.ts:52).
- Many catches silently swallow (e.g. SettingsContext.tsx:206-209); others `console.error` then continue, leaving the user with no indication a save failed.

### 34. `any` + type-unsafe spots
- 517 `as any`/`: any` occurrences in `src`. Notable: `{ ...currentUser, role: effectiveRole as any }` (context.tsx:587), `const updateData: any = {}` (context.tsx:519), `client: any` (useClients.ts:63), and pervasive `(window as any).expoPushToken` (App.tsx:163,172).

### 35. Duplicated business logic
- Member-category inference duplicated: `getMemberCategory` (Clients.tsx:77-86) vs inline `inferredCategory` (transactionService.ts:207-221).
- PT/Group package classification duplicated: Dashboard.tsx:48-58 (`isPrivatePackage`/`isGroupPackage`) vs UserPerformanceDialog.tsx:39-45, vs inline includes in context.tsx:371-372 / CRMContext.tsx:127-130 / CommissionReport.tsx:135.
- ~170-line animated-splash block duplicated verbatim between App.tsx:371-539 and SettingsContext.tsx:338-521, including `<style>{keyframes…}</style>` injected inline (also App.tsx:1119-1125).

### 36. i18n gaps
- Nav labels hardcoded in English: `'Bookings'` (App.tsx:651), `'Premium Reports'` (:708), `'Call Center'` (:714), `'Lost & Found'` (:720), `'Complaints'` (:726), plus "Preview Role" etc. — not routed through `t()`, so `ar.json` won't translate them.

### 37. Data-fetching inconsistencies
- Inconsistent layers: `useClients`/`usePayments` use Firestore `onSnapshot` for non-inzan tenants but `/api/*` for `inzanathletics`; `usePackages`/`useTasks` use `/api/*` for **all** tenants (usePackages.ts:13-28); `usePTSessions` uses Firestore for **all** tenants (never checks `getTenantId()`), so the inzan tenant mixes SQL clients with Firestore sessions.
- No abort/race guard on `CRMContext` fetches and `useClients` inzan `loadCache` (useClients.ts:151-193) overlapping `refetchData` (useClients.ts:231-263) — two concurrent `/api/clients` fetches on mount.

### 38. Real correctness risks
- `getMemberEmail` produces `@{tenantId}.mitrixo-member.local` (firebase.ts:62-65) but the synthetic-email check is `endsWith('@mitrixogymcrm-member.local')` (AuthContext.tsx:541) — member password reset will treat non-default tenants as a real email and call `sendPasswordReset` on a dead domain.
- `creditCoins`/`updateStreak` do read-then-write without a transaction (gamificationService.ts:251-275, 287-318) → lost updates on concurrent check-ins.
- `generateMemberId` falls back to a **random number** on failure (useClients.ts:405-408) — duplicate/non-sequential member IDs, silently.
- `pushService.notifyAdmins` calls `exp.host` directly (pushService.ts:112) while all other sends go through `/api/proxy-push` — inconsistent, and bypasses the server proxy (CORS/secret handling).
- `useClients` logs every search-results request via `getDocs` debounce but never caps the on-demand search other than `limit(30)` on name (useClients.ts:329-375).
- `registerFreeUser` scans the entire `clients` collection to compute the next `MEM-####` ID (AuthContext.tsx:714-721) — slow and race-prone for growing tenants.

---

## 🟡 Low — Hygiene, tooling, dependencies

### 39. Repo bloat — ~151 MB of junk tracked in git
- `auth_export.json` (8 KB) and `users.json` (8 KB) — identical, real user emails/UIDs (see #6).
- `logs.json` (152 KB), `runs.json` (0 B, empty), `catalog_files.txt`, `scratch_sample_clients.json` (51 KB).
- `strike_crm_backup_2026-05-18.json` (111 KB) — DB backup committed.
- `backup-station.html`, `export_docs.html`, `strike-crm-guide-v2.1.html` (212 KB — byte-identical duplicate of `public/help-guide.html`).
- `deploy.bat - Shortcut.lnk` / `(2).lnk` — Windows shortcuts.
- `redgits-scraper-extension/`, `screenshots/` (100+ PNGs), `apple-iphone-15-black-mockup/` (~30 MB), `src/graphify-out/` (incl. 667 KB `graph.json`), `reports/lighthouse-report.html` (1.4 MB), `docs/redgits_pages/` (6.7 MB + 5.5 MB + 2.5 MB JSON).
- Empty leftover dirs: `strike quote generator/`, root `graphify-out/`.
- **Recommendation:** `git rm -r --cached` on all above, add to `.gitignore`, and (for `auth_export.json`/`users.json`) rewrite history since they're already pushed.

### 40. `.gitignore` defects
- Line 10 is corrupted: `" . g e m i n i /  "` (spaces between every char) — `.gemini/` would not be ignored.
- Missing: `*.pdf`, `*.lnk`, `auth_export.json`, `users.json`, `logs.json`, `runs.json`, `catalog_files.txt`, `screenshots/`, `graphify-out/`, `docs/redgits_pages/`, `apple-iphone-15-black-mockup/`, `reports/`, `scratch_sample_clients.json`, `*.html` backup dumps.
- Good news: `.env`, `dist/`, `dist-server/`, `node_modules/` are correctly ignored and not tracked.

### 41. Scripts (`package.json`)
- **`clean`: `rm -rf dist`** — broken on Windows (`rm` not found in cmd/PowerShell). Use `node -e "fs.rmSync('dist',{recursive:true,force:true})"` or `rimraf`.
- **Dev-port mismatch:** `server.ts:302` defaults to `PORT=8080` (matches `vite.config.ts` proxy), but `.env` sets `PORT=3000` and `server.ts` loads it via `import 'dotenv/config'` — so `npm run dev-server` listens on 3000 while Vite proxies `/api` to 8080. Broken local dev unless env overridden.
- `lint` (`tsc --noEmit`) works and is clean. `build`, `start`, `audit:*` look sane. No `test`/`e2e`/`typecheck` scripts (playwright has no wired-up runner).

### 42. Dependency hygiene
- **`npm audit` (prod + transitive): 32 vulns — 1 critical (`websocket-driver`), 13 high.** Notable: `react-router` ≤8.2.0 (unauth RCE, high), `protobufjs`, `postcss`, `vite` ≤6.4.2, `esbuild` ≤0.28.0, `brace-expansion`. Most flow through `firebase-admin`/`google-gax`. Run `npm audit fix`; upgrade `react-router-dom` (7.14.1→patched) and `vite` explicitly.
- **Misplaced deps:** `playwright`, `@vitejs/plugin-react`, `shadcn` (a CLI), `@google/genai` belong in `devDependencies`. `playwright` is duplicated with `@playwright/test` in devDeps.
- `lucide-react ^0.546.0` resolves to 0.546.0 with **no** compromised `lucide` dependency present — OK, no action.
- `firebase` + `firebase-admin` both in `dependencies` is expected for this hybrid client/server app; just avoid importing the client SDK server-side.

### 43. Documentation (stale/contradictory)
- **`README.md`** is the stock AI Studio/Netlify template (Netlify, `GEMINI_API_KEY`, ai.studio URL) — contradicts the real deployment (Cloud Run / `gcloud builds submit`).
- **`MEMORIES.md`** says version 1.1.0/build 11; actual `mobile/app.json` is 1.12.0/build 15 — stale.
- `PROGRESS_SUMMARY.md` + `PROGRESS_SUMMARY_v2.md` duplicate each other (April 2026, historical — safe to archive or delete).
- `COST_OPTIMIZATION_LOG.md` is **untracked** (uncommitted); commit it. Minor contradiction: it says remaining Cloud Run services set to max=1, but `cloudbuild.yaml` (also uncommitted) sets `--max-instances=3`.
- Doc sprawl: `strike-crm-guide-v2.1.html`, `help-guide.html` (dupes), `sales-team-guide-v2.1.md` (75 KB), `handover_docs/*`, `db-audit-report.md`, `multi_tenant_blueprint.md`, two Arabic-named `.md` guides — no index/source-of-truth.
- `task.md` checklist is fully checked (done); consider archiving.

### 44. CI/CD
- Only `.github/workflows/eas-build.yml` (mobile EAS) — **no CI for lint/typecheck/build of the web app**.
- `netlify.toml` + `cloudbuild.yaml` both exist; actual deploy is Cloud Run. Remove/keep Netlify config to avoid ambiguity.
- `deploy.bat` does `git add .` — will sweep all junk above into commits. Also hardcodes an absolute path.
- `cloudbuild.yaml` has an uncommitted diff (cost-optimization step). The image-cleanup step (`grep -v "latest"` then delete) also deletes any tagged (non-`latest`) image including in-flight tags — use retention via Artifact Registry lifecycle policies instead.

### 45. Config sanity (tsconfig/vite)
- `tsconfig.json` is reasonable; `tsc --noEmit` passes. `allowJs: true` is unnecessary. `exclude` list is fine (functions/dist/dist-server/scratch).
- `vite.config.ts` is fine; the PWA `selfDestroying: true` + `manualChunks` split is sensible.
- `firebase.json` has no `hosting` section → no SPA rewrites at all if Firebase Hosting is used. Functions config (`firebase.json:2-16`) lacks runtime/region/concurrency (node 20 is pinned in `functions/package.json:16`, good). `sync-rules.cjs` predeploy runs only for the `(default)` DB (`firebase.json:22-24`), not the tenant DBs.
- `firebase-applet-config.json` has a real project `apiKey`/`appId` — Firebase web keys are public-by-design, but it points to test project `faa-test-guide-v2`, which is also the `.firebaserc` default. Confirm deploys actually target the production project.
- `root.crt` is public ISRG root certs (not a secret).

### 46. Frontend cleanup
- No code splitting: all 30+ pages statically imported in App.tsx; `chunkSizeWarningLimit` raised to 3000 KB (vite.config.ts:76) to silence the large-chunk warning.
- `console.log`/`alert` — 195 occurrences (mostly `src/db/` migration scripts). `pushService.ts:34,42` logs full Expo push tokens to the console (token leakage).
- `App.tsx:122-146` re-implements search filtering already done in `context.visibleClients` (context.tsx:337-352).
- `alert()` used for portal-account default password (`Clients.tsx:2330`).
- `registerFreeUser` scans the entire `clients` collection to compute the next `MEM-####` ID (AuthContext.tsx:714-721) — slow and race-prone for growing tenants.

---

## ✅ Top 10 fixes (highest leverage, in order)

1. **Purge secrets from git history** — remove `auth_export.json`, `users.json`, `strike_crm_backup_2026-05-18.json`, `root.crt`, hardcoded passwords in `scripts/extract_database.js` and `test_firestore.js`.
2. **Deploy `firestore-tenant.rules` to tenant DBs + close `users` read** and drop hardcoded admin emails from `firestore.rules`.
3. **Whitelist SQL columns** in `updateClient`/`updateLocker` (`dbOperations.ts`) to kill the SQL injection.
4. **Bind auth to the resolved tenant** in `requireAuth` and validate host headers (fixes cross-tenant access).
5. **Remove the `x-audit-bypass` path** entirely.
6. **Authenticate/rate-limit** the QR-checkin, self-reset, and push-proxy endpoints; never change Firebase email in one shot.
7. **Add a global error handler + pagination** on `/api/clients` and `/api/payments`; prune `rateLimitMap`.
8. **Delete dead code:** `contexts/CRMContext.tsx`, `services/clientService.ts`, `components/dashboard/`, no-op stubs — removes ~1,000+ lines of duplicated logic.
9. **Split the mega-views** — extract grids/dialogs/drawers from `Clients.tsx`/`Payments.tsx`/`Leads.tsx` into focused components.
10. **Frontend perf:** pull `searchQuery`/`activeTab` out of AppContext, add `React.memo` to leaf-heavy tables, add `React.lazy` per tab, and fix the PORT/dev-server mismatch.

**Also quick wins:** fix `.gitignore` line 10 + add missing entries, replace `clean` script with a cross-platform version, run `npm audit fix` / upgrade `react-router-dom` & `vite`, and rewrite the stale `README.md`.
