const fs = require('fs');
const src = 'public/report.html';
const out = 'public/report.cleaned-inline.html';
const startTag = '<script type="text/plain" data-disabled="corrupt-inline">';
const endTag = '</script>';
const html = fs.readFileSync(src,'utf8');
const si = html.indexOf(startTag);
if (si===-1){ console.error('start tag not found'); process.exit(1); }
const after = si + startTag.length;
const ei = html.indexOf(endTag, after);
if (ei===-1){ console.error('end tag not found'); process.exit(2); }
const sanitized = fs.readFileSync('tools/inline_block_sanitized.txt','utf8');
const newHtml = html.slice(0, after) + '\n' + sanitized + '\n' + html.slice(ei);
fs.writeFileSync(out, newHtml,'utf8');
console.log('wrote', out);