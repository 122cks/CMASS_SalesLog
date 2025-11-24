const fs = require('fs');
const path = require('path');
const url = process.argv[2] || 'https://cmass-sales.web.app/meeting?debug=1';
const outDir = path.resolve(__dirname, 'artifacts');
(async ()=>{
  try{
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true /* set false to debug visually */ });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

    const logs = [];
    const network = [];

    page.on('console', msg => {
      try{
        const args = msg.args && msg.args.map(a => a._remoteObject && a._remoteObject.value).filter(v=>v!==undefined);
        logs.push({ type: 'console', level: msg.type(), text: msg.text(), args, location: msg.location() });
      }catch(e){ logs.push({ type: 'console', level: msg.type(), text: msg.text() }); }
    });

    page.on('pageerror', err => logs.push({ type: 'pageerror', message: err.message, stack: err.stack }));

    page.on('request', req => {
      network.push({ event: 'request', url: req.url(), method: req.method(), resourceType: req.resourceType(), headers: req.headers() });
    });
    page.on('response', async res => {
      try{
        const r = { event: 'response', url: res.url(), status: res.status(), statusText: res.statusText(), headers: res.headers(), resourceType: res.request().resourceType() };
        // only collect small bodies for debugging
        let ct = (res.headers()['content-type']||'').toLowerCase();
        if (ct.includes('application/json') || ct.includes('text/') || ct.includes('javascript') || ct.includes('html') ){
          try{ r.text = (await res.text()).slice(0, 20000); }catch(e) { r.text = '<failed to read body>'; }
        }
        network.push(r);
      }catch(e){ network.push({ event: 'response', url: res.url(), error: e.message }); }
    });

    console.log('navigating to', url);
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(e=>null);
    if(!resp){
      console.log('initial goto failed or timed out, trying domcontentloaded');
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(()=>{});
    }

    // wait a bit for async activity (draft fetches, csv loads)
    await page.waitForTimeout(3000);

    // capture screenshot and html
    const html = await page.content();
    const screenshotPath = path.join(outDir, 'meeting_screenshot.png');
    const htmlPath = path.join(outDir, 'meeting.html');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    fs.writeFileSync(htmlPath, html, 'utf8');

    // write logs
    fs.writeFileSync(path.join(outDir, 'console_log.json'), JSON.stringify(logs, null, 2));
    fs.writeFileSync(path.join(outDir, 'network_log.json'), JSON.stringify(network, null, 2));

    console.log('done: artifacts saved in', outDir);
    await browser.close();
    process.exit(0);
  }catch(err){
    console.error('capture failed', err);
    process.exit(2);
  }
})();
