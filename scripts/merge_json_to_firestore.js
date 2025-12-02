#!/usr/bin/env node
/*
  Merge JSON entries into Firestore collection by document ID (server_id/id).
  - Auth: set env GOOGLE_APPLICATION_CREDENTIALS to your service account JSON.
  - Usage (PowerShell):
      $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\serviceAccount.json"
      node .\scripts\merge_json_to_firestore.js --project cmass-sales --in \
        "C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\cmass-sales-8b9a9d55138f.with-scode.json"
        --collection visit_entries --idField server_id
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

function parseArgs(argv){
  const args = { collection: 'visit_entries', idField: 'server_id' };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--in' || a === '-i') args.input = argv[++i];
    else if (a === '--project' || a === '-p') args.project = argv[++i];
    else if (a === '--collection' || a === '-c') args.collection = argv[++i];
    else if (a === '--idField' || a === '-k') args.idField = argv[++i];
  }
  return args;
}

function unmarshalFirestoreFields(obj){
  // Converts Firestore REST export typed fields into plain JS values.
  if (!obj || typeof obj !== 'object') return obj;
  const hasTypeKey = (o)=> o && typeof o === 'object' && Object.keys(o).some(k => /Value$/.test(k));
  function conv(v){
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(conv);
    if (typeof v !== 'object') return v;
    // Handle typed value wrappers
    if (v.stringValue !== undefined) return String(v.stringValue);
    if (v.integerValue !== undefined) return Number(v.integerValue);
    if (v.doubleValue !== undefined) return Number(v.doubleValue);
    if (v.booleanValue !== undefined) return Boolean(v.booleanValue);
    if (v.timestampValue !== undefined) return String(v.timestampValue);
    if (v.nullValue !== undefined) return null;
    if (v.bytesValue !== undefined) return String(v.bytesValue);
    if (v.referenceValue !== undefined) return String(v.referenceValue);
    if (v.geoPointValue !== undefined) return v.geoPointValue; // {latitude, longitude}
    if (v.arrayValue !== undefined) return conv(v.arrayValue.values || []);
    if (v.mapValue !== undefined) return unmarshalFirestoreFields(v.mapValue.fields || {});
    // Plain object: recurse
    const out = {};
    for (const k of Object.keys(v)) out[k] = conv(v[k]);
    return out;
  }
  const out = {};
  for (const k of Object.keys(obj)) out[k] = conv(obj[k]);
  return out;
}

function detectEntries(text){
  // Returns array of entries; supports array JSON, object with documents, NDJSON lines, or single object
  try{
    const data = JSON.parse(text);
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray(data.documents)){
      return data.documents.map(d => {
        const id = (d.name && String(d.name).split('/').pop()) || d.id || d.server_id || '';
        const fields = d.fields ? unmarshalFirestoreFields(d.fields) : {};
        return Object.assign({ server_id: id }, fields);
      });
    }
    // Single object
    return [data];
  }catch(_){
    // NDJSON
    const lines = text.split(/\r?\n/).filter(Boolean);
    const arr = [];
    for (const line of lines){
      try{ const o = JSON.parse(line); arr.push(o); }catch(e){ /* skip */ }
    }
    return arr;
  }
}

async function main(){
  const args = parseArgs(process.argv);
  if (!args.input){
    console.error('Usage: node scripts/merge_json_to_firestore.js --project <id> --in <file> [--collection visit_entries] [--idField server_id]');
    process.exit(1);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS){
    console.error('Missing GOOGLE_APPLICATION_CREDENTIALS env var. Set it to your service account JSON path.');
    process.exit(2);
  }

  const credential = admin.credential.applicationDefault();
  admin.initializeApp({ credential, projectId: args.project });
  const db = admin.firestore();

  const raw = fs.readFileSync(path.resolve(args.input), 'utf8');
  const entries = detectEntries(raw);
  console.log(`[merge] entries detected: ${entries.length}`);

  let total = 0, updated = 0, skipped = 0;
  for (const e of entries){
    total++;
    try{
      const id = (e && (e[args.idField] || e.id || e._id)) ? String(e[args.idField] || e.id || e._id) : '';
      if (!id){ skipped++; continue; }
      // Payload: if entry came from Firestore export, it is already plain; else use as-is
      const payload = Object.assign({}, e);
      // Never attempt to change the doc id fields in payload unless desired; OK to include 's-code'.
      await db.collection(args.collection).doc(id).set(payload, { merge: true });
      updated++;
      if (updated % 100 === 0) console.log(`[merge] updated ${updated}/${total}`);
    }catch(err){
      console.warn('[merge] skip due to error:', err && err.message ? err.message : err);
      skipped++;
    }
  }
  console.log(`[merge] done: total=${total} updated=${updated} skipped=${skipped}`);
  process.exit(0);
}

main().catch(e => { console.error('[merge] fatal', e); process.exit(1); });
