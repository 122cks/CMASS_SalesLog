const { chromium } = require('playwright');

(async ()=>{
  const url = 'https://cmass-sales.web.app/meeting?user=joe';
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('console', m=> console.log('[PAGE]', m.text()));
  try{
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    console.log('nav status', resp && resp.status());
    await page.waitForTimeout(800);
    const loc = await page.evaluate(()=>window.location.href + window.location.search);
    const staffVal = await page.evaluate(()=>{ const el = document.getElementById('staff'); return el ? el.value : null; });
    console.log('location:', loc);
    console.log('#staff value:', staffVal);
  }catch(e){ console.error('error', e && e.message); }
  await browser.close();
})();
