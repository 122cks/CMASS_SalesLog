const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '..', 'input.html');
const html = fs.readFileSync(file,'utf8');
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let i=0; let found=false;
while ((m = scriptRegex.exec(html)) !== null){
  i++; const code = m[1];
  try{
    // try to compile
    new Function(code);
    console.log(`Script #${i}: OK (length ${code.length})`);
  }catch(e){
    console.error(`Script #${i}: SYNTAX ERROR -> ${e.message}`);
    console.error(e.stack);
    // print snippet around error if possible
    console.error('--- snippet ---');
    const lines = code.split('\n');
    // try to get line number from error.message if present
    const msg = e.message || '';
    const match = msg.match(/<anonymous>:(\d+):(\d+)/);
    let errLine = null;
    if (match) errLine = parseInt(match[1],10);
    lines.forEach((ln,idx)=>{
      const n = idx+1;
      if (errLine===null){
        if (n<=20) console.error((n)+"\t"+ln);
      } else {
        if (n>=Math.max(1,errLine-6) && n<=errLine+3) console.error((n)+"\t"+ln);
      }
    });
    found=true;
  }
}
if (!found) console.log('No syntax errors found in inline scripts.');

