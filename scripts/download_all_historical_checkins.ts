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

const MONTHS_TO_PULL = [
  // 2026
  { name: '2026_07', from: '2026-07-01 00:00:00', to: '2026-07-31 23:59:59' },
  { name: '2026_06', from: '2026-06-01 00:00:00', to: '2026-06-30 23:59:59' },
  { name: '2026_05', from: '2026-05-01 00:00:00', to: '2026-05-31 23:59:59' },
  { name: '2026_04', from: '2026-04-01 00:00:00', to: '2026-04-30 23:59:59' },
  { name: '2026_03', from: '2026-03-01 00:00:00', to: '2026-03-31 23:59:59' },
  { name: '2026_02', from: '2026-02-01 00:00:00', to: '2026-02-28 23:59:59' },
  { name: '2026_01', from: '2026-01-01 00:00:00', to: '2026-01-31 23:59:59' },
  // 2025
  { name: '2025_12', from: '2025-12-01 00:00:00', to: '2025-12-31 23:59:59' },
  { name: '2025_11', from: '2025-11-01 00:00:00', to: '2025-11-30 23:59:59' },
  { name: '2025_10', from: '2025-10-01 00:00:00', to: '2025-10-31 23:59:59' },
  { name: '2025_09', from: '2025-09-01 00:00:00', to: '2025-09-30 23:59:59' },
];

async function pullHistoricalCheckins() {
  console.log('1. Launching browser for historical check-in extractions...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ u, p }) => {
    (document.querySelector('#username') as HTMLInputElement).value = u;
    (document.querySelector('#password') as HTMLInputElement).value = p;
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);

  console.log('2. Authenticated. Starting monthly check-in pulls...');
  const checkinDir = path.join(BACKUP_DIR, 'monthly_checkins');
  if (!fs.existsSync(checkinDir)) fs.mkdirSync(checkinDir, { recursive: true });

  let grandTotal = 0;
  for (const m of MONTHS_TO_PULL) {
    const dest = path.join(checkinDir, `checkins_${m.name}.json`);
    if (fs.existsSync(dest)) {
      const existing = JSON.parse(fs.readFileSync(dest, 'utf8'));
      console.log(`  • ${m.name}: Already cached on disk (${existing.length} check-ins)`);
      grandTotal += existing.length;
      continue;
    }

    console.log(`  • Pulling ${m.name} (${m.from.slice(0, 10)} to ${m.to.slice(0, 10)})...`);
    try {
      const html = await page.evaluate(async (interval) => {
        const p = new URLSearchParams({ fromdate: interval.from, todate: interval.to, gender: '' });
        const r = await fetch(`/admin/check/getactivitesday?${p.toString()}`);
        return await r.text();
      }, m);

      const rows = parseTableRows(html);
      console.log(`    ✓ Parsed ${rows.length} rows for ${m.name}`);
      fs.writeFileSync(dest, JSON.stringify(rows, null, 2));
      grandTotal += rows.length;
    } catch (err: any) {
      console.warn(`    ⚠️ Failed ${m.name}: ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\n✓ Monthly check-ins extraction complete. Grand total historical records: ${grandTotal}`);
}

pullHistoricalCheckins().catch(console.error);
