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
    const scripts = await page.evaluate(async ()=>{
      const arr = [];
      const nodes = Array.from(document.querySelectorAll('script'));
      for(let i=0;i<nodes.length;i++){
        const s = nodes[i];
        const src = s.src || null;
        let snippet = s.innerText ? s.innerText.slice(0,800) : null;
        if(src){
          try{
            const res = await fetch(src);
            const txt = await res.text();
            snippet = txt.slice(0,1200);
          }catch(e){ snippet = 'FETCH_ERR: '+ (e.message||e); }
        }
        if(/Loaded staff CSV|_cmass_staffData|parseClassExplicit|sales_staff\.csv/.test(snippet||'')){
          arr.push({idx:i, src: src, snippet: snippet.slice(0,1000)});
        }
      }
      return arr;
    });
    console.log('SCRIPTS MATCH:', scripts.length);
    scripts.forEach(s=>console.log('---', s.idx, s.src, '\n', s.snippet, '\n----'));
    await page.waitForTimeout(3000);
  }catch(e){ console.error(e); }
  finally{ try{ await browser.close(); }catch(e){} }
})();