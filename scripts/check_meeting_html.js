const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'public', 'meeting.html');

try{
  const src = fs.readFileSync(htmlPath, 'utf8');
  const styleStart = src.indexOf('<style');
  const styleEnd = src.indexOf('</style>');
  const hasStyleBlockClosed = styleStart !== -1 && styleEnd !== -1 && styleEnd > styleStart;
  // ensure no literal inline "<script>" tokens exist inside the style block
  let scriptInsideStyle = false;
  if (hasStyleBlockClosed){
    const inner = src.slice(styleStart, styleEnd + 8);
    scriptInsideStyle = inner.indexOf('<script') !== -1;
  }
  const hasAuth = src.indexOf('firebase-auth-compat.js') !== -1;

  const results = {
    path: htmlPath,
    hasStyleBlockClosed: hasStyleBlockClosed,
    scriptInsideStyle: scriptInsideStyle,
    hasFirebaseAuthInclude: hasAuth
  };

  console.log('check_meeting_html results:\n', JSON.stringify(results, null, 2));
  if (!results.hasStyleBlockClosed){
    console.error('ERROR: missing </style> (style block not closed).');
    process.exitCode = 2;
  }
  if (results.scriptInsideStyle){
    console.error('ERROR: found <script> inside the <style> block.');
    process.exitCode = 4;
  }
  if (!results.hasFirebaseAuthInclude){
    console.error('ERROR: missing firebase-auth-compat.js include.');
    process.exitCode = 3;
  }
}catch(err){
  console.error('Failed to read/validate meeting.html', err);
  process.exitCode = 1;
}
