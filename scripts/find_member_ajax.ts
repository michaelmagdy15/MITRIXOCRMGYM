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
  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script')).map(s => s.innerHTML).filter(s => s.includes('custom_tab') || s.includes('custom') || s.includes('ajax') || s.includes('freeze') || s.includes('Freezing'));
  });
  console.log('Matching scripts count:', scripts.length);
  scripts.forEach((s, i) => console.log(`Script ${i}:\n${s}\n---`));
  await browser.close();
}

main().catch(console.error);
