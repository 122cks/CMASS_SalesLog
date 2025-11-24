const fs = require('fs');
const puppeteer = require('puppeteer');

(async ()=>{
  const BASE = process.env.TEST_URL || 'https://cmass-sales.web.app/front?staff=SongHoonjae&debug=1';
  const out = { url: BASE, steps: [], ok: false };
  try{
    out.steps.push('launch');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.on('console', msg => {
      try{ out.steps.push('[console] ' + msg.text()); }catch(e){}
    });

    out.steps.push('goto ' + BASE);
    const resp = await page.goto(BASE, { waitUntil: 'networkidle2' });
    out.steps.push('response status: ' + (resp && resp.status()));

    // Wait for either dashboardArea visible or loading to show fetch counts
    try{
      await page.waitForSelector('#dashboardArea', { visible: true, timeout: 8000 });
      out.steps.push('#dashboardArea visible');
    }catch(e){
      out.steps.push('#dashboardArea not visible (timeout)');
      // fallback: wait until #loading changes from '데이터를 불러오는 중...'
      try{
        await page.waitForFunction(()=> {
          const el = document.getElementById('loading');
          if(!el) return false; const t = el.textContent || el.innerText || ''; return t.trim() !== '데이터를 불러오는 중...';
        }, { timeout: 8000 });
        out.steps.push('#loading changed text');
      }catch(e2){
        out.steps.push('no visible data indicators within timeout');
      }
    }

    // Try clicking the main input button
    out.steps.push('click #goInput');
    try{
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }),
        page.click('#goInput')
      ]);
      out.steps.push('navigation after click (waitForNavigation resolved)');
    }catch(e){
      out.steps.push('navigation did not happen immediately after click: ' + (e && e.message));
      // Try clicking the fallback link if present
      try{
        const href = await page.$eval('#__goInputAnchor', a=>a.href).catch(()=>null);
        if(href){
          out.steps.push('found __goInputAnchor, navigating to it: ' + href);
          await Promise.all([ page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }), page.goto(href) ]);
        } else {
          out.steps.push('no __goInputAnchor found');
        }
      }catch(e2){ out.steps.push('fallback anchor navigation failed: ' + (e2 && e2.message)); }
    }

    // Final check: URL contains /input and page title or body contains '영업일지 입력'
    const finalUrl = page.url();
    out.steps.push('finalUrl: ' + finalUrl);
    let title = '';
    try{ title = await page.title(); out.steps.push('title: ' + title); }catch(e){}
    let bodyHas = false;
    try{ bodyHas = await page.evaluate(()=> document.body && document.body.innerText && (document.body.innerText.indexOf('영업일지 입력') !== -1)); }catch(e){}
    out.steps.push('bodyHasInputText: ' + bodyHas);

    if(finalUrl.includes('/input') || title.indexOf('영업일지 입력') !== -1 || bodyHas){
      out.ok = true;
      out.message = 'Navigation to /input verified.';
    } else {
      out.ok = false;
      out.message = 'Did not detect /input page after click.';
    }

    await browser.close();
  }catch(err){
    out.error = (err && err.stack) ? err.stack : String(err);
  }

  try{ fs.writeFileSync('tools/e2e_result.json', JSON.stringify(out, null, 2)); }catch(e){}
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 2);
})();
