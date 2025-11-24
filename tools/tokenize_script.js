
#!/usr/bin/env node
const fs = require('fs');
const acorn = require('acorn');
const p = process.argv[2] || './tools/script12_content_clean.js';
const raw = fs.readFileSync(p,'utf8');
try{
  const tokenizer = acorn.tokenizer(raw, { ecmaVersion: 2023 });
  while(true){
    const tok = tokenizer.getToken();
    if (tok.type.label === 'eof') break;
    // nothing
  }
  console.log('tokenized ok');
}catch(err){
  console.log(JSON.stringify({ message: err.message, loc: err.loc || null }, null, 2));
  process.exit(0);
}
