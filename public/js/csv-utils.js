// CSV utilities extracted from public/order.html for reuse
// Provides: fetchCsv, parseCsvText, normalizeSchool, escapeHtml

async function fetchCsvFlexible(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error('fetch failed: '+url);
  const buf = await res.arrayBuffer();
  const tryDecode = enc => { try{ return new TextDecoder(enc).decode(buf); } catch(e){ return null; } };
  let txt = tryDecode('utf-8');
  if(!txt || txt.indexOf(',')===-1){ txt = tryDecode('euc-kr') || tryDecode('windows-949') || tryDecode('shift_jis') || tryDecode('utf-8'); }
  if(!txt) txt = new TextDecoder().decode(buf);
  return parseCsvText(String(txt));
}

function parseCsvText(txt){
  if(!txt) return { header: [], rows: [] };
  const lines = String(txt).split(/\r?\n/);
  // trim possible leading/trailing empty lines
  while(lines.length && lines[0].trim()==='') lines.shift();
  while(lines.length && lines[lines.length-1].trim()==='') lines.pop();
  if(!lines.length) return { header: [], rows: [] };
  function parseLine(line){
    const out=[]; let cur=''; let inQ=false;
    for(let i=0;i<line.length;i++){ const ch=line[i];
      if(ch==='"'){ inQ = !inQ; continue; }
      if(ch===',' && !inQ){ out.push(cur); cur=''; continue; }
      cur += ch;
    }
    out.push(cur);
    return out.map(s=>s.trim());
  }
  const headerArr = parseLine(lines[0]).map(h=>h.replace(/"/g,'').trim());
  const rowsObj = [];
  for(let i=1;i<lines.length;i++){
    const line = lines[i];
    if(!line || line.trim()==='') continue;
    const cols = parseLine(line);
    const obj = {};
    for(let j=0;j<headerArr.length;j++){
      obj[headerArr[j] || ('c'+j)] = cols[j] || '';
    }
    rowsObj.push(obj);
  }
  const looksLikeHeader = headerArr.some(h=> /교재명|교지명|도서명|학교|school|정가|금액|교과군|과목명|정보공시학교코드/i.test(h));
  if(!looksLikeHeader){
    // fallback: treat first line as data row too and create generic headers c0,c1.. with all rows
    const all = [headerArr].concat(rowsObj.map(r=> Object.values(r)));
    const hdr = headerArr.map((_,i)=> 'c'+i);
    const resultRows = all.map(cols=>{ const o={}; for(let j=0;j<hdr.length;j++) o[hdr[j]] = cols[j]||''; return o; });
    return { header: hdr, rows: resultRows };
  }
  return { header: headerArr, rows: rowsObj };
}

function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function normalizeSchool(s){ if(!s) return '__unknown__'; s=String(s).trim().toLowerCase(); s=s.replace(/\s+/g,''); s=s.replace(/["'`\.,\-\/\\()\[\]]+/g,''); s=s.replace(/(초등학교|초등|중학교|중등학교|중등|고등학교|고등|학교|학교명)$/g,''); return s||'__unknown__'; }

// export functions for old-style script includes
window.csvUtils = window.csvUtils || {};
window.csvUtils.fetchCsv = fetchCsvFlexible;
window.csvUtils.parseCsvText = parseCsvText;
window.csvUtils.normalizeSchool = normalizeSchool;
window.csvUtils.escapeHtml = escapeHtml;
