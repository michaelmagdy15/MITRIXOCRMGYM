import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

const REDGITS_ORIGIN = 'https://inzan.redgits.com';
const REDGITS_USER = 'mi5a';
const REDGITS_PASS = 'Miko0019_!';

const PHOTO_DIR = path.resolve(process.cwd(), 'backups', 'member_photos');
if (!fs.existsSync(PHOTO_DIR)) {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });
}

async function downloadActivePhotos() {
  console.log('1. Reading active members from backups/redgits_master_archive_2026/active_members.json...');
  const activeMembers = JSON.parse(
    fs.readFileSync('backups/redgits_master_archive_2026/active_members.json', 'utf8')
  ) as any[][];

  console.log(`Found ${activeMembers.length} active members.`);
  const memberIds: string[] = [];
  for (const row of activeMembers) {
    const rId = (row[0] || '').replace(/[^\d]/g, '');
    if (rId) memberIds.push(rId);
  }

  console.log(`Extracted ${memberIds.length} unique RedGITS IDs.`);

  console.log('2. Launching browser session to fetch photos directly...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${REDGITS_ORIGIN}/admin/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ u, p }) => {
    (document.querySelector('#username') as HTMLInputElement).value = u;
    (document.querySelector('#password') as HTMLInputElement).value = p;
  }, { u: REDGITS_USER, p: REDGITS_PASS });

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('#login-form button[type="submit"]')
  ]);

  console.log('3. Downloading photos in batches of 20 concurrent requests...');
  let downloaded = 0;
  let skipped = 0;
  let missing = 0;

  const BATCH_SIZE = 25;
  for (let i = 0; i < memberIds.length; i += BATCH_SIZE) {
    const batch = memberIds.slice(i, i + BATCH_SIZE);
    const results = await page.evaluate(async (ids) => {
      const out: Array<{ id: string; base64: string | null; filename: string }> = [];
      for (const id of ids) {
        const candidates = [`/uploads/members/${id}-cam.jpg`, `/uploads/members/${id}.jpg`, `/uploads/members/${id}.png`];
        let found = false;
        for (const c of candidates) {
          try {
            const r = await fetch(c);
            if (r.ok) {
              const buf = await r.arrayBuffer();
              if (buf.byteLength > 600) {
                // Convert buffer to base64
                let binary = '';
                const bytes = new Uint8Array(buf);
                const len = bytes.byteLength;
                for (let b = 0; b < len; b++) {
                  binary += String.fromCharCode(bytes[b]);
                }
                const b64 = btoa(binary);
                const ext = c.endsWith('.png') ? '.png' : '.jpg';
                out.push({ id, base64: b64, filename: `${id}${ext}` });
                found = true;
                break;
              }
            }
          } catch (e) {}
        }
        if (!found) {
          out.push({ id, base64: null, filename: '' });
        }
      }
      return out;
    }, batch);

    for (const res of results) {
      if (res.base64) {
        const dest = path.join(PHOTO_DIR, res.filename);
        fs.writeFileSync(dest, Buffer.from(res.base64, 'base64'));
        downloaded++;
      } else {
        missing++;
      }
    }

    if ((i + BATCH_SIZE) % 100 === 0 || i + BATCH_SIZE >= memberIds.length) {
      console.log(`  Processed ${Math.min(i + BATCH_SIZE, memberIds.length)} / ${memberIds.length} members (Downloaded: ${downloaded}, No custom photo: ${missing})`);
    }
  }

  await browser.close();
  console.log(`\n✓ Photos Download Complete! Saved ${downloaded} real member photos to backups/member_photos/`);
}

downloadActivePhotos().catch(console.error);
