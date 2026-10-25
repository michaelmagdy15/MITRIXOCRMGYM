const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const executablePath = fs.existsSync(chromePath) ? chromePath : edgePath;

const outDir = path.resolve(__dirname, '../mobile/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Launching browser with:', executablePath);
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=430,932']
  });

  const page = await browser.newPage();
  
  await page.setViewport({
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  await page.setUserAgent(
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 mitrixogymcrmCRM-Mobile'
  );

  console.log('Navigating to https://admin.inzanathletics.com...');
  await page.goto('https://admin.inzanathletics.com', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 4000));

  // Click Sign In button from GuestPortal
  console.log('Clicking Sign In button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
    const signinBtn = btns.find(b => b.textContent && (
      b.textContent.toLowerCase().includes('sign in') || 
      b.textContent.toLowerCase().includes('login')
    ));
    if (signinBtn) signinBtn.click();
  });
  await new Promise(r => setTimeout(r, 2000));

  // Fill credentials
  console.log('Filling demo credentials...');
  const emailElem = await page.$('input[type="email"], input[type="text"]');
  if (emailElem) {
    await emailElem.click({ clickCount: 3 });
    await emailElem.type('apple.reviewer@inzanathletics.com', { delay: 20 });
  }

  const passElem = await page.$('input[type="password"]');
  if (passElem) {
    await passElem.click();
    await passElem.type('12345678', { delay: 20 });
  }

  // Click submit
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b => 
      b.type === 'submit' || 
      (b.textContent && (b.textContent.toLowerCase().includes('sign in') || b.textContent.toLowerCase().includes('login')))
    );
    if (btn) btn.click();
  });

  console.log('Waiting for member portal data to load...');
  await new Promise(r => setTimeout(r, 8000));

  // 1. Capture Home / Pass screen
  const shot1 = path.join(outDir, '01_member_home.png');
  await page.screenshot({ path: shot1 });
  console.log('Saved:', shot1);

  // Helper function to click bottom nav item
  async function clickNavTab(tabName) {
    console.log(`Switching to tab: ${tabName}...`);
    return await page.evaluate((name) => {
      // Look in bottom nav first
      const nav = document.querySelector('nav.fixed.bottom-0') || document.querySelector('nav');
      const root = nav || document;
      const elements = Array.from(root.querySelectorAll('button, a, div[role="tab"]'));
      const target = elements.find(el => el.textContent && el.textContent.trim().toLowerCase().includes(name.toLowerCase()));
      if (target) {
        target.click();
        return true;
      }
      return false;
    }, tabName);
  }

  // 2. Capture Bookings
  const hasBookings = await clickNavTab('booking');
  if (hasBookings) {
    await new Promise(r => setTimeout(r, 4000));
    const shot2 = path.join(outDir, '02_classes_and_bookings.png');
    await page.screenshot({ path: shot2 });
    console.log('Saved:', shot2);
  } else {
    console.log('Could not find booking tab');
  }

  // 3. Capture Workouts
  const hasWorkouts = await clickNavTab('workout');
  if (hasWorkouts) {
    await new Promise(r => setTimeout(r, 4000));
    const shot3 = path.join(outDir, '03_exercise_library.png');
    await page.screenshot({ path: shot3 });
    console.log('Saved:', shot3);
  } else {
    console.log('Could not find workouts tab');
  }

  // 4. Capture Profile
  const hasProfile = await clickNavTab('profile');
  if (hasProfile) {
    await new Promise(r => setTimeout(r, 4000));
    const shot4 = path.join(outDir, '04_member_profile.png');
    await page.screenshot({ path: shot4 });
    console.log('Saved:', shot4);
  } else {
    console.log('Could not find profile tab');
  }

  await browser.close();
  console.log('All screens captured successfully!');
}

run().catch(err => {
  console.error('Error during capture:', err);
  process.exit(1);
});
