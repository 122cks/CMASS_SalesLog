(async()=>{
  const {chromium} = require('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  const url = 'https://cmass-sales.web.app/meeting';
  console.log('visiting', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(900);
  const selectors = ['#addEntryBtn','#addSubjectBtn','#duration','#durationBtn','.friend-btn','.entry-favor-btn','#subjects .subject-btn','#activities .subject-btn'];
  for (const sel of selectors) {
    try{
      const el = await page.$(sel);
      if (!el) { console.log(sel, ': NOT FOUND'); continue; }
      const box = await el.boundingBox();
      const visible = !!box;
      const disabled = await page.evaluate(e => e.disabled === true, el).catch(() => false);
      const style = await page.evaluate(e => window.getComputedStyle(e).cssText, el).catch(() => '');
      console.log(sel, ': FOUND, visible=', visible, ', disabled=', disabled, ', box=', box);
      if (visible && box) {
        const cx = Math.round(box.x + box.width/2), cy = Math.round(box.y + box.height/2);
        const hit = await page.evaluate(({x,y})=>{
          const el = document.elementFromPoint(x,y);
          if(!el) return null;
          return { tag: el.tagName, id: el.id||null, cls: el.className||null, pointer: window.getComputedStyle(el).pointerEvents };
        }, {x:cx, y:cy});
        console.log('  elementFromPoint at center ->', hit);
        try{ await page.click(sel, { timeout: 3000 }); console.log('  click OK'); }catch(e){ console.log('  click FAILED:', e.message); }
      }
    }catch(e){ console.log('Error probing', sel, e && e.message); }
  }
  await browser.close();
})();
