#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { csv: path.join(__dirname, '..', 'public', 'sales_staff.csv') };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--doc' || a[i] === '-d') out.doc = a[++i];
    else if (a[i] === '--region' || a[i] === '-r') out.region = a[++i];
    else if (a[i] === '--school' || a[i] === '-s') out.school = a[++i];
    else if (a[i] === '--csv') out.csv = a[++i];
  }
  return out;
}

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

async function main(){
  const args = parseArgs();
  if (!args.doc || !args.school) {
    console.error('Usage: node set_scode_for_doc.js --doc <server_id> --school "..." --region "..." [--csv path]');
    process.exit(1);
  }

  // load CSV
  let csvText = '';
  try{ csvText = fs.readFileSync(path.resolve(args.csv), 'utf8'); }catch(e){ console.error('CSV load failed', e.message); process.exit(2); }
  const rows = parseCsvText(csvText);
  if (!rows || rows.length < 2){ console.error('CSV parse failed or empty'); process.exit(3); }
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

  function resolveScode(school, region){
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

  const scode = resolveScode(args.school, args.region || '');
  console.log('resolved scode ->', scode || '(none)');
  if (!scode){ console.error('Could not resolve s-code for given region+school'); process.exit(4); }

  // initialize firebase-admin
  try{
    if (!admin.apps.length){
      const cred = admin.credential.applicationDefault();
      admin.initializeApp({ credential: cred, projectId: 'cmass-sales' });
    }
  }catch(e){ console.error('firebase init failed', e.message); process.exit(5); }
  const db = admin.firestore();

  try{
    await db.collection('visit_entries').doc(String(args.doc)).set({ 's-code': scode }, { merge: true });
    console.log('Updated doc', args.doc, 'with s-code', scode);
    process.exit(0);
  }catch(e){ console.error('update failed', e); process.exit(6); }
}

main();
