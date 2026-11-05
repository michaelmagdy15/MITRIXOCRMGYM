import axios from 'axios';

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

  const dashRes = await axios.get('https://inzan.redgits.com/admin/dashboard', {
    headers: { Cookie: cookieHeader },
  });

  const html = dashRes.data as string;
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const matches = [...html.matchAll(linkRegex)];

  const unique = new Map<string, string>();
  for (const m of matches) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (href && (href.startsWith('/') || href.includes('redgits.com')) && !href.startsWith('javascript') && href !== '#') {
      if (!unique.has(href)) {
        unique.set(href, text);
      }
    }
  }

  console.log('--- ALL UNIQUE MENU ROUTES ON REDGITS ---');
  for (const [href, text] of unique.entries()) {
    console.log(`${href.padEnd(55)} | ${text}`);
  }
}

main().catch(console.error);
