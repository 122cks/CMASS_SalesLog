const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const out = { events: [], errors: [] };
  const screenshotPath = path.join(__dirname, 'target_probe_screenshot.png');
  const logPath = path.join(__dirname, 'target_probe_log.json');
  const url = process.env.TARGET_URL || 'https://cmass-sales.web.app/meeting';

  // If requested, start a small static file server to serve the repo `public/` directory
  let _internalServer = null;
  const servePublic = process.env.SERVE_PUBLIC === '1' || process.env.SERVE_PUBLIC === 'true';
  if (servePublic) {
    const http = require('http');
    const mime = {
      '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.json':'application/json', '.txt':'text/plain'
    };
    const publicDir = path.join(__dirname, '..', 'public');
    _internalServer = http.createServer((req, res) => {
      try{
        let p = decodeURIComponent(req.url.split('?')[0]);
        if (p === '/' || p === '') p = '/meeting.html';
        const fp = path.join(publicDir, p.replace(/^\//,''));
        if (!fp.startsWith(publicDir)) { res.statusCode = 403; res.end('forbidden'); return; }
        fs.readFile(fp, (err, data) => {
          if (err) { res.statusCode = 404; res.end('not found'); return; }
          const ext = path.extname(fp).toLowerCase();
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
          res.end(data);
        });
      }catch(e){ try{ res.statusCode = 500; res.end('server error'); }catch(_){} }
    }).listen(8081, '127.0.0.1');
    out.events.push({ type: 'internal-server', port: 8081, dir: publicDir });
    // allow slight delay for server to become ready
    await new Promise(r => setTimeout(r, 120));
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

  page.on('console', msg => {
    try { out.events.push({ type: 'console', text: msg.text() }); } catch(e){}
  });
  page.on('pageerror', err => { out.errors.push({ type: 'pageerror', message: String(err) }); });

  try{
    await page.goto(url, { waitUntil: 'networkidle' , timeout: 30000 });
    out.events.push({ type: 'navigated', url });

    // --- Fill top-level fields to ensure full-form coverage ---
    try{
      // staff
      try{ const staff = await page.$('#staff'); if (staff) { await staff.fill('Auto Staff'); out.events.push({ type:'filled', selector:'#staff', value:'Auto Staff' }); } }catch(e){}
      // date (YYYY-MM-DD)
      try{ const d = new Date(); const yyyy = d.getFullYear(); const mm = String(d.getMonth()+1).padStart(2,'0'); const dd = String(d.getDate()).padStart(2,'0'); const today = `${yyyy}-${mm}-${dd}`; const dateEl = await page.$('#visitDate'); if(dateEl){ await dateEl.fill(today); out.events.push({ type:'filled', selector:'#visitDate', value: today }); } }catch(e){}
      // region -> pick first non-empty option
      try{
        const region = await page.$('#regionSelect');
        if(region){
          await page.selectOption('#regionSelect', (await page.evaluate(() => {
            const sel = document.getElementById('regionSelect'); if(!sel) return ''; for(const o of sel.options){ if(o.value && o.value.trim()) return o.value; } return '';
          })) || '');
          out.events.push({ type:'selected', selector:'#regionSelect' });
        }
      }catch(e){}
      // school -> pick first option after region populated
      try{ await page.waitForTimeout(250); const schoolVal = await page.evaluate(() => { const s = document.getElementById('schoolSelect'); if(!s) return ''; for(const o of s.options){ if(o.value && o.value.trim()) return o.value; } return ''; }); if(schoolVal){ await page.selectOption('#schoolSelect', schoolVal); out.events.push({ type:'selected', selector:'#schoolSelect', value: schoolVal }); } }catch(e){}
      // start time
      try{ const sh = await page.$('#startHour'); if(sh) { await page.selectOption('#startHour', '08'); out.events.push({ type:'selected', selector:'#startHour', value:'08' }); } const sm = await page.$('#startMinute'); if(sm) { await page.selectOption('#startMinute','00'); out.events.push({ type:'selected', selector:'#startMinute', value:'00' }); } }catch(e){}
      // duration
      try{ const dur = await page.$('#duration'); if(dur) { try{ await dur.fill('30'); }catch(e){ await page.evaluate(()=>{ const d=document.getElementById('duration'); if(d) d.value='30'; }); } out.events.push({ type:'filled', selector:'#duration', value:'30' }); } }catch(e){}
      // computed end time may update; wait briefly
      try{ await page.waitForTimeout(200); }catch(e){}
      // top-level teacher/publisher/phone/email/requests/notes/deliveries/followUp
      const topFields = [{sel:'#teacherName', val:'Top Teacher'},{sel:'#publisher', val:'Top Publisher'},{sel:'#phone', val:'010-0000-0000'},{sel:'#email', val:'test@example.com'},{sel:'#requests', val:'Auto request'},{sel:'#notes', val:'Auto note'},{sel:'#deliveries', val:'Auto delivery'},{sel:'#followUp', val:'Auto followup'}];
      for(const f of topFields){ try{ const el = await page.$(f.sel); if(el){ await el.fill(f.val); out.events.push({ type:'filled', selector:f.sel, value:f.val }); } }catch(e){} }
    }catch(e){ out.errors.push({ type:'top-fill-failed', message: String(e) }); }

    // helper to wait for a selector and return element handles
    async function qAll(sel, timeout = 4000){
      try{ await page.waitForSelector(sel, { timeout }); return await page.$$(sel); }catch(e){ return []; }
    }

    // 1) Ensure page loaded and find main controls
    const addEntry = (await qAll('#addEntryBtn'))[0] || (await qAll('.add-entry-btn'))[0];
    out.events.push({ type: 'found', selector: '#addEntryBtn or .add-entry-btn', found: !!addEntry });

    // Click addEntry to create a new meeting entry (if present)
    if (addEntry){
      await addEntry.click();
      out.events.push({ type: 'click', selector: '#addEntryBtn', result: 'clicked' });
      await page.waitForTimeout(400); // allow DOM update
    }

    // 2) Duration buttons: try clicking multiple and verify only one active at a time
    const durationBtns = await qAll('#visitDurationButtons .duration-btn');
    out.events.push({ type: 'found', selector: '#visitDurationButtons .duration-btn', count: durationBtns.length });
    for (let i=0;i<durationBtns.length;i++){
      try{
        await durationBtns[i].click();
        await page.waitForTimeout(150);
        const active = [];
        for (let j=0;j<durationBtns.length;j++){
          const cl = await durationBtns[j].getAttribute('class') || '';
          if (cl.indexOf('active') !== -1) active.push(j);
        }
        out.events.push({ type: 'duration-click', clickedIndex: i, activeIndexes: active });
      }catch(e){ out.errors.push({ op: 'duration-click', index:i, err: String(e) }); }
    }

    // 3) Top-level subject buttons
    const subjectTopBtns = await qAll('.subject-choice-group .subject-choice-btn, .subject-btn');
    out.events.push({ type: 'found', selector: '.subject-choice-group .subject-choice-btn OR .subject-btn', count: subjectTopBtns.length });
    for (let i=0;i<Math.min(6, subjectTopBtns.length); i++){
      try{
        await subjectTopBtns[i].click(); await page.waitForTimeout(150);
        const actives = [];
        for (let j=0;j<subjectTopBtns.length;j++){
          const cl = await subjectTopBtns[j].getAttribute('class') || '';
          if (cl.indexOf('active') !== -1) actives.push(j);
        }
        out.events.push({ type: 'subject-top-click', clickedIndex: i, activeIndexes: actives });
      }catch(e){ out.errors.push({ op:'subject-top-click', index:i, err:String(e) }); }
    }

    // 4) Add subject/teacher flow: try to click #addSubjectBtn if exists, then fill inputs
    const addSubject = (await qAll('#addSubjectBtn'))[0];
    out.events.push({ type: 'found', selector: '#addSubjectBtn', found: !!addSubject });
    if (addSubject){
      await addSubject.click(); await page.waitForTimeout(200);
      out.events.push({ type: 'click', selector:'#addSubjectBtn'});
      // try to fill newly created entry fields if present
      const teacherInput = (await qAll('.entry .entry-teacher'))[0] || (await qAll('.entry-teacher'))[0];
      if (teacherInput){
        await teacherInput.fill('Test Teacher'); await page.waitForTimeout(100);
        out.events.push({ type: 'filled', selector: '.entry-teacher', value: 'Test Teacher' });
      }
    }

    // 5) In per-entry area, click entry-favor buttons to ensure single-select per entry
    const entryFavorBtns = await qAll('.entry .entry-favor-btn, .entry-favor-btn');
    out.events.push({ type: 'found', selector: '.entry .entry-favor-btn', count: entryFavorBtns.length });
    // group by their closest .entry parent
    const groups = {};
    for (let idx=0; idx<entryFavorBtns.length; idx++){
      const el = entryFavorBtns[idx];
      const entryEl = await el.evaluateHandle(node => node.closest('.entry'));
      const id = entryEl ? await (entryEl.getProperty('id')).then(p=>p.jsonValue()).catch(()=>null) : null;
      const key = id || ('entry-' + idx);
      groups[key] = groups[key] || [];
      groups[key].push({ index: idx, handle: el });
    }
    for (const gk of Object.keys(groups)){
      const arr = groups[gk];
      for (let k=0;k<arr.length;k++){
        try{
          await arr[k].handle.click(); await page.waitForTimeout(120);
          // after click, check actives within same entry
          const activeIdx = [];
          for (const item of arr){
            const cls = await item.handle.getAttribute('class') || '';
            if (cls.indexOf('active') !== -1) activeIdx.push(item.index);
          }
          out.events.push({ type: 'entry-favor-click', group: gk, clicked: arr[k].index, active: activeIdx });
        }catch(e){ out.errors.push({ op:'entry-favor-click', group:gk, idx:k, err:String(e) }); }
      }
    }

    // 6) Try typing into newly created entry note fields
    const entryNotes = await qAll('.entry .entry-notes, .entry-notes');
    if (entryNotes.length){
      try{ await entryNotes[0].fill('Smoke test note'); out.events.push({ type:'filled', selector: '.entry-notes', value: 'Smoke test note' }); }catch(e){ out.errors.push({ op:'fill-notes', err:String(e) }); }
    }

    // final screenshot
    await page.screenshot({ path: screenshotPath, fullPage: true });
    out.events.push({ type: 'screenshot', path: screenshotPath });

  }catch(err){ out.errors.push({ type: 'fatal', message: String(err) }); }
  finally{
    try{ fs.writeFileSync(logPath, JSON.stringify(out, null, 2)); }catch(e){}
    await browser.close();
    console.log('probe complete. screenshot:', screenshotPath, 'log:', logPath);
  }
})();
