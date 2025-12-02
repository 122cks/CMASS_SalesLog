#!/usr/bin/env node
/**
 * Backfill scode (정보공시학교코드) into an exported backend JSON using sales_staff.csv.
 *
 * Usage (PowerShell):
 *   node .\scripts\backfill_scode.js .\public\sales_staff.csv .\public\cmass-sales-8b9a9d55138f.json .\public\cmass-sales-8b9a9d55138f.with-scode.json
 *
 * Input JSON formats supported:
 * 1) An array: [ { school: "...", ... }, ... ]
 * 2) Newline-delimited JSON objects (one per line)
 * 3) Firestore export style with top-level { documents: [ { name, fields: {...} }, ... ] }
 *
 * For Firestore export objects, the script will attempt to set fields.scode.stringValue.
 * For simple objects it will add or overwrite scode property.
 *
 * Matching strategy mirrors dashboard logic:
 *  - Exact lowercased school name -> scode
 *  - Normalized name (strip spaces, common suffixes, punctuation, gender tokens)
 *  - Fuzzy: includes() on normalized forms when unique
 */

const fs = require('fs');
const path = require('path');

function die(msg){ console.error(msg); process.exit(1); }

if (process.argv.length < 5){
  die('Usage: node backfill_scode.js <sales_staff.csv> <input.json> <output.json>');
}
const [,, csvPath, inputPath, outputPath] = process.argv;

if (!fs.existsSync(csvPath)) die('CSV not found: '+csvPath);
if (!fs.existsSync(inputPath)) die('Input JSON not found: '+inputPath);

function parseCSV(raw){
  raw = raw.replace(/\r\n/g,'\n');
  const lines = raw.split(/\n/).filter(l=>l.trim().length>0);
  if (!lines.length) return [];
  const header = lines[0].split(',').map(h=>h.trim());
  const scodeIdx = header.findIndex(h => /^(?:scode|학교코드|정보공시학교코드|school[_ ]?code)$/i.test(h));
  const schoolIdx = header.findIndex(h => /^(?:school|학교명|학교)$/i.test(h));
  if (schoolIdx === -1) die('Could not find school column in CSV header');
  const out = [];
  for (let i=1;i<lines.length;i++){
    const row = lines[i].split(',');
    if (row.length < header.length) continue;
    const school = (row[schoolIdx]||'').trim();
    const scode = scodeIdx !== -1 ? (row[scodeIdx]||'').trim() : '';
    if (!school) continue;
    out.push({ school, scode });
  }
  return out;
}

function normalizeSchoolKey(s){
  try{
    let t = (s||'').toString().toLowerCase();
    t = t.replace(/\s+/g,'');
    // remove gender tokens directly before '고','중'
    t = t.replace(/(남|여|여자|남자)(?=(?:고|중))/g,'');
    // strip common suffixes
    t = t.replace(/학교|중학교|고등학교/g,'');
    // remove non alphanum + korean
    t = t.replace(/[^0-9a-z\u3131-\uD79D]/g,'');
    return t;
  }catch(e){ return (s||'').toString().toLowerCase(); }
}

function buildMapping(rows){
  const exact = new Map();
  const normMap = new Map();
  for (const r of rows){
    const key = r.school.toLowerCase();
    if (!exact.has(key)) exact.set(key, r.scode);
    const nk = normalizeSchoolKey(r.school);
    if (nk && !normMap.has(nk)) normMap.set(nk, r.scode);
  }
  return { exact, normMap };
}

function findScode(school, maps){
  if (!school) return '';
  const low = school.toLowerCase();
  if (maps.exact.has(low)) return maps.exact.get(low);
  const nk = normalizeSchoolKey(school);
  if (nk && maps.normMap.has(nk)) return maps.normMap.get(nk);
  // fuzzy includes: attempt unique match
  let candidate = '';
  for (const [normKey, scode] of maps.normMap.entries()){
    if (nk.includes(normKey) || normKey.includes(nk)){
      if (candidate && candidate !== scode){ return ''; } // ambiguous -> skip
      candidate = scode;
    }
  }
  return candidate;
}

function loadInputStructure(text){
  // Try JSON.parse first
  try{
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) return { type:'array', data: obj };
    if (obj && obj.documents && Array.isArray(obj.documents)) return { type:'firestore', data: obj };
    return { type:'object', data: obj };
  }catch(e){ /* fallback */ }
  // newline-delimited JSON
  const lines = text.split(/\n/).filter(l=>l.trim().length>0);
  const arr = [];
  for (const line of lines){
    try{ arr.push(JSON.parse(line)); }catch(e){ console.warn('Skipping invalid JSON line'); }
  }
  return { type:'ndjson', data: arr };
}

const csvRaw = fs.readFileSync(csvPath,'utf8');
const csvRows = parseCSV(csvRaw);
console.log('[backfill] parsed CSV rows:', csvRows.length);
const maps = buildMapping(csvRows);

const inputRaw = fs.readFileSync(inputPath,'utf8');
const inputStruct = loadInputStructure(inputRaw);
console.log('[backfill] input type:', inputStruct.type);

let updatedCount = 0, total = 0, skipped = 0;

function enrichSimple(obj){
  total++;
  if (!obj) { skipped++; return obj; }
  const school = obj.school || obj.School || obj.schoolName || obj['학교'] || '';
  if (!school){ skipped++; return obj; }
  const existing = obj.scode || obj.SCODE || obj.schoolCode || '';
  if (existing){ skipped++; return obj; }
  const scode = findScode(school, maps);
  if (scode){ obj.scode = scode; updatedCount++; } else { skipped++; }
  return obj;
}

function enrichFirestoreDocument(doc){
  total++;
  if (!doc || !doc.fields){ skipped++; return doc; }
  const fields = doc.fields;
  const schoolField = fields.school || fields.School || fields.schoolName || fields['학교'];
  const school = schoolField && schoolField.stringValue ? schoolField.stringValue : '';
  if (!school){ skipped++; return doc; }
  const existingField = fields.scode || fields.SCODE || fields.schoolCode;
  const existing = existingField && existingField.stringValue ? existingField.stringValue : '';
  if (existing){ skipped++; return doc; }
  const scode = findScode(school, maps);
  if (scode){ fields.scode = { stringValue: scode }; updatedCount++; } else { skipped++; }
  return doc;
}

let outputData;
if (inputStruct.type === 'array'){
  outputData = inputStruct.data.map(enrichSimple);
} else if (inputStruct.type === 'ndjson'){
  outputData = inputStruct.data.map(enrichSimple);
} else if (inputStruct.type === 'firestore'){
  inputStruct.data.documents = inputStruct.data.documents.map(enrichFirestoreDocument);
  outputData = inputStruct.data;
} else if (inputStruct.type === 'object'){
  // Attempt to treat object as a single record
  outputData = enrichSimple(inputStruct.data);
} else {
  die('Unsupported input structure');
}

// Write output
if (inputStruct.type === 'ndjson'){
  const lines = outputData.map(o => JSON.stringify(o));
  fs.writeFileSync(outputPath, lines.join('\n'));
} else {
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
}

console.log(`[backfill] Done. total=${total} updated=${updatedCount} skipped=${skipped}`);
console.log('[backfill] Output written to', outputPath);
