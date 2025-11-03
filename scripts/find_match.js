const fs = require('fs');
const p = process.argv[2];
const start = parseInt(process.argv[3], 10);
if(!p || isNaN(start)){ console.error('Usage: node find_match.js <file> <startIndex>'); process.exit(2); }
const txt = fs.readFileSync(p,'utf8');
let depth = 1;
let match = -1;
for(let i = start+1; i < txt.length; i++){
  const ch = txt[i];
  if(ch === '{') depth++;
  else if(ch === '}'){
    depth--;
    if(depth === 0){ match = i; break; }
  }
}
if(match === -1){ console.log('no match, depth', depth); process.exit(0); }
console.log('match at', match);
console.log('match line/col approx by counting newlines:');
const before = txt.slice(0, match);
const line = before.split('\n').length;
const col = before.split('\n').pop().length + 1;
console.log('line', line, 'col', col);
console.log('context:\n' + txt.slice(Math.max(0, match-120), Math.min(txt.length, match+120)));
