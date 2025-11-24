const { chromium } = require('playwright');
const fs = require('fs');

(async ()=>{
  const url = process.argv[2] || 'https://cmass-sales.web.app/input?user=Songhoonjae';
  console.log('Opening', url);
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  // block service workers to avoid redirect/cached stale HTML served by SW
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  try{
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000, referer: 'https://cmass-sales.web.app/' });
    // wait a bit for scripts to run; then verify the page has the expected UI
    await page.waitForTimeout(4000);
    const hasUi = await page.evaluate(()=>{
      return {
        copyBtn: !!document.getElementById('copyKakaoBtn'),
        buildFn: !!window.buildAggregateSummary,
        dayVisits: !!window.dayVisits
      };
    });
    if (!hasUi.copyBtn || !hasUi.buildFn) {
      const html = await page.evaluate(()=> document.documentElement.innerHTML);
      const path = 'page-dump.html';
      require('fs').writeFileSync(path, html, 'utf8');
      throw new Error('Page did not expose expected UI (copyKakaoBtn/buildAggregateSummary). Saved HTML to ' + path);
    }

    // create 25 test visits programmatically
    const today = new Date();
    const pad = n => String(n).padStart(2,'0');
    const dateStr = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;
    const sampleSchools = [ '과천고등학교','광명고등학교','양재중학교','서울중학교','도봉고','남부초등학교','북부중학교' ];
    const sampleSubjects = ['국어','영어','수학','과학','정보'];

    const visits = [];
    for(let i=0;i<25;i++){
      const school = sampleSchools[i % sampleSchools.length] + (i>9?(' '+(Math.floor(i/7)+1)):'');
      const subject = sampleSubjects[i % sampleSubjects.length];
      visits.push({
        visitDate: dateStr,
        staff: '송훈재',
        region: '경기도과천시',
        school: school,
        visitStart: '10:00',
        visitEnd: '10:30',
        subjects: [ { subject: subject, teacher: '선생님'+(i+1), contact: (i%3===0) ? ('0101234'+String(560+i).padStart(3,'0')) : '', meetings: '', followUp: '', conversation: '상담완료' } ]
      });
    }

    console.log('Injecting', visits.length, 'visits into page.dayVisits');
    await page.evaluate((vs)=>{
      // ensure dayVisits exists
      window.dayVisits = window.dayVisits || [];
      // push clones so app can work with them
      for(const v of vs) window.dayVisits.push(v);
      return window.dayVisits.length;
    }, visits);

    // Wait a bit for any UI updates
    await page.waitForTimeout(800);

    // Generate the kakao summary the app would copy
    const summary = await page.evaluate(()=>{
      try{
        const s = buildAggregateSummary(window.dayVisits || [], 'kakao');
        // append auto tags like the button handler
        const tags = buildAutoTags ? buildAutoTags(window.dayVisits || [], parseInt(document.getElementById('optMaxTags')?.value)||8) : [];
        let out = s || '';
        if (tags && tags.length){ out += '\n\n자동 태그: ' + tags.join(', '); }
        return out;
      }catch(e){ return 'ERROR: '+(e && e.message);
      }
    });

    console.log('\n--- Generated Kakao Summary (truncated to 2000 chars) ---\n');
    console.log(summary.substring(0,2000));
    fs.writeFileSync('kakao-summary-output.txt', summary, 'utf8');
    console.log('Saved summary to kakao-summary-output.txt');

    // Optionally, trigger the app's copy button to show alerts (we capture the summary directly above)
    // await page.click('#copyKakaoBtn');

    // keep the browser open for manual inspection, then close after short delay
    console.log('Keeping browser open 8s for inspection...');
    await page.waitForTimeout(8000);
  }catch(err){
    console.error('Test script error:', err);
  }finally{
    try{ await browser.close(); }catch(e){}
    console.log('Done');
  }
})();
