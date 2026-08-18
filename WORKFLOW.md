# WORKFLOW.md — MitrixoGYM CRM Daily Development Workflow

**Purpose:** A repeatable daily operating procedure for driving the MitrixoGYM CRM toward production-ready status using AI agents. Run this every day. Each pass must end with the repo greener than it started.

**Companions:** [requirements.md](requirements.md) (what to build, feature IDs) · [AGENTS.md](AGENTS.md) (agent rules) · [TENANTS.md](TENANTS.md) (tenant configuration) · [GAPS.md](GAPS.md) (live status board) · [MOBILE.md](MOBILE.md) (mobile app build & publish)

**Core loop, every day:**

```
TRIAGE → VERIFY BASELINE → PICK ONE WORK ITEM → EXECUTE → PROVE → RECORD → SHIP
   15 min      5 min            5 min           ~2-4 h      ~30 min    ~15 min   ~10 min
```

---

## Phase 1 — Triage (15 min)

1. **Check the boards:**
   - [GAPS.md](GAPS.md) "Updated Priority Order" — current P0/P1/P2 queue
   - GitHub issues (if open): bugs first, always
   - `git log --oneline -10` — what landed recently (avoid re-doing / conflicting)
2. **Pick today's track:**

| Track | Trigger | Focus |
|---|---|---|
| **BUG DAY** | Any open bug, user report, or regression | Fixes. Bugs always outrank features. |
| **FEATURE DAY** | Zero open bugs | Next P0/P1 from GAPS.md |
| **QUALITY DAY** | After every 2–3 feature days | Test coverage, lint fixes, docs truthfulness, refactor debt |
| **RELEASE DAY** | Milestone exit criteria met | Tag, notes, deployment verification |

3. **Write today's mission as one sentence** in the task/commit, e.g.:
   > "Fix branding settings load for multi-tenant setup (Gap #1)."

---

## Phase 2 — Verify Baseline (5 min, never skip)

```powershell
npm run build    # MUST be 0 errors
npm run lint     # MUST pass
```

- If baseline is broken, today's track becomes **BUG DAY** automatically. Fix first; add nothing.
- Record the passing state — it must be strictly better by end of day.

---

## Phase 3 — Pick One Work Item (5 min)

Rules:
- **One item per day.** Half-finished features are worse than missing features.
- Order within a track: bugs > P0 gaps > P1 > P2. Never invent new P0s; they come from GAPS.md only.
- Big items get **sliced**: day 1 = scaffold, day 2 = core logic, etc. Each slice ships green.
- If the item needs a decision the docs don't answer, apply the AGENTS.md §6 default-decision table, log `Decision: <what> because <why>` in the commit, and keep moving. Never block on a human.

---

## Phase 4 — Execute (~2–4 h)

Standard build sequence for any item:

1. **Read before writing** — the target file(s), related components, and the matching gap entry in GAPS.md.
2. **Test first where possible** — identify how to verify the fix works.
3. **Implement** — follow AGENTS.md rules (no swallowed errors, tenant isolation, async/await).
4. **Touching a multi-tenant feature?** The item is not done until tenant isolation is verified.
5. **Touching mobile-relevant features?** Check MOBILE.md — ensure WebView cache-busting works, mobile responsive layouts are preserved.

---

## Phase 5 — Prove (~30 min)

The item is NOT done until all of these pass:

1. **Build & lint:**
   ```powershell
   npm run build    # 0 errors
   npm run lint     # pass
   ```
2. **Manual smoke** (if UI changed): load the app, navigate to the affected feature, confirm it works and nothing else regressed.
3. **Tenant isolation check** (if data paths touched): verify queries use `getDbForRequest(req)` and no hardcoded tenant names.

---

## Phase 6 — Record (~15 min)

Update, in the same session:

- [ ] **GAPS.md** — move the item to "What's Built" (or shrink its gap entry), bump the date header.
- [ ] **requirements.md** — flip the feature status if it changed. Only claim what's proven.
- [ ] **TENANTS.md** — only if tenant configuration changed.
- [ ] **AGENTS.md** — only if a new landmine was discovered (add it to the pitfalls list so agents never repeat it).

---

## Phase 7 — Ship (~10 min)

```powershell
git status; git diff        # review: only intended files, no node_modules, no secrets
git add <intended files>
git commit -m "<feature-id or Gap#> <what changed>"
```

Commit message pattern: `Fix: branding settings load (Gap #1)` · `Feat: add new report type (FR-X)`

- One logical change per commit. Never mix features and unrelated refactors.
- Push to remote.

---

## Weekly Cadence (optional but recommended)

| Day | Default track |
|---|---|
| Mon | Triage + FEATURE (start the week's P0) |
| Tue | FEATURE (continue/slice) |
| Wed | FEATURE or BUG |
| Thu | QUALITY: lint, typecheck, docs audit |
| Fri | Bugs found during the week + GAPS.md re-sync |

---

## Autonomy Rules — never block, always ship something

You never need permission to proceed. When a situation isn't covered by the docs, take the safe default, log it, keep working:

| Situation | Default (do not ask) |
|---|---|
| Multi-tenant isolation unclear | Strictest isolation — use `getDbForRequest(req)` for every query. |
| Implementation choice undocumented | Match existing conventions. |
| Would break tenant isolation | Redesign; never proceed if data could leak. |
| Baseline broken | Today becomes BUG DAY automatically (Phase 2). |

**Hard limits (never decide alone — but don't block: skip, record, move on):** deleting production tenant data, publishing public releases, legal commitments. Record any hits in GAPS.md + end-of-day summary.

**End-of-day summary (replaces asking):** (1) what shipped + proof, (2) `Decision:` lines logged, (3) anything skipped. The human reads this after the session, not during.

---

## Anti-Goals (daily reminders)

- ❌ No new features while a bug is open.
- ❌ No swallowed errors or silent failures on data paths.
- ❌ No hardcoded tenant names in shared code.
- ❌ No half-finished merges — every day ends green or gets reverted.

---

*Run it tomorrow. Then the day after. Production ready is ~20 good days away.*
