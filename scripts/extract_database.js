// RedGITS v17.12 Complete Live Extractor v2.0 (with Live Progress Bar & Unmasked Phone/Package/Payment Extraction)
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  loginUrl: 'https://inzan.redgits.com/admin/login',
  username: process.env.REDGITS_USERNAME || 'mi5a',
  password: process.env.REDGITS_PASSWORD || 'Miko0019_!',
  outputDir: path.resolve(process.cwd(), 'docs/redgits_pages'),
  progressFile: path.resolve(process.cwd(), 'docs/redgits_pages/migration_progress.json'),
  liveExtractFile: path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_extract_v2.json'),
  finalFile: path.resolve(process.cwd(), 'docs/redgits_pages/redgits_inzan_database.json'),
};

fs.mkdirSync(CONFIG.outputDir, { recursive: true });

function renderProgressBar(label, current, total, startTimeMs, extra = '') {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 100;
  const width = 28;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  const elapsedSec = Math.max(0.1, (Date.now() - startTimeMs) / 1000);
  const rate = current / elapsedSec;
  const remainingSec = rate > 0 && total > current ? Math.round((total - current) / rate) : 0;
  const line = `[${bar}] ${String(pct).padStart(3)}% | ${current}/${total} | ${label} | ETA: ${remainingSec}s ${extra}`;
  console.log(line);
}

/**
 * Expands any DataTables length selector to maximum (-1 / All / 50000) and scrapes all rows across pages.
 */
async function extractDataTableAllPages(page, label, startTimeMs) {
  // Set DataTables page length to All (-1) or highest available option
  try {
    await page.evaluate(() => {
      const selects = document.querySelectorAll('select[name$="_length"], .dataTables_length select');
      selects.forEach((select) => {
        const opts = Array.from(select.options);
        const allOpt = opts.find((o) => o.value === '-1' || o.text.toLowerCase().includes('all'));
        if (allOpt) {
          select.value = allOpt.value;
        } else if (opts.length > 0) {
          const maxOpt = opts.reduce((m, o) => (parseInt(o.value, 10) > parseInt(m.value, 10) ? o : m), opts[0]);
          select.value = maxOpt.value;
        }
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
    });
    await page.waitForTimeout(2500);
  } catch {}

  let headers = [];
  let allRows = [];
  let pageNum = 1;
  let hasNext = true;

  while (hasNext && pageNum <= 100) {
    const tableData = await page.evaluate(() => {
      // Pick the primary data table (never #searchall modal table)
      const candidates = Array.from(document.querySelectorAll('table')).filter(
        (t) => t.id !== 'searchall' && !t.closest('#searchall')
      );
      const table =
        document.querySelector('table#employee-grid') ||
        candidates.find((t) => t.querySelectorAll('tbody tr').length > 1) ||
        candidates[0];
      if (!table) return { headers: [], rows: [] };

      const hdrs = Array.from(table.querySelectorAll('thead th, tr:first-child th')).map((th) =>
        th.innerText.trim().replace(/\s+/g, ' ')
      );

      const rows = [];
      table.querySelectorAll('tbody tr').forEach((tr) => {
        const txt = tr.innerText.trim();
        if (!txt || txt.includes('No data available') || txt.includes('No matching records')) return;
        if (tr.classList.contains('dataTables_empty') || tr.querySelector('.dataTables_empty')) return;

        const cells = Array.from(tr.querySelectorAll('td')).map((td) => {
          let val = td.innerText.trim().replace(/\s+/g, ' ');
          const links = Array.from(td.querySelectorAll('a[href]'));
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const idMatch = href.match(/\/(?:view|edit|profile)\/(\d+)/);
            if (idMatch && !val.includes(`[ID:${idMatch[1]}]`)) {
              val = `${val} [ID:${idMatch[1]}]`.trim();
            }
            const waMatch = href.match(/wa\.me\/(\+?\d+)/);
            if (waMatch && !val.includes(waMatch[1])) {
              val = `${val} [WA:${waMatch[1]}]`.trim();
            }
          }
          return val;
        });

        if (cells.length > 0 && cells.some((c) => c !== '')) {
          rows.push(cells);
        }
      });

      return { headers: hdrs, rows };
    });

    if (tableData.headers.length > 0) headers = tableData.headers;
    if (tableData.rows.length > 0) allRows = allRows.concat(tableData.rows);

    renderProgressBar(label, pageNum, pageNum, startTimeMs, `Rows: ${allRows.length}`);

    try {
      const nextBtn = page.locator(
        '.dataTables_paginate .next:not(.disabled) a, .paginate_button.next:not(.disabled), #employee-grid_next:not(.disabled)'
      ).first();
      if ((await nextBtn.count()) > 0 && (await nextBtn.isVisible())) {
        const prevFirstRow = JSON.stringify(tableData.rows[0] || []);
        await nextBtn.click();
        await page.waitForTimeout(1800);
        const newFirstRow = await page.evaluate(() => {
          const tr = document.querySelector('table#employee-grid tbody tr, table tbody tr');
          return tr ? tr.innerText.trim() : '';
        });
        if (!newFirstRow || prevFirstRow.includes(newFirstRow.slice(0, 20))) {
          hasNext = false;
        } else {
          pageNum++;
        }
      } else {
        hasNext = false;
      }
    } catch {
      hasNext = false;
    }
  }

  return { headers, rows: allRows };
}

(async () => {
  const startTimeMs = Date.now();
  console.log('================================================================');
  console.log(' RedGITS v17.12 -> MitrixoGYM Live Extractor v2.0 (Inzan)');
  console.log('================================================================');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    renderProgressBar('Authenticating at inzan.redgits.com', 1, 10, startTimeMs);
    await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.click('#username');
    await page.fill('#username', CONFIG.username);
    await page.fill('#password', CONFIG.password);
    await page.click("#login-form button[type='submit'], button[type='submit']");
    await page.waitForTimeout(5000);

    const origin = new URL(page.url()).origin;
    console.log(`Authenticated successfully at ${page.url()}`);

    const endpoints = [
      { key: 'packagesCatalog', path: '/admin/packages/show', label: 'Packages Catalog (/admin/packages/show)' },
      { key: 'packageSubscriptions', path: '/admin/packagelist', label: 'Package Subscriptions & Unmasked Phones (/admin/packagelist)' },
      { key: 'activeMembers', path: '/admin/members/show/active', label: 'Active Members (/admin/members/show/active)' },
      { key: 'expiredMembers', path: '/admin/members/show/expired', label: 'Expired Members (/admin/members/show/expired)' },
      { key: 'guestLeads', path: '/admin/members/show/guest', label: 'Walk-in Guests & Leads (/admin/members/show/guest)' },
      { key: 'invitations', path: '/admin/members/show/invitation', label: 'Guest Invitations (/admin/members/show/invitation)' },
      { key: 'staff', path: '/admin/staff/show', label: 'Staff & Trainers (/admin/staff/show)' },
      { key: 'paymentMethods', path: '/admin/payment_method/show', label: 'Payment Methods (/admin/payment_method/show)' },
      { key: 'financeItems', path: '/admin/items/show', label: 'Finance Items (/admin/items/show)' },
      { key: 'debtors', path: '/admin/debtors/show', label: 'Debtors / Unpaid Balances (/admin/debtors/show)' },
    ];

    const liveExtract = {
      extractedAt: new Date().toISOString(),
      origin,
      tables: {},
    };

    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i];
      renderProgressBar(ep.label, i + 1, endpoints.length, startTimeMs);
      try {
        await page.goto(`${origin}${ep.path}`, { waitUntil: 'networkidle', timeout: 35000 });
        await page.waitForTimeout(1500);
        liveExtract.tables[ep.key] = await extractDataTableAllPages(page, ep.key, startTimeMs);
      } catch (err) {
        console.warn(`Warning on ${ep.path}: ${err.message}`);
        liveExtract.tables[ep.key] = { headers: [], rows: [] };
      }
    }

    fs.writeFileSync(CONFIG.liveExtractFile, JSON.stringify(liveExtract, null, 2), 'utf8');
    renderProgressBar('Live Extraction Saved', endpoints.length, endpoints.length, startTimeMs, `-> ${CONFIG.liveExtractFile}`);
  } finally {
    await browser.close();
  }
})();
