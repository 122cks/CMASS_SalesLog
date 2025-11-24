// backfill_firestore_staff_key.js
// Scans visit_entries collection and adds staff_key where missing, using public/sales_staff.csv mapping.
// Usage: node scripts/backfill_firestore_staff_key.js [--dry-run] [--apply] [--limit=N]

const fs = require('fs');
const path = require('path');

function parseCSV(text){
  const lines = text.split(/\r?\n/).filter(l=>l.trim()!=='');
  if (!lines.length) return [];
  const header = parseCSVLine(lines[0]).map(h=>h.trim());
  const rows = [];
  for (let i=1;i<lines.length;i++){
    const cols = parseCSVLine(lines[i]);
    if (!cols || cols.length===0) continue;
    const obj = {};
    for (let j=0;j<header.length && j<cols.length;j++) obj[header[j]] = cols[j].trim();
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line){
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (inQuotes){
      if (ch === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else { inQuotes = false; } }
      else cur += ch;
    } else {
      if (ch === ','){ cols.push(cur); cur = ''; }
      else if (ch === '"'){ inQuotes = true; }
      else cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function makeStaffKey(raw){
  if (!raw) return '';
  try{ return raw.normalize('NFKC').trim().replace(/\s+/g,''); }catch(e){ return String(raw).trim().replace(/\s+/g,''); }
}

function stripTitle(name){
  if (!name) return '';
  return String(name).replace(/\s*(부장|차장|과장|팀장|님|선생님)$/,'').trim();
}

async function main(){
  const argv = process.argv.slice(2);
  const doApply = argv.indexOf('--apply') !== -1;
  const dryRun = !doApply;
  const limitArg = argv.find(a=>a.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

  const csvPath = path.resolve(__dirname, '..', 'public', 'sales_staff.csv');
  if (!fs.existsSync(csvPath)){
    console.error('sales_staff.csv not found at', csvPath);
    process.exit(1);
  }
  const csv = fs.readFileSync(csvPath,'utf8');
  const rows = parseCSV(csv);
  const mapping = {}; // map possible keys (staff raw, stripped, label) -> staff_key

  for (const r of rows){
    const staffRaw = (r['staff'] || r['담당자'] || '').trim();
    if (!staffRaw) continue;
    const staffKey = (r['staff_key'] || '').trim() || makeStaffKey(staffRaw);
    const label = (r['label'] || '').trim() || stripTitle(staffRaw);
    // add multiple forms
    mapping[staffRaw] = staffKey;
    if (label) mapping[label] = staffKey;
    const stripped = stripTitle(staffRaw);
    if (stripped) mapping[stripped] = staffKey;
    // also normalized no-space form
    mapping[makeStaffKey(staffRaw)] = staffKey;
  }

  // Initialize firebase-admin
  let admin;
  try{
    admin = require('firebase-admin');
  }catch(e){
    console.error('firebase-admin module not found. Please run `npm install firebase-admin` and retry.');
    process.exit(1);
  }

  // Use provided service account file if env var present, else fail
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!saPath || !fs.existsSync(saPath)){
    console.error('GOOGLE_APPLICATION_CREDENTIALS not set or file not found. Please set env and retry.');
    process.exit(1);
  }

  try{
    const sa = require(saPath);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }catch(e){
    console.error('Failed to initialize firebase-admin with service account:', e);
    process.exit(1);
  }

  const db = admin.firestore();

  console.log('Starting scan of visit_entries (dryRun=', dryRun, ', limit=', limit === Infinity ? 'none' : limit, ')');

  const snapshot = await db.collection('visit_entries').get();
  console.log('Total visit_entries documents scanned:', snapshot.size);

  const candidates = [];
  let processed = 0;
  snapshot.forEach(doc => {
    if (processed >= limit) return;
    processed++;
    const data = doc.data() || {};
    if (data.staff_key) return; // already has staff_key
    // try candidates
    const staffRaw = (data.staff || data.staffLabel || data.staffLabel || '') || '';
    let candidate = '';
    if (staffRaw && mapping[staffRaw]) candidate = mapping[staffRaw];
    if (!candidate){
      const stripped = stripTitle(staffRaw || '');
      if (stripped && mapping[stripped]) candidate = mapping[stripped];
    }
    if (!candidate && staffRaw){
      // maybe staffRaw is already a token
      const made = makeStaffKey(staffRaw);
      if (mapping[made]) candidate = mapping[made]; else candidate = made; // fallback to made key if nothing else
    }
    if (candidate) candidates.push({ id: doc.id, old: data, staff_key: candidate });
    else candidates.push({ id: doc.id, old: data, staff_key: null });
  });

  console.log('Candidate updates found:', candidates.length);
  const withCandidate = candidates.filter(c=>c.staff_key);
  const without = candidates.filter(c=>!c.staff_key);
  console.log('With resolved staff_key:', withCandidate.length, 'Unable to resolve:', without.length);

  if (dryRun){
    console.log('\nDRY RUN results (first 50):');
    withCandidate.slice(0,50).forEach(c=> console.log(c.id, '=>', c.staff_key));
    if (without.length) console.log('\nSample unresolved doc ids:', without.slice(0,10).map(x=>x.id));
    console.log('\nTo apply these changes, re-run with --apply');
    process.exit(0);
  }

  // Apply updates in batches of 500
  const batchSize = 500;
  const toApply = withCandidate;
  let applied = 0;
  for (let i=0;i<toApply.length;i+=batchSize){
    const batch = db.batch();
    const slice = toApply.slice(i,i+batchSize);
    slice.forEach(item => {
      const ref = db.collection('visit_entries').doc(item.id);
      batch.update(ref, { staff_key: item.staff_key });
    });
    try{
      await batch.commit();
      applied += slice.length;
      console.log('Committed batch', i/batchSize + 1, 'items=', slice.length);
    }catch(e){
      console.error('Batch commit failed at batch', i/batchSize + 1, e);
      process.exit(1);
    }
  }

  console.log('Finished. Applied updates:', applied, 'Remaining unresolved:', without.length);
  if (without.length) console.log('Unresolved doc ids (sample 50):', without.slice(0,50).map(x=>x.id));
  process.exit(0);
}

main().catch(e=>{ console.error('Script error', e); process.exit(1); });
