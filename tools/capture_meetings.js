const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async ()=>{
  const outDir = path.resolve(__dirname, 'artifacts');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const base = 'https://cmass-sales.web.app';

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 412, height: 844 } });

  // Build synthetic visit list: 5 schools, 5 meetings each = 25
  const staff = 'Songhoonjae';
  const visitDate = new Date().toISOString().slice(0,10); // today
  const schools = ['학교A','학교B','학교C','학교D','학교E'];
  const subjects = ['정보','진로','체육','미술','보건'];
  const visits = [];
  for(let si=0; si<schools.length; si++){
    for(let m=0;m<5;m++){
      visits.push({
        staff,
        visitDate,
        region: '지역1',
        school: schools[si],
        visitStartHour: String(9 + (m%6)).padStart(2,'0'),
        visitStartMinute: '00',
        visitDuration: 30,
        subjects: [subjects[m%subjects.length]],
        teacher: `선생님${si+1}-${m+1}`,
        publisher: '씨마스',
        contactFormatted: `010-1234${String(si)+String(m)}`,
        meetings: [subjects[m%subjects.length]],
        requests: '요청사항 예시',
        conversation: '특이사항 예시',
        delivery: '납품 예시',
        followUp: ''
      });
    }
  }

  // Pre-inject storage and a global visit list before any page scripts run.
  await context.addInitScript(({ visits, staff, visitDate }) => {
    try{
      try{ localStorage.setItem('cmass:staff', staff); }catch(e){}
      try{ sessionStorage.setItem('cmass:last_date', visitDate); }catch(e){}
      // expose visit list early so page scripts can read it during initialization
      window._cmass_visitList = visits;
    }catch(e){}
  }, { visits, staff, visitDate });

  // pages to capture
  const pages = [
    { path: '/index.html', name: 'index' },
    { path: '/front.html', name: 'front' },
    { path: '/input.html', name: 'input' },
    { path: '/meeting.html', name: 'meeting' },
    { path: '/report.html', name: 'report' }
  ];

  const results = { screenshots: {}, kakaoSummary: '' };

  for (const p of pages){
    const page = await context.newPage();
    try{
      // Use a longer timeout and networkidle to allow large pages to load
      const timeoutMs = 60000;
      // Add a simple retry for front.html which sometimes times out
      let attempts = 0;
      const maxAttempts = p.name === 'front' ? 2 : 1;
      while(attempts < maxAttempts){
        attempts++;
        try{
          await page.goto(base + p.path, { waitUntil: 'networkidle', timeout: timeoutMs });
          break;
        }catch(nerr){
          if(attempts >= maxAttempts) throw nerr;
          // small backoff before retry
          await page.waitForTimeout(800);
        }
      }

      // Give the page a moment to stabilize after scripts run
      await page.waitForTimeout(800);

      const shotPath = path.join(outDir, `${p.name}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      results.screenshots[p.name] = shotPath;

      // For input page, extract the Kakao summary via generateSummary() if exposed
      if(p.name === 'input'){
        const summary = await page.evaluate(()=>{
          try{ if (typeof generateSummary === 'function') return generateSummary(); if (typeof window.generateSummary === 'function') return window.generateSummary(); }catch(e){}
          try{ const v = window._cmass_visitList || []; if(!v.length) return ''; const f = v[0]; return `(자동생성) ${f.staff} ${f.visitDate} 총 방문 학교: ${v.length}개`; }catch(e){}
          return '';
        });
        results.kakaoSummary = summary || '';
        fs.writeFileSync(path.join(outDir, 'kakao_summary.txt'), summary || '', 'utf8');
      }

      await page.close();
    }catch(err){
      try{ await page.close(); }catch(e){}
      console.error('capture failed for', p.path, err && err.message);
    }
  }

  await browser.close();
  // Write metadata
  fs.writeFileSync(path.join(outDir,'results.json'), JSON.stringify(results, null, 2), 'utf8');
  console.log('captures saved to', outDir);
})();
