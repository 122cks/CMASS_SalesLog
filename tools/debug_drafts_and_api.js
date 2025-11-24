const puppeteer = require('puppeteer');
(async ()=>{
  try{
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
    const browser = await puppeteer.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);
    await page.goto(url, { waitUntil: 'networkidle2', referer: 'https://cmass-sales.web.app/' });

    // set date to 2025-10-23
    const date = '2025-10-23';
    await page.evaluate((d)=>{ const el = document.getElementById('visitDate'); if (el) el.value = d; }, date);
    // trigger change
    await page.evaluate(()=>{ const vd = document.getElementById('visitDate'); if (vd) vd.dispatchEvent(new Event('change')); });
    await new Promise(r=>setTimeout(r, 800));

    // collect localStorage keys starting with cmass_draft_
    const drafts = await page.evaluate(()=>{
      const out = {};
      try{
        for (let i=0;i<localStorage.length;i++){
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.indexOf('cmass_draft_') === 0 || k.indexOf('cmass_summary_') === 0){
            try{ out[k] = JSON.parse(localStorage.getItem(k)); }catch(e){ out[k] = localStorage.getItem(k); }
          }
        }
      }catch(e){ out.__err = String(e); }
      return out;
    });

    // collect dayVisits and generatedSummary and selected region/school
    const pageState = await page.evaluate(()=>{
      try{
        return {
          dayVisits: (typeof dayVisits !== 'undefined') ? dayVisits.slice(0,200) : null,
          generatedSummary: (document.getElementById('generatedSummary')||{}).value || null,
          selectedRegion: (document.getElementById('selectedRegionInput')||{}).value || null,
          selectedSchool: (document.getElementById('selectedSchoolInput')||{}).value || null,
          visitDate: (document.getElementById('visitDate')||{}).value || null,
          staff: (getStaffFromQuery && getStaffFromQuery()) ? getStaffFromQuery() : null
        };
      }catch(e){ return {__err:String(e)}; }
    });

    // fetch server API for entries and aggregated docs
    const serverData = await page.evaluate(async (staff, dateStr)=>{
      try{
        const results = {};
        const paramsE = new URLSearchParams();
        if (staff) paramsE.set('staff', staff);
        paramsE.set('start', dateStr);
        paramsE.set('end', dateStr);
        paramsE.set('useEntries', 'true');
        const urlE = '/api/visits?' + paramsE.toString();
        const respE = await fetch(urlE, { cache: 'no-store' });
        results.entries = respE.ok ? await respE.json() : { ok:false, status: respE.status };

        const params = new URLSearchParams();
        if (staff) params.set('staff', staff);
        params.set('start', dateStr);
        params.set('end', dateStr);
        const url = '/api/visits?' + params.toString();
        const resp = await fetch(url, { cache: 'no-store' });
        results.aggregated = resp.ok ? await resp.json() : { ok:false, status: resp.status };
        return results;
      }catch(e){ return { __err: String(e) }; }
    }, pageState.staff, date);

    await browser.close();

    const out = { date, draftsCount: Object.keys(drafts).length, drafts, pageState, serverData };
    console.log(JSON.stringify(out, null, 2));
  }catch(err){ console.error('ERROR', String(err)); process.exit(2); }
})();

