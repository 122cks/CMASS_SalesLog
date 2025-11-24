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
    await page.goto(base, { waitUntil: 'networkidle2' });
    await page.evaluate((k,v)=> localStorage.setItem(k, v), draftKey, JSON.stringify(draftObj));
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#cmass-ask-restore', { timeout: 3000 });

    // inspect what page parsed from localStorage
    const parsed = await page.evaluate(()=> window._cmass_last_parsed_draft || null);
    console.log('parsed draft from page context:', parsed);

    await browser.close(); process.exit(0);
  }catch(err){ console.error('Error:', err); if(browser) await browser.close(); process.exit(2); }
})();
