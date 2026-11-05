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

  console.log('Testing /admin/members/view/302 (Member 4604)...');
  await page.goto('https://inzan.redgits.com/admin/members/view/302', { waitUntil: 'networkidle' });

  const viewData = await page.evaluate(async () => {
    const title = document.title;
    const bodySample = document.body.innerText.slice(0, 1000).replace(/\s+/g, ' ');
    const heroPhoto = (document.querySelector('.mpd-hero-photo img') as HTMLImageElement)?.src;
    
    // Check tabs
    const pkgData = await (await fetch('/admin/members/package_data/302')).text();
    const finData = await (await fetch('/admin/members/financial_list/302')).text();
    const frzData = await (await fetch('/admin/members/freezing_list/302')).text();
    const invData = await (await fetch('/admin/members/invitation_list/302')).text();

    return {
      title,
      heroPhoto,
      bodySample,
      pkgSample: pkgData.slice(0, 300).replace(/\s+/g, ' '),
      finSample: finData.slice(0, 300).replace(/\s+/g, ' '),
      frzSample: frzData.slice(0, 300).replace(/\s+/g, ' '),
      invSample: invData.slice(0, 300).replace(/\s+/g, ' ')
    };
  });

  console.log('View Data for 302:', JSON.stringify(viewData, null, 2));
  await browser.close();
}

main().catch(console.error);
