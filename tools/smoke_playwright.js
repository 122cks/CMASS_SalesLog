const fs = require('fs');
const { chromium } = require('playwright');

(async ()=>{
  const out = [];
  const url = 'https://cmass-sales.web.app/meeting';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => {
    out.push({ type: 'console', text: msg.text(), location: msg.location() });
    console.log('[PAGE LOG]', msg.type(), msg.text());
  });
  page.on('pageerror', err => {
    out.push({ type: 'pageerror', message: err && err.message });
    console.log('[PAGE ERROR]', err && err.message);
  });
  page.on('requestfailed', req => {
    out.push({ type: 'requestfailed', url: req.url(), failure: req.failure() && req.failure().errorText });
    console.log('[REQ FAIL]', req.method(), req.url(), req.failure() && req.failure().errorText);
  });
  page.on('response', async res => {
    try{
      const ct = res.headers()['content-type'] || '';
      console.log('[RESP]', res.status(), res.url(), ct);
      out.push({ type: 'response', url: res.url(), status: res.status(), contentType: ct });
    }catch(e){}
  });

  try{
    console.log('navigating to', url);
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    console.log('main navigation status:', resp && resp.status());
    // wait for any background activity and UI wiring
    await page.waitForTimeout(1200);

    // fill main form with representative data
    const today = new Date().toISOString().slice(0,10);
    await page.fill('#staff', '홍길동');
    await page.fill('#visitDate', today);

    // pick first non-empty option for region and school if available
    await page.evaluate(()=>{
      function pickFirstNonEmpty(selId){
        const s = document.getElementById(selId);
        if(!s) return;
        for(let i=0;i<s.options.length;i++){
          if(s.options[i].value){ s.value = s.options[i].value; s.dispatchEvent(new Event('change')); return; }
        }
      }
      pickFirstNonEmpty('regionSelect');
      pickFirstNonEmpty('schoolSelect');
    });

    // ensure start time controls exist; set start and duration
    await page.evaluate(()=>{
      const setIfExists = (selId, v)=>{ const el = document.getElementById(selId); if(!el) return; try{ el.value = v; el.dispatchEvent(new Event('change')); el.dispatchEvent(new Event('input')); }catch(e){} };
      setIfExists('startHour','09');
      setIfExists('startMinute','30');
    });
    await page.fill('#duration','45');
    await page.waitForTimeout(300);

    // subject/activity/favors: click a few buttons
    try{ await page.click('#subjects .subject-btn:nth-child(1)'); }catch(e){}
    try{ await page.click('#activities .subject-btn:nth-child(1)'); }catch(e){}
    try{ await page.click('#activities .subject-btn:nth-child(2)'); }catch(e){}
    try{ await page.click('#favors .subject-btn:nth-child(1)'); }catch(e){}

    // primary teacher/publisher and contact info
    await page.fill('#teacherName','김선생');
    await page.fill('#publisher','씨마스');
    await page.fill('#phone','010-1111-2222');
    await page.fill('#email','hong@example.com');
    await page.fill('#requests','교재 샘플 요청, 다음주 연락');
    await page.fill('#notes','교실사정: 프로젝트 수업 예정');
    await page.fill('#deliveries','브로슈어 1부 전달');
    await page.fill('#followUp','재방문예정(중요고객)');

    // add two additional entries and populate them
    try{
      const addBtn = await page.$('#addEntryBtn');
      if(addBtn){ await addBtn.click(); await page.waitForTimeout(220); await addBtn.click(); }
    }catch(e){}

    // fill per-entry fields for first two entries
    await page.evaluate(()=>{
      const entries = Array.from(document.querySelectorAll('#entriesContainer .entry'));
      const sample = [
        { teacher:'박선생', publisher:'천재', phone:'010-2222-3333', email:'park@example.com', requests:'워크북 요청', notes:'장학금 관련 문의', deliveries:'체험계정 전달', followup:'완료(추가조치 없음)' },
        { teacher:'이선생', publisher:'비상', phone:'010-3333-4444', email:'lee@example.com', requests:'연수자료 희망', notes:'다음달 재연락', deliveries:'브로슈어 2부', followup:'선정시기 연락 대기' }
      ];
      entries.slice(0,2).forEach((el, idx)=>{
        try{
          const sbtn = el.querySelector('.entry-subjects .entry-subject-btn'); if(sbtn) sbtn.click();
          const abtn = el.querySelector('.entry-activities .entry-activity-btn'); if(abtn) abtn.click();
          const fav = el.querySelector('.entry-favors .entry-favor-btn'); if(fav) fav.click();
          const t = el.querySelector('.entry-teacher'); if(t) t.value = sample[idx].teacher;
          const p = el.querySelector('.entry-publisher'); if(p) p.value = sample[idx].publisher;
          const ph = el.querySelector('.entry-phone'); if(ph) ph.value = sample[idx].phone;
          const em = el.querySelector('.entry-email'); if(em) em.value = sample[idx].email;
          const req = el.querySelector('.entry-requests'); if(req) req.value = sample[idx].requests;
          const notes = el.querySelector('.entry-notes'); if(notes) notes.value = sample[idx].notes;
          const del = el.querySelector('.entry-deliveries'); if(del) del.value = sample[idx].deliveries;
          const fu = el.querySelector('.entry-followup'); if(fu) fu.value = sample[idx].followup;
        }catch(e){}
      });
    });

    // give the page a moment to update computed fields (like endTime)
    await page.waitForTimeout(700);

    // save page html and screenshot
    const html = await page.content();
    fs.writeFileSync('tools/smoke_page.html', html, 'utf8');
    await page.screenshot({ path: 'tools/smoke_screenshot.png', fullPage: true });
    console.log('screenshot saved to tools/smoke_screenshot.png');
  }catch(e){
    console.error('error during navigation', e && e.message);
    out.push({ type: 'error', err: e && e.message });
  }finally{
    await browser.close();
    fs.writeFileSync('tools/smoke_log.json', JSON.stringify(out, null, 2), 'utf8');
    console.log('log saved to tools/smoke_log.json');
  }
})();
