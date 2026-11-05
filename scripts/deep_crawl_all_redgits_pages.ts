import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';

const SHOT_DIR = path.resolve(process.cwd(), 'backups', 'redgits_screenshots');
if (!fs.existsSync(SHOT_DIR)) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
}

interface PageAudit {
  name: string;
  url: string;
  title: string;
  screenshotPath: string;
  tableHeaders: string[];
  formFields: string[];
  buttons: string[];
  summaryText: string;
}

const PAGES_TO_INSPECT = [
  { name: '01_Dashboard', url: '/admin/home/charts' },
  { name: '02_Members_Active', url: '/admin/members/show/active' },
  { name: '03_Members_Guest_Leads', url: '/admin/members/show/guest' },
  { name: '04_Members_Expired', url: '/admin/members/show/expired' },
  { name: '05_Members_Invitations', url: '/admin/members/show/invitation' },
  { name: '06_Members_Add_Guest', url: '/admin/members/add' },
  { name: '07_Members_Card_ID_ZK', url: '/admin/members/card_id_zk' },
  { name: '08_CheckIn_Gate_Reception', url: '/admin/newcheck/check' },
  { name: '09_CheckIn_Fingerprint', url: '/admin/newcheck/checkfingerprint' },
  { name: '10_Activity_Report', url: '/admin/check/memberactivities' },
  { name: '11_Reports_Trainer_Exercise_PT', url: '/admin/reports/trainerexcrise' },
  { name: '12_Reports_Upgrade_Package', url: '/admin/reports/upgradepackage' },
  { name: '13_Reports_National_ID', url: '/admin/reports/nationalMembers' },
  { name: '14_Reports_Service_Member', url: '/admin/reports/servicemember' },
  { name: '15_Reservations_Classes', url: '/admin/online_reservations' },
  { name: '16_Call_Center', url: '/admin/callcenter' },
  { name: '17_Lost_and_Found', url: '/admin/lost' },
  { name: '18_Finance_Incomes', url: '/admin/incomes/' },
  { name: '19_Finance_PackageList_Sales', url: '/admin/packagelist' },
  { name: '20_Finance_Debtors_Unpaid', url: '/admin/incomes/search' },
  { name: '21_Finance_Packages_Catalog', url: '/admin/packages/show' },
  { name: '22_Staff_Working', url: '/admin/staff/show' },
  { name: '23_Member_Profile_Overview', url: '/admin/members/view/5253' },
];

async function deepCrawl() {
  console.log('1. Launching browser for complete UI examination...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log('2. Authenticating as mi5a...');
  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ u, p }) => {
    const uEl = document.querySelector('#username') as HTMLInputElement;
    if (uEl) { uEl.removeAttribute('readonly'); uEl.value = u; }
    const pEl = document.querySelector('#password') as HTMLInputElement;
    if (pEl) { pEl.value = p; }
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);

  console.log('✓ Logged in successfully!\n');

  const auditResults: PageAudit[] = [];

  for (const item of PAGES_TO_INSPECT) {
    const fullUrl = `${REDGITS_ORIGIN}${item.url}`;
    console.log(`[Examining] ${item.name} (${item.url})...`);
    try {
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 20000 });
      // Wait a moment for dynamic tables/charts
      await page.waitForTimeout(1000);

      const shotFile = `${item.name}.png`;
      const shotPath = path.join(SHOT_DIR, shotFile);
      await page.screenshot({ path: shotPath, fullPage: true });

      const details = await page.evaluate(() => {
        const title = document.title || '';
        const ths = Array.from(document.querySelectorAll('th, .table th')).map(th => (th as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const labels = Array.from(document.querySelectorAll('label, .form-group label, .control-label')).map(l => (l as HTMLElement).innerText.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const btns = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], .btn')).map(b => (b as HTMLElement).innerText.replace(/\s+/g, ' ').trim() || (b as HTMLInputElement).value || '').filter(Boolean);
        const textSample = document.body.innerText.slice(0, 1000).replace(/\s+/g, ' ');

        return { title, ths: Array.from(new Set(ths)), labels: Array.from(new Set(labels)), btns: Array.from(new Set(btns)), textSample };
      });

      auditResults.push({
        name: item.name,
        url: item.url,
        title: details.title,
        screenshotPath: shotPath,
        tableHeaders: details.ths,
        formFields: details.labels,
        buttons: details.btns,
        summaryText: details.textSample,
      });

      console.log(`  ✓ Screenshot saved: ${shotFile} | Found ${details.ths.length} ths, ${details.labels.length} form labels, ${details.btns.length} buttons.`);
    } catch (err: any) {
      console.warn(`  ⚠️ Error on ${item.name}: ${err.message}`);
    }
  }

  // Also examine the tabs inside member profile view
  console.log('\n[Examining Member Profile Sub-tabs]...');
  const memberTabs = await page.evaluate(() => {
    const tabs: Array<{ text: string; href: string }> = [];
    document.querySelectorAll('.profile-usermenu ul li a, .nav-tabs li a, a[data-toggle="tab"]').forEach((a) => {
      const el = a as HTMLAnchorElement;
      tabs.push({ text: el.innerText.trim(), href: el.getAttribute('href') || '' });
    });
    return tabs;
  });
  console.log('Member profile sub-tabs found:', memberTabs);

  fs.writeFileSync(
    path.join(process.cwd(), 'backups', 'redgits_ui_schema_audit.json'),
    JSON.stringify({ auditResults, memberTabs }, null, 2)
  );

  await browser.close();
  console.log('\n✓ Complete deep crawl finished. Audit saved to backups/redgits_ui_schema_audit.json');
}

deepCrawl().catch(console.error);
