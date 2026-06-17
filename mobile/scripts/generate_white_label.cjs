/**
 * MITRIXO CRM - EXPO MOBILE WHITE-LABEL GENERATOR SCRIPT
 * 
 * Usage:
 * node scripts/generate_white_label.cjs --gymName "Iron Gym" --subdomain "irongym" --bundleId "com.irongym.crm" [--iconPath "./icon-source.png"]
 */

const fs = require('fs');
const path = require('path');

function getArgs() {
  const args = {};
  process.argv.slice(2).forEach((val, index, array) => {
    if (val.startsWith('--')) {
      const key = val.slice(2);
      const nextVal = array[index + 1];
      if (nextVal && !nextVal.startsWith('--')) {
        args[key] = nextVal;
      }
    }
  });
  return args;
}

function main() {
  const args = getArgs();
  const { gymName, subdomain, bundleId, iconPath } = args;

  if (!gymName || !subdomain || !bundleId) {
    console.error('❌ ERROR: Missing required arguments!');
    console.log('Usage: node scripts/generate_white_label.cjs --gymName "Gym Name" --subdomain "subdomain" --bundleId "com.bundle.id" [--iconPath "path/to/icon.png"]');
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..');
  const appJsonPath = path.join(projectRoot, 'app.json');
  const configJsonPath = path.join(projectRoot, 'config.json');

  console.log(`\n=== Generating White-Label Config for: "${gymName}" ===`);

  // 1. Modify app.json
  if (!fs.existsSync(appJsonPath)) {
    console.error(`❌ ERROR: app.json not found at: ${appJsonPath}`);
    process.exit(1);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (!appJson.expo) {
    appJson.expo = {};
  }

  // Update Expo configurations
  appJson.expo.name = gymName;
  appJson.expo.slug = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
  
  if (!appJson.expo.ios) appJson.expo.ios = {};
  appJson.expo.ios.bundleIdentifier = bundleId;

  if (!appJson.expo.android) appJson.expo.android = {};
  appJson.expo.android.package = bundleId;

  fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2), 'utf8');
  console.log('✅ Updated app.json successfully.');

  // 2. Generate config.json
  const configContent = {
    PRODUCTION_URL: `https://${subdomain.toLowerCase()}.mitrixo.com/`,
    APP_NAME: gymName
  };

  fs.writeFileSync(configJsonPath, JSON.stringify(configContent, null, 2), 'utf8');
  console.log(`✅ Generated config.json pointing to: ${configContent.PRODUCTION_URL}`);

  // 3. Copy custom icon if provided
  if (iconPath) {
    const absoluteIconPath = path.resolve(process.cwd(), iconPath);
    const targetIconPath = path.join(projectRoot, 'assets', 'icon.png');
    
    if (fs.existsSync(absoluteIconPath)) {
      fs.copyFileSync(absoluteIconPath, targetIconPath);
      console.log(`✅ Copied new branding icon from ${iconPath} to assets/icon.png`);
    } else {
      console.warn(`⚠️ Warning: Specified icon file not found at: ${absoluteIconPath}. Default icon preserved.`);
    }
  }

  console.log('\n=== White-Label Configuration Complete! ===');
  console.log('To trigger a new build via EAS CLI, run:');
  console.log(`  cd mobile && eas build --platform all --profile production\n`);
}

main();
