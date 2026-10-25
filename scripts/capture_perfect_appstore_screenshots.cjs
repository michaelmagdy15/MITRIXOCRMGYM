const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve(__dirname, '../mobile/screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Exact iPhone 16 Pro Max App Store Specs: 1290 x 2796
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

  console.log('Waiting for member portal...');
  await new Promise(r => setTimeout(r, 7000));

  // Dismiss any announcement / notification modals or banners if present
  await page.evaluate(() => {
    // Hide notification enforcement gate or dismiss it
    const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => {
      const txt = b.textContent.toLowerCase();
      return txt.includes('got it') || txt.includes('close') || txt.includes('dismiss');
    });
    closeBtns.forEach(b => b.click());

    // Also hide debug banners if any
    const notifyBanner = Array.from(document.querySelectorAll('div')).find(d => 
      d.textContent && d.textContent.includes('Enable INZAN ATHLETICS instant browser notifications')
    );
    if (notifyBanner) notifyBanner.style.display = 'none';
  });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Capture HOME (Pass)
  console.log('Capturing Screen 1: Member Home...');
  const shot1 = path.join(outDir, '01_inzan_home_pass.png');
  await page.screenshot({ path: shot1 });
  console.log('Saved:', shot1);

  // Helper to click bottom tab
  async function selectTab(label) {
    console.log(`Selecting bottom tab: ${label}...`);
    const clicked = await page.evaluate((targetLabel) => {
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
    return clicked;
  }

  // 2. Capture BOOKINGS
  const clickedBookings = await selectTab('Bookings');
  if (clickedBookings) {
    await new Promise(r => setTimeout(r, 4000));
    console.log('Capturing Screen 2: Class Bookings...');
    const shot2 = path.join(outDir, '02_inzan_bookings_schedule.png');
    await page.screenshot({ path: shot2 });
    console.log('Saved:', shot2);
  } else {
    console.warn('Could not click Bookings tab');
  }

  // 3. Capture WORKOUTS
  const clickedWorkouts = await selectTab('Workouts');
  if (clickedWorkouts) {
    await new Promise(r => setTimeout(r, 4000));
    console.log('Capturing Screen 3: Workouts & Exercise Library...');
    const shot3 = path.join(outDir, '03_inzan_workouts_library.png');
    await page.screenshot({ path: shot3 });
    console.log('Saved:', shot3);
  } else {
    console.warn('Could not click Workouts tab');
  }

  // 4. Capture PROFILE
  const clickedProfile = await selectTab('Profile');
  if (clickedProfile) {
    await new Promise(r => setTimeout(r, 4000));
    console.log('Capturing Screen 4: Member Profile...');
    const shot4 = path.join(outDir, '04_inzan_member_profile.png');
    await page.screenshot({ path: shot4 });
    console.log('Saved:', shot4);
  } else {
    console.warn('Could not click Profile tab');
  }

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED SUCCESSFULLY!');
}

run().catch(err => {
  console.error('Failed to capture screenshots:', err);
  process.exit(1);
});
