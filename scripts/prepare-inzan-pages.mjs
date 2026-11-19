import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'dist-inzan');
const INZAN_CFG_PATH = path.join(ROOT, 'src', 'config', 'inzanFirebaseConfig.ts');

function loadInzanConfig() {
  const fallback = {
    projectId: 'inzan-crm-spark-26',
    appId: '1:466686493225:web:8ac6a2ec3a8a3544f69238',
    apiKey: 'AIzaSyDP91b3aJ9GtZoLGmKbMNAnQHC6EANjCbs',
    authDomain: 'inzan-crm-spark-26.firebaseapp.com',
    storageBucket: 'inzan-crm-spark-26.firebasestorage.app',
    messagingSenderId: '466686493225',
    tenantId: 'inzanathletics',
  };
  if (!fs.existsSync(INZAN_CFG_PATH)) return fallback;
  const src = fs.readFileSync(INZAN_CFG_PATH, 'utf8');
  const readKey = (k) => {
    const m = src.match(new RegExp(`${k}:\\s*['"]([^'"]+)['"]`));
    return m ? m[1] : fallback[k];
  };
  return {
    projectId: readKey('projectId'),
    appId: readKey('appId'),
    apiKey: readKey('apiKey'),
    authDomain: readKey('authDomain'),
    storageBucket: readKey('storageBucket'),
    messagingSenderId: readKey('messagingSenderId'),
    tenantId: readKey('tenantId'),
  };
}

function copyTreeFiltered(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeFiltered(srcPath, destPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.br') || entry.name.endsWith('.gz')) continue;
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(DIST_DIR) || !fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  throw new Error('dist/index.html not found. Run `npm run build:web` first.');
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
copyTreeFiltered(DIST_DIR, OUT_DIR);

const MEMBER_PHOTOS_SRC = path.join(ROOT, 'backups', 'member_photos_web');
if (fs.existsSync(MEMBER_PHOTOS_SRC)) {
  const memberPhotosDest = path.join(OUT_DIR, 'member-photos');
  copyTreeFiltered(MEMBER_PHOTOS_SRC, memberPhotosDest);
  const photoCount = fs.readdirSync(memberPhotosDest).length;
  console.log(`[prepare-inzan-pages] Copied ${photoCount} optimized member photos to dist-inzan/member-photos/`);
}

const inzanConfig = loadInzanConfig();
const indexPath = path.join(OUT_DIR, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

const scriptTag = `<script type="text/javascript">window.__FIREBASE_CONFIG__ = ${JSON.stringify(inzanConfig)};</script>`;
html = html.replace('<!-- FIREBASE_CONFIG_PLACEHOLDER -->', scriptTag);
html = html.replace(/strike_clean_v\d+_live/g, 'inzan_spark_v23_live');
html = html.replace(/sw_reloaded=\d+/g, 'sw_reloaded=23');
html = html.replace(/<title>.*?<\/title>/i, '<title>INZAN Athletics</title>');
html = html.replace(/\/favicon\.png/g, '/inzan-favicon.png');
html = html.replace(/\/pwa-icon\.png/g, '/inzan-pwa-icon.png');
html = html.replace(/href="\/manifest\.webmanifest"/g, 'href="/manifest.webmanifest?tenant=inzanathletics"');
html = html.replace(/content="STRIKE"/g, 'content="INZAN Athletics"');
html = html.replace(/content="Strike Boxing Club"/g, 'content="INZAN Athletics"');
html = html.replace(
  /content="Official Member Portal & Gym Management Platform"/g,
  'content="Official Member Portal & Training Management - Inzan Athletics"'
);
html = html.replace(/https:\/\/strike-egy\.com\/pwa-icon\.png/g, 'https://admin.inzanathletics.com/inzan-og.png');

const splashPlaceholderDataUri =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
html = html.replace(splashPlaceholderDataUri, '/inzanlogo.png');
html = html.replace(/\/strikelogo_white\.png/g, '/inzanlogo.png');
html = html.replace(/STRIKE BOXING CLUB/g, 'INZAN ATHLETICS');
html = html.replace(
  /<div[^>]*id=["']?mobile-splash-bg["']?[^>]*><\/div>/i,
  '<div id="mobile-splash-bg" class="mobile-splash-bg" style="background-color: #08080a; background-image: none;"></div>'
);
html = html.replace(/\/strike_slide_outdoor\.png/g, '/mitrixogymcrm_sessions_slide.png');

fs.writeFileSync(indexPath, html, 'utf8');

const manifest = {
  name: 'INZAN Athletics',
  short_name: 'INZAN Athletics',
  description: 'INZAN Athletics — Official Member & Staff Portal',
  theme_color: '#000000',
  background_color: '#ffffff',
  display: 'standalone',
  orientation: 'portrait',
  start_url: '/?pwa=1',
  scope: '/',
  id: 'com.inzanathletics.crm.pwa',
  icons: [
    { src: '/inzan-pwa-icon.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/inzan-pwa-icon.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/inzan-pwa-icon.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
const manifestJson = JSON.stringify(manifest, null, 2);
fs.writeFileSync(path.join(OUT_DIR, 'manifest.webmanifest'), manifestJson, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), manifestJson, 'utf8');

const headers = `/index.html
  Cache-Control: no-cache, no-store, must-revalidate
/sw.js
  Cache-Control: no-cache, no-store, must-revalidate
/workbox-*.js
  Cache-Control: no-cache, no-store, must-revalidate
/manifest.webmanifest
  Cache-Control: no-cache, no-store, must-revalidate
/manifest.json
  Cache-Control: no-cache, no-store, must-revalidate
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/member-photos/*
  Cache-Control: public, max-age=31536000, immutable
`;
fs.writeFileSync(path.join(OUT_DIR, '_headers'), headers, 'utf8');
fs.writeFileSync(path.join(OUT_DIR, '_redirects'), '/* /index.html 200\n', 'utf8');

console.log('[prepare-inzan-pages] Built dist-inzan/ for project:', inzanConfig.projectId);
