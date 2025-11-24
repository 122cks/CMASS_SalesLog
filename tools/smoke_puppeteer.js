const fs = require('fs');
(async ()=>{
  try{
    const puppeteer = require('puppeteer');
    const url = process.argv[2] || 'https://cmass-sales.web.app/meeting?nocache=1';
    const outDir = process.argv[3] || 'tmp';
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const logs = [];
    page.on('console', msg => {
      try{ logs.push({type: msg.type(), text: msg.text(), args: msg.args().map(a=>a.toString())}); }catch(e){}
    });
    page.on('pageerror', err => logs.push({type:'pageerror', text: err.message}));
    page.on('requestfailed', r => logs.push({type:'requestfailed', url: r.url(), status: r.failure && r.failure().errorText}));
    await page.setViewport({ width: 1200, height: 900 });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    // wait a bit for client JS to run
    await page.waitForTimeout(1200);
    const html = await page.content();
    fs.writeFileSync(`${outDir}/smoke_dom.html`, html, 'utf8');
    await page.screenshot({ path: `${outDir}/smoke.png`, fullPage: true });
    fs.writeFileSync(`${outDir}/smoke_console.json`, JSON.stringify(logs, null, 2), 'utf8');
    console.log('OK', { html: `${outDir}/smoke_dom.html`, screenshot: `${outDir}/smoke.png`, logs: `${outDir}/smoke_console.json` });
    await browser.close();
  }catch(e){
    console.error('SMOKE-ERROR', e && (e.message || e));
    process.exitCode = 2;
  }
})();
