#!/usr/bin/env node
const fs = require('fs');
const acorn = require('acorn');
const p = process.argv[2] || './tools/script12_content.js';
const raw = fs.readFileSync(p,'utf8');
const lines = raw.split(/\r?\n/);
let prefix='';
for(let i=0;i<lines.length;i++){
  prefix += lines[i] + '\n';
  try{
    acorn.parse(prefix, { ecmaVersion: 2023, sourceType: 'script' });
  }catch(err){
    console.log(JSON.stringify({ failLine: i+1, message: err.message, loc: err.loc || null }, null, 2));
    process.exit(0);
  }
}
console.log(JSON.stringify({ ok: true, totalLines: lines.length }, null, 2));
