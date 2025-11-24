const { chromium } = require('playwright');
(async ()=>{
  const urls = [
    'https://cmass-sales.web.app/meeting',
    'https://cmass-sales.web.app/meeting.html',
    'https://cmass-sales.web.app/meeting/'
  ];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let loaded = false;
  for (const u of urls){
    try{
      console.log('Trying', u);
      await page.goto(u, { waitUntil: 'networkidle', timeout: 30000 });
      // wait a bit for any client-side bootstrapping
      await page.waitForTimeout(800);
      // require #staff to exist and be visible
      await page.waitForSelector('#staff', { timeout: 15000 });
      loaded = true;
      break;
    }catch(err){
      console.warn('Failed to load', u, err.message || err);
    }
  }
  if (!loaded) throw new Error('Could not load meeting page on any known URL');

  // clear any test draft
  await page.evaluate(()=>{ for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k && k.startsWith('meeting:draft:TEST')) localStorage.removeItem(k); } });

  // Use evaluate to set values directly (works even if inputs are not fully interactive)
  await page.evaluate(()=>{
    try{ const s = document.querySelector('#staff'); if(s){ s.value = 'TEST'; s.dispatchEvent(new Event('input',{bubbles:true})); } }catch(e){}
    try{ const d = document.querySelector('#visitDate'); if(d){ d.value = '2025-11-04'; d.dispatchEvent(new Event('change',{bubbles:true})); } }catch(e){}
  });
  // click first subject if present
  const subj = await page.$('#subjects .subject-btn'); if(subj) await subj.click();
  await page.evaluate(()=>{
    try{ const t = document.querySelector('#teacherName'); if(t){ t.value = '메인선생'; t.dispatchEvent(new Event('input',{bubbles:true})); } }catch(e){}
    try{ const r = document.querySelector('#requests'); if(r){ r.value = '요청사항 메인'; r.dispatchEvent(new Event('input',{bubbles:true})); } }catch(e){}
    try{ const n = document.querySelector('#notes'); if(n){ n.value = '특이사항 메인'; n.dispatchEvent(new Event('input',{bubbles:true})); } }catch(e){}
  });

  // add entry
  const addBtn = await page.$('#addEntryBtn');
  if (addBtn) {
    await addBtn.click();
    await page.waitForSelector('#entriesContainer .entry');
    const entry = await page.$('#entriesContainer .entry');
      if (entry) {
        await page.evaluate(()=>{
          try{ const el = document.querySelector('#entriesContainer .entry'); if (!el) return;
            const t = el.querySelector('.entry-teacher'); if(t) { t.value = '추가선생'; t.dispatchEvent(new Event('input',{bubbles:true})); }
            const q = el.querySelector('.entry-requests'); if(q) { q.value = '요청사항 추가'; q.dispatchEvent(new Event('input',{bubbles:true})); }
          }catch(e){}
        });
      }
  }

  // wait for autosave
  await page.waitForTimeout(2500);

  const drafts = await page.evaluate(()=>{
    const out = {};
    for(let i=0;i<localStorage.length;i++){ const k = localStorage.key(i); if(k && k.startsWith('meeting:draft:')){ try{ out[k]=JSON.parse(localStorage.getItem(k)); }catch(e){ out[k]=localStorage.getItem(k); } } }
    return out;
  });

  console.log('Found', Object.keys(drafts).length, 'draft keys');
  for(const k of Object.keys(drafts)){
    console.log('---', k, '---');
    console.log(JSON.stringify(drafts[k], null, 2));
  }

  await browser.close();
})();
