const fs = require('fs');
const path = require('path');
const file = path.resolve('public','dashboard.html');
let src = fs.readFileSync(file,'utf8');
const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let m; let i=0; let found=false;
while((m = re.exec(src)) !== null){
  i++; const content = m[1];
  try{
    new Function(content);
    console.log(`script #${i}: OK (length ${content.length} chars)`);
  }catch(err){
    found=true;
    console.error(`script #${i}: PARSE ERROR -> ${err.message}`);
    // try to extract location from stack
    if(err.stack){
      const stack = err.stack.split('\n').slice(0,3).join('\n');
      console.error(stack);
    }
    // show context around likely error position if available
    // Node's SyntaxError often reports at <anonymous>:1:COL
    const mpos = /<anonymous>:(\d+):(\d+)/.exec(err.stack||'') || /<anonymous>:(\d+):(\d+)/.exec(err.message||'');
    if(mpos){
      const lineNum = Number(mpos[1]);
      const colNum = Number(mpos[2]);
      const lines = content.split(/\n/);
      const showFrom = Math.max(0,lineNum-5);
      const showTo = Math.min(lines.length, lineNum+2);
      console.error(`---- context (lines ${showFrom+1}-${showTo}) ----`);
      for(let li=showFrom; li<showTo; li++){
        const marker = (li+1===lineNum)? '>>' : '  ';
        console.error(`${marker} ${String(li+1).padStart(4)} | ${lines[li]}`);
      }
    } else {
      console.error('No position info from parser; showing head/tail:');
      console.error('--- head ---'); console.error(content.slice(0,400));
      console.error('--- tail ---'); console.error(content.slice(-400));
    }
  }
}
if(!i) console.log('No <script> blocks found.');
if(found) process.exit(2);
