
const fs = require('fs');
const puppeteer = require('puppeteer');

(async ()=>{
  const BASE = process.env.TEST_URL || 'https://cmass-sales.web.app/front?staff=SongHoonjae&debug=1';
  const out = { url: BASE, steps: [], ok: false, console: [], pageErrors: [], networkErrors: [], state: {} };
  try{
    out.steps.push('launch');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(60000);

    page.on('console', msg => {
      try{
        const text = typeof msg.text === 'function' ? msg.text() : String(msg);
        out.console.push(text);
      }catch(e){}
    });
    page.on('pageerror', err => { out.pageErrors.push(err && err.stack ? err.stack : String(err)); });
    page.on('requestfailed', req => { out.networkErrors.push({url: req.url(), err: req.failure() && req.failure().errorText}); });

    out.steps.push('goto ' + BASE);
    const resp = await page.goto(BASE, { waitUntil: 'networkidle2' });
    out.steps.push('response status: ' + (resp && resp.status()));

    // Wait for something meaningful to appear (dashboard, canvas, or table) up to 30s
    try{
      await page.waitForFunction(()=>{
        if (document.querySelector('#dashboardArea')) return true;
        if (document.querySelector('.notes-table')) return true;
        if (document.querySelector('canvas')) return true;
        const ld = document.getElementById('loading');
        if (ld && ld.innerText && ld.innerText.trim() !== '데이터를 불러오는 중...') return true;
        return false;
      }, { timeout: 30000 });
      out.steps.push('appearance detected');
    }catch(e){ out.steps.push('no appearance within 30s'); }

  // Give a short extra pause for scripts to finish
  await new Promise(r=>setTimeout(r, 800));

    // Evaluate page state
    const state = await page.evaluate(()=>{
      const s = {};
      try{ s.loadingText = document.getElementById('loading') ? document.getElementById('loading').innerText.trim() : null; }catch(e){ s.loadingText = 'ERR'; }
      try{ s.dashboardVisible = !!(document.getElementById('dashboardArea') && getComputedStyle(document.getElementById('dashboardArea')).display !== 'none'); }catch(e){ s.dashboardVisible = false; }
      try{ s.canvasCount = document.querySelectorAll('canvas').length; }catch(e){ s.canvasCount = 0; }
      try{ s.canvasIds = Array.from(document.querySelectorAll('canvas')).map(c=>c.id||c.getAttribute('data-chart-id')||''); }catch(e){ s.canvasIds = []; }
      try{
        let rows = 0;
        const t = document.querySelector('.notes-table');
        if (t){ const body = t.querySelector('tbody'); rows = body ? body.querySelectorAll('tr').length : t.querySelectorAll('tr').length; }
        s.tableRows = rows;
      }catch(e){ s.tableRows = 0; }

      try{ s.hasLoadPersonalVisits = typeof window.loadPersonalVisits === 'function'; }catch(e){ s.hasLoadPersonalVisits = false; }
      try{ s.hasRenderFromVisitEntries = typeof window.renderFromVisitEntries === 'function'; }catch(e){ s.hasRenderFromVisitEntries = false; }

      try{ s._visitsAccum_len = Array.isArray(window._visitsAccum) ? window._visitsAccum.length : (window._visitsAccum ? '?obj' : 0); }catch(e){ s._visitsAccum_len = 'ERR'; }
      try{ s._visitsNextCursor = window._visitsNextCursor || null; }catch(e){ s._visitsNextCursor = 'ERR'; }

      try{ s.staffLabel = document.getElementById('staffLabel') ? document.getElementById('staffLabel').innerText : null; }catch(e){ s.staffLabel = null; }

      // capture a small sample entry if present
      try{ s.sampleEntry0 = (Array.isArray(window._visitsAccum) && window._visitsAccum.length>0) ? window._visitsAccum[0] : null; }catch(e){ s.sampleEntry0 = null; }

      return s;
    });
    out.state = state;

    out.ok = true;
    await browser.close();
  }catch(err){ out.error = (err && err.stack) ? err.stack : String(err); }

  try{ fs.writeFileSync('tools/e2e_capture_result.json', JSON.stringify(out, null, 2)); }catch(e){}
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 2);
})();
