// Shared CSV helper utilities for CMASS
// Provides: parseCsv(text), fetchCsvRows(), parseSchoolMetaCsv(csvText)
// Exposed on window for backward compatibility.
(function(){
  'use strict';

  function parseCsv(text){
    try{ text = (text || '').replace(/^\uFEFF/, ''); }catch(e){}
    const rows = [];
    let cur = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < (text || '').length; i += 1){
      const ch = text[i];
      if (inQuotes){
        if (ch === '"'){
          if (text[i + 1] === '"'){ field += '"'; i += 1; continue; }
          inQuotes = false; continue;
        }
        field += ch; continue;
      }
      if (ch === '"'){ inQuotes = true; continue; }
      if (ch === ','){ cur.push(field); field = ''; continue; }
      if (ch === '\r') continue;
      if (ch === '\n'){ cur.push(field); rows.push(cur); cur = []; field = ''; continue; }
      field += ch;
    }
    if (field !== '' || cur.length) { cur.push(field); rows.push(cur); }
    return rows;
  }

  async function fetchCsvRows(){
    try{
      if (window._cmass_cachedCsvRows && Array.isArray(window._cmass_cachedCsvRows)){
        return window._cmass_cachedCsvRows.map((row) => Array.isArray(row) ? row.slice() : row);
      }
    }catch(e){}
    const candidates = ['/sales_staff.csv','/sales_staff.deployed.csv','/sales_staff_live.csv'];
    for (const path of candidates){
      try{
        const res = await fetch(path, { cache: 'no-store' }).catch(() => null);
        if (!res || !res.ok) continue;
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (!(ct.includes('csv') || ct.includes('text/plain') || ct.includes('application/octet-stream'))) continue;
        const text = await res.text();
        if (!text || !text.trim()) continue;
        const parsed = parseCsv(text);
        if (parsed && parsed.length){
          try{ window._cmass_cachedCsvRows = parsed; }catch(e){}
          return parsed.map((row) => Array.isArray(row) ? row.slice() : row);
        }
      }catch(e){ /* try next candidate */ }
    }
    return null;
  }

  function parseSchoolMetaCsv(csvText){
    if (!csvText || !csvText.trim()) return null;
    try{
      const lines = csvText.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) return null;
      const headers = lines[0].split(',').map(h => h.trim());
      const values = lines[1].split(',').map(v => v.trim());
      const meta = {};
      headers.forEach((header, idx) => { if (values[idx]) meta[header] = values[idx]; });

      // canonicalize keys (g1c,g1s,g1avg etc.)
      try{
        function findKey(obj, patterns){
          const keys = Object.keys(obj||{});
          for(const p of patterns){
            const re = (typeof p === 'string') ? new RegExp(p,'i') : p;
            for(const k of keys){ if(re.test(k)) return k; }
          }
          return null;
        }
        const staffKey = findKey(meta, ['^staff$','담당자','담당']); if (staffKey && !meta.staff) meta.staff = meta[staffKey];
        const specialFlagKey = findKey(meta, ['특성화','학교특성','특성화고 구분','특성화구분']); if (specialFlagKey && !meta.special) meta.special = meta[specialFlagKey];
        const regionKey = findKey(meta, ['^region$','지역','시도교육청','교육지원청']); if (regionKey && !meta.region) meta.region = meta[regionKey];
        const codeKey = findKey(meta, ['정보공시학교코드','school code','code','학교코드']); if (codeKey && !meta.schoolCode) meta.schoolCode = meta[codeKey];

        const keys = headers.slice();
        for (let i = 0; i < keys.length; i++){
          const h = (keys[i] || '').trim(); const v = (values[i] || '').trim(); if (!v) continue;
          if (/1\D*학년|\b1학년\b/i.test(h) && /학급/.test(h)) meta.g1c = Number(v) || meta.g1c;
          if (/2\D*학년|\b2학년\b/i.test(h) && /학급/.test(h)) meta.g2c = Number(v) || meta.g2c;
          if (/3\D*학년|\b3학년\b/i.test(h) && /학급/.test(h)) meta.g3c = Number(v) || meta.g3c;
          if (/1\D*학년|\b1학년\b/i.test(h) && /학생/.test(h)) meta.g1s = Number(v) || meta.g1s;
          if (/2\D*학년|\b2학년\b/i.test(h) && /학생/.test(h)) meta.g2s = Number(v) || meta.g2s;
          if (/3\D*학년|\b3학년\b/i.test(h) && /학생/.test(h)) meta.g3s = Number(v) || meta.g3s;
          if (/1\D*학년|\b1학년\b/i.test(h) && /학급당/.test(h)) meta.g1avg = Number(v) || meta.g1avg;
          if (/2\D*학년|\b2학년\b/i.test(h) && /학급당/.test(h)) meta.g2avg = Number(v) || meta.g2avg;
          if (/3\D*학년|\b3학년\b/i.test(h) && /학급당/.test(h)) meta.g3avg = Number(v) || meta.g3avg;
          if (/학급.*계|학급수계|총학급수|학급수\s*계|학급수$/i.test(h)) meta.totalClasses = Number(v) || meta.totalClasses;
          if (/학생.*계|학생수계|총학생수|학생수\s*계|학생수$/i.test(h)) meta.totalStudents = Number(v) || meta.totalStudents;
        }
        try{
          if ((!meta.totalClasses || Number.isNaN(meta.totalClasses)) && (meta.g1c || meta.g2c || meta.g3c)){
            meta.totalClasses = (Number(meta.g1c)||0) + (Number(meta.g2c)||0) + (Number(meta.g3c)||0);
          }
          if ((!meta.totalStudents || Number.isNaN(meta.totalStudents)) && (meta.g1s || meta.g2s || meta.g3s)){
            meta.totalStudents = (Number(meta.g1s)||0) + (Number(meta.g2s)||0) + (Number(meta.g3s)||0);
          }
        }catch(e){}
      }catch(e){}
      return meta;
    }catch(e){ return null; }
  }

  // Expose to window
  try{
    window.parseCsv = parseCsv;
    window.fetchCsvRows = fetchCsvRows;
    window.parseSchoolMetaCsv = parseSchoolMetaCsv;
  }catch(e){ /* non-fatal */ }

  try{ if (typeof module !== 'undefined' && module.exports) module.exports = { parseCsv, fetchCsvRows, parseSchoolMetaCsv }; }catch(e){}

})();
