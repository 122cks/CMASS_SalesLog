const puppeteer = require('puppeteer');

(async function(){
  try{
    const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox','--disable-setuid-sandbox']});
    const page = await browser.newPage();
    const consoleMessages = [];

    page.on('console', msg => {
      try{
        const loc = msg.location ? msg.location() : {};
        consoleMessages.push({type: msg.type(), text: msg.text(), location: loc});
      }catch(e){ consoleMessages.push({type: 'console', text: String(msg)}); }
    });
  page.on('pageerror', err => { consoleMessages.push({type: 'pageerror', message: err && err.message, stack: err && err.stack}); });

    const url = 'https://cmass-sales.web.app/report';
    console.log('navigating to', url);
    // Install early error collector to capture errors that happen during parsing/execution
    await page.evaluateOnNewDocument(() => {
      try{
        window.__cmass_errors = [];
        window.addEventListener('error', function(e){
          try{ window.__cmass_errors.push({message: e && e.message, filename: e && e.filename, lineno: e && e.lineno, colno: e && e.colno, stack: (e && e.error && e.error.stack) || null}); }catch(_){ }
        });
        window.addEventListener('unhandledrejection', function(e){ try{ window.__cmass_errors.push({type: 'unhandledrejection', reason: (e && e.reason && e.reason.stack) || e.reason}); }catch(_){ } });
      }catch(_){ }
    });

    const resp = await page.goto(url, {waitUntil: 'networkidle2', timeout: 45000});
    console.log('http status', resp && resp.status());

  // wait a little for inline scripts that run after load
  await new Promise(r => setTimeout(r, 2000));

    const defined = await page.evaluate(()=>{
      return {
        _reRenderUI: typeof window._reRenderUI === 'function',
        loadLocalReports: typeof window.loadLocalReports === 'function',
        uploadSelected: typeof window.uploadSelected === 'function',
        computeMetrics: typeof window.computeMetrics === 'function',
        renderEntries: typeof window.renderEntries === 'function',
        mapEntryToServerPayload: typeof window.mapEntryToServerPayload === 'function'
      };
    });

      const collectedErrors = await page.evaluate(()=>{ try{ return window.__cmass_errors || []; }catch(e){ return []; } });

    // Grab console messages (dedupe similar entries)
  console.log('--- SMOKE TEST RESULT START ---');
  console.log(JSON.stringify({defined, consoleMessages, collectedErrors}, null, 2));
    console.log('--- SMOKE TEST RESULT END ---');

    await browser.close();
    process.exit(0);
  }catch(e){
    console.error('SMOKE TEST ERROR', e && e.stack || e);
    process.exit(2);
  }
})();
