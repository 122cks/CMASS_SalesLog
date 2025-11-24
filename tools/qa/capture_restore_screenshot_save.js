const puppeteer = require('puppeteer');
const fs = require('fs');
(async ()=>{
  const base = process.env.QA_BASE || 'http://localhost:8765';
  const staff = process.env.QA_STAFF || '송훈재 부장';
  const date = process.env.QA_DATE || '2025-09-29';
  const region = process.env.QA_REGION || '경기도가평군';
  const school = process.env.QA_SCHOOL || '가평고등학교';
  const outPath = process.env.QA_OUT || 'tools/qa/artifacts/restore_check.png';
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
    const chromePath = process.env.QA_CHROME_PATH || (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : '/usr/bin/google-chrome');
    try{ browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox'] }); }
    catch(e){ browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] }); }

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 600 });

    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate((k,v, staff, date)=>{
      try{ localStorage.setItem(k, v); }catch(e){}
      const fallback = `meeting:draft:${staff}|${date}||`;
      try{ localStorage.setItem(fallback, v); }catch(e){}
    }, draftKey, JSON.stringify(draftObj), staff, date);

    await page.goto(url, { waitUntil: 'networkidle2' });

    // wait for the ask-restore modal
    try{ await page.waitForSelector('#cmass-ask-restore', { timeout: 5000 }); }catch(e){}

    // click restore if present
    await page.evaluate(()=>{
      const overlay = document.getElementById('cmass-ask-restore');
      if(!overlay) return false;
      const btns = Array.from(overlay.querySelectorAll('button'));
      const target = btns.find(b => b.textContent && b.textContent.includes('이전 드래프트'));
      if(target) { target.click(); return true; }
      return false;
    });

    await page.waitForFunction(() => {
      const el = document.querySelector('#teacherName');
      return el && el.value && el.value.length > 0;
    }, { timeout: 3000 }).catch(()=>{});

    await new Promise(r => setTimeout(r, 300));

    await page.screenshot({ path: outPath, fullPage: false });

    // also write persisted draft JSON
    const persisted = await page.evaluate((k)=>{ try{ return JSON.parse(localStorage.getItem(k) || 'null'); }catch(e){ return null; } }, draftKey);
    try{ fs.mkdirSync(require('path').dirname(outPath), { recursive: true }); }catch(e){}
    try{ fs.writeFileSync(outPath.replace(/\.png$/, '.json'), JSON.stringify(persisted, null, 2)); }catch(e){}

    console.log('WROTE:', outPath);
    await browser.close(); process.exit(0);
  }catch(err){ console.error('Error during capture:', err); if(browser) await browser.close(); process.exit(2); }
})();
