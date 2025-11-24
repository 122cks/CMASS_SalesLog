const fs = require('fs');
const path = require('path');

function parseCsv(text){
  const rows = [];
  let cur = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1){
    const ch = text[i];
    if (inQuotes){
      if (ch === '"'){
        // peek next char to see if it's a double-quote escape
        const next = text[i+1];
        if (next === '"') { field += '"'; i += 1; continue; }
        inQuotes = false;
        continue;
      }
      field += ch; continue;
    }
    if (ch === '"'){ inQuotes = true; continue; }
    if (ch === ','){ cur.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n'){ cur.push(field); rows.push(cur); cur = []; field = ''; continue; }
    field += ch;
  }
  if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
  return rows;
}

const csvPath = path.join(__dirname, '..', 'public', 'sales_staff.csv');
const txt = fs.readFileSync(csvPath, 'utf8');
const rows = parseCsv(txt);
if (!rows || rows.length === 0){
  console.error('No rows parsed');
  process.exit(2);
}
const header = rows[0].map(h => (h||'').trim());
function findHeaderIndex(header, candidates){
  for (let i = 0; i < header.length; i++){
    const cell = (header[i]||'').trim();
    if (!cell) continue;
    if (candidates.some(c => c === cell)) return i;
  }
  return -1;
}
const idxSchool = findHeaderIndex(header, ['school','학교','학교명']);
console.log('Parsed rows:', rows.length, 'header columns:', header.length);
console.log('Index of school column:', idxSchool, '->', header[idxSchool]);

const tests = ['과천고등학교','광명고등학교','수원정보과학고등학교','존재하지않는학교'];
for (const t of tests){
  const matches = rows.slice(1).filter(r => ((r[idxSchool]||'').trim() === t));
  console.log('\nTest:', t, '=> found', matches.length, 'row(s)');
  if (matches.length){
    matches.slice(0,3).forEach((r, i) => {
      console.log('  Row', i+1, 'excerpt:', r.slice(0,8).map(x=>x||'').join(' | '));
    });
  }
}

// Also show first header and first data row for quick inspection
console.log('\nHeader sample:', header.slice(0,10).join(', '));
console.log('First data row sample:', rows[1].slice(0,10).join(', '));
