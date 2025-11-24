const puppeteer = require('puppeteer');

(async ()=>{
  const base = process.env.QA_BASE || 'http://localhost:8765';
  const staff = process.env.QA_STAFF || '송훈재 부장';
  const date = process.env.QA_DATE || '2025-09-29';
  const region = process.env.QA_REGION || '경기도가평군';
  const school = process.env.QA_SCHOOL || '청심국제고등학교';
  const url = `${base}/meeting.html?staff=${encodeURIComponent(staff)}&date=${encodeURIComponent(date)}&region=${encodeURIComponent(region)}&school=${encodeURIComponent(school)}`;

  const draftKey = `meeting:draft:${staff}|${date}|${region}|${school}`;
  const draftObj = {
    staff, date, region, school,
    teacher: '테스트선생', publisher: '씨마스', phone: '010-1111-2222', email: 'test@example.com',
    requests: '요청사항 테스트', notes: '특이사항 테스트', deliveries: '납품테스트',
    durationMin: 30, startTime: '09:10', endTime: '09:40',
    subjects: ['정보'], activities: ['명함인사']
  };

  let browser;
  try{
    const chromePath = process.env.QA_CHROME_PATH || (process.platform === 'win32' ?
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
    try{ browser = await puppeteer.launch({ headless: true, executablePath: chromePath }); }
    catch(e){ console.warn('system chrome launch failed, falling back:', e && e.message); browser = await puppeteer.launch({ headless: true }); }

    const page = await browser.newPage();

    // navigate to origin then set localStorage
    await page.goto(base, { waitUntil: 'networkidle2' });
    // set both the exact key and a fallback key (empty region/school) because
    // the page may compute its key before region/school options are populated.
    await page.evaluate((k,v, staff, date)=>{
      try{ localStorage.setItem(k, v); }catch(e){}
      const fallback = `meeting:draft:${staff}|${date}||`;
      try{ localStorage.setItem(fallback, v); }catch(e){}
    }, draftKey, JSON.stringify(draftObj), staff, date);

    // goto meeting page with params
    await page.goto(url, { waitUntil: 'networkidle2' });

    // wait for ask-restore modal
    await page.waitForSelector('#cmass-ask-restore', { timeout: 3000 });

    // click the restore button with text '이전 드래프트 복원'
    await page.evaluate(()=>{
      const overlay = document.getElementById('cmass-ask-restore');
      if(!overlay) return false;
      const btns = Array.from(overlay.querySelectorAll('button'));
      const target = btns.find(b => b.textContent && b.textContent.includes('이전 드래프트'));
      if(target) target.click();
      return true;
    });

    // wait briefly for restore to apply
    await new Promise(r=>setTimeout(r, 600));

    // read back a few fields to verify
    const values = await page.evaluate(()=>{
      return {
        staff: document.querySelector('#staff') ? document.querySelector('#staff').value : null,
        date: document.querySelector('#visitDate') ? document.querySelector('#visitDate').value : null,
        teacher: document.querySelector('#teacherName') ? document.querySelector('#teacherName').value : null,
        phone: document.querySelector('#phone') ? document.querySelector('#phone').value : null,
        requests: document.querySelector('#requests') ? document.querySelector('#requests').value : null,
        duration: document.querySelector('#duration') ? document.querySelector('#duration').value : null,
      };
    });

    console.log('restored values:', values);

    // basic assertions
    const pass = values.staff === draftObj.staff && values.date === draftObj.date && values.teacher === draftObj.teacher && values.phone === draftObj.phone && (String(values.requests||'').includes('요청사항'));
    if(!pass){ console.error('FAIL: restored values do not match expected'); await browser.close(); process.exit(2); }

    console.log('PASS: draft restored and visible in form fields');
    await browser.close(); process.exit(0);
  }catch(err){
    console.error('Error during test:', err);
    if(browser) await browser.close();
    process.exit(3);
  }
})();
