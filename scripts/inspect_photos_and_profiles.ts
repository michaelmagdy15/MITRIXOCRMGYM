import { chromium } from 'playwright';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';

async function inspectMediaAndEndpoints() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

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

  console.log('Logged in. Inspecting a sample member view page (e.g., ID 4604 or 5253)...');
  await page.goto(`${REDGITS_ORIGIN}/admin/members/view/5253`, { waitUntil: 'domcontentloaded' });
  
  const memberData = await page.evaluate(() => {
    const images = Array.from(document.querySelectorAll('img')).map(img => ({
      src: img.src,
      alt: img.alt,
      id: img.id,
      className: img.className
    }));

    const freezeInfo = document.body.innerText.includes('Freeze') || document.body.innerText.includes('freeze');
    const ptInfo = document.body.innerText.includes('PT') || document.body.innerText.includes('Personal Trainer');
    
    // Find all links to documents, pdfs, images
    const links = Array.from(document.querySelectorAll('a[href]')).map(a => a.getAttribute('href') || '');

    return {
      title: document.title,
      images,
      hasFreeze: freezeInfo,
      hasPt: ptInfo,
      docLinks: links.filter(l => l.includes('.pdf') || l.includes('.jpg') || l.includes('.png') || l.includes('download') || l.includes('uploads')),
      bodyExcerpt: document.body.innerText.slice(0, 1000)
    };
  });

  console.log('Sample Member Data:', JSON.stringify(memberData, null, 2));

  // Let's also check /admin/members/card_id_zk
  console.log('Inspecting /admin/members/card_id_zk...');
  await page.goto(`${REDGITS_ORIGIN}/admin/members/card_id_zk`, { waitUntil: 'domcontentloaded' });
  const cardIdInfo = await page.evaluate(() => {
    return {
      title: document.title,
      tableText: document.querySelector('table')?.innerText.slice(0, 500) || 'no table',
      htmlSample: document.body.innerHTML.slice(0, 500)
    };
  });
  console.log('Card ID ZK Info:', JSON.stringify(cardIdInfo, null, 2));

  await browser.close();
}

inspectMediaAndEndpoints().catch(console.error);
