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
    const scripts = await page.evaluate(()=>{
      const arr = [];
      document.querySelectorAll('script').forEach((s, i)=>{
        const txt = s.innerText || s.textContent || '';
        if(/Loaded staff CSV|_cmass_staffData|parseClassExplicit/.test(txt)){
          arr.push({idx:i, snippet: txt.slice(0,800)});
        }
      });
      return arr;
    });
    console.log('SCRIPTS MATCH:', scripts.length);
    scripts.forEach(s=>console.log('---', s.idx, '\n', s.snippet, '\n----'));
    await page.waitForTimeout(5000);
  }catch(e){ console.error(e); }
  finally{ try{ await browser.close(); }catch(e){} }
})();