const { chromium } = require('playwright');
const fs = require('fs');

async function run(){
  const url = process.argv[2] || 'https://cmass-sales.web.app/input';
  const out = { url, console: [], network: [], actions: [], errors: [] };
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    try{ out.console.push({ type: msg.type(), text: msg.text() }); }catch(e){}
  });
  page.on('pageerror', err => {
    out.errors.push({ type: 'pageerror', message: String(err && err.stack ? err.stack : err) });
  });
  page.on('requestfailed', req => {
    out.network.push({ url: req.url(), status: 'failed', method: req.method(), failureText: req.failure() && req.failure().errorText });
  });
  page.on('response', async res => {
    try{
      const st = res.status();
      if (st >= 400) out.network.push({ url: res.url(), status: st, ok: res.ok() });
    }catch(e){}
  });

  try{
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    out.actions.push('loaded');

    // wait for region buttons or school buttons
    await page.waitForSelector('#regionButtons, #schoolButtons', { timeout: 10000 }).catch(()=>{});

    // try click first region button
    const regionBtn = await page.$('#regionButtons .selector-btn');
    if(regionBtn){
      await regionBtn.click();
      out.actions.push('clicked-first-region');
      await page.waitForTimeout(500);
    } else {
      out.actions.push('no-region-button');
    }

    // wait for schools to render
    await page.waitForSelector('#schoolButtons .selector-btn', { timeout: 8000 }).catch(()=>{});
    const schoolBtn = await page.$('#schoolButtons .selector-btn');
    if(schoolBtn){
      // capture typeof applyMappingIfPresent before click
      const beforeType = await page.evaluate(() => typeof window.applyMappingIfPresent);
      out.actions.push({ name: 'applyMappingIfPresent_before', value: beforeType });
      await schoolBtn.click();
      out.actions.push('clicked-first-school');
      // wait to allow mapping to run
      await page.waitForTimeout(1200);
      const afterType = await page.evaluate(() => typeof window.applyMappingIfPresent);
      out.actions.push({ name: 'applyMappingIfPresent_after', value: afterType });
      // record whether lastFoundMeta exists
      const meta = await page.evaluate(() => ({ lastFoundMeta: window._cmass_lastFoundMeta ? true : false, lastAppliedKey: window._cmass_lastAppliedMappingKey || null }));
      out.actions.push({ name: 'meta', value: meta });
    } else {
      out.actions.push('no-school-button');
    }

  }catch(e){ out.errors.push({ type:'run', message: String(e && e.stack ? e.stack : e) }); }

  await browser.close();
  const path = require('path').join(require('os').tmpdir(), 'cmass_smoke_result.json');
  fs.writeFileSync(path, JSON.stringify(out, null, 2));
  console.log('RESULT_FILE:' + path);
}

run();
