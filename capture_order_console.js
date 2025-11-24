const fs = require('fs');
const { chromium } = require('playwright');

(async ()=>{
  const url = process.argv[2] || 'https://cmass-sales.web.app/order?school=S020000338';
  const out = process.argv[3] || 'order_console_log.json';
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const logs = [];

  page.on('console', msg => logs.push({ts: Date.now(), type: 'console.'+msg.type(), text: msg.text(), location: msg.location()}));
  page.on('pageerror', err => logs.push({ts: Date.now(), type: 'pageerror', message: err.message, stack: err.stack}));
  page.on('request', req => logs.push({ts: Date.now(), type: 'request', url: req.url(), method: req.method(), headers: req.headers()}));
  page.on('response', async res => logs.push({ts: Date.now(), type: 'response', url: res.url(), status: res.status(), headers: res.headers()}));
  page.on('close', ()=> logs.push({ts: Date.now(), type: 'pageclose'}));

  try{
    console.log('Going to', url);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(e=> logs.push({ts: Date.now(), type:'goto-error', message: String(e)}));
    // wait a bit to capture reloads or subsequent navigation
    await page.waitForTimeout(5000);

    // also take page content for inspection
    const content = await page.content();
    logs.push({ts: Date.now(), type:'page-content', length: content.length});
    fs.writeFileSync(out, JSON.stringify({meta:{url}, logs, pageHtml: content}, null, 2), 'utf8');
    console.log('Saved logs to', out);
  }catch(e){
    console.error('Capture failed', e);
    logs.push({ts: Date.now(), type:'fatal-error', message: String(e), stack: e.stack});
    fs.writeFileSync(out, JSON.stringify({meta:{url}, logs}, null, 2), 'utf8');
  }finally{
    await browser.close();
  }
})();
