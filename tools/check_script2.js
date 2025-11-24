const fs = require('fs');
const path = require('path');
const p = process.env.TEMP + '/report_hosted_after.html';
const code = fs.readFileSync(p, 'utf8');
const re = /<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/ig;
let m, i=0, js='';
while((m=re.exec(code))){ i++; if(i===2){ js=m[1]; break; } }
console.log('--- script #2 length', js.length);
const firstN = js.slice(0, 200);
console.log('first 200 chars:');
console.log(firstN);
console.log('hex codes for first 40 chars:');
for(let k=0;k<Math.min(40, js.length); k++){
  const ch = js.charCodeAt(k);
  process.stdout.write(ch.toString(16).padStart(2,'0') + ' ');
}
console.log('\n--- show maybe problematic lines around top 30 lines:');
const lines = js.split('\n');
for(let li=0; li<Math.min(3000, lines.length); li++){
  console.log((li+1).toString().padStart(4, ' ') + ': ' + lines[li]);
}

// Find first failing line by incremental parse
for(let li=1; li<=lines.length; li++){
  const snippet = lines.slice(0, li).join('\n');
  try{
    new Function(snippet);
  }catch(e){
    console.log('\nfirst failing line (incremental parse):', li);
    const start = Math.max(0, li-3);
    const end = Math.min(lines.length, li+3);
    for(let k=start;k<end;k++){
      console.log('   ', (k+1).toString().padStart(4,' '), lines[k]);
    }
    console.log('\nError message:', e && e.message);
    process.exit(0);
  }
}
console.log('\nNo parse errors found when testing full incremental parse.');
