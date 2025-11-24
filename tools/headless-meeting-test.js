const { chromium } = require('playwright');

(async() => {
  const url = 'https://cmass-sales.web.app/meeting';
  console.log('Launching browser and opening', url);
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();
  try{
    await page.goto(url, { waitUntil: 'networkidle' });
    console.log('Page loaded');

    // Fill main fields
    await page.fill('#staff', '테스트담당자');
    // set a date (ensure format)
    await page.fill('#visitDate', '2025-05-05');

    // Try to pick first non-empty region and school options if available
    await page.evaluate(() => {
      const r = document.getElementById('regionSelect');
      if (r && r.options && r.options.length>1) { r.selectedIndex = 1; r.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const s = document.getElementById('schoolSelect');
      if (s && s.options && s.options.length>1) { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); }
    });

    // Fill teacher, phone, and some textareas
    await page.fill('#teacherName', '김선생');
    await page.fill('#phone', '01012345678');
    await page.fill('#requests', '테스트 요청사항');
    await page.fill('#notes', '테스트 특이사항');

    // Click a subject and an activity (if present)
    try{ await page.click('#subjects .subject-btn',{timeout:1200}); }catch(e){}
    try{ await page.click('#activities .subject-btn',{timeout:1200}); }catch(e){}

    // Add an entry and fill per-entry fields
    try{
      await page.click('#addEntryBtn');
      await page.waitForSelector('#entriesContainer .entry', { timeout: 2000 });
      // fill the first added entry
      await page.fill('#entriesContainer .entry .entry-teacher', '박선생');
      await page.fill('#entriesContainer .entry .entry-requests', '추가 요청');
      // click an entry subject button
      try{ await page.click('#entriesContainer .entry .entry-subject-btn',{timeout:1200}); }catch(e){}
    }catch(e){ console.warn('add-entry or fill failed', e.message); }

    // Wait for autosave debounce
    await page.waitForTimeout(1200);

    // Inspect localStorage for meeting:draft keys
    const drafts = await page.evaluate(() => {
      const out = [];
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (k && k.indexOf('meeting:draft:')===0){
          try{ out.push({ key: k, value: JSON.parse(localStorage.getItem(k)) }); }catch(e){ out.push({ key: k, value: localStorage.getItem(k) }); }
        }
      }
      return out;
    });

    console.log('Found drafts:\n', JSON.stringify(drafts, null, 2));

  }catch(err){
    console.error('Test failed', err);
  }finally{
    await browser.close();
  }
})();