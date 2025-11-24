const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const html = fs.readFileSync(path.join(__dirname,'..','public','front.html'),'utf8');
const scriptRegex = /<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let m; let idx = 0; 
const tmpDir = path.join(__dirname,'..','tmp_script_checks'); if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
while ((m = scriptRegex.exec(html)) !== null){
  idx++;
  const full = m[0];
  const inner = m[1];
  const openTag = full.split('>')[0];
  if (/\ssrc\s*=/.test(openTag)) continue;
  const fname = path.join(tmpDir, `inline_script_${idx}.js`);
  fs.writeFileSync(fname, inner, 'utf8');
  try{
    cp.execSync(`node --check "${fname}"`, { stdio: 'pipe' });
    console.log(`#${idx}: OK`);
  }catch(e){
    console.log(`#${idx}: SYNTAX ERROR`);
    console.log(String(e.stderr || e.stdout || e));
  }
}
