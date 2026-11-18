import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TRICKLE_PATH = path.join(ROOT, 'backups', 'rescue_20261117', 'inzan_trickle_remaining.json');
const STATE_PATH = path.join(ROOT, 'backups', 'rescue_20261117', 'inzan_trickle_state.json');

const PASSWORD = process.env.VERIFY_PASSWORD || '12345678';
const INZAN_API_KEY = process.env.INZAN_API_KEY || 'AIzaSyDP91b3aJ9GtZoLGmKbMNAnQHC6EANjCbs';
const VBT_API_KEY = process.env.VBT_API_KEY || 'AIzaSyAPThwPuoj9XDhdZW9Qg44nPdm498o83l0';

async function checkAuthSignIn(apiKey, email, label) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
      signal: AbortSignal.timeout(15000),
    }
  );
  const data = await res.json().catch(() => ({}));
  return { label, email, status: res.status, ok: res.ok && Boolean(data.idToken) };
}

async function fetchWithRetry(url, init = {}, retries = 3) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url, { signal: AbortSignal.timeout(15000), ...init });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function main() {
  const authChecks = await Promise.all([
    checkAuthSignIn(INZAN_API_KEY, 'michaelmitry13@gmail.com', 'Inzan Admin'),
    checkAuthSignIn(INZAN_API_KEY, 'member-27137@inzanathletics.mitrixo-member.local', 'Inzan P20 Member'),
    checkAuthSignIn(VBT_API_KEY, 'michaelmitry13@gmail.com', 'VBT Admin'),
  ]);

  const adminRes = await fetchWithRetry(`https://admin.inzanathletics.com?_t=${Date.now()}`);
  const adminHtml = await adminRes.text();
  const cacheMatch = adminHtml.match(/CACHE_KEY\s*=\s*'([^']+)'/);

  const photoRes = await fetchWithRetry('https://admin.inzanathletics.com/member-photos/10018.jpg', {
    method: 'HEAD',
  });
  const vbtRes = await fetchWithRetry(`https://vbt.mitrixo.com?_t=${Date.now()}`);
  const healthRes = await fetchWithRetry('https://admin.inzanathletics.com/api/health');
  const healthJson = await healthRes.json().catch(() => ({}));

  const p20Res = await fetchWithRetry('https://admin.inzanathletics.com/api/member/resolve-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': 'inzanathletics' },
    body: JSON.stringify({ memberId: 'P20' }),
  });
  const p20Text = await p20Res.text();

  let trickleSummary = null;
  if (fs.existsSync(STATE_PATH) && fs.existsSync(TRICKLE_PATH)) {
    const st = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    const tr = JSON.parse(fs.readFileSync(TRICKLE_PATH, 'utf8'));
    const done = st.completedPaths || {};
    const remainingByBucket = {};
    let remainingOperational = 0;
    let remainingAttHistory = 0;
    for (const w of tr.writes || []) {
      if (done[w.rel_path]) continue;
      const parts = String(w.rel_path || '').split('/');
      const bucket = parts.length === 2 ? parts[0] : `${parts[0]}/*/${parts[2]}`;
      remainingByBucket[bucket] = (remainingByBucket[bucket] || 0) + 1;
      if (bucket.endsWith('/attendance_history')) remainingAttHistory++;
      else remainingOperational++;
    }
    trickleSummary = {
      updatedAt: st.updatedAt,
      photoBackfillDone: Boolean(st.photoBackfillDone),
      completedPaths: Object.keys(done).length,
      remainingOperationalDocs: remainingOperational,
      remainingAttendanceHistoryDocs: remainingAttHistory,
      remainingByBucket,
    };
  }

  console.log('=== POST-MIGRATION VERIFICATION ===');
  console.log('Auth Sign-In:', JSON.stringify(authChecks));
  console.log('Inzan Frontend:', {
    status: adminRes.status,
    cacheKey: cacheMatch ? cacheMatch[1] : null,
    sampleCdnPhoto: { status: photoRes.status, contentType: photoRes.headers.get('content-type') },
  });
  console.log('VBT Frontend:', { status: vbtRes.status });
  console.log('Gateway Health:', { status: healthRes.status, body: healthJson });
  console.log('P20 Resolve Email:', {
    status: p20Res.status,
    body: p20Text,
    note: p20Res.status === 500 && p20Text.includes('RESOURCE_EXHAUSTED')
      ? 'Firestore daily read quota awaits midnight PT / 10:00 AM Cairo reset'
      : 'OK',
  });
  console.log('Trickle State:', JSON.stringify(trickleSummary, null, 2));
}

main().catch((err) => {
  console.error('[verify-post-migration] FATAL:', err);
  process.exit(1);
});
