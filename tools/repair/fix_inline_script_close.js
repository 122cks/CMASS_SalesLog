const fs = require('fs');
const path = require('path');
const idxArg = process.argv[2] ? Number(process.argv[2]) : 1;
const num = process.argv[3] ? Number(process.argv[3]) : 1;
const filePath = path.join(__dirname, '../../public/front.html');
let txt = fs.readFileSync(filePath, 'utf8');
const re = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m; let idx = 0; let out = '';
let lastIndex = 0;
let replaced = false;
while ((m = re.exec(txt)) !== null){
  idx++;
  const matchStart = m.index;
  const matchEnd = re.lastIndex;
  if (idx === idxArg){
    // construct replacement: original open tag + body + appended braces + closing tag
    const openTag = '<script' + (m[1] || '') + '>';
    const body = m[2];
    const closing = '</script>';
    const append = '" + "'.repeat(0); // no-op to avoid template issues
    const newBody = body + '\n' + '}'.repeat(num) + '\n';
    out = txt.slice(0, matchStart) + openTag + newBody + closing + txt.slice(matchEnd);
    replaced = true;
    break;
  }
}
if (!replaced){ console.error('script index not found'); process.exit(2); }
fs.writeFileSync(filePath, out, 'utf8');
console.log('Patched script index', idxArg, 'appending', num, 'closing brace(s)');
