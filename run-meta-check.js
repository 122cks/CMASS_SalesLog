const { chromium } = require('playwright');
(async ()=>{
  const url = 'https://cmass-sales.web.app/input?user=Songhoonjae';
  const browser = await chromium.launch({ headless: false, slowMo: 60 });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', msg => console.log('PAGE:', msg.type(), msg.text()));
  try{
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000, referer: 'https://cmass-sales.web.app/' });
    await page.waitForTimeout(3000);
  // Wait until staff data loaded (tolerant: don't fail the whole script if this times out)
  try {
    await page.waitForFunction(()=> (window._cmass_staffData && window._cmass_staffData.length>0), { timeout: 60000 });
  } catch(e) {
    console.warn('staffData wait timed out, proceeding anyway — script will attempt UI clicks');
  }
    // select region by text match
    const regionName = '경기도과천시';
    const schoolName = '과천고등학교';
    // Find region button whose text contains regionName
    const regionButtons = await page.$$('#regionButtons .grid-button');
    let foundRegion=false;
    for (const b of regionButtons){
      const txt = (await b.innerText()).trim();
      if (txt.indexOf(regionName) !== -1){ await b.click(); foundRegion=true; break; }
    }
    if (!foundRegion) console.log('Region not found in UI');
    await page.waitForTimeout(600);
    // find school button
    const schoolButtons = await page.$$('#schoolButtons .grid-button');
    let foundSchool=false;
    for (const b of schoolButtons){
      const txt = (await b.innerText()).trim();
      if (txt.indexOf(schoolName) !== -1){ await b.click(); foundSchool=true; break; }
    }
    if (!foundSchool) console.log('School not found in UI');
    // wait a bit
    await page.waitForTimeout(800);
    // Read the last found meta and DOM values
    const diag = await page.evaluate(()=>{
      const meta = window._cmass_lastFoundMeta || null;
      const metaG1c = document.getElementById('metaG1c') ? document.getElementById('metaG1c').textContent : null;
      const metaG1s = document.getElementById('metaG1s') ? document.getElementById('metaG1s').textContent : null;
      const inlineG1c = document.getElementById('inlineG1c') ? document.getElementById('inlineG1c').textContent : null;
      const inlineG1s = document.getElementById('inlineG1s') ? document.getElementById('inlineG1s').textContent : null;
      return { meta, metaG1c, metaG1s, inlineG1c, inlineG1s };
    });
      // additional diagnostics: capture selected inputs and possible staffData matches
      const verbose = await page.evaluate(()=>{
        const staffParam = window._cmass_staffParam || '';
        const selRegion = (document.getElementById('selectedRegionInput')||{}).value || '';
        const selSchool = (document.getElementById('selectedSchoolInput')||{}).value || '';
        const sd = (window._cmass_staffData||[]);
        const matchesBySchool = sd.filter(r=> (r.school||'').toString().trim().toLowerCase().indexOf((selSchool||'').toString().trim().toLowerCase()) !== -1 ).slice(0,8);
        const matchesByStaff = sd.filter(r=> (r.staff||'').toString().trim().toLowerCase() === (staffParam||'').toString().trim().toLowerCase()).slice(0,8);
        return { staffParam, selRegion, selSchool, staffDataLen: sd.length, matchesBySchool, matchesByStaff };
      });
    console.log('DIAG RESULT:', JSON.stringify(diag, null, 2));
      console.log('VERBOSE:', JSON.stringify(verbose, null, 2));
    await page.waitForTimeout(5000);
  }catch(err){ console.error('Error', err); }
  finally{ try{ await browser.close(); }catch(e){} }
})();
