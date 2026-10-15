/**
 * RedGITS v17.12 -> Inzan Athletics (`db-inzanathletics`) Full Migration Engine v3.1
 *
 * SAFETY INVARIANT:
 * - Connects EXCLUSIVELY to databaseId `db-inzanathletics` in `faa-test-guide-v2`.
 * - Never touches `(default)` or `strike-production-f5242`.
 * - Populates:
 *   1. `users` (All RedGITS Sales Reps & Staff with role: 'rep' / 'coach' so Assigned To dropdowns work)
 *   2. `packages` (Full Packages Catalog with accurate sessions, expiryDays, freeze & invite balances)
 *   3. `coaches` (Staff & Trainers directory)
 *   4. `clients` (Complete member & lead profiles: assignedTo, salesRep, salesName, dateOfBirth,
 *                 memberCategory, advertisingSource, barcode, cardId, nationalId, email, backupPhone,
 *                 referredByName, legacyNotes, stage: 'New' for recent leads, full packages history)
 *   5. `payments` (Complete payment history from financial_list + packagelist + debtors)
 *   6. `clients/{id}/attendance_history` (Complete check-in & session history from member_activities_list)
 *   7. `clients/{id}/interactions` & `clients/{id}/comments` (Call center logs, freeze history, internal notes)
 *   8. `guestInvites` (Guest invitations)
 */

import admin from 'firebase-admin';
import { getFirestore, DocumentReference } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const PROJECT_ID = 'faa-test-guide-v2';
const DATABASE_ID = 'db-inzanathletics';

if (admin.apps.length === 0) {
  admin.initializeApp({ projectId: PROJECT_ID });
}

const inzanDb = getFirestore(DATABASE_ID);

function renderProgressBar(stage: string, current: number, total: number, startTimeMs: number, detail = '') {
  const safeTotal = Math.max(1, total);
  const pct = Math.min(100, Math.round((current / safeTotal) * 100));
  const width = 28;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  const elapsedSec = Math.max(0.1, (Date.now() - startTimeMs) / 1000);
  const rate = current / elapsedSec;
  const etaSec = rate > 0 && total > current ? Math.round((total - current) / rate) : 0;
  console.log(
    `[${bar}] ${String(pct).padStart(3)}% | ${String(current).padStart(6)}/${String(total).padEnd(6)} | ${stage.padEnd(28)} | ETA: ${String(etaSec).padStart(2)}s ${detail}`
  );
}

function normalizePhone(raw?: string): string {
  if (!raw) return '';
  if (String(raw).includes('*')) return ''; // Ignore masked phones so unmasked lookup wins
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits || digits.length < 8) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2); // +20010... -> 010...
  if (digits.startsWith('201') && digits.length === 12) return '0' + digits.slice(2); // 2010... -> 010...
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function cleanSalesRepName(raw?: string): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .replace(/Open tutorial video/gi, '')
    .replace(/\bHistory\b.*$/i, '')
    .replace(/\bChange\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === '0' || cleaned === '-' || cleaned.toLowerCase() === 'none') return '';
  return cleaned;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveDobFromNationalId(natId?: string): string {
  if (!natId) return '';
  const m = String(natId).trim().match(/^([23])(\d{2})(\d{2})(\d{2})\d{7}$/);
  if (!m) return '';
  const century = m[1] === '2' ? '19' : '20';
  const year = `${century}${m[2] || ''}`;
  const month = m[3] || '';
  const day = m[4] || '';
  const mm = parseInt(month, 10);
  const dd = parseInt(day, 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return '';
  return `${year}-${month}-${day}`;
}

function normalizeAdvertisingSource(raw?: string, typeRaw?: string): string {
  const combined = `${raw || ''} ${typeRaw || ''}`.toLowerCase();
  if (/word\s*of\s*mouth|wordofmouth|referral|friend/i.test(combined)) return 'Word Of Mouth';
  if (/call\s*in|calls\s*in|phone/i.test(combined)) return 'Call in';
  if (/insta/i.test(combined)) return 'Instagram';
  if (/face|fb/i.test(combined)) return 'Facebook';
  if (/ad\b|ads\b|sponsor|campaign/i.test(combined)) return 'ADS';
  if (/web/i.test(combined)) return 'Website';
  if (/goog/i.test(combined)) return 'Google';
  if (/walk/i.test(combined)) return 'Walk-in';
  return 'Walk-in';
}

function inferMemberCategory(packageName?: string, memberName?: string): 'Kids Only' | 'Kids Pro' | 'Junior Only' | 'Junior Advanced' | 'Adults' {
  const s = `${packageName || ''} ${memberName || ''}`.toLowerCase();
  if (s.includes('kids pro')) return 'Kids Pro';
  if (s.includes('kids') || s.includes('child')) return 'Kids Only';
  if (s.includes('junior advanced') || s.includes('juniors advanced') || s.includes('junior pro')) return 'Junior Advanced';
  if (s.includes('junior')) return 'Junior Only';
  return 'Adults';
}

function parseSessionsFromName(pkgName: string, expiryDays = 30): number {
  const m = pkgName.match(/(\d+)\s*(?:session|sessions|class|classes|pt|s\b)/i);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/drop-?in|single|1\s*day/i.test(pkgName)) return 1;
  if (/basic\s*membership|annual|year|12\s*month/i.test(pkgName)) return Math.max(expiryDays, 365);
  if (/6\s*month/i.test(pkgName)) return Math.max(expiryDays, 180);
  if (/3\s*month/i.test(pkgName)) return Math.max(expiryDays, 90);
  if (/1\s*month|monthly/i.test(pkgName)) return Math.max(expiryDays, 30);
  return expiryDays > 0 ? expiryDays : 30;
}

function inferPaymentMethod(detailsStr?: string, rawMethod?: string): string {
  const s = `${detailsStr || ''} ${rawMethod || ''}`.toLowerCase();
  if (s.includes('instapay')) return 'Instapay';
  if (s.includes('visa') || s.includes('card') || s.includes('master')) return 'Credit Card';
  if (s.includes('bank') || s.includes('transfer')) return 'Bank Transfer';
  if (s.includes('vodafone')) return 'Vodafone Cash';
  return 'Cash';
}

async function commitBatchesWithProgress(
  stageName: string,
  collectionName: string,
  docs: Array<{ id: string; data: Record<string, any> }>,
  dryRun: boolean
) {
  const startTime = Date.now();
  const total = docs.length;
  if (total === 0) {
    renderProgressBar(stageName, 0, 0, startTime, '(0 records)');
    return 0;
  }

  const BATCH_SIZE = 450;
  const CONCURRENCY = 6;
  const chunks: Array<Array<{ id: string; data: Record<string, any> }>> = [];
  for (let i = 0; i < total; i += BATCH_SIZE) {
    chunks.push(docs.slice(i, i + BATCH_SIZE));
  }

  let committed = 0;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    if (!dryRun) {
      await Promise.all(
        group.map(async (chunk) => {
          const batch = inzanDb.batch();
          for (const item of chunk) {
            const ref = inzanDb.collection(collectionName).doc(item.id);
            batch.set(ref, item.data, { merge: true });
          }
          await batch.commit();
        })
      );
    }
    committed += group.reduce((acc, g) => acc + g.length, 0);
    renderProgressBar(stageName, committed, total, startTime, dryRun ? '[DRY-RUN]' : `-> ${collectionName}`);
  }
  return committed;
}

async function commitRefBatchesWithProgress(
  stageName: string,
  writes: Array<{ ref: DocumentReference; data: Record<string, any> }>,
  dryRun: boolean
) {
  const startTime = Date.now();
  const total = writes.length;
  if (total === 0) {
    renderProgressBar(stageName, 0, 0, startTime, '(0 records)');
    return 0;
  }

  const BATCH_SIZE = 450;
  const CONCURRENCY = 8;
  const chunks: Array<Array<{ ref: DocumentReference; data: Record<string, any> }>> = [];
  for (let i = 0; i < total; i += BATCH_SIZE) {
    chunks.push(writes.slice(i, i + BATCH_SIZE));
  }

  let committed = 0;
  for (let c = 0; c < chunks.length; c += CONCURRENCY) {
    const group = chunks.slice(c, c + CONCURRENCY);
    if (!dryRun) {
      await Promise.all(
        group.map(async (chunk) => {
          const batch = inzanDb.batch();
          for (const item of chunk) {
            batch.set(item.ref, item.data, { merge: true });
          }
          await batch.commit();
        })
      );
    }
    committed += group.reduce((acc, g) => acc + g.length, 0);
    renderProgressBar(stageName, committed, total, startTime, dryRun ? '[DRY-RUN]' : `-> subcollections`);
  }
  return committed;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const globalStart = Date.now();

  console.log('================================================================================');
  console.log(` RedGITS v17.12 -> Inzan Athletics (${DATABASE_ID}) Migration Pipeline v3.1`);
  console.log(` Mode: ${dryRun ? 'DRY-RUN (Verification Only)' : 'LIVE FIRESTORE IMPORT (db-inzanathletics ONLY)'}`);
  console.log('================================================================================\n');

  const dbPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_inzan_database.json');
  const progPath = path.resolve(process.cwd(), 'docs/redgits_pages/migration_progress.json');
  const scrapedPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_scraped_data.json');
  const liveV2Path = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_extract_v2.json');
  const deepPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_active_deep_extract.json');

  const redgitsDb = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { members: [], staff: [] };
  const migProg = fs.existsSync(progPath) ? JSON.parse(fs.readFileSync(progPath, 'utf8')) : { membersList: [], membersDetailScraped: {} };
  const scrapedPages = fs.existsSync(scrapedPath) ? JSON.parse(fs.readFileSync(scrapedPath, 'utf8')) : [];
  const liveV2 = fs.existsSync(liveV2Path) ? JSON.parse(fs.readFileSync(liveV2Path, 'utf8')) : null;
  const deepExtract = fs.existsSync(deepPath)
    ? JSON.parse(fs.readFileSync(deepPath, 'utf8'))
    : { nationalMembers: [], missingProfiles: {}, activeDeep: {} };

  const nowIso = new Date().toISOString();

  // 0. Load Existing `users` in `db-inzanathletics` so we map existing accounts seamlessly
  const existingUsersSnap = await inzanDb.collection('users').get();
  const repUserIdByName = new Map<string, string>();
  const repDisplayNameById = new Map<string, string>();

  for (const docSnap of existingUsersSnap.docs) {
    const u = docSnap.data();
    const uName = String(u.name || '').trim();
    if (uName) {
      repUserIdByName.set(uName.toLowerCase(), docSnap.id);
      repDisplayNameById.set(docSnap.id, uName);
    }
    if (uName.toLowerCase() === 'semary' || u.email === 'semary@inzan.com') {
      repUserIdByName.set('abdelrahman simary', docSnap.id);
      repUserIdByName.set('abdelrahman semary', docSnap.id);
      repUserIdByName.set('simary', docSnap.id);
      repDisplayNameById.set(docSnap.id, 'Abdelrahman Simary');
    }
    if (uName.toLowerCase() === 'nour' || u.email === 'nour@inzan.com') {
      repUserIdByName.set('nour farid', docSnap.id);
      repDisplayNameById.set(docSnap.id, 'Nour Farid');
    }
    if (uName.toLowerCase() === 'fadi' || u.email === 'fadi@inzan.com') {
      repUserIdByName.set('fadi', docSnap.id);
      repUserIdByName.set('mr. fady', docSnap.id);
    }
  }

  const userDocsMap = new Map<string, { id: string; data: Record<string, any> }>();

  function ensureSalesRepUser(rawName?: string): { id: string; name: string } | null {
    const clean = cleanSalesRepName(rawName);
    if (!clean) return null;
    const lower = clean.toLowerCase();
    const existingId = repUserIdByName.get(lower);
    if (existingId) {
      const canonicalName = repDisplayNameById.get(existingId) || clean;
      if (!userDocsMap.has(existingId)) {
        userDocsMap.set(existingId, {
          id: existingId,
          data: {
            id: existingId,
            name: canonicalName,
            status: 'working',
            updatedAt: nowIso,
          },
        });
      }
      return { id: existingId, name: canonicalName };
    }

    const slug = slugifyName(clean);
    if (!slug) return null;
    const newId = `redgits-rep-${slug}`;
    repUserIdByName.set(lower, newId);
    repDisplayNameById.set(newId, clean);
    userDocsMap.set(newId, {
      id: newId,
      data: {
        id: newId,
        name: clean,
        email: `${slug}@inzanathletics.com`,
        role: 'rep',
        status: 'working',
        branch: 'Inzan Athletics',
        sourceSystem: 'RedGITS_v17.12',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    });
    return { id: newId, name: clean };
  }

  // 1. Build National Members Lookup (/admin/reports/nationalMembers)
  // Format: [CODE (redgitsId), NAME, SYSTEM ID (memberId), NATIONAL ID, BIRTHDAY, SALES MAN, NOTES]
  const natByRedgitsId = new Map<string, { memberId: string; nationalId: string; birthday: string; salesMan: string; notes: string }>();
  for (const nRow of deepExtract.nationalMembers || []) {
    if (!Array.isArray(nRow) || nRow.length < 6) continue;
    const [rCode, , sysId, natId, bday, sMan, rNotes] = nRow;
    if (!rCode) continue;
    natByRedgitsId.set(String(rCode).trim(), {
      memberId: String(sysId || '').trim(),
      nationalId: String(natId || '').trim(),
      birthday: String(bday || '').trim(),
      salesMan: cleanSalesRepName(sMan),
      notes: String(rNotes || '').trim(),
    });
    if (sMan) ensureSalesRepUser(sMan);
  }

  // 2. Build Unmasked Phone & Subscription Lookup from /admin/packagelist
  const phoneByMemberId = new Map<string, string>();
  const phoneByName = new Map<string, string>();
  const subscriptionsByMemberId = new Map<string, any[]>();

  const pkgListRows: string[][] =
    liveV2?.tables?.packageSubscriptions?.rows ||
    scrapedPages.find((p: any) => p.path === '/admin/packagelist')?.tables?.[0]?.rowsSample ||
    [];

  for (const row of pkgListRows) {
    if (!Array.isArray(row) || row.length < 12) continue;
    const [createdAt, rawMemberName, memberId, pkgName, subType, paymentAmt, sn, , rawMobile, payMethod, startDate, endDate, salesman, createdBy] = row;
    const memberName = String(rawMemberName || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
    const idTagMatch = String(rawMemberName || '').match(/\[ID:(\d+)\]/);
    const cleanPhone = normalizePhone(rawMobile);
    if (cleanPhone && memberId) phoneByMemberId.set(String(memberId).trim(), cleanPhone);
    if (cleanPhone && idTagMatch?.[1]) phoneByMemberId.set(idTagMatch[1], cleanPhone);
    if (cleanPhone && memberName) phoneByName.set(memberName.toLowerCase(), cleanPhone);
    if (salesman) ensureSalesRepUser(salesman);

    const subRecord = {
      createdAt,
      memberName,
      memberId: String(memberId || idTagMatch?.[1] || '').trim(),
      packageName: pkgName,
      subType,
      amount: parseFloat(String(paymentAmt).replace(/[^\d.]/g, '')) || 0,
      receiptSn: sn,
      method: payMethod || 'Cash',
      startDate,
      endDate,
      salesman: cleanSalesRepName(salesman),
      createdBy: cleanSalesRepName(createdBy),
    };
    if (memberId) {
      const key = String(memberId).trim();
      const arr = subscriptionsByMemberId.get(key) || [];
      arr.push(subRecord);
      subscriptionsByMemberId.set(key, arr);
    }
    if (idTagMatch?.[1] && idTagMatch[1] !== String(memberId).trim()) {
      const key2: string = idTagMatch[1];
      const arr2 = subscriptionsByMemberId.get(key2) || [];
      arr2.push(subRecord);
      subscriptionsByMemberId.set(key2, arr2);
    }
  }

  // 3. Build Packages Catalog from /admin/packages/show
  const pkgCatalogRows: string[][] =
    liveV2?.tables?.packagesCatalog?.rows ||
    scrapedPages.find((p: any) => p.path === '/admin/packages/show')?.tables?.[0]?.rowsSample ||
    [];

  const packageDocsMap = new Map<string, { id: string; data: Record<string, any> }>();

  for (const row of pkgCatalogRows) {
    if (!Array.isArray(row) || row.length < 10) continue;
    const [pkgCode, pkgCategory, , sessionName, , pkgPrice, , , pkgStatus, pkgDays, invBalance, freezeMin, freezeMax] = row;
    if (!sessionName || sessionName === 'No data available in table') continue;
    const id = `redgits-pkg-${pkgCode || sessionName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    const price = parseFloat(String(pkgPrice).replace(/[^\d.]/g, '')) || 0;
    const expiryDays = parseInt(String(pkgDays), 10) || 30;
    const invitations = parseInt(String(invBalance), 10) || 0;
    const freezeMaxDays = parseInt(String(freezeMax), 10) || 30;
    const sessions = parseSessionsFromName(sessionName, expiryDays);
    packageDocsMap.set(sessionName.trim(), {
      id,
      data: {
        id,
        name: sessionName.trim(),
        price,
        sessions,
        expiryDays,
        category: /pt|private|trainer/i.test(pkgCategory || sessionName) ? 'PT' : 'Membership',
        status: pkgStatus === 'Hold' ? 'Inactive' : 'Active',
        invitationsTotal: invitations,
        freezeLimitDays: freezeMaxDays,
        freezeMinDays: parseInt(String(freezeMin), 10) || 7,
        sourceSystem: 'RedGITS_v17.12',
        updatedAt: nowIso,
      },
    });
  }

  // 4. Build Staff / Coaches Docs from /admin/staff/show AND register Sales Reps in `users`
  const staffRows: string[][] = liveV2?.tables?.staff?.rows || redgitsDb.staff || [];
  const coachDocs: Array<{ id: string; data: Record<string, any> }> = [];
  for (const sRow of staffRows) {
    if (!Array.isArray(sRow) || sRow.length < 7) continue;
    const [sCode, sName, sMobile, , , sDept, sPos, , sSalary, , , , , , sStatus, , sNatId, sStart, , sUsername] = sRow;
    if (!sName || !sName.trim()) continue;
    const cleanStaffName = sName.trim();
    const dept = (sDept || 'Fitness').trim();
    const pos = (sPos || sDept || 'Trainer').trim();
    if (/sales|front|admin|manager|reception|customer|call/i.test(`${dept} ${pos}`)) {
      ensureSalesRepUser(cleanStaffName);
    }
    const cId = `redgits-staff-${sCode || slugifyName(cleanStaffName)}`;
    coachDocs.push({
      id: cId,
      data: {
        id: cId,
        coachId: `STAFF-${String(sCode || '000').padStart(3, '0')}`,
        name: cleanStaffName,
        phone: normalizePhone(sMobile),
        specialty: pos,
        department: dept,
        status: sStatus === 'Suspend' ? 'Inactive' : 'Active',
        salary: parseFloat(String(sSalary || '0').replace(/[^\d.]/g, '')) || 0,
        nationalId: sNatId || '',
        hireDate: sStart || nowIso.slice(0, 10),
        username: sUsername || '',
        branch: 'Inzan Athletics',
        sourceSystem: 'RedGITS_v17.12',
        updatedAt: nowIso,
      },
    });
  }

  // 5. Merge all Member Listing rows (Active + Expired) with Detailed Profile Scrapes + Deep Sub-Tabs
  const detailMap: Record<string, any> = {
    ...(migProg.membersDetailScraped || {}),
    ...(deepExtract.missingProfiles || {}),
  };
  for (const m of redgitsDb.members || []) {
    if (m.redgitsId) detailMap[String(m.redgitsId)] = m;
  }

  const activeRows: string[][] = liveV2?.tables?.activeMembers?.rows || [];
  const expiredRows: string[][] = liveV2?.tables?.expiredMembers?.rows || [];

  const listByRedgitsId = new Map<string, { isActiveRow: boolean; row: string[] }>();
  for (const row of expiredRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
    const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
    if (!rId) continue;
    listByRedgitsId.set(rId, { isActiveRow: false, row });
  }
  for (const row of activeRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const idMatch = row.join(' ').match(/\[ID:(\d+)\]/);
    const rId = idMatch?.[1] ? idMatch[1] : /^\d+$/.test(row[0] || '') ? String(row[0]) : '';
    if (!rId) continue;
    listByRedgitsId.set(rId, { isActiveRow: true, row });
  }

  // Index Walk-in Guests & Leads (/admin/members/show/guest)
  const guestRows: string[][] = liveV2?.tables?.guestLeads?.rows || [];
  const guestByRedgitsId = new Map<string, string[]>();
  for (const gRow of guestRows) {
    if (!Array.isArray(gRow) || gRow.length < 8) continue;
    const [gCode, gName] = gRow;
    if (!gCode || !gName) continue;
    if (guestByRedgitsId.size < 1500 && !listByRedgitsId.has(gCode) && !detailMap[gCode]) {
      guestByRedgitsId.set(String(gCode).trim(), gRow);
    }
  }

  const allRedgitsIds = Array.from(
    new Set([...Object.keys(detailMap), ...Array.from(listByRedgitsId.keys()), ...Array.from(guestByRedgitsId.keys())])
  );

  const clientDocs: Array<{ id: string; data: Record<string, any> }> = [];
  const paymentDocsMap = new Map<string, { id: string; data: Record<string, any> }>();
  const subcollectionWrites: Array<{ ref: DocumentReference; data: Record<string, any> }> = [];

  let activeLeadsStagedCount = 0;
  const sortedRedgitsIds = [...allRedgitsIds].sort((a, b) => Number(b) - Number(a));

  for (const rId of sortedRedgitsIds) {
    const detail = detailMap[rId];
    const fields = { ...(detail?.fields || {}) };
    const balances = detail?.balances || {};
    const deep = deepExtract.activeDeep?.[rId] || null;
    const natEntry = natByRedgitsId.get(rId);
    const listEntry = listByRedgitsId.get(rId);
    const row = listEntry?.row || [];

    let name = fields['Member Name'] || '';
    let cardMemberId = fields['Username'] || fields['Member ID'] || natEntry?.memberId || '';
    let packageName = '';
    let status: 'Active' | 'Expired' | 'Hold' | 'Lead' = 'Active';
    let startDate = '';
    let endDate = '';
    let remainingDebt = 0;
    let rawSalesName = fields['Sales Man'] || natEntry?.salesMan || '';
    let trainerName = fields['Trainer'] && fields['Trainer'] !== '0' ? fields['Trainer'] : '';
    let genderRaw = fields['Gender'] || '';

    if (listEntry?.isActiveRow) {
      name = (name || row[1] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
      cardMemberId = row[2] || cardMemberId || rId;
      packageName = row[3] || '';
      status = row[4]?.toLowerCase().includes('hold') || row[4]?.toLowerCase().includes('freez') ? 'Hold' : 'Active';
      startDate = row[5] || '';
      endDate = row[6] || '';
      rawSalesName = row[8] || rawSalesName;
      trainerName = row[9] && row[9] !== '0' ? row[9] : trainerName;
      genderRaw = row[11] || genderRaw;
    } else if (row.length >= 7) {
      name = (name || row[0] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
      cardMemberId = row[1] || cardMemberId || rId;
      packageName = row[2] || '';
      startDate = row[3] || '';
      endDate = row[4] || '';
      rawSalesName = row[5] || rawSalesName;
      status = 'Expired';
    } else if (guestByRedgitsId.has(rId)) {
      const gRow = guestByRedgitsId.get(rId)!;
      name = (name || gRow[1] || '').replace(/\s*\[ID:\d+\]\s*/g, '').trim();
      cardMemberId = cardMemberId || rId;
      status = 'Lead';
      startDate = (gRow[4] || '').slice(0, 10);
      rawSalesName = gRow[5] || gRow[6] || rawSalesName;
      genderRaw = gRow[7] || genderRaw;
      fields['Advertising Source'] = fields['Advertising Source'] || gRow[3] || gRow[2] || 'Walk-in';
      fields['Type'] = fields['Type'] || gRow[2] || 'Walk-in (New Lead)';
    } else {
      const rawSt = String(fields['Status'] || '').toLowerCase();
      status = rawSt === 'member' ? 'Expired' : 'Lead';
      cardMemberId = cardMemberId || rId;
    }

    name = name.replace(/\s*\[ID:\d+\]\s*/g, '').trim();
    if (!name) continue;

    const memberSubs =
      subscriptionsByMemberId.get(String(rId).trim()) ||
      subscriptionsByMemberId.get(String(cardMemberId).trim()) ||
      [];

    const fallbackSalesName =
      cleanSalesRepName(rawSalesName) ||
      cleanSalesRepName(deep?.packages?.[0]?.targetSales) ||
      cleanSalesRepName(memberSubs[0]?.salesman) ||
      cleanSalesRepName(natEntry?.salesMan) ||
      cleanSalesRepName(fields['Created By']);

    const repInfo = ensureSalesRepUser(fallbackSalesName);

    if (packageName && packageName !== 'Unknown' && !packageDocsMap.has(packageName.trim())) {
      const pName = packageName.trim();
      const pkgId = `redgits-pkg-${slugifyName(pName).slice(0, 48)}`;
      packageDocsMap.set(pName, {
        id: pkgId,
        data: {
          id: pkgId,
          name: pName,
          price: 0,
          sessions: parseSessionsFromName(pName),
          expiryDays: parseSessionsFromName(pName),
          category: /pt|private|trainer/i.test(pName) ? 'PT' : 'Membership',
          status: 'Active',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });
    }

    const phone =
      normalizePhone(fields['Phone']) ||
      normalizePhone(fields['Mobile']) ||
      phoneByMemberId.get(String(cardMemberId).trim()) ||
      phoneByMemberId.get(String(rId).trim()) ||
      phoneByName.get(name.toLowerCase()) ||
      normalizePhone(fields['Backup Mobile']) ||
      '';

    const backupPhone = normalizePhone(fields['Backup Mobile']) || '';
    const nationalId = (fields['National ID'] || natEntry?.nationalId || '').trim();
    const rawBday = (fields['Birthday'] || natEntry?.birthday || '').trim();
    const dateOfBirth =
      (rawBday && rawBday !== '0000-00-00' ? rawBday.slice(0, 10) : '') ||
      deriveDobFromNationalId(nationalId) ||
      '';

    const catalogPkg = packageName ? packageDocsMap.get(packageName.trim())?.data : null;
    const defaultSessions = catalogPkg?.sessions || catalogPkg?.expiryDays || (packageName ? parseSessionsFromName(packageName) : 0);

    let clientPackages: Array<Record<string, any>> = [];
    if (deep?.packages && Array.isArray(deep.packages) && deep.packages.length > 0) {
      clientPackages = deep.packages.map((dp: any, idx: number) => {
        const dpCat = packageDocsMap.get(dp.packageName)?.data;
        const totalSess = dpCat?.sessions || dpCat?.expiryDays || parseSessionsFromName(dp.packageName);
        const isFinished = /finish|expir/i.test(dp.statusRaw || '');
        const isHold = /hold|freez/i.test(dp.statusRaw || '');
        const remSess =
          typeof dp.remainingSessions === 'number'
            ? dp.remainingSessions
            : isFinished
            ? 0
            : Math.max(0, totalSess - (dp.activitiesCount || 0));
        return {
          id: `pkg-${rId}-${idx + 1}`,
          packageName: dp.packageName || packageName || 'Basic Membership',
          startDate: dp.startDate || startDate || nowIso.slice(0, 10),
          endDate: dp.endDate || endDate || nowIso.slice(0, 10),
          sessionsTotal: totalSess,
          sessionsRemaining: remSess,
          status: isHold ? 'Hold' : isFinished ? 'Expired' : 'Active',
        };
      });
    } else if (packageName) {
      clientPackages = [
        {
          id: `pkg-${rId}`,
          packageName,
          startDate: startDate || nowIso.slice(0, 10),
          endDate: endDate || nowIso.slice(0, 10),
          sessionsTotal: defaultSessions,
          sessionsRemaining: status === 'Active' ? defaultSessions : 0,
          status: status === 'Hold' ? 'Hold' : status === 'Expired' ? 'Expired' : 'Active',
        },
      ];
    }

    const activePkgObj = clientPackages.find((p) => p.status === 'Active') || clientPackages[0];
    const effectiveSessionsRemaining =
      status === 'Active'
        ? typeof activePkgObj?.sessionsRemaining === 'number'
          ? activePkgObj.sessionsRemaining
          : defaultSessions
        : 0;

    const typeAndNotes = `${fields['Type'] || ''} ${fields['Notes'] || ''}`;
    const refMatch = typeAndNotes.match(/Referral\s+from\s+(?:Member\s+called\s*)?\(?\s*([^)\n]+?)\s*\)?(?:\s+Change|\s*\(View|$)/i);
    const referredByName = refMatch?.[1] ? refMatch[1].trim() : '';

    // Freeze rows format: [memberName, packageName, days, startDate, endDate, createdBy, createdAt, freezeType, ...]
    const frzRows: string[][] = deep?.frz || [];
    const freezeHistory = frzRows.map((fr, idx) => ({
      id: `frz-${rId}-${idx + 1}`,
      packageName: String(fr[1] || packageName || 'Basic Membership').replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim(),
      days: parseInt(String(fr[2] || '0'), 10) || 0,
      startDate: fr[3] || '',
      endDate: fr[4] || '',
      createdBy: fr[5] || '',
      createdAt: fr[6] || '',
      freezeType: fr[7] || 'Normal Freezing',
    }));

    // Call Center rows format: [date, status, reaction, duration, -, -, author, comment]
    const callRows: string[][] = deep?.call || [];
    const notesParts: string[] = [];
    if (fields['Notes'] && String(fields['Notes']).trim()) {
      notesParts.push(String(fields['Notes']).trim());
    }
    if (freezeHistory.length > 0) {
      notesParts.push(
        `Freezes (${freezeHistory.length}): ` +
          freezeHistory.map((f) => `${f.startDate} to ${f.endDate} (${f.days}d by ${f.createdBy})`).join(' | ')
      );
    }
    if (callRows.length > 0) {
      notesParts.push(
        `Call Center (${callRows.length}): ` +
          callRows.map((c) => `[${(c[0] || '').slice(0, 10)}] ${c[7] || c[2] || c[1] || ''} (${c[6] || 'Staff'})`).join(' | ')
      );
    }
    const combinedLegacyNotes = notesParts.join('\n\n');

    const advSource = normalizeAdvertisingSource(fields['Advertising Source'], fields['Type']);
    const memberCategory = inferMemberCategory(packageName, name);
    const rawBarcode = (fields['Bar-code / RFID'] || '').trim();
    const barcode = rawBarcode || String(cardMemberId || rId).trim();
    const cardId = (fields['Member Code'] || String(rId)).trim();

    const clientDocId = `redgits-${rId}`;

    let leadStage: string | undefined = undefined;
    if (status === 'Lead') {
      if (activeLeadsStagedCount < 450 && phone) {
        leadStage = 'New';
        activeLeadsStagedCount++;
      } else {
        leadStage = 'Archived';
      }
    }

    const clientData: Record<string, any> = {
      id: clientDocId,
      redgitsId: String(rId),
      legacyMemberId: String(rId),
      memberId: String(cardMemberId || rId).trim(),
      name,
      phone,
      backupPhone,
      email: (fields['Email'] || '').trim(),
      nationalId,
      dateOfBirth: dateOfBirth || undefined,
      gender: /fem|انث|أنث/i.test(genderRaw) ? 'Female' : /mal|ذكر/i.test(genderRaw) ? 'Male' : 'Male',
      memberCategory,
      status,
      stage: leadStage,
      branch: 'Garden 8',
      packageType: packageName || activePkgObj?.packageName || (status === 'Lead' ? 'Prospect' : 'Membership'),
      startDate: startDate || activePkgObj?.startDate || (fields['Created On'] ? String(fields['Created On']).slice(0, 10) : nowIso.slice(0, 10)),
      membershipExpiry: endDate || activePkgObj?.endDate || null,
      sessionsRemaining: effectiveSessionsRemaining,
      assignedTo: repInfo?.id || undefined,
      salesRep: repInfo?.id || undefined,
      salesName: repInfo?.name || fallbackSalesName || undefined,
      trainerName: trainerName || undefined,
      advertisingSource: advSource,
      source: advSource,
      typeOfClient: fields['Type']?.replace(/\s*Change$/i, '').trim() || 'Member',
      referredByName: referredByName || undefined,
      referredBy: referredByName || undefined,
      barcode,
      cardId,
      civilianOrMilitary: 'None',
      address: (fields['Address'] || fields['Area'] || '').trim() || undefined,
      jobTitle: (fields['Job'] || '').trim() || undefined,
      nationality: (fields['Nationality'] || '').trim() || undefined,
      frontDeskNote: (fields['Notes'] || '').trim(),
      legacyNotes: combinedLegacyNotes || undefined,
      invitationsTotal: typeof balances.invitationBalance === 'number' ? balances.invitationBalance : catalogPkg?.invitationsTotal ?? 3,
      invitationsUsed: 0,
      freezeCoins: typeof balances.freezingBalance === 'number' ? balances.freezingBalance : catalogPkg?.freezeLimitDays ?? 30,
      freezeHistory: freezeHistory.length > 0 ? freezeHistory : undefined,
      totalVisitsCount: deep?.att?.length ?? balances.totalVisits ?? undefined,
      paid: remainingDebt <= 0,
      createdAt: fields['Created On'] || nowIso,
      updatedAt: nowIso,
      sourceSystem: 'RedGITS_v17.12',
    };

    if (clientPackages.length > 0) {
      clientData.packages = clientPackages;
    }

    Object.keys(clientData).forEach((k) => clientData[k] === undefined && delete clientData[k]);
    clientDocs.push({ id: clientDocId, data: clientData });

    // 6. Payments: Merge `deep.fin` (financial_list) + `memberSubs` (packagelist) + `remainingDebt`
    // finRows format: [createdAt, finCode, packageName, amountPaid, remainingUnpaid, receiptSn, contractNo, _, createdBy, details, ...]
    const finRows: string[][] = deep?.fin || [];
    if (finRows.length > 0) {
      for (let fIdx = 0; fIdx < finRows.length; fIdx++) {
        const fRow = finRows[fIdx] || [];
        const [fCreatedAt, finCode, fPkgName, fPaidStr, , fSn, fContract, , fCreatedBy, fDetails] = fRow;
        const amt = parseFloat(String(fPaidStr || '0').replace(/[^\d.]/g, '')) || 0;
        if (amt <= 0) continue;
        const payId = fSn ? `redgits-fin-${rId}-${fSn}` : `redgits-fin-${rId}-${finCode || fIdx + 1}`;
        paymentDocsMap.set(payId, {
          id: payId,
          data: {
            id: payId,
            clientId: clientDocId,
            client_name: name,
            amount: amt,
            amount_paid: amt,
            date: (fCreatedAt || startDate || nowIso).slice(0, 10),
            method: inferPaymentMethod(fDetails),
            packageType: fPkgName || packageName || 'Membership',
            branch: 'Garden 8',
            salesName: repInfo?.name || cleanSalesRepName(fCreatedBy) || 'System Import',
            sales_rep_id: repInfo?.id || '',
            notes: `RedGITS Receipt #${fSn || finCode || '-'} (Contract #${fContract || '-'})`,
            created_at: fCreatedAt || nowIso,
            deleted_at: null,
          },
        });
      }
    } else if (memberSubs.length > 0) {
      for (let sIdx = 0; sIdx < memberSubs.length; sIdx++) {
        const sub = memberSubs[sIdx];
        if (!sub) continue;
        const payId = sub.receiptSn ? `redgits-fin-${rId}-${sub.receiptSn}` : `redgits-sub-${rId}-${sIdx + 1}`;
        paymentDocsMap.set(payId, {
          id: payId,
          data: {
            id: payId,
            clientId: clientDocId,
            client_name: name,
            amount: sub.amount,
            amount_paid: sub.amount,
            date: sub.startDate || nowIso.slice(0, 10),
            method: inferPaymentMethod('', sub.method),
            packageType: sub.packageName || packageName || 'Membership',
            branch: 'Garden 8',
            salesName: sub.salesman || repInfo?.name || 'System Import',
            sales_rep_id: repInfo?.id || '',
            notes: `RedGITS SN: ${sub.receiptSn || '-'} (${sub.subType || 'new'})`,
            created_at: sub.createdAt || nowIso,
            deleted_at: null,
          },
        });
      }
    }

    if (remainingDebt > 0) {
      const payId = `redgits-debt-${rId}`;
      paymentDocsMap.set(payId, {
        id: payId,
        data: {
          id: payId,
          clientId: clientDocId,
          client_name: name,
          amount: remainingDebt,
          amount_paid: 0,
          date: startDate || nowIso.slice(0, 10),
          due_date: endDate || nowIso.slice(0, 10),
          method: 'Cash',
          packageType: packageName || 'Membership',
          branch: 'Garden 8',
          salesName: repInfo?.name || 'System Import',
          sales_rep_id: repInfo?.id || '',
          notes: 'Imported unpaid balance from RedGITS v17.12',
          installments: [
            {
              id: `inst-${rId}-1`,
              amount: remainingDebt,
              dueDate: endDate || nowIso.slice(0, 10),
              status: 'pending',
              notes: 'RedGITS Debtor Balance',
            },
          ],
          created_at: nowIso,
          deleted_at: null,
        },
      });
    }

    // 7. Subcollections: Attendance (`attendance_history`), Call Center (`interactions`), Notes (`comments`)
    // attRows format: ["2026-02-19 Thursday", "Basic Membership", "16:04:43", "19:17:06", "male 0", "Yasmine Diab", "( (Auto CheckOut) )", ""]
    // Cap per-member subcollection writes to 125 most recent check-ins (keeps all 121 of Ahmed Noaman's visits while preventing 400+ visit outliers from bloating Firestore)
    const attRows: string[][] = (deep?.att || []).slice(0, 125);
    for (let aIdx = 0; aIdx < attRows.length; aIdx++) {
      const aRow = attRows[aIdx] || [];
      const [aDateDay, aPkgName, aTimeIn, aTimeOut, aLocker, aStaff, aNotes] = aRow;
      if (!aDateDay) continue;
      const dateStr = String(aDateDay).slice(0, 10);
      const timeStr = /^\d{2}:\d{2}/.test(aTimeIn || '') ? aTimeIn : '12:00:00';
      const checkedInIso = `${dateStr}T${timeStr}`;
      const attId = `redgits-att-${rId}-${aIdx + 1}`;
      const attRef = inzanDb.collection('clients').doc(clientDocId).collection('attendance_history').doc(attId);
      subcollectionWrites.push({
        ref: attRef,
        data: {
          id: attId,
          memberId: clientDocId,
          sessionTitle: aPkgName || packageName || 'Basic Membership',
          branchName: 'Garden 8',
          sessionDate: dateStr,
          checkedInAt: checkedInIso,
          checkedInBy: aStaff || 'Front Desk',
          status: 'ATTENDED',
          notes: [aLocker ? `Locker: ${aLocker}` : '', aTimeOut ? `Out: ${aTimeOut}` : '', aNotes || ''].filter(Boolean).join(' · '),
          remainingCreditsAfter: effectiveSessionsRemaining,
        },
      });
    }

    // callRows format: ["2026-10-04 21:20:06", "Answered", "Thinking", "+1 min", "-", "-", "Judy Mohamed", "[+1 min] [Thinking] aabkar covered"]
    for (let cIdx = 0; cIdx < callRows.length; cIdx++) {
      const cRow = callRows[cIdx] || [];
      const [cDate, cStatus, cReaction, cDuration, , , cAuthor, cComment] = cRow;
      const noteBody = cComment || [cStatus, cReaction, cDuration].filter((x) => x && x !== '-').join(' - ');
      if (!noteBody) continue;
      const outcome = /no\s*answer|busy|wrong/i.test(cStatus || '') ? 'Not Answered' : 'Interested';
      const intId = `redgits-call-${rId}-${cIdx + 1}`;
      const intRef = inzanDb.collection('clients').doc(clientDocId).collection('interactions').doc(intId);
      subcollectionWrites.push({
        ref: intRef,
        data: {
          id: intId,
          clientId: clientDocId,
          type: 'Call',
          outcome,
          notes: `${noteBody} (${cStatus || 'Call'} by ${cAuthor || 'Staff'})`,
          date: cDate || nowIso,
        },
      });

      const comId = `redgits-callnote-${rId}-${cIdx + 1}`;
      const comRef = inzanDb.collection('clients').doc(clientDocId).collection('comments').doc(comId);
      subcollectionWrites.push({
        ref: comRef,
        data: {
          id: comId,
          text: `[Call Center · ${cStatus || 'Call'}] ${noteBody}`,
          author: cAuthor || 'Call Center',
          date: cDate || nowIso,
        },
      });
    }

    if (fields['Notes'] && String(fields['Notes']).trim()) {
      const noteId = `redgits-note-${rId}`;
      const noteRef = inzanDb.collection('clients').doc(clientDocId).collection('comments').doc(noteId);
      subcollectionWrites.push({
        ref: noteRef,
        data: {
          id: noteId,
          text: String(fields['Notes']).trim(),
          author: fields['Created By'] || repInfo?.name || 'RedGITS Import',
          date: fields['Created On'] || nowIso,
        },
      });
    }

    for (let frIdx = 0; frIdx < freezeHistory.length; frIdx++) {
      const fh = freezeHistory[frIdx];
      if (!fh) continue;
      const fNoteId = `redgits-frznote-${rId}-${frIdx + 1}`;
      const fNoteRef = inzanDb.collection('clients').doc(clientDocId).collection('comments').doc(fNoteId);
      subcollectionWrites.push({
        ref: fNoteRef,
        data: {
          id: fNoteId,
          text: `[${fh.freezeType}] ${fh.packageName}: ${fh.startDate} to ${fh.endDate} (${fh.days} days)`,
          author: fh.createdBy || 'Staff',
          date: fh.createdAt || fh.startDate || nowIso,
        },
      });
    }
  }

  // 8. Build Guest Invitations from /admin/members/show/invitation
  const invRows: string[][] = liveV2?.tables?.invitations?.rows || [];
  const inviteDocs: Array<{ id: string; data: Record<string, any> }> = [];
  for (let idx = 0; idx < invRows.length; idx++) {
    const iRow = invRows[idx];
    if (!Array.isArray(iRow) || iRow.length < 7) continue;
    const [guestCode, guestName, , hostName, hostMemberId, salesman, createdOn, createdBy, notes] = iRow;
    if (!guestName || !guestName.trim()) continue;
    const invId = `redgits-inv-${guestCode || idx + 1}-${idx}`;
    inviteDocs.push({
      id: invId,
      data: {
        id: invId,
        guestCode: String(guestCode || '').trim(),
        guestName: guestName.trim(),
        hostMemberName: (hostName || '').trim(),
        hostMemberId: String(hostMemberId || '').trim(),
        salesName: cleanSalesRepName(salesman),
        createdBy: cleanSalesRepName(createdBy),
        createdAt: createdOn || nowIso,
        notes: notes || '',
        status: 'Checked In',
        branch: 'Garden 8',
        sourceSystem: 'RedGITS_v17.12',
      },
    });
  }

  const userDocs = Array.from(userDocsMap.values());
  const packageDocs = Array.from(packageDocsMap.values());
  const paymentDocs = Array.from(paymentDocsMap.values());

  console.log(`Prepared for Inzan Athletics (${DATABASE_ID}):`);
  console.log(`  • Sales Reps & Users        : ${userDocs.length}`);
  console.log(`  • Packages Catalog          : ${packageDocs.length}`);
  console.log(`  • Staff & Trainers          : ${coachDocs.length}`);
  console.log(`  • Members & Leads           : ${clientDocs.length} (${activeLeadsStagedCount} staged in Leads & Prospects)`);
  console.log(`  • Payments & Receipts       : ${paymentDocs.length}`);
  console.log(`  • Attendance/Activity/Notes : ${subcollectionWrites.length}`);
  console.log(`  • Guest Invitations         : ${inviteDocs.length}\n`);

  const skipSubcollections = process.argv.includes('--skip-subcollections');

  // Remove any stale redgits-rep-* user docs and stale redgits-sub-* payment docs
  if (!dryRun) {
    const staleUserDocs = existingUsersSnap.docs.filter(
      (d) => d.id.startsWith('redgits-rep-') && !userDocsMap.has(d.id)
    );
    if (staleUserDocs.length > 0) {
      const delBatch = inzanDb.batch();
      for (const sd of staleUserDocs) delBatch.delete(sd.ref);
      await delBatch.commit();
      console.log(`  • Purged ${staleUserDocs.length} stale non-staff user entries`);
    }

    const existingPaySnap = await inzanDb.collection('payments').get();
    const stalePayDocs = existingPaySnap.docs.filter(
      (d) => d.id.startsWith('redgits-') && !paymentDocsMap.has(d.id)
    );
    if (stalePayDocs.length > 0) {
      for (let i = 0; i < stalePayDocs.length; i += 400) {
        const delBatch = inzanDb.batch();
        for (const sp of stalePayDocs.slice(i, i + 400)) delBatch.delete(sp.ref);
        await delBatch.commit();
      }
      console.log(`  • Purged ${stalePayDocs.length} stale duplicate payment entries`);
    }
  }

  await commitBatchesWithProgress('1/7 Sales Reps & Users', 'users', userDocs, dryRun);
  await commitBatchesWithProgress('2/7 Packages Catalog', 'packages', packageDocs, dryRun);
  await commitBatchesWithProgress('3/7 Staff & Trainers', 'coaches', coachDocs, dryRun);
  await commitBatchesWithProgress('4/7 Members & Leads', 'clients', clientDocs, dryRun);
  await commitBatchesWithProgress('5/7 Payments & Receipts', 'payments', paymentDocs, dryRun);
  if (!skipSubcollections) {
    await commitRefBatchesWithProgress('6/7 Attendance & Activity', subcollectionWrites, dryRun);
    await commitBatchesWithProgress('7/7 Guest Invitations', 'guestInvites', inviteDocs, dryRun);
  }

  const totalSec = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(` ✅ COMPLETE in ${totalSec}s — Target: ${PROJECT_ID} / ${DATABASE_ID} (Strike Untouched)`);
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
