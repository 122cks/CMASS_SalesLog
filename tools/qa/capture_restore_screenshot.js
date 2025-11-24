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
    try{ browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] }); }
    catch(e){ browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); }

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    // goto base origin to set localStorage
    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate((k,v, staff, date)=>{
      try{ localStorage.setItem(k, v); }catch(e){}
      // also set fallback key to mimic earlier tests
      const fallback = `meeting:draft:${staff}|${date}||`;
      try{ localStorage.setItem(fallback, v); }catch(e){}
    }, draftKey, JSON.stringify(draftObj), staff, date);

    await page.goto(url, { waitUntil: 'networkidle2' });

    // wait for the ask-restore modal
    await page.waitForSelector('#cmass-ask-restore', { timeout: 5000 });

    // click restore
    await page.evaluate(()=>{
      const overlay = document.getElementById('cmass-ask-restore');
      if(!overlay) return false;
      const btns = Array.from(overlay.querySelectorAll('button'));
      const target = btns.find(b => b.textContent && b.textContent.includes('이전 드래프트'));
      if(target) { target.click(); return true; }
      return false;
    });

    // Wait for restore application: check #teacherName populated
    await page.waitForFunction(() => {
      const el = document.querySelector('#teacherName');
      return el && el.value && el.value.length > 0;
    }, { timeout: 3000 }).catch(()=>{});

  // small delay to let UI settle
  await new Promise(r => setTimeout(r, 300));

    // capture screenshot as base64
    const imgBase64 = await page.screenshot({ encoding: 'base64', fullPage: false });

    // also retrieve the persisted draft JSON from localStorage for verification
    const persisted = await page.evaluate((k)=>{
      try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; }
    }, draftKey);

    // print markers and base64 to stdout
    console.log('\n===SCREENSHOT_BASE64_START===');
    console.log(imgBase64);
    console.log('===SCREENSHOT_BASE64_END===\n');
    console.log('===PERSISTED_DRAFT_JSON_START===');
    console.log(JSON.stringify(persisted, null, 2));
    console.log('===PERSISTED_DRAFT_JSON_END===');

    await browser.close(); process.exit(0);
  }catch(err){ console.error('Error during capture:', err); if(browser) await browser.close(); process.exit(2); }
})();
