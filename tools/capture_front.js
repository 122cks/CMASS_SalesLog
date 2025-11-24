// Simple Puppeteer script to capture a screenshot of front.html
// Usage:
// 1) npm install puppeteer
// 2) node tools/capture_front.js http://localhost:8080/front.html?debug=1

const url = process.argv[2] || 'http://localhost:8080/front.html?debug=1';
const out = process.argv[3] || 'front_screenshot.png';

(async ()=>{
  try{
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setViewport({ width: 1200, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    // wait a bit for charts to render
    await page.waitForTimeout(1200);
    await page.screenshot({ path: out, fullPage: true });
    console.log('Saved screenshot to', out);
    await browser.close();
  }catch(e){
    console.error('capture failed', e && e.message);
    process.exit(2);
  }
})();
