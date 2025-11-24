const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node check_balance.js <file.html>');
  process.exit(2);
}
const src = fs.readFileSync(file, 'utf8');
// Extract <script>...</script> contents
const scriptBlocks = [];
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(src)) !== null){ scriptBlocks.push(m[1]); }
if (!scriptBlocks.length){ console.log('No <script> blocks found.'); process.exit(0); }
function checkText(text){
  const pairs = { '(':')','{':'}','[':']' };
  const opens = Object.keys(pairs);
  const closes = Object.values(pairs);
  const stack = [];
  const issues = [];
  for (let i=0;i<text.length;i++){
    const ch = text[i];
    if (opens.includes(ch)) stack.push({ch, i});
    else if (closes.includes(ch)){
      const last = stack[stack.length-1];
      if (!last){ issues.push({pos:i, found:ch, expected:null, msg:'Unmatched closing '+ch}); continue; }
      const expected = pairs[last.ch];
      if (expected === ch){ stack.pop(); } else {
        issues.push({pos:i, found:ch, expected, msg:`Mismatched closing ${ch} at ${i}, expected ${expected} for opening ${last.ch} at ${last.i}`});
      }
    }
  }
  while(stack.length){ const s = stack.pop(); issues.push({pos:s.i, found:s.ch, expected:pairs[s.ch], msg:`Unclosed opening ${s.ch} at ${s.i} (expected ${pairs[s.ch]})`}); }
  return issues;
}
let any = false;
for (let i=0;i<scriptBlocks.length;i++){
  const txt = scriptBlocks[i];
  const issues = checkText(txt);
  console.log('--- Script block', i+1, `(${Math.round(txt.length/1024)} KB)`);
  if (!issues.length) console.log('  OK: balanced');
  else{
    any = true;
    issues.slice(0,10).forEach(it => console.log('  ISSUE:', it.msg));
    if (issues.length>10) console.log('  (and', issues.length-10, 'more)');
  }
}
process.exit(any?1:0);
