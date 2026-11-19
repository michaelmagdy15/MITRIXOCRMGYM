import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const RESCUE_DIR = path.join(ROOT, 'backups', 'rescue_20261117');
const TRICKLE_PATH = path.join(RESCUE_DIR, 'inzan_trickle_remaining.json');
const STATE_PATH = path.join(RESCUE_DIR, 'inzan_trickle_state.json');
const GATEWAY_SECRETS_PATH = path.join(RESCUE_DIR, 'gateway_secrets.json');

const KV_NAMESPACE_ID = process.env.CF_BACKUP_KV_NAMESPACE_ID || 'f5c1425902a7479cad5b3c7809c477a2';
const WRANGLER_JS =
  process.env.WRANGLER_JS ||
  'C:\\Users\\Mi5a\\AppData\\Local\\npm-cache\\_npx\\32026684e21afda6\\node_modules\\wrangler\\bin\\wrangler.js';
const IPV4_PRELOAD =
  'C:/Users/Mi5a/.gemini/antigravity/brain/17a3c41f-18a1-4829-8b72-f64fad214c81/scratch/ipv4_dns.cjs';

function decodeVal(v) {
  if (!v || typeof v !== 'object') return v;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) {
    const out = {};
    for (const [k, val] of Object.entries(v.mapValue?.fields || {})) {
      out[k] = decodeVal(val);
    }
    return out;
  }
  if ('arrayValue' in v) {
    return (v.arrayValue?.values || []).map(decodeVal);
  }
  return v;
}

function decodeFields(fields) {
  const out = {};
  for (const [k, val] of Object.entries(fields || {})) {
    out[k] = decodeVal(val);
  }
  return out;
}

function getBucketKey(relPath) {
  const parts = String(relPath || '').split('/');
  if (parts.length === 2) return parts[0];
  if (parts.length >= 3) return `${parts[0]}/*/${parts[2]}`;
  return relPath;
}

function parseArgs(argv) {
  let gatewayUrl = 'https://admin.inzanathletics.com';
  const idx = argv.indexOf('--gateway-url');
  if (idx !== -1 && argv[idx + 1]) {
    gatewayUrl = String(argv[idx + 1]).replace(/\/+$/, '');
  }
  return {
    dryRun: argv.includes('--dry-run'),
    gatewayUrl,
  };
}

function sortByDateDesc(arr, keyFn) {
  arr.sort((a, b) => {
    const tb = Date.parse(String(keyFn(b) || '')) || 0;
    const ta = Date.parse(String(keyFn(a) || '')) || 0;
    return tb - ta;
  });
}

function loadGatewayCronSecret() {
  if (process.env.CRON_SECRET) return String(process.env.CRON_SECRET).trim();
  if (fs.existsSync(GATEWAY_SECRETS_PATH)) {
    const secrets = JSON.parse(fs.readFileSync(GATEWAY_SECRETS_PATH, 'utf8'));
    if (secrets?.CRON_SECRET) return String(secrets.CRON_SECRET).trim();
  }
  return '';
}

function putKvKeyViaWrangler(bucket, buf) {
  const key = `archive:inzanathletics:${bucket}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inzan-arch-'));
  const tmpFile = path.join(tmpDir, 'payload.bin');
  try {
    fs.writeFileSync(tmpFile, buf);
    const existingNodeOpts = process.env.NODE_OPTIONS || '';
    const nodeOpts = existingNodeOpts.includes('ipv4_dns.cjs')
      ? existingNodeOpts
      : `--require ${IPV4_PRELOAD}`;
    execFileSync(
      process.execPath,
      [
        WRANGLER_JS,
        'kv',
        'key',
        'put',
        key,
        '--namespace-id',
        KV_NAMESPACE_ID,
        '--remote',
        '--path',
        tmpFile,
      ],
      {
        stdio: 'inherit',
        env: { ...process.env, NODE_OPTIONS: nodeOpts },
      }
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function putBucketViaGateway(gatewayUrl, cronSecret, bucket, buf) {
  const endpoint = `${gatewayUrl}/api/admin/archive-upload/${encodeURIComponent(bucket)}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-cron-secret': cronSecret,
      'x-tenant-id': 'inzanathletics',
    },
    body: new Uint8Array(buf),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { raw: text.slice(0, 200) };
  }
  if (!res.ok || !parsed?.ok) {
    throw new Error(`Gateway archive upload failed for "${bucket}" (HTTP ${res.status}): ${JSON.stringify(parsed)}`);
  }
  console.log(`[ARCHIVE] Gateway uploaded "${bucket}": ${buf.byteLength} bytes -> ok`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(TRICKLE_PATH)) {
    throw new Error(`Missing trickle JSON: ${TRICKLE_PATH}`);
  }

  console.log('[ARCHIVE] Reading remaining trickle dataset...');
  const trickle = JSON.parse(fs.readFileSync(TRICKLE_PATH, 'utf8'));
  const completed = fs.existsSync(STATE_PATH)
    ? JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')).completedPaths || {}
    : {};

  const attHistByClient = {};
  const attByClient = {};
  const leads = [];
  const invitations = [];
  const callCenterLog = [];

  let attHistCount = 0;
  let attCount = 0;

  for (const w of trickle.writes || []) {
    const rp = w.rel_path;
    if (!rp || completed[rp]) continue;
    const bucket = getBucketKey(rp);
    const d = decodeFields(w.fields);
    const docId = String(w.doc_id || rp.split('/').pop() || '');

    if (bucket === 'clients/*/attendance_history' || bucket === 'members/*/attendance_history') {
      const cid = rp.split('/')[1];
      if (!cid) continue;
      if (!attHistByClient[cid]) attHistByClient[cid] = [];
      attHistByClient[cid].push({
        id: docId,
        date: d.checkedInAt || d.sessionDate || d.date || d.checkInTime || '',
        checkOutTime: d.checkOutTime || '',
        packageName: d.sessionTitle || d.packagePrimary || d.packageName || 'Attendance Check-in',
        branch: d.branchName || d.branch || 'Garden 8',
        recordedByName: d.checkedInBy || d.recordedBy || 'Archive',
        locker: d.locker || '',
        status: d.status || 'ATTENDED',
      });
      attHistCount++;
    } else if (bucket === 'attendance') {
      const cid = String(d.clientId || '').trim();
      if (cid) {
        if (!attByClient[cid]) attByClient[cid] = [];
        attByClient[cid].push({
          id: docId,
          date: d.date || d.updatedAt || '',
          branch: d.branch || 'Garden 8',
          packageName: d.packageName || 'Attendance Check-in',
          recordedByName: d.recordedBy || 'Archive',
        });
      }
      attCount++;
    } else if (bucket === 'leads') {
      leads.push({
        id: docId,
        name: d.name || '',
        phone: d.phone || d.mobile || '',
        createdAt: d.createdAt || '',
        status: d.status || '',
        stage: d.stage || '',
        source: d.source || '',
        branch: d.branch || '',
        salesName: d.salesName || d.assignedTo || '',
        category: d.category || '',
      });
    } else if (bucket === 'invitations') {
      invitations.push({
        id: docId,
        date: d.date || '',
        guestName: d.guestName || '',
        phone: d.phone || d.guestPhone || '',
        branch: d.branch || '',
        salesName: d.salesName || '',
        staffName: d.staffName || '',
        memberId: d.memberId || d.clientId || '',
      });
    } else if (bucket === 'callCenterLog') {
      callCenterLog.push({
        id: docId,
        clientDocId: d.clientDocId || '',
        memberId: d.memberId || '',
        memberName: d.memberName || '',
        memberPhone: d.memberPhone || '',
        createdAt: d.createdAt || '',
        comment: d.comment || '',
        callType: d.callType || '',
        branch: d.branch || '',
        createdByName: d.createdByName || '',
        packageData: d.packageData || '',
      });
    }
  }

  for (const arr of Object.values(attHistByClient)) sortByDateDesc(arr, (r) => r.date);
  for (const arr of Object.values(attByClient)) sortByDateDesc(arr, (r) => r.date);
  sortByDateDesc(leads, (r) => r.createdAt);
  sortByDateDesc(invitations, (r) => r.date);
  sortByDateDesc(callCenterLog, (r) => r.createdAt);

  const gz = (obj) => zlib.gzipSync(Buffer.from(JSON.stringify(obj), 'utf8'), { level: 6 });

  const attHistGz = gz(attHistByClient);
  const attGz = gz({ byClient: attByClient });
  const leadsGz = gz(leads);
  const invitationsGz = gz(invitations);
  const callCenterGz = gz(callCenterLog);

  const totalRecords =
    attHistCount + attCount + leads.length + invitations.length + callCenterLog.length;

  const meta = {
    version: 1,
    tenantId: 'inzanathletics',
    generatedAt: new Date().toISOString(),
    totalRecords,
    counts: {
      attendanceHistory: attHistCount,
      attendance: attCount,
      leads: leads.length,
      invitations: invitations.length,
      callCenterLog: callCenterLog.length,
    },
    gzipBytes: {
      att_hist: attHistGz.byteLength,
      attendance: attGz.byteLength,
      leads: leadsGz.byteLength,
      invitations: invitationsGz.byteLength,
      callCenterLog: callCenterGz.byteLength,
    },
  };

  console.log('[ARCHIVE] Prepared payloads:', JSON.stringify(meta, null, 2));
  if (opts.dryRun) {
    console.log('[ARCHIVE] Dry-run complete. No KV writes performed.');
    return;
  }

  const buckets = [
    ['att_hist', attHistGz],
    ['attendance', attGz],
    ['leads', leadsGz],
    ['invitations', invitationsGz],
    ['callCenterLog', callCenterGz],
    ['meta', Buffer.from(JSON.stringify(meta), 'utf8')],
  ];

  const useWrangler = Boolean(process.env.CLOUDFLARE_API_TOKEN) && fs.existsSync(WRANGLER_JS);
  if (useWrangler) {
    console.log('[ARCHIVE] Uploading 6 payloads directly via Wrangler KV...');
    for (const [bucket, buf] of buckets) {
      putKvKeyViaWrangler(bucket, buf);
    }
  } else {
    const cronSecret = loadGatewayCronSecret();
    if (!cronSecret) {
      throw new Error('Neither CLOUDFLARE_API_TOKEN nor gateway CRON_SECRET is available for archive upload.');
    }
    console.log(`[ARCHIVE] Uploading 6 payloads via gateway (${opts.gatewayUrl})...`);
    for (const [bucket, buf] of buckets) {
      await putBucketViaGateway(opts.gatewayUrl, cronSecret, bucket, buf);
    }
  }

  console.log('[ARCHIVE] Successfully uploaded all 6 Inzan historical archive KV keys.');
}

main().catch((err) => {
  console.error('[ARCHIVE] FATAL:', err);
  process.exit(1);
});
