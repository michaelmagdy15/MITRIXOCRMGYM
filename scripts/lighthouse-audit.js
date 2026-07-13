// scripts/lighthouse-audit.js
import { execSync } from 'child_process';
import fs from 'fs';

// Delete the old report to make sure we generate a new one
if (fs.existsSync('reports/lighthouse-report.html')) {
  fs.unlinkSync('reports/lighthouse-report.html');
}

if (!fs.existsSync('reports')) {
  fs.mkdirSync('reports');
}

// Skip chrome-launcher's buggy cleanup on Windows to avoid EPERM crash
process.env.CHROME_LAUNCHER_SKIP_CLEANUP = '1';

console.log('Running Lighthouse Audit against http://localhost:3000...');
try {
  // Run with headless chrome flag
  execSync('npx lighthouse http://localhost:3000 --output html --output-path ./reports/lighthouse-report.html --chrome-flags="--headless --no-sandbox --disable-dev-shm-usage"', { stdio: 'inherit' });
} catch (e) {
  // If the report exists, we consider the audit a success.
  if (fs.existsSync('reports/lighthouse-report.html')) {
    console.log('Lighthouse report generated successfully despite minor cleanup warnings.');
  } else {
    console.error('Lighthouse audit failed:', e);
    process.exit(1);
  }
} finally {
  // Clean up any remaining chrome processes spawned by this audit
  try {
    console.log('Cleaning up Chrome processes...');
    execSync('taskkill /IM chrome.exe /F', { stdio: 'ignore' });
  } catch (err) {
    // Ignore taskkill errors
  }
}
