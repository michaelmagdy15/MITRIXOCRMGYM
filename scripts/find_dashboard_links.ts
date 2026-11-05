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
  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a')).map(a => ({
      text: a.innerText.trim(),
      href: a.getAttribute('href')
    })).filter(x => x.text.includes('VIEW MORE') || x.text.includes('Freezing') || x.text.includes('Invitation'));
  });
  console.log('Dashboard links:', JSON.stringify(links, null, 2));
  await browser.close();
}

main().catch(console.error);
