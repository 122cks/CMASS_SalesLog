const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'input.html');
const html = fs.readFileSync(file,'utf8');
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let i=0;
while ((m = scriptRegex.exec(html)) !== null){
  i++; const code = m[1];
  const out = path.resolve(__dirname, `script_${i}.js`);
  fs.writeFileSync(out, code, 'utf8');
  console.log(`Wrote ${out} (${code.length} bytes)`);
}

