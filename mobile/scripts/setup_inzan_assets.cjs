/**
 * INZAN ATHLETICS - Mobile Assets Setup & Validation Script
 * Prepares and validates icons and splash assets in mobile/assets/inzan/
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const assetsDir = path.join(projectRoot, 'assets');
const inzanDir = path.join(assetsDir, 'inzan');
const logoSource = path.join(assetsDir, 'inzanlogo.png');

if (!fs.existsSync(inzanDir)) {
  fs.mkdirSync(inzanDir, { recursive: true });
}

if (!fs.existsSync(logoSource)) {
  console.error(`❌ Source logo not found at: ${logoSource}`);
  process.exit(1);
}

// Copy source logo to required Expo icon slots
fs.copyFileSync(logoSource, path.join(inzanDir, 'icon.png'));
fs.copyFileSync(logoSource, path.join(inzanDir, 'splash-icon.png'));
fs.copyFileSync(logoSource, path.join(inzanDir, 'android-icon-foreground.png'));

// Copy background/monochrome assets if they exist in main assets
const bgSource = path.join(assetsDir, 'android-icon-background.png');
if (fs.existsSync(bgSource)) {
  fs.copyFileSync(bgSource, path.join(inzanDir, 'android-icon-background.png'));
}

const monoSource = path.join(assetsDir, 'android-icon-monochrome.png');
if (fs.existsSync(monoSource)) {
  fs.copyFileSync(monoSource, path.join(inzanDir, 'android-icon-monochrome.png'));
}

console.log('✅ Inzan Athletics mobile branding assets staged in mobile/assets/inzan/');
