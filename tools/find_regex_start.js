const fs = require('fs');
const path = process.argv[2] || './tools/script12_content_clean.js';
const errLine = Number(process.argv[3]) || null; // optional error line to focus
const raw = fs.readFileSync(path,'utf8');
// compute index of error position if provided
let errorIndex = null;
if(errLine){
  const lines = raw.split(/\r?\n/);
  let sum = 0; for(let i=0;i<errLine-1;i++) sum += lines[i].length + 1; // +1 for \n
  // don't use column, just use sum
  errorIndex = sum;
}

function isInsideStringOrComment(pos){
  let state='normal';
  for(let i=0;i<pos;i++){
    const ch = raw[i];
    const prev = raw[i-1];
    if(state==='normal'){
      if(ch==="'") state='single';
      else if(ch=='"') state='double';
      else if(ch=='`') state='template';
      else if(ch==='/' && raw[i+1]==='/') { state='linecomment'; i++; }
      else if(ch==='/' && raw[i+1]==='*') { state='blockcomment'; i++; }
      else {}
    } else if(state==='single'){
      if(ch==="'" && prev!=='\\') state='normal';
    } else if(state==='double'){
      if(ch=='"' && prev!=='\\') state='normal';
    } else if(state==='template'){
      if(ch=='`' && prev!=='\\') state='normal';
    } else if(state==='linecomment'){
      if(ch==='\n') state='normal';
    } else if(state==='blockcomment'){
      if(ch==='*' && raw[i+1]==='/') { state='normal'; i++; }
    }
  }
  return state!=='normal';
}

// find all slash indices before errorIndex (or entire file)
const slashPositions = [];
for(let i=0;i<raw.length;i++){
  if(raw[i]==='/') slashPositions.push(i);
}

let candidates = slashPositions.filter(p => errorIndex ? p < errorIndex : true);
// filter out those inside strings/comments
candidates = candidates.filter(p => !isInsideStringOrComment(p));

// show last 20 candidates
const out = candidates.slice(-20).map(p => {
  const before = raw.slice(Math.max(0,p-50), p+50).replace(/\r?\n/g,'\\n');
  const line = raw.slice(0,p).split(/\r?\n/).length;
  const col = p - (raw.slice(0,p).lastIndexOf('\n'));
  return { pos: p, line, col, snippet: before };
});
console.log(JSON.stringify({ totalSlash: slashPositions.length, candidatesCount: candidates.length, tail: out }, null, 2));
