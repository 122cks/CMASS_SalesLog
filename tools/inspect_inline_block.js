const fs = require('fs');
const path = 'public/report.html';
const data = fs.readFileSync(path);
const txt = data.toString('utf8');
const startTag = '<script type="text/plain" data-disabled="corrupt-inline">';
const start = txt.indexOf(startTag);
if (start === -1) { console.error('start tag not found'); process.exit(2); }
const after = start + startTag.length;
const endTag = '</script>';
const end = txt.indexOf(endTag, after);
if (end === -1) { console.error('end tag not found'); process.exit(3); }
const block = txt.slice(after, end);
function idxToLineCol(str, idx) {
  const prefix = str.slice(0, idx);
  const lines = prefix.split('\n');
  const line = lines.length;
  const col = lines[lines.length - 1].length + 1;
  return { line, col };
}
const buf = Buffer.from(block, 'utf8');
const results = [];
for (let i = 0; i < buf.length; i++) {
  if (buf[i] > 127) {
    const globalIdx = after + i;
    const lc = idxToLineCol(txt, globalIdx);
    const startCtx = Math.max(0, i - 20);
    const endCtx = Math.min(buf.length, i + 20);
    const slice = buf.slice(startCtx, endCtx);
    const hexs = Array.from(slice).map(b => b.toString(16).padStart(2, '0')).join(' ');
    const textctx = Array.from(slice).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
    results.push({ i, inBlockIndex: i, globalIdx, line: lc.line, col: lc.col, hex: buf[i].toString(16).padStart(2, '0'), ctxHex: hexs, ctxText: textctx });
  }
  if (results.length >= 500) break;
}
const out = [];
out.push('total_bad=' + results.length);
results.forEach((r, idx) => {
  out.push(`BAD#${idx} inBlockIdx=${r.inBlockIndex} globalIdx=${r.globalIdx} line=${r.line} col=${r.col} byte=0x${r.hex} ctxText=...${r.ctxText}... ctxHex=${r.ctxHex}`);
});
fs.writeFileSync('tools/inline_block_bad_positions.txt', out.join('\n'), 'utf8');
// sanitized: remove non-ascii bytes
const sanitizedBuf = Buffer.from(Array.from(buf).filter(b => b <= 127));
fs.writeFileSync('tools/inline_block_sanitized.txt', sanitizedBuf.toString('utf8'), 'utf8');
console.log('wrote tools/inline_block_bad_positions.txt and tools/inline_block_sanitized.txt');
