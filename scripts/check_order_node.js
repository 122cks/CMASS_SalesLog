const fs = require('fs');
const path = './public/order.csv';
const txt = fs.readFileSync(path,'utf8');
const lines = txt.split(/\r?\n/).filter(Boolean);
function parseLine(line){ const out=[]; let cur=''; let inQuotes=false; for(let i=0;i<line.length;i++){ const ch=line[i]; if(ch==='"'){ inQuotes=!inQuotes; continue;} if(ch===',' && !inQuotes){ out.push(cur); cur=''; continue; } cur += ch; } out.push(cur); return out.map(s=>s.trim()); }
const header = parseLine(lines[0]);
const rows = lines.slice(1).map(l=>{ const cols = parseLine(l); const obj={}; for(let i=0;i<header.length;i++){ obj[header[i]] = cols[i] || ''; } return obj; });
function normalizeSchool(s){ if(!s) return '__unknown__'; s=String(s).trim().toLowerCase(); s=s.replace(/\s+/g,''); s=s.replace(/["'`\.,\-\/\\()\[\]]+/g,''); s = s.replace(/(초등학교|초등|중학교|중등학교|중등|고등학교|고등|학교|학교명)$/g,''); s=s.replace(/\s+/g,''); return s||'__unknown__'; }
// detect candidates
const headerLower = header.map(h=>h.toLowerCase());
function findFirst(regexes){ for(const h of header){ for(const r of regexes){ if(new RegExp(r,'i').test(h)) return h; } } return null; }
const bookName = findFirst(['교재명','교지명','도서명','bookname','title']);
const schoolCols = header.filter(h=> /학교|school|schoolname|학교명/i.test(h));
const schoolCodeCol = findFirst(['정보공시학교코드','학교코드','school[_ ]?code','schoolid','school_id','code']);
console.log('header length', header.length);
console.log('bookName col:', bookName);
console.log('school cols sample:', schoolCols.slice(0,5));
console.log('schoolCodeCol:', schoolCodeCol);
// normalize rows
const norm = rows.map(r=>{
  const o={};
  o.school=''; for(const k of schoolCols){ if(r[k]){ o.school=r[k]; break; } }
  if(!o.school) o.school = r[header[0]]||'';
  o.schoolNorm = normalizeSchool(o.school);
  o.bookName = bookName ? (r[bookName]||'') : (r[header[1]]||'');
  o.schoolCode = schoolCodeCol ? (r[schoolCodeCol]||'') : '';
  // numeric parse
  function toNum(v){ if(v==null || v==='') return 0; const n = Number(String(v).replace(/[^0-9.-]+/g,'')); return isNaN(n)?0:n; }
  o.copiesNum = toNum(r['부수']||r['수량']||r['qty']||r['수량계']);
  o.amountNum = toNum(r['금액']||r['amount']);
  return o;
});
const schoolParam='S020000338';
const filtered = norm.filter(r=>{ const name = String(r.bookName||'').toLowerCase(); if(!name.includes('교과서')) return false; const param=schoolParam.trim(); if(r.schoolCode && String(r.schoolCode).toLowerCase()===param.toLowerCase()) return true; const pn = normalizeSchool(param); if(r.schoolNorm && r.schoolNorm===pn) return true; if(r.school && String(r.school).toLowerCase().includes(param.toLowerCase())) return true; return false; });
console.log('total rows', rows.length, 'filtered records', filtered.length);
if(filtered.length>0) console.log('sample:', filtered.slice(0,3));
else console.log('No filtered rows');
