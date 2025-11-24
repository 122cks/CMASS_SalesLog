const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '..', 'public', 'sales_staff.csv');
const backupPath = filePath + '.bak';

function parseCSVLine(line){
  const cols = [];
  let cur = '';
  let inQuotes = false;
  for (let i=0;i<line.length;i++){
    const ch = line[i];
    if (inQuotes){
      if (ch === '"'){
        if (i+1 < line.length && line[i+1] === '"'){ cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === ','){ cols.push(cur); cur = ''; }
      else if (ch === '"'){ inQuotes = true; }
      else cur += ch;
    }
  }
  cols.push(cur);
  return cols;
}

function csvEscape(field){
  if (field === null || field === undefined) return '';
  const s = String(field);
  if (s.indexOf(',') !== -1 || s.indexOf('"') !== -1 || s.indexOf('\n') !== -1 || s.indexOf('\r') !== -1){
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function makeStaffKey(raw){
  if (!raw) return '';
  try{ return raw.normalize('NFKC').trim().replace(/\s+/g,''); }catch(e){ return raw.trim().replace(/\s+/g,''); }
}
function stripTitle(name){
  if (!name) return '';
  return name.replace(/\s*(부장|차장|과장|팀장|님|선생님)$/,'').trim();
}

const orig = fs.readFileSync(filePath, 'utf8');
const lines = orig.split(/\r?\n/);
if (lines.length === 0){ console.error('empty file'); process.exit(1); }
const header = parseCSVLine(lines[0]).map(h=>h.trim());

const staffIdx = header.indexOf('staff');
const staffKeyIdx = header.indexOf('staff_key');
const labelIdx = header.indexOf('label');
if (staffIdx === -1 || staffKeyIdx === -1 || labelIdx === -1){
  console.error('expected header columns staff, staff_key, label not found');
  process.exit(2);
}

const mapping = Object.create(null); // staffRaw -> { key,label, occurrences }
let updatedRows = 0;
let totalRows = 0;

for (let i=1;i<lines.length;i++){
  const line = lines[i];
  if (!line || line.trim()==='') continue;
  totalRows++;
  const cols = parseCSVLine(line);
  const staffRaw = (cols[staffIdx] || '').trim();
  const existingKey = (cols[staffKeyIdx] || '').trim();
  const existingLabel = (cols[labelIdx] || '').trim();
  if (!staffRaw) continue;
  if (!mapping[staffRaw]){
    if (existingKey || existingLabel){
      mapping[staffRaw] = { key: existingKey || makeStaffKey(staffRaw), label: existingLabel || stripTitle(staffRaw), occurrences: 1 };
    } else {
      mapping[staffRaw] = { key: makeStaffKey(staffRaw), label: stripTitle(staffRaw), occurrences: 1 };
    }
  } else {
    mapping[staffRaw].occurrences++;
    // prefer explicit values if present in other rows
    if ((!mapping[staffRaw].key || mapping[staffRaw].key==='') && existingKey) mapping[staffRaw].key = existingKey;
    if ((!mapping[staffRaw].label || mapping[staffRaw].label==='') && existingLabel) mapping[staffRaw].label = existingLabel;
  }
}

// Second pass: apply mapping to lines and build new content
const outLines = [];
outLines.push(lines[0]);
for (let i=1;i<lines.length;i++){
  const line = lines[i];
  if (line === undefined) continue;
  if (!line || line.trim()===''){ outLines.push(line); continue; }
  const cols = parseCSVLine(line);
  const staffRaw = (cols[staffIdx] || '').trim();
  if (!staffRaw){ outLines.push(line); continue; }
  const canon = mapping[staffRaw];
  if (canon){
    const newKey = canon.key || makeStaffKey(staffRaw);
    const newLabel = canon.label || stripTitle(staffRaw);
    const curKey = (cols[staffKeyIdx] || '').trim();
    const curLabel = (cols[labelIdx] || '').trim();
    if (curKey !== newKey || curLabel !== newLabel){
      cols[staffKeyIdx] = newKey;
      cols[labelIdx] = newLabel;
      updatedRows++;
    }
  }
  // serialize cols back
  const maxIdx = Math.max(cols.length-1, header.length-1);
  const rowCols = [];
  for (let j=0;j<=maxIdx;j++){
    rowCols.push(csvEscape(cols[j]===undefined?'':cols[j]));
  }
  outLines.push(rowCols.join(','));
}

// write backup and new file
fs.writeFileSync(backupPath, orig, 'utf8');
fs.writeFileSync(filePath, outLines.join('\n'), 'utf8');

// print summary
console.log('fill_staff_keys: totalRows=', totalRows, ' updatedRows=', updatedRows);
const keys = Object.keys(mapping).slice(0,50);
console.log('unique staff count=', Object.keys(mapping).length, ' sample mappings:');
for (const k of keys){ console.log('  "' + k + '" -> key="' + mapping[k].key + '", label="' + mapping[k].label + '", occurrences=' + mapping[k].occurrences); }
console.log('backup written to', backupPath);

process.exit(0);
