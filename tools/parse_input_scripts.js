const fs = require('fs');
const path = 'public/input.html';
const s = fs.readFileSync(path,'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let all = '';
while((m = re.exec(s)) !== null) { all += '\n\n/* script chunk */\n' + m[1]; }
try { new Function(all); console.log('SCRIPTS_PARSE_OK'); }
catch(e) { console.error('SCRIPTS_PARSE_ERR', e.message); console.error(e.stack); process.exit(2); }
