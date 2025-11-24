const fs = require('fs');
const puppeteer = require('puppeteer');

(async ()=>{
  const BASE = process.env.TEST_URL || 'https://cmass-sales.web.app/front?staff=SongHoonjae&debug=1';
  const out = { url: BASE, steps: [], ok: false, canvases: 0, canvasIds: [], tableRows: 0, dashboardVisible: false };
  try{
    out.steps.push('launch');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    page.on('console', msg => { try{ out.steps.push('[console] ' + msg.text()); }catch(e){} });

    out.steps.push('goto ' + BASE);
    const resp = await page.goto(BASE, { waitUntil: 'networkidle2' });
    out.steps.push('response status: ' + (resp && resp.status()));

    // Wait up to 20s for dashboardArea, or canvas, or notes table to appear
    try{
      await page.waitForFunction(()=>{
        if (document.querySelector('#dashboardArea')) return true;
        if (document.querySelector('.notes-table')) return true;
        if (document.querySelector('canvas')) return true;
        return false;
      }, { timeout: 20000 });
      out.steps.push('appearance detected: dashboard/table/canvas');
    }catch(e){ out.steps.push('no dashboard/table/canvas within timeout'); }

    // collect canvases and ids
    try{
      const canvases = await page.$$eval('canvas', nodes => nodes.map(n=>n.id||n.getAttribute('data-chart-id')||'') );
      out.canvases = canvases.length;
      out.canvasIds = canvases;
      out.steps.push('found canvases: ' + canvases.join(', '));
    }catch(e){ out.steps.push('canvas eval failed: ' + (e && e.message)); }

    // detect table rows
    try{
      const rows = await page.evaluate(()=>{
        // try common selectors
        const selCandidates = ['.notes-table tbody tr', '.notes-table tr', '#schoolVisitsTableContainer table tbody tr', '#schoolVisitsTableContainer table tr'];
        for (let s of selCandidates){
          const nodes = Array.from(document.querySelectorAll(s));
          if (nodes && nodes.length) return nodes.length;
        }
        // fallback: look for any table inside the container
        const t = document.querySelector('#schoolVisitsTableContainer');
        if (t && t.querySelectorAll('tr').length) return t.querySelectorAll('tr').length;
        return 0;
      });
      out.tableRows = rows;
      out.steps.push('table rows: ' + rows);
    }catch(e){ out.steps.push('table eval failed: ' + (e && e.message)); }

    // dashboard visible flag
    try{
      out.dashboardVisible = await page.$eval('#dashboardArea', el => (el && (getComputedStyle(el).display !== 'none')) ).catch(()=>false);
      out.steps.push('#dashboardArea visible: ' + out.dashboardVisible);
    }catch(e){ out.steps.push('#dashboardArea eval failed'); }

    out.ok = true;
    await browser.close();
  }catch(err){ out.error = (err && err.stack) ? err.stack : String(err); }

  try{ fs.writeFileSync('tools/e2e_charts_result.json', JSON.stringify(out, null, 2)); }catch(e){}
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 2);
})();
