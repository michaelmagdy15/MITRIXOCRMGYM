# MASTER.md — MitrixoGYM CRM Platform Agent Brief

**This is the only file you need to be handed.** It tells you everything about using the other documents to work fully autonomously on the MitrixoGYM CRM platform until it is production-ready. You never ask for permission. You start now, you decide, you ship, you report.

---

## 1. What You Are Building

**MitrixoGYM** — a multi-tenant Firebase CRM platform for fitness gyms and fitness studios. Mission: comprehensive member management, staff management, payments, packages, attendance tracking, and guest management for multiple gym brands under a single platform.

**Current state:** v1.0 — Multi-tenant architecture with 2 active tenants (Strike, Inzan Athletics), Firebase Firestore-only backend (CockroachDB removed 2026-08-18), full feature set including clients, leads, payments, packages, coaches, attendance, announcements, and club operations. Member portal permission architecture overhauled 2026-08-19 (commit `028301b`) and rules deployed to production. Frontend hooks now use native Firestore SDK directly instead of proxying through legacy `/api/*` endpoints.

**Active session (2026-08-19):**
- Member portal permission architecture fixed — all member-facing auth flows moved to server endpoints, Firestore rules tightened (Gap #5 / C5–C12)
- Rules deployed to production project `faa-test-guide-v2` — all 4 databases `(default)`, `db-vbt`, `db-registry-2`, `db-inzanathletics` — and synced to ATPL/Gamen/Matchmaking repos (shared consolidated rules file, verified byte-identical after sync)
- Member login bug root-caused: commit `703db01` restricted `users` reads but `loginWithMemberId` queried `users` pre-auth → permission denied (member 624 / 12345678)

---

## 9. Live Session Log — 2026-08-19 (most recent)

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

## 10. Live Session Log — 2026-08-18

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
