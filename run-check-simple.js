const { chromium } = require('playwright');
(async ()=>{
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000, referer: 'https://cmass-sales.web.app/' });
    // wait briefly and then sample several vars
    await page.waitForTimeout(3000);
    const sample = await page.evaluate(()=>{
      return {
        staffParam: window._cmass_staffParam || null,
        staffDataLen: (window._cmass_staffData || []).length,
        staffDataSample0: (window._cmass_staffData && window._cmass_staffData[0]) || null,
        staffDataExposedAsStaffData: (window.staffData || null)
      };
    });
    console.log('SAMPLE:', JSON.stringify(sample, null, 2));
    await page.waitForTimeout(8000);
  }catch(e){ console.error(e); }
  finally{ try{ await browser.close(); }catch(e){} }
})();