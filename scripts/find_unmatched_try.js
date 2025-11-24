const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname,'..','public','front.html'),'utf8');
const parts = html.split(/<script[^>]*>/i);
const scripts = [];
for (let i=1;i<parts.length;i++){
  const tail = parts[i].split(/<\/script>/i);
  scripts.push(tail[0]);
}
function findUnmatchedTrys(idx){
  const s = scripts[idx-1] || '';
  const out = [];
  // naive lexer: find 'try' tokens followed by '{'
  for (let i=0;i<s.length;i++){
    if (s[i] === 't' && s.slice(i,i+3) === 'try'){
      // ensure word boundary
      const before = s[i-1];
      const after = s[i+3];
      if ((before && /[a-zA-Z0-9_$]/.test(before)) || (after && /[a-zA-Z0-9_$]/.test(after))) continue;
      // skip whitespace then expect '{'
      let j = i+3;
      while (j < s.length && /[\s\n\r\t]/.test(s[j])) j++;
      if (s[j] !== '{') continue; // not a try { pattern
      // find matching '}' for this block
      let depth = 0;
      let k = j;
      let inSingle = false, inDouble = false, inTemplate = false, inRegex=false, esc=false;
      for (;k < s.length;k++){
        const ch = s[k];
        if (esc){ esc = false; continue; }
        if (inSingle){ if (ch === "'" ) inSingle = false; if (ch === '\\') esc = true; continue; }
        if (inDouble){ if (ch === '"') inDouble = false; if (ch === '\\') esc = true; continue; }
        if (inTemplate){ if (ch === '`') inTemplate = false; if (ch === '\\') esc = true; continue; }
        if (ch === "'") { inSingle = true; continue; }
        if (ch === '"') { inDouble = true; continue; }
        if (ch === '`') { inTemplate = true; continue; }
        if (ch === '{') { depth++; continue; }
        if (ch === '}') { depth--; if (depth === 0) break; continue; }
      }
      if (k >= s.length) { out.push({start:i, openBracePos:j, closePos:k, reason:'eof'}); continue; }
      // find next token after close brace
      let m = k+1;
      while (m < s.length && /[\s\n\r\t;]/.test(s[m])) m++;
      const next = s.slice(m, m+6);
      if (next.startsWith('catch') || next.startsWith('finally')){
        // matched
      } else {
        out.push({start:i, openBracePos:j, closePos:k, nextSnippet: s.slice(m, m+40)});
      }
      i = k; // advance
    }
  }
  return out;
}
const res = findUnmatchedTrys(3);
console.log('Unmatched try count in script 3:', res.length);
res.forEach((r,idx)=>{
  console.log('--- Unmatched try #' + (idx+1) + ' ---');
  const s = scripts[2];
  // compute line numbers
  const upto = s.slice(0, r.start);
  const lineNum = upto.split(/\n/).length;
  console.log('position charIndex=', r.start, 'approx line=', lineNum);
  const lines = s.split(/\n/);
  const startLine = Math.max(0, lineNum - 6);
  const endLine = Math.min(lines.length, lineNum + 6);
  for (let L = startLine; L < endLine; L++){
    const ln = (L+1).toString().padStart(4,' ');
    console.log(ln + ' | ' + lines[L]);
  }
  console.log('--- nextSnippet:');
  console.log(r.nextSnippet ? r.nextSnippet.replace(/\n/g,'\\n') : 'EOF');
});
