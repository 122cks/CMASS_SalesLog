const fs = require('fs');
const path = 'C:\\Users\\PC\\OneDrive\\cmass-sales-system\\CMASS_SalesLog\\public\\order.csv';
const txt = fs.readFileSync(path, 'utf8');
const lines = txt.split(/\r?\n/).filter(Boolean);
console.log('total lines', lines.length);
const matches = lines.filter(l => l.indexOf('S020000338') !== -1);
console.log('raw lines matching code:', matches.length);
function parseLine(line){ const out=[]; let cur=''; let inQuotes=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ inQuotes=!inQuotes; continue; } if(ch===',' && !inQuotes){ out.push(cur); cur=''; continue; } cur+=ch; } out.push(cur); return out.map(s=>s.trim()); }
const header = parseLine(lines[0]);
console.log('header[0..6]:', header.slice(0,7));
for(let i=0;i<Math.min(matches.length,10); i++){
  const line = matches[i];
  const cols = parseLine(line);
  console.log('\n---- LINE', i+1, 'cols:', cols.slice(0,7));
  // try to find 교과서 in any column
  const found = cols.find(c => String(c).includes('교과서'));
  console.log('contains 교과서?', !!found, 'sample cell:', found||cols[1]);
}
