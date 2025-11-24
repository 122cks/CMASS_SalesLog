const { chromium } = require('playwright');

(async ()=>{
  const url = 'https://cmass-sales.web.app/input';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  // grant clipboard permissions
  try{ await context.grantPermissions(['clipboard-read','clipboard-write']); }catch(e){}
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  console.log('navigating to', url);
  try{
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  }catch(e){
    console.warn('initial navigation failed, retrying with relaxed options', e && e.message);
    try{ await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); }catch(er){ console.error('navigation failed twice', er && er.message); await browser.close(); process.exit(2); }
  }

  // helper to fetch mapping JSON from the hosted site
  const mapping = await page.evaluate(async ()=>{
    try{ const r = await fetch('/sales_staff_mapping.json', {cache:'no-store'}); if(!r.ok) return null; return await r.json(); }catch(e){ return null; }
  });
  if(!mapping){ console.error('Failed to load mapping'); await browser.close(); process.exit(2); }

  // pick first 5 schools by iterating regions
  const schools = [];
  for(const region of Object.keys(mapping)){
    const block = mapping[region] || {};
    for(const s of Object.keys(block)){
      schools.push({ region, school: s });
      if(schools.length>=5) break;
    }
    if(schools.length>=5) break;
  }

  console.log('picked schools:', schools.map(s=>s.school));

  // function to simulate filling meetings for a school (n meetings)
  async function fillSchool(schoolObj, meetingsCount){
    const { region, school } = schoolObj;
    console.log('FILL', region, school);
  // go to step1 (ensure visible) - guarded
  await page.evaluate(()=>{ try{ const s1 = document.getElementById('step1'); if(s1) s1.style.display='block'; const s2 = document.getElementById('step2'); if(s2) s2.style.display='none'; }catch(e){} });
    // set hidden inputs and visible labels
    await page.evaluate(({region, school})=>{
      try{
        try{ window.selectedRegion = region; }catch(e){}
        const rIn = document.getElementById('selectedRegionInput'); if(rIn) rIn.value = region;
        const sIn = document.getElementById('selectedSchoolInput'); if(sIn) sIn.value = school;
        // also update inline UI elements
        try{ const metaInline = document.getElementById('schoolMetaInline'); if (metaInline) metaInline.style.display = 'block'; }catch(e){}
        try{ const staff = document.getElementById('staffInfo'); if(staff) staff.textContent = '담당자: 자동테스트'; }catch(e){}
      }catch(e){ /* swallow */ }
    }, {region, school});

    // trigger change so applyMappingIfPresent runs
    await page.evaluate(()=>{ const sel = document.getElementById('selectedSchoolInput'); if(sel){ sel.dispatchEvent(new Event('input',{bubbles:true})); sel.dispatchEvent(new Event('change',{bubbles:true})); } });

    // ensure there are 'meetingsCount' subject-blocks and fill them programmatically (avoid clicking UI buttons)
    await page.evaluate((meetingsCount)=>{
      try{
        const subjectsContainer = document.getElementById('subjectsBlock');
        const tpl = document.getElementById('subject-template');
        if(!subjectsContainer) {
          // create a container if missing
          const container = document.createElement('div'); container.id = 'subjectsBlock'; document.body.appendChild(container);
        }
        // ensure we have the desired number of blocks
        while((document.querySelectorAll('.subject-block')||[]).length < meetingsCount){
          const container = document.getElementById('subjectsBlock');
          if(tpl && tpl.content){
            const proto = tpl.content.querySelector('.subject-block');
            if(proto){ container.appendChild(proto.cloneNode(true)); continue; }
          }
          const div = document.createElement('div'); div.className = 'subject-block'; div.innerHTML = '<div class="contact-section"><input class="contact-suffix"></div>'; document.getElementById('subjectsBlock').appendChild(div);
        }
        // fill last N blocks
        const blocks = Array.from(document.querySelectorAll('.subject-block'));
        for(let i=0;i<meetingsCount;i++){
          const b = blocks[i]; if(!b) continue;
          const suffix = b.querySelector('.contact-suffix'); if(suffix) suffix.value = String( Math.floor(10000000 + Math.random()*89999999) );
          const email = b.querySelector('.contact-email'); if(email) email.value = 'test+'+Date.now()+'_'+i+'@example.com';
          const fu = b.querySelector('.followUpSelect'); if(fu) fu.value = '완료 (추가 조치 없음)';
          // mark two meeting buttons as 'clicked' for UI state (toggle class)
          const mbtns = b.querySelectorAll('.meeting-btn');
          for(let j=0;j<Math.min(2, mbtns.length); j++){ try{ mbtns[j].classList.add('sim-clicked'); }catch(e){} }
        }
      }catch(e){ /* swallow */ }
    }, meetingsCount);

    // after filling, click the summary regenerate (clear) then click copy to generate+copy
    // try clicking summaryRegenerateBtn to force any generation logic to run
    try{ await page.click('#summaryRegenerateBtn'); }catch(e){}
    await page.waitForTimeout(200);
    // click copyKakaoBtn
    try{ await page.click('#copyKakaoBtn'); }catch(e){ console.warn('copy click failed', e); }
    // small wait for clipboard to populate or textarea to update
    await page.waitForTimeout(400);

    // try read clipboard
    let clipboardText = '';
    try{
      clipboardText = await page.evaluate(()=>navigator.clipboard.readText().catch(()=>''));
    }catch(e){ clipboardText = ''; }

    // fallback: read generatedSummary textarea
    if(!clipboardText || clipboardText.trim().length<10){
      try{ clipboardText = await page.$eval('#generatedSummary', el => el.value || el.textContent || ''); }catch(e){}
    }

    console.log('clipboard length', (clipboardText||'').length);
    return clipboardText;
  }

  // We'll keep an aggregated text from all schools
  let aggregated = '';
  for(const s of schools){
    const text = await fillSchool(s, 5); // 5 meetings per school
    aggregated += `--- ${s.region} / ${s.school} ---\n` + (text || '(no-summary)') + '\n\n';
    // small pause between schools
    await page.waitForTimeout(250);
  }

  console.log('DONE');
  console.log(aggregated);
  // print aggregated to stdout so run_in_terminal captures it
  await browser.close();
  // write to a local file for retrieval
  const fs = require('fs');
  fs.writeFileSync('C:\\Users\\PC\\AppData\\Local\\Temp\\cmass_headless_copied_summary.txt', aggregated, 'utf8');
  console.log('WROTE_FILE:C:\\Users\\PC\\AppData\\Local\\Temp\\cmass_headless_copied_summary.txt');
  process.exit(0);
})();
