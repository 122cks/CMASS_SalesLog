const puppeteer = require('puppeteer');
(async ()=>{
  const url = 'https://cmass-sales.web.app/meeting.html';
  const browser = await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']});
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);

  await page.goto(url, { waitUntil: 'networkidle2' });

  // wait for main form to be ready
  await page.waitForSelector('#staff');

  // fill main fields
  await page.evaluate(()=>{ localStorage.removeItem('meeting:draft:TEST|2025-11-04|||'); });
  await page.type('#staff', 'TEST');
  await page.type('#visitDate', '2025-11-04');
  // select region and school if options exist; else skip
  try{ await page.select('#regionSelect', Array.from(document.querySelectorAll('#regionSelect option')).slice(1,2).map(o=>o.value)[0]); }catch(e){}

  // main subject: click first subject button
  await page.click('#subjects .subject-btn');
  await page.type('#teacherName', '메인선생');
  await page.type('#requests', '요청사항 메인');
  await page.type('#notes', '특이사항 메인');

  // add an entry if addEntryBtn exists
  const hasAdd = await page.$('#addEntryBtn') !== null;
  if (hasAdd) {
    await page.click('#addEntryBtn');
    // wait for an entry to appear
    await page.waitForSelector('#entriesContainer .entry');
    // type into the first entry fields
    const entry = (await page.$$('#entriesContainer .entry'))[0];
    if (entry) {
      const teacherSel = await entry.$('.entry-teacher');
      if (teacherSel) await teacherSel.type('추가선생');
      const reqSel = await entry.$('.entry-requests');
      if (reqSel) await reqSel.type('요청사항 추가');
    }
  }

  // wait for autosave debounce (2s + margin)
  await page.waitForTimeout(2500);

  // read localStorage keys starting with meeting:draft:
  const drafts = await page.evaluate(()=>{
    const out = {};
    for (let i=0;i<localStorage.length;i++){
      const k = localStorage.key(i);
      if (k && k.startsWith('meeting:draft:')) {
        try{ out[k]=JSON.parse(localStorage.getItem(k)); }catch(e){ out[k]=localStorage.getItem(k); }
      }
    }
    return out;
  });

  console.log('Found draft keys:', Object.keys(drafts));
  for (const k of Object.keys(drafts)){
    console.log('---', k, '---');
    try{ console.log(JSON.stringify(drafts[k], null, 2)); }catch(e){ console.log(String(drafts[k])); }
  }

  await browser.close();
})();
