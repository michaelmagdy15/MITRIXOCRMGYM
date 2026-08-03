# GCP Cost Optimization Log

## Date: August 2, 2026

---

## Objective
Reduce GCP billing costs across multiple projects and billing accounts to under $10/month.

---

## Accounts & Projects

| Account | ID | Projects |
|---------|-----|----------|
| **Old One** | `0119DE-F00EAC-9B7DEE` | 0 (empty) |
| **7esab Mi5a** | `0151A5-137D9D-216314` | `bengarab`, `faa-test-guide-v2`, `gen-lang-client-0565330624` |

---

## Deleted Resources

### Cloud Run Services (faa-test-guide-v2)
- `forcepasswordreset` (orphaned Cloud Function container)
- `metawebhook` (orphaned Cloud Function container)
- `onclientassigned` (orphaned Cloud Function container)
- `onleadcreated` (orphaned Cloud Function container)
- `onpaymentupdated` (orphaned Cloud Function container)
- `upgradememberpackage` (orphaned Cloud Function container)

### Cloud Run Services (bengarab)
- `mitrixo-gym-crm` (us-central1) — abandoned duplicate
- `mitry-visuals` (europe-west3) — abandoned duplicate
- `aerosphere-profiles` (us-central1)
- `aerosphere-signaling` (us-central1)
- `certificate-generator` (europe-west1)
- `commercial-dashboard` (us-central1)
- `decwebsiteprototype` (europe-west1)
- `inzan-locker-middleware` (us-central1)
- `kaabapass-app` (us-central1)
- `matchmakingcrm` (europe-west1)
- `presentation` (us-central1)
- `roadmappers` (us-central1)
- `saveyourdocument` (europe-west1)
- `strikecrm` (europe-west1)
- `vestaflow` (us-central1)

### Cloud Run Services (Old One projects)
- `inzan-locker-middleware` (strike-crm-v1-001)
- `dec-milestone-tracker-new` (mcp-test-deploy-001)
- `strike-boxing-crm` (gen-lang-client-0329393092)

### Billing Unlinked (Old One)
- `strike-crm-v1-001`
- `gen-lang-client-0756476730`
- `mcp-test-deploy-001`
- `gen-lang-client-0329393092`

### Storage Buckets Deleted
- `bengarab_cloudbuild` (2.88 GB)
- `run-sources-bengarab-us-central1` (270 MB)
- `faa-test-guide-v2_cloudbuild` (115 MB)
- `your-hermes-memory-bucket`
- `gamen-world`
- `gcf-v2-sources-492280162134-europe-west3`
- `gcf-v2-sources-492280162134-europe-west10`

### Previous Session Deletions
- Firestore: `db-inzanathletics`, `db-test`, `db-testrules`, `db-gyma`, `db-shockgym`, `db-aerosphere`
- Cloud Run: `sync-vbt-sheet`, `vbt-camp-app` (old)
- Cloud Function: `sync-vbt-sheet`

---

## Remaining Resources

### bengarab (Cloud Run — all min=0, max=1)
| Service | Region | URL |
|---------|--------|-----|
| `mitrixogymcrm` | europe-west1 | https://mitrixogymcrm-3hoiqyc44a-ew.a.run.app |
| `vbt-camp-app` | europe-west1 | https://vbt-camp-app-3hoiqyc44a-ew.a.run.app |
| `vbt-notify-service` | europe-west1 | https://vbt-notify-service-3hoiqyc44a-ew.a.run.app |
| `atplvector` | europe-west1 | https://atplvector-3hoiqyc44a-ew.a.run.app |
| `gamen-eg` | europe-west1 | https://gamen-eg-3hoiqyc44a-ew.a.run.app |
| `mitrixo-landing` | us-central1 | (no URL) |
| `mitrixo-workouts` | europe-west1 | https://mitrixo-workouts-3hoiqyc44a-ew.a.run.app |
| `mitry-visuals` | europe-west1 | https://mitry-visuals-3hoiqyc44a-ew.a.run.app |

### faa-test-guide-v2 (Cloud Functions — 8 ACTIVE)
- `ext-firestore-send-email-processqueue`
- `ext-firestore-send-email-strike-processqueue`
- `forcePasswordReset`
- `metaWebhook`
- `onClientAssigned`
- `onLeadCreated`
- `onPaymentUpdated`
- `upgradeMemberPackage`

### faa-test-guide-v2 (Cloud Run — 2 ACTIVE)
- `ext-firestore-send-email-processqueue` (us-central1)
- `ext-firestore-send-email-strike-processqueue` (europe-west10)

### Firestore Databases (faa-test-guide-v2)
- `(default)` — main CRM
- `db-registry-2` — tenant registry
- `db-vbt` — 156 docs

### Storage Buckets Remaining
- `run-sources-bengarab-europe-west1` (production images)
- `run-sources-faa-test-guide-v2-europe-west1`
- `gcf-v2-sources-492280162134-europe-west1`
- `gcf-v2-sources-492280162134-us-central1`
- `faa-test-guide-v2.firebasestorage.app`

---

## Key Configuration Changes
- All 8 remaining bengarab Cloud Run services set to **minInstances=0, maxInstances=1**
- `cloudbuild.yaml` updated with: `--min-instances=0`, `--max-instances=3`, `--cpu=1`, `--memory=512Mi`, `--concurrency=50`, `--timeout=300`
- GCR image cleanup step added to `cloudbuild.yaml` (keeps `latest` tag only)
- `inzanathletics` tenant migrated from Firestore to CockroachDB

---

## Estimated Costs
| Component | Monthly Cost |
|-----------|-------------|
| Cloud Run (min=0, max=1) | $0-5 |
| Cloud Functions (light traffic) | $0-3 |
| Firestore (3 databases) | $0-2 |
| Storage (~500 MB remaining) | ~$0.02 |
| **Total** | **~$1-10** |

---

## ⚠️ Note
- Deleted `gamen-world` bucket — may have contained logos/uploads. No backup found.
- Cloud Functions on faa-test-guide-v2 cannot have maxScale reduced via `gcloud run services update` (images missing). Must redeploy via `firebase deploy --only functions`.

---

## Next Steps
- Monitor billing for 1 month to confirm costs are under $10
- Consider deleting `db-vbt` if not needed
- Consider deleting unused bengarab services (`atplvector`, `gamen-eg`, `mitrixo-landing`, `mitrixo-workouts`, `mitry-visuals`) if not needed

---

# Session 2 — August 3, 2026

## Goal
Get GCP usage down to the **always-free tier** (Cloud Run 2M req/mo, Firestore 50K reads/day). User is on a tight budget (Egypt) and decided to stay on Google Cloud (declined Oracle / Cloudflare migration).

## Firestore Data Inventory (faa-test-guide-v2)
| Collection | Docs |
|------------|------|
| auditLogs | 4,912 |
| clients | 967 |
| users | 926 |
| payments | 648 |
| importBatches | 43 |
| tasks | 34 |
| packages | 26 |
| coaches | 7 |
| sessions | 0 |
| userTargets | 0 |

Audit log recency (default DB): last 30 days = ~2,369 docs; last 90 days = ~3,521.

## Root Cause of ~$1/day
The frontend sends a 30-day `dateFrom` for audit logs, but the backend `/api/audit-logs` **ignored it** and did a full `db.collection('auditLogs').get()` on every app load — ~4,912 Firestore reads per load, for every privileged user. Global listeners/hooks in `context.tsx` also pulled clients/payments/coaches/sessions eagerly.
- **Discovered:** `src/contexts/CRMContext.tsx` is DEAD CODE (never imported). The live app uses `src/context.tsx` (`AppProvider`) + hooks. Do NOT edit CRMContext.tsx.

## Backups (completed BEFORE any code changes)
All 3 Firestore DBs exported to `gs://crm-backups-492280162134/` (~8.26 MB), all operations SUCCESSFUL:
- `default-20260803-013628` (103 output files)
- `db-registry-2-20260803-013641`
- `db-vbt-20260803-013642`

Restore command: `gcloud firestore import gs://crm-backups-492280162134/<folder>`

## Scale-Down Changes (verified)
- `mitrixogymcrm` maxScale **3 → 1** (revision `mitrixogymcrm-00212-wb9` serving; min stays 0)
- `ext-firestore-send-email-strike-processqueue` (europe-west10) maxScale **100 → 3**
- `ext-firestore-send-email-processqueue` (us-central1) **could not be updated** — image `us-central1-docker.pkg.dev/faa-test-guide-v2/gcf-artifacts/faa--test--guide--v2__us--central1__ext--firestore--send--email--processqueue:version_1` not found (orphaned/idle). Fix requires `firebase deploy --only functions` or deletion via Firebase Extensions console.
- Strike project services (9 total, incl. `strike-boxing-crm`, `metawebhook`, etc.) — ALL orphaned ("Image ... not found"), can't serve traffic, so no action needed (cost-free already).

## Code Optimizations (committed as `eb108dc`)
1. **`src/db/sqlApi.ts` `/api/audit-logs`** — now honors `fromISO`, `toISO`, `limit` (capped 1–5000), and `entityId` query params instead of reading the whole collection.
2. **`src/context.tsx`** — removed the global `auditLogs` fetch entirely (was reading all logs on every app load). Also removed `auditLogs` from `AppContextType` + value + deps.
3. **`src/hooks/useAuditLogs.ts`** — added optional `entityId` param.
4. **`src/AdvancedReports.tsx`** — staff-logs report now fetches its own audit logs on-demand with the report's selected date range (page is lazily mounted, so no reads until opened).
5. **`src/components/ClientAuditLogs.tsx`** (new) — per-client audit-log history + points redemption history fetched on-demand (Base UI `TabsContent` unmounts when inactive → zero reads until tab opened).
6. **`cloudbuild.yaml`** — `--max-instances=3` → `--max-instances=1` so future builds don't revert the scale-down.

Result: audit-log reads drop from ~4,912 per app load to **zero**; full history still available on-demand in the pages that need it.

## Firestore Composite Index (created, READY)
`auditLogs` collection group: `entityId` ASC, `timestamp` DESC
`CICAgLjy8IAK` — required for the per-client on-demand queries.

## Verification
- `npm run lint` (tsc --noEmit): PASS
- `npm run build` (vite + esbuild): PASS
- Firestore `runQuery` with entityId+timestamp+limit: returns docs, no index error
- Git: `eb108dc` committed & pushed to `origin/master` (MITRIXOCRMGYM)

## Environment Notes (for future sessions)
- Active gcloud account: `michaelmitry13@gmail.com`, default project `bengarab`
- `monitoring.googleapis.com` returns 404 from this network (blocked); billing/run/firestore APIs work
- `InsecureRequestWarning` noise on gcloud is harmless (root.crt is a standard ISRG cert, not a proxy)
- For Firestore `runQuery` with complex JSON: write body to a temp file (e.g. `C:\Users\Mi5a\AppData\Local\Temp\opencode\q.json`) and use `curl.exe --data @file` — works around PowerShell quoting
- `.env` holds CockroachDB creds for the `inzanathletics` tenant (`postgresql://michael:...@mitrixo-29021.j77.aws-eu-central-1.cockroachlabs.cloud:26257/Inzan-athletics`)

## Remaining / Next Steps
- Monitor billing to confirm the audit-log fix shows up (reads should drop sharply)
- Redeploy (`firebase deploy` / Cloud Build) to ship the code changes to production
- Consider capping the us-central1 send-email extension via `firebase deploy --only functions`
- Optional: tighten remaining global listeners (`useClients`, `usePayments`, `usePTSessions`, `useCoaches`) — they are real-time by design; lower priority
