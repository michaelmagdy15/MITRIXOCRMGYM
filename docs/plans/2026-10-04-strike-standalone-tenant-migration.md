# Strike Dedicated GCP Migration & Multi-Project Untangling Implementation Plan (Locked-In)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Completely decouple and migrate Strike Boxing Gym from the multi-project central Firebase/GCP account (`faa-test-guide-v2`) into an independent, client-owned GCP & Firebase project, with zero data/password loss, complete isolation from ATPL Vector and Gamén assets/rules, and an automated CI/CD engine for continuous core system updates.

**Architecture:** Single-Tenant Dedicated Cloud Run Fleet Architecture. The core CRM codebase operates in dual-mode (multi-tenant for central platform; standalone for Strike). Strike receives only sanitized gym CRM rules (`firestore-tenant.rules`), filtered Strike-only Auth accounts, and scoped collections. Continuous updates are pushed via automated GitHub Actions deploying pre-compiled containers to Strike's Cloud Run service with startup health check gates and Cloud Scheduler cron jobs.

**Tech Stack:** Firebase Auth (SCRYPT CLI export/import), Cloud Firestore, Cloud Storage, Google Cloud Run, Google Cloud Scheduler, Express.js / Vite / React 19, GitHub Actions CI/CD with GCP Service Account.

---

## 1. Executive Summary of Engineering Review Decisions

| Review Area | Decision Made | Engineering Rationale |
|---|---|---|
| **Zero-Downtime Updates** | Startup `/api/health` probe on Cloud Run | Prevents broken container revisions from serving gym traffic; auto-aborts bad deploys. |
| **Data Consistency** | Two-phase cutover + 5-min maintenance lock | Baseline sync + short read-only window + delta sync prevents missed walk-in payments. |
| **Background Crons** | Google Cloud Scheduler webhook triggers | Ensures midnight expiration scans and no-show jobs execute even if server was idle at night. |
| **Firestore Batching** | 400-item atomic chunking with backoff | Respects Firestore's 500-write batch limit and handles network blips gracefully. |
| **Parity Testing** | Pre-cutover automated assertion test suite | Verifies 100% document count parity and deep sample equality before DNS cutover. |
| **Performance & Caching** | Upfront index deploy + immutable asset headers | Eliminates index creation errors and prevents WebView caching traps on app updates. |

---

## 2. Complete System Diagrams

### A. Data Flow & Continuous Updates Delivery
```
+-------------------------------------------------------------------------------+
|                       Mitrixo Master GitHub Repository                         |
|   - Single Source of Truth for CRM Frontend & Backend                         |
|   - Dual-mode environment abstraction (STANDALONE_MODE flag)                  |
+-------------------------------------------------------------------------------+
                                      |
                                      | git push origin master
                                      v
+-------------------------------------------------------------------------------+
|                           GitHub Actions CI/CD                                 |
|   1. Run Linter & Automated Test Suite (npm run build && npm run lint)        |
|   2. Build Multi-Stage Production Docker Container                            |
|   3. Deploy Rules: firestore-tenant.rules & firestore.indexes.json            |
+-------------------------------------------------------------------------------+
           |                                                      |
           | Deploy Target 1                                      | Deploy Target 2 (SA Key)
           v                                                      v
+------------------------------------+ +----------------------------------------+
|      Central Multi-Tenant Cluster  | |  Strike Dedicated GCP (Client-Owned)   |
| - Host: Inzan Athletics & Tenants  | | - Google Cloud Run (app.strike-egy.com)|
| - Project: faa-test-guide-v2       | | - Project: strike-gym-prod             |
| - Databases: db-inzanathletics     | | - Database: (default) (Pure Strike)    |
|   and db-registry-2                | | - Auth: 100% Preserved Passwords       |
|                                    | | - Cloud Scheduler: Midnight Cron Webhook|
+------------------------------------+ +----------------------------------------+
```

### B. Two-Phase Zero Data Loss Cutover Pipeline
```
Phase 1: Baseline Sync
[ Central faa-test-guide-v2 ] -------- Bulk 400-batch copy --------> [ Strike strike-gym-prod ]
(Live gym operations continue uninterrupted)

Phase 2: Final 5-Minute Cutover Window
[ Enable Maintenance Banner ] -> [ Run Delta-Sync ] -> [ Run Parity Assertions ] -> [ Switch DNS ]
(Read-only for ~5 mins)         (Captures last writes) (Validates 100% counts)       (Points domains)
```

---

## 3. Implementation Tasks & File Plan

### Task 1: Untangle Rules & Exclude Strike from `sync-rules.cjs`
**Files:**
- Modify: `sync-rules.cjs:10-30`
- Create: `firebase.standalone.json`

**Steps:**
1. Remove `Strike CRM` from `projectDefinitions` in `sync-rules.cjs` so local ATPL Vector/Gamén syncs never overwrite Strike's rules.
2. Create `firebase.standalone.json` configured specifically for Strike:
   ```json
   {
     "firestore": {
       "rules": "firestore-tenant.rules",
       "indexes": "firestore.indexes.json"
     },
     "storage": {
       "rules": "storage.rules"
     }
   }
   ```
3. Commit change: `git commit -m "chore: isolate Strike CRM from cross-project sync-rules"`

---

### Task 2: Implement Standalone Mode & Health Check Endpoint
**Files:**
- Create: `src/config/environment.ts`
- Modify: `server.ts`
- Modify: `src/firebase.ts`

**Steps:**
1. In `src/config/environment.ts`, define `isStandaloneMode()` checking `process.env.STANDALONE_MODE === 'true'`.
2. In `server.ts`, add `/api/health` endpoint:
   - Probes Firestore connectivity.
   - Returns HTTP 200 `{ status: "ok", mode: "standalone", tenant: "strike" }`.
3. In `server.ts`, add authenticated Cloud Scheduler cron endpoints:
   - `POST /api/cron/membership-expiration`
   - `POST /api/cron/no-show-check`
4. Run: `npm run build && npm run lint`
5. Commit change: `git commit -m "feat: add standalone mode detection, health probe, and cron endpoints"`

---

### Task 3: Build Scoped Auth Export & Filtering Scripts
**Files:**
- Create: `scripts/migration/export-auth.js`
- Create: `scripts/migration/filter-strike-auth.js`
- Create: `scripts/migration/import-auth.js`

**Steps:**
1. Export all users from `faa-test-guide-v2` via CLI.
2. In `filter-strike-auth.js`, strictly include:
   - Emails matching `@strike-egy.com`, `@strikeboxing`, or `member-*@strike.mitrixo-member.local`.
   - Strike staff UIDs.
   - Explicitly exclude emails containing `atpl`, `pilot`, `gamen`, `inzan`, or platform superadmin.
3. Import into Strike project with `SCRYPT` parameters (`signer_key`, `salt_separator`, `rounds: 8`, `mem_cost: 14`).
4. Commit change: `git commit -m "feat(migration): build scoped SCRYPT auth export and import tooling"`

---

### Task 4: Build Atomic Firestore Migration & Delta-Sync Engine
**Files:**
- Create: `scripts/migration/migrate-strike-firestore.ts`
- Create: `scripts/migration/delta-sync-firestore.ts`

**Steps:**
1. Stream gym-only collections in 400-item chunks:
   - `clients`, `payments`, `packages`, `users`, `sessions`, `privateSessions`, `classSchedules`, `classBookings`, `leads`, `tasks`, `complaints`, `lostFoundItems`, `settings`, `counters`, `entitlements`.
2. Ignore all ATPL and Gamén collections.
3. Implement exponential backoff retry logic (up to 3 retries per chunk).
4. Commit change: `git commit -m "feat(migration): build chunked Firestore migration and delta sync scripts"`

---

### Task 5: Build Automated Parity Assertion Test Suite
**Files:**
- Create: `scripts/migration/verify-migration-parity.ts`

**Steps:**
1. Query both `faa-test-guide-v2` and `strike-gym-prod` databases.
2. Assert 100% document count match across all 15 gym collections.
3. Sample 20 random client IDs and assert deep document equality.
4. Assert zero ATPL or Gamén collections exist in the target database.
5. Assert sequential member ID counter consistency.
6. Commit change: `git commit -m "test(migration): add automated database parity assertion suite"`

---

### Task 6: Containerization & GitHub Actions Continuous Deployment
**Files:**
- Create: `Dockerfile`
- Create: `.github/workflows/deploy-strike-dedicated.yml`

**Steps:**
1. Multi-stage `Dockerfile`:
   - Stage 1: Build frontend via `npm run build`.
   - Stage 2: Minimal Node 20 runtime serving `server.ts` with static asset caching headers.
2. GitHub Actions workflow:
   - Triggers on push to `master`.
   - Runs `npm run build` and `npm run lint`.
   - Uses `google-github-actions/auth` with Strike's Service Account.
   - Builds container and deploys to Cloud Run with startup probe (`/api/health`).
   - Deploys `firestore-tenant.rules` and `firestore.indexes.json`.
3. Commit change: `git commit -m "ci: add GitHub Actions continuous updates pipeline for Strike Cloud Run"`

---

### Task 7: Storage Assets Sync & DNS Cutover
**Steps:**
1. Run `gcloud storage rsync` to sync avatars, contracts, and logos to Strike's bucket.
2. Run initial baseline Firestore migration.
3. Schedule 5-minute maintenance window:
   - Enable maintenance flag on old app.
   - Run `delta-sync-firestore.ts`.
   - Run `verify-migration-parity.ts` (All assertions must PASS).
4. Remove domain mappings from `faa-test-guide-v2`.
5. Map custom domains in Strike Cloud Run and update DNS.
6. Disable maintenance banner and verify live login.

---

## 4. Production Failure Scenarios & Mitigations

| Failure Scenario | How It Is Handled |
|---|---|
| **A bug is introduced in a core update commit** | Cloud Run startup health check (`/api/health`) fails; Google automatically stops rollout and keeps 100% of traffic on previous working revision. |
| **Network failure during database copy** | Batch chunker retries up to 3 times with exponential backoff; failed IDs are written to `failed-records.json` for replay. |
| **Walk-in payment recorded right before cutover** | The 5-minute read-only maintenance window and `delta-sync-firestore.ts` capture every last-minute transaction. |
| **Member forgets password on new project** | Firebase Auth password reset emails continue to work seamlessly via Firebase Auth SDK in the new project. |
| **Cold start latency on night cron jobs** | Cloud Scheduler sends scheduled HTTP POST requests to wake the service and execute expiration jobs reliably. |

---

## 5. Verification Gate (Ship Criteria)

- [ ] `sync-rules.cjs` isolated; Strike has zero ATPL/Gamén rules.
- [ ] `npm run build` exits 0; `npm run lint` exits 0.
- [ ] Parity assertion suite reports 100% count match and 0 missing records.
- [ ] Test member login succeeds with existing password.
- [ ] Cloud Run health check returns HTTP 200.
