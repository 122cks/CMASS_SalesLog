
#!/usr/bin/env node
const fs = require('fs');
const acorn = require('acorn');
const p = process.argv[2] || './tools/script12_content_clean.js';
const raw = fs.readFileSync(p,'utf8');
const tokenizer = acorn.tokenizer(raw, { ecmaVersion: 2023, locations: true });
const tokens = [];
let braceStack = [];
try{
  while(true){
    const tok = tokenizer.getToken();
    tokens.push(tok);
    if (tok.type.label === '{') braceStack.push(tok.loc.start);
    if (tok.type.label === '}') braceStack.pop();
    if (tok.type.label === 'eof') break;
  }
}catch(err){
  console.error('tokenization error:', err.message, 'at', JSON.stringify(err.loc));
  // print last 40 tokens for context
  const last = tokens.slice(-40).map(t=>({ label: t.type.label, value: t.value, start: t.start, end: t.end, loc: t.loc }));
  console.log(JSON.stringify({ lastTokens: last, braceStack: braceStack.map(b=>({line:b.line,column:b.column})) }, null, 2));
  process.exit(0);
}
console.log('tokenization completed OK');
