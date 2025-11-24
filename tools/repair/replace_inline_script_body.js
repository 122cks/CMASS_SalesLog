const fs = require('fs');
const path = require('path');
const idx = process.argv[2] ? Number(process.argv[2]) : 1;
const newBodyPath = process.argv[3];
if (!newBodyPath){ console.error('Usage: node replace_inline_script_body.js <index> <newBodyFile>'); process.exit(2); }
const file = path.join(__dirname, '../../public/front.html');
let txt = fs.readFileSync(file, 'utf8');
const re = /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi;
let m; let i=0; let out = txt; let replaced=false;
while ((m = re.exec(txt)) !== null){ i++; if (i===idx){ const open = '<script' + (m[1]||'') + '>'; const close='</script>'; const newBody = fs.readFileSync(path.resolve(newBodyPath),'utf8'); out = txt.slice(0,m.index) + open + newBody + close + txt.slice(re.lastIndex); replaced=true; break; } }
if (!replaced){ console.error('script index not found'); process.exit(2); }
fs.writeFileSync(file, out, 'utf8'); console.log('Replaced script', idx, 'body from', newBodyPath);
