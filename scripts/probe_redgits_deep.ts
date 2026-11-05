import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';

async function inspectRedGits() {
  console.log('1. Launching Playwright browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('2. Navigating to login...');
  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(({ u, p }) => {
    const uEl = document.querySelector('#username') as HTMLInputElement;
    if (uEl) { uEl.removeAttribute('readonly'); uEl.value = u; }
    const pEl = document.querySelector('#password') as HTMLInputElement;
    if (pEl) { pEl.value = p; }
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle', timeout: 25000 }),
    page.click('#login-form button[type="submit"]')
  ]);

  console.log('3. Logged in. URL:', page.url());

  // Extract all sidebar links and buttons
  const navData = await page.evaluate(() => {
    const items: Array<{ text: string; href: string; onclick?: string; html?: string }> = [];
    const elements = document.querySelectorAll('.page-sidebar-menu a, .sidebar-toggler, nav a, .navbar a, .sub-menu a');
    elements.forEach((el) => {
      const a = el as HTMLAnchorElement;
      items.push({
        text: a.innerText.replace(/\s+/g, ' ').trim(),
        href: a.getAttribute('href') || '',
        onclick: a.getAttribute('onclick') || undefined,
      });
    });
    return items;
  });

  console.log(`4. Found ${navData.length} sidebar/menu navigation elements:`);
  fs.writeFileSync('backups/redgits_navigation_dump.json', JSON.stringify(navData, null, 2));

  // Let's test specific interesting endpoints
  const candidates = [
    '/admin/member_data/frozen',
    '/admin/member_data/freeze',
    '/admin/member_data/black_list',
    '/admin/member_data/blacklist',
    '/admin/member_data/canceled',
    '/admin/member_data/cancelled',
    '/admin/member_data/pt',
    '/admin/freeze/show',
    '/admin/freeze',
    '/admin/inbody',
    '/admin/inbody/show',
    '/admin/pt',
    '/admin/pt/show',
    '/admin/pt/sessions',
    '/admin/complaints',
    '/admin/complaints/show',
    '/admin/reports',
    '/admin/reports/pt',
    '/admin/reports/inbody',
    '/admin/reports/freeze',
    '/admin/reports/sales',
    '/admin/reports/financial',
    '/admin/reports/income',
    '/admin/lockers',
    '/admin/lockers/show',
    '/admin/pos',
    '/admin/pos/items',
    '/admin/pos/sales',
  ];

  console.log('5. Probing candidate endpoints...');
  const probeResults: Array<{ url: string; status: number; title: string; length: number }> = [];
  for (const url of candidates) {
    try {
      const resp = await page.goto(`${REDGITS_ORIGIN}${url}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const status = resp?.status() || 0;
      const title = await page.title();
      const content = await page.content();
      probeResults.push({ url, status, title, length: content.length });
      console.log(`  - ${url} => Status: ${status}, Title: "${title}", Length: ${content.length}`);
    } catch (e: any) {
      console.log(`  - ${url} => Failed: ${e.message}`);
    }
  }

  fs.writeFileSync('backups/redgits_endpoint_probes.json', JSON.stringify(probeResults, null, 2));
  await browser.close();
  console.log('Inspection complete.');
}

inspectRedGits().catch(console.error);
