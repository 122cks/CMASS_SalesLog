const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const BASE = process.env.QA_BASE || 'http://localhost:8765';
const OUTPUT_DIR = path.resolve(__dirname, 'artifacts');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const scenarios = [
  {
    id: 'exact-match-local',
    desc: 'All four fields present and a matching local draft exists => modal expected',
    ui: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
    localDraftFor: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
  },
  {
    id: 'missing-school-ui',
    desc: 'UI has empty school but a local draft exists for the full key => should NOT prompt',
    ui: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '' },
    // local draft exists for full key (school present) so mismatch should prevent modal
    localDraftFor: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
  },
  {
    id: 'different-staff-ui',
    desc: 'UI staff differs from local draft staff => should NOT prompt',
    ui: { staff: '임준호 차장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
    localDraftFor: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
  },
  {
    id: 'different-region-in-draft',
    desc: 'UI region differs from draft => should NOT prompt',
    ui: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
    localDraftFor: { staff: '송훈재 부장', date: '2025-11-05', region: '서울특별시', school: '가평고등학교' },
  },
  {
    id: 'no-local-draft',
    desc: 'No local draft present but UI fully filled => should NOT show ask-restore modal',
    ui: { staff: '송훈재 부장', date: '2025-11-05', region: '경기도가평군', school: '가평고등학교' },
    localDraftFor: null,
  }
];

function makeKey({ staff, date, region, school }){
  const s = (staff||'').trim();
  const d = (date||'').trim();
  const r = (region||'').trim();
  const sc = (school||'').trim();
  return `meeting:draft:${s}|${d}|${r}|${sc}`;
}

async function runScenario(browser, scen){
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(20000);
  const origin = BASE.replace(/\\/g,'');

  // Navigate to origin so we can set localStorage for that origin
  await page.goto(origin, { waitUntil: 'domcontentloaded' }).catch(()=>{});

  // Clear localStorage to avoid interference
  await page.evaluate(() => localStorage.clear());

  // If scenario requests a local draft, set it
  if (scen.localDraftFor) {
    const key = makeKey(scen.localDraftFor);
    const draftObj = Object.assign({}, scen.localDraftFor, { _savedAt: new Date().toISOString(), teacher: '테스트선생' });
    await page.evaluate(({k,d})=>{ localStorage.setItem(k, JSON.stringify(d)); }, { k: key, d: draftObj });
  }

  // Build meeting URL with UI params
  const params = new URLSearchParams();
  Object.entries(scen.ui).forEach(([k,v])=>{ if (v !== undefined && v !== null && String(v) !== '') params.set(k, v); });
  const url = origin.replace(/\/$/, '') + '/meeting' + (params.toString() ? ('?' + params.toString()) : '');

  // Go to meeting page
  await page.goto(url, { waitUntil: 'networkidle2' }).catch(()=>{});

  // Wait some time for JS to run and possibly show modal
  await page.waitForTimeout(1000);

  // Detect ask-restore modal
  const modalPresent = await page.evaluate(() => { try{ return !!document.getElementById('cmass-ask-restore'); }catch(e){ return false; } });

  // additionally check draft-picker
  const pickerPresent = await page.evaluate(() => { try{ return !!document.getElementById('cmass-draft-picker'); }catch(e){ return false; } });

  await page.close();
  return { id: scen.id, desc: scen.desc, modalPresent, pickerPresent, url };
}

(async ()=>{
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
  const results = [];
  for (const s of scenarios){
    try{
      const r = await runScenario(browser, s);
      console.log(JSON.stringify(r));
      results.push(r);
    }catch(e){
      console.error('scenario failed', s.id, e && e.message);
      results.push({ id: s.id, desc: s.desc, error: (e && e.message) || String(e) });
    }
  }
  await browser.close();
  const outPath = path.join(OUTPUT_DIR, 'modal_check.json');
  fs.writeFileSync(outPath, JSON.stringify({ base: BASE, timestamp: new Date().toISOString(), results }, null, 2), 'utf8');
  console.log('WROTE:', outPath);
})();
