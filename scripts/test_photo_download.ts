import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const loginUrl = 'https://inzan.redgits.com/login/check_login';
  const loginRes = await axios.post(
    loginUrl,
    new URLSearchParams({
      username: 'mi5a',
      password: 'Miko0019_!',
    }),
    {
      maxRedirects: 0,
      validateStatus: () => true,
    }
  );

  const rawCookies = loginRes.headers['set-cookie'] || [];
  const cookieHeader = rawCookies.map((c) => c.split(';')[0]).join('; ');

  const photoDir = path.resolve(process.cwd(), 'backups', 'member_photos');
  if (!fs.existsSync(photoDir)) fs.mkdirSync(photoDir, { recursive: true });

  const testIds = ['302', '405', '544', '611', '140'];
  for (const id of testIds) {
    const urls = [
      `https://inzan.redgits.com/uploads/members/${id}-cam.jpg`,
      `https://inzan.redgits.com/uploads/members/${id}.jpg`,
      `https://inzan.redgits.com/uploads/members/${id}.png`,
    ];
    for (const u of urls) {
      try {
        const res = await axios.get(u, {
          headers: { Cookie: cookieHeader },
          responseType: 'arraybuffer',
          validateStatus: (s) => s === 200,
        });
        if (res.data && res.data.length > 500) {
          const dest = path.join(photoDir, path.basename(u));
          fs.writeFileSync(dest, res.data);
          console.log(`✓ Downloaded ${path.basename(u)} (${res.data.length} bytes)`);
          break;
        }
      } catch (e) {
        // Not found
      }
    }
  }
}

main().catch(console.error);
