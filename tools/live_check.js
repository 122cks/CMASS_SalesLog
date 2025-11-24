const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function run(){
  const url = process.argv[2] || 'https://cmass-sales.web.app/front?staff=Songhoonjae';
  const out = { url, console: [], requests: [], responses: [], dom: {}, errors: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    try{ out.console.push({ type: msg.type(), text: msg.text() }); }catch(e){}
  });
  page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err && err.stack ? err.stack : err) }); });

  page.on('request', req => {
    out.requests.push({ url: req.url(), method: req.method(), headers: req.headers() });
  });
  page.on('response', async res => {
    try{
      const url = res.url(); const status = res.status();
      let ct = null; try{ ct = res.headers()['content-type'] || null; }catch(e){}
      out.responses.push({ url, status, contentType: ct });
    }catch(e){}
  });

  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // wait a bit for client scripts to run
    await page.waitForTimeout(1500);

    // capture DOM checks
    const hasDashboard = await page.$('#dashboardArea') !== null;
    const dashboardVisible = hasDashboard ? await page.evaluate(() => { const el = document.getElementById('dashboardArea'); if (!el) return false; const s = window.getComputedStyle(el); return s && s.display !== 'none' && s.visibility !== 'hidden'; }) : false;
    const totalVisitsText = await page.evaluate(() => { const el = document.getElementById('totalVisits'); return el ? el.textContent : null; });
    const subjectsCanvasExists = await page.$('#subjectsChart') !== null;
    const monthlyCanvasExists = await page.$('#monthlyChart') !== null;
    const actionsCanvasExists = await page.$('#actionsChart') !== null;
    const notesTableRows = await page.evaluate(() => { const tbody = document.querySelector('.notes-table tbody'); return tbody ? tbody.rows.length : 0; });

    out.dom = { hasDashboard, dashboardVisible, totalVisitsText, subjectsCanvasExists, monthlyCanvasExists, actionsCanvasExists, notesTableRows };

    // take screenshot
    const shotPath = path.join(require('os').tmpdir(), 'cmass_front_screenshot.png');
    await page.screenshot({ path: shotPath, fullPage: true });
    out.screenshot = shotPath;

  }catch(e){ out.errors.push({ type:'run', message: String(e && e.stack ? e.stack : e) }); }

  await browser.close();
  const outPath = path.join(require('os').tmpdir(), 'cmass_live_check.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log('RESULT_JSON:' + outPath);
}

run();
