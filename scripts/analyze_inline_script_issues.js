const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname,'..','public','front.html'),'utf8');
const parts = html.split(/<script[^>]*>/i);
const scripts = [];
for (let i=1;i<parts.length;i++){
  const tail = parts[i].split(/<\/script>/i);
  scripts.push(tail[0]);
}
console.log('Total inline scripts:', scripts.length);
function showInfo(idx){
  const s = scripts[idx-1] || '';
  const tryCount = (s.match(/\btry\s*\{/g)||[]).length;
  const catchCount = (s.match(/\bcatch\s*\(/g)||[]).length;
  const finallyCount = (s.match(/\bfinally\b/g)||[]).length;
  console.log(`Script #${idx}: try:${tryCount} catch:${catchCount} finally:${finallyCount} len:${s.length}`);
  const lines = s.split(/\n/);
  for (let j=0;j<Math.min(lines.length,200);j++){
    const ln = (j+1).toString().padStart(4,' ');
    console.log(ln,'|',lines[j]);
  }
}
// Show counts for first 10 scripts
for (let i=1;i<=Math.min(10,scripts.length);i++){
  const t = scripts[i-1];
  const tryCount = (t.match(/\btry\s*\{/g)||[]).length;
  const catchCount = (t.match(/\bcatch\s*\(/g)||[]).length;
  const finallyCount = (t.match(/\bfinally\b/g)||[]).length;
  console.log(`#${i}: try:${tryCount} catch:${catchCount} finally:${finallyCount} len:${t.length}`);
}
console.log('\n--- Detailed view for script 3 ---\n');
showInfo(3);
