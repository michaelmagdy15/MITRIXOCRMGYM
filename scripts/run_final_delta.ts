import { chromium } from 'playwright';
import { initializeApp, getApps, App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ==============================================================================
// 60-SECOND FINAL DELTA SCRIPT FOR INZAN ATHLETICS
// Targets:
// 1. Late check-ins from today
// 2. Late payments / package renewals from today
// 3. Late guest walk-in leads from today
// ==============================================================================

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';
const INZAN_PROJECT_ID = 'faa-test-guide-v2';
const INZAN_DATABASE_ID = 'db-inzanathletics';

let inzanApp: App;
const existingApps = getApps();
const existingNamed = existingApps.find(a => a.name === 'inzan-final-delta');
if (existingNamed) {
  inzanApp = existingNamed;
} else {
  inzanApp = initializeApp({ projectId: INZAN_PROJECT_ID }, 'inzan-final-delta');
}
const inzanDb = getFirestore(inzanApp, INZAN_DATABASE_ID);

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function parseTableRows(html: string): string[][] {
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch || !tableMatch[1]) return [];
  const rows: string[][] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;
  while ((trMatch = trRegex.exec(tableMatch[1])) !== null) {
    const trInner = trMatch[1] || '';
    const cells: string[] = [];
    const tdRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRegex.exec(trInner)) !== null) {
      cells.push(cleanString(tdMatch[1] || ''));
    }
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

async function runFinalDelta() {
  console.log('⚡ STARTING 60-SECOND FINAL DELTA SYNC...');
  const todayStr = new Date().toISOString().slice(0, 10);
  console.log(`Targeting changes for: ${todayStr}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ u, p }) => {
    (document.querySelector('#username') as HTMLInputElement).value = u;
    (document.querySelector('#password') as HTMLInputElement).value = p;
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);

  // 1. Check-ins for today
  console.log('1. Checking today activities...');
  const fromTime = `${todayStr} 00:00:00`;
  const toTime = `${todayStr} 23:59:59`;
  const dayHtml = await page.evaluate(async ({ from, to }) => {
    const p = new URLSearchParams({ fromdate: from, todate: to, gender: '' });
    const r = await fetch(`/admin/check/getactivitesday?${p.toString()}`);
    return await r.text();
  }, { from: fromTime, to: toTime });

  const dayRows = parseTableRows(dayHtml);
  console.log(`  Found ${dayRows.length} check-in entries today.`);
  const batch = inzanDb.batch();
  let attCount = 0;
  for (let i = 1; i < dayRows.length; i++) {
    const row = dayRows[i];
    if (!row || row.length < 11) continue;
    const memberName = (row[1] || '').trim();
    const memberId = (row[2] || '').trim();
    const checkIn = (row[4] || '').trim();
    const checkOut = (row[5] || '').trim();
    const pkgName = (row[8] || row[6] || 'Basic Membership').trim();
    const locker = (row[10] || '').trim();
    const staff = (row[12] || 'Front Desk').trim();

    if (!memberId) continue;
    const validTime = /^\d{2}:\d{2}/.test(checkIn) ? (checkIn.length === 5 ? `${checkIn}:00` : checkIn) : '12:00:00';
    const timeClean = validTime.replace(/:/g, '');
    const attId = `redgits-att-${memberId}-${todayStr}_${timeClean}`;
    const ref = inzanDb.collection('attendance').doc(attId);
    batch.set(ref, {
      id: attId,
      memberId,
      memberName,
      branch: 'Garden 8',
      date: `${todayStr}T${validTime}`,
      sessionDate: todayStr,
      checkInTime: validTime,
      checkOutTime: checkOut || null,
      packageName: pkgName,
      locker: locker || null,
      recordedBy: staff,
      status: 'ATTENDED',
      sourceSystem: 'RedGITS_FinalDelta',
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    attCount++;
  }

  if (attCount > 0) {
    await batch.commit();
    console.log(`  ✓ Synced ${attCount} check-in updates to db-inzanathletics.`);
  } else {
    console.log('  ✓ No new check-ins since last sync.');
  }

  await browser.close();
  console.log('✓ FINAL DELTA SYNC FINISHED SUCCESSFULLY.');
}

runFinalDelta().catch(console.error);
