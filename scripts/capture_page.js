const fs = require('fs');
const url = process.argv[2] || 'https://cmass-sales.web.app/order?school=S020000338';
const out = process.argv[3] || 'capture_page_log.json';
const { chromium } = require('playwright');
(async ()=>{
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = { url, console: [], requests: [], responses: [], pageHtml: null };
  page.on('console', msg => logs.console.push({ type: msg.type(), text: msg.text() }));
  page.on('request', r => logs.requests.push({ url: r.url(), method: r.method() }));
  page.on('response', async r => {
    try{ logs.responses.push({ url: r.url(), status: r.status(), headers: r.headers() }); }catch(e){}
  });
  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    logs.pageHtml = await page.content();
  }catch(e){ logs.error = String(e); }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(logs, null, 2), 'utf8');
  console.log('WROTE', out);
})();
