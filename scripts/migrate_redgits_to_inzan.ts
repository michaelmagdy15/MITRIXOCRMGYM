/**
 * RedGITS v17.12 -> Inzan Athletics (`db-inzanathletics`) Full Migration Engine
 *
 * SAFETY INVARIANT:
 * - Connects EXCLUSIVELY to databaseId `db-inzanathletics` in `faa-test-guide-v2`.
 * - Never touches `(default)` or `strike-production-f5242`.
 * - Displays a real-time ASCII progress bar for every stage (Packages, Staff, Members, Payments & Entitlements).
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
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
    `[${bar}] ${String(pct).padStart(3)}% | ${String(current).padStart(5)}/${String(total).padEnd(5)} | ${stage.padEnd(26)} | ETA: ${String(etaSec).padStart(2)}s ${detail}`
  );
}

function normalizePhone(raw?: string): string {
  if (!raw) return '';
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return '';
  if (digits.startsWith('2001') && digits.length === 13) return digits.slice(2); // +20010... -> 010...
  if (digits.startsWith('201') && digits.length === 12) return '0' + digits.slice(2); // 2010... -> 010...
  if (digits.startsWith('1') && digits.length === 10) return '0' + digits;
  return digits;
}

function parseSessionsFromName(pkgName: string): number {
  const m = pkgName.match(/(\d+)\s*(?:session|sessions|class|classes|pt|s\b)/i);
  if (m && m[1]) return parseInt(m[1], 10);
  if (/drop-?in|single|1\s*day/i.test(pkgName)) return 1;
  if (/annual|year|12\s*month/i.test(pkgName)) return 365;
  if (/6\s*month/i.test(pkgName)) return 180;
  if (/3\s*month/i.test(pkgName)) return 90;
  if (/1\s*month|monthly/i.test(pkgName)) return 30;
  return 30;
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

  const BATCH_SIZE = 400;
  let committed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    if (!dryRun) {
      const batch = inzanDb.batch();
      for (const item of chunk) {
        const ref = inzanDb.collection(collectionName).doc(item.id);
        batch.set(ref, item.data, { merge: true });
      }
      await batch.commit();
    }
    committed += chunk.length;
    renderProgressBar(stageName, committed, total, startTime, dryRun ? '[DRY-RUN]' : `-> ${collectionName}`);
  }
  return committed;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const globalStart = Date.now();

  console.log('================================================================================');
  console.log(` RedGITS v17.12 -> Inzan Athletics (${DATABASE_ID}) Migration Pipeline`);
  console.log(` Mode: ${dryRun ? 'DRY-RUN (Verification Only)' : 'LIVE FIRESTORE IMPORT (db-inzanathletics ONLY)'}`);
  console.log('================================================================================\n');

  const dbPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_inzan_database.json');
  const progPath = path.resolve(process.cwd(), 'docs/redgits_pages/migration_progress.json');
  const scrapedPath = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_scraped_data.json');
  const liveV2Path = path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_extract_v2.json');

  const redgitsDb = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { members: [], staff: [] };
  const migProg = fs.existsSync(progPath) ? JSON.parse(fs.readFileSync(progPath, 'utf8')) : { membersList: [], membersDetailScraped: {} };
  const scrapedPages = fs.existsSync(scrapedPath) ? JSON.parse(fs.readFileSync(scrapedPath, 'utf8')) : [];
  const liveV2 = fs.existsSync(liveV2Path) ? JSON.parse(fs.readFileSync(liveV2Path, 'utf8')) : null;

  // 1. Build Unmasked Phone & Subscription Lookup from /admin/packagelist
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
    if (cleanPhone && idTagMatch) phoneByMemberId.set(idTagMatch[1], cleanPhone);
    if (cleanPhone && memberName) phoneByName.set(memberName.toLowerCase(), cleanPhone);
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
      salesman,
      createdBy,
    };
    if (memberId) {
      const key = String(memberId).trim();
      const arr = subscriptionsByMemberId.get(key) || [];
      arr.push(subRecord);
      subscriptionsByMemberId.set(key, arr);
    }
    if (idTagMatch && idTagMatch[1] !== String(memberId).trim()) {
      const key2 = idTagMatch[1];
      const arr2 = subscriptionsByMemberId.get(key2) || [];
      arr2.push(subRecord);
      subscriptionsByMemberId.set(key2, arr2);
    }
  }

  // 2. Build Packages Catalog from /admin/packages/show + discovered active/expired package names
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
    packageDocsMap.set(sessionName.trim(), {
      id,
      data: {
        id,
        name: sessionName.trim(),
        price,
        sessions: parseSessionsFromName(sessionName),
        expiryDays,
        category: /pt|private|trainer/i.test(pkgCategory || sessionName) ? 'PT' : 'Membership',
        status: pkgStatus === 'Hold' ? 'Inactive' : 'Active',
        invitationsTotal: invitations,
        freezeLimitDays: freezeMaxDays,
        freezeMinDays: parseInt(String(freezeMin), 10) || 7,
        sourceSystem: 'RedGITS_v17.12',
        updatedAt: new Date().toISOString(),
      },
    });
  }

  // 3. Merge all Member Listing rows (Active + Expired) with Detailed Profile Scrapes
  const detailMap: Record<string, any> = { ...(migProg.membersDetailScraped || {}) };
  for (const m of redgitsDb.members || []) {
    if (m.redgitsId) detailMap[String(m.redgitsId)] = m;
  }

  const listRows: string[][] = [
    ...(liveV2?.tables?.activeMembers?.rows || []),
    ...(liveV2?.tables?.expiredMembers?.rows || []),
    ...(migProg.membersList || []),
  ];

  // Index listRows by RedGITS internal ID (`[ID:31881]`) or first column code
  const listByRedgitsId = new Map<string, { isActiveRow: boolean; row: string[] }>();
  for (const row of listRows) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const joined = row.join(' ');
    const idMatch = joined.match(/\[ID:(\d+)\]/);
    const rId = idMatch ? idMatch[1] : /^\d+$/.test(row[0]) ? row[0] : '';
    if (!rId) continue;
    const isActiveRow = row.length >= 11 && (row[4] === 'Active' || /^\d{4}-\d{2}-\d{2}$/.test(row[5] || ''));
    if (!listByRedgitsId.has(rId) || isActiveRow) {
      listByRedgitsId.set(rId, { isActiveRow, row });
    }
  }

  // Also index recent Walk-in Guests & Leads (/admin/members/show/guest) from 2026+
  const guestRows: string[][] = liveV2?.tables?.guestLeads?.rows || [];
  const guestByRedgitsId = new Map<string, string[]>();
  for (const gRow of guestRows) {
    if (!Array.isArray(gRow) || gRow.length < 8) continue;
    const [gCode, gName, , , gDate] = gRow;
    if (!gCode || !gName) continue;
    // Include recent 2025-2026 walk-in leads (up to 1500 most recent leads) so Sales Desk has all active leads ready today
    if (guestByRedgitsId.size < 1500 && !listByRedgitsId.has(gCode) && !detailMap[gCode]) {
      guestByRedgitsId.set(String(gCode).trim(), gRow);
    }
  }

  const allRedgitsIds = Array.from(
    new Set([...Object.keys(detailMap), ...Array.from(listByRedgitsId.keys()), ...Array.from(guestByRedgitsId.keys())])
  );
  const clientDocs: Array<{ id: string; data: Record<string, any> }> = [];
  const paymentDocs: Array<{ id: string; data: Record<string, any> }> = [];

  const nowIso = new Date().toISOString();

  for (const rId of allRedgitsIds) {
    const detail = detailMap[rId];
    const fields = detail?.fields || {};
    const listEntry = listByRedgitsId.get(rId);
    const row = listEntry?.row || [];

    let name = fields['Member Name'] || '';
    let cardMemberId = fields['Bar-code / RFID'] || '';
    let packageName = '';
    let status: 'Active' | 'Expired' | 'Hold' | 'Lead' = 'Active';
    let startDate = '';
    let endDate = '';
    let remainingDebt = 0;
    let salesName = fields['Sales Man'] || '';
    let trainerName = fields['Trainer'] && fields['Trainer'] !== '0' ? fields['Trainer'] : '';
    let genderRaw = fields['Gender'] || '';

    if (listEntry?.isActiveRow) {
      // Active row format: [code, name, memberId, packageName, status, startDate, endDate, debt, salesName, trainer, lastAtt, gender, action]
      name = name || row[1] || '';
      cardMemberId = row[2] || cardMemberId || rId;
      packageName = row[3] || '';
      status = row[4]?.toLowerCase().includes('hold') || row[4]?.toLowerCase().includes('freez') ? 'Hold' : 'Active';
      startDate = row[5] || '';
      endDate = row[6] || '';
      remainingDebt = parseFloat(String(row[7] || '').replace(/[^\d.]/g, '')) || 0;
      salesName = row[8] || salesName;
      trainerName = row[9] || trainerName;
      genderRaw = row[11] || genderRaw;
    } else if (row.length >= 7) {
      // Expired row format: [name, memberId, packageName, startDate, endDate, salesName, notes, action]
      name = name || row[0] || '';
      cardMemberId = row[1] || cardMemberId || rId;
      packageName = row[2] || '';
      startDate = row[3] || '';
      endDate = row[4] || '';
      salesName = row[5] || salesName;
      status = 'Expired';
    } else if (guestByRedgitsId.has(rId)) {
      // Guest / Walk-in Lead row format: [Code, Member Name, Come From, Source, Date, SalesMan, Created By, Gender, Action]
      const gRow = guestByRedgitsId.get(rId)!;
      name = name || gRow[1] || '';
      cardMemberId = rId;
      status = 'Lead';
      startDate = (gRow[4] || '').slice(0, 10);
      salesName = gRow[5] || salesName;
      genderRaw = gRow[7] || genderRaw;
      fields['Advertising Source'] = fields['Advertising Source'] || gRow[3] || gRow[2] || 'Walk-in';
      fields['Type'] = fields['Type'] || gRow[2] || 'Walk-in (New Lead)';
    } else {
      // Profile-only record (Customer / Lead / Walk-in)
      const rawSt = String(fields['Status'] || '').toLowerCase();
      status = rawSt === 'member' ? 'Expired' : 'Lead';
      cardMemberId = cardMemberId || rId;
    }

    if (!name.trim()) continue;

    // Ensure discovered package exists in package catalog
    if (packageName && packageName !== 'Unknown' && !packageDocsMap.has(packageName.trim())) {
      const pName = packageName.trim();
      const pkgId = `redgits-pkg-${pName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48)}`;
      packageDocsMap.set(pName, {
        id: pkgId,
        data: {
          id: pkgId,
          name: pName,
          price: 0,
          sessions: parseSessionsFromName(pName),
          expiryDays: 30,
          category: /pt|private|trainer/i.test(pName) ? 'PT' : 'Membership',
          status: 'Active',
          sourceSystem: 'RedGITS_v17.12',
          updatedAt: nowIso,
        },
      });
    }

    const phone =
      normalizePhone(fields['Phone']) ||
      normalizePhone(fields['Backup Mobile']) ||
      phoneByMemberId.get(String(cardMemberId).trim()) ||
      phoneByMemberId.get(String(rId).trim()) ||
      phoneByName.get(name.trim().toLowerCase()) ||
      '';

    const sessionsCount = packageName ? parseSessionsFromName(packageName) : 0;
    const clientDocId = `redgits-${rId}`;

    const clientData: Record<string, any> = {
      id: clientDocId,
      redgitsId: String(rId),
      memberId: String(cardMemberId || rId).trim(),
      name: name.trim(),
      phone,
      backupPhone: normalizePhone(fields['Backup Mobile']) || '',
      email: fields['Email'] || '',
      nationalId: fields['National ID'] || '',
      gender: /fem|انث|أنث/i.test(genderRaw) ? 'Female' : /mal|ذكر/i.test(genderRaw) ? 'Male' : undefined,
      status,
      branch: 'Inzan Athletics',
      packageType: packageName || (status === 'Lead' ? 'Prospect' : 'Membership'),
      startDate: startDate || (fields['Created On'] ? String(fields['Created On']).slice(0, 10) : nowIso.slice(0, 10)),
      membershipExpiry: endDate || null,
      sessionsRemaining: status === 'Active' ? sessionsCount : 0,
      salesName: salesName.replace(/Open tutorial video/i, '').trim(),
      trainerName: trainerName || undefined,
      source: fields['Advertising Source']?.replace(/\s*Change$/i, '').trim() || 'Walk-in',
      typeOfClient: fields['Type']?.replace(/\s*Change$/i, '').trim() || 'Member',
      frontDeskNote: fields['Notes'] || '',
      invitationsTotal: 3,
      invitationsUsed: 0,
      freezeCoins: 30,
      paid: remainingDebt <= 0,
      createdAt: fields['Created On'] || nowIso,
      updatedAt: nowIso,
      sourceSystem: 'RedGITS_v17.12',
    };

    if (packageName) {
      clientData.packages = [
        {
          id: `pkg-${rId}`,
          packageName,
          startDate: startDate || nowIso.slice(0, 10),
          endDate: endDate || nowIso.slice(0, 10),
          sessionsTotal: sessionsCount,
          sessionsRemaining: status === 'Active' ? sessionsCount : 0,
          status: status === 'Hold' ? 'Hold' : status === 'Expired' ? 'Expired' : 'Active',
        },
      ];
    }

    // Remove undefined keys for Firestore
    Object.keys(clientData).forEach((k) => clientData[k] === undefined && delete clientData[k]);
    clientDocs.push({ id: clientDocId, data: clientData });

    // Create Debtor / Subscription Payment Record if remainingDebt > 0 or subscription exists
    const memberSubs =
      subscriptionsByMemberId.get(String(rId).trim()) ||
      subscriptionsByMemberId.get(String(cardMemberId).trim()) ||
      [];
    if (remainingDebt > 0) {
      const payId = `redgits-debt-${rId}`;
      paymentDocs.push({
        id: payId,
        data: {
          id: payId,
          clientId: clientDocId,
          client_name: name.trim(),
          amount: remainingDebt,
          amount_paid: 0,
          date: startDate || nowIso,
          due_date: endDate || nowIso.slice(0, 10),
          method: 'Cash',
          packageType: packageName || 'Membership',
          branch: 'Inzan Athletics',
          salesName: clientData.salesName || 'System Import',
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
    } else if (memberSubs.length > 0) {
      for (let sIdx = 0; sIdx < memberSubs.length; sIdx++) {
        const sub = memberSubs[sIdx];
        const payId = `redgits-sub-${rId}-${sIdx + 1}`;
        paymentDocs.push({
          id: payId,
          data: {
            id: payId,
            clientId: clientDocId,
            client_name: name.trim(),
            amount: sub.amount,
            amount_paid: sub.amount,
            date: sub.startDate || nowIso,
            method: sub.method === 'Visa' ? 'Credit Card' : sub.method || 'Cash',
            packageType: sub.packageName || packageName || 'Membership',
            branch: 'Inzan Athletics',
            salesName: sub.salesman || clientData.salesName || 'System Import',
            notes: `RedGITS SN: ${sub.receiptSn || '-'} (${sub.subType || 'new'})`,
            created_at: sub.createdAt || nowIso,
            deleted_at: null,
          },
        });
      }
    }
  }

  const packageDocs = Array.from(packageDocsMap.values());

  // 4. Build Staff / Coaches Docs from /admin/staff/show
  const staffRows: string[][] = liveV2?.tables?.staff?.rows || redgitsDb.staff || [];
  const coachDocs: Array<{ id: string; data: Record<string, any> }> = [];
  for (const sRow of staffRows) {
    if (!Array.isArray(sRow) || sRow.length < 7) continue;
    const [sCode, sName, sMobile, , , sDept, sPos, , sSalary, , , , , , sStatus, , sNatId, sStart, , sUsername] = sRow;
    if (!sName || !sName.trim()) continue;
    const cId = `redgits-staff-${sCode || sName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    coachDocs.push({
      id: cId,
      data: {
        id: cId,
        coachId: `STAFF-${String(sCode || '000').padStart(3, '0')}`,
        name: sName.trim(),
        phone: normalizePhone(sMobile),
        specialty: (sPos || sDept || 'Trainer').trim(),
        department: (sDept || 'Fitness').trim(),
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

  // 5. Build Guest Invitations from /admin/members/show/invitation
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
        salesName: (salesman || '').trim(),
        createdBy: (createdBy || '').trim(),
        createdAt: createdOn || nowIso,
        notes: notes || '',
        status: 'Checked In',
        branch: 'Inzan Athletics',
        sourceSystem: 'RedGITS_v17.12',
      },
    });
  }

  console.log(`Prepared for Inzan Athletics (${DATABASE_ID}):`);
  console.log(`  • Packages Catalog  : ${packageDocs.length}`);
  console.log(`  • Staff & Trainers  : ${coachDocs.length}`);
  console.log(`  • Members & Leads   : ${clientDocs.length}`);
  console.log(`  • Payments & Debts  : ${paymentDocs.length}`);
  console.log(`  • Guest Invitations : ${inviteDocs.length}\n`);

  await commitBatchesWithProgress('1/5 Packages Catalog', 'packages', packageDocs, dryRun);
  await commitBatchesWithProgress('2/5 Staff & Trainers', 'coaches', coachDocs, dryRun);
  await commitBatchesWithProgress('3/5 Members & Leads', 'clients', clientDocs, dryRun);
  await commitBatchesWithProgress('4/5 Payments & Receipts', 'payments', paymentDocs, dryRun);
  await commitBatchesWithProgress('5/5 Guest Invitations', 'guestInvites', inviteDocs, dryRun);

  const totalSec = ((Date.now() - globalStart) / 1000).toFixed(1);
  console.log('\n================================================================================');
  console.log(` ✅ COMPLETE in ${totalSec}s — Target: ${PROJECT_ID} / ${DATABASE_ID} (Strike Untouched)`);
  console.log('================================================================================');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
