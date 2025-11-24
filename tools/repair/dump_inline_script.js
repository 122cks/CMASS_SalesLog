const fs = require('fs');
const path = require('path');
const idxArg = process.argv[2] ? Number(process.argv[2]) : 1;
const file = path.join(__dirname, '../../public/front.html');
const txt = fs.readFileSync(file, 'utf8');
const re = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m; let idx = 0; let found = false;
while ((m = re.exec(txt)) !== null){
  idx++;
  if (idx === idxArg){
    console.log('--- SCRIPT INDEX', idx);
    console.log(m[2]);
    found = true; break;
  }
}
if (!found) { console.error('No such inline script index:', idxArg); process.exit(2); }
