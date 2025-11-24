const puppeteer = require('puppeteer');
(async ()=>{
  const base = process.env.QA_BASE || 'http://localhost:8765';
  const staff = process.env.QA_STAFF || '송훈재 부장';
  const date = process.env.QA_DATE || '2025-09-29';
  const region = process.env.QA_REGION || '경기도가평군';
  const school = process.env.QA_SCHOOL || '청심국제고등학교';
  const url = `${base}/meeting.html?staff=${encodeURIComponent(staff)}&date=${encodeURIComponent(date)}&region=${encodeURIComponent(region)}&school=${encodeURIComponent(school)}`;
  let browser;
  try{
    browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2' });
    // enumerate localStorage keys for this origin
    const keys = await page.evaluate(()=>{ const out=[]; for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); out.push(k);} return out; });
    console.log('localStorage keys on page origin:', keys.slice(0,200));
    // show exact and fallback keys
    const exact = `meeting:draft:${staff}|${date}|${region}|${school}`;
    const fallback = `meeting:draft:${staff}|${date}||`;
    const exactVal = await page.evaluate(k => localStorage.getItem(k), exact);
    const fallbackVal = await page.evaluate(k => localStorage.getItem(k), fallback);
    console.log('exact key present:', exact, exactVal ? 'YES' : 'NO');
    console.log('fallback key present:', fallback, fallbackVal ? 'YES' : 'NO');
    if(exactVal) console.log('exact parsed:', JSON.parse(exactVal));
    if(fallbackVal) console.log('fallback parsed:', JSON.parse(fallbackVal));
    await browser.close(); process.exit(0);
  }catch(err){ console.error('ERR', err); if(browser) await browser.close(); process.exit(2);} })();
