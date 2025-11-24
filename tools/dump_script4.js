const fs = require('fs');
const html = fs.readFileSync('public/input.html','utf8');
const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m; let i=0;
while((m = scriptRe.exec(html))){
  i++;
  if(i===4){
    const lines = m[1].split(/\r?\n/);
    console.log('--- script #4 start ---');
    lines.forEach((l,idx)=>console.log(String(idx+1).padStart(4)+': '+l));
    console.log('--- script #4 end ---');
    break;
  }
}
