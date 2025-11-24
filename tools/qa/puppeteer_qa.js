const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

(async ()=>{
  const outDir = path.resolve(__dirname, '../../automation_output');
  if(!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const consoleLogs = [];
  const networkFailures = [];
  try{
  // prefer a bundled chrome under tools/qa/chrome but fall back to common system installs
  let chromePath = path.resolve(__dirname, 'chrome', 'chrome-win', 'chrome.exe');
  const tryPaths = [
    chromePath,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  ];
  chromePath = tryPaths.find(p => { try{ return fs.existsSync(p); }catch(e){ return false; } }) || chromePath;
  console.log('using chrome executable at', chromePath);
  // If running against a file:// URL, enable file access flags to allow localStorage
  const extraArgs = ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'];
  if ((process.env.QA_BASE || '').startsWith('file://')){
    extraArgs.push('--allow-file-access-from-files', '--disable-web-security');
  }
  const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: extraArgs });
    const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  // helper fallback in case Puppeteer version doesn't expose page.waitForTimeout
  const wait = ms => new Promise(r => setTimeout(r, ms));
    page.on('console', msg => {
      try{ const text = msg.text(); consoleLogs.push(text); }catch(e){}
    });
    // capture failed network requests and non-OK responses for diagnostics
    page.on('requestfailed', req => {
      try{
        networkFailures.push({
          type: 'requestfailed',
          url: req.url(),
          method: req.method(),
          failure: (req.failure && req.failure().errorText) || null,
          timestamp: Date.now()
        });
      }catch(e){}
    });
    page.on('response', async res => {
      try{
        const st = res.status();
        if (st >= 400) {
          const req = res.request();
          let body = null;
          try{ body = await res.text().catch(()=>null); }catch(e){}
          networkFailures.push({
            type: 'response_error',
            url: res.url(),
            status: st,
            method: req.method(),
            resourceType: req.resourceType && req.resourceType(),
            textSnippet: body ? (body.slice(0,800)) : null,
            timestamp: Date.now()
          });
        }
      }catch(e){}
    });

  // allow overrides from environment for flexible QA runs
  const staff = process.env.QA_STAFF || '송훈재 부장';
  const date = process.env.QA_DATE || '2025-11-05';
  const region = process.env.QA_REGION || '인천광역시서구';
  const school = process.env.QA_SCHOOL || '문곡고등학교';
    const base = process.env.QA_BASE || 'https://cmass-sales.web.app/meeting.html';
    const url = base + '?staff=' + encodeURIComponent(staff) + '&date=' + encodeURIComponent(date) + '&region=' + encodeURIComponent(region) + '&school=' + encodeURIComponent(school);
    console.log('navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle2' });

    // wait for sessions container
    await page.waitForSelector('#sessionContainer', { timeout: 10000 });
    // expand first session if details present
    const details = await page.$('details.meeting-session-wrap');
    if(details){
      try{ const summary = await details.$('summary'); if(summary) await summary.click(); }catch(e){}
    }
  // small wait
  if(typeof page.waitForTimeout === 'function') await page.waitForTimeout(500); else await wait(500);

    // interact with first session panel
    const panel = await page.$('details.meeting-session-wrap .meeting-session, #sessionContainer .meeting-session');
    if(!panel){
      consoleLogs.push('NO_PANEL_FOUND');
    } else {
      // click first subject (single-select)
      const subj = await panel.$('.session-subjects .subject-btn');
      if(subj) await subj.click();
      // click several activities
      const acts = await panel.$$('.session-activities .subject-btn');
      if(acts && acts.length){
        for(let i=0;i<Math.min(3, acts.length); i++){
          await acts[i].click();
        }
      }
      // click favor (좋음)
      const favors = await panel.$$('.session-favor .favor-btn');
      if(favors && favors.length) await favors[0].click();

      // fill inputs
      const setIf = async (sel, val) => { try{ const el = await panel.$(sel); if(el){ await el.focus(); await el.click({clickCount:3}); await el.type(val); } }catch(e){} };
      await setIf('.session-teacher', 'aa');
      await setIf('.session-publisher', '미래엔');
      await setIf('.session-phone', '010-0000-0000');
      await setIf('.session-email', 'a@a.com');
      await setIf('.session-requests', 'aa');
      await setIf('.session-notes', 'aa');
      await setIf('.session-deliveries', 'aa');
      await setIf('.session-followup', '완료(추가조치 없음)');

  // small wait for autosave
  if(typeof page.waitForTimeout === 'function') await page.waitForTimeout(800); else await wait(800);

      // call saveDraft() if available (defensive) then click 입력완료 to trigger submit -> report.html
      try{
        await page.evaluate(()=>{ try{ if(typeof saveDraft === 'function') saveDraft(); }catch(e){} });
      }catch(e){}

      // ASSERT: saved-draft shows expanded multi-line session details (미팅내용 1:, 과목: etc.)
      try{
        const draftText = await page.evaluate(()=>{ const el = document.getElementById('savedDraft'); return el ? el.textContent : ''; });
        consoleLogs.push('[QA] savedDraft preview: ' + (draftText || '').slice(0,800).replace(/\n/g,'\\n'));
        // basic checks for presence of our new multi-line markers
        if(!draftText) {
          try{ fs.writeFileSync(path.join(outDir,'draft_text.txt'), String(draftText || ''), 'utf8'); }catch(e){}
          try{ fs.writeFileSync(path.join(outDir,'meeting_console.log'), consoleLogs.join('\n'), 'utf8'); }catch(e){}
          throw new Error('DRAFT_ASSERT_NO_TEXT');
        }
        // If DOM assertion mode is enabled, run stronger assertions
        const verifyDom = !!(process.env.QA_VERIFY_DOM && String(process.env.QA_VERIFY_DOM) !== '0');
        const requiredMarkers = ['미팅내용 1:', '과목:', '선생님: aa', '출판사: 미래엔', '우호도: 좋음'];
        if (verifyDom){
          // In DOM-assertion mode, prefer invoking the page-exposed builder to
          // generate the expected preview and compare exact text/markers.
          try{
            const expectedObj = {
              staff: (process.env.QA_STAFF||'송훈재 부장'),
              date: (process.env.QA_DATE||'2025-09-29'),
              region: (process.env.QA_REGION||''),
              school: (process.env.QA_SCHOOL||''),
              visitStart: '08:00', durationMin: 60,
              subjects: ['정보'], activities: ['활동A'], favor: '좋음', teacher: 'aa', publisher: '미래엔', requests: 'aa', notes: 'aa', deliveries: 'aa', followUp: '완료(추가조치 없음)',
              sessions: [{ subjects: ['정보'], activities: ['활동A'], favor: '좋음', teacher: 'aa', publisher: '미래엔', requests: 'aa', notes: 'aa', deliveries: 'aa', followUp: '완료(추가조치 없음)'}]
            };
            // ask the page to build the preview text using its own helper
            const res = await page.evaluate((exp)=>{
              try{
                if(window.buildDraftPreviewText) return { expected: window.buildDraftPreviewText(exp), actual: (document.getElementById('savedDraft') ? document.getElementById('savedDraft').textContent : '') };
                return { expected: null, actual: (document.getElementById('savedDraft') ? document.getElementById('savedDraft').textContent : '') };
              }catch(e){ return { expected: null, actual: (document.getElementById('savedDraft') ? document.getElementById('savedDraft').textContent : '') } }
            }, expectedObj);
            const missing = [];
            if(!res || !res.expected) missing.push('EXPECTED_BUILD_FAILED');
            else {
              // simple inclusion checks for key markers to be tolerant of whitespace/format
              requiredMarkers.forEach(m => { if(!res.actual || res.actual.indexOf(m) === -1) missing.push(m); });
            }
          }catch(e){ const missing = requiredMarkers.slice(0); }
          // end DOM-assertion block
          const missing = [];
          // Note: fallback below will still run if we failed to fill `missing` above
          
          // If missing was computed above, keep it; else recompute basic marker check
          if(missing.length === 0){
            requiredMarkers.forEach(m => { if(draftText.indexOf(m) === -1) missing.push(m); });
          }
          if (missing.length){
            try{ fs.writeFileSync(path.join(outDir,'draft_text.txt'), String(draftText || ''), 'utf8'); }catch(e){}
            try{ fs.writeFileSync(path.join(outDir,'meeting_console.log'), consoleLogs.join('\n'), 'utf8'); }catch(e){}
            throw new Error('DRAFT_ASSERT_FAILED_MISSING:'+missing.join('|'));
          }
          consoleLogs.push('DRAFT_ASSERT_OK');
        } else {
          // fallback: ensure basic markers exist
          if(draftText.indexOf('미팅내용 1:') === -1 || draftText.indexOf('과목:') === -1){
            try{ fs.writeFileSync(path.join(outDir,'draft_text.txt'), String(draftText || ''), 'utf8'); }catch(e){}
            try{ fs.writeFileSync(path.join(outDir,'meeting_console.log'), consoleLogs.join('\n'), 'utf8'); }catch(e){}
            throw new Error('DRAFT_ASSERT_BASIC_FAILED');
          }
          consoleLogs.push('DRAFT_ASSERT_OK');
        }
      }catch(e){
        consoleLogs.push('DRAFT_ASSERT_ERROR: ' + (e && e.message));
        throw e;
      }

      // Click the submit button (입력완료) to append to report and navigate
      try{
        const submitBtn = await page.$('#btnSubmit');
        if(submitBtn){
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(()=>{}),
            submitBtn.click()
          ]);
        }
      }catch(e){ /* continue even if navigation fails */ }

      // now we're expected to be on report.html; capture localStorage snapshot keys of interest
      const ls = await page.evaluate(()=>{
        const out = {};
        for(let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if(!k) continue;
          if(k.indexOf('meeting:draft:')===0 || k.indexOf('report:')===0 || k==='meeting:edit' || k.indexOf('meeting:lastSavedReport')===0){
            try{ out[k] = JSON.parse(localStorage.getItem(k)); }catch(e){ out[k] = localStorage.getItem(k); }
          }
        }
        return out;
      });
      fs.writeFileSync(path.join(outDir,'meeting_localstorage.json'), JSON.stringify(ls, null, 2), 'utf8');

      // screenshot current page (should be report.html)
      await page.screenshot({ path: path.join(outDir,'report_page_screenshot.png'), fullPage: true });

    }

    // write console logs
    fs.writeFileSync(path.join(outDir,'meeting_console.log'), consoleLogs.join('\n'), 'utf8');
  // write network failures
  try{ fs.writeFileSync(path.join(outDir,'network_failures.json'), JSON.stringify(networkFailures, null, 2), 'utf8'); }catch(e){}

    await browser.close();
    console.log('done');
  }catch(err){
    console.error('qa-run-failed', err && err.message);
    fs.writeFileSync(path.resolve(__dirname, '../../automation_output/meeting_console.log'), 'ERROR: '+(err && err.message)+'\n'+(err && err.stack||''));
    process.exitCode = 2;
  }
})();
