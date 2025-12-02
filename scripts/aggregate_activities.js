const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Default service account path (user-provided)
const defaultKey = 'C:\\Users\\PC\\OneDrive\\cmass-sales-system\\CMASS_SalesLog\\public\\cmass-sales-8b9a9d55138f.json';
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultKey;

function initFirebase(){
  try{
    const key = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(key) });
    return true;
  }catch(e){
    console.error('Failed to init firebase-admin with', keyPath, e.message);
    return false;
  }
}

function normalizeEntry(v){
  if(v === null || v === undefined) return '';
  if(typeof v === 'string') return v.trim();
  if(typeof v === 'number') return String(v);
  if(Array.isArray(v)) return v.map(x=> normalizeEntry(x)).filter(Boolean);
  if(typeof v === 'object'){
    // try common label/name keys
    if(v.label) return String(v.label).trim();
    if(v.name) return String(v.name).trim();
    if(v.title) return String(v.title).trim();
    return JSON.stringify(v);
  }
  return String(v);
}

async function main(){
  if(!initFirebase()) process.exit(2);
  const db = admin.firestore();
  const col = db.collection('visit_entries');
  console.log('Fetching documents from visit_entries...');
  const snap = await col.get();
  console.log('Documents fetched:', snap.size);

  const counts = new Map();

  snap.forEach(doc=>{
    const d = doc.data() || {};

    const candidates = [];
    // arrays
    if(Array.isArray(d.activities)) candidates.push(d.activities);
    if(Array.isArray(d.activity)) candidates.push(d.activity);
    // single values
    if(d.activity && !Array.isArray(d.activity)) candidates.push(d.activity);
    if(d.activities && !Array.isArray(d.activities) && typeof d.activities === 'string') candidates.push(d.activities);
    if(d.activityType) candidates.push(d.activityType);
    if(d.activity_label) candidates.push(d.activity_label);
    if(d.activityLabel) candidates.push(d.activityLabel);
    if(d.activityName) candidates.push(d.activityName);

    // also look into an 'meta' or 'details' object if present
    if(d.meta && typeof d.meta === 'object'){
      if(d.meta.activity) candidates.push(d.meta.activity);
      if(d.meta.activities) candidates.push(d.meta.activities);
    }

    // flatten candidates into array of strings
    const flat = [];
    candidates.forEach(c=>{
      if(c === null || c === undefined) return;
      if(Array.isArray(c)){
        c.forEach(x=>{
          const n = normalizeEntry(x);
          if(Array.isArray(n)) n.forEach(y=> flat.push(y)); else if(n) flat.push(n);
        });
      } else {
        const n = normalizeEntry(c);
        if(Array.isArray(n)) n.forEach(y=> flat.push(y)); else if(n) flat.push(n);
      }
    });

    // If none found, try to inspect known fields like 'activities' keys
    if(flat.length === 0){
      // try d.activities as object with keys
      if(d.activities && typeof d.activities === 'object'){
        try{ Object.keys(d.activities).forEach(k=> flat.push(String(k).trim())); }catch(e){}
      }
    }

    // count
    if(flat.length === 0){
      counts.set('(blank)', (counts.get('(blank)')||0) + 1);
    } else {
      flat.forEach(val=>{
        const key = (val || '').toString().trim() || '(blank)';
        counts.set(key, (counts.get(key)||0) + 1);
      });
    }
  });

  const sorted = Array.from(counts.entries()).sort((a,b)=> b[1]-a[1]);
  console.log('Top activity counts:');
  sorted.slice(0,100).forEach(([k,v])=> console.log(`${v}\t${k}`));

  const outPath = path.join(process.cwd(),'activity_counts.json');
  fs.writeFileSync(outPath, JSON.stringify(sorted, null, 2), 'utf8');
  console.log('Wrote', outPath);
  process.exit(0);
}

main().catch(e=>{ console.error(e); process.exit(1); });
