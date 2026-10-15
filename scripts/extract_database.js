// RedGITS v17.12 Complete Deep Extractor v3.0 (with Live Progress Bar)
// Extracts:
// 1. /admin/reports/nationalMembers (National ID, Birthday, Sales Man for all active members)
// 2. Missing /admin/members/view/{id} profiles (for any active/expired member not in redgits_inzan_database.json)
// 3. All 5 AJAX sub-tabs (package_data, financial_list, freezing_list, member_activities_list, call_center) for all 1,282 Active Members
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  loginUrl: 'https://inzan.redgits.com/admin/login',
  username: process.env.REDGITS_USERNAME || 'mi5a',
  password: process.env.REDGITS_PASSWORD || 'Miko0019_!',
  outputDir: path.resolve(process.cwd(), 'docs/redgits_pages'),
  dbFile: path.resolve(process.cwd(), 'docs/redgits_pages/redgits_inzan_database.json'),
  liveV2File: path.resolve(process.cwd(), 'docs/redgits_pages/redgits_live_extract_v2.json'),
  deepOutFile: path.resolve(process.cwd(), 'docs/redgits_pages/redgits_active_deep_extract.json'),
};

fs.mkdirSync(CONFIG.outputDir, { recursive: true });

function renderProgressBar(label, current, total, startTimeMs, extra = '') {
  const safeTotal = Math.max(1, total);
  const pct = Math.min(100, Math.round((current / safeTotal) * 100));
  const width = 28;
  const filled = Math.round((pct / 100) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(Math.max(0, width - filled));
  const elapsedSec = Math.max(0.1, (Date.now() - startTimeMs) / 1000);
  const rate = current / elapsedSec;
  const remainingSec = rate > 0 && total > current ? Math.round((total - current) / rate) : 0;
  console.log(
    `[${bar}] ${String(pct).padStart(3)}% | ${String(current).padStart(4)}/${String(total).padEnd(4)} | ${label.padEnd(30)} | ETA: ${String(remainingSec).padStart(2)}s ${extra}`
  );
}

(async () => {
  const globalStart = Date.now();
  console.log('================================================================================');
  console.log(' RedGITS v17.12 -> MitrixoGYM Deep Member & Sub-Tab Extractor v3.0 (Inzan)');
  console.log('================================================================================\n');

  const redgitsDb = fs.existsSync(CONFIG.dbFile)
    ? JSON.parse(fs.readFileSync(CONFIG.dbFile, 'utf8'))
    : { members: [] };
  const liveV2 = fs.existsSync(CONFIG.liveV2File)
    ? JSON.parse(fs.readFileSync(CONFIG.liveV2File, 'utf8'))
    : { tables: {} };

  const existingDeep = fs.existsSync(CONFIG.deepOutFile)
    ? JSON.parse(fs.readFileSync(CONFIG.deepOutFile, 'utf8'))
    : { nationalMembers: [], missingProfiles: {}, activeDeep: {} };

  const dbMap = new Map();
  for (const m of redgitsDb.members || []) {
    if (m.redgitsId) dbMap.set(String(m.redgitsId), m);
  }

  const activeIds = Array.from(
    new Set(
      (liveV2.tables?.activeMembers?.rows || [])
        .map((r) => {
          const m = r.join(' ').match(/\[ID:(\d+)\]/);
          return m ? m[1] : /^\d+$/.test(r[0] || '') ? String(r[0]) : '';
        })
        .filter(Boolean)
    )
  );

  const expiredIds = Array.from(
    new Set(
      (liveV2.tables?.expiredMembers?.rows || [])
        .map((r) => {
          const m = r.join(' ').match(/\[ID:(\d+)\]/);
          return m ? m[1] : '';
        })
        .filter(Boolean)
    )
  );

  const missingProfileIds = Array.from(
    new Set([
      ...activeIds.filter((id) => !dbMap.has(id) && !existingDeep.missingProfiles?.[id]),
      ...expiredIds.filter((id) => !dbMap.has(id) && !existingDeep.missingProfiles?.[id]),
    ])
  );

  const remainingActiveIds = activeIds.filter((id) => !existingDeep.activeDeep?.[id]);

  console.log(`Target Inventory:`);
  console.log(`  • Active Members in RedGITS     : ${activeIds.length}`);
  console.log(`  • Missing Profile Views to Fetch: ${missingProfileIds.length}`);
  console.log(`  • Active Members Deep Sub-Tabs  : ${remainingActiveIds.length} remaining (of ${activeIds.length})\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  try {
    renderProgressBar('Authenticating at RedGITS', 1, 1, globalStart);
    await page.goto(CONFIG.loginUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.fill('#username', CONFIG.username);
    await page.fill('#password', CONFIG.password);
    await page.click("#login-form button[type='submit'], button[type='submit']");
    await page.waitForTimeout(4000);

    // STAGE 1: National Members Report (/admin/reports/nationalMembers)
    if (!existingDeep.nationalMembers || existingDeep.nationalMembers.length < 100) {
      const stage1Start = Date.now();
      renderProgressBar('1/3 National Members Report', 0, 1, stage1Start);
      await page.goto('https://inzan.redgits.com/admin/reports/nationalMembers', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(3000);

      const natRows = await page.evaluate(async () => {
        // If DataTable exists, get all rows directly from DataTable API!
        if (window.jQuery && window.jQuery.fn?.DataTable) {
          const tables = window.jQuery('table').filter((_, t) => t.id !== 'searchall');
          if (tables.length > 0 && window.jQuery.fn.DataTable.isDataTable(tables[0])) {
            const dt = window.jQuery(tables[0]).DataTable();
            const data = dt.rows().data().toArray();
            if (data.length > 0) {
              return data.map((row) =>
                Array.isArray(row)
                  ? row.map((c) => {
                      const d = document.createElement('div');
                      d.innerHTML = String(c ?? '');
                      return d.innerText.replace(/\s+/g, ' ').trim();
                    })
                  : []
              );
            }
          }
        }
        // Fallback DOM extraction
        const trs = Array.from(document.querySelectorAll('table:not(#searchall) tbody tr'));
        return trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.innerText.replace(/\s+/g, ' ').trim()));
      });

      existingDeep.nationalMembers = natRows;
      fs.writeFileSync(CONFIG.deepOutFile, JSON.stringify(existingDeep), 'utf8');
      renderProgressBar('1/3 National Members Report', 1, 1, stage1Start, `Rows: ${natRows.length}`);
    } else {
      renderProgressBar('1/3 National Members Report', 1, 1, globalStart, `Cached: ${existingDeep.nationalMembers.length} rows`);
    }

    // STAGE 2: Fetch missing /admin/members/view/{id} profiles
    if (missingProfileIds.length > 0) {
      const stage2Start = Date.now();
      const BATCH_SIZE = 50;
      let done = 0;

      for (let i = 0; i < missingProfileIds.length; i += BATCH_SIZE) {
        const chunk = missingProfileIds.slice(i, i + BATCH_SIZE);
        const batchResult = await page.evaluate(async (ids) => {
          async function fetchProfile(id) {
            try {
              const r = await fetch(`/admin/members/view/${id}`, {
                headers: { 'X-Requested-With': 'XMLHttpRequest' },
              });
              const html = await r.text();
              const doc = new DOMParser().parseFromString(html, 'text/html');
              const pane = doc.querySelector('#member_data') || doc.body;
              const fullText = pane.innerText.replace(/\s+/g, ' ');
              const extract = (re) => {
                const m = fullText.match(re);
                return m ? m[1].trim() : '';
              };
              const dashText = (doc.querySelector('#member_dashboard') || doc.body).innerText.replace(/\s+/g, ' ');
              return {
                redgitsId: String(id),
                fields: {
                  'Member ID': extract(/Member ID\s*:\s*([^\s]+?)(?=\s+Member Name|\s+Copy|$)/i),
                  'Member Name': extract(/Member Name\s*:\s*(.+?)(?=\s+Username\s*:)/i),
                  Username: extract(/Username\s*:\s*(.+?)(?=\s+Mobile\s*:)/i),
                  Phone: extract(/Phone\s*:\s*(.*?)(?=\s+Backup Mobile\s*:)/i),
                  'Backup Mobile': extract(/Backup Mobile\s*:\s*(.*?)(?=\s+Job\s*:)/i),
                  Job: extract(/Job\s*:\s*(.*?)(?=\s+Birthday\s*:)/i),
                  Birthday: extract(/Birthday\s*:\s*(\d{4}-\d{2}-\d{2})/i),
                  'National ID': extract(/National ID\s*:\s*(\d+)/i),
                  Email: extract(/Email\s*:\s*(.*?)(?=\s+Area\s*:)/i),
                  Area: extract(/Area\s*:\s*(.*?)(?=\s+Sales Man\s*:)/i),
                  'Sales Man': extract(/Sales Man\s*:\s*(.+?)(?=\s+History\s+Sales|\s+Trainer\s*:)/i),
                  Address: extract(/Address\s*:\s*(.*?)(?=\s+Member Code\s*:)/i),
                  'Member Code': extract(/Member Code\s*:\s*(\d+)/i) || String(id),
                  Gender: extract(/Gender\s*:\s*(Male|Female)/i),
                  Type: extract(/Type\s*:\s*(.+?)(?=\s+Change\s+Guest Serial|\s+Guest Serial)/i),
                  'Guest Serial': extract(/Guest Serial\s*:\s*(.*?)(?=\s+Advertising Source\s*:)/i),
                  'Advertising Source': extract(/Advertising Source\s*:\s*(.+?)(?=\s+Change\s+Towel Card|\s+Towel Card)/i),
                  'Bar-code / RFID': extract(/Bar-code \/ RFID\s*:\s*(.*?)(?=\s+Change color)/i),
                  Nationality: extract(/Nationality\s*:\s*(.*?)(?=\s+Created On)/i),
                  'Created On': extract(/Created On\s*:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i),
                  'Created By': extract(/Created By\s*:\s*(.+?)(?=\s+Notes\s*:)/i),
                  Notes: extract(/Notes\s*:\s*(.*?)(?=\s+Add Note)/i),
                },
                balances: {
                  freezingBalance: Number((dashText.match(/Freezing Balance:\s*(\d+)/i) || [])[1] ?? 25),
                  invitationBalance: Number((dashText.match(/Invitation Balance:\s*(\d+)/i) || [])[1] ?? 3),
                  totalVisits: Number((dashText.match(/(\d+)\s+Total Visits/i) || [])[1] ?? 0),
                  pkgSessions: Number((dashText.match(/Sessions\s+(\d+)/i) || [])[1] ?? 0),
                },
              };
            } catch {
              return null;
            }
          }

          const out = {};
          let idx = 0;
          const concurrency = 18;
          async function worker() {
            while (idx < ids.length) {
              const id = ids[idx++];
              const res = await fetchProfile(id);
              if (res) out[id] = res;
            }
          }
          await Promise.all(Array.from({ length: concurrency }, () => worker()));
          return out;
        }, chunk);

        Object.assign(existingDeep.missingProfiles, batchResult);
        done += chunk.length;
        renderProgressBar('2/3 Missing Member Profiles', done, missingProfileIds.length, stage2Start);
      }
      fs.writeFileSync(CONFIG.deepOutFile, JSON.stringify(existingDeep), 'utf8');
    }

    // STAGE 3: Fetch all 5 AJAX sub-tabs for all 1,282 Active Members
    if (remainingActiveIds.length > 0) {
      const stage3Start = Date.now();
      const BATCH_SIZE = 60;
      let done = activeIds.length - remainingActiveIds.length;

      for (let i = 0; i < remainingActiveIds.length; i += BATCH_SIZE) {
        const chunk = remainingActiveIds.slice(i, i + BATCH_SIZE);
        const batchResult = await page.evaluate(async (ids) => {
          async function getDoc(url) {
            const r = await fetch(url, { headers: { 'X-Requested-With': 'XMLHttpRequest' } });
            const html = await r.text();
            return new DOMParser().parseFromString(html, 'text/html');
          }

          function parseTableRows(doc) {
            const tables = Array.from(doc.querySelectorAll('table')).filter((t) => t.id !== 'searchall');
            const out = [];
            for (const t of tables) {
              for (const tr of t.querySelectorAll('tbody tr')) {
                const row = Array.from(tr.querySelectorAll('td')).map((td) =>
                  td.innerText.replace(/\s+/g, ' ').trim()
                );
                if (
                  row.length > 1 &&
                  !row[0].includes('No data available') &&
                  !row[0].includes('No matching')
                ) {
                  out.push(row);
                }
              }
            }
            return out;
          }

          function parsePackages(doc) {
            const text = doc.body.innerText.replace(/\s+/g, ' ').trim();
            const parts = text.split(/Package Name:\s*/i).slice(1);
            return parts
              .map((part) => {
                const nameMatch = part.match(/^(.+?)(?=\s*\(Remaining|\s+Status\s*:)/i);
                const remMatch = part.match(/\(Remaining\s*:\s*(\d+)\s*Session/i);
                const statusMatch = part.match(/Status\s*:\s*(.+?)(?=\s+Start Date:)/i);
                const startMatch = part.match(/Start Date:\s*(\d{4}-\d{2}-\d{2})/i);
                const endMatch = part.match(/End Date\s*:\s*(\d{4}-\d{2}-\d{2})/i);
                const createdOnMatch = part.match(/Created On:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/i);
                const createdByMatch = part.match(/Created By:\s*(.+?)(?=\s+Type\s*:)/i);
                const targetSalesMatch = part.match(/\(Target\s+([^)]+)\)/i);
                const actCountMatch = part.match(/Activites Count\s*\((\d+)\)/i);
                const freePtMatch = part.match(/Free PT\s*\((\d+)\)/i);
                const groupClassMatch = part.match(/Group Training \[Classes\]\s*\((\d+)\)/i);

                return {
                  packageName: nameMatch ? nameMatch[1].trim() : '',
                  remainingSessions: remMatch ? Number(remMatch[1]) : null,
                  statusRaw: statusMatch ? statusMatch[1].trim() : 'Active',
                  startDate: startMatch ? startMatch[1] : '',
                  endDate: endMatch ? endMatch[1] : '',
                  createdOn: createdOnMatch ? createdOnMatch[1] : '',
                  createdBy: createdByMatch ? createdByMatch[1].trim() : '',
                  targetSales: targetSalesMatch ? targetSalesMatch[1].trim() : '',
                  activitiesCount: actCountMatch ? Number(actCountMatch[1]) : 0,
                  freePt: freePtMatch ? Number(freePtMatch[1]) : 0,
                  groupClasses: groupClassMatch ? Number(groupClassMatch[1]) : 0,
                };
              })
              .filter((p) => p.packageName);
          }

          const out = {};
          let idx = 0;
          const concurrency = 18;

          async function worker() {
            while (idx < ids.length) {
              const id = ids[idx++];
              try {
                const [pkgDoc, finDoc, frzDoc, attDoc, callDoc] = await Promise.all([
                  getDoc(`/admin/members/package_data/${id}`),
                  getDoc(`/admin/members/financial_list/${id}`),
                  getDoc(`/admin/members/freezing_list/${id}`),
                  getDoc(`/admin/members/member_activities_list/${id}`),
                  getDoc(`/admin/members/call_center/${id}`),
                ]);
                out[id] = {
                  packages: parsePackages(pkgDoc),
                  fin: parseTableRows(finDoc),
                  frz: parseTableRows(frzDoc),
                  att: parseTableRows(attDoc),
                  call: parseTableRows(callDoc),
                };
              } catch {}
            }
          }

          await Promise.all(Array.from({ length: concurrency }, () => worker()));
          return out;
        }, chunk);

        Object.assign(existingDeep.activeDeep, batchResult);
        done += chunk.length;
        renderProgressBar(
          '3/3 Active Deep Sub-Tabs',
          done,
          activeIds.length,
          stage3Start,
          `(Saved checkpoint)`
        );
        fs.writeFileSync(CONFIG.deepOutFile, JSON.stringify(existingDeep), 'utf8');
      }
    } else {
      renderProgressBar('3/3 Active Deep Sub-Tabs', activeIds.length, activeIds.length, globalStart, 'Cached');
    }

    const totalSec = ((Date.now() - globalStart) / 1000).toFixed(1);
    console.log('\n================================================================================');
    console.log(` ✅ DEEP EXTRACTION COMPLETE in ${totalSec}s -> ${CONFIG.deepOutFile}`);
    console.log('================================================================================');
  } finally {
    await browser.close();
  }
})();
