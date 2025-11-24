
const fs = require('fs');
const p = process.argv[2] || './tools/script12_content_clean.js';
const s = fs.readFileSync(p,'utf8');
let out=[];
let state='normal'; // normal, single, double, template, linecomment, blockcomment
for(let i=0;i<s.length;i++){
  const ch = s[i];
  const prev = s[i-1];
  if(state==='normal'){
    if(ch==="'") { state='single'; }
    else if(ch=='"') { state='double'; }
    else if(ch=='`') { state='template'; }
    else if(ch==='/' && s[i+1]==='/'){ state='linecomment'; i++; }
    else if(ch==='/' && s[i+1]==='*'){ state='blockcomment'; i++; }
    else if(ch==='/' ){
      // record position
      // compute line/col
      const up = s.slice(0,i);
      const line = up.split(/\r?\n/).length;
      const col = i - up.lastIndexOf('\n');
      out.push({ i, line, col, context: s.slice(Math.max(0,i-20), Math.min(s.length,i+20)).replace(/\r?\n/g,'\\n') });
    }
  } else if(state==='single'){
    if(ch==="'" && prev!=='\\') state='normal';
  } else if(state==='double'){
    if(ch=='"' && prev!=='\\') state='normal';
  } else if(state==='template'){
    if(ch=='`' && prev!=='\\') state='normal';
  } else if(state==='linecomment'){
    if(ch==='\n') state='normal';
  } else if(state==='blockcomment'){
    if(ch==='*' && s[i+1]==='/'){ state='normal'; i++; }
  }
}
console.log(JSON.stringify({count: out.length, matches: out.slice(-30)}, null, 2));
