const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
(async ()=>{
  const chromePath = path.resolve(__dirname, 'chrome', 'chrome-win', 'chrome.exe');
  const url = process.argv[2] || 'file:///C:/Users/PC/OneDrive/cmass-sales-system/CMASS_SalesLog/public/test_draft_preview.html';
  const outDir = path.resolve(__dirname, '../../automation_output'); if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--allow-file-access-from-files','--disable-web-security']});
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => { try{ logs.push(msg.text()); }catch(e){} });
  try{
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });
    // wait for our window._test_done flag or timeout
    const start = Date.now();
    let done = false;
    while(Date.now() - start < 5000){
      const _done = await page.evaluate(() => { return !!window._test_done; }).catch(()=>false);
      if(_done){ done = true; break; }
      await new Promise(r=>setTimeout(r,200));
    }
    // For reliability, directly invoke the exposed buildDraftPreviewText on the page
    const sampleDraft = {
      staff: '송훈재 부장', date: '2025-09-29', region: '경기도가평군', school: '청심국제고등학교', visitStart: '08:00', durationMin: 60,
      subjects:['정보'], activities:['활동A'], favor:'좋음', teacher:'aa', publisher:'미래엔', requests:'요청예시', notes:'특이사항 예시', deliveries:'납품 예시', followUp:'후속 예시',
      sessions: [{ subjects:['정보'], activities:['활동A'], favor:'좋음', teacher:'aa', publisher:'미래엔', requests:'aa', notes:'aa', deliveries:'aa', followUp:'완료(추가조치 없음)'}]
    };
    const saved = await page.evaluate((d)=>{
      try{
        if(window.buildPerSessionDraftText && typeof window.buildPerSessionDraftText === 'function'){
          const txt = window.buildPerSessionDraftText(d);
          const el = document.getElementById('savedDraft'); if(el) el.textContent = txt;
          return txt;
        } else if(window.buildDraftPreviewText && typeof window.buildDraftPreviewText === 'function'){
          const txt = window.buildDraftPreviewText(d);
          const el = document.getElementById('savedDraft'); if(el) el.textContent = txt;
          return txt;
        }
      }catch(e){ return null; }
      return null;
    }, sampleDraft);
    logs.push('[RUN_TEST] savedDraftLen=' + (saved ? saved.length : '(null)'));
    logs.push('[RUN_TEST] savedDraft=' + (saved || '<null>'));
  try{ fs.writeFileSync(path.join(outDir,'test_preview_console.log'), logs.join('\n'), 'utf8'); }catch(e){ console.log('write log failed', e && e.message); }
  try{ fs.writeFileSync(path.join(outDir,'test_preview_saved.txt'), String(saved||''), 'utf8'); }catch(e){ console.log('write saved failed', e && e.message); }
  // also emit logs to stdout for immediate debugging
  console.log('---PAGE-CONSOLE-START---');
  console.log(logs.join('\n'));
  console.log('---PAGE-CONSOLE-END---');
    // simple assertion
    if(!saved || saved.indexOf('미팅내용 1')===-1 || saved.indexOf('선생님: aa')===-1){
      console.error('ASSERT_FAILED');
      process.exitCode = 2;
    } else {
      console.log('ASSERT_OK');
      process.exitCode = 0;
    }
  }catch(e){
    logs.push('ERROR:'+ (e && e.message));
    fs.writeFileSync(path.join(outDir,'test_preview_console.log'), logs.join('\n'), 'utf8');
    console.error('ERROR', e && e.stack);
    process.exitCode = 3;
  } finally {
    try{ await browser.close(); }catch(e){}
  }
})();
