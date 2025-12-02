#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function parseCsvText(text){
  const lines = (text||'').replace(/\uFEFF/g,'').split(/\r?\n/).filter(l=>l.trim());
  if (!lines.length) return [];
  const rows = lines.map(l=>{
    const cols = [];
    let cur = '';
    let inQ = false;
    for (let i=0;i<l.length;i++){ const ch = l[i]; if (ch === '"'){ if (inQ && l[i+1] === '"'){ cur += '"'; i++; } else inQ = !inQ; continue; } if (ch === ',' && !inQ){ cols.push(cur); cur=''; continue; } cur += ch; } cols.push(cur); return cols.map(c=>c.trim());
  });
  return rows;
}

function normalizeSchoolKey(s){
  try{
    let t = (s||'').toString().toLowerCase();
    t = t.replace(/\s+/g,'');
    t = t.replace(/(남|여|여자|남자)(?=(?:고|중))/g,'');
    t = t.replace(/학교|중학교|고등학교/g,'');
    t = t.replace(/[^0-9a-z\u3131-\uD79D]/g,'');
    return t;
  }catch(e){ return (s||'').toString().toLowerCase(); }
}

function buildMapsFromCsv(rows){
  if (!rows || rows.length < 2) return { exactMap: new Map(), normBuckets: new Map() };
  const header = rows[0].map(h=>h.trim());
  const idxSchool = header.findIndex(h=> /^(school|학교|학교명)$/i.test(h));
  const idxRegion = header.findIndex(h=> /^(region|지역|시도|시군구)$/i.test(h));
  const idxScode = header.findIndex(h=> /^(scode|학교코드|정보공시학교코드|s[_-]?code)$/i.test(h));
  const exactMap = new Map();
  const normBuckets = new Map();
  for (let i=1;i<rows.length;i++){
    const r = rows[i];
    const school = (idxSchool !== -1 ? (r[idxSchool]||'') : (r[0]||'')).trim();
    const region = (idxRegion !== -1 ? (r[idxRegion]||'') : '').trim();
    const scode = (idxScode !== -1 ? (r[idxScode]||'') : '').trim();
    if (!school || !scode) continue;
    exactMap.set((region||'').toLowerCase() + '|' + school.toLowerCase(), scode);
    const nk = normalizeSchoolKey(school);
    if (!nk) continue;
    const arr = normBuckets.get(nk) || [];
    arr.push({ scode, region: (region||'').toLowerCase() });
    normBuckets.set(nk, arr);
  }
  return { exactMap, normBuckets };
}

function resolveScodeForRow(school, region, exactMap, normBuckets){
  if (!school) return '';
  const regL = (region||'').toLowerCase();
  const schL = (school||'').toLowerCase();
  const direct = exactMap.get(regL+'|'+schL);
  if (direct) return direct;
  const nk = normalizeSchoolKey(school);
  const bucket = normBuckets.get(nk) || [];
  if (!bucket.length) return '';
  if (bucket.length === 1) return bucket[0].scode;
  const regionMatched = bucket.filter(b=> b.region === regL);
  if (regionMatched.length === 1) return regionMatched[0].scode;
  const uniqueSet = new Set(bucket.map(b=>b.scode));
  if (uniqueSet.size === 1) return bucket[0].scode;
  return '';
}

async function main(){
  const csvPath = path.join(__dirname, '..', 'public', 'sales_staff.csv');
  let csvText = '';
  try{ csvText = fs.readFileSync(csvPath, 'utf8'); }catch(e){ console.error('CSV load failed', e.message); process.exit(2); }
  const rows = parseCsvText(csvText);
  const { exactMap, normBuckets } = buildMapsFromCsv(rows);

  try{
    if (!admin.apps.length){
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
    }
  }catch(e){ console.error('firebase init failed', e.message); process.exit(3); }
  const db = admin.firestore();

  console.log('[backfill] scanning visit_entries...');
  const snapshot = await db.collection('visit_entries').get();
  console.log('[backfill] docs found:', snapshot.size);

  let updated = 0, skipped = 0, unresolved = 0;
  for (const doc of snapshot.docs){
    const data = doc.data() || {};
    if (data['s-code']){ skipped++; continue; }
    const region = data.region || data.city || data['시도'] || '';
    const school = data.school || data.school_name || data['학교명'] || data.name || '';
    const scode = resolveScodeForRow(school, region, exactMap, normBuckets);
    if (!scode){ unresolved++; continue; }
    try{
      await db.collection('visit_entries').doc(doc.id).set({ 's-code': scode }, { merge: true });
      updated++;
    }catch(e){ console.error('update failed for', doc.id, e.message); }
  }

  console.log('[backfill] done: total=', snapshot.size, 'updated=', updated, 'skipped(existing s-code)=', skipped, 'unresolved=', unresolved);
}

main().catch(e=>{ console.error(e); process.exit(9); });
