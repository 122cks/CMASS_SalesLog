const fs = require('fs');
const path = require('path');
const file = process.argv[2];
const start = parseInt(process.argv[3],10)||1;
const end = parseInt(process.argv[4],10)||start;
if (!file){ console.error('Usage: node show-lines.js <file> <start> <end>'); process.exit(2); }
const p = path.resolve(process.cwd(), file);
const txt = fs.readFileSync(p,'utf8');
const lines = txt.split('\n');
for (let i = start; i <= end; i++){
  const ln = lines[i-1]!==undefined?lines[i-1]:'';
  console.log((i).toString().padStart(4)+': '+ln);
}
