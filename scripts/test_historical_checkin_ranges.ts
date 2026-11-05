import { chromium } from 'playwright';

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

  const testYears = [
    { name: '2026_Jan_Jul', from: '2026-01-01 00:00:00', to: '2026-07-31 23:59:59' },
    { name: '2025_Full', from: '2025-01-01 00:00:00', to: '2025-12-31 23:59:59' },
    { name: '2024_Full', from: '2024-01-01 00:00:00', to: '2024-12-31 23:59:59' },
  ];

  for (const t of testYears) {
    const res = await page.evaluate(async ({ from, to }) => {
      const p = new URLSearchParams({ fromdate: from, todate: to, gender: '' });
      const r = await fetch(`/admin/check/getactivitesday?${p.toString()}`);
      const text = await r.text();
      return { length: text.length, rowCount: (text.match(/<tr/g) || []).length };
    }, t);
    console.log(`Interval ${t.name}: length=${res.length} bytes, rowCount=${res.rowCount}`);
  }

  await browser.close();
}

main().catch(console.error);
