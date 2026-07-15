import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

(async () => {
  console.log('Launching Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });
  const page = await context.newPage();

  try {
    console.log('Navigating to login page...');
    await page.goto('https://inzan.redgits.com/admin/login', { waitUntil: 'networkidle' });

    console.log('Filling login form...');
    
    // Selectors for username/email
    const userSelectors = ['input[type="text"]', 'input[name="username"]', 'input[name="email"]', '#username', '#email'];
    let userFilled = false;
    for (const selector of userSelectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          await page.fill(selector, 'mi5a');
          userFilled = true;
          console.log(`Filled username via selector: ${selector}`);
          break;
        }
      } catch (e) {}
    }
    if (!userFilled) {
      await page.fill('input', 'mi5a');
    }

    // Selectors for password
    const passSelectors = ['input[type="password"]', 'input[name="password"]', '#password'];
    let passFilled = false;
    for (const selector of passSelectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          await page.fill(selector, '12345678');
          passFilled = true;
          console.log(`Filled password via selector: ${selector}`);
          break;
        }
      } catch (e) {}
    }

    console.log('Submitting...');
    const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button:has-text("Login")', 'button:has-text("Log In")', 'form button'];
    let submitted = false;
    for (const selector of submitSelectors) {
      try {
        if (await page.locator(selector).count() > 0) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
            page.click(selector)
          ]);
          submitted = true;
          console.log(`Submitted form via selector: ${selector}`);
          break;
        }
      } catch (e) {}
    }

    if (!submitted) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }),
        page.keyboard.press('Enter')
      ]);
    }

    console.log('Post-login URL:', page.url());
    await page.waitForTimeout(3000);

    // Discover navigation links
    const links = await page.evaluate(() => {
      const navs = document.querySelectorAll('aside, nav, [class*="sidebar"], [class*="menu"], [class*="navigation"]');
      let results = [];
      navs.forEach(nav => {
        nav.querySelectorAll('a').forEach(a => {
          const text = a.innerText.trim().replace(/\n/g, ' ');
          const href = a.getAttribute('href');
          if (text && href && !results.some(r => r.href === href)) {
            results.push({ text, href });
          }
        });
      });

      if (results.length === 0) {
        document.querySelectorAll('a').forEach(a => {
          const text = a.innerText.trim().replace(/\n/g, ' ');
          const href = a.getAttribute('href');
          if (text && href && (href.startsWith('/admin') || href.includes('/admin')) && text.length < 30) {
            results.push({ text, href });
          }
        });
      }
      return results;
    });

    console.log('Discovered navigation links:', links);

    const origin = new URL(page.url()).origin;
    const urlsToScrape = [];
    urlsToScrape.push(page.url());

    links.forEach(l => {
      let fullUrl = l.href;
      if (!fullUrl.startsWith('http')) {
        fullUrl = fullUrl.startsWith('/') ? `${origin}${fullUrl}` : `${origin}/${fullUrl}`;
      }
      if (fullUrl.includes('/admin') && !fullUrl.includes('logout') && !urlsToScrape.includes(fullUrl)) {
        urlsToScrape.push(fullUrl);
      }
    });

    console.log('Systematic URLs to scrape:', urlsToScrape);

    const scrapedPages = [];

    for (const url of urlsToScrape) {
      try {
        console.log(`Navigating to: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);

        const safeUrlName = url.replace(/https?:\/\//, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 50);
        const screenshotDir = 'C:/Users/Mi5a/MitrixoGYMCRMPlatform/screenshots';
        fs.mkdirSync(screenshotDir, { recursive: true });
        const screenshotPath = path.join(screenshotDir, `redgits_${safeUrlName}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`Saved screenshot to ${screenshotPath}`);

        const pageData = await page.evaluate(() => {
          const data = {
            url: window.location.href,
            path: window.location.pathname,
            pageTitle: document.title,
            scrapedAt: new Date().toISOString(),
            headers: [],
            stats: [],
            forms: [],
            tables: [],
            generalStructure: ""
          };

          const h1s = Array.from(document.querySelectorAll('h1, h2, .page-title, .page-header, .card-title'));
          data.headers = h1s.map(h => h.innerText.trim()).filter(Boolean);

          const cards = document.querySelectorAll('[class*="card"], [class*="widget"], [class*="tile"], .stats-item, .info-box');
          cards.forEach(card => {
            const text = card.innerText.trim();
            const numbers = text.match(/\d+([.,]\d+)?/g);
            if (numbers && text.length < 150) {
              const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
              if (lines.length >= 2 && !data.stats.some(s => s.raw === text.replace(/\s+/g, ' '))) {
                data.stats.push({
                  lines: lines,
                  raw: text.replace(/\s+/g, ' ')
                });
              }
            }
          });

          const forms = document.querySelectorAll('form, [class*="form-container"], .modal-content');
          const processedInputs = new Set();

          function parseInput(input) {
            if (processedInputs.has(input)) return null;
            processedInputs.add(input);

            const name = input.getAttribute('name') || '';
            const id = input.getAttribute('id') || '';
            const type = input.getAttribute('type') || input.tagName.toLowerCase();
            const placeholder = input.getAttribute('placeholder') || '';
            
            let labelText = '';
            if (id) {
              const labelEl = document.querySelector(`label[for="${id}"]`);
              if (labelEl) labelText = labelEl.innerText.trim();
            }
            if (!labelText) {
              const parentLabel = input.closest('label');
              if (parentLabel) {
                labelText = parentLabel.innerText.replace(input.innerText || '', '').trim();
              }
            }
            if (!labelText) {
              const prev = input.previousElementSibling;
              if (prev && (prev.tagName === 'LABEL' || prev.classList.contains('control-label') || prev.classList.contains('form-label'))) {
                labelText = prev.innerText.trim();
              }
            }
            if (!labelText) {
              labelText = placeholder || name || id || 'Unlabeled Field';
            }

            labelText = labelText.replace(/\s+/g, ' ').trim();

            const inputData = {
              label: labelText,
              type: type,
              name: name,
              id: id,
              placeholder: placeholder
            };

            if (input.tagName.toLowerCase() === 'select') {
              inputData.options = Array.from(input.querySelectorAll('option'))
                .map(opt => ({
                  value: opt.value,
                  text: opt.innerText.trim()
                }))
                .filter(opt => opt.text);
            }

            return inputData;
          }

          forms.forEach(form => {
            const inputs = Array.from(form.querySelectorAll('input, select, textarea, button'));
            const formFields = inputs.map(parseInput).filter(Boolean);
            if (formFields.length > 0) {
              data.forms.push({
                id: form.getAttribute('id') || '',
                class: form.getAttribute('class') || '',
                fields: formFields
              });
            }
          });

          const looseInputs = Array.from(document.querySelectorAll('input, select, textarea'))
            .filter(input => !input.closest('form'))
            .map(parseInput)
            .filter(Boolean);

          if (looseInputs.length > 0) {
            data.forms.push({
              id: 'global-inputs',
              class: 'global',
              fields: looseInputs
            });
          }

          const tables = document.querySelectorAll('table');
          tables.forEach((table, index) => {
            const tableData = {
              index: index,
              id: table.getAttribute('id') || '',
              headers: [],
              rowsSample: []
            };

            const ths = table.querySelectorAll('th');
            if (ths.length > 0) {
              tableData.headers = Array.from(ths).map(th => th.innerText.trim().replace(/\s+/g, ' '));
            } else {
              const firstRow = table.querySelector('tr');
              if (firstRow) {
                tableData.headers = Array.from(firstRow.querySelectorAll('td')).map(td => td.innerText.trim().replace(/\s+/g, ' '));
              }
            }

            const trs = Array.from(table.querySelectorAll('tbody tr, tr')).slice(ths.length > 0 ? 0 : 1, 6);
            trs.forEach(tr => {
              const cells = Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim().replace(/\s+/g, ' '));
              if (cells.length > 0) {
                tableData.rowsSample.push(cells);
              }
            });

            if (tableData.headers.length > 0 || tableData.rowsSample.length > 0) {
              data.tables.push(tableData);
            }
          });

          return data;
        });

        pageData.screenshot = screenshotPath;
        scrapedPages.push(pageData);
        console.log(`Successfully scraped page data for ${url}`);
      } catch (err) {
        console.error(`Failed to scrape ${url}:`, err.message);
      }
    }

    const outputDir = 'C:/Users/Mi5a/MitrixoGYMCRMPlatform/docs/redgits_pages';
    fs.mkdirSync(outputDir, { recursive: true });
    
    fs.writeFileSync(
      path.join(outputDir, 'redgits_scraped_data.json'),
      JSON.stringify(scrapedPages, null, 2)
    );
    console.log('Saved final JSON data file.');

    scrapedPages.forEach(page => {
      let md = `# RedGits Page Analysis: ${page.pageTitle}\n\n`;
      md += `- **URL:** ${page.url}\n`;
      md += `- **Path:** \`${page.path}\`\n`;
      md += `- **Screenshot:** [View Local Screenshot](file:///${page.screenshot})\n\n`;

      if (page.headers && page.headers.length > 0) {
        md += `## 🏷️ Page Headers / Context\n`;
        page.headers.forEach(h => {
          md += `* ${h}\n`;
        });
        md += `\n`;
      }

      if (page.stats && page.stats.length > 0) {
        md += `## 📊 Widgets & Metrics\n`;
        page.stats.forEach(s => {
          md += `* **Metric Data:** ${s.raw}\n`;
        });
        md += `\n`;
      }

      if (page.forms && page.forms.length > 0) {
        md += `## 📝 Forms & Inputs\n\n`;
        page.forms.forEach((form, fIdx) => {
          const formId = form.id || `Form-${fIdx + 1}`;
          md += `### Form: ${formId} (Class: ${form.class || 'N/A'})\n`;
          md += `| Label | Field Type | ID / Name | Config / Options |\n`;
          md += `| :--- | :--- | :--- | :--- |\n`;
          form.fields.forEach(f => {
            let details = [];
            if (f.placeholder) details.push(`Placeholder: "${f.placeholder}"`);
            if (f.options && f.options.length > 0) {
              details.push(`Options: [${f.options.map(o => `${o.text}:${o.value}`).join(', ')}]`);
            }
            md += `| **${f.label}** | \`${f.type}\` | \`${f.id || f.name || '-'}\` | ${details.join('<br>') || '-'} |\n`;
          });
          md += `\n`;
        });
      }

      if (page.tables && page.tables.length > 0) {
        md += `## 📋 Tables & Data Structure\n\n`;
        page.tables.forEach((t, tIdx) => {
          md += `### Table #${tIdx + 1} (ID: ${t.id || 'N/A'})\n\n`;
          if (t.headers && t.headers.length > 0) {
            md += `| ` + t.headers.join(' | ') + ` |\n`;
            md += `| ` + t.headers.map(() => '---').join(' | ') + ` |\n`;
          }
          if (t.rowsSample && t.rowsSample.length > 0) {
            t.rowsSample.forEach(row => {
              md += `| ` + row.join(' | ') + ` |\n`;
            });
          } else {
            md += `*No records discovered in this table.*\n`;
          }
          md += `\n`;
        });
      }

      const safeFileName = page.path.replace(/[^a-zA-Z0-9]/g, '_').replace(/^_+|_+$/g, '') || 'index';
      const mdPath = path.join(outputDir, `redgits_page_${safeFileName}.md`);
      fs.writeFileSync(mdPath, md);
      console.log(`Generated Markdown analysis: ${mdPath}`);
    });

    console.log('DONE scraping all pages.');
  } catch (err) {
    console.error('Playwright scrape failed:', err);
  } finally {
    await browser.close();
  }
})();
