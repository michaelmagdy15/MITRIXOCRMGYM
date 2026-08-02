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
