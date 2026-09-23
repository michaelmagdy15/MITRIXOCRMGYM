const { chromium } = require('playwright');
const { PDFDocument } = require('pdf-lib');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
(async () => {
  await fs.mkdir('tmp/pdfs', { recursive: true });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    for (const tenant of ['inzanathletics', 'strike']) {
      const page = await browser.newPage({ acceptDownloads: true });
      await page.goto(`http://127.0.0.1:5174/?tenant=${tenant}`);
      await page.waitForFunction(() => !!document.querySelector('#root')?.children.length);
      await page.waitForTimeout(1500);
      const palette = await page.evaluate(() => ({ tenant: document.documentElement.dataset.tenantTheme, dark: document.documentElement.classList.contains('dark'), card: getComputedStyle(document.documentElement).getPropertyValue('--card').trim(), background: getComputedStyle(document.body).backgroundColor }));
      if (tenant === 'inzanathletics') { assert.equal(palette.card, '#1a1a1a'); assert.equal(palette.background, 'rgb(0, 0, 0)'); assert.equal(palette.dark, true); }
      else { assert.notEqual(palette.card, '#1a1a1a'); assert.equal(palette.dark, false); }
      await page.screenshot({ path: `tmp/pdfs/${tenant}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `tmp/pdfs/${tenant}-mobile.png`, fullPage: true });
      await page.evaluate(() => { window.shareCalls = 0; Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true }); Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { window.shareCalls++; } }); });
      const downloadPromise = page.waitForEvent('download');
      const result = await page.evaluate(async () => {
        const { generateClientContract } = await import('/src/utils/pdfGenerator.ts');
        const blob = await generateClientContract({ id: 'test', memberId: 'MEM-9001', name: 'Contract Test Member', phone: '01000000000', status: 'Active', gender: 'Female', nationality: 'Egyptian', dateOfBirth: '1995-04-03', packageType: 'Legacy package', packages: [{ id: 'pkg', packageName: 'Annual Membership', status: 'Active', startDate: '2026-09-23', endDate: '2027-09-22' }] }, { printedBy: 'Test Staff', payment: { id: 'pay', clientId: 'test', amount: 500, amount_paid: 0, method: 'Cash', date: '2026-09-23', packageType: 'Annual Membership', receiptSerial: 'TEST-001' } });
        return { size: blob?.size, shareCalls: window.shareCalls };
      });
      assert.equal(result.shareCalls, 0); assert.ok(result.size > 0);
      const download = await downloadPromise;
      assert.equal(download.suggestedFilename(), 'Contract_Contract_Test_Member.pdf');
      await fs.copyFile(await download.path(), `tmp/pdfs/${tenant}-generated.pdf`);
      const pdf = await PDFDocument.load(await fs.readFile(`tmp/pdfs/${tenant}-generated.pdf`));
      const form = pdf.getForm();
      assert.equal(form.getTextField(tenant === 'strike' ? 'text_1ecyo' : 'name').getText(), 'Contract Test Member');
      assert.equal(form.getTextField(tenant === 'strike' ? 'text_3pbmr' : 'amount').getText(), '0');
      assert.equal(form.getTextField(tenant === 'strike' ? 'text_7acxg' : 'package').getText(), 'Annual Membership');
      assert.equal(form.getTextField(tenant === 'strike' ? 'text_6lmen' : 'endDate').getText(), '22/09/2027');
      const emptyValues = await page.evaluate(async (tenantId) => {
        const { buildClientContract } = await import('/src/utils/pdfGenerator.ts');
        const { contractTemplates } = await import('/src/config/contractTemplates.ts');
        const bytes = await (await fetch(contractTemplates[tenantId].url)).arrayBuffer();
        const output = await buildClientContract(bytes, tenantId, { id: 'missing', name: 'Missing Details', phone: '', status: 'Active', startDate: 'invalid', membershipExpiry: 'invalid' });
        return Array.from(output);
      }, tenant);
      const emptyPdf = await PDFDocument.load(Uint8Array.from(emptyValues));
      assert.equal(emptyPdf.getForm().getTextField(tenant === 'strike' ? 'text_3pbmr' : 'amount').getText() || '', '');
      assert.equal(emptyPdf.getForm().getTextField(tenant === 'strike' ? 'text_5inc' : 'startDate').getText() || '', '');
      const negatives = await page.evaluate(async () => {
        const { buildClientContract } = await import('/src/utils/pdfGenerator.ts');
        try { await buildClientContract(new Uint8Array(), 'unconfigured-gym', { id: 'x', name: 'X' }); return false; } catch (e) { return e.message.includes('No contract template'); }
      });
      assert.equal(negatives, true);
      console.log(tenant, 'download, fields, zero amount, package dates, unknown-tenant rejection and theme PASS', palette);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
