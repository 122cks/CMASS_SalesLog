const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.resolve(__dirname,'..','public','front.html'),'utf8');
const lines = html.split(/\n/);
for (let i=0;i<lines.length;i++){
  if (lines[i].trim().startsWith('<script')){
    console.log('Line', i+1, lines[i].trim());
  }
}
