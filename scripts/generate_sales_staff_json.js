#!/usr/bin/env node
// Simple utility to convert `public/sales_staff.csv` -> `public/sales_staff.json`
// Usage: node scripts/generate_sales_staff_json.js
const fs = require('fs');
const path = require('path');

const CSV_PATH = path.join(__dirname, '..', 'public', 'sales_staff.csv');
const OUT_PATH = path.join(__dirname, '..', 'public', 'sales_staff.json');

function parseCsv(text){
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    if(ch === '"'){
      // handle escaped quotes
      if(inQuotes && text[i+1] === '"'){
        cur += '"'; i++; continue;
      }
      inQuotes = !inQuotes; continue;
    }
    if(ch === ',' && !inQuotes){ row.push(cur); cur = ''; continue; }
    if((ch === '\n' || ch === '\r') && !inQuotes){
      // handle CRLF
      if(ch === '\r' && text[i+1] === '\n'){ i++; }
      row.push(cur);
      // ignore empty trailing newline
      if(!(row.length === 1 && row[0] === '')) rows.push(row.slice());
      row = []; cur = '';
      continue;
    }
    cur += ch;
  }
  // trailing
  if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
  return rows;
}

function main(){
  if(!fs.existsSync(CSV_PATH)){
    console.error('sales_staff.csv not found at', CSV_PATH); process.exit(2);
  }
  const txt = fs.readFileSync(CSV_PATH, 'utf8');
  const rows = parseCsv(txt);
  if(!rows || !rows.length){ console.error('no rows parsed'); process.exit(3); }
  const header = rows[0].map(h=> (h||'').trim());
  const out = [];
  for(let i=1;i<rows.length;i++){
    const r = rows[i];
    if(!r || r.length === 0) continue;
    const obj = {};
    for(let j=0;j<header.length;j++) obj[header[j] || ('c'+j)] = (r[j] !== undefined ? String(r[j]).trim() : '');
    out.push(obj);
  }
  fs.writeFileSync(OUT_PATH, JSON.stringify({ header, rows: out }, null, 2), 'utf8');
  console.log('Wrote', OUT_PATH, 'rows:', out.length);
}

if(require.main === module) main();
