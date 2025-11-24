const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname,'..','public','report.html'), 'utf8');
// Find the first inline <script> that contains the subtitle assignment
const scriptStart = html.indexOf("document.getElementById('subtitle')");
if (scriptStart === -1){ console.error('anchor not found'); process.exit(2); }
// find opening <script> tag before that
const before = html.lastIndexOf('<script', scriptStart);
if (before === -1){ console.error('opening <script> not found'); process.exit(2); }
const openTagEnd = html.indexOf('>', before);
const closeTag = html.indexOf('</script>', openTagEnd);
if (closeTag === -1){ console.error('</script> not found'); process.exit(2); }
const scriptText = html.slice(openTagEnd+1, closeTag);
console.log('Extracted script length:', scriptText.length);
try{
  // parse-only: new Function
  new Function(scriptText);
  console.log('PARSE OK');
}catch(e){
  console.error('PARSE ERROR:', e && e.message);
  if (e && e.stack) console.error(e.stack);
  // Try to find approximate line/column by counting newlines up to error position if available
  // Some JS engines don't give offset; nothing more to do.
  process.exit(1);
}
