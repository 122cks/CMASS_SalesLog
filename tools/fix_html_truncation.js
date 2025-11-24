const fs = require('fs');
const path = require('path');
const files = [
  'input.html',
  'public/input.html',
  'android-wrapper/firebase-hosting/input.html',
  'android-wrapper/app/src/main/assets/input.html'
];

function backupAndWrite(filePath, content){
  const bak = filePath + '.bak.' + Date.now();
  try{ fs.copyFileSync(filePath, bak); console.log('backup:', bak); } catch(e){ console.warn('backup failed', e.message); }
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('fixed:', filePath);
}

files.forEach(f => {
  if (!fs.existsSync(f)) { console.warn('missing:', f); return; }
  let raw = fs.readFileSync(f,'utf8');
  const low = raw.toLowerCase();
  const firstDoctype = low.indexOf('<!doctype');
  const secondDoctype = firstDoctype >=0 ? low.indexOf('<!doctype', firstDoctype+1) : -1;
  const firstClose = low.indexOf('</html>');
  let changed = false;
  let newContent = raw;

  if (secondDoctype !== -1){
    // If multiple doctype occurrences, keep the first document until its closing </html> (if present), else keep until second doctype
    if (firstClose !== -1 && firstClose < secondDoctype){
      newContent = raw.slice(0, firstClose + 7);
    } else {
      newContent = raw.slice(0, secondDoctype);
    }
    changed = true;
    console.log(`${f}: removed content after second <!doctype>`);
  } else if (firstClose !== -1 && firstClose !== raw.length - 7){
    // Trim anything after the first closing </html>
    newContent = raw.slice(0, firstClose + 7);
    changed = true;
    console.log(`${f}: trimmed trailing content after </html>`);
  }

  // Extra safety: if file now contains non-ASCII replacement characters � (U+FFFD) warn but do not modify
  if (changed){
    backupAndWrite(f, newContent);
  } else {
    console.log(f + ': no truncation needed');
  }
});

