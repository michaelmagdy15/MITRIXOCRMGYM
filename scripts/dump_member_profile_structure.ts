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

  const tabsInfo = await page.evaluate(() => {
    const navItems = Array.from(document.querySelectorAll('.profile-usermenu li a')).map((a) => {
      const el = a as HTMLElement;
      return {
        text: el.innerText.trim(),
        href: a.getAttribute('href'),
        onclick: a.getAttribute('onclick'),
        dataUrl: a.getAttribute('data-url') || a.getAttribute('data-target')
      };
    });

    const panes = Array.from(document.querySelectorAll('.tab-pane')).map((p) => {
      return {
        id: p.id,
        classList: p.className,
        textPreview: p.innerText.slice(0, 150).replace(/\s+/g, ' ')
      };
    });

    return { navItems, panes };
  });

  console.log('Tabs Info:', JSON.stringify(tabsInfo, null, 2));
  await browser.close();
}

main().catch(console.error);
