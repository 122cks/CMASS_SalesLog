const fs = require('fs');
const path = require('path');
function check(file){
  const content = fs.readFileSync(file,'utf8');
  const counts = {
    '{': (content.match(/{/g)||[]).length,
    '}': (content.match(/}/g)||[]).length,
    '`': (content.match(/`/g)||[]).length,
    '<script>': (content.match(/<script>/g)||[]).length,
    '<script': (content.match(/<script/gi)||[]).length,
    '</script>': (content.match(/<\/script>/gi)||[]).length
  };
  console.log('File:', file);
  console.log('Counts:', counts);
  if(counts['{'] !== counts['}']){
    console.log('Mismatch braces: { != }');
  }
  if(counts['`'] % 2 !== 0){
    console.log('Odd number of backticks (`) - possible unclosed template literal');
  }
  // Find last occurrences for quick inspection
  const lastOpenIdx = content.lastIndexOf('{');
  const lastCloseIdx = content.lastIndexOf('}');
  console.log('Last { at', lastOpenIdx, 'last } at', lastCloseIdx);
  const lines = content.split(/\r?\n/);
  // Print a window around lastOpenIdx and lastCloseIdx
  function posToLineCol(idx){
    const pre = content.slice(0, idx);
    const line = pre.split(/\r?\n/).length;
    const col = idx - pre.lastIndexOf('\n');
    return {line,col};
  }
  if(lastOpenIdx>=0) console.log('last { ->', posToLineCol(lastOpenIdx));
  if(lastCloseIdx>=0) console.log('last } ->', posToLineCol(lastCloseIdx));
}
const files = process.argv.slice(2);
if(!files.length){
  console.error('Usage: node check_balance.js <file1> [file2] ...'); process.exit(2);
}
for(const f of files){
  try{ check(f); }catch(e){ console.error('Error reading', f, e); }
}
