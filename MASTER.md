# MASTER.md — MitrixoGYM CRM Platform Agent Brief

**This is the only file you need to be handed.** It tells you everything about using the other documents to work fully autonomously on the MitrixoGYM CRM platform until it is production-ready. You never ask for permission. You start now, you decide, you ship, you report.

---

## 1. What You Are Building

**MitrixoGYM** — a multi-tenant Firebase CRM platform for fitness gyms and fitness studios. Mission: comprehensive member management, staff management, payments, packages, attendance tracking, and guest management for multiple gym brands under a single platform.

**Current state:** v1.0 — Multi-tenant architecture with 2 active tenants (Strike, Inzan Athletics), Firebase Firestore-only backend (CockroachDB removed 2026-08-18), full feature set including clients, leads, payments, packages, coaches, attendance, announcements, and club operations.

**Active session (2026-08-18):**
- Branding/settings fix deployed — GET /api/settings now loads from Firestore correctly
- CockroachDB removed — all data now stored in Firebase Firestore per tenant database
- Second "Loading CRM Data" preloader disabled — only logo preloader remains

---

## 9. Live Session Log — 2026-08-18

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
1. Branding/settings end-to-end verification on deployed tenants
2. Logo upload flow smoke test

**P1 — Feature Polish**
3. Tenant isolation verification — confirm Strike data doesn't leak to Inzan Athletics
4. Performance audit — client list loading times
5. Mobile responsive audit for all pages

**P2 — Technical Debt**
6. Remove dead CockroachDB code (src/db/db.ts, src/db/dbOperations.ts)
7. Firestore security rules audit
8. TypeScript strict mode enablement

---

## 5. "Production Ready" — the exact definition of done

- [ ] All P0 and P1 items from GAPS.md are ✅
- [ ] Build 0 errors / 0 warnings; lint passes
- [ ] Tenant isolation verified — no data cross-contamination
- [ ] All features verified working on both Strike and Inzan Athletics tenants
- [ ] Firestore security rules reviewed and tested
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
