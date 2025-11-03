const { chromium } = require('playwright');
(async ()=>{
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  try{
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    const arr = await page.evaluate(()=>{
      return Array.from(document.querySelectorAll('script')).map((s,i)=>({idx:i, src: s.src||null, inline: !!(s.innerText && s.innerText.trim().length>0)}));
    });
    console.log('SCRIPTS:', JSON.stringify(arr, null, 2));
    await page.waitForTimeout(2000);
  }catch(e){ console.error(e); }
  finally{ try{ await browser.close(); }catch(e){} }
})();