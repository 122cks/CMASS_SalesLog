const { chromium } = require('playwright');
(async()=>{
  const url = 'https://cmass-sales.web.app/meeting';
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  try{
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const info = await page.evaluate(()=>{
      function elInfo(el){
        if(!el) return null;
        const cs = window.getComputedStyle(el);
        return { tag: el.tagName, id: el.id||null, classes: el.className||null, rect: el.getBoundingClientRect ? ({left: el.getBoundingClientRect().left, top: el.getBoundingClientRect().top, width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height}) : null, pointerEvents: cs.pointerEvents, visibility: cs.visibility, display: cs.display, zIndex: cs.zIndex };
      }
      const btn = document.querySelector('#subjects .subject-btn');
      if(!btn) return { error: 'no subject button' };
      const r = btn.getBoundingClientRect();
      const cx = r.left + r.width/2; const cy = r.top + r.height/2;
      const topEl = document.elementFromPoint(cx, cy);
      // collect ancestor chain of topEl
      const ancestors = [];
      let node = topEl;
      while(node){ ancestors.push(elInfo(node)); node = node.parentElement; }
      // also show subject button info and its ancestors
      const btnAnc = []; node = btn; while(node){ btnAnc.push(elInfo(node)); node = node.parentElement; }
      return { subjectButton: elInfo(btn), testedPoint: {x:cx,y:cy}, topElement: elInfo(topEl), topAncestors: ancestors, buttonAncestors: btnAnc };
    });
    console.log(JSON.stringify(info, null, 2));
  }catch(e){ console.error('inspect failed', e); }
  await browser.close();
})();