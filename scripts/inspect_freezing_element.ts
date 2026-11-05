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
  await page.goto('https://inzan.redgits.com/admin/home/charts', { waitUntil: 'networkidle' });
  const freezingHtml = await page.evaluate(() => {
    const el = document.querySelector('#freezing');
    return el ? el.outerHTML : 'not found';
  });
  console.log('Freezing element on dashboard:\n', freezingHtml);
  await browser.close();
}

main().catch(console.error);
