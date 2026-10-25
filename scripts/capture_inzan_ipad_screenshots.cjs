const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve(__dirname, '../mobile/screenshots/ipad_2048x2732');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Launching browser with iPad Pro 13" viewport (2048x2732)...');
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Exact iPad Pro 12.9" / 13" App Store resolution: 1024x1366 @ 2x = 2048x2732
  await page.setViewport({
    width: 1024,
    height: 1366,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });

  await page.setUserAgent(
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 mitrixogymcrmCRM-Mobile'
  );

  console.log('Navigating to login...');
  await page.goto('https://admin.inzanathletics.com/login', { waitUntil: 'networkidle2', timeout: 45000 });
  await new Promise(r => setTimeout(r, 2000));

  const inputs = await page.$$('input');
  if (inputs.length >= 2) {
    await inputs[0].type('apple.reviewer@inzanathletics.com', { delay: 20 });
    await inputs[1].type('12345678', { delay: 20 });
    await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"]') || 
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign In') || b.textContent.includes('Login'));
      if (btn) btn.click();
    });
  }

  console.log('Waiting for iPad member portal to load...');
  await new Promise(r => setTimeout(r, 7000));

  // Dismiss any banners
  await page.evaluate(() => {
    const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      const txt = b.textContent.toLowerCase();
      return txt.includes('got it') || txt.includes('close') || txt.includes('dismiss');
    });
    closeBtns.forEach(b => b.click());

    const notifyBanner = Array.from(document.querySelectorAll('div')).find(d => 
      d.textContent && d.textContent.includes('Enable INZAN ATHLETICS instant browser notifications')
    );
    if (notifyBanner) notifyBanner.style.display = 'none';
  });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Capture iPad Home / Pass (with Smart Locker Quick Card)
  console.log('Capturing iPad Screen 1: Home Dashboard...');
  const shot1 = path.join(outDir, 'ipad_01_home_dashboard.png');
  await page.screenshot({ path: shot1 });
  console.log('Saved:', shot1);

  // Helper to click bottom tab
  async function selectTab(label) {
    console.log(`Selecting iPad tab: ${label}...`);
    return await page.evaluate((targetLabel) => {
      const nav = document.querySelector('nav.fixed.bottom-0') || document.querySelector('nav');
      if (!nav) return false;
      const buttons = Array.from(nav.querySelectorAll('button, a'));
      const btn = buttons.find(b => b.textContent && b.textContent.trim().toLowerCase() === targetLabel.toLowerCase());
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    }, label);
  }

  // 2. Capture iPad Smart Locker Console
  const clickedLocker = await selectTab('Locker');
  if (clickedLocker) {
    await new Promise(r => setTimeout(r, 3500));
    console.log('Capturing iPad Screen 2: Smart Locker...');
    const shot2 = path.join(outDir, 'ipad_02_smart_locker.png');
    await page.screenshot({ path: shot2 });
    console.log('Saved:', shot2);
  }

  // 3. Capture iPad Bookings & Classes
  const clickedBookings = await selectTab('Bookings');
  if (clickedBookings) {
    await new Promise(r => setTimeout(r, 3500));
    console.log('Capturing iPad Screen 3: Class Timetable...');
    const shot3 = path.join(outDir, 'ipad_03_classes_schedule.png');
    await page.screenshot({ path: shot3 });
    console.log('Saved:', shot3);
  }

  // 4. Capture iPad Exercise Library
  const clickedWorkouts = await selectTab('Workouts');
  if (clickedWorkouts) {
    await new Promise(r => setTimeout(r, 3500));
    console.log('Capturing iPad Screen 4: Exercise Hub...');
    const shot4 = path.join(outDir, 'ipad_04_exercise_vault.png');
    await page.screenshot({ path: shot4 });
    console.log('Saved:', shot4);
  }

  // 5. Capture iPad Member Profile & Membership
  const clickedProfile = await selectTab('Profile');
  if (clickedProfile) {
    await new Promise(r => setTimeout(r, 3500));
    console.log('Capturing iPad Screen 5: Member Profile...');
    const shot5 = path.join(outDir, 'ipad_05_member_profile.png');
    await page.screenshot({ path: shot5 });
    console.log('Saved:', shot5);
  }

  await browser.close();
  console.log('ALL IPAD SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Failed to capture iPad screenshots:', err);
  process.exit(1);
});
