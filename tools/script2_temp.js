// Auto-generated temporary file containing inline script #2 for parse debugging
// DO NOT COMMIT
const fs = require('fs');
const js = fs.readFileSync(process.env.TEMP + '/report_hosted_after.html','utf8').match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i)[1];
// write out script to separate file for node to parse
require('fs').writeFileSync(process.env.TEMP + '/report_script2.js', js, 'utf8');
console.log('wrote', process.env.TEMP + '/report_script2.js');
// now attempt to run the generated file (it may throw at runtime if it references browser globals)
console.log('running node on generated file to surface parse errors...');
require(process.env.TEMP + '/report_script2.js');
console.log('done');
