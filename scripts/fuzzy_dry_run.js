const fs = require('fs');
const path = require('path');

// Accept a threshold as first CLI arg (default 0.75)
const THRESHOLD = parseFloat(process.argv[2] || '0.75');

function normalize(s){
  if (!s) return '';
  try{
    // remove BOM & zero-width, NFC normalize, collapse spaces, lower
    return s.replace(/\uFEFF/g,'').replace(/[\u200B-\u200D\uFEFF]/g,'').normalize('NFC').replace(/\s+/g,' ').trim().toLowerCase();
  }catch(e){ return String(s||'').trim().toLowerCase(); }
}
function tokens(s){ return normalize(s).split(/[^0-9a-z\uac00-\ud7af]+/).filter(Boolean); }
function uniq(a){ return Array.from(new Set(a)); }

function levenshtein(a,b){
  if (!a) return b? b.length:0; if(!b) return a.length;
  const m = a.length, n = b.length; const dp = Array.from({length:m+1},()=>Array(n+1).fill(0));
  for(let i=0;i<=m;i++) dp[i][0]=i;
  for(let j=0;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++){
    for(let j=1;j<=n;j++){
      const cost = a[i-1]===b[j-1]?0:1;
      dp[i][j]=Math.min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1]+cost);
    }
  }
  return dp[m][n];
}

// load entries (be robust to any leading/trailing non-json text)
let entriesText = fs.readFileSync(path.join(__dirname,'..','tmp_entries.json'),'utf8');
const firstBrace = entriesText.indexOf('{');
if (firstBrace > 0) entriesText = entriesText.slice(firstBrace);
let entriesRaw;
try{
  entriesRaw = JSON.parse(entriesText);
}catch(e){
  console.error('failed parsing tmp_entries.json:', e && e.message);
  process.exit(2);
}
const rows = (entriesRaw && entriesRaw.rows) || [];

// load csv
const csvText = fs.readFileSync(path.join(__dirname,'..','sales_staff.csv'),'utf8');
function parseCsv(text){
  const out=[]; let cur=''; let inQ=false; let row=[];
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(inQ && i+1<text.length && text[i+1]==='"'){ cur+='"'; i++; continue; }
      inQ=!inQ; continue;
    }
    if(!inQ && (ch==='\n' || ch==='\r')){
      if(ch==='\r' && i+1<text.length && text[i+1]==='\n'){ i++; }
      row.push(cur); cur=''; out.push(row); row=[]; continue;
    }
    if(!inQ && ch===','){ row.push(cur); cur=''; continue; }
    cur+=ch;
  }
  if(cur!==''||inQ||row.length){ row.push(cur); out.push(row); }
  return out.map(r=>r.map(c=>c.replace(/^\uFEFF/,'').trim()));
}
const rowsCsv = parseCsv(csvText).filter(r=>r && r.length);
const header = rowsCsv[0] || [];
const idxSchool = header.findIndex(h => /학교명|학교|school/i.test(h));
const idxRegion = header.findIndex(h => /지역|region/i.test(h));
if (idxSchool<0 || idxRegion<0){ console.error('CSV missing expected columns'); process.exit(2); }
const map = Object.create(null);
for(let i=1;i<rowsCsv.length;i++){ const c=rowsCsv[i]; if(!c || c.length<=Math.max(idxSchool,idxRegion)) continue; const school=c[idxSchool]||''; const region=c[idxRegion]||''; if(school) map[normalize(school)]=region; }
const mapKeys = Object.keys(map);

// process
const missing = rows.filter(r => r && (r.region===undefined || (r.region||'').toString().trim()==='') && r.school && r.school.toString().trim());
const planned = [];
for(const e of missing){
  const sid = e.id; const school = (e.school||'').toString(); const ns = normalize(school);
  let best = {score:0, key:null, region:null, reason:null};
  // exact normalized
  if(map[ns]){ best = {score:1.0, key:ns, region: map[ns], reason:'normalized exact'}; }
  else {
    // substring priority
    for(const k of mapKeys){ if(!k) continue; if(school.indexOf(k)!==-1 || k.indexOf(school)!==-1){ best = {score:0.95, key:k, region:map[k], reason:'substring'}; break; } }
    // token overlap
    if(!best.key){
      const toks = uniq(tokens(school));
      for(const k of mapKeys){ const ktoks = uniq(tokens(k)); if(!ktoks.length) continue; const inter = ktoks.filter(x=>toks.indexOf(x)!==-1).length; const union = uniq(ktoks.concat(toks)).length; const overlap = union? (inter/union):0; if(overlap>0){ const sc = 0.6 + 0.4*overlap; if(sc>best.score){ best = {score:sc, key:k, region:map[k], reason:'token overlap('+overlap.toFixed(2)+')'}; } } }
    }
    // levenshtein similarity
    if(!best.key || best.score < 0.85){
      for(const k of mapKeys){ const a = ns; const b = normalize(k); const d = levenshtein(a,b); const maxl = Math.max(a.length,b.length)||1; const sim = 1 - (d/maxl); if(sim>best.score){ best = {score: sim, key:k, region: map[k], reason:'levenshtein('+d+'/'+maxl+')'}; } }
    }
  }
  if(best && best.score>=THRESHOLD){ planned.push({ entryId: sid, school: school, normSchool: ns, matchKey: best.key, region: best.region, score: Number(best.score.toFixed(3)), reason: best.reason }); }
}

const out = { totalMissing: missing.length, plannedCount: planned.length, examples: planned.slice(0,200) };
console.log(JSON.stringify(out, null, 2));

// also write file
fs.writeFileSync(path.join(__dirname,'..','fuzzy_planned.json'), JSON.stringify(out, null, 2), 'utf8');
console.error('WROTE fuzzy_planned.json');
