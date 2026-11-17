import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const TARGET_EXTENSIONS = new Set(['.js', '.css', '.svg', '.json', '.webmanifest']);
const MIN_BYTES = 1024;

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

if (!fs.existsSync(DIST_DIR)) {
  console.warn('[precompress-dist] dist/ does not exist; skipping.');
  process.exit(0);
}

const files = walk(DIST_DIR);
let compressedCount = 0;
let totalRaw = 0;
let totalBr = 0;
let totalGz = 0;

for (const filePath of files) {
  const ext = path.extname(filePath).toLowerCase();
  if (!TARGET_EXTENSIONS.has(ext)) continue;
  // Never precompress SW files with stale encodings
  const baseName = path.basename(filePath);
  if (baseName === 'sw.js' || baseName.startsWith('workbox-')) continue;

  const raw = fs.readFileSync(filePath);
  if (raw.length < MIN_BYTES) continue;

  const br = zlib.brotliCompressSync(raw, {
    params: {
      [zlib.constants.BROTLI_PARAM_QUALITY]: 6,
      [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length,
    },
  });
  const gz = zlib.gzipSync(raw, { level: 6 });

  if (br.length < raw.length) {
    fs.writeFileSync(`${filePath}.br`, br);
    totalBr += br.length;
  } else {
    totalBr += raw.length;
  }

  if (gz.length < raw.length) {
    fs.writeFileSync(`${filePath}.gz`, gz);
    totalGz += gz.length;
  } else {
    totalGz += raw.length;
  }

  totalRaw += raw.length;
  compressedCount++;
}

console.log(
  `[precompress-dist] Pre-compressed ${compressedCount} assets: raw ${(totalRaw / 1024 / 1024).toFixed(2)} MB -> br ${(totalBr / 1024 / 1024).toFixed(2)} MB, gz ${(totalGz / 1024 / 1024).toFixed(2)} MB`
);
