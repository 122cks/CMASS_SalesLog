const { chromium } = require('playwright');

(async ()=>{
  console.log('Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test entry - ensure visitDate matches the report URL below
  const testEntry = {
    server_id: '',
    staff: 'songhoonjae',
    staffLabel: 'songhoonjae',
    region: '테스트지역',
    school: '플레이라이트테스트학교',
    visitDate: new Date().toISOString().slice(0,10),
    startHour: '09',
    startMinute: '05',
    duration: 30,
    endTime: '09:35',
    subjects: ['테스트과목'],
    activities: ['테스트행동'],
    favor: '보통',
    teacherName: '테스트선생',
    publisher: '',
    phone: '010-0000-9999',
    email: '',
    requests: '',
    notes: 'Headless Playwright test entry',
    deliveries: '',
    followUp: '',
    _savedAt: new Date().toISOString()
  };

  try{
    // Forward page console messages to our Node console for debugging
    page.on('console', msg => {
      try{ console.log('PAGE LOG>', msg.text()); }catch(e){}
    });

    // Navigate to origin first so localStorage writes apply to the correct domain
    await page.goto('https://cmass-sales.web.app', { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Seed localStorage for the origin before loading /report
    await page.evaluate((entry)=>{
      try{ localStorage.setItem('cmass_reports', JSON.stringify([entry])); }catch(e){ console.warn('localStorage seed failed', e); }
    }, testEntry);

    // Also seed the consolidated report key the hosted report page expects: report:<staff>|<date>
    const reportKey = `report:${testEntry.staff}|${testEntry.visitDate}`;
    await page.evaluate(({rk, entry})=>{
      try{ localStorage.setItem(rk, JSON.stringify([entry])); }catch(e){ console.warn('reportKey seed failed', e); }
    }, { rk: reportKey, entry: testEntry });

    const url = `https://cmass-sales.web.app/report?staff=${encodeURIComponent(testEntry.staff)}&visitDate=${encodeURIComponent(testEntry.visitDate)}`;
    console.log('Opening report page (seeded localStorage) ->', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Dump localStorage.cmass_reports for debugging (helpful if the page overwrote/cleared it)
    const localRaw = await page.evaluate(()=> localStorage.getItem('cmass_reports') || '');
    console.log('localStorage.cmass_reports (first 400 chars):', (localRaw||'').slice(0,400));

    // If the page exposes a small interactive test runner, run it to ensure an entry exists
    // Wait for the in-page test runner to become available (it's defined in the page script). If present, run it.
    const runnerReady = await page.waitForFunction(()=> !!(window._cmass_runSyncTest), { timeout: 3000 }).catch(()=>null);
    if (runnerReady){
      console.log('Found _cmass_runSyncTest on page — invoking it to ensure an entry is present');
      await page.evaluate(()=> window._cmass_runSyncTest && window._cmass_runSyncTest());
      // Wait a short while for the UI to re-render
      await page.waitForTimeout(800);
    }

    // If available, call a page-provided re-render helper to force the UI to reflect localStorage
    const reRenderAvailable = await page.evaluate(()=> !!(window._reRenderUI));
    if (reRenderAvailable){
      console.log('Calling page._reRenderUI() to force re-render from seeded localStorage');
      await page.evaluate(()=> { try{ window._reRenderUI(); }catch(e){ console.warn('_reRenderUI call failed', e); } });
      await page.waitForTimeout(400);
    }

    // Wait for an edit action ('수정') button/link to be present. The page renders entries asynchronously.
    const found = await page.waitForFunction(()=> {
      try{ return Array.from(document.querySelectorAll('*')).some(el=> el.textContent && el.textContent.indexOf('수정') !== -1); }catch(e){ return false; }
    }, { timeout: 10000 }).catch(()=>null);

    if (!found){
      console.error('No edit link (수정) found on report page. Dumping entriesArea for inspection:');
  const groupedHtml = await page.evaluate(()=> { const el = document.getElementById('grouped') || document.getElementById('entriesArea'); return el ? (el.innerHTML||'') : ''; });
  console.log('grouped/entriesArea innerHTML (first 1000 chars):', (groupedHtml||'').slice(0,1000));
      await browser.close();
      process.exit(1);
    }

    console.log('Found edit UI. Looking for a meeting link (anchor) first, falling back to button click');
    const clicked = await page.evaluate(()=>{
      try{
        // prefer anchors that link to meeting.html so sessionStorage handoff can occur across pages
        const a = Array.from(document.querySelectorAll('a')).find(x=> (x.href || '').indexOf('/meeting') !== -1 || (x.getAttribute && (x.getAttribute('href')||'').indexOf('meeting') !== -1));
        if (a){ a.click(); return 'anchor'; }
        const btn = Array.from(document.querySelectorAll('button')).find(x=> x.textContent && x.textContent.indexOf('수정') !== -1);
        if (btn){ btn.click(); return 'button'; }
      }catch(e){ return null; }
      return null;
    });
    console.log('clicked element type:', clicked);

    // Wait for navigation to meeting page (or URL change)
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(()=>{});
    console.log('Navigated to (initial):', page.url());

    // If the report UI did not provide a meeting anchor (hosted report.js uses inline editors),
    // programmatically pick the first canonical report entry, write it to sessionStorage and
    // navigate to /meeting.html so we can validate meeting prefill behaviour.
    const nowUrl = page.url();
    if (!nowUrl || nowUrl.indexOf('/meeting') === -1){
      console.log('No automatic navigation to /meeting detected — constructing sessionStorage payload and navigating manually');
      // retrieve first entry from the canonical report array and set sessionStorage, then navigate
      await page.evaluate(() => {
        try{
          const query = new URLSearchParams(window.location.search || '');
          const staff = query.get('staff') || '';
          const visitDate = query.get('visitDate') || query.get('date') || '';
          const reportKey = `report:${(staff||'').trim()}|${(visitDate||'').trim()}`;
          const txt = localStorage.getItem(reportKey) || '[]';
          const arr = JSON.parse(txt) || [];
          if (arr.length){
            const payload = Object.assign({}, arr[0]);
            try{ if (payload.visitDate && typeof payload.visitDate === 'string' && payload.visitDate.indexOf('T') !== -1) payload.visitDate = payload.visitDate.slice(0,10); }catch(_){}
            try{ sessionStorage.setItem('cmass:edit_entry', JSON.stringify(payload)); sessionStorage.setItem('cmass:edit_index', '0'); }catch(e){}
          }
        }catch(e){ console.warn('manual sessionStorage set failed', e); }
      });
      const navUrl = `https://cmass-sales.web.app/meeting.html?staff=${encodeURIComponent(testEntry.staff)}&visitDate=${encodeURIComponent(testEntry.visitDate)}`;
      try{ await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 15000 }); }catch(e){ console.warn('manual navigation to meeting failed', e); }
      console.log('Navigated to (manual):', page.url());
      // give meeting page a moment to apply payload
      await page.waitForTimeout(500);
    }

    // Give meeting page a moment to apply sessionStorage payload
    await page.waitForTimeout(800);

    // Capture sessionStorage (may be consumed by apply logic) and some meeting form fields
    const snapshot = await page.evaluate(()=>{
      const out = {};
      try{ out.session_raw = sessionStorage.getItem('cmass:edit_entry') || ''; out.session_index = sessionStorage.getItem('cmass:edit_index') || ''; }catch(e){ out.session_err = String(e); }
      function qsel(selectors){ for(const s of selectors){ const el = document.querySelector(s); if (el) return el; } return null; }
      try{
        const staffEl = qsel(['#staff','select[name="staff"]','select#staff']);
        out.staff_value = staffEl ? (staffEl.value || (staffEl.selectedOptions && staffEl.selectedOptions[0] && staffEl.selectedOptions[0].text) || '') : null;
      }catch(e){ out.staff_err = String(e); }
      try{ const d = qsel(['#visitDate','input[name="visitDate"]','input#visitDate']); out.visitDate = d ? d.value : null; }catch(e){ out.visitDate_err = String(e); }
      try{ const s = qsel(['#school','input[name="school"]','input#school']); out.school = s ? s.value : null; }catch(e){ out.school_err = String(e); }
      try{ const sh = qsel(['#startHour','select[name="startHour"]','input#startHour']); out.startHour = sh ? sh.value : null; }catch(e){ out.startHour_err = String(e); }
      try{ const sm = qsel(['#startMinute','select[name="startMinute"]','input#startMinute']); out.startMinute = sm ? sm.value : null; }catch(e){ out.startMinute_err = String(e); }
      try{ const t = qsel(['#teacherName','input[name="teacherName"]','input#teacherName']); out.teacherName = t ? t.value : null; }catch(e){ out.teacherName_err = String(e); }
      try{ const n = qsel(['#notes','textarea[name="notes"]','textarea#notes']); out.notes = n ? n.value : null; }catch(e){ out.notes_err = String(e); }
      try{ const dur = qsel(['#duration','input[name="duration"]','input#duration']); out.duration = dur ? dur.value : null; }catch(e){ out.duration_err = String(e); }
      return out;
    });

    console.log('sessionStorage.cmass:edit_entry raw length:', (snapshot.session_raw || '').length);
    console.log('meeting page snapshot:', snapshot);

    await browser.close();
    process.exit(0);
  }catch(err){
    console.error('Test run failed', err);
    try{ await browser.close(); }catch(e){}
    process.exit(2);
  }
})();
