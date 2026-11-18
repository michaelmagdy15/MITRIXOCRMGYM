import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const admin = require('firebase-admin');

const ROOT = process.cwd();
const RESCUE_DIR = path.join(ROOT, 'backups', 'rescue_20261117');
const SA_PATH = path.join(RESCUE_DIR, 'inzan-spark-sa.json');
const TRICKLE_PATH = path.join(RESCUE_DIR, 'inzan_trickle_remaining.json');
const RAW_INZAN_PATH = path.join(RESCUE_DIR, 'db_inzanathletics_raw.json');
const STATE_PATH = path.join(RESCUE_DIR, 'inzan_trickle_state.json');

function parseArgs(argv) {
  let maxWrites = 16500;
  let dryRun = false;
  let includeAttendanceHistory = false;
  let includeLetterClients = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') dryRun = true;
    else if (a === '--include-attendance-history') includeAttendanceHistory = true;
    else if (a === '--include-letter-clients') includeLetterClients = true;
    else if (a === '--max-writes' && argv[i + 1]) {
      maxWrites = Math.max(1, Number.parseInt(argv[++i], 10) || 16500);
    }
  }
  return { maxWrites, dryRun, includeAttendanceHistory, includeLetterClients };
}

function decodeFirestoreVal(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) {
    const dt = new Date(v.timestampValue);
    return Number.isNaN(dt.getTime()) ? v.timestampValue : admin.firestore.Timestamp.fromDate(dt);
  }
  if ('geoPointValue' in v) {
    return new admin.firestore.GeoPoint(
      Number(v.geoPointValue?.latitude || 0),
      Number(v.geoPointValue?.longitude || 0)
    );
  }
  if ('bytesValue' in v) {
    return Buffer.from(String(v.bytesValue || ''), 'base64');
  }
  if ('referenceValue' in v) return v.referenceValue;
  if ('mapValue' in v) {
    const out = {};
    const fields = v.mapValue?.fields || {};
    for (const [k, val] of Object.entries(fields)) {
      out[k] = decodeFirestoreVal(val);
    }
    return out;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue?.values || []).map(decodeFirestoreVal);
  }
  return v;
}

function decodeDocFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields || {})) {
    out[k] = decodeFirestoreVal(val);
  }
  return out;
}

function getBucketKey(relPath) {
  const parts = String(relPath || '').split('/');
  if (parts.length === 2) return parts[0];
  if (parts.length >= 3) return `${parts[0]}/*/${parts[2]}`;
  return relPath;
}

const PRIORITY_ORDER = new Map([
  ['payments', 1],
  ['clients', 2],
  ['guestInvites', 3],
  ['clients/*/comments', 4],
  ['clients/*/interactions', 5],
  ['callCenterLog', 6],
  ['invitations', 7],
  ['attendance', 8],
  ['leads', 9],
  ['clients/*/attendance_history', 10],
  ['members/*/attendance_history', 11],
]);

function isLetterCodedClientFields(fields) {
  const bc = fields?.barcode?.stringValue || '';
  const mid = fields?.memberId?.stringValue || '';
  const pfx = fields?.memberCodePrefix?.stringValue || '';
  return /[a-zA-Z]/.test(bc) || Boolean(pfx) || /[a-zA-Z]/.test(mid);
}

function enrichClientPhotoUrl(data) {
  const rawPhoto = String(data?.photoURL || '').trim();
  const isBroken = !rawPhoto || /\/uploads\/?$/i.test(rawPhoto);
  const localFile = String(data?.photoLocal || '').trim().split('/').pop()?.trim() || '';
  if (isBroken && localFile) {
    return {
      ...data,
      photoURL: `/member-photos/${encodeURIComponent(localFile)}`,
    };
  }
  return data;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) {
    return { completedPaths: {}, photoBackfillDone: false, letterPreMarked: false, updatedAt: null };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return {
      completedPaths: parsed.completedPaths && typeof parsed.completedPaths === 'object' ? parsed.completedPaths : {},
      photoBackfillDone: Boolean(parsed.photoBackfillDone),
      letterPreMarked: Boolean(parsed.letterPreMarked),
      updatedAt: parsed.updatedAt || null,
    };
  } catch {
    return { completedPaths: {}, photoBackfillDone: false, letterPreMarked: false, updatedAt: null };
  }
}

function saveState(state) {
  state.updatedAt = new Date().toISOString();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state), 'utf8');
  fs.renameSync(tmp, STATE_PATH);
}

function isQuotaError(err) {
  const msg = String(err?.message || '').toLowerCase();
  return err?.code === 8 || msg.includes('resource_exhausted') || msg.includes('quota exceeded');
}

async function runPhotoBackfill(db, dryRun) {
  const jobs = [];
  if (fs.existsSync(RAW_INZAN_PATH)) {
    const raw = JSON.parse(fs.readFileSync(RAW_INZAN_PATH, 'utf8'));
    for (const c of raw.collections?.clients || []) {
      const f = c.fields || {};
      const photoURL = String(f.photoURL?.stringValue || '').trim();
      const photoLocal = String(f.photoLocal?.stringValue || '').trim();
      const broken = !photoURL || /\/uploads\/?$/i.test(photoURL);
      if (broken && photoLocal) {
        const docId = c.name.split('/').pop();
        jobs.push({
          relPath: `clients/${docId}`,
          data: { photoURL: `/member-photos/${encodeURIComponent(photoLocal.split('/').pop().trim())}` },
        });
      }
    }
  }
  jobs.push(
    { relPath: 'clients/redgits-4119', data: { photoURL: '/member-photos/redgits-4119.jpg' } },
    { relPath: 'users/RJIBk1vcsXZ02ARucdPcOhmhkBf2', data: { photoURL: '/member-photos/avatar-RJIBk1vcsXZ02ARucdPcOhmhkBf2.jpg' } }
  );

  // Deduplicate by relPath
  const uniqueJobs = Array.from(new Map(jobs.map((j) => [j.relPath, j])).values());
  console.log(`[TRICKLE] Photo URL backfill candidates: ${uniqueJobs.length}`);
  if (dryRun || uniqueJobs.length === 0) return uniqueJobs.length;

  for (let i = 0; i < uniqueJobs.length; i += 200) {
    const batch = db.batch();
    for (const item of uniqueJobs.slice(i, i + 200)) {
      batch.set(db.doc(item.relPath), item.data, { merge: true });
    }
    await batch.commit();
  }
  return uniqueJobs.length;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(SA_PATH)) {
    throw new Error(`Missing service account JSON at ${SA_PATH}`);
  }
  if (!fs.existsSync(TRICKLE_PATH)) {
    throw new Error(`Missing trickle queue JSON at ${TRICKLE_PATH}`);
  }

  const sa = JSON.parse(fs.readFileSync(SA_PATH, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(sa) }, 'inzan-trickle');
  const db = app.firestore();

  try {
    const state = loadState();
    console.log(`[TRICKLE] Loading ${TRICKLE_PATH}...`);
    const trickle = JSON.parse(fs.readFileSync(TRICKLE_PATH, 'utf8'));
    const allWrites = Array.isArray(trickle.writes) ? trickle.writes : [];

    // Pre-mark 360 letter-coded root clients already committed by reset_all_passwords.mjs
    if (!opts.includeLetterClients && !state.letterPreMarked) {
      let preMarkedCount = 0;
      for (const w of allWrites) {
        if (getBucketKey(w.rel_path) === 'clients' && isLetterCodedClientFields(w.fields)) {
          state.completedPaths[w.rel_path] = 1;
          preMarkedCount++;
        }
      }
      state.letterPreMarked = true;
      if (!opts.dryRun) saveState(state);
      console.log(`[TRICKLE] Pre-marked ${preMarkedCount} previously committed letter-coded clients.`);
    }

    let writesUsed = 0;
    const writtenByBucket = {};
    let quotaStopped = false;

    if (!state.photoBackfillDone) {
      try {
        const photoCount = await runPhotoBackfill(db, opts.dryRun);
        writesUsed += photoCount;
        writtenByBucket['photo_backfill'] = photoCount;
        state.photoBackfillDone = true;
        if (!opts.dryRun) saveState(state);
      } catch (err) {
        if (isQuotaError(err)) {
          quotaStopped = true;
          console.warn('[TRICKLE] Quota reached during photo backfill.');
        } else {
          throw err;
        }
      }
    }

    // Build remaining work queue filtered + sorted by priority
    const pending = [];
    const remainingTotalByBucket = {};
    for (const w of allWrites) {
      const rp = w.rel_path;
      if (!rp || state.completedPaths[rp]) continue;
      const bucket = getBucketKey(rp);
      const isAttHist = bucket.endsWith('/attendance_history');
      if (isAttHist && !opts.includeAttendanceHistory) {
        remainingTotalByBucket[bucket] = (remainingTotalByBucket[bucket] || 0) + 1;
        continue;
      }
      pending.push({ item: w, bucket, prio: PRIORITY_ORDER.get(bucket) ?? 99 });
      remainingTotalByBucket[bucket] = (remainingTotalByBucket[bucket] || 0) + 1;
    }

    pending.sort((a, b) => a.prio - b.prio);
    const budgetLeft = Math.max(0, opts.maxWrites - writesUsed);
    const toCommit = pending.slice(0, budgetLeft);

    console.log(
      `[TRICKLE] Pending active-priority queue=${pending.length}, budget_left=${budgetLeft}, planned_this_run=${toCommit.length}, dryRun=${opts.dryRun}`
    );

    if (opts.dryRun) {
      const preview = {};
      for (const p of toCommit) preview[p.bucket] = (preview[p.bucket] || 0) + 1;
      console.log('[TRICKLE] DRY RUN batch composition:', JSON.stringify(preview));
      console.log('[TRICKLE] Remaining by bucket (total before run):', JSON.stringify(remainingTotalByBucket));
      return;
    }

    if (!quotaStopped) {
      for (let i = 0; i < toCommit.length; i += 200) {
        const chunk = toCommit.slice(i, i + 200);
        const batch = db.batch();
        for (const entry of chunk) {
          let decoded = decodeDocFields(entry.item.fields);
          if (entry.bucket === 'clients') {
            decoded = enrichClientPhotoUrl(decoded);
          }
          batch.set(db.doc(entry.item.rel_path), decoded, { merge: true });
        }
        try {
          await batch.commit();
        } catch (err) {
          if (isQuotaError(err)) {
            quotaStopped = true;
            console.warn(`[TRICKLE] Firestore write quota reached at ${writesUsed} total writes this run.`);
            break;
          }
          throw err;
        }
        for (const entry of chunk) {
          state.completedPaths[entry.item.rel_path] = 1;
          writtenByBucket[entry.bucket] = (writtenByBucket[entry.bucket] || 0) + 1;
        }
        writesUsed += chunk.length;
        saveState(state);
        if (writesUsed % 2000 < 200) {
          console.log(`[TRICKLE] Progress: ${writesUsed} writes committed...`);
        }
      }
    }

    // Recompute remaining counts cleanly after run
    const afterByBucket = {};
    let totalRemainingOperational = 0;
    let totalRemainingAttHistory = 0;
    for (const w of allWrites) {
      if (state.completedPaths[w.rel_path]) continue;
      const b = getBucketKey(w.rel_path);
      afterByBucket[b] = (afterByBucket[b] || 0) + 1;
      if (b.endsWith('/attendance_history')) totalRemainingAttHistory++;
      else totalRemainingOperational++;
    }

    console.log('TRICKLE_SUMMARY:', JSON.stringify({
      status: quotaStopped ? 'QUOTA_STOPPED' : 'BATCH_COMPLETE',
      writesCommittedThisRun: writesUsed,
      writtenByBucket,
      totalCompletedPaths: Object.keys(state.completedPaths).length,
      remainingOperationalDocs: totalRemainingOperational,
      remainingAttendanceHistoryDocs: totalRemainingAttHistory,
      remainingByBucket: afterByBucket,
    }, null, 2));
  } finally {
    await app.delete();
  }
}

main().catch((err) => {
  console.error('[TRICKLE] FATAL:', err);
  process.exit(1);
});
