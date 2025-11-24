const { chromium } = require('playwright');

(async () => {
  const reportUrl = 'https://cmass-sales.web.app/report';
  console.log('Launching headless Chromium...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    javaScriptEnabled: true,
    bypassCSP: true,
  });
  const page = await context.newPage();
  try{
    console.log('Seeding localStorage with a test local entry so report shows an edit link');
    const sample = {
      server_id: '',
      staff: 'songhoonjae',
      staffLabel: '송훈재',
      region: '테스트',
      school: '플레이라이트테스트학교',
      visitDate: new Date().toISOString().slice(0,10),
      startHour: '09',
      startMinute: '05',
      duration: '30',
      endTime: '09:35',
      subjects: ['정보'],
      activities: ['명함인사'],
      favor: '보통',
      teacherName: '테스트선생',
      publisher: '',
      phone: '010-0000-0000',
      email: '',
      requests: '',
      notes: 'Headless Playwright test entry',
      deliveries: '',
      followUp: '',
      _savedAt: new Date().toISOString()
    };
    await page.addInitScript((entry) => {
      try{ const arr = JSON.parse(localStorage.getItem('cmass_reports')||'[]'); arr.unshift(entry); localStorage.setItem('cmass_reports', JSON.stringify(arr)); }catch(e){}
    }, sample);
    console.log('Opening report page (no-cache)');
    await page.goto(reportUrl, { waitUntil: 'domcontentloaded' });
    // disable cache by setting headers for subsequent requests
    await context.setExtraHTTPHeaders({ 'Cache-Control': 'no-cache' });

    // wait for UI to render summary and edit links
    await page.waitForTimeout(1000);

    // find first edit link with text '수정'
    const edit = await page.locator('text=수정').first();
    const exists = await edit.count();
    if (!exists || exists === 0){
      console.log('No edit link (수정) found on report page.');
      await browser.close();
      process.exit(2);
    }
    console.log('Found edit link, attempting to click (same-tab) by DOM click fallback ...');
    // Some edit links are inside collapsed details; use an in-page DOM click to avoid visibility checks
    await page.evaluate(()=>{
      try{
        const els = Array.from(document.querySelectorAll('a'));
        const a = els.find(x=> (x.textContent || '').trim() === '수정');
        if (a){ a.click(); return true; }
      }catch(e){}
      return false;
    });
    // wait briefly for navigation to occur
    await page.waitForTimeout(800);
    try{ await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(()=>null); }catch(e){}

    // After navigation, we may be on meeting.html. Get current URL.
    const url = page.url();
    console.log('Navigated to:', url);

    // Inspect sessionStorage
    const raw = await page.evaluate(() => {
      try{ return sessionStorage.getItem('cmass:edit_entry'); }catch(e){ return null; }
    });
    console.log('sessionStorage.cmassedit raw length:', raw ? raw.length : 0);
    if (raw){
      try{ const parsed = JSON.parse(raw); console.log('sessionStorage.cmassedit keys:', Object.keys(parsed)); console.log('sample keys/values:');
        const pick = ['staff','visitDate','startHour','startMinute','visitStart','teacherName','notes','school'];
        pick.forEach(k=> console.log(k + ':', parsed[k]));
      }catch(e){ console.log('parse error', e.message); }
    }

    // Check meeting form fields
    const check = await page.evaluate(()=>{
      function q(id){ try{ const el = document.getElementById(id); return el ? el.value : null; }catch(e){return null;} }
      return {
        staff: q('staff'),
        visitDate: q('visitDate'),
        school: q('schoolSelect') || q('school'),
        startHour: q('startHour'),
        startMinute: q('startMinute'),
        teacherName: q('teacherName'),
        notes: q('notes'),
        duration: q('duration')
      };
    });
    console.log('Meeting page field snapshot:', check);

    // Also dump some DIAG console messages from page (if available)
    // Playwright does not capture prior page console; but we can check for debug nodes
    const diag = await page.evaluate(()=>{
      try{ const el = document.getElementById('__fetch_debug') || document.getElementById('__cmass_save_toast'); return el ? el.innerText.slice(0,200) : null;}catch(e){return null}
    });
    console.log('Diagnostic node sample:', diag);

    await browser.close();
    process.exit(0);
  }catch(err){
    console.error('Test run error', err);
    try{ await browser.close(); }catch(e){}
    process.exit(3);
  }
})();