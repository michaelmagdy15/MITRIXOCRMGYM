# AGENTS.md — Operating Rules for AI Agents Working on MitrixoGYM CRM

**You are an AI agent contributing to MitrixoGYM**, a multi-tenant Firebase CRM platform for fitness gyms. Goal: comprehensive, reliable, tenant-isolated gym management. These rules are mandatory. Read [requirements.md](requirements.md) for *what* to build, this file for *how* to work. **You never need permission to proceed — §6 authorizes you to decide, act, and report.**

---

## 1. Ground Truth Documents (read order)

1. **requirements.md** — Feature IDs, statuses, release criteria. Source of truth for scope.
2. **GAPS.md** — Live status board + priority queue. Source of truth for *what's next*.
3. **TENANTS.md** — Tenant configuration, domains, Firestore databases. Read before provisioning or modifying tenants.
4. **WORKFLOW.md** — The daily loop. Follow it unless told otherwise.
5. **MASTER.md** — This file's parent. Start here.

**Conflict rule:** requirements.md wins on scope, GAPS.md wins on status, live verification wins over assumptions.

---

## 2. Non-Negotiables (violations = work rejected)

1. **Build clean:** `npm run build` → 0 errors. **Lint pass:** `npm run lint` → no errors.
2. **No swallowed errors, no silent failures on data paths.** A Firestore operation failure must be logged and surfaced, never silently ignored.
3. **Multi-tenant isolation is sacred:** tenant A never sees tenant B's data. Every query must be tenant-scoped via `getDbForRequest(req)` or equivalent.
4. **Firebase Firestore only:** never re-introduce CockroachDB or any other database. All data lives in Firestore per tenant.
5. **Authentication required:** all write operations require auth. Public endpoints must be explicitly documented.
6. **No hardcoded tenant names in shared code:** use `getTenantId()` or `getDbForRequest(req)` to get tenant context.
7. **One item per session** (WORKFLOW.md Phase 3). Bugs before features, always.
8. **Never commit:** `node_modules/`, secrets, `.env`, or files unrelated to your item.

---

## 3. Engineering Standards

### TypeScript / React
- Use existing project style; follow established patterns.
- Async/await for all Firestore and API operations.
- No `any` unless absolutely necessary.
- Component props typed properly.
- Error boundaries for critical UI sections.

### Firebase Firestore
- All Firestore operations use the tenant-scoped `getDbForRequest(req)` or `db` from firebase.ts.
- Security rules must enforce tenant isolation.
- Use `set()` with merge for upserts, `update()` for partial updates.
- Always handle errors on Firestore operations.

### API Routes (sqlApi.ts)
- All routes use `requireAuth` middleware for write operations.
- Tenant context derived from `getRequestHostname(req)` → `getTenantInfoForHost()`.
- Use `getDbForRequest(req)` to get the correct tenant's Firestore database.
- Log errors with `[API]` prefix for grep filtering.

### Multi-Tenancy
- `getTenantId()` returns the current tenant ID from hostname.
- `getDbForRequest(req)` returns the correct Firestore database for the tenant.
- Never assume a default tenant — always derive from request context.
- Branding/settings are per-tenant — no shared global settings.

---

## 4. Landmine List (known traps — never repeat)

| Trap | Detail |
|---|---|
| GET /api/settings returning empty | The endpoint was building an empty `settingsObj` without fetching from Firestore. Always verify endpoints actually read data. |
| Hardcoded "mitrixogymcrm" default | SettingsContext defaults to 'mitrixogymcrm' — this is intentional as fallback but tenant settings should override on load. |
| Tenant isolation via hostname | All data queries must use `getDbForRequest(req)` which derives database from hostname. Queries without tenant context = security vulnerability. |
| Logo URL not persisting | Logo uploads to Firebase Storage work, but URL was never saved because GET /api/settings didn't fetch existing settings. Fixed 2026-08-18. |
| CockroachDB dead code | db.ts and dbOperations.ts are now dead code. Do not import or use them. |
| Cross-tenant data leakage | Any query not using `getDbForRequest(req)` risks returning wrong tenant's data. Always audit query paths. |
| Default branding in mailer.ts | functions/src/utils/mailer.ts has hardcoded fallback to "mitrixogymcrm" → "STRIKE" logic. This is intentional branding fallback for emails. |
| Provisioning creates empty branding | provisioning.ts sets `logoUrl: ''` intentionally — tenant must upload their own logo. |
| Mobile WebView cache | App Store app caches `index.html` aggressively. Always include cache-busting script in index.html when deploying. User-Agent: `mitrixogymcrmCRM-Mobile`. |
| Mobile app URL per tenant | Use EAS build profiles: `production-strike` for Strike tenant, `production-strikeboxing` for STRIKE Boxing. Each loads from different subdomain. |

When you discover a new landmine, add it to this table (WORKFLOW.md Phase 6).

---

## 5. Session Protocol

Follow **WORKFLOW.md** phases: TRIAGE → VERIFY BASELINE → PICK ONE ITEM → EXECUTE → PROVE → RECORD → SHIP.

- **Baseline broken?** Your item is now "fix the baseline." Nothing ships on red.
- **Done means proven:** build passes, lint passes, manual smoke on affected features.
- **Commit:** one logical change, message references feature-id or Gap# (e.g. `Fix: branding settings load (Gap #1)`). Never amend a failed commit; fix forward.

---

## 6. Autonomy Rules — decide and proceed, never block

You are fully authorized to complete your item without asking permission. Do not stop, do not ask, do not wait for human input mid-session. When a situation is not covered by the docs, **pick the safe default from the table below, keep working, and record the decision** in the commit body (one line: `Decision: <what> because <why>`).

| Situation | Default decision (do not ask) |
|---|---|
| Multi-tenant isolation unclear | Apply strictest isolation — if it could be wrong tenant, it is wrong. Use `getDbForRequest(req)` for every query. |
| Ambiguity between documents | Apply the §1 Conflict rule; if still ambiguous, choose the option that keeps build green and breaks no tenant isolation. Record decision. |
| Schema/naming/UI choices | Match existing project conventions. Any reasonable choice beats stopping. |
| Tests failing at baseline | Your item becomes "fix the baseline" (WORKFLOW.md Phase 2). Fix, continue. |
| Would break multi-tenant isolation | Never proceed — tenant isolation is sacred. Redesign or record as critical gap. |

**Hard limits (the only things you may never decide alone — but still don't block; skip and record):** deleting production tenant data, publishing releases publicly, or legal/licensing commitments. If an item hits one, complete everything else, mark the remainder in GAPS.md, and list it in the end-of-session summary.

**End-of-session summary (replaces asking):** when done, report (1) item completed + proof, (2) any `Decision:` lines you logged, (3) anything skipped under hard limits. The human reads this *after* the work, not during.
