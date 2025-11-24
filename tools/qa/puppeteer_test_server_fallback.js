const puppeteer = require('puppeteer');
const fs = require('fs');

// Simple Puppeteer test: verifies that when /get-draft is forced to fail,
// the meeting page offers local drafts as a fallback (ask-restore modal or draft picker).
// Usage: QA_BASE=http://localhost:8765 node puppeteer_test_server_fallback.js

(async ()=>{
  const base = process.env.QA_BASE || 'http://localhost:8765';
  const staff = process.env.QA_STAFF || '송훈재 부장';
  const date = process.env.QA_DATE || '2025-09-29';
  const region = process.env.QA_REGION || '경기도가평군';
  const school = process.env.QA_SCHOOL || '청심국제고등학교';
  const url = `${base}/meeting.html?staff=${encodeURIComponent(staff)}&date=${encodeURIComponent(date)}&region=${encodeURIComponent(region)}&school=${encodeURIComponent(school)}`;

  // Allow using a local Chrome/Chromium binary via QA_CHROME_PATH env var.
  // This helps when the bundled Chromium isn't downloaded in the environment.
  const chromePath = process.env.QA_CHROME_PATH || (
    process.platform === 'win32' ?
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' :
      '/usr/bin/google-chrome'
  );

  let browser;
  try {
    browser = await puppeteer.launch({ headless: true, executablePath: chromePath });
  } catch (err) {
    console.warn('Launching with executablePath failed, falling back to default launch. Error:', err && err.message);
    browser = await puppeteer.launch({ headless: true });
  }
  const page = await browser.newPage();

  // intercept /get-draft and return 404 to simulate server failure
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.indexOf('/get-draft') !== -1) {
      req.respond({ status: 404, contentType: 'text/html', body: '<html><body>Not Found</body></html>' });
      return;
    }
    req.continue();
  });

  // Pre-populate localStorage with a matching draft (same staff|date|region|school)
  const key = `meeting:draft:${staff}|${date}|${region}|${school}`;
  const draftObj = { staff, date, region, school, subjects: ['정보'], activities: ['명함인사'], teacher: '테스트선생', _savedAt: new Date().toISOString() };
  // Navigate to the base origin so localStorage is writable for that origin
  await page.goto(base, { waitUntil: 'networkidle2' });
  await page.evaluate((k,v) => { localStorage.setItem(k, v); }, key, JSON.stringify(draftObj));

  // navigate to meeting page
  await page.goto(url, { waitUntil: 'networkidle2' });

  // wait briefly for page logic to run (support environments where waitForTimeout may not exist)
  if (typeof page.waitForTimeout === 'function') {
    await page.waitForTimeout(800);
  } else {
    await new Promise(r => setTimeout(r, 800));
  }

  // check for ask-restore modal or draft picker
  const hasAsk = await page.$('#cmass-ask-restore');
  const hasPicker = await page.$('#cmass-draft-picker');
  const result = { ask: !!hasAsk, picker: !!hasPicker };
  console.log('server-fallback-test result:', result);

  if (!hasAsk && !hasPicker) {
    console.error('FAIL: No fallback UI shown when /get-draft failed and local draft exists.');
    await browser.close(); process.exit(2);
  }
  console.log('PASS: Fallback UI detected.');
  await browser.close(); process.exit(0);
})();
