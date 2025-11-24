const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','public','front.html'),'utf8');

const scriptRegex = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let m; let idx = 0; const results = [];
while ((m = scriptRegex.exec(html)) !== null){
  idx++;
  const full = m[0];
  const inner = m[1];
  // skip external scripts (if there's a src attribute in the opening tag)
  const openTag = full.split('>')[0];
  if (/\ssrc\s*=/.test(openTag)) continue;
  try{
    // Try constructing a function to catch syntax errors (no execution)
    new Function(inner);
    results.push({ idx, ok: true });
  }catch(e){
    // Attempt to compute error line by re-parsing lines
    const errMsg = e && e.message ? String(e.message) : 'unknown';
    // try to find the column/line info in the message
    results.push({ idx, ok:false, error: errMsg });
  }
}

console.log(JSON.stringify(results, null, 2));
if (results.some(r=>!r.ok)) process.exit(2); else process.exit(0);
