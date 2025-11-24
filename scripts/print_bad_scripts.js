const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','public','front.html'),'utf8');
const scriptRegex = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let m; let idx = 0; 
while ((m = scriptRegex.exec(html)) !== null){
  idx++;
  const full = m[0];
  const inner = m[1];
  const openTag = full.split('>')[0];
  if (/\ssrc\s*=/.test(openTag)) continue;
  try{ new Function(inner); }catch(e){
    console.log('--- SCRIPT INDEX', idx, '---');
    const lines = inner.split('\n');
    for (let i=0;i<Math.min(lines.length,200);i++){
      console.log((i+1).toString().padStart(4,' '), '|', lines[i]);
    }
    console.log('error:', e && e.message);
    console.log('\n\n');
  }
}

