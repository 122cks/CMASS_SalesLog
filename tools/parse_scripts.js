
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','public','input.html'),'utf8');
const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let i=0; const results=[];
while((m = scriptRe.exec(html))){
  i++;
  const src = m[1];
  // ignore external scripts (empty content)
  const trimmed = src.trim();
  if (!trimmed) continue;
  try{
    // try to compile
    new Function(trimmed);
    results.push({index:i, ok:true});
  }catch(e){
    results.push({index:i, ok:false, error: String(e)});
  }
}
console.log(JSON.stringify(results, null, 2));
