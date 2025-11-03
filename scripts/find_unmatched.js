const fs = require('fs');
function analyze(file){
  const text = fs.readFileSync(file,'utf8');
  const stack = [];
  let inSingle=false,inDouble=false,inBack=false,inLineComment=false,inBlockComment=false,escaped=false;
  let firstBacktickPos = null;
  let line=1,col=0;
  const unmatchedPositions=[];
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    col++;
    // newline handling
    if(ch === '\n'){ line++; col=0; inLineComment=false; continue; }
    // handle comment starts
    const two = text.substr(i,2);
  if(!inSingle && !inDouble && !inBack && !inBlockComment && two==='//' ){ inLineComment=true; i++; col++; continue; }
    if(!inSingle && !inDouble && !inBack && !inLineComment && two==='/*'){ inBlockComment=true; i++; col++; continue; }
    if(inBlockComment && two==='*/'){ inBlockComment=false; i++; col++; continue; }
    if(inLineComment || inBlockComment) continue;
    if(ch==='\\') { escaped = !escaped; continue; }
    if(!escaped && ch==='"' && !inSingle && !inBack){ inDouble = !inDouble; continue; }
    if(!escaped && ch==="'" && !inDouble && !inBack){ inSingle = !inSingle; continue; }
  if(!escaped && ch==='`' && !inSingle && !inDouble){ inBack = !inBack; if(inBack && firstBacktickPos===null) firstBacktickPos={line,col,i}; continue; }
    escaped = false;
    if(inSingle || inDouble || inBack) continue;
    if(ch==='{'){ stack.push({line,col,i}); }
    else if(ch==='}'){ if(stack.length) stack.pop(); else unmatchedPositions.push({type:'extraClose',line,col,i}); }
  }
  return {file, remainingOpens:stack, extraCloses:unmatchedPositions};
}
const files = process.argv.slice(2);
if(!files.length){ console.error('Usage'); process.exit(2); }
for(const f of files){
  const res = analyze(f);
  console.log('File:', f);
  console.log('Extra closing braces found:', res.extraCloses.length);
  console.log('Unclosed opening braces count:', res.remainingOpens.length);
  if(res.extraCloses.length) console.log('First extra close at', res.extraCloses[0]);
  if(res.remainingOpens.length){
    console.log('First unclosed opening brace at', res.remainingOpens[0]);
    console.log('Last unclosed opening brace at', res.remainingOpens[res.remainingOpens.length-1]);
      console.log('All unclosed openings:', JSON.stringify(res.remainingOpens, null, 2));
    // print a small context around first unclosed
    const txt = fs.readFileSync(f,'utf8');
    const pos = res.remainingOpens[0].i;
    const start = Math.max(0,pos-120);
    const end = Math.min(txt.length,pos+120);
    console.log('Context around first unclosed:\n' + txt.slice(start,end));
    // also print first backtick position if present
    const firstBacktick = txt.indexOf('`');
    if(firstBacktick!==-1) console.log('First backtick at char index', firstBacktick);
  }
}
