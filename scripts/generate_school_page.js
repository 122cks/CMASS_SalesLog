const fs = require('fs');
const code = process.argv[2] || 'S020000338';
const csvPath = './public/order.csv';
const outPath = `./public/order-${code}.html`;
const txt = fs.readFileSync(csvPath,'utf8');
const lines = txt.split(/\r?\n/).filter(Boolean);
function parseLine(line){ const out=[]; let cur=''; let inQuotes=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ inQuotes=!inQuotes; continue;} if(ch===',' && !inQuotes){ out.push(cur); cur=''; continue; } cur += ch; } out.push(cur); return out.map(s=>s.trim()); }
const header = parseLine(lines[0]);
const rows = lines.slice(1).map(l=>{ const cols = parseLine(l); const obj={}; for(let i=0;i<header.length;i++){ obj[header[i]] = cols[i] || ''; } return obj; });
const matches = rows.filter(r=> {
  const any = Object.values(r).join(' ');
  return any.includes(code) && any.includes('교과서');
});
let html = `<!doctype html><html><head><meta charset="utf-8"><title>Orders ${code}</title><style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:6px}</style></head><body><h1>Matches for ${code} (교과서)</h1><p>Found ${matches.length} rows</p><table><thead><tr>`;
for(const h of header){ html += `<th>${h}</th>`; }
html += '</tr></thead><tbody>';
for(const r of matches){ html += '<tr>'; for(const h of header){ html += `<td>${(r[h]||'').replace(/</g,'&lt;')}</td>`; } html += '</tr>'; }
html += '</tbody></table></body></html>';
fs.writeFileSync(outPath, html, 'utf8');
console.log('WROTE', outPath, 'rows', matches.length);
