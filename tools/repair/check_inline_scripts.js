const fs = require('fs');
const vm = require('vm');
const path = require('path');

const file = path.join(__dirname, '../../public/front.html');
const txt = fs.readFileSync(file, 'utf8');

// Regex to extract <script>...</script> blocks that do NOT have a src attribute
const re = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m;
let idx = 0;
const results = [];
while ((m = re.exec(txt)) !== null){
  idx++;
  const attrs = m[1] || '';
  const body = m[2] || '';
  // Skip empty scripts (whitespace only)
  if (!body.trim()){
    results.push({ index: idx, ok: true, note: 'empty' });
    continue;
  }
  try{
    // Try to compile using vm.Script to detect syntax errors without executing
    new vm.Script(body, { filename: `inline-script-${idx}` });
    results.push({ index: idx, ok: true });
  }catch(err){
    results.push({ index: idx, ok: false, error: err.message });
  }
}

console.log('Checked', idx, 'inline <script> blocks (excluding src=).');
results.forEach(r => {
  if (r.ok) console.log(`[OK]   script #${r.index}${r.note ? ' - ' + r.note : ''}`);
  else console.log(`[ERR]  script #${r.index} -> ${r.error}`);
});

// Exit code non-zero if any errors
if (results.some(r=>r.ok===false)) process.exit(2);
else process.exit(0);
