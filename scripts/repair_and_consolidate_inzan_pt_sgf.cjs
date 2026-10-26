/**
 * Inzan Athletics PT & SGF Letter Code Reconciliation & Profile Consolidation Engine
 *
 * Background:
 * RedGITS legacy system did not support multiple packages per member. When a member
 * bought PT or SGF classes, RedGITS created a brand new member profile with a barcode
 * starting with 'Q' (Personal Training) or 'O'/'o' (Small Group Fitness), while standard
 * gym memberships had numeric Member IDs (e.g. 3640, 3149, 1430).
 *
 * This engine:
 * 1. Cleans all corrupted `[object Object]` and `{}` in `memberId` and `barcode`.
 * 2. Restores original RedGITS barcodes (Q1421, o968, etc.) from `redgits_inzan_database.json`.
 * 3. Tags each package with its letter-code barcode and category ('PT' or 'SGF').
 * 4. Consolidates split PT/SGF duplicate accounts (same phone + same name) into a single master profile,
 *    storing all card/letter codes in `secondaryBarcodes` so any scan (Card, PT barcode, SGF barcode)
 *    immediately resolves to the member.
 * 5. Marks duplicate secondary accounts as `status: 'Merged'`, `mergedInto: masterId`.
 */

require('dotenv').config();
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || 'faa-test-guide-v2';
const DATABASE_ID = 'db-inzanathletics';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}
const db = getFirestore(DATABASE_ID);
db.settings({ ignoreUndefinedProperties: true });

const isDryRun = process.argv.includes('--dry-run');

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePhone(raw) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits || digits.length < 8) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2);
  if (digits.startsWith('201') && (digits.length === 12 || digits.length === 11)) return '0' + digits.slice(2);
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function isCorruptedId(val) {
  if (!val) return false;
  if (typeof val === 'object') return true;
  const str = String(val).trim();
  return str.includes('[object Object]') || str === '{}' || str === 'null' || str === 'undefined';
}

function removeUndefined(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof FieldValue) return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = removeUndefined(v);
    }
  }
  return out;
}

async function run() {
  console.log(`=== Inzan PT/SGF Reconciliation & Consolidation (Dry-Run: ${isDryRun}) ===`);
  
  // 1. Load RedGITS database export for original barcodes & member codes
  const redgitsFilePath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_inzan_database.json');
  const redgitsDb = JSON.parse(fs.readFileSync(redgitsFilePath, 'utf8'));
  const redgitsMap = new Map();
  for (const m of redgitsDb.members) {
    redgitsMap.set(String(m.redgitsId), m);
  }
  console.log(`Loaded ${redgitsMap.size} records from RedGITS export.`);

  // 2. Fetch all clients from Firestore `db-inzanathletics`
  console.log('Fetching all clients from Firestore...');
  const snap = await db.collection('clients').get();
  console.log(`Total clients in db-inzanathletics: ${snap.size}`);

  const clients = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  // 3. Build lookup maps:
  // - Phone -> list of client docs
  // - Phone -> best numeric memberId
  const phoneToClients = new Map();
  const phoneToNumericMemId = new Map();

  for (const c of clients) {
    const p = normalizePhone(c.phone);
    if (!p) continue;
    if (!phoneToClients.has(p)) phoneToClients.set(p, []);
    phoneToClients.get(p).push(c);

    const m = c.memberId;
    if (m && typeof m === 'string' && /^\d+$/.test(m.trim()) && m.trim().length <= 5 && !isCorruptedId(m)) {
      const curNum = Number(m.trim());
      const prevNum = Number(phoneToNumericMemId.get(p) || '0');
      if (curNum > prevNum) {
        phoneToNumericMemId.set(p, m.trim());
      }
    }
  }

  console.log(`Unique phone numbers indexed: ${phoneToClients.size}`);
  console.log(`Numeric Member IDs mapped by phone: ${phoneToNumericMemId.size}`);

  let corruptedFixedCount = 0;
  let barcodesRestoredCount = 0;
  let consolidatedGroupsCount = 0;
  let secondaryProfilesMergedCount = 0;

  const docUpdates = new Map(); // docId -> updateData

  function queueUpdate(docId, patch) {
    if (!docUpdates.has(docId)) docUpdates.set(docId, {});
    Object.assign(docUpdates.get(docId), patch);
  }

  // 4. STEP 1: Fix corrupted memberId and barcode for ALL clients
  for (const c of clients) {
    const rId = String(c.redgitsId || c.leadId || c.id.replace(/^redgits-/, '')).trim();
    const rMember = redgitsMap.get(rId);
    const redgitsBarcode = (rMember?.fields?.['Bar-code / RFID'] || '').trim();
    const redgitsMemberCode = (rMember?.fields?.['Member Code'] || '').trim();
    const normP = normalizePhone(c.phone);
    const siblingNumericId = normP ? phoneToNumericMemId.get(normP) : null;

    const patch = {};
    let needsPatch = false;

    // A. Check barcode corruption or missing RedGITS barcode
    if (isCorruptedId(c.barcode) || (!c.barcode && redgitsBarcode)) {
      patch.barcode = redgitsBarcode || c.cardId || rId;
      barcodesRestoredCount++;
      needsPatch = true;
    } else if (redgitsBarcode && c.barcode === rId && redgitsBarcode !== rId) {
      // If barcode was set to lead/row ID instead of actual Q/O RFID barcode
      patch.barcode = redgitsBarcode;
      barcodesRestoredCount++;
      needsPatch = true;
    }

    // B. Check memberId corruption
    if (isCorruptedId(c.memberId)) {
      if (c.status === 'Lead') {
        patch.memberId = FieldValue.delete();
      } else if (siblingNumericId) {
        patch.memberId = siblingNumericId;
      } else if (redgitsBarcode && /^[qo]/i.test(redgitsBarcode)) {
        // It's a PT / SGF letter-code account: don't store [object Object]
        patch.memberId = FieldValue.delete();
      } else if (/^\d+$/.test(redgitsMemberCode) && Number(redgitsMemberCode) < 10000) {
        patch.memberId = redgitsMemberCode;
      } else {
        patch.memberId = FieldValue.delete();
      }
      corruptedFixedCount++;
      needsPatch = true;
    }

    if (needsPatch) {
      queueUpdate(c.id, patch);
    }
  }

  console.log(`Corrupted memberId/barcode cleanup queued: ${docUpdates.size} documents.`);

  // 5. STEP 2: Group consolidation for same-phone, same-name accounts with PT/SGF splits
  for (const [phone, group] of phoneToClients.entries()) {
    if (group.length < 2) continue;

    // Check if group members share the same name (or significant overlap)
    const normNames = group.map(g => normalizeName(g.name));
    const firstNorm = normNames[0];
    const isSameHuman = normNames.every(n => n === firstNorm || n.includes(firstNorm) || firstNorm.includes(n));
    if (!isSameHuman) continue;

    // Check if any member in group has PT (Q...) or SGF (O...) codes or packages
    const hasPtOrSgfOrMultiPkg = group.some(g => {
      const b = String(g.barcode || '');
      const rId = String(g.redgitsId || g.leadId || g.id.replace(/^redgits-/, '')).trim();
      const rM = redgitsMap.get(rId);
      const rB = (rM?.fields?.['Bar-code / RFID'] || '').trim();
      const pkgs = g.packages || [];
      return (
        /^[qo]/i.test(b) ||
        /^[qo]/i.test(rB) ||
        pkgs.some(p => /pt|personal|sgf|group class/i.test(p.name || p.packageName || ''))
      );
    });

    if (!hasPtOrSgfOrMultiPkg) continue;

    // Determine the master profile:
    // 1st Priority: Active profile with the most packages
    // 2nd Priority: Active profile with numeric memberId
    // 3rd Priority: Profile with the most packages
    // 4th Priority: Profile with numeric memberId
    const sorted = [...group].sort((a, b) => {
      const aActive = a.status === 'Active' ? 1 : 0;
      const bActive = b.status === 'Active' ? 1 : 0;
      if (aActive !== bActive) return bActive - aActive;

      const aPkgLen = (a.packages || []).length;
      const bPkgLen = (b.packages || []).length;
      if (aPkgLen !== bPkgLen) return bPkgLen - aPkgLen;

      const aNum = a.memberId && /^\d+$/.test(String(a.memberId).trim()) ? 1 : 0;
      const bNum = b.memberId && /^\d+$/.test(String(b.memberId).trim()) ? 1 : 0;
      if (aNum !== bNum) return bNum - aNum;

      return b.id.localeCompare(a.id);
    });

    const master = sorted[0];
    const siblings = sorted.slice(1);

    // Collect all packages across group
    const combinedPkgs = [];
    const seenPkgKeys = new Set();
    const allBarcodes = new Set();

    if (master.barcode && !isCorruptedId(master.barcode)) allBarcodes.add(master.barcode);
    if (master.cardId) allBarcodes.add(master.cardId);

    // Add master existing secondary barcodes
    if (Array.isArray(master.secondaryBarcodes)) {
      master.secondaryBarcodes.forEach(b => b && allBarcodes.add(b));
    }

    // Process all members in group to harvest packages and barcodes
    for (const m of group) {
      const rId = String(m.redgitsId || m.leadId || m.id.replace(/^redgits-/, '')).trim();
      const rM = redgitsMap.get(rId);
      const rBarcode = (rM?.fields?.['Bar-code / RFID'] || '').trim();
      const mBarcode = !isCorruptedId(m.barcode) ? m.barcode : rBarcode;

      if (mBarcode) allBarcodes.add(mBarcode);
      if (m.cardId) allBarcodes.add(m.cardId);
      if (m.memberId && typeof m.memberId === 'string' && /^\d+$/.test(m.memberId)) {
        allBarcodes.add(m.memberId);
      }

      for (const p of (m.packages || [])) {
        const pName = (p.name || p.packageName || 'Package').trim();
        const pStart = p.startDate || '';
        const pEnd = p.endDate || '';
        const pSess = p.totalSessions || p.sessionsTotal || 0;
        const key = `${pName}|${pStart}|${pEnd}|${pSess}`;

        if (!seenPkgKeys.has(key)) {
          seenPkgKeys.add(key);

          // Infer package letter barcode and category
          let pkgBarcode = p.barcode || mBarcode;
          let pkgCategory = p.category || p.type || 'Membership';

          if (/pt|personal/i.test(pName) || (pkgBarcode && /^q/i.test(pkgBarcode))) {
            pkgCategory = 'PT';
            if (!pkgBarcode && rBarcode && /^q/i.test(rBarcode)) pkgBarcode = rBarcode;
          } else if (/sgf|group class/i.test(pName) || (pkgBarcode && /^o/i.test(pkgBarcode))) {
            pkgCategory = 'SGF';
            if (!pkgBarcode && rBarcode && /^o/i.test(rBarcode)) pkgBarcode = rBarcode;
          }

          const cleanPkg = {
            ...p,
            id: p.id || `pkg-${master.id}-${combinedPkgs.length + 1}`,
            packageName: pName,
            category: pkgCategory,
            status: p.status || (m.status === 'Active' ? 'Active' : 'Expired'),
          };
          if (pkgBarcode) cleanPkg.barcode = pkgBarcode;
          else delete cleanPkg.barcode;
          combinedPkgs.push(cleanPkg);
        }
      }
    }

    // Filter secondary barcodes to only keep real card barcodes and letter codes (Q..., O...)
    const cleanSecondaryBarcodes = Array.from(allBarcodes).filter(b => {
      if (!b || typeof b !== 'string') return false;
      const s = b.trim();
      if (isCorruptedId(s)) return false;
      if (/^[a-z]\d+/i.test(s)) return true; // Letter code (Q1421, o968, etc.)
      if (/^\d{1,5}$/.test(s)) return true; // Numeric card ID (3640, 3149, 1430, etc.)
      return false;
    });

    // Best numeric member ID for master
    const bestNumericId = phoneToNumericMemId.get(phone);
    const masterUpdates = {
      packages: combinedPkgs,
      secondaryBarcodes: cleanSecondaryBarcodes,
      mergedClientIds: siblings.map(s => s.id),
      updatedAt: new Date().toISOString(),
    };

    if (bestNumericId && (!master.memberId || isCorruptedId(master.memberId))) {
      masterUpdates.memberId = bestNumericId;
    }

    // Set master barcode if currently missing or corrupted
    if (!master.barcode || isCorruptedId(master.barcode)) {
      masterUpdates.barcode = bestNumericId || Array.from(allBarcodes)[0] || master.id;
    }

    queueUpdate(master.id, masterUpdates);

    // Now mark secondary sibling accounts as Merged
    for (const sib of siblings) {
      queueUpdate(sib.id, {
        status: 'Merged',
        mergedInto: master.id,
        mergedReason: 'RedGITS PT/SGF package consolidation into unified member account',
        updatedAt: new Date().toISOString(),
      });
      secondaryProfilesMergedCount++;
    }

    consolidatedGroupsCount++;

    if (phone === '01098836182') {
      console.log('--- YASSIN MOHAMED CONSOLIDATION PREVIEW ---');
      console.log('Master ID:', master.id);
      console.log('Master Updates:', JSON.stringify(masterUpdates, null, 2));
      console.log('Siblings to be Merged:', siblings.map(s => s.id));
    }
  }

  console.log(`\n=== Summary of Actions ===`);
  console.log(`Corrupted memberId fields cleaned: ${corruptedFixedCount}`);
  console.log(`Barcodes restored from RedGITS: ${barcodesRestoredCount}`);
  console.log(`Member groups consolidated: ${consolidatedGroupsCount}`);
  console.log(`Secondary duplicate accounts marked as Merged: ${secondaryProfilesMergedCount}`);
  console.log(`Total documents to update in Firestore: ${docUpdates.size}`);

  if (isDryRun) {
    console.log('\n[DRY RUN COMPLETE] No changes written to database.');
    return;
  }

  // Commit updates in batches of 400
  console.log('\nWriting updates to Firestore db-inzanathletics...');
  const batchSize = 400;
  const entries = Array.from(docUpdates.entries());
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + batchSize);
    for (const [id, patch] of chunk) {
      const ref = db.collection('clients').doc(id);
      batch.set(ref, removeUndefined(patch), { merge: true });
    }
    await batch.commit();
    console.log(`Committed chunk ${Math.floor(i / batchSize) + 1} of ${Math.ceil(entries.length / batchSize)} (${chunk.length} docs)`);
  }

  console.log('=== All updates committed successfully! ===');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error during reconciliation:', err);
    process.exit(1);
  });
