const puppeteer = require('puppeteer');
const fs = require('fs');

(async ()=>{
  const url = process.env.SNAPSHOT_URL || 'https://cmass-sales.web.app';
  const outDir = 'tools/artifacts';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const screenshotPath = `${outDir}/site_screenshot.png`;
  const htmlPath = `${outDir}/site_snapshot.html`;

  let browser;
  try {
    const chromePath = process.env.QA_CHROME_PATH || (process.platform === 'win32' ?
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
    try {
      browser = await puppeteer.launch({ headless: true, executablePath: chromePath });
    } catch (e) {
      console.warn('Launching with system chrome failed, falling back to default launch:', e && e.message);
      browser = await puppeteer.launch({ headless: true });
    }
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log('Saved screenshot to', screenshotPath);
    console.log('Saved HTML snapshot to', htmlPath);
    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Error capturing snapshot:', err);
    if (browser) await browser.close();
    process.exit(2);
  }
})();
