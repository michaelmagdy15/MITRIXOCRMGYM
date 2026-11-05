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
  await page.goto('https://inzan.redgits.com/admin/members/view/4604', { waitUntil: 'networkidle' });

  const loadViewFn = await page.evaluate(() => {
    return (window as any).loadView ? (window as any).loadView.toString() : 'not on window';
  });

  console.log('loadView definition:\n', loadViewFn);
  await browser.close();
}

main().catch(console.error);
