#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
let acorn;
try{ acorn = require('acorn'); }catch(e){ console.error('acorn not installed. Run npm i acorn'); process.exit(2); }

const file = process.argv[2] || path.join(__dirname, '..', 'public', 'meeting.html');
let raw;
try{ raw = fs.readFileSync(file, 'utf8'); }catch(e){ console.error('failed to read', file, e.message); process.exit(3); }

const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
let match; let idx = 0; const results = [];
while((match = scriptRegex.exec(raw)) !== null){
  idx++;
  const fullMatch = match[0];
  const content = match[1];
  const matchStart = match.index;
  // compute line number of start of script content (1-based)
  const before = raw.slice(0, matchStart);
  const startLine = before.split('\n').length; // line where <script...> starts
  // but content starts after the opening tag; adjust to first line inside content
  const openingTag = fullMatch.split('>')[0] + '>';
  const openTagLines = openingTag.split('\n').length - 1;
  const contentStartLine = startLine + openTagLines;

  // try parse
  try{
    acorn.parse(content, { ecmaVersion: 2023, sourceType: 'script', locations: true });
    results.push({ index: idx, ok: true, startLine: contentStartLine, length: content.split('\n').length });
  }catch(err){
    const loc = err.loc || { line: 0, column: 0 };
    const fileLine = contentStartLine + (loc.line ? loc.line - 1 : 0);
    results.push({ index: idx, ok: false, error: { message: err.message, loc: loc }, startLine: contentStartLine, fileLine });
    // write failing script content to disk for further inspection
    try{ fs.writeFileSync(path.join(__dirname, 'script_failed_index_' + idx + '.js'), content, 'utf8'); }catch(e){}
    // stop early and print the error
    console.log(JSON.stringify({ file, scriptIndex: idx, startLine: contentStartLine, fileLine, message: err.message, loc: loc, dumped: path.join(__dirname, 'script_failed_index_' + idx + '.js') }, null, 2));
    process.exit(0);
  }
}
console.log(JSON.stringify({ file, totalScripts: idx, results }, null, 2));
