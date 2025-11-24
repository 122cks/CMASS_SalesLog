const fs = require('fs');
const s = fs.readFileSync('c:/Users/PC/OneDrive/cmass-sales-system/CMASS_SalesLog/tools/repair/inline_4.js','utf8');
function cnt(re){ return (s.match(re) || []).length; }
console.log({ '{': cnt(/\{/g), '}': cnt(/\}/g), '(': cnt(/\(/g), ')': cnt(/\)/g), '`': cnt(/`/g), 'singleQuote': cnt(/'/g), 'doubleQuote': cnt(/"/g) });
