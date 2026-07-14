// RedGits Database Extractor Automation Script v1.0
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const CONFIG = {
  loginUrl: 'https://inzan.redgits.com/admin/login',
  username: 'mi5a',
  password: '12345678',
  outputDir: 'C:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/redgits_pages',
  progressFile: 'C:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/redgits_pages/migration_progress.json',
  finalFile: 'C:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/redgits_pages/redgits_inzan_database.json',
  concurrency: 20
};

// Ensure output directories exist
fs.mkdirSync(CONFIG.outputDir, { recursive: true });

// Load or initialize progress
let progress = {
  listsScraped: false,
  membersList: [],
  paymentsList: [],
  staffList: [],
  callLogsList: [],
  lostFoundList: [],
  complaintsList: [],
  membersDetailScraped: {}, // Map of memberId/code -> detail object
  crawledUrls: []
};

if (fs.existsSync(CONFIG.progressFile)) {
  try {
    progress = JSON.parse(fs.readFileSync(CONFIG.progressFile, 'utf8'));
    console.log(`Loaded existing progress. Scraped details count: ${Object.keys(progress.membersDetailScraped).length}`);
  } catch (e) {
    console.log('Error parsing progress file, starting fresh.');
  }
}

function saveProgress() {
  fs.writeFileSync(CONFIG.progressFile, JSON.stringify(progress, null, 2), 'utf8');
}

/**
 * Standard table parser that extracts all text, anchors and formatting info
 */
async function scrapeTable(page, tableSelector) {
  return await page.evaluate((sel) => {
    const table = document.querySelector(sel);
    if (!table) return null;

    const headers = [];
    const rows = [];

    // Get headers
    const ths = table.querySelectorAll('thead th, th');
    ths.forEach(th => {
      const text = th.innerText.trim().replace(/[\n\r]+/g, ' ');
      if (text) headers.push(text);
    });

    // If no thead headers, try first row
    if (headers.length === 0) {
      const firstRow = table.querySelector('tr');
      if (firstRow) {
        firstRow.querySelectorAll('td, th').forEach(cell => {
          headers.push(cell.innerText.trim());
        });
      }
    }

    // Get all body rows
    const bodyRows = table.querySelectorAll('tbody tr, tr');
    bodyRows.forEach(tr => {
      const text = tr.innerText.trim();
      if (text.includes('No data available') || text.includes('No records')) return;
      if (tr.classList.contains('dataTables_empty') || tr.querySelector('.dataTables_empty')) return;

      const cells = [];
      tr.querySelectorAll('td').forEach(td => {
        let cellValue = td.innerText.trim().replace(/[\n\r]+/g, ' ');
        
        // Capture specific links (e.g. member view/edit URLs)
        const link = td.querySelector('a[href]');
        if (link) {
          const href = link.getAttribute('href') || '';
          if (href && !cellValue) {
            cellValue = href;
          } else if (href && (href.includes('/view/') || href.includes('/edit/'))) {
            const idMatch = href.match(/\/(\d+)(?:\?|$|\/)/);
            if (idMatch) {
              cellValue = cellValue + ` [ID:${idMatch[1]}]`;
            }
          }
        }

        // Capture image sources
        const img = td.querySelector('img');
        if (img && img.src) {
          cellValue = cellValue ? `${cellValue} [img:${img.src}]` : `[img:${img.src}]`;
        }

        // Capture badges
        const badge = td.querySelector('.badge, .label, .tag');
        if (badge && !cellValue) {
          cellValue = badge.innerText.trim();
        }

        cells.push(cellValue);
      });

      if (cells.length > 0 && cells.some(c => c !== '')) {
        rows.push(cells);
      }
    });

    return { headers, rows };
  }, tableSelector);
}

/**
 * Handle paging and changing dropdown size for DataTables
 */
async function extractDataTableFull(page, tableSelector) {
  console.log(`Extracting full table at ${page.url()}`);
  
  // Try changing select size to max (e.g. 50000 or 1000)
  try {
    await page.evaluate(() => {
      const select = document.querySelector('select[name$="_length"], .dataTables_length select');
      if (select) {
        const options = Array.from(select.options);
        if (options.length > 0) {
          const maxOpt = options.reduce((max, opt) => parseInt(opt.value) > parseInt(max.value) ? opt : max, options[0]);
          select.value = maxOpt.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    });
    // Wait for network/UI update
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log('Could not change DataTable length select (or non-datatable).');
  }

  // Check if pagination exists and extract all pages if length selection was not enough
  let hasNext = true;
  let allRows = [];
  let headers = [];
  
  while (hasNext) {
    const tableData = await scrapeTable(page, tableSelector);
    if (tableData) {
      headers = tableData.headers;
      allRows = allRows.concat(tableData.rows);
    }

    // Try to click Next button
    try {
      const nextBtn = page.locator('.paginate_button.next:not(.disabled), #employee-grid_next:not(.disabled), .pagination .next:not(.disabled)');
      if (await nextBtn.count() > 0 && await nextBtn.isVisible()) {
        console.log('Clicking DataTable Next button...');
        await nextBtn.click();
        await page.waitForTimeout(1500);
      } else {
        hasNext = false;
      }
    } catch (e) {
      hasNext = false;
    }
  }

  return { headers, rows: allRows };
}

/**
 * Parse member detail view
 */
async function scrapeMemberProfile(page, url) {
  console.log(`Scraping profile: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(100);

  const memberIdMatch = url.match(/\/view\/(\d+)/);
  const redgitsId = memberIdMatch ? memberIdMatch[1] : '';

  const details = await page.evaluate((rId) => {
    const fields = {};
    const infoRows = document.querySelectorAll('.form-group, .detail-row, tr, .info-row, .row');
    
    infoRows.forEach(row => {
      const label = row.querySelector('label, .control-label, th, .detail-label, strong');
      const value = row.querySelector('.form-control-static, td:last-child, .detail-value, span:not(label)');
      if (label && value) {
        const key = label.innerText.trim().replace(/[:\s]+$/, '');
        const val = value.innerText.trim();
        if (key && val && key !== val && key.length < 50) {
          fields[key] = val;
        }
      }
    });

    const profileImg = document.querySelector('.profile-img img, .member-photo img, .avatar img, img[class*="profile"]');
    if (profileImg) {
      fields['profileImage'] = profileImg.src;
    }

    return {
      redgitsId: rId,
      fields
    };
  }, redgitsId);

  // Scrape tables in tabs
  const tablesCount = await page.locator('table').count();
  const tables = [];
  for (let i = 0; i < tablesCount; i++) {
    const tableData = await scrapeTable(page, `table:nth-of-type(${i + 1})`);
    if (tableData && tableData.rows.length > 0) {
      tables.push(tableData);
    }
  }

  // Classify tab tables
  details.packages = [];
  details.payments = [];
  details.attendance = [];
  details.comments = [];
  details.transfers = [];

  tables.forEach(table => {
    const headerStr = table.headers.join(' ').toLowerCase();
    if (headerStr.includes('package') || headerStr.includes('subscription')) {
      details.packages.push(table);
    } else if (headerStr.includes('payment') || headerStr.includes('amount') || headerStr.includes('income')) {
      details.payments.push(table);
    } else if (headerStr.includes('check') || headerStr.includes('attendance') || headerStr.includes('activity')) {
      details.attendance.push(table);
    } else if (headerStr.includes('comment') || headerStr.includes('note')) {
      details.comments.push(table);
    } else if (headerStr.includes('transfer')) {
      details.transfers.push(table);
    }
  });

  return details;
}

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    // 1. LOGIN
    console.log(`Navigating to ${CONFIG.loginUrl}...`);
    await page.goto(CONFIG.loginUrl, { waitUntil: 'networkidle' });
    
    // Fill credentials
    await page.fill('input[type="text"], input[name="username"], #username', CONFIG.username);
    await page.fill('input[type="password"], input[name="password"], #password', CONFIG.password);
    
    console.log('Submitting login form...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      page.click('button[type="submit"], input[type="submit"]')
    ]);

    console.log(`Login Successful. Redirected to: ${page.url()}`);

    // 2. SCRAPE LISTINGS
    if (!progress.listsScraped) {
      const origin = new URL(page.url()).origin;
      
      const getSelector = (urlPath) => {
        if (urlPath.includes('/members/') || urlPath.includes('/callcenter')) {
          return 'table#employee-grid';
        }
        return 'table';
      };

      // Scrape Active Members list
      console.log('Scraping Active Members list...');
      await page.goto(`${origin}/admin/members/show/active`, { waitUntil: 'networkidle' });
      progress.membersList = (await extractDataTableFull(page, getSelector('/admin/members/show/active'))).rows;
      saveProgress();

      // Scrape Expired Members list
      console.log('Scraping Expired Members list...');
      await page.goto(`${origin}/admin/members/show/expired`, { waitUntil: 'networkidle' });
      const expired = (await extractDataTableFull(page, getSelector('/admin/members/show/expired'))).rows;
      progress.membersList = progress.membersList.concat(expired);
      saveProgress();

      // Scrape Incomes / Payments list
      console.log('Scraping Incomes/Payments list...');
      await page.goto(`${origin}/admin/incomes/`, { waitUntil: 'networkidle' });
      progress.paymentsList = (await extractDataTableFull(page, getSelector('/admin/incomes/'))).rows;
      saveProgress();

      // Scrape Staff list
      console.log('Scraping Staff list...');
      await page.goto(`${origin}/admin/staff/show`, { waitUntil: 'networkidle' });
      progress.staffList = (await extractDataTableFull(page, getSelector('/admin/staff/show'))).rows;
      saveProgress();

      // Scrape Call Center list
      console.log('Scraping Call Center list...');
      await page.goto(`${origin}/admin/callcenter`, { waitUntil: 'networkidle' });
      progress.callLogsList = (await extractDataTableFull(page, getSelector('/admin/callcenter'))).rows;
      saveProgress();

      // Scrape Lost & Found list
      console.log('Scraping Lost & Found list...');
      await page.goto(`${origin}/admin/lost`, { waitUntil: 'networkidle' });
      progress.lostFoundList = (await extractDataTableFull(page, getSelector('/admin/lost'))).rows;
      saveProgress();

      // Scrape Complaints list
      console.log('Scraping Complaints list...');
      await page.goto(`${origin}/admin/complain_title/show`, { waitUntil: 'networkidle' });
      progress.complaintsList = (await extractDataTableFull(page, getSelector('/admin/complain_title/show'))).rows;

      
      progress.listsScraped = true;
      saveProgress();
      console.log('All listing databases extracted successfully.');
    }

    // 3. RETRIEVE MEMBER PROFILE DETAIL LINKS
    // Generate distinct detail view links from member lists
    // Columns typically have member codes or buttons pointing to /admin/members/view/{code}
    const memberCodes = new Set();
    progress.membersList.forEach(m => {
      // Typically first or third column has code (ID) or Action link
      m.forEach(val => {
        const idMatch = val.match(/\[ID:(\d+)\]/) || val.match(/^\d+$/);
        if (idMatch) memberCodes.add(idMatch[1]);
      });
    });

    console.log(`Discovered ${memberCodes.size} member profiles needing detailed crawl.`);
    const codesToCrawl = Array.from(memberCodes).filter(code => !progress.membersDetailScraped[code]);
    console.log(`Remaining profiles to crawl: ${codesToCrawl.length}`);

    // 4. PARALLEL MEMBER DETAIL CRAWLER
    const origin = new URL(page.url()).origin;
    const workerPromises = [];
    
    // Spawn workers to crawl profile details concurrently
    for (let i = 0; i < CONFIG.concurrency; i++) {
      const workerPage = await context.newPage();
      // Block stylesheet, image, font, media to speed up extraction by 10x
      await workerPage.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'stylesheet', 'media', 'font'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });
      workerPromises.push((async () => {
        while (codesToCrawl.length > 0) {
          const code = codesToCrawl.pop();
          if (!code) break;

          const profileUrl = `${origin}/admin/members/view/${code}`;
          try {
            const profileData = await scrapeMemberProfile(workerPage, profileUrl);
            progress.membersDetailScraped[code] = profileData;
            saveProgress();
            console.log(`[Worker] Scraped details for member ${code}. Remaining: ${codesToCrawl.length}`);
          } catch (e) {
            console.error(`[Worker] Failed profile crawl for ${code}:`, e.message);
            // Put it back to retry later
            codesToCrawl.unshift(code);
            await workerPage.waitForTimeout(5000);
          }
        }
        await workerPage.close();
      })());
    }

    await Promise.all(workerPromises);

    // 5. CONSOLIDATE AND SAVE MIGRATION DATA
    console.log('Consolidating final database structure...');
    const dbExport = {
      extractedAt: new Date().toISOString(),
      domain: new URL(page.url()).hostname,
      members: Object.values(progress.membersDetailScraped),
      payments: progress.paymentsList,
      staff: progress.staffList,
      calllogs: progress.callLogsList,
      lostfound: progress.lostFoundList,
      complaints: progress.complaintsList
    };

    fs.writeFileSync(CONFIG.finalFile, JSON.stringify(dbExport, null, 2), 'utf8');
    console.log(`MIGRATION DATABASE COMPLETE: Saved to ${CONFIG.finalFile}`);

  } catch (err) {
    console.error('Migration automation run failed:', err);
  } finally {
    await browser.close();
  }
})();
