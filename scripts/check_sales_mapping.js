#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const JSON_PATH = path.join(__dirname, '..', 'public', 'sales_staff.json');
if(!fs.existsSync(JSON_PATH)){
  console.error('sales_staff.json not found. Run the generator first.');
  process.exit(2);
}
const data = JSON.parse(fs.readFileSync(JSON_PATH,'utf8'));
const rows = data.rows || [];

function clean(s){
  if(s === undefined || s === null) return '';
  s = String(s);
  s = s.replace(/\uFEFF|\u200B|\u00A0/g,'');
  try{ s = s.normalize('NFKC'); }catch(e){}
  return s.trim();
}

function compactKey(s){ return clean(s).replace(/\s+/g,'').replace(/[^0-9a-z가-힣]/gi,'').toLowerCase(); }
function rawLowerKey(s){ return clean(s).toLowerCase(); }
function strippedSuffixKey(s){ return clean(s).replace(/(?:중학교|초등학교|고등학교|중|초|고)$/i,'').replace(/\s+/g,'').toLowerCase(); }

// build quick lookup maps (simulate registration in schoolreport)
const map = new Map();
for(const r of rows){
  const name = r['school'] || r['학교'] || r['학교명'] || '';
  const code = r['정보공시학교코드'] || r['학교코드'] || r['school_code'] || '';
  const obj = Object.assign({}, r);
  const keys = new Set();
  keys.add(rawLowerKey(name));
  keys.add(compactKey(name));
  keys.add(strippedSuffixKey(name));
  if(code) keys.add(String(code).trim().toLowerCase());
  for(const k of keys){ if(k) map.set(k, obj); }
}

const queries = [
  '구산중학교','부원여자중학교','부원중학교','부흥중학교','산곡남중학교','진산중학교','명지중학교','보평중학교'
];

for(const q of queries){
  const kRaw = rawLowerKey(q);
  const kCompact = compactKey(q);
  const kStripped = strippedSuffixKey(q);
  const found = {
    query: q,
    rawLower: map.has(kRaw) ? true : false,
    compact: map.has(kCompact) ? true : false,
    stripped: map.has(kStripped) ? true : false,
    matches: []
  };
  for(const kk of [kRaw,kCompact,kStripped]){
    if(map.has(kk)) found.matches.push({ key: kk, row: map.get(kk) });
  }
  console.log(JSON.stringify(found, null, 2));
}

console.log('map size (registered keys):', map.size, 'rows:', rows.length);
