const fs = require('fs');
const { chromium } = require('playwright');

(async ()=>{
  const pages = [
    { name: 'index', path: '/' },
    { name: 'front', path: '/front' },
    { name: 'input', path: '/input' },
    { name: 'meeting', path: '/meeting' },
    { name: 'report', path: '/report' }
  ];
  const out = [];
  const screenshotsDir = 'tools/screenshots';
  try{ fs.mkdirSync(screenshotsDir, { recursive: true }); }catch(e){}

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    out.push({ type: 'console', text: msg.text() });
    console.log('[PAGE LOG]', msg.type(), msg.text());
  });
  page.on('pageerror', err => {
    out.push({ type: 'pageerror', message: err && err.message });
    console.log('[PAGE ERROR]', err && err.message);
  });

  for (const p of pages){
    const url = 'https://cmass-sales.web.app' + p.path;
    console.log('\n--- visiting', url);
    try{
      const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const status = resp && resp.status();
      console.log('status', status);
      out.push({ page: p.name, url, status });

      // wait small time for UI wiring
      await page.waitForTimeout(800);

      // save screenshot and html
      const safeName = `${p.name.replace(/[^a-z0-9_-]/ig,'')}`;
      const shotPath = `${screenshotsDir}/${safeName}.png`;
      const htmlPath = `${screenshotsDir}/${safeName}.html`;
      await page.screenshot({ path: shotPath, fullPage: true });
      const html = await page.content();
      fs.writeFileSync(htmlPath, html, 'utf8');
      console.log('saved', shotPath, htmlPath);
      out.push({ page: p.name, screenshot: shotPath, html: htmlPath });
    }catch(e){
      console.error('failed to capture', url, e && e.message);
      out.push({ page: p.name, url, error: e && e.message });
    }
  }

  await browser.close();
  fs.writeFileSync('tools/capture_pages_log.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('\nAll done. Log saved to tools/capture_pages_log.json');
})();
