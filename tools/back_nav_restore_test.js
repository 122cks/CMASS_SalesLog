const puppeteer = require('puppeteer');
(async ()=>{
  const result = { ok: true, console: [], before: {}, after: {}, errors: [] };
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
  let browser = null;
  try{
    browser = await puppeteer.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    page.on('console', msg => { result.console.push({type:msg.type(), text: msg.text()}); if (msg.type()==='error') result.errors.push(msg.text()); });
    page.on('pageerror', err => { result.errors.push(err.message || String(err)); });

    // stub alerts/prompts so they don't block the test
    await page.evaluateOnNewDocument(()=>{
      window.alert = function(){};
      window.confirm = function(){ return true; };
      window.prompt = function(){ return null; };
    });

  // provide a same-origin referrer so the page's startup redirect to /front.html is suppressed
  await page.goto(url, { waitUntil: 'networkidle2', referer: 'https://cmass-sales.web.app/' });

    // wait for visitDate to appear
    await page.waitForSelector('#visitDate');

    // set today's date (ISO yyyy-mm-dd)
    const today = new Date();
    const yyyy = String(today.getFullYear());
    const mm = String(today.getMonth()+1).padStart(2,'0');
    const dd = String(today.getDate()).padStart(2,'0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    await page.evaluate((d)=>{ const el = document.getElementById('visitDate'); if(el) el.value = d; }, dateStr);

    // click '다음' to go to step2
    try{ await page.click('#nextStepBtn'); }catch(e){ /* ignore */ }
    await page.waitForSelector('#salesForm');

    // ensure there's at least one subject-block and fill it
    await page.waitForSelector('#subjectsBlock .subject-block');
    // choose a subject button (진로) if present
    await page.evaluate(()=>{
      const btn = document.querySelector('#subjectsBlock .subject-choice[data-subject="진로"]') || document.querySelector('#subjectsBlock .subject-choice');
      if (btn) btn.classList.add('selected');
      const subjHidden = document.querySelector('#subjectsBlock .subject-block .subject-name'); if (subjHidden) subjHidden.value = (btn && btn.dataset && btn.dataset.subject) ? btn.dataset.subject : '진로';
    });

    // type teacher name and conversation detail
    const teacherText = '자동화_테스트_선생님 이름_테스트';
    const convText = '자동화_테스트_메시지_복원확인_12345';
    await page.focus('#subjectsBlock .subject-block .teacher-name');
    await page.evaluate((t)=>{ const el = document.querySelector('#subjectsBlock .subject-block .teacher-name'); if (el) el.value = t; }, teacherText);
    await page.evaluate((c)=>{ const ta = document.querySelector('#subjectsBlock .subject-block .conversation-detail'); if (ta) ta.value = c; }, convText);

  // wait for autosave debounce (600ms in page) + small buffer
  await new Promise(r => setTimeout(r, 900));

    // capture values before navigation
    result.before.teacher = await page.evaluate(()=> (document.querySelector('#subjectsBlock .subject-block .teacher-name')||{}).value || null);
    result.before.conversation = await page.evaluate(()=> (document.querySelector('#subjectsBlock .subject-block .conversation-detail')||{}).value || null);
    result.before.generated = await page.evaluate(()=> (document.getElementById('generatedSummary')||{}).value || null);

    // click the top '뒤로 가기' button (goFrontBtn) which saves synchronously and navigates away
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click('#goFrontBtn')
    ]).catch(()=>{});

  // now we should be on the previous page in history (referrer). Navigate forward to return to the input page
  await page.goForward({ waitUntil: 'networkidle2' }).catch(()=>{});

    // wait for visitDate and subjects to be present and for loadSavedForDate to run
    await page.waitForSelector('#visitDate');
  await new Promise(r => setTimeout(r, 600)); // allow restore logic time

    // capture values after returning
    result.after.teacher = await page.evaluate(()=> (document.querySelector('#subjectsBlock .subject-block .teacher-name')||{}).value || null);
    result.after.conversation = await page.evaluate(()=> (document.querySelector('#subjectsBlock .subject-block .conversation-detail')||{}).value || null);
    result.after.generated = await page.evaluate(()=> (document.getElementById('generatedSummary')||{}).value || null);

  }catch(err){ result.ok = false; result.exception = String(err); }
  finally{ if (browser) await browser.close(); console.log(JSON.stringify(result, null, 2)); }
})();

