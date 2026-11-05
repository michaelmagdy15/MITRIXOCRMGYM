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

  const testPages = [
    '/admin/members/card_id_zk',
    '/admin/reports/trainerexcrise',
    '/admin/reports/packagemember',
    '/admin/reports/image_missing'
  ];

  for (const p of testPages) {
    await page.goto(`https://inzan.redgits.com${p}`, { waitUntil: 'networkidle' });
    const ajaxUrls = await page.evaluate(() => {
      const s = Array.from(document.querySelectorAll('script')).map(x => x.innerHTML).join('\n');
      const matches = [...s.matchAll(/url\s*:\s*["']([^"']+)["']/g)].map(m => m[1]);
      return Array.from(new Set(matches)).filter(m => m.startsWith('/') || m.includes('admin'));
    });
    console.log(`Page ${p} AJAX URLs:`, ajaxUrls);
  }

  await browser.close();
}

main().catch(console.error);
