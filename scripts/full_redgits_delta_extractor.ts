import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';
const BACKUP_DIR = path.resolve(process.cwd(), 'backups', 'redgits_master_archive_2026');

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#039;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
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

async function extractDeltas() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Logging in...');
  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ u, p }) => {
    (document.querySelector('#username') as HTMLInputElement).value = u;
    (document.querySelector('#password') as HTMLInputElement).value = p;
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);
  console.log('Logged in successfully!');

  // 1. ZK Card IDs (RFID / Hardware)
  console.log('1. Fetching ZK Card ID mappings (/admin/members/card_id_zk)...');
  const zkHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/members/card_id_zk');
    return await r.text();
  });
  const zkRows = parseTableRows(zkHtml);
  console.log(`  ✓ Received ${zkRows.length} ZK card rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'zk_card_id_mappings.json'), JSON.stringify(zkRows, null, 2));

  // 2. POS Items / Bar Inventory
  console.log('2. Fetching POS Items / Cafe Bar Inventory (/admin/items/show)...');
  const posHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/items/show');
    return await r.text();
  });
  const posRows = parseTableRows(posHtml);
  console.log(`  ✓ Received ${posRows.length} POS item rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'pos_items_bar.json'), JSON.stringify(posRows, null, 2));

  // 3. Package Upgrades Report
  console.log('3. Fetching Package Upgrades (/admin/reports/upgradepackage)...');
  const upgHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/reports/upgradepackage');
    return await r.text();
  });
  const upgRows = parseTableRows(upgHtml);
  console.log(`  ✓ Received ${upgRows.length} upgrade rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'reports_upgradepackage.json'), JSON.stringify(upgRows, null, 2));

  // 4. Package Members Report
  console.log('4. Fetching Package Members Report (/admin/reports/packagemember)...');
  const pkgMemHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/reports/packagemember');
    return await r.text();
  });
  const pkgMemRows = parseTableRows(pkgMemHtml);
  console.log(`  ✓ Received ${pkgMemRows.length} package member rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'reports_packagemember.json'), JSON.stringify(pkgMemRows, null, 2));

  // 5. Trainer Exercise / PT Sessions Report
  console.log('5. Fetching Trainer Exercise PT Sessions (/admin/reports/trainerexcrise)...');
  const ptHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/reports/trainerexcrise');
    return await r.text();
  });
  const ptRows = parseTableRows(ptHtml);
  console.log(`  ✓ Received ${ptRows.length} trainer exercise rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'reports_trainerexcrise.json'), JSON.stringify(ptRows, null, 2));

  // 6. Complaints & Titles
  console.log('6. Fetching Complaints Titles (/admin/complain_title/show)...');
  const compHtml = await page.evaluate(async () => {
    const r = await fetch('/admin/complain_title/show');
    return await r.text();
  });
  const compRows = parseTableRows(compHtml);
  console.log(`  ✓ Received ${compRows.length} complaint rows`);
  fs.writeFileSync(path.join(BACKUP_DIR, 'complaints_titles.json'), JSON.stringify(compRows, null, 2));

  await browser.close();
  console.log('Delta extraction complete.');
}

extractDeltas().catch(console.error);
