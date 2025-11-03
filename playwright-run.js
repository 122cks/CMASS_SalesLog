const { chromium } = require('playwright');

(async () => {
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
  const browser = await chromium.launch({ headless: false, slowMo: 80, args: ['--start-maximized'] });
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => {
    try { logs.push(msg.text()); } catch(e){}
  });
  try {
  console.log('goto', url);
  // Set a same-origin referrer to avoid the app's immediate redirect logic
  // (the page auto-redirects /input -> /front when opened with no same-origin referrer)
  await page.setExtraHTTPHeaders({ referer: 'https://cmass-sales.web.app/' });
  // Try networkidle first with extended timeout; fallback to domcontentloaded if it times out
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  } catch (err) {
    console.log('goto networkidle failed, retrying with domcontentloaded:', String(err));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    } catch (err2) {
      console.log('goto domcontentloaded also failed:', String(err2));
      throw err2;
    }
  }
    // wait for grid buttons to appear
    await page.waitForSelector('button.grid-button', { timeout: 20000 });
    // More realistic interaction: move mouse to region button, mousedown/mouseup, then same for school button
    let clickedRegion = false;
    try{
      const regionBtns = await page.$$('#regionButtons .grid-button');
      for (const b of regionBtns) {
        const txt = (await (await b.getProperty('textContent')).jsonValue()) || '';
        if (txt.indexOf('과천') !== -1) {
          await b.evaluate(el=>el.scrollIntoView({block:'center',behavior:'auto'}));
          const box = await b.boundingBox();
          if (box) {
            await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
            await page.mouse.down();
            await page.waitForTimeout(60);
            await page.mouse.up();
            clickedRegion = true;
            break;
          }
        }
      }
      if (!clickedRegion && regionBtns.length) {
  const b = regionBtns[0]; await b.evaluate(el=>el.scrollIntoView({block:'center',behavior:'auto'})); const box = await b.boundingBox(); if (box) { await page.mouse.move(box.x+box.width/2, box.y+box.height/2); await page.mouse.click(box.x+box.width/2, box.y+box.height/2); }
      }
    } catch(e){ /* ignore */ }
    console.log('clickedRegionButton:', clickedRegion);
    await page.waitForTimeout(800);

    let clickedSchool = false;
    try{
      const schoolBtns = await page.$$('#schoolButtons .grid-button');
      for (const s of schoolBtns) {
        const txt = (await (await s.getProperty('textContent')).jsonValue()) || '';
        if (txt.trim().indexOf('과천고등학교') !== -1) {
          await s.evaluate(el=>el.scrollIntoView({block:'center',behavior:'auto'}));
          const box = await s.boundingBox();
          if (box) {
            // hover, focus, then click with realistic timing
            await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
            await s.focus();
            await page.waitForTimeout(40);
            await page.mouse.down();
            await page.waitForTimeout(30);
            await page.mouse.up();
            clickedSchool = true;
            break;
          }
        }
      }
      if (!clickedSchool && schoolBtns.length) {
        const b = schoolBtns[0]; await b.evaluate(el=>el.scrollIntoView({block:'center',behavior:'auto'})); const box = await b.boundingBox(); if (box) { await page.mouse.move(box.x+box.width/2, box.y+box.height/2); await page.mouse.click(box.x+box.width/2, box.y+box.height/2); }
      }
    } catch(e){ /* ignore */ }
    console.log('clickedSchoolButton:', clickedSchool);
    // wait for metadata panel to populate
    await page.waitForTimeout(800); // small wait for DOM updates
    // diagnostic: read selected region/school and attempt to find meta in window.staffData
    const diag = await page.evaluate(() => {
      try{
        const selRegionBtn = Array.from(document.querySelectorAll('#regionButtons .grid-button')).find(b=>b.getAttribute('aria-selected')==='true');
        const selRegion = selRegionBtn ? (selRegionBtn.textContent||'').trim() : '';
        const selSchoolBtn = Array.from(document.querySelectorAll('#schoolButtons .grid-button')).find(b=>b.getAttribute('aria-selected')==='true');
        const selSchool = selSchoolBtn ? (selSchoolBtn.textContent||'').trim() : (document.getElementById('selectedSchoolInput')?document.getElementById('selectedSchoolInput').value:'');
        const staff = window.staffParam || (typeof getStaffFromQuery === 'function' ? getStaffFromQuery() : '');
  const sd = window.staffData || window._cmass_staffData || [];
        const meta = sd.find(d => d && d.staff === staff && d.region === selRegion && d.school === selSchool);
        return { selRegion, selSchool, staffParam: staff, staffDataLen: sd.length, metaFound: !!meta, meta: meta ? { g1_class: meta.g1_class, g1_students: meta.g1_students, totalStudents: meta.totalStudents || meta.total } : null };
      }catch(e){ return { err: String(e) }; }
    });
    console.log('DIAG:', JSON.stringify(diag));
      // As a fallback diagnostic: fetch the staff CSV from the site inside the page
      const csvDiag = await page.evaluate(async () => {
        try{
          const res = await fetch('/sales_staff.csv', { cache: 'no-store' });
          if (!res.ok) return { ok:false, status: res.status };
          const text = await res.text();
          const lines = text.split(/\r?\n/).filter(l=>l && l.trim());
          // find header line (search early lines for a column containing '학교' or '학교명')
          let headerIdx = 0;
          for (let i=0;i<Math.min(lines.length,8);i++){
            const l = lines[i].toLowerCase();
            if (l.indexOf('학교')!==-1 || l.indexOf('school')!==-1 || l.indexOf('담당자')!==-1) { headerIdx = i; break; }
          }
          const hdr = lines[headerIdx].split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(h=>h.replace(/^"|"$/g,'').trim());
          const rows = lines.slice(headerIdx+1).map(r => r.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c=>c.replace(/^"|"$/g,'').trim()));
          const idxSchool = hdr.findIndex(h=>/학교명|학교|school/i.test(h));
          const idxG1c = hdr.findIndex(h=>/1학년학급수|1학년_반수|g1_class/i.test(h));
          const idxG1s = hdr.findIndex(h=>/1학년학생수|g1_students/i.test(h));
          const idxStaff = hdr.findIndex(h=>/담당자|staff|name/i.test(h));
          for (const r of rows){
            const school = (r[idxSchool]||'').trim();
            const staff = (r[idxStaff]||'').trim();
            if (school && staff && school.indexOf('과천고등학교')!==-1 && staff.indexOf('송훈재')!==-1){
              return { ok:true, school, staff, g1_class: (r[idxG1c]||'').trim(), g1_students: (r[idxG1s]||'').trim() };
            }
          }
          return { ok:true, found:false };
        }catch(e){ return { ok:false, err: String(e) }; }
      });
      console.log('CSV_DIAG:', JSON.stringify(csvDiag));
      // wait until metaG1c has some text or timeout
    let metaG1c = '';
    let inlineG1c = '';
    try{
      await page.waitForFunction(() => {
        const e1 = document.getElementById('metaG1c');
        const e2 = document.getElementById('inlineG1c');
        return (e1 && e1.textContent && e1.textContent.trim().length>0) || (e2 && e2.textContent && e2.textContent.trim().length>0);
      }, { timeout: 8000 });
    }catch(e){ /* ignore timeout */ }
    try{ metaG1c = await page.$eval('#metaG1c', e => e.textContent.trim()); }catch(e){ metaG1c = ''; }
    try{ inlineG1c = await page.$eval('#inlineG1c', e => e.textContent.trim()); }catch(e){ inlineG1c = ''; }

    // capture some console logs and relevant snippets
    console.log('metaG1c:', metaG1c || '(empty)');
    console.log('inlineG1c:', inlineG1c || '(empty)');
    // print first 20 console logs captured
    console.log('console_logs_begin');
    logs.slice(0,50).forEach((l,i)=> console.log(`${i}: ${l}`));
    console.log('console_logs_end');
    // grab a small header snippet around <h2>
    const header = await page.content().then(c=>{ const i=c.indexOf('<h2'); if(i>=0) return c.substring(i, i+200); return ''; });
    console.log('header_snippet:');
    console.log(header);
  } catch (err) {
    console.error('error:', err && err.message);
  } finally {
    // keep the browser open briefly so you can inspect the rendered page in headful mode
    try { await page.waitForTimeout(60000); } catch(e){}
    await browser.close();
  }
})();
