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

  const endpoints = [
    { url: '/admin/members/getmemberinfo', data: { member_id: '4604' } },
    { url: '/admin/members/getmemberinfo', data: { id: '4604' } },
    { url: '/admin/members/getmemberinfobarcode', data: { barcode: '4604' } },
    { url: '/admin/home/searchmemberdata', data: { id: '4604' } },
  ];

  for (const ep of endpoints) {
    const res = await page.evaluate(async ({ url, data }) => {
      const p = new URLSearchParams(data);
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        body: p.toString()
      });
      return { url, status: r.status, text: await r.text() };
    }, ep);
    console.log(`Endpoint ${ep.url} with ${JSON.stringify(ep.data)} => Status ${res.status}, Output:\n${res.text.slice(0, 500)}`);
  }

  await browser.close();
}

main().catch(console.error);
