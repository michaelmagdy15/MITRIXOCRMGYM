import { chromium } from 'playwright';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://inzan.redgits.com/admin/login');
  await page.evaluate(() => {
    (document.querySelector('#username') as HTMLInputElement).value = 'mi5a';
    (document.querySelector('#password') as HTMLInputElement).value = 'Miko0019_!';
  });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);

  console.log('Testing member tabs on 4604...');
  const tabs = ['package_data', 'financial_list', 'invitation_list', 'freezing_list', 'member_activities_list', 'files'];
  for (const t of tabs) {
    const res = await page.evaluate(async (tabName) => {
      const r = await fetch(`/admin/members/${tabName}/4604`);
      return { tabName, status: r.status, htmlSample: (await r.text()).slice(0, 400) };
    }, t);
    console.log(`Tab: ${t} => Status ${res.status}, Sample: ${res.htmlSample.replace(/\s+/g, ' ')}`);
  }

  // Check system-wide reports
  console.log('\nTesting system-wide reports...');
  const reports = [
    '/admin/reports/image_missing',
    '/admin/reports/packagemember',
    '/admin/reports/upgradepackage',
    '/admin/items/show',
    '/admin/complain_title/show'
  ];
  for (const rep of reports) {
    const res = await page.evaluate(async (repUrl) => {
      const r = await fetch(repUrl);
      return { repUrl, status: r.status, htmlSample: (await r.text()).slice(0, 400) };
    }, rep);
    console.log(`Report: ${rep} => Status ${res.status}, Sample: ${res.htmlSample.replace(/\s+/g, ' ')}`);
  }

  await browser.close();
}

main().catch(console.error);
