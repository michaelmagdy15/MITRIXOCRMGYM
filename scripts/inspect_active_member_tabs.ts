import { chromium } from 'playwright';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';

async function inspectActiveMember() {
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

  // Member 4604 (Yousef Aly)
  await page.goto(`${REDGITS_ORIGIN}/admin/members/view/4604`, { waitUntil: 'networkidle' });

  const tabContents = await page.evaluate(() => {
    // Find all tab panes
    const panes: Record<string, string> = {};
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      const id = pane.id;
      panes[id] = pane.innerHTML.slice(0, 300);
    });

    // Check custom_tab click handlers
    const links = Array.from(document.querySelectorAll('.profile-usermenu a')).map(a => ({
      text: (a as HTMLElement).innerText.trim(),
      href: a.getAttribute('href'),
      onclick: a.getAttribute('onclick')
    }));

    return { panes, links };
  });

  console.log('Tab contents:', JSON.stringify(tabContents, null, 2));

  await browser.close();
}

inspectActiveMember().catch(console.error);
