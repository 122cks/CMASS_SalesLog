
    // Dashboard: read visit_entries from Firestore and render KPIs + charts + table
    (function(){
    // extended palette for many categories (keeps good contrast)
      const palette = ['#1e3c72','#2a5298','#ff9800','#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc949','#af7aa1','#9c755f','#9b5de5','#00c2cb','#ff6f91','#845ec2','#2b2d42','#0081a7','#f08a5d','#b83b5e','#4cc9f0'];
      // Shared y-axis options for 100% stacked percent charts
      const PERCENT_STACK_Y_OPTIONS = {
        stacked: true,
        beginAtZero: true,
        suggestedMin: 0,
        suggestedMax: 100,
        max: 100,
        title: { display: true, text: '비율' },
        ticks: { stepSize: 10, callback: v => `${v}%`, autoSkip: false, maxTicksLimit: 11 }
      };
  // Public holidays (YYYY-MM-DD) used to exclude days from business-day calculations.
  // 2025 South Korea public holidays (common observed dates). Includes multi-day
  // Lunar holidays (Seollal/Chuseok) and temporary/compensatory dates as published.
  const HOLIDAYS = [
    '2025-01-01', // New Year's Day
    '2025-01-27', // Korean New Year Holiday (pre-seollal)
    '2025-01-28', // Korean New Year Holiday
    '2025-01-29', // Seollal (Korean New Year)
    '2025-01-30', // Korean New Year Holiday (post-seollal)
    '2025-03-01', // Independence Movement Day
    '2025-05-01', // Workers' Day (widely observed)
    '2025-05-05', // Children's Day & Buddha's Birthday (2025 coincides)
    '2025-06-03', // Temporary public holiday (announced for 2025)
    '2025-06-06', // Memorial Day
    '2025-07-17', // Constitution Day
    '2025-08-15', // Liberation Day
    '2025-10-03', // National Foundation Day
    '2025-10-05', // Chuseok holiday (pre-day)
    '2025-10-06', // Chuseok (Harvest Festival)
    '2025-10-07', // Chuseok holiday (post-day)
    '2025-10-09', // Hangeul Day
    '2025-12-25'  // Christmas Day
  ];
  // Daily per-person targets
  const DAILY_SCHOOL_TARGET = 5; // 방문 학교수 목표/영업일
  const DAILY_MEETING_TARGET = 20; // 미팅(방문) 목표/영업일
      let charts = {};
      // sales staff CSV map (school name -> metadata)
      let salesStaffMap = new Map();
      let salesStaffLoaded = false;

      // Load sales_staff.csv from public and build a lookup map by school name
      async function loadSalesStaffCsv(){
        try{
          const res = await fetch('/sales_staff.csv');
          if(!res.ok) return;
          const txt = await res.text();
          const lines = txt.split(/\r?\n/).filter(Boolean);
          if(!lines.length) return;
          const header = lines[0].split(',').map(h=>h.trim().replace(/^\"|\"$/g,''));
          const idx = {};
          header.forEach((h,i)=> idx[h]=i);
          // store header/index for later lookups
          window.__salesStaffHeader = header;
          window.__salesStaffIdx = idx;
          // helper to find header that contains given substring (case-sensitive for Korean)
          function findHeaderContaining(sub){
            for(let h of header){ if(!h) continue; if(String(h).indexOf(sub) !== -1) return h; }
            return null;
          }

          for(let i=1;i<lines.length;i++){
            const cols = lines[i].split(',').map(c=>c.trim().replace(/^"|"$/g,''));
            if(!cols.length) continue;
            // find school name column (prefer 'school' or any header containing '학교' or 'school')
            let schoolName = '';
            if(idx['school'] !== undefined && cols[idx['school']]) schoolName = cols[idx['school']];
            if(!schoolName){
              const h = findHeaderContaining('학교');
              if(h && idx[h] !== undefined) schoolName = cols[idx[h]];
            }
            if(!schoolName) continue;

            // total students: prefer header '학생수계' or any header containing '학생수계' or '학생수'
            let total = '';
            const totalHeader = header.find(h=> h==='학생수계' || (h && h.indexOf('학생수계')!==-1) );
            if(totalHeader && idx[totalHeader] !== undefined) total = cols[idx[totalHeader]];
            if(!total){
              const alt = header.find(h=> h && h.indexOf('학생수')!==-1 && !h.match(/^1학년|^2학년|^3학년/));
              if(alt && idx[alt] !== undefined) total = cols[idx[alt]];
            }

            // establishment and level
            let est = '';
            const estHeader = header.find(h=> h && (h==='설립구분' || h.indexOf('설립')!==-1)); if(estHeader && idx[estHeader]!==undefined) est = cols[idx[estHeader]];
            let lvl = '';
            const lvlHeader = header.find(h=> h && (h==='학교급' || h.indexOf('학교급')!==-1 || h==='학교급코드')); if(lvlHeader && idx[lvlHeader]!==undefined) lvl = cols[idx[lvlHeader]];

            // grade student counts: look for headers containing '1학년'+'학생수', etc.
            function findColByHeaderMatch(regex){ for(const h of header){ if(!h) continue; if(regex.test(h)) return cols[idx[h]]; } return ''; }
            const g1 = findColByHeaderMatch(/^1학년.*학생수|^1학년학생수|1학년학생수/);
            const g2 = findColByHeaderMatch(/^2학년.*학생수|^2학년학생수|2학년학생수/);
            const g3 = findColByHeaderMatch(/^3학년.*학생수|^3학년학생수|3학년학생수/);

            // features: look for '학교특성' or '학교특성' like headers
            const featuresHeader = header.find(h=> h && (h.indexOf('학교특성')!==-1 || h.indexOf('학교특성')!==-1 || h.indexOf('학교특성')!==-1 || h.indexOf('특성')!==-1));
            let featuresVal = '';
            if(featuresHeader && idx[featuresHeader] !== undefined) featuresVal = cols[idx[featuresHeader]];

            salesStaffMap.set(schoolName.trim().toLowerCase(), { school: schoolName, totalStudents: total? Number(total)||0 : 0, establishment: est||'', schoolLevel: lvl||'', raw: cols, grade1: g1, grade2: g2, grade3: g3, features: featuresVal });
          }
        }catch(e){ console.warn('loadSalesStaffCsv failed', e); }
        salesStaffLoaded = true;
      }

      // start loading CSV immediately
      loadSalesStaffCsv();

      function q(selector){ return document.querySelector(selector); }

      async function fetchVisits({staff='', start='', end='', region='', subject='', establishment='', schoolLevel='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0}={}){
        try{ await window.waitForFirebase(); }catch(e){ console.warn('firebase not ready', e); }
        if (!window.__db) return [];
        const col = window.__db.collection('visit_entries');
        try{
          // Default: fetch full collection (optionally filtered by staff) for KPIs and charts.
          let qref = col;
          if (staff) qref = qref.where('staff','==', staff);
          qref = qref.limit(5000);
          const snap = await qref.get();
          const docs = (snap && snap.docs) ? snap.docs.map(d=>{ const data = d.data(); data.id = d.id; return data; }) : [];

          // enrich docs with sales_staff.csv metadata when available
          try{
            const startWait = Date.now();
            while(!salesStaffLoaded && Date.now() - startWait < 800) await new Promise(r=>setTimeout(r,50));
            if(salesStaffLoaded){
              docs.forEach(d=>{
                const name = (d.school||'').trim().toLowerCase();
                if(!name) return;
                const m = salesStaffMap.get(name);
                if(m){
                  if(!d.totalStudents || Number(d.totalStudents) === 0) d.totalStudents = m.totalStudents;
                  if(!d.establishment) d.establishment = d.establishment || m.establishment;
                  if(!d.schoolLevel) d.schoolLevel = d.schoolLevel || m.schoolLevel;
                }
              });
            }
          }catch(e){ console.warn('enrich from csv failed', e); }

          // client-side filters: date range / region / subject
          function normDate(d){ if(!d) return ''; if(typeof d==='string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0,10); if(d._seconds) return (new Date(Number(d._seconds)*1000)).toISOString().substring(0,10); return (new Date(d)).toISOString().substring(0,10); }
          let out = docs.map(r=>{ r._date = normDate(r.visitDate||r._savedAt||r.createdAt); return r; });
          if (start) out = out.filter(d=> d._date && d._date >= start);
          if (end) out = out.filter(d=> d._date && d._date <= end);
          if (region) out = out.filter(d=> (d.region||'').toLowerCase().indexOf(region.toLowerCase())!==-1 );
          if (establishment) out = out.filter(d=> { const e = String(d.establishment || d.establish || d['설립구분'] || d.설립 || d.schoolEstablish || '').toLowerCase(); return e.indexOf(establishment.toLowerCase()) !== -1; });
          if (schoolLevel) out = out.filter(d=> { const l = String(d.schoolLevel || d.school_grade || d['학교급'] || d.학교급 || '').toLowerCase(); return l.indexOf(schoolLevel.toLowerCase()) !== -1; });
          if (minStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s >= Number(minStudents); });
          if (maxStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s <= Number(maxStudents); });
          // filter by activity count
          if (minActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount >= Number(minActivities); });
          if (maxActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount <= Number(maxActivities); });
          // filter by materials/transferred items count
          if (minMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount >= Number(minMaterials); });
          if (maxMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount <= Number(maxMaterials); });
          if (subject) out = out.filter(d=> { const subs = Array.isArray(d.subject)? d.subject : (Array.isArray(d.subjects)? d.subjects : (d.subject? [d.subject] : (d.subjects? [d.subjects] : []))); return subs.some(s=> String(s).toLowerCase().indexOf(subject.toLowerCase())!==-1); });
          return out.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
        }catch(e){ console.warn('fetchVisits failed', e); return []; }
      }

      // Fetch only documents that have backend `issue` non-empty. Used for recent-issues list.
      async function fetchIssueVisits({staff='', start='', end='', region='', subject='', establishment='', schoolLevel='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0}={}){
        try{ await window.waitForFirebase(); }catch(e){ console.warn('firebase not ready', e); }
        if (!window.__db) return [];
        const col = window.__db.collection('visit_entries');
        try{
          // Query for docs that have an `issue` field, but do NOT assume the
          // stored staff identifier matches the UI select value. Some docs use
          // `staff` (english id) and others use `staffLabel` (korean display).
          // To be robust, fetch the issue docs and apply staff filtering
          // client-side matching both fields (case-insensitive). Keep a
          // reasonable limit to avoid excessive reads.
          let q = col.where('issue','>','');
          const snap = await q.limit(5000).get();
          const docs = (snap && snap.docs) ? snap.docs.map(d=>{ const data = d.data(); data.id = d.id; return data; }) : [];
          // enrich and apply same client-side filters
          try{ const startWait = Date.now(); while(!salesStaffLoaded && Date.now() - startWait < 800) await new Promise(r=>setTimeout(r,50)); if(salesStaffLoaded){ docs.forEach(d=>{ const name = (d.school||'').trim().toLowerCase(); if(!name) return; const m = salesStaffMap.get(name); if(m){ if(!d.totalStudents || Number(d.totalStudents) === 0) d.totalStudents = m.totalStudents; if(!d.establishment) d.establishment = d.establishment || m.establishment; if(!d.schoolLevel) d.schoolLevel = d.schoolLevel || m.schoolLevel; } }); } }catch(e){ console.warn('enrich from csv failed', e); }
          function normDate(d){ if(!d) return ''; if(typeof d==='string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0,10); if(d._seconds) return (new Date(Number(d._seconds)*1000)).toISOString().substring(0,10); return (new Date(d)).toISOString().substring(0,10); }
          let out = docs.map(r=>{ r._date = normDate(r.visitDate||r._savedAt||r.createdAt); return r; });
          if (start) out = out.filter(d=> d._date && d._date >= start);
          if (end) out = out.filter(d=> d._date && d._date <= end);
          if (region) out = out.filter(d=> (d.region||'').toLowerCase().indexOf(region.toLowerCase())!==-1 );
          if (establishment) out = out.filter(d=> { const e = String(d.establishment || d.establish || d['설립구분'] || d.설립 || d.schoolEstablish || '').toLowerCase(); return e.indexOf(establishment.toLowerCase()) !== -1; });
          if (schoolLevel) out = out.filter(d=> { const l = String(d.schoolLevel || d.school_grade || d['학교급'] || d.학교급 || '').toLowerCase(); return l.indexOf(schoolLevel.toLowerCase()) !== -1; });
          if (minStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s >= Number(minStudents); });
          if (maxStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s <= Number(maxStudents); });
          if (minActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount >= Number(minActivities); });
          if (maxActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount <= Number(maxActivities); });
          if (minMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount >= Number(minMaterials); });
          if (maxMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount <= Number(maxMaterials); });
          if (subject) out = out.filter(d=> { const subs = Array.isArray(d.subject)? d.subject : (Array.isArray(d.subjects)? d.subjects : (d.subject? [d.subject] : (d.subjects? [d.subjects] : []))); return subs.some(s=> String(s).toLowerCase().indexOf(subject.toLowerCase())!==-1); });
          // Staff matching: accept either `staff` or `staffLabel` fields (case-insensitive)
          if (staff){ const sf = String(staff||'').toLowerCase(); out = out.filter(d=>{ const s = String(d.staff||'').toLowerCase(); const sl = String(d.staffLabel||'').toLowerCase(); return s === sf || sl === sf || s.indexOf(sf) !== -1 || sl.indexOf(sf) !== -1; }); }
          return out.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
        }catch(e){ console.warn('fetchIssueVisits failed', e); return []; }
      }

      // Fetch docs where `requests` field (고객요청사항) is non-empty
      async function fetchRequestVisits(opts={}){
        try{ await window.waitForFirebase(); }catch(e){ console.warn('firebase not ready', e); }
        if (!window.__db) return [];
        const col = window.__db.collection('visit_entries');
        try{
          // Firestore doesn't support "exists and non-empty" for arbitrary fields in a single query reliably,
          // so fetch by staff (if provided) then filter client-side for non-empty `requests`.
          // Fetch candidate docs and apply staff matching client-side (staff/staffLabel)
          let qref = col;
          qref = qref.limit(5000);
          const snap = await qref.get();
          const docs = (snap && snap.docs) ? snap.docs.map(d=>{ const data = d.data(); data.id = d.id; return data; }) : [];
          // enrich from CSV (same pattern)
          try{ const startWait = Date.now(); while(!salesStaffLoaded && Date.now() - startWait < 800) await new Promise(r=>setTimeout(r,50)); if(salesStaffLoaded){ docs.forEach(d=>{ const name = (d.school||'').trim().toLowerCase(); if(!name) return; const m = salesStaffMap.get(name); if(m){ if(!d.totalStudents || Number(d.totalStudents) === 0) d.totalStudents = m.totalStudents; if(!d.establishment) d.establishment = d.establishment || m.establishment; if(!d.schoolLevel) d.schoolLevel = d.schoolLevel || m.schoolLevel; } }); } }catch(e){ console.warn('enrich from csv failed', e); }
          function normDate(d){ if(!d) return ''; if(typeof d==='string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0,10); if(d._seconds) return (new Date(Number(d._seconds)*1000)).toISOString().substring(0,10); return (new Date(d)).toISOString().substring(0,10); }
          let out = docs.map(r=>{ r._date = normDate(r.visitDate||r._savedAt||r.createdAt); return r; });
          // apply same client-side filters as fetchVisits
          const { start='', end='', region='', subject='', establishment='', schoolLevel='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0 } = opts;
          if (start) out = out.filter(d=> d._date && d._date >= start);
          if (end) out = out.filter(d=> d._date && d._date <= end);
          if (region) out = out.filter(d=> (d.region||'').toLowerCase().indexOf(region.toLowerCase())!==-1 );
          if (establishment) out = out.filter(d=> { const e = String(d.establishment || d.establish || d['설립구분'] || d.설립 || d.schoolEstablish || '').toLowerCase(); return e.indexOf(establishment.toLowerCase()) !== -1; });
          if (schoolLevel) out = out.filter(d=> { const l = String(d.schoolLevel || d.school_grade || d['학교급'] || d.학교급 || '').toLowerCase(); return l.indexOf(schoolLevel.toLowerCase()) !== -1; });
          if (minStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s >= Number(minStudents); });
          if (maxStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s <= Number(maxStudents); });
          if (minActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount >= Number(minActivities); });
          if (maxActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount <= Number(maxActivities); });
          if (minMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount >= Number(minMaterials); });
          if (maxMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount <= Number(maxMaterials); });
          if (subject) out = out.filter(d=> { const subs = Array.isArray(d.subject)? d.subject : (Array.isArray(d.subjects)? d.subjects : (d.subject? [d.subject] : (d.subjects? [d.subjects] : []))); return subs.some(s=> String(s).toLowerCase().indexOf(subject.toLowerCase())!==-1); });
          if (opts.staff){ const sf = String(opts.staff||'').toLowerCase(); out = out.filter(d=>{ const s = String(d.staff||'').toLowerCase(); const sl = String(d.staffLabel||'').toLowerCase(); return s === sf || sl === sf || s.indexOf(sf) !== -1 || sl.indexOf(sf) !== -1; }); }
          // filter for non-empty requests
          out = out.filter(d=> { const r = d.requests || d.requests === 0 ? d.requests : (d.requests? d.requests : ''); if (!r) return false; if (Array.isArray(r)) return r.length>0; return String(r).trim().length>0; });
          return out.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
        }catch(e){ console.warn('fetchRequestVisits failed', e); return []; }
      }

      // Fetch docs where `delivery` (납품사항) is non-empty
      async function fetchDeliveryVisits(opts={}){
        try{ await window.waitForFirebase(); }catch(e){ console.warn('firebase not ready', e); }
        if (!window.__db) return [];
        const col = window.__db.collection('visit_entries');
        try{
          // Fetch candidate docs and apply staff matching client-side
          let qref = col; qref = qref.limit(5000);
          const snap = await qref.get(); const docs = (snap && snap.docs) ? snap.docs.map(d=>{ const data = d.data(); data.id = d.id; return data; }) : [];
          try{ const startWait = Date.now(); while(!salesStaffLoaded && Date.now() - startWait < 800) await new Promise(r=>setTimeout(r,50)); if(salesStaffLoaded){ docs.forEach(d=>{ const name = (d.school||'').trim().toLowerCase(); if(!name) return; const m = salesStaffMap.get(name); if(m){ if(!d.totalStudents || Number(d.totalStudents) === 0) d.totalStudents = m.totalStudents; if(!d.establishment) d.establishment = d.establishment || m.establishment; if(!d.schoolLevel) d.schoolLevel = d.schoolLevel || m.schoolLevel; } }); } }catch(e){ console.warn('enrich from csv failed', e); }
          function normDate(d){ if(!d) return ''; if(typeof d==='string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0,10); if(d._seconds) return (new Date(Number(d._seconds)*1000)).toISOString().substring(0,10); return (new Date(d)).toISOString().substring(0,10); }
          let out = docs.map(r=>{ r._date = normDate(r.visitDate||r._savedAt||r.createdAt); return r; });
          const { start='', end='', region='', subject='', establishment='', schoolLevel='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0 } = opts;
          if (start) out = out.filter(d=> d._date && d._date >= start);
          if (end) out = out.filter(d=> d._date && d._date <= end);
          if (region) out = out.filter(d=> (d.region||'').toLowerCase().indexOf(region.toLowerCase())!==-1 );
          if (establishment) out = out.filter(d=> { const e = String(d.establishment || d.establish || d['설립구분'] || d.설립 || d.schoolEstablish || '').toLowerCase(); return e.indexOf(establishment.toLowerCase()) !== -1; });
          if (schoolLevel) out = out.filter(d=> { const l = String(d.schoolLevel || d.school_grade || d['학교급'] || d.학교급 || '').toLowerCase(); return l.indexOf(schoolLevel.toLowerCase()) !== -1; });
          if (minStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s >= Number(minStudents); });
          if (maxStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s <= Number(maxStudents); });
          if (minActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount >= Number(minActivities); });
          if (maxActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount <= Number(maxActivities); });
          if (minMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount >= Number(minMaterials); });
          if (maxMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount <= Number(maxMaterials); });
          if (subject) out = out.filter(d=> { const subs = Array.isArray(d.subject)? d.subject : (Array.isArray(d.subjects)? d.subjects : (d.subject? [d.subject] : (d.subjects? [d.subjects] : []))); return subs.some(s=> String(s).toLowerCase().indexOf(subject.toLowerCase())!==-1); });
          if (opts.staff){ const sf = String(opts.staff||'').toLowerCase(); out = out.filter(d=>{ const s = String(d.staff||'').toLowerCase(); const sl = String(d.staffLabel||'').toLowerCase(); return s === sf || sl === sf || s.indexOf(sf) !== -1 || sl.indexOf(sf) !== -1; }); }
          // filter for non-empty delivery
          out = out.filter(d=> { const r = d.delivery || d.delivery === 0 ? d.delivery : (d.delivery? d.delivery : ''); if (!r) return false; if (Array.isArray(r)) return r.length>0; return String(r).trim().length>0; });
          return out.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
        }catch(e){ console.warn('fetchDeliveryVisits failed', e); return []; }
      }

      // Fetch docs where `materials` (증정/전달 자료) is present (client-side check)
      async function fetchMaterialsVisits(opts={}){
        try{ await window.waitForFirebase(); }catch(e){ console.warn('firebase not ready', e); }
        if (!window.__db) return [];
        const col = window.__db.collection('visit_entries');
        try{
          // Fetch candidate docs and apply staff matching client-side
          let qref = col; qref = qref.limit(5000);
          const snap = await qref.get(); const docs = (snap && snap.docs) ? snap.docs.map(d=>{ const data = d.data(); data.id = d.id; return data; }) : [];
          try{ const startWait = Date.now(); while(!salesStaffLoaded && Date.now() - startWait < 800) await new Promise(r=>setTimeout(r,50)); if(salesStaffLoaded){ docs.forEach(d=>{ const name = (d.school||'').trim().toLowerCase(); if(!name) return; const m = salesStaffMap.get(name); if(m){ if(!d.totalStudents || Number(d.totalStudents) === 0) d.totalStudents = m.totalStudents; if(!d.establishment) d.establishment = d.establishment || m.establishment; if(!d.schoolLevel) d.schoolLevel = d.schoolLevel || m.schoolLevel; } }); } }catch(e){ console.warn('enrich from csv failed', e); }
          function normDate(d){ if(!d) return ''; if(typeof d==='string' && /^\d{4}-\d{2}-\d{2}/.test(d)) return d.substring(0,10); if(d._seconds) return (new Date(Number(d._seconds)*1000)).toISOString().substring(0,10); return (new Date(d)).toISOString().substring(0,10); }
          let out = docs.map(r=>{ r._date = normDate(r.visitDate||r._savedAt||r.createdAt); return r; });
          const { start='', end='', region='', subject='', establishment='', schoolLevel='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0 } = opts;
          if (start) out = out.filter(d=> d._date && d._date >= start);
          if (end) out = out.filter(d=> d._date && d._date <= end);
          if (region) out = out.filter(d=> (d.region||'').toLowerCase().indexOf(region.toLowerCase())!==-1 );
          if (establishment) out = out.filter(d=> { const e = String(d.establishment || d.establish || d['설립구분'] || d.설립 || d.schoolEstablish || '').toLowerCase(); return e.indexOf(establishment.toLowerCase()) !== -1; });
          if (schoolLevel) out = out.filter(d=> { const l = String(d.schoolLevel || d.school_grade || d['학교급'] || d.학교급 || '').toLowerCase(); return l.indexOf(schoolLevel.toLowerCase()) !== -1; });
          if (minStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s >= Number(minStudents); });
          if (maxStudents) out = out.filter(d=> { const s = Number(d.totalStudents || d.students || d['총학생수'] || d.studentCount || 0) || 0; return s <= Number(maxStudents); });
          if (minActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount >= Number(minActivities); });
          if (maxActivities) out = out.filter(d=>{ let actCount = 0; if (Array.isArray(d.activities)) actCount = d.activities.length; else if (d.activities) actCount = 1; return actCount <= Number(maxActivities); });
          if (minMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount >= Number(minMaterials); });
          if (maxMaterials) out = out.filter(d=>{ let mCount = 0; if (Array.isArray(d.materials)) mCount = d.materials.length; else if (d.materials) mCount = 1; return mCount <= Number(maxMaterials); });
          if (subject) out = out.filter(d=> { const subs = Array.isArray(d.subject)? d.subject : (Array.isArray(d.subjects)? d.subjects : (d.subject? [d.subject] : (d.subjects? [d.subjects] : []))); return subs.some(s=> String(s).toLowerCase().indexOf(subject.toLowerCase())!==-1); });
          if (opts.staff){ const sf = String(opts.staff||'').toLowerCase(); out = out.filter(d=>{ const s = String(d.staff||'').toLowerCase(); const sl = String(d.staffLabel||'').toLowerCase(); return s === sf || sl === sf || s.indexOf(sf) !== -1 || sl.indexOf(sf) !== -1; }); }
          // filter for materials array non-empty or materials string
          out = out.filter(d=> { if (Array.isArray(d.materials)) return d.materials.length>0; if (d.materials) return String(d.materials).trim().length>0; return false; });
          return out.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
        }catch(e){ console.warn('fetchMaterialsVisits failed', e); return []; }
      }

      // Try server-side aggregation via Cloud Function (returns aggregated buckets)
      async function fetchServerAggregate({staff='', start='', end='', region='', subject='', establishment='', schoolLevel='', school='', minStudents=0, maxStudents=0, minActivities=0, maxActivities=0, minMaterials=0, maxMaterials=0}={}){
        const params = new URLSearchParams();
        if (staff) params.set('staff', staff);
        if (start) params.set('start', start);
        if (end) params.set('end', end);
        if (region) params.set('region', region);
        if (subject) params.set('subject', subject);
        if (establishment) params.set('establishment', establishment);
        if (schoolLevel) params.set('schoolLevel', schoolLevel);
        if (school) params.set('school', school);
        if (minStudents) params.set('minStudents', String(minStudents));
        if (maxStudents) params.set('maxStudents', String(maxStudents));
        if (minActivities) params.set('minActivities', String(minActivities));
        if (maxActivities) params.set('maxActivities', String(maxActivities));
        if (minMaterials) params.set('minMaterials', String(minMaterials));
        if (maxMaterials) params.set('maxMaterials', String(maxMaterials));
        const candidates = [
          '/aggregateVisitEntries',
          '/functions/aggregateVisitEntries',
          `https://us-central1-cmass-sales.cloudfunctions.net/aggregateVisitEntries`
        ];
        for (const base of candidates){
          try{
            const url = base + (base.indexOf('?') === -1 ? '?' + params.toString() : '&' + params.toString());
            const r = await fetch(url, { method:'GET' });
            if (!r.ok) continue;
            const j = await r.json().catch(()=>null);
            if (!j || !j.ok) continue;
            // normalize to agg shape used by renderCharts
            const agg = { byDate: j.byDate||{}, subjects: [], activities: [], regions: [], hours: [], topTeachers: [] };
            if (j.subjects) agg.subjects = Object.entries(j.subjects).map(e=> [e[0], e[1]]).sort((a,b)=> b[1]-a[1]);
            if (j.activities) agg.activities = Object.entries(j.activities).map(e=> [e[0], e[1]]).sort((a,b)=> b[1]-a[1]);
            if (j.regions) agg.regions = Object.entries(j.regions).map(e=> [e[0], e[1]]).sort((a,b)=> b[1]-a[1]);
            if (j.hours) agg.hours = Object.entries(j.hours).map(e=> [e[0], e[1]]).sort((a,b)=> b[1]-a[1]);
            return agg;
          }catch(e){ continue; }
        }
        return null;
      }

      function safe(v){ return v===undefined || v===null ? '' : String(v); }

      // Format numbers with thousand separators and optional decimals
      function formatNum(v, digits=0){
        const n = Number(v||0);
        if (isNaN(n)) return '';
        return n.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
      }

      // Return HTML string for delta with colored SVG icon (green up, red down) and two-decimal percent
      function formatDeltaHtml(curr, prev){
        const c = Number(curr||0); const p = Number(prev||0);
        const delta = Math.round(c - p);
        // percentage with two decimals
        const pct = p ? ((delta / (p||1)) * 100) : (delta>0?100:(delta<0?-100:0));
        const pctSign = pct>0 ? '+' : (pct<0 ? '-' : '');
        const pctStr = `${pctSign}${Math.abs(pct).toFixed(2)}%`;
        const deltaSign = delta>0 ? '+' : (delta<0 ? '-' : '');
        const deltaText = `${deltaSign}${Math.abs(delta)}`;
        const color = delta>0 ? '#10b981' : (delta<0 ? '#ef4444' : '#6b7280');

        // inline SVG icons (small)
        const upSvg = `<svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:baseline;margin-right:6px"><path d="M12 5l7 7H5l7-7z" fill="${color}"/></svg>`;
        const downSvg = `<svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:baseline;margin-right:6px"><path d="M12 19l-7-7h14l-7 7z" fill="${color}"/></svg>`;
        const neutralSvg = `<svg width="12" height="12" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" style="vertical-align:baseline;margin-right:6px"><circle cx="12" cy="12" r="3" fill="${color}"/></svg>`;

        const icon = delta>0 ? upSvg : (delta<0 ? downSvg : neutralSvg);
        return `${icon}<span style="color:${color};font-weight:700">${deltaText} (${pctStr})</span>`;
      }

      async function renderKPIs(visits, filters={}){
        // Default KPI display: show '이번 주' as primary numbers and show 월간 comparison below.
        try{ computeAndRenderTargets(visits); }catch(e){ console.warn('computeAndRenderTargets failed', e); }
        const baseFilters = Object.assign({}, filters || {});
        // compute week/month stats and render the delta lines; receive computed summaries
        let stats = {};
        try{ stats = await computeAndRenderKpiDeltas(baseFilters) || {}; }catch(e){ console.warn('computeAndRenderKpiDeltas failed', e); }
        // Use week-to-date values as primary KPI numbers
        const sThisWeek = stats.sThisWeek || { visitsCount:0, uniqSchools:0, contacts:0, noEntry:0 };
        q('#metric1').textContent = formatNum(sThisWeek.visitsCount);
        q('#metric2').textContent = formatNum(sThisWeek.uniqSchools);
        q('#metric3').textContent = formatNum(sThisWeek.contacts);
        q('#metric4').textContent = formatNum(sThisWeek.noEntry);
        // set 기준일 label only on the primary KPI card (metric1); hide on others
        const base = stats.baseDate || new Date().toISOString().substring(0,10);
        const baseEl = q('#metric1_date'); if(baseEl) { baseEl.textContent = `기준: ${base}`; baseEl.style.display = ''; }
        ['#metric2_date','#metric3_date','#metric4_date'].forEach(id=>{ const el = q(id); if(el){ el.textContent = ''; el.style.display = 'none'; } });
        // hide small percent/delta under the date label (user requested removal)
        ['#delta1','#delta2','#delta3','#delta4'].forEach(id=>{ const el = q(id); if(el){ el.textContent = ''; el.style.display = 'none'; } });
      }

      // Compute target goals per staff based on their actual 방문일수 and render overall + per-staff table
      function computeAndRenderTargets(visits){
        const startInput = q('#filterStart') && q('#filterStart').value || '';
        const endInput = q('#filterEnd') && q('#filterEnd').value || '';
        // determine date range: if user provided start/end use them, otherwise infer from visits
        let minDate = null, maxDate = null;
        visits.forEach(v=>{ const d = v._date || v.visitDate || v._savedAt || ''; if(d){ const ds = (typeof d === 'string' && d.length>=10) ? d.substring(0,10) : ''; if(ds){ if(!minDate || ds < minDate) minDate = ds; if(!maxDate || ds > maxDate) maxDate = ds; } } });
        const start = startInput || minDate || '';
        const end = endInput || maxDate || '';

        // helper to parse YYYY-MM-DD to Date at local timezone
        function parseYMD(s){ if(!s) return null; const parts = s.split('-'); if(parts.length<3) return null; return new Date(Number(parts[0]), Number(parts[1])-1, Number(parts[2])); }

        // compute business days between inclusive start/end excluding weekends, Mondays, and HOLIDAYS
        // Note: getDay() => 0=Sun,1=Mon,... so we exclude 0,6,1
        function businessDaysBetween(s,e){
          const sd = parseYMD(s); const ed = parseYMD(e); if(!sd || !ed) return 0;
          let d = new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()); let count = 0;
          const holSet = new Set(HOLIDAYS || []);
          while(d <= ed){ const dow = d.getDay(); const ymd = d.toISOString().substring(0,10); if(dow !== 0 && dow !== 6 && dow !== 1 && !holSet.has(ymd)) count++; d.setDate(d.getDate()+1); }
          return count;
        }

        const businessDays = (start && end) ? Math.max(1, businessDaysBetween(start,end)) : Math.max(1, businessDaysBetween(minDate||'', maxDate||''));

        // overall targets based on business days (for display)
        const overallSchoolTarget = Math.max(1, Math.round(businessDays * DAILY_SCHOOL_TARGET));
        const overallMeetingTarget = Math.max(1, Math.round(businessDays * DAILY_MEETING_TARGET));
        const overallMeetings = visits.length;
        const overallContacts = visits.filter(v=> (v.phone||v.email||v.Phonenumber||'').toString().trim()).length;

        // Determine unique staff ids present in visits (use staff or staffLabel fallback)
        // We want to display staff names in Korean and in a specific order: 송훈재, 임준호, 조영환
        const STAFF_ORDER = ['SongHoonjae','LimJunho','ChoYounghwan'];
        const STAFF_LABELS = { 'SongHoonjae': '송훈재', 'LimJunho': '임준호', 'ChoYounghwan': '조영환' };

        const allStaffIdentifiers = new Set();
        visits.forEach(v=>{
          if(v.staff) allStaffIdentifiers.add(String(v.staff).trim());
          if(v.staffLabel) allStaffIdentifiers.add(String(v.staffLabel).trim());
        });

        function summarizeDocs(docs){ const schools = new Set(); let students = 0; docs.forEach(d=>{ const s = (d.school||'').toString().trim(); if(s) schools.add(s); const ts = Number(d.totalStudents||d.students||0) || 0; students += ts; }); return { schools: schools.size, students }; }

        // Build rows in the requested order first, then append any other staff found
        const seen = new Set();
        const rows = [];

        // helper to create row from docs and canonical staff id string
        function makeRowForIdentifier(identifier, displayName){
          const docs = visits.filter(v=>{ const s = String(v.staff||'').trim(); const sl = String(v.staffLabel||'').trim(); return s === identifier || sl === identifier || sl === displayName; });
          if(!docs.length) return null;
          const sum = summarizeDocs(docs);
          const meetings = docs.length;
          const contacts = docs.filter(v=> (v.phone||v.email||v.Phonenumber||'').toString().trim()).length;
          const uniqueDays = new Set(docs.map(d=> (d._date||'').substring(0,10)).filter(Boolean));
          const visitedDays = uniqueDays.size || 0;
          const targetSchool = Math.max(1, visitedDays * DAILY_SCHOOL_TARGET);
          const targetMeet = Math.max(1, visitedDays * DAILY_MEETING_TARGET);
          const pctSchool = Math.round((sum.schools / (targetSchool||1)) * 100);
          const pctMeet = Math.round((meetings / (targetMeet||1)) * 100);
          // extract Hangul-only canonical name (used for deduplication)
          const nameForDisplay = (displayName || identifier) + '';
          const hangulMatch = nameForDisplay.match(/[\uAC00-\uD7A3]+/g);
          const hangulName = hangulMatch ? hangulMatch.join('') : '';
          return { staff: identifier, displayName: nameForDisplay, hangulName, visitedDays, schools: sum.schools, students: sum.students, meetings, contacts, targetMeet, targetSchool, pctMeet, pctSchool };
        }

        // First, add rows for STAFF_ORDER in the specified sequence if they have data
        const seenHangul = new Set();
        for(const id of STAFF_ORDER){
          const disp = STAFF_LABELS[id] || id;
          const r = makeRowForIdentifier(id, disp);
          if(r){ rows.push(r); seen.add(r.staff); if(r.hangulName) seenHangul.add(r.hangulName); }
        }

        // Then add any other identifiers present that weren't in the ordered list
        for(const ident of Array.from(allStaffIdentifiers)){
          if( seen.has(ident) ) continue;
          const r = makeRowForIdentifier(ident, ident);
          if(!r) continue;
          // Skip rows whose displayName contains no Hangul (i.e., English-only identifiers)
          if(!r.hangulName) continue;
          // Skip if a row with the same Hangul name already exists (avoid duplicates like '송훈재' and '송훈재 부장')
          if(seenHangul.has(r.hangulName)) continue;
          rows.push(r);
          seen.add(ident);
          seenHangul.add(r.hangulName);
        }

        // Filter rows to include only senior-title entries (avoid showing duplicate English IDs or plain names)
        // Keep only entries that include common titles like '부장' or '차장'
        const TITLE_FILTER_RE = /(부장|차장)$/;
        let filteredRows = rows.filter(r => TITLE_FILTER_RE.test((r.displayName||'').trim()));
        // If user expects a specific ordering for titled staff, enforce it (preferred: 송훈재 부장, 임준호 차장, 조영환 부장)
        const PREFERRED_ORDER = ['송훈재 부장','임준호 차장','조영환 부장'];
        filteredRows.sort((a,b) => {
          const ai = PREFERRED_ORDER.indexOf(a.displayName||'');
          const bi = PREFERRED_ORDER.indexOf(b.displayName||'');
          if(ai !== -1 && bi !== -1) return ai - bi;
          if(ai !== -1) return -1;
          if(bi !== -1) return 1;
          return 0;
        });

        // Use filteredRows for rendering
        const renderRows = filteredRows;

        // Render HTML
        const container = q('#kpiTargets'); if(!container) return;
        let html = `<div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="background:#fff;padding:10px;border-radius:8px;min-width:260px">
            <div style="font-size:13px;color:#6b7280">전체 목표(기간)</div>
            <div style="font-weight:700;font-size:16px;margin-top:6px">기간(영업일): ${businessDays}일 · 1인 학교 목표: ${DAILY_SCHOOL_TARGET}개/일 · 1인 방문 목표: ${DAILY_MEETING_TARGET}건/일</div>
            <div style="font-weight:700;font-size:16px;margin-top:8px">기간 기준(예시) - 전체 목표(1인 기준×영업일): 학교 ${overallSchoolTarget}개 · 방문 ${overallMeetingTarget}건</div>
            <div style="font-weight:700;font-size:18px;margin-top:8px">방문 목표(팀 기준): ${overallMeetingTarget}건 · 달성 ${overallMeetings}건 (${ Math.round(overallMeetings/(overallMeetingTarget||1)*100) }%)</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:6px">기간: ${start||'전체'} → ${end||'전체'}</div>
          </div>`;

        // per-staff table (compact) - include 방문일수 and both 목표/달성(학교,미팅)
        // helper to colorize pct cells
        function pctBadgeHtml(pct){
          const p = Number(pct) || 0;
          let bg = '#ef4444'; // red default
          if (p >= 100) bg = '#10b981';
          else if (p >= 80) bg = '#f59e0b';
          const color = '#ffffff';
          return `<span style="background:${bg};color:${color};padding:4px 8px;border-radius:8px;display:inline-block;min-width:48px;text-align:right;font-weight:800">${p}%</span>`;
        }

        html += `<div style="flex:1 1 780px;background:#fff;padding:10px;border-radius:8px;min-width:420px">
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px">개별 담당자 목표·달성 (방문일수 기반)</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr>
              <th style="text-align:left;padding:6px;border-bottom:1px solid #eee; width:180px;">담당자</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:90px;">방문일수</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:90px;">목표학교수</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:90px;">달성학교수</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:110px;">달성률</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:100px;">목표미팅수</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:100px;">달성미팅수</th>
              <th style="text-align:right;padding:6px;border-bottom:1px solid #eee; width:110px;">달성률</th>
            </tr></thead><tbody>`;
        // render each staff row and accumulate totals for a team summary row
        let totVisitedDays = 0, totTargetSchool = 0, totSchools = 0, totTargetMeet = 0, totMeetings = 0;
        renderRows.forEach(r=>{
          totVisitedDays += Number(r.visitedDays||0);
          totTargetSchool += Number(r.targetSchool||0);
          totSchools += Number(r.schools||0);
          totTargetMeet += Number(r.targetMeet||0);
          totMeetings += Number(r.meetings||0);
          html += `<tr>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6">${escapeHtml(r.displayName)}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${r.visitedDays}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${r.targetSchool}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${r.schools}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${pctBadgeHtml(r.pctSchool)}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${r.targetMeet}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${r.meetings}</td>
            <td style="padding:6px;border-bottom:1px solid #f3f4f6;text-align:right">${pctBadgeHtml(r.pctMeet)}</td>
          </tr>`;
        });

        // team totals row
        const teamPctSchool = Math.round((totSchools / (totTargetSchool||1)) * 100);
        const teamPctMeet = Math.round((totMeetings / (totTargetMeet||1)) * 100);
        html += `<tr style="font-weight:800;background:#f8fafc">
            <td style="padding:8px;border-top:2px solid #e6eef8">팀 합계</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${totVisitedDays}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${totTargetSchool}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${totSchools}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${pctBadgeHtml(teamPctSchool)}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${totTargetMeet}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${totMeetings}</td>
            <td style="padding:8px;border-top:2px solid #e6eef8;text-align:right">${pctBadgeHtml(teamPctMeet)}</td>
          </tr>`;
        html += `</tbody></table></div>`;

        html += `</div>`;
        container.innerHTML = html;
      }

      // Compute weekly and monthly KPI deltas (absolute & percent) and render into KPI cards
      async function computeAndRenderKpiDeltas(filters={}){
        // Compute calendar-aware week-to-date and month-to-date comparisons
        function isoDaysAgo(baseIso, days){ let d; if(baseIso){ const p=baseIso.split('-'); d = new Date(Number(p[0]), Number(p[1])-1, Number(p[2])); } else { d = new Date(); } d.setDate(d.getDate() - days); return d.toISOString().substring(0,10); }
        const baseDate = filters.baseDate || filters.end || new Date().toISOString().substring(0,10);

        // WEEK-TO-DATE: compute current week start (Monday) up to baseDate, compare to previous week same-length window
        const bd = new Date(baseDate); const dow = bd.getDay(); const daysSinceMon = (dow + 6) % 7; // 0..6
        const thisWeekStart = isoDaysAgo(baseDate, daysSinceMon); const thisWeekEnd = baseDate;
        const prevWeekEnd = isoDaysAgo(thisWeekStart, 1); const prevWeekStart = isoDaysAgo(prevWeekEnd, daysSinceMon);

        // MONTH-TO-DATE: from 1st of current month to baseDate; previous month same day-range
        const p = baseDate.split('-'); const y = Number(p[0]), m = Number(p[1]), dday = Number(p[2]);
        const thisMonthStart = `${y}-${String(m).padStart(2,'0')}-01`;
        const thisMonthEnd = baseDate;
        // previous month start/end: compute prev month year/month and use full previous month range
        const prevMonthDate = new Date(y, m-2, 1);
        const py = prevMonthDate.getFullYear();
        const pm = prevMonthDate.getMonth()+1;
        const prevMonthLastDay = new Date(py, pm, 0).getDate();
        const prevMonthStart = `${py}-${String(pm).padStart(2,'0')}-01`;
        const prevMonthEnd = `${py}-${String(pm).padStart(2,'0')}-${String(prevMonthLastDay).padStart(2,'0')}`;

        const optsBase = Object.assign({}, filters);
        const [thisWeek, prevWeek, thisMonth, prevMonth] = await Promise.all([
          fetchVisits(Object.assign({}, optsBase, { start: thisWeekStart, end: thisWeekEnd })),
          fetchVisits(Object.assign({}, optsBase, { start: prevWeekStart, end: prevWeekEnd })),
          fetchVisits(Object.assign({}, optsBase, { start: thisMonthStart, end: thisMonthEnd })),
          fetchVisits(Object.assign({}, optsBase, { start: prevMonthStart, end: prevMonthEnd }))
        ]);

        function summarize(arr){ const visits = arr||[]; const visitsCount = visits.length; const uniqSchools = Array.from(new Set(visits.map(v=> safe(v.school).trim()).filter(Boolean))).length; const contacts = visits.filter(v=> (v.phone||v.email||v.Phonenumber||'').toString().trim()).length; const noEntry = visits.filter(v=>{ try{ const hay=(s)=> (s||'').toString().toLowerCase(); if(Array.isArray(v.activities) && v.activities.some(a=> hay(a).indexOf('출입불')!==-1)) return true; if(typeof v.activities==='string' && hay(v.activities).indexOf('출입불')!==-1) return true; const cands=[v.visitResult,v.result,v.status,v.outcome,v.reason,v.note,v.conversation,v.detail]; for(const c of cands){ if(c && hay(c).indexOf('출입불')!==-1) return true; } }catch(e){} return false; }).length; const avg = visitsCount ? Math.round((visits.reduce((s,v)=> s + (Number(v.duration)||0),0)/visitsCount)) : 0; return { visitsCount, uniqSchools, contacts, avg, noEntry }; }

        const sThisWeek = summarize(thisWeek); const sPrevWeek = summarize(prevWeek);
        const sThisMonth = summarize(thisMonth); const sPrevMonth = summarize(prevMonth);

        function formatDelta(curr, prev){ const delta = curr - prev; const pct = prev ? Math.round((delta / (prev||1)) * 100) : (delta>0?100:(delta<0?-100:0)); const sign = delta>0?'+':(delta<0?'-':''); return `${sign}${Math.abs(delta)} (${sign}${Math.abs(pct)}%)`; }

        // metric1: visitsCount (weekly/monthly comparisons) — render with formatted numbers and colored delta spans
        q('#metric1_week').innerHTML = `주간: 지난주 ${formatNum(sPrevWeek.visitsCount)} / 이번주 ${formatNum(sThisWeek.visitsCount)} → ${formatDeltaHtml(sThisWeek.visitsCount, sPrevWeek.visitsCount)}`;
        q('#metric1_month').innerHTML = `월간: 전월 ${formatNum(sPrevMonth.visitsCount)} / 이번달 ${formatNum(sThisMonth.visitsCount)} → ${formatDeltaHtml(sThisMonth.visitsCount, sPrevMonth.visitsCount)}`;
        // metric2: unique schools
        q('#metric2_week').innerHTML = `주간: 지난주 ${formatNum(sPrevWeek.uniqSchools)} / 이번주 ${formatNum(sThisWeek.uniqSchools)} → ${formatDeltaHtml(sThisWeek.uniqSchools, sPrevWeek.uniqSchools)}`;
        q('#metric2_month').innerHTML = `월간: 전월 ${formatNum(sPrevMonth.uniqSchools)} / 이번달 ${formatNum(sThisMonth.uniqSchools)} → ${formatDeltaHtml(sThisMonth.uniqSchools, sPrevMonth.uniqSchools)}`;
        // metric3: contacts
        q('#metric3_week').innerHTML = `주간: 지난주 ${formatNum(sPrevWeek.contacts)} / 이번주 ${formatNum(sThisWeek.contacts)} → ${formatDeltaHtml(sThisWeek.contacts, sPrevWeek.contacts)}`;
        q('#metric3_month').innerHTML = `월간: 전월 ${formatNum(sPrevMonth.contacts)} / 이번달 ${formatNum(sThisMonth.contacts)} → ${formatDeltaHtml(sThisMonth.contacts, sPrevMonth.contacts)}`;
        // metric4: 출입불가
        q('#metric4_week').innerHTML = `주간: 지난주 ${formatNum(sPrevWeek.noEntry)} / 이번주 ${formatNum(sThisWeek.noEntry)} → ${formatDeltaHtml(sThisWeek.noEntry, sPrevWeek.noEntry)}`;
        q('#metric4_month').innerHTML = `월간: 전월 ${formatNum(sPrevMonth.noEntry)} / 이번달 ${formatNum(sThisMonth.noEntry)} → ${formatDeltaHtml(sThisMonth.noEntry, sPrevMonth.noEntry)}`;
        // Return computed summaries and baseDate so caller can use week primary numbers and display 기준일
        return { sThisWeek, sPrevWeek, sThisMonth, sPrevMonth, baseDate };
      }

  function aggregate(visits){
        const byDate = {};
        const subjects = new Map();
        const activities = new Map();
        const regions = new Map();
        const hours = new Map();
        const topTeachers = new Map();
    // school metadata maps
    const establishmentMap = new Map();
    const schoolLevelMap = new Map();
    const studentBuckets = new Map();
    // per-staff breakdowns for subjects and student bucket counts
    const subjectsByStaff = {};
    const studentBucketsByStaff = {};
    const featuresMap = new Map();
    const gradesMap = new Map();
    // cross matrix est -> level -> count
    const crossMatrix = {};
    // per-staff establishment and contact counts
    const establishmentsByStaff = {};
    // global contacts by establishment type (e.g., 공립/사립)
    const contactsByEst = new Map();
    let overallContacts = 0;

        visits.forEach(v=>{
          const d = v._date || '';
          byDate[d] = (byDate[d]||0) + 1;
          // staff key (prefer Korean label when present) - define early so per-staff counters can use it
          const staffKey = String(v.staffLabel || v.staff || '').trim() || '미지정';
          const subs = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
          subs.forEach(s=>{ if(!s) return; const k=String(s).trim(); subjects.set(k, (subjects.get(k)||0)+1);
            // per-staff subject counts
            try{ subjectsByStaff[staffKey] = subjectsByStaff[staffKey] || new Map(); subjectsByStaff[staffKey].set(k, (subjectsByStaff[staffKey].get(k)||0) + 1); }catch(e){}
          });
          const acts = Array.isArray(v.activities)? v.activities : (v.activities? v.activities : []);
          acts.forEach(a=>{ if(!a) return; const k=String(a).trim(); activities.set(k, (activities.get(k)||0)+1); });
          const r = String(v.region||'').trim(); if(r) regions.set(r, (regions.get(r)||0)+1);
          establishmentsByStaff[staffKey] = establishmentsByStaff[staffKey] || { total:0, regions: new Map(), estTypes: new Map(), contacts:0, contactsByEst: new Map() };
          establishmentsByStaff[staffKey].total += 1;
          if(r) establishmentsByStaff[staffKey].regions.set(r, (establishmentsByStaff[staffKey].regions.get(r)||0) + 1);
          const start = String(v.visitStart||''); if(start){ const h = start.split(':')[0]; hours.set(h, (hours.get(h)||0)+1); }
          const teacher = String(v.teacher||'').trim(); if(teacher) topTeachers.set(teacher, (topTeachers.get(teacher)||0)+1);
            // contacts count (phone/email)
            const hasContact = (v.phone||v.email||v.Phonenumber||'').toString().trim(); if(hasContact) { overallContacts++; establishmentsByStaff[staffKey].contacts += 1; }
          // school metadata: establishment, schoolLevel, totalStudents, features, grade counts
          const est = String(v.establishment || v.establish || v['설립구분'] || v.설립 || v.schoolEstablish || '').trim();
          if(est) establishmentMap.set(est, (establishmentMap.get(est)||0)+1);
          // also track establishment-type counts per staff and overall contacts-by-est
          if(est){ establishmentsByStaff[staffKey].estTypes.set(est, (establishmentsByStaff[staffKey].estTypes.get(est)||0) + 1); }
          if(hasContact && est){ contactsByEst.set(est, (contactsByEst.get(est)||0) + 1); establishmentsByStaff[staffKey].contactsByEst.set(est, (establishmentsByStaff[staffKey].contactsByEst.get(est)||0) + 1); }
          const lvl = String(v.schoolLevel || v.school_grade || v['학교급'] || v.학교급 || '').trim();
          if(lvl) schoolLevelMap.set(lvl, (schoolLevelMap.get(lvl)||0)+1);
          // cross matrix
          if(est && lvl){ crossMatrix[est] = crossMatrix[est] || {}; crossMatrix[est][lvl] = (crossMatrix[est][lvl]||0) + 1; }
          const totalStudents = Number(v.totalStudents || v.students || v['총학생수'] || v.studentCount || 0) || 0;
          if(totalStudents){ const bucket = totalStudents < 100 ? '<100' : (totalStudents <=300 ? '100-300' : (totalStudents <=600 ? '301-600' : '>600')); studentBuckets.set(bucket, (studentBuckets.get(bucket)||0)+1);
            // per-staff student bucket counts
            try{ studentBucketsByStaff[staffKey] = studentBucketsByStaff[staffKey] || new Map(); studentBucketsByStaff[staffKey].set(bucket, (studentBucketsByStaff[staffKey].get(bucket)||0) + 1); }catch(e){}
          }
          const features = String(v.features || v.feature || v['특성'] || '').trim(); if(features) featuresMap.set(features, (featuresMap.get(features)||0)+1);
          // grade breakdown (defensive)
          const g1 = v.grade1 || v['1_grade'] || (v.grades && v.grades['1'] && (v.grades['1'].students || v.grades['1'].count)) || v['1학년_students'] || 0;
          const g2 = v.grade2 || v['2_grade'] || (v.grades && v.grades['2'] && (v.grades['2'].students || v.grades['2'].count)) || v['2학년_students'] || 0;
          const g3 = v.grade3 || v['3_grade'] || (v.grades && v.grades['3'] && (v.grades['3'].students || v.grades['3'].count)) || v['3학년_students'] || 0;
          if(g1) gradesMap.set('1학년', (gradesMap.get('1학년')||0) + Number(g1));
          if(g2) gradesMap.set('2학년', (gradesMap.get('2학년')||0) + Number(g2));
          if(g3) gradesMap.set('3학년', (gradesMap.get('3학년')||0) + Number(g3));
        });

        function mapToSortedArray(m){ return Array.from(m.entries()).sort((a,b)=> b[1]-a[1]); }
        return { byDate, subjects: mapToSortedArray(subjects), activities: mapToSortedArray(activities), regions: mapToSortedArray(regions), hours: mapToSortedArray(hours), topTeachers: mapToSortedArray(topTeachers), establishments: mapToSortedArray(establishmentMap), schoolLevels: mapToSortedArray(schoolLevelMap), studentBuckets: mapToSortedArray(studentBuckets), features: mapToSortedArray(featuresMap), grades: mapToSortedArray(gradesMap), cross: crossMatrix, establishmentsByStaff, overallContacts, contactsByEst, subjectsByStaff, studentBucketsByStaff };
      }

      // Group small categories into '기타' to keep charts readable
      function groupSmall(entries, topN){
        if (!Array.isArray(entries)) return { labels:[], data:[], entries:[] };
        const total = entries.reduce((s,e)=> s + (e[1]||0), 0) || 0;
        if (entries.length <= topN) return { labels: entries.map(e=>e[0]), data: entries.map(e=>e[1]), entries };
        const top = entries.slice(0, topN);
        const rest = entries.slice(topN);
        const otherCount = rest.reduce((s,e)=> s + (e[1]||0), 0);
        const resEntries = top.concat(otherCount? [['기타', otherCount]] : []);
        return { labels: resEntries.map(e=>e[0]), data: resEntries.map(e=>e[1]), entries: resEntries };
      }

      function renderCharts(agg){
        try{ console.log('renderCharts start', agg && Object.keys(agg).length ? { keys: Object.keys(agg).slice(0,8) } : agg); }catch(e){}
        // fullAgg is the unfiltered aggregate (set by refresh as window._fullAgg).
        // Use fullAgg for the '전체' column so the overall column isn't affected by staff cross-filters.
        const fullAgg = (window._fullAgg && typeof window._fullAgg === 'object') ? window._fullAgg : agg;
        function getCountFromEntries(entries, label){ try{ if(!Array.isArray(entries)) return 0; for(const e of entries) if(String(e[0]||'') === String(label||'')) return Number(e[1]||0); return 0; }catch(e){ return 0; } }
        // visits over time line
        const dates = Object.keys(agg.byDate).sort();
        const dateCounts = dates.map(d=> agg.byDate[d]);
        const ctx1 = document.getElementById('chart1').getContext('2d');
        if (charts.line) { charts.line.data.labels = dates; charts.line.data.datasets[0].data = dateCounts; charts.line.update(); }
  else { charts.line = new Chart(ctx1, { type:'line', data:{ labels: dates, datasets:[{ label:'일별 방문', data: dateCounts, borderColor: palette[2], backgroundColor: 'rgba(255,152,0,0.12)', fill:true }] }, options:{ responsive:true, plugins:{ tooltip:{ callbacks:{ label: ctx=> `${ctx.parsed.y||ctx.parsed}: 건` } }, legend:{ position:'bottom' } }, scales:{ x:{ title:{ display:true, text:'일자' } }, y:{ title:{ display:true, text:'건수' } } }, onClick: (evt, items) => {
              // click on line point -> filter by date
              if (!items || !items.length) return;
              const idx = items[0].index; const label = charts.line.data.labels[idx];
              // set start/end to the clicked date and refresh
              document.getElementById('filterStart').value = label; document.getElementById('filterEnd').value = label; refresh();
            } } }); }

  // subjects: render as percent-stacked bars per staff (전체, 송훈재, 임준호, 조영환)
  const subjGrouped = groupSmall(agg.subjects, 8);
  const sLabels = subjGrouped.labels; const sData = subjGrouped.data;
  (function(){
    const el4 = document.getElementById('chart4'); if(!el4) return;
    const ctx4 = el4.getContext('2d');
    try{ if(!el4.style.height || el4.style.height==='') el4.style.height = '280px'; if(!el4.height) el4.height = 280; ctx4.canvas.style.maxHeight = '560px'; }catch(e){}
    const staffOrder = ['전체','송훈재','임준호','조영환'];

    // helper to find subject map for a staff (tolerant)
    function findSubjectMap(name){ try{ if(!agg || !agg.subjectsByStaff) return new Map(); if(agg.subjectsByStaff[name]) return agg.subjectsByStaff[name]; const keys = Object.keys(agg.subjectsByStaff||{}); for(const k of keys) if(k && k.indexOf(name)!==-1) return agg.subjectsByStaff[k]; const lname=String(name||'').toLowerCase(); for(const k of keys) if(k && String(k).toLowerCase().indexOf(lname)!==-1) return agg.subjectsByStaff[k]; return new Map(); }catch(e){ return new Map(); } }

    // build raw counts per subject per staff column
    const subjRawBySubject = sLabels.map((lab, si)=>{
      const arr = [];
      // overall (use fullAgg so '전체' column shows unfiltered totals)
      const overallCount = getCountFromEntries(fullAgg.subjects, lab) || Number(sData[si]||0);
      arr.push(Number(overallCount||0));
      // per staff
      for(let j=1;j<staffOrder.length;j++){
        const name = staffOrder[j]; const map = findSubjectMap(name) || new Map(); arr.push(Number(map.get && map.get(lab) ? map.get(lab) : 0));
      }
      return arr;
    });

    // compute totals per column
    const cols = staffOrder.length; const totals = Array(cols).fill(0);
    for(let c=0;c<cols;c++){
      for(let si=0;si<subjRawBySubject.length;si++) totals[c] += Number(subjRawBySubject[si][c]||0);
    }

    // datasets: one dataset per subject, with percent data and _raw preserved
    const datasets = subjRawBySubject.map((rawArr, idx)=>{
      const perc = rawArr.map((v,c)=> totals[c]? Math.round((Number(v||0)/totals[c])*100) : 0);
      return { label: sLabels[idx], data: perc, _raw: rawArr, backgroundColor: palette[idx % palette.length], barThickness:36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 };
    });

    const subjLabelPlugin = {
      id: 'subjPctLabels',
      afterDatasetsDraw(chart){ const {ctx} = chart; ctx.save(); chart.data.datasets.forEach((ds, di)=>{ const meta = chart.getDatasetMeta(di); meta.data.forEach((bar, i)=>{ const pct = Number(ds.data[i]||0); if(pct===0 && pct!==0) return; if(pct===0) return; const raw = Number((ds._raw && ds._raw[i])||0); const x = bar.x; const y = bar.y; const base = bar.base !== undefined? bar.base : (bar.y + (bar.height||0)); const h = Math.abs(base - y); const centerY = Math.min(y, base) + h/2; ctx.fillStyle = '#000'; ctx.font = '700 13px Arial, Noto Sans, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; const txt = `${raw}건 (${pct}%)`; if(h>28) ctx.fillText(txt, x, centerY); else ctx.fillText(txt, x, Math.min(y, base)-12); }); }); ctx.restore(); }
    };

    if(charts.subject){ charts.subject.data.labels = staffOrder; charts.subject.data.datasets = datasets; charts.subject.update(); }
    else {
      charts.subject = new Chart(ctx4, {
        type: 'bar',
        data: { labels: staffOrder, datasets },
        plugins: [subjLabelPlugin],
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            tooltip: {
              callbacks: {
                label: function(ctx){
                  const idx = ctx.dataIndex;
                  const raw = (ctx.dataset && ctx.dataset._raw && ctx.dataset._raw[idx]) ? ctx.dataset._raw[idx] : (ctx.parsed && ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed);
                  const totalRaw = ctx.chart.data.datasets.reduce(function(s, ds){ return s + Number((ds._raw && ds._raw[idx]) ? ds._raw[idx] : (ds.data[idx] || 0)); }, 0) || 1;
                  const pct = Math.round((Number(raw)/totalRaw)*100);
                  return ctx.dataset.label + ': ' + raw + '건 (' + pct + '%)';
                }
              }
            },
            legend: { position: 'bottom' }
          },
          layout: { padding: { top:8, bottom:8 } },
          scales: { x:{ stacked:true }, y: PERCENT_STACK_Y_OPTIONS },
          onClick: function(evt){
            const pts = charts.subject.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
            if(!pts || !pts.length) return;
            const it = pts[0]; const dataIdx = it.index; const dsIdx = it.datasetIndex;
            const ds = charts.subject.data.datasets[dsIdx]; const subjectLabel = ds && ds.label ? ds.label : '';
            // set cross-filter by subject (dataset label)
            if(subjectLabel){ setCrossFilter('subject', subjectLabel); document.getElementById('activeFilters').textContent = `과목=${subjectLabel}`; }
          }
        }
      });
    }
  })();

  // activities bar (show all activities instead of grouping into '기타')
    const aEntries = Array.isArray(agg.activities) ? agg.activities : [];
    const aLabels = aEntries.map(e=> e[0]); const aData = aEntries.map(e=> e[1]);
    try{ console.log('DEBUG: activities labels count', aLabels.length, aLabels.slice(0,6)); }catch(e){}
      const el2 = document.getElementById('chart2');
      if(!el2) return;
      // 활동 차트: 높이/막대/폰트 크기를 줄여 세로 공간을 절약합니다 (절반 수준)
      try{
        if(!el2.style.height || el2.style.height==='') el2.style.height = Math.min(210, Math.max(90, aLabels.length * 14)) + 'px';
        if(!el2.height) el2.height = parseInt(el2.style.height,10) || 210;
        el2.style.maxHeight = Math.min(420, Math.max(210, aLabels.length * 28)) + 'px';
      }catch(e){}
      const ctx2 = el2.getContext('2d');
      try{
        if (charts.act) {
          charts.act.data.labels = aLabels; charts.act.data.datasets[0].data = aData;
          // reduce bar thickness for existing chart instance as well
          try{ charts.act.data.datasets[0].barThickness = 18; charts.act.data.datasets[0].maxBarThickness = 40; charts.act.update(); }catch(e){ charts.act.update(); }
        } else {
          charts.act = new Chart(ctx2, {
            type: 'bar',
            data: { labels: aLabels, datasets: [{ label: '활동', data: aData, backgroundColor: palette, barThickness: 18, maxBarThickness: 40, categoryPercentage: 0.6, barPercentage: 0.8 }] },
            plugins: [
              {
                id: 'barValueLabeler',
                afterDatasetsDraw(chart){
                  try{
                    const ctx = chart.ctx; ctx.save();
                    chart.data.datasets.forEach((ds, dsIndex)=>{
                      const meta = chart.getDatasetMeta(dsIndex);
                      meta.data.forEach((bar, i)=>{
                        const val = (ds.data && ds.data[i]) ? ds.data[i] : 0;
                        const x = bar.x; const y = bar.y; 
                        const text = String(val) + '건';
                        ctx.font = '600 12px Arial, Noto Sans, sans-serif';
                        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#000';
                        // place text to the right of the bar end
                        try{ ctx.fillText(text, x + 8, y); }catch(e){}
                      });
                    });
                    ctx.restore();
                  }catch(e){console.warn('barValueLabeler failed', e);} 
                }
              }
            ],
            options: {
              indexAxis: 'y', // horizontal bars
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                tooltip: {
                  bodyFont: { size: 11 },
                  callbacks: {
                    label: function(ctx){
                      const val = (ctx.parsed && (ctx.parsed.x !== undefined ? ctx.parsed.x : (ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed))) || 0;
                      return ctx.label + ': ' + val + '건';
                    }
                  }
                },
                legend: { display: false }
              },
              scales: {
                x: { title: { display: true, text: '건수' }, ticks: { font: { size: 11 } } },
                y: { title: { display: true, text: '활동' }, ticks: { font: { size: 11 } } }
              },
              onClick: function(evt){
                const pts = charts.act.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if (!pts.length) return;
                const idx = pts[0].index; const label = charts.act.data.labels[idx];
                // set cross-filter by activity
                setCrossFilter('activity', label);
              }
            }
          });
        }
      }catch(e){
        console.warn('charts.act render failed', e);
        try{ // fallback: simple chart without plugin
          if (charts.act){ charts.act.destroy(); }
          charts.act = new Chart(ctx2, { type:'bar', data:{ labels: aLabels, datasets:[{ label:'활동', data: aData, backgroundColor: palette }] }, options:{ indexAxis:'y', plugins:{ legend:{ display:false } }, responsive:true } });
        }catch(e2){ console.warn('charts.act fallback failed', e2); }
      }

  // regions bar - do NOT group into '기타'; show all region entries and provide scrollable legend
  const regEntries = Array.isArray(agg.regions) ? agg.regions : (agg.regions? Object.entries(agg.regions) : []);
  const rLabels = regEntries.map(e=> e[0]); const rData = regEntries.map(e=> e[1]);
  try{ console.log('DEBUG: regions labels count', rLabels.length, rLabels.slice(0,6)); }catch(e){}
        const ctx3 = document.getElementById('chart3').getContext('2d');
        // increase canvas height so the y-axis (region labels) has more space (2x)
        try{ const elChart3 = document.getElementById('chart3'); if(elChart3){ if(!elChart3.style.height || elChart3.style.height==='') elChart3.style.height = '720px'; if(!elChart3.height) elChart3.height = 720; ctx3.canvas.style.maxHeight = '1440px'; } }catch(e){}
        if (charts.region) { charts.region.data.labels = rLabels; charts.region.data.datasets[0].data = rData; charts.region.update(); }
  else {
    try{
      charts.region = new Chart(ctx3, {
        type:'bar',
        data:{ labels: rLabels, datasets:[{ label:'지역', data: rData, backgroundColor: palette }] },
        plugins: [
          {
            id: 'barValueLabeler',
            afterDatasetsDraw: function(chart){
              try{
                const ctx = chart.ctx;
                ctx.save();
                chart.data.datasets.forEach((ds, dsIndex)=>{
                  const meta = chart.getDatasetMeta(dsIndex);
                  meta.data.forEach((bar, i)=>{
                    const val = (ds.data && ds.data[i]) ? ds.data[i] : 0;
                    const x = bar.x;
                    const y = bar.y;
                    const text = String(val) + '건';
                    ctx.font = '600 12px Arial, Noto Sans, sans-serif';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#000';
                    try{ ctx.fillText(text, x + 8, y); }catch(e){}
                  });
                });
                ctx.restore();
              }catch(e){
                console.warn('region barValueLabeler failed', e);
              }
            }
          }
        ],
        options:{ indexAxis: 'y', responsive:true, plugins:{ tooltip:{ callbacks:{ label: ctx=> `${ctx.label}: ${ctx.parsed}건` } }, legend:{ display:false } }, scales:{ x:{ title:{ display:true, text:'건수' } }, y:{ title:{ display:true, text:'지역' } } }, onClick: (evt)=>{ const pts = charts.region.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false); if (!pts.length) return; const idx = pts[0].index; const label = charts.region.data.labels[idx]; setCrossFilter('region', label); } }
      );
    }catch(e){ console.warn('charts.region render failed', e); try{ if(charts.region) charts.region.destroy(); charts.region = new Chart(ctx3, { type:'bar', data:{ labels: rLabels, datasets:[{ label:'지역', data: rData, backgroundColor: palette }] }, options:{ indexAxis:'y', responsive:true, plugins:{ legend:{ display:false } } } }); }catch(e2){ console.warn('charts.region fallback failed', e2); } }
  }

        // render legends for charts (swatch + count + percent)
        function renderLegend(containerSelector, labels, data, colors){
          const container = q(containerSelector); if(!container) return;
          // make activities and regions legends scrollable vertically
          if (containerSelector === '#legend-chart2' || containerSelector === '#legend-chart3'){
            container.classList.add('legend-scroll');
          } else {
            container.classList.remove('legend-scroll');
          }
          const total = data.reduce((s,x)=> s + (Number(x)||0), 0) || 0;
          container.innerHTML = labels.map((lab,i)=>{
            const cnt = data[i]||0; const pct = total? Math.round((cnt/total)*100) : 0;
            const color = colors[i % colors.length];
            return `<div class="legend-item"><span class="legend-swatch" style="background:${color}"></span><span class="legend-label">${escapeHtml(lab)}</span><span class="legend-count">${cnt}건 (${pct}%)</span></div>`;
          }).join('');
        }

  // attach legends for relevant charts (hour legend rendered after hLabels/hData are available)
  renderLegend('#legend-chart4', sLabels, sData, palette);

  // Populate subject, region, and schoolLevel filter selects so users can choose from available values
  (function populateFilters(){
    try{
      const subjSel = q('#filterSubject');
      if(subjSel){
        const prev = subjSel.value || '';
        subjSel.innerHTML = '<option value="">과목 전체</option>' + sLabels.map(l=> `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
        if(prev) subjSel.value = prev;
      }
      const regSel = q('#filterRegion');
      if(regSel){
        const prevR = regSel.value || '';
        regSel.innerHTML = '<option value="">지역 전체</option>' + rLabels.map(l=> `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
        if(prevR) regSel.value = prevR;
      }
      const slSel = q('#filterSchoolLevel');
      if(slSel){
        const prevL = slSel.value || '';
        const slEntries = agg.schoolLevels || [];
        const slLabels = slEntries.map(e=> e[0]);
        function mapLevel(orig){ const s = String(orig||'').trim(); if(!s) return s; if(/^[0-9]+$/.test(s)){ if(s==='1') return '초등'; if(s==='3') return '중등'; if(s==='4') return '고등'; } if(s.indexOf('고')!==-1 || s.indexOf('중')!==-1 || s.indexOf('초')!==-1) return s; return s; }
        slSel.innerHTML = '<option value="">학교급 전체</option>' + slLabels.map(orig => `<option value="${escapeHtml(orig)}">${escapeHtml(mapLevel(orig))}</option>`).join('');
        if(prevL) slSel.value = prevL;
      }
    }catch(e){ console.warn('populateFilters failed', e); }
  })();

  // time of day (ctx5)
  const hourGrouped = groupSmall(agg.hours, 24);
  const hLabels = hourGrouped.labels; const hData = hourGrouped.data;
        const ctx5 = document.getElementById('chart5').getContext('2d');
        if (charts.hour) { charts.hour.data.labels = hLabels; charts.hour.data.datasets[0].data = hData; charts.hour.update(); }
  else { charts.hour = new Chart(ctx5, { type:'bar', data:{ labels: hLabels, datasets:[{ label:'시간대', data: hData, backgroundColor: palette[3] }] }, options:{ responsive:true, plugins:{ tooltip:{ callbacks:{ label: ctx=> `${ctx.label}: ${ctx.parsed}건` } }, legend:{ position:'bottom' } }, scales:{ x:{ title:{ display:true, text:'시간(시)' } }, y:{ title:{ display:true, text:'건수' } } }, onClick: (evt)=>{
              const pts = charts.hour.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
              if (!pts.length) return;
              const idx = pts[0].index; const label = charts.hour.data.labels[idx];
              setCrossFilter('hour', label);
            } } }); }

        // now that hLabels/hData exist, render the legend for the hour chart
        renderLegend('#legend-chart5', hLabels, hData, palette);

        // establishments chart (chart6) -> percent stacked bars for 공립/사립 across staff
        try{
          const estGrouped = groupSmall(agg.establishments, 8);
          const eLabels = estGrouped.labels; const eData = estGrouped.data;
          const elChart6 = document.getElementById('chart6');
          if(!elChart6) throw new Error('chart6 element not found');
          const ctx6 = elChart6.getContext('2d');
          // Prevent Chart.js from auto-expanding canvas height — keep chart compact
          try{ if(!elChart6.style.height || elChart6.style.height === '') elChart6.style.height = '360px'; if(!elChart6.height) elChart6.height = 360; ctx6.canvas.style.maxHeight = '720px'; }catch(e){}
          const staffOrder = ['전체','송훈재','임준호','조영환'];

        // identify indices for public/private labels (defensive)
        const publicIdxs = []; const privateIdxs = [];
        eLabels.forEach((lab, idx)=>{
          const s = String(lab||'').toLowerCase();
          if(s.indexOf('공립') !== -1) publicIdxs.push(idx);
          if(s.indexOf('사립') !== -1) privateIdxs.push(idx);
        });

        function sumIdxs(idxs){ let s=0; idxs.forEach(i=> { s += Number(eData[i]||0); }); return s; }

        function countsFor(idxs){
          const out = [];
          // overall: use fullAgg if available so the overall column is unfiltered
          try{
            if(fullAgg && Array.isArray(fullAgg.establishments)){
              const fullSum = idxs.reduce((s,i)=>{ const lab = eLabels[i]; for(const e of fullAgg.establishments) if(String(e[0]||'') === String(lab||'')) return s + Number(e[1]||0); return s; }, 0);
              out.push(fullSum);
            } else {
              out.push(sumIdxs(idxs));
            }
          }catch(e){ out.push(sumIdxs(idxs)); }
          for(let si=1; si<staffOrder.length; si++){
            const name = staffOrder[si];
            const map = findEstMapForStaff ? findEstMapForStaff(agg, name) : (agg.establishmentsByStaff && agg.establishmentsByStaff[name] && agg.establishmentsByStaff[name].estTypes) || new Map();
            let s=0; idxs.forEach(i=>{ const lab = eLabels[i]; s += (map && map.get) ? (map.get(lab)||0) : 0; });
            out.push(s);
          }
          return out;
        }

          const pubCounts = countsFor(publicIdxs);
          const priCounts = countsFor(privateIdxs);
          const cols = staffOrder.length;
          const totals = Array(cols).fill(0);
          for(let i=0;i<cols;i++) totals[i] = (pubCounts[i]||0) + (priCounts[i]||0) || 0;
          const pubPct = pubCounts.map((v,i)=> totals[i]? Math.round((v/totals[i])*100) : 0);
          const priPct = priCounts.map((v,i)=> totals[i]? Math.round((v/totals[i])*100) : 0);

          const datasetsPct = [ { label:'공립', data: pubPct, backgroundColor: palette[0], barThickness:36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 }, { label:'사립', data: priPct, backgroundColor: palette[2] || '#ff9800', barThickness:36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 } ];

          const pctPlugin = {
            id: 'pctLabeler',
            afterDatasetsDraw(chart){
              const {ctx} = chart; ctx.save();
              chart.data.datasets.forEach((ds, di)=>{
                const meta = chart.getDatasetMeta(di);
                meta.data.forEach((bar, i)=>{
                  const pct = Number(ds.data[i]||0); if(!pct && pct!==0) return; if(pct===0) return;
                  const x = bar.x; const y = bar.y; const base = bar.base !== undefined ? bar.base : (bar.y + (bar.height||0));
                  const h = Math.abs(base - y); const centerY = Math.min(y, base) + h/2;
                  // contrast text
                  let textColor = '#fff'; try{ const bg = ds.backgroundColor||'#222'; if(bg.indexOf('#')===0){ let s=bg.replace('#',''); if(s.length===3) s=s.split('').map(c=>c+c).join(''); const r=parseInt(s.substr(0,2),16), g=parseInt(s.substr(2,2),16), b=parseInt(s.substr(4,2),16); const lum=(0.299*r+0.587*g+0.114*b)/255; textColor = lum>0.6? '#222':'#fff'; } }catch(e){}
                  ctx.fillStyle = textColor; ctx.font = '700 13px Arial, Noto Sans, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
                  const txt = `${pct}%`;
                  if(h > 24) ctx.fillText(txt, x, centerY);
                  else { ctx.fillStyle='#444'; ctx.fillText(txt, x, Math.min(y, base) - 10); }
                });
              });
              ctx.restore();
            }
          };

          const staffLabels = staffOrder;
          if(charts.est){ charts.est.data.labels = staffLabels; charts.est.data.datasets = datasetsPct; charts.est.update(); }
          else {
            charts.est = new Chart(ctx6, {
              type: 'bar',
              data: { labels: staffLabels, datasets: datasetsPct },
              plugins: [pctPlugin],
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  tooltip: { callbacks: { label: ctx=> `${ctx.dataset.label}: ${ctx.parsed.y||ctx.parsed}%` } },
                  legend: { position:'bottom' }
                },
                layout: { padding: { top: 6, bottom: 6 } },
                scales: {
                  x: { stacked:true },
                  y: { stacked:true, beginAtZero:true, suggestedMin:0, suggestedMax:100, max:100, title:{ display:true, text:'비율' }, ticks:{ stepSize:10, callback:v=> `${v}%` } }
                }
                ,
                onClick: function(evt){
                  const pts = charts.est.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                  if(!pts || !pts.length) return;
                  const idx = pts[0].index; const label = charts.est.data.labels[idx];
                    if(String(label||'').trim() === '전체') return; // '전체' should not set staff filter
                    setCrossFilter('staff', label);
                }
              }
            });
          }
          // legend should show counts (전체) for 공립/사립
          const totalPub = pubCounts[0]||0; const totalPri = priCounts[0]||0; renderLegend('#legend-chart6', ['공립','사립'], [totalPub, totalPri], [palette[0], (palette[2] || '#ff9800')]);
        }catch(e){
          console.warn('chart6 (설립구분) render failed', e, { establishments: agg && agg.establishments, establishmentsByStaff: agg && agg.establishmentsByStaff });
          try{ const legend6 = q('#legend-chart6'); if(legend6) legend6.innerHTML = '<div style="color:#ddd">설립구분 데이터가 없습니다</div>'; }catch(e2){}
        }
        // student buckets chart (chart7) -> percent stacked by staff (전체, 송훈재, 임준호, 조영환)
        try{
          const elChart7 = document.getElementById('chart7'); if(!elChart7) throw new Error('chart7 element not found');
          const ctx7 = elChart7.getContext('2d');
          // ensure the canvas has an explicit height so Chart.js with maintainAspectRatio:false
          // doesn't grow the canvas vertically and cause page scroll expansion
          try{ if(!elChart7.style.height || elChart7.style.height === '') elChart7.style.height = '360px'; if(!elChart7.height) elChart7.height = 360; ctx7.canvas.style.maxHeight = '720px'; }catch(e){}
          const staffOrder = ['전체','송훈재','임준호','조영환'];

          // bucket groups mapping from aggregate bucket labels
          const lowKeys = ['<100','100-300']; // 300명 이하
          const midKeys = ['301-600']; // 301-600
          const highKeys = ['>600']; // 600명 이상

          function findStaffBucketMap(name){
            try{
              if(!agg || !agg.studentBucketsByStaff) return new Map();
              if(agg.studentBucketsByStaff[name]) return agg.studentBucketsByStaff[name];
              const keys = Object.keys(agg.studentBucketsByStaff || {});
              for(const k of keys) if(k && k.indexOf(name)!==-1) return agg.studentBucketsByStaff[k];
              const lname = String(name||'').toLowerCase();
              for(const k of keys) if(k && String(k).toLowerCase().indexOf(lname)!==-1) return agg.studentBucketsByStaff[k];
              return new Map();
            }catch(e){ return new Map(); }
          }

          function sumForMapKeys(map, keys){ let s=0; try{ keys.forEach(k=> s += Number(map.get && map.get(k) ? map.get(k) : 0)); }catch(e){} return s; }

          // overall counts from agg.studentBuckets (array of [label,count])
          const overallMap = new Map(); (agg.studentBuckets||[]).forEach(e=> overallMap.set(e[0], e[1]));
          function overallSumFor(keys){ let s=0; keys.forEach(k=> s += Number(overallMap.get(k)||0)); return s; }

          const countsLow = [];// 300이하
          const countsMid = [];// 301-600
          const countsHigh = [];// 600이상

              // overall column (use fullAgg.studentBuckets to compute overall sums so '전체' is unfiltered)
                const fullOverallMap = new Map(); (fullAgg.studentBuckets||[]).forEach(e=> fullOverallMap.set(e[0], e[1]));
                function fullOverallSumFor(keys){ let s=0; keys.forEach(k=> s += Number(fullOverallMap.get(k)||0)); return s; }
                countsLow.push(fullOverallSumFor(lowKeys)); countsMid.push(fullOverallSumFor(midKeys)); countsHigh.push(fullOverallSumFor(highKeys));

          // per-staff columns
          for(let si=1; si<staffOrder.length; si++){
            const name = staffOrder[si]; const map = findStaffBucketMap(name) || new Map();
            countsLow.push(sumForMapKeys(map, lowKeys));
            countsMid.push(sumForMapKeys(map, midKeys));
            countsHigh.push(sumForMapKeys(map, highKeys));
          }

          // compute totals and percents
          const cols = staffOrder.length; const totals = Array(cols).fill(0);
          for(let i=0;i<cols;i++) totals[i] = (Number(countsLow[i]||0) + Number(countsMid[i]||0) + Number(countsHigh[i]||0)) || 0;
          const pctLow = countsLow.map((v,i)=> totals[i]? Math.round((v/totals[i])*100) : 0);
          const pctMid = countsMid.map((v,i)=> totals[i]? Math.round((v/totals[i])*100) : 0);
          const pctHigh = countsHigh.map((v,i)=> totals[i]? Math.round((v/totals[i])*100) : 0);

          const datasets = [
            { label: '300명 이하', data: pctLow, _raw: countsLow, backgroundColor: palette[0] },
            { label: '301-600', data: pctMid, _raw: countsMid, backgroundColor: palette[1] },
            { label: '600명 이상', data: pctHigh, _raw: countsHigh, backgroundColor: palette[2] }
          ];

          const pctLabelPlugin = {
            id: 'sbPctLabels',
            afterDatasetsDraw(chart){ const {ctx} = chart; ctx.save(); chart.data.datasets.forEach((ds, di)=>{ const meta = chart.getDatasetMeta(di); meta.data.forEach((bar, i)=>{ const pct = Number(ds.data[i]||0); if(pct===0 && pct!==0) return; if(pct===0) return; const raw = Number((ds._raw && ds._raw[i])||0); const x = bar.x; const y = bar.y; const base = bar.base !== undefined? bar.base : (bar.y + (bar.height||0)); const h = Math.abs(base - y); const centerY = Math.min(y, base) + h/2; ctx.fillStyle = '#000'; ctx.font = '700 13px Arial, Noto Sans, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; const txt = `${raw}건 (${pct}%)`; if(h>28) ctx.fillText(txt, x, centerY); else ctx.fillText(txt, x, Math.min(y, base)-12); }); }); ctx.restore(); }
          };

          if(charts.sb){ charts.sb.data.labels = staffOrder; charts.sb.data.datasets = datasets; charts.sb.update(); }
          else {
            charts.sb = new Chart(ctx7, {
              type: 'bar',
              data: { labels: staffOrder, datasets },
              plugins: [pctLabelPlugin],
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  tooltip: {
                    callbacks: {
                      label: function(ctx){
                        const idx = ctx.dataIndex;
                        const raw = (ctx.dataset && ctx.dataset._raw && ctx.dataset._raw[idx])? ctx.dataset._raw[idx] : (ctx.parsed.y||ctx.parsed);
                        const totalRaw = ctx.chart.data.datasets.reduce((s,ds)=> s + Number((ds._raw && ds._raw[idx])? ds._raw[idx] : (ds.data[idx]||0)),0) || 1;
                        const pct = Math.round((Number(raw)/totalRaw)*100);
                        return `${ctx.dataset.label}: ${raw}건 (${pct}%)`;
                      }
                    }
                  },
                  legend: { position: 'bottom' }
                },
                layout: { padding: { top:10, bottom:10 } },
                scales: { x:{ stacked:true }, y:{ stacked:true, beginAtZero:true, max:100, title:{ display:true, text:'비율' }, ticks:{ callback:v=> `${v}%` } } },
                onClick: function(evt){
                  const pts = charts.sb.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                  if(!pts || !pts.length) return;
                  const idx = pts[0].index; const label = charts.sb.data.labels[idx];
                  if(String(label||'').trim() === '전체') return; // do not apply staff filter when clicking the overall column
                  setCrossFilter('staff', label);
                }
              }
            });
          }

          // render legend counts overall
          renderLegend('#legend-chart7', ['300명 이하','301-600','600명 이상'], [countsLow[0]||0, countsMid[0]||0, countsHigh[0]||0], [palette[0], palette[1], palette[2]]);

        }catch(e){ console.warn('chart7 (학생수 버킷 percent-stack) render failed', e, { studentBuckets: agg && agg.studentBuckets, studentBucketsByStaff: agg && agg.studentBucketsByStaff }); try{ const legend7 = q('#legend-chart7'); if(legend7) legend7.innerHTML = '<div style="color:#ddd">학생수 버킷 데이터가 없습니다</div>'; }catch(e2){} }

        // Public vs Private chart removed to restore stability

        // grades totals (chart8)
        const gEntries = agg.grades || [];
        const gLabels = gEntries.map(e=> e[0]); const gData = gEntries.map(e=> e[1]);
        const el8 = document.getElementById('chart8');
        if (el8) {
          const ctx8 = el8.getContext('2d');
          if (charts.grades) { charts.grades.data.labels = gLabels; charts.grades.data.datasets[0].data = gData; charts.grades.update(); }
          else { charts.grades = new Chart(ctx8, { type:'bar', data:{ labels: gLabels, datasets:[{ label:'학년별 학생수 합계', data: gData, backgroundColor: palette }] }, options:{ responsive:true, plugins:{ tooltip:{ callbacks:{ label: ctx=> `${ctx.label}: ${ctx.parsed}명` } }, legend:{ position:'bottom' } }, scales:{ y:{ title:{ display:true, text:'학생수' } } }, onClick: function(evt){ const pts = charts.grades.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false); if(!pts || !pts.length) return; const idx = pts[0].index; const label = charts.grades.data.labels[idx]; setCrossFilter('grade', label); } } }); }
          renderLegend('#legend-chart8', gLabels, gData, palette);
        }

        // cross analysis: establishment x schoolLevel (stacked bar) - chart9
        const cross = agg.cross || {};
        const estKeys = Object.keys(cross);
        // collect all levels
        const levelSet = new Set(); estKeys.forEach(e=> { const obj = cross[e]||{}; Object.keys(obj).forEach(l=> levelSet.add(l)); });
        const levels = Array.from(levelSet);
        // datasets per level
        const crossDatasets = levels.map((lvl, idx)=>{
          return {
            label: lvl,
            data: estKeys.map(e=> (cross[e] && cross[e][lvl])? cross[e][lvl] : 0),
            backgroundColor: palette[idx % palette.length]
          };
        });
        const el9 = document.getElementById('chart9');
        if (el9) {
          const ctx9 = el9.getContext('2d');
          if (charts.cross) { charts.cross.data.labels = estKeys; charts.cross.data.datasets = crossDatasets; charts.cross.update(); }
          else { charts.cross = new Chart(ctx9, { type:'bar', data:{ labels: estKeys, datasets: crossDatasets }, options:{ responsive:true, plugins:{ tooltip:{ mode:'index', intersect:false }, legend:{ position:'bottom' } }, scales:{ x:{ stacked:true, title:{ display:true, text:'설립구분' } }, y:{ stacked:true, title:{ display:true, text:'학교 수' } } }, onClick: function(evt){ const pts = charts.cross.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false); if(!pts || !pts.length) return; const idx = pts[0].index; const label = charts.cross.data.labels[idx]; setCrossFilter('establishment', label); } } }); }
          const estCounts = estKeys.map(e => { const obj = cross[e]||{}; return Object.keys(obj).reduce((s,k)=> s + (obj[k]||0), 0); });
          renderLegend('#legend-chart9', estKeys, estCounts, palette);
        }

        // heatmap (chart10) using chartjs-chart-matrix
        try{
          const crossObj = agg.cross || {};
          const estLabels = Object.keys(crossObj || {});
          const levelSet = new Set(); estLabels.forEach(e=> { const obj = crossObj[e]||{}; Object.keys(obj).forEach(l=> levelSet.add(l)); });
          const levelLabels = Array.from(levelSet);
          const matrixData = [];
          let maxV = 0;
          estLabels.forEach((est, yi)=>{
            levelLabels.forEach((lvl, xi)=>{
              const v = (crossObj[est] && crossObj[est][lvl])? crossObj[est][lvl] : 0;
              matrixData.push({ x: xi, y: yi, v });
              if (v > maxV) maxV = v;
            });
          });
          // color interpolation helper
          function lerp(a,b,t){ return Math.round(a + (b-a)*t); }
          function colorForValue(v){ if(maxV<=0) return '#ffffff'; const t = Math.sqrt(v/maxV); const r=lerp(230,0,t); const g=lerp(242,63,t); const b=lerp(255,125,t); return `rgb(${r},${g},${b})`; }
          const el10 = document.getElementById('chart10');
          if (el10) {
            const ctx10 = el10.getContext('2d');
            const dataset = [{
            label: 'heat',
            data: matrixData,
            backgroundColor: function(ctx){ const v = ctx.dataset.data[ctx.dataIndex].v; return colorForValue(v); },
            width: ({chart}) => (chart.chartArea && chart.chartArea.width) ? (chart.chartArea.width / Math.max(1, levelLabels.length) - 2) : 10,
            height: ({chart}) => (chart.chartArea && chart.chartArea.height) ? (chart.chartArea.height / Math.max(1, estLabels.length) - 2) : 10
            }];
            if (charts.heat) {
              charts.heat.data.datasets = dataset;
              if (charts.heat.options && charts.heat.options.scales) {
                charts.heat.options.scales.x.labels = levelLabels;
                charts.heat.options.scales.y.labels = estLabels;
              }
              charts.heat.update();
            } else {
              charts.heat = new Chart(ctx10, {
                type: 'matrix',
                data: {
                  datasets: dataset
                },
                options: {
                  responsive: true,
                  plugins: {
                    tooltip: {
                      callbacks: {
                        title: function() { return ''; },
                        label: function(ctx) {
                          const d = ctx.dataset.data[ctx.dataIndex];
                          const lvl = levelLabels[d.x] || d.x;
                          const est = estLabels[d.y] || d.y;
                          return est + ' / ' + lvl + ': ' + d.v + '건';
                        }
                      }
                    },
                    legend: { display: false }
                  },
                  scales: {
                    x: { type: 'category', labels: levelLabels, title: { display: true, text: '학교급' } },
                    y: { type: 'category', labels: estLabels, title: { display: true, text: '설립구분' }, reverse: true }
                  }
                }
              });
            }
          }
        }catch(e){ console.warn('heatmap render failed', e); }

        // render top teachers list into table head (we'll show top 10 below table)
        const top = agg.topTeachers.slice(0,8);
        const tbody = q('#school-table-body'); if (tbody){ tbody.innerHTML = top.map(t=> `<tr><td colspan="7" style="text-align:left;padding:.6rem;background:#172a34">${escapeHtml(t[0])} — ${t[1]}건</td></tr>`).join(''); }
      }

      function formatDuration(v){
        if (v.duration) return String(v.duration);
        if (v.visitStart && v.visitEnd){
          try{
            const s = v.visitStart.split(':'); const e = v.visitEnd.split(':');
            const sd = new Date(); sd.setHours(Number(s[0]||0), Number(s[1]||0),0,0);
            const ed = new Date(); ed.setHours(Number(e[0]||0), Number(e[1]||0),0,0);
            let mins = Math.round((ed - sd)/60000);
            if (isNaN(mins) || mins < 0) return '';
            const hr = Math.floor(mins/60); const mm = mins % 60; return hr? `${hr}h ${mm}m` : `${mm}m`;
          }catch(e){ return ''; }
        }
        return '';
      }

      // Pagination state for issues
      window._issues_list = window._issues_list || [];
      window._issues_page = window._issues_page || 1;
      window._issues_pageSize = window._issues_pageSize || 20;

      function setIssuesList(visits){
        try{
          // Only consider backend `issue` field — ignore conversation/notes/etc.
          const enriched = (visits||[]).map(v=>{
            const issueVal = v.issue || '';
            return Object.assign({}, v, { _issue: String(issueVal||'') });
          }).filter(v=> (v._issue && v._issue.trim().length));

          enriched.sort((a,b)=>{
            const da = (a._date||a.visitDate||a._savedAt||'').toString();
            const db = (b._date||b.visitDate||b._savedAt||'').toString();
            if (da === db) {
              const sa = a._savedAt || a._saved_at || 0; const sb = b._savedAt || b._saved_at || 0;
              return (sb > sa) ? 1 : (sb < sa ? -1 : 0);
            }
            return (db || '').localeCompare(da || '');
          });

          window._issues_list = enriched;
          window._issues_page = 1;
          renderIssuesPage(window._issues_page);
        }catch(e){ console.warn('setIssuesList failed', e); window._issues_list = []; renderIssuesPage(1); }
      }

      function renderIssuesPage(page){
        const tb = q('#salesTable'); if(!tb) return;
        const countEl = q('#issuesCount'); if(countEl) countEl.textContent = window._issues_list.length || 0;
        const pageSize = window._issues_pageSize || 20;
        const total = window._issues_list.length || 0;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        page = Math.min(Math.max(1, page||1), totalPages);
        window._issues_page = page;
        const start = (page-1)*pageSize; const end = start + pageSize;
        const pageItems = window._issues_list.slice(start, end);
        tb.innerHTML = pageItems.map(v=>{
          const staffVal = v.staffLabel || v.staff || '';
          const regionVal = v.region || '';
          const schoolVal = v.school || '';
          const subjArr = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
          const subjVal = subjArr.join(', ');
          const teacherVal = v.teacher || v.teacherName || v.staffTeacher || '';
          const issueText = (v._issue && v._issue.trim()) ? v._issue.trim() : '';
          const attrs = [];
          attrs.push(`data-id="${encodeURIComponent(v.id||'')}"`);
          attrs.push(`data-staff="${encodeURIComponent(staffVal)}"`);
          attrs.push(`data-school="${encodeURIComponent(schoolVal)}"`);
          attrs.push(`data-region="${encodeURIComponent(regionVal)}"`);
          attrs.push(`data-subjects="${encodeURIComponent(subjVal)}"`);
          attrs.push(`data-activities="${encodeURIComponent(Array.isArray(v.activities)? v.activities.join(', '): (v.activities||''))}"`);
          attrs.push(`data-meeting="${encodeURIComponent(String(v.meeting||v.meetingContent||v.meeting_text||v.meetingText||''))}"`);
          attrs.push(`data-meetingcontent="${encodeURIComponent(String(v.meetingContent||v.meeting||v.meeting_text||v.meetingText||''))}"`);
          attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
          attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
          attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
          attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
          attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
          attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
          attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
          attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
          attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
          attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
          attrs.push(`data-teacher="${encodeURIComponent(teacherVal)}"`);
          attrs.push(`data-date="${encodeURIComponent(v._date||v.visitDate||'')}"`);
          attrs.push(`data-establishment="${encodeURIComponent(v.establishment||v.establish||'')}"`);
          attrs.push(`data-schoollevel="${encodeURIComponent(v.schoolLevel||v.school_grade||'')}"`);
          attrs.push(`data-totalstudents="${encodeURIComponent(String(v.totalStudents||v.students||''))}"`);
          attrs.push(`data-features="${encodeURIComponent(String(v.features||''))}"`);
          attrs.push(`data-grade1="${encodeURIComponent(String(v.grade1||''))}"`);
          attrs.push(`data-grade2="${encodeURIComponent(String(v.grade2||''))}"`);
          attrs.push(`data-grade3="${encodeURIComponent(String(v.grade3||''))}"`);
          attrs.push(`data-phone="${encodeURIComponent(String(v.phone||v.Phonenumber||''))}"`);
          attrs.push(`data-email="${encodeURIComponent(String(v.email||''))}"`);
          const attrStr = attrs.join(' ');
          return `<tr>
                    <td><div class="td-inline">${escapeHtml(v._date||'')}</div></td>
                    <td><div class="td-inline">${escapeHtml(staffVal)}</div></td>
                    <td><div class="td-inline">${escapeHtml(regionVal)}</div></td>
                    <td><div class="td-inline">${escapeHtml(schoolVal)}</div></td>
                    <td><div class="td-inline">${escapeHtml(subjVal)}</div></td>
                    <td><div class="td-inline">${escapeHtml(teacherVal)}</div></td>
                    <td><div class="td-clamp" style="white-space:pre-wrap">${escapeHtml(issueText)}</div></td>
                    <td><button class="detail-btn" ${attrStr}>보기</button></td>
                  </tr>`;
        }).join('');

        // render pagination controls
        const pc = q('#paginationControls'); if(pc){
          const pages = [];
          pages.push(`<button ${page===1? 'disabled':''} data-page="${page-1}">◀ 이전</button>`);
          // show up to 7 numeric buttons centered around current page
          const range = 3; const startNum = Math.max(1, page-range); const endNum = Math.min(totalPages, page+range);
          for(let i=startNum;i<=endNum;i++){
            pages.push(`<button class="${i===page? 'active':''}" data-page="${i}">${i}</button>`);
          }
          pages.push(`<button ${page===totalPages? 'disabled':''} data-page="${page+1}">다음 ▶</button>`);
          pc.innerHTML = pages.join('');
          Array.from(pc.querySelectorAll('button')).forEach(b=>{ b.addEventListener('click', function(e){ const p = Number(this.getAttribute('data-page')||1); renderIssuesPage(p); }); });
        }
      }

        // --- Requests / Delivery / Materials lists (same pagination pattern as issues) ---
        window._requests_list = window._requests_list || [];
        window._requests_page = window._requests_page || 1;
        window._requests_pageSize = window._requests_pageSize || 20;

        window._delivery_list = window._delivery_list || [];
        window._delivery_page = window._delivery_page || 1;
        window._delivery_pageSize = window._delivery_pageSize || 20;

        window._materials_list = window._materials_list || [];
        window._materials_page = window._materials_page || 1;
        window._materials_pageSize = window._materials_pageSize || 20;

        function setRequestsList(visits){
          try{
            const enriched = (visits||[]).map(v=> Object.assign({}, v, { _req: String(v.requests||'') })).filter(v=> (v._req && v._req.trim().length));
            enriched.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
            window._requests_list = enriched; window._requests_page = 1; renderRequestsPage(1);
          }catch(e){ console.warn('setRequestsList failed', e); window._requests_list = []; renderRequestsPage(1); }
        }

        function renderRequestsPage(page){
          const tb = q('#requestsTable'); if(!tb) return;
          const countEl = q('#requestsCount'); if(countEl) countEl.textContent = window._requests_list.length || 0;
          const pageSize = window._requests_pageSize || 20; const total = window._requests_list.length || 0; const totalPages = Math.max(1, Math.ceil(total / pageSize));
          page = Math.min(Math.max(1, page||1), totalPages); window._requests_page = page;
          const start = (page-1)*pageSize; const end = start + pageSize; const pageItems = window._requests_list.slice(start, end);
          tb.innerHTML = pageItems.map(v=>{
            const subjArr = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
            const subjVal = subjArr.join(', ');
            const staffVal = v.staffLabel || v.staff || '';
            const regionVal = v.region || '';
            const schoolVal = v.school || '';
            const teacherVal = v.teacher || v.teacherName || '';
            const reqText = String(v.requests||'');
            const attrs = [];
            attrs.push(`data-id="${encodeURIComponent(v.id||'')}"`);
            attrs.push(`data-staff="${encodeURIComponent(staffVal)}"`);
            attrs.push(`data-school="${encodeURIComponent(schoolVal)}"`);
            attrs.push(`data-region="${encodeURIComponent(regionVal)}"`);
            attrs.push(`data-subjects="${encodeURIComponent(subjVal)}"`);
            attrs.push(`data-activities="${encodeURIComponent(Array.isArray(v.activities)? v.activities.join(', '): (v.activities||''))}"`);
            attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
            attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
            attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
            attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
            attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
            attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
            attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
            attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
            attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
            attrs.push(`data-meeting="${encodeURIComponent(String(v.meeting||v.meetingContent||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-meetingcontent="${encodeURIComponent(String(v.meetingContent||v.meeting||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
            attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
            attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
            attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
            attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
            attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
            attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
            attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
            attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
            attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
            attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
            attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
            attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
            attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
            attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
            attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
            attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
            attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
            attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
            attrs.push(`data-teacher="${encodeURIComponent(teacherVal)}"`);
            attrs.push(`data-date="${encodeURIComponent(v._date||v.visitDate||'')}"`);
            attrs.push(`data-establishment="${encodeURIComponent(v.establishment||v.establish||'')}"`);
            attrs.push(`data-schoollevel="${encodeURIComponent(v.schoolLevel||v.school_grade||'')}"`);
            attrs.push(`data-totalstudents="${encodeURIComponent(String(v.totalStudents||v.students||''))}"`);
            attrs.push(`data-features="${encodeURIComponent(String(v.features||''))}"`);
            attrs.push(`data-grade1="${encodeURIComponent(String(v.grade1||''))}"`);
            attrs.push(`data-grade2="${encodeURIComponent(String(v.grade2||''))}"`);
            attrs.push(`data-grade3="${encodeURIComponent(String(v.grade3||''))}"`);
            attrs.push(`data-phone="${encodeURIComponent(String(v.phone||v.Phonenumber||''))}"`);
            attrs.push(`data-email="${encodeURIComponent(String(v.email||''))}"`);
            attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
            attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
            attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
            attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
            attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
            attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
            attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
            attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
            attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
            attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
            const attrStr = attrs.join(' ');
            return `<tr><td><div class="td-inline">${escapeHtml(v._date||'')}</div></td><td><div class="td-inline">${escapeHtml(staffVal)}</div></td><td><div class="td-inline">${escapeHtml(regionVal)}</div></td><td><div class="td-inline">${escapeHtml(schoolVal)}</div></td><td><div class="td-inline">${escapeHtml(subjVal)}</div></td><td><div class="td-inline">${escapeHtml(teacherVal)}</div></td><td><div class="td-clamp" style="white-space:pre-wrap">${escapeHtml(reqText)}</div></td><td><button class="detail-btn" ${attrStr}>보기</button></td></tr>`; }).join('');
          const pc = q('#paginationRequests'); if(pc){ const pages=[]; pages.push(`<button ${page===1? 'disabled':''} data-page="${page-1}">◀ 이전</button>`); const range=3; const startNum=Math.max(1,page-range); const endNum=Math.min(totalPages,page+range); for(let i=startNum;i<=endNum;i++){ pages.push(`<button class="${i===page? 'active':''}" data-page="${i}">${i}</button>`); } pages.push(`<button ${page===totalPages? 'disabled':''} data-page="${page+1}">다음 ▶</button>`); pc.innerHTML = pages.join(''); Array.from(pc.querySelectorAll('button')).forEach(b=>{ b.addEventListener('click', function(){ const p=Number(this.getAttribute('data-page')||1); renderRequestsPage(p); }); }); }
        }

        function setDeliveryList(visits){
          try{
            const enriched = (visits||[]).map(v=> Object.assign({}, v, { _del: String(v.delivery||'') })).filter(v=> (v._del && v._del.trim().length));
            enriched.sort((a,b)=> (b._date||'').localeCompare(a._date||'')); window._delivery_list = enriched; window._delivery_page = 1; renderDeliveryPage(1);
          }catch(e){ console.warn('setDeliveryList failed', e); window._delivery_list = []; renderDeliveryPage(1); }
        }

        function renderDeliveryPage(page){
          const tb = q('#deliveryTable'); if(!tb) return; const countEl = q('#deliveryCount'); if(countEl) countEl.textContent = window._delivery_list.length || 0; const pageSize = window._delivery_pageSize || 20; const total = window._delivery_list.length || 0; const totalPages = Math.max(1, Math.ceil(total / pageSize)); page = Math.min(Math.max(1, page||1), totalPages); window._delivery_page = page; const start = (page-1)*pageSize; const end = start + pageSize; const pageItems = window._delivery_list.slice(start, end);
          tb.innerHTML = pageItems.map(v=>{
            const subjArr = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
            const subjVal = subjArr.join(', ');
            const staffVal = v.staffLabel || v.staff || '';
            const regionVal = v.region || '';
            const schoolVal = v.school || '';
            const teacherVal = v.teacher || v.teacherName || '';
            const delText = String(v.delivery||'');
            const attrs = [];
            attrs.push(`data-id="${encodeURIComponent(v.id||'')}"`);
            attrs.push(`data-staff="${encodeURIComponent(staffVal)}"`);
            attrs.push(`data-school="${encodeURIComponent(schoolVal)}"`);
            attrs.push(`data-region="${encodeURIComponent(regionVal)}"`);
            attrs.push(`data-subjects="${encodeURIComponent(subjVal)}"`);
            attrs.push(`data-activities="${encodeURIComponent(Array.isArray(v.activities)? v.activities.join(', '): (v.activities||''))}"`);
            attrs.push(`data-meeting="${encodeURIComponent(String(v.meeting||v.meetingContent||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-meetingcontent="${encodeURIComponent(String(v.meetingContent||v.meeting||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
            attrs.push(`data-teacher="${encodeURIComponent(teacherVal)}"`);
            attrs.push(`data-date="${encodeURIComponent(v._date||v.visitDate||'')}"`);
            attrs.push(`data-establishment="${encodeURIComponent(v.establishment||v.establish||'')}"`);
            attrs.push(`data-schoollevel="${encodeURIComponent(v.schoolLevel||v.school_grade||'')}"`);
            attrs.push(`data-totalstudents="${encodeURIComponent(String(v.totalStudents||v.students||''))}"`);
            attrs.push(`data-features="${encodeURIComponent(String(v.features||''))}"`);
            attrs.push(`data-grade1="${encodeURIComponent(String(v.grade1||''))}"`);
            attrs.push(`data-grade2="${encodeURIComponent(String(v.grade2||''))}"`);
            attrs.push(`data-grade3="${encodeURIComponent(String(v.grade3||''))}"`);
            attrs.push(`data-phone="${encodeURIComponent(String(v.phone||v.Phonenumber||''))}"`);
            attrs.push(`data-email="${encodeURIComponent(String(v.email||''))}"`);
            const attrStr = attrs.join(' ');
            return `<tr><td><div class="td-inline">${escapeHtml(v._date||'')}</div></td><td><div class="td-inline">${escapeHtml(staffVal)}</div></td><td><div class="td-inline">${escapeHtml(regionVal)}</div></td><td><div class="td-inline">${escapeHtml(schoolVal)}</div></td><td><div class="td-inline">${escapeHtml(subjVal)}</div></td><td><div class="td-inline">${escapeHtml(teacherVal)}</div></td><td><div class="td-clamp" style="white-space:pre-wrap">${escapeHtml(delText)}</div></td><td><button class="detail-btn" ${attrStr}>보기</button></td></tr>`; }).join('');
          const pc = q('#paginationDelivery'); if(pc){ const pages=[]; pages.push(`<button ${page===1? 'disabled':''} data-page="${page-1}">◀ 이전</button>`); const range=3; const startNum=Math.max(1,page-range); const endNum=Math.min(totalPages,page+range); for(let i=startNum;i<=endNum;i++){ pages.push(`<button class="${i===page? 'active':''}" data-page="${i}">${i}</button>`); } pages.push(`<button ${page===totalPages? 'disabled':''} data-page="${page+1}">다음 ▶</button>`); pc.innerHTML = pages.join(''); Array.from(pc.querySelectorAll('button')).forEach(b=>{ b.addEventListener('click', function(){ const p=Number(this.getAttribute('data-page')||1); renderDeliveryPage(p); }); }); }
        }

        function setMaterialsList(visits){
          try{
            const giftFieldNames = ['gift','gifts','증정','증정사항','증정품','present','sample'];
            function extractGiftsFromRecord(v){
              for(const k of giftFieldNames){
                if(v[k]){
                  if(Array.isArray(v[k])) return v[k].filter(Boolean);
                  const s = String(v[k]||'').trim();
                  if(!s) return [];
                  return s.split(/[,;\\/]+/).map(x=> x.trim()).filter(Boolean);
                }
              }
              // no explicit gift field found
              return [];
            }
            const enriched = (visits||[]).map(v=> {
              const _gifts = extractGiftsFromRecord(v);
              return Object.assign({}, v, { _materials: Array.isArray(v.materials)? v.materials : (v.materials? [v.materials] : []), _gifts });
            }).filter(v=> Array.isArray(v._gifts) && v._gifts.length>0);
            enriched.sort((a,b)=> (b._date||'').localeCompare(a._date||'')); window._materials_list = enriched; window._materials_page = 1; renderMaterialsPage(1);
          }catch(e){ console.warn('setMaterialsList failed', e); window._materials_list = []; renderMaterialsPage(1); }
        }

        function renderMaterialsPage(page){
          const tb = q('#materialsTable'); if(!tb) return; const countEl = q('#materialsCount'); if(countEl) countEl.textContent = window._materials_list.length || 0; const pageSize = window._materials_pageSize || 20; const total = window._materials_list.length || 0; const totalPages = Math.max(1, Math.ceil(total / pageSize)); page = Math.min(Math.max(1, page||1), totalPages); window._materials_page = page; const start = (page-1)*pageSize; const end = start + pageSize; const pageItems = window._materials_list.slice(start, end);
          tb.innerHTML = pageItems.map(v=>{
            const subjArr = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
            const subjVal = subjArr.join(', ');
            const giftVal = Array.isArray(v._gifts)? v._gifts.join(', ') : (v._gifts? String(v._gifts): '');
            const staffVal = v.staffLabel || v.staff || '';
            const regionVal = v.region || '';
            const schoolVal = v.school || '';
            const teacherVal = v.teacher || v.teacherName || '';
            const attrs = [];
            attrs.push(`data-id="${encodeURIComponent(v.id||'')}"`);
            attrs.push(`data-staff="${encodeURIComponent(staffVal)}"`);
            attrs.push(`data-school="${encodeURIComponent(schoolVal)}"`);
            attrs.push(`data-region="${encodeURIComponent(regionVal)}"`);
            attrs.push(`data-subjects="${encodeURIComponent(subjVal)}"`);
            attrs.push(`data-activities="${encodeURIComponent(Array.isArray(v.activities)? v.activities.join(', '): (v.activities||''))}"`);
            attrs.push(`data-meeting="${encodeURIComponent(String(v.meeting||v.meetingContent||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-meetingcontent="${encodeURIComponent(String(v.meetingContent||v.meeting||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
            attrs.push(`data-visitstart="${encodeURIComponent(String(v.visitStart||v.startTime||v.visit_start||''))}"`);
            attrs.push(`data-visitend="${encodeURIComponent(String(v.visitEnd||v.endTime||v.visit_end||''))}"`);
            attrs.push(`data-duration="${encodeURIComponent(String(v.duration||v.totalDuration||v.visitDuration||''))}"`);
            attrs.push(`data-delivery="${encodeURIComponent(String(v.delivery||''))}"`);
            attrs.push(`data-requests="${encodeURIComponent(String(v.requests||''))}"`);
            attrs.push(`data-followup="${encodeURIComponent(String(v.followUp||v.follow_up||''))}"`);
            attrs.push(`data-materials="${encodeURIComponent(Array.isArray(v.materials)? v.materials.join(', '): (v.materials||''))}"`);
            attrs.push(`data-gift="${encodeURIComponent(giftVal||'')}"`);
            attrs.push(`data-publisher="${encodeURIComponent(String(v.publisher||v.출판사||v.publishing||''))}"`);
            attrs.push(`data-conversation="${encodeURIComponent(String(v.conversation||v.convo||''))}"`);
            attrs.push(`data-teacher="${encodeURIComponent(teacherVal)}"`);
            attrs.push(`data-date="${encodeURIComponent(v._date||v.visitDate||'')}"`);
            attrs.push(`data-establishment="${encodeURIComponent(v.establishment||v.establish||'')}"`);
            attrs.push(`data-schoollevel="${encodeURIComponent(v.schoolLevel||v.school_grade||'')}"`);
            attrs.push(`data-totalstudents="${encodeURIComponent(String(v.totalStudents||v.students||''))}"`);
            attrs.push(`data-features="${encodeURIComponent(String(v.features||''))}"`);
            attrs.push(`data-grade1="${encodeURIComponent(String(v.grade1||''))}"`);
            attrs.push(`data-grade2="${encodeURIComponent(String(v.grade2||''))}"`);
            attrs.push(`data-grade3="${encodeURIComponent(String(v.grade3||''))}"`);
            attrs.push(`data-phone="${encodeURIComponent(String(v.phone||v.Phonenumber||''))}"`);
            attrs.push(`data-email="${encodeURIComponent(String(v.email||''))}"`);
            const attrStr = attrs.join(' ');
            return `<tr><td><div class="td-inline">${escapeHtml(v._date||'')}</div></td><td><div class="td-inline">${escapeHtml(staffVal)}</div></td><td><div class="td-inline">${escapeHtml(regionVal)}</div></td><td><div class="td-inline">${escapeHtml(schoolVal)}</div></td><td><div class="td-inline">${escapeHtml(subjVal)}</div></td><td><div class="td-inline">${escapeHtml(teacherVal)}</div></td><td><div class="td-clamp" style="white-space:pre-wrap">${escapeHtml(giftVal)}</div></td><td><button class="detail-btn" ${attrStr}>보기</button></td></tr>`; }).join('');
          const pc = q('#paginationMaterials'); if(pc){ const pages=[]; pages.push(`<button ${page===1? 'disabled':''} data-page="${page-1}">◀ 이전</button>`); const range=3; const startNum=Math.max(1,page-range); const endNum=Math.min(totalPages,page+range); for(let i=startNum;i<=endNum;i++){ pages.push(`<button class="${i===page? 'active':''}" data-page="${i}">${i}</button>`); } pages.push(`<button ${page===totalPages? 'disabled':''} data-page="${page+1}">다음 ▶</button>`); pc.innerHTML = pages.join(''); Array.from(pc.querySelectorAll('button')).forEach(b=>{ b.addEventListener('click', function(){ const p=Number(this.getAttribute('data-page')||1); renderMaterialsPage(p); }); }); }
        }

        // --- Meeting keyword (AIDT / 구글클래스룸 하이러닝) list and pager ---
        window._meeting_keywords_list = window._meeting_keywords_list || [];
        window._meeting_keywords_page = window._meeting_keywords_page || 1;
        window._meeting_keywords_pageSize = window._meeting_keywords_pageSize || 20;

        function setMeetingKeywordsList(visits){
          try{
            // Make matching stricter to avoid false positives:
            // - Only search primary text fields: meeting, meetingContent, conversation
            // - Use regex for whole-word/phrase matching (case-insensitive)
            const patterns = [ /\bAIDT\b/i, /구글클래스룸\s*하이러닝/i ];
            const list = (visits||[]).filter(v=>{
              const fields = [v.meeting, v.meetingContent, v.conversation];
              const joined = fields.map(f=> String(f||'')).join(' ');
              return patterns.some(p=> p.test(joined));
            }).map(v=> Object.assign({}, v));
            list.sort((a,b)=> (b._date||'').localeCompare(a._date||''));
            window._meeting_keywords_list = list; window._meeting_keywords_page = 1; renderMeetingKeywordsPage(1);
          }catch(e){ console.warn('setMeetingKeywordsList failed', e); window._meeting_keywords_list = []; renderMeetingKeywordsPage(1); }
        }

        function renderMeetingKeywordsPage(page){
          const tb = q('#meetingKeywordTable'); if(!tb) return;
          const countEl = q('#meetingKeywordCount'); if(countEl) countEl.textContent = window._meeting_keywords_list.length || 0;
          const pageSize = window._meeting_keywords_pageSize || 20;
          const total = window._meeting_keywords_list.length || 0;
          const totalPages = Math.max(1, Math.ceil(total / pageSize));
          page = Math.min(Math.max(1, page||1), totalPages);
          window._meeting_keywords_page = page;
          const start = (page-1)*pageSize; const end = start + pageSize; const pageItems = window._meeting_keywords_list.slice(start, end);
          tb.innerHTML = pageItems.map(v=>{
            const staffVal = v.staffLabel || v.staff || '';
            const regionVal = v.region || '';
            const schoolVal = v.school || '';
            const teacherVal = v.teacher || v.teacherName || '';
            const subjArr = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : [])));
            const subjVal = subjArr.join(', ');
            const dateVal = v._date || v.visitDate || '';
            const attrs = [];
            attrs.push(`data-id="${encodeURIComponent(v.id||'')}"`);
            attrs.push(`data-staff="${encodeURIComponent(staffVal)}"`);
            attrs.push(`data-school="${encodeURIComponent(schoolVal)}"`);
            attrs.push(`data-region="${encodeURIComponent(regionVal)}"`);
            attrs.push(`data-subjects="${encodeURIComponent(subjVal)}"`);
            attrs.push(`data-activities="${encodeURIComponent(Array.isArray(v.activities)? v.activities.join(', '): (v.activities||''))}"`);
            attrs.push(`data-meeting="${encodeURIComponent(String(v.meeting||v.meetingContent||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-meetingcontent="${encodeURIComponent(String(v.meetingContent||v.meeting||v.meeting_text||v.meetingText||''))}"`);
            attrs.push(`data-note="${encodeURIComponent(String(v.note||v.issue||v.detail||v.conversation||''))}"`);
            attrs.push(`data-teacher="${encodeURIComponent(teacherVal)}"`);
            attrs.push(`data-date="${encodeURIComponent(dateVal)}"`);
            const attrStr = attrs.join(' ');
            return `<tr>\n                      <td><div class="td-inline">${escapeHtml(dateVal)}</div></td>\n                      <td><div class="td-inline">${escapeHtml(staffVal)}</div></td>\n                      <td><div class="td-inline">${escapeHtml(regionVal)}</div></td>\n                      <td><div class="td-inline">${escapeHtml(schoolVal)}</div></td>\n                      <td><div class="td-inline">${escapeHtml(teacherVal)}</div></td>\n                      <td><button class="detail-btn" ${attrStr}>보기</button></td>\n                    </tr>`;
          }).join('');

          const pc = q('#paginationMeetingKeywords'); if(pc){ const pages = []; pages.push(`<button ${page===1? 'disabled':''} data-page="${page-1}">◀ 이전</button>`); const range = 3; const startNum = Math.max(1, page-range); const endNum = Math.min(totalPages, page+range); for(let i=startNum;i<=endNum;i++){ pages.push(`<button class="${i===page? 'active':''}" data-page="${i}">${i}</button>`); } pages.push(`<button ${page===totalPages? 'disabled':''} data-page="${page+1}">다음 ▶</button>`); pc.innerHTML = pages.join(''); Array.from(pc.querySelectorAll('button')).forEach(b=>{ b.addEventListener('click', function(){ const p = Number(this.getAttribute('data-page')||1); renderMeetingKeywordsPage(p); }); }); }
        }

        // Fallback renderer: populate recent tables from raw `visits` when auxiliary fetches fail
        function renderRecentTable(visits){
          try{
            const enriched = (visits||[]).map(v=> Object.assign({}, v, {
              _issue: String(v.issue||''),
              _req: String(v.requests||''),
              _del: String(v.delivery||''),
              _materials: Array.isArray(v.materials)? v.materials : (v.materials? [v.materials] : [])
            }));

            // issues: include explicit issue OR any notable text fields (activities/requests/delivery/materials)
            const issues = enriched.filter(v=> (v._issue && v._issue.trim().length) || (v.activities && String(v.activities).trim().length) || (v._req && v._req.trim().length) || (v._del && v._del.trim().length) || (Array.isArray(v._materials) && v._materials.length>0));
            window._issues_list = issues; window._issues_page = 1; try{ renderIssuesPage(1); }catch(e){ /* ignore */ }

            // requests
            const reqs = enriched.filter(v=> v._req && v._req.trim().length);
            window._requests_list = reqs; window._requests_page = 1; try{ renderRequestsPage(1); }catch(e){ /* ignore */ }

            // delivery
            const dels = enriched.filter(v=> v._del && v._del.trim().length);
            window._delivery_list = dels; window._delivery_page = 1; try{ renderDeliveryPage(1); }catch(e){ /* ignore */ }

            // materials: use gift-extraction routine so 증정사항 shows only gift items (not all materials)
            try{ setMaterialsList(enriched); }catch(e){ console.warn('setMaterialsList call failed', e); window._materials_list = []; renderMaterialsPage(1); }

          }catch(e){ console.warn('renderRecentTable failed', e); }
        }

      function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

      async function refresh(){
  const staff = q('#filterUser') && q('#filterUser').value || '';
  const region = q('#filterRegion') && q('#filterRegion').value || '';
  const school = q('#filterSchool') && q('#filterSchool').value || '';
  const teacher = q('#filterTeacher') && q('#filterTeacher').value || '';
  const subject = q('#filterSubject') && q('#filterSubject').value || '';
  const start = q('#filterStart') && q('#filterStart').value || '';
  const end = q('#filterEnd') && q('#filterEnd').value || '';
  const establishment = q('#filterEstablish') && q('#filterEstablish').value || '';
  const schoolLevel = q('#filterSchoolLevel') && q('#filterSchoolLevel').value || '';
  const minStudents = q('#filterMinStudents') && q('#filterMinStudents').value || 0;
  const maxStudents = q('#filterMaxStudents') && q('#filterMaxStudents').value || 0;
        
        q('#metric1').textContent = '-'; q('#metric2').textContent='-'; q('#metric3').textContent='-'; q('#metric4').textContent='-';
    // Fetch KPIs from client-side visits (fast) but prefer server-side aggregate for charts
    const minActivities = q('#filterMinActivities') && q('#filterMinActivities').value || 0;
    const maxActivities = q('#filterMaxActivities') && q('#filterMaxActivities').value || 0;
    const minMaterials = q('#filterMinMaterials') && q('#filterMinMaterials').value || 0;
    const maxMaterials = q('#filterMaxMaterials') && q('#filterMaxMaterials').value || 0;
    const visitsRaw = await fetchVisits({staff:start? staff : staff, start, end, region, subject, establishment, schoolLevel, minStudents, maxStudents, minActivities, maxActivities, minMaterials, maxMaterials});
    // populate autocomplete datalists for school and teacher from fetched visits
    try{
      const schoolSet = new Set();
      const teacherSet = new Set();
      (visitsRaw||[]).forEach(v=>{
        const s = String(v.school||v.schoolName||'').trim(); if(s) schoolSet.add(s);
        const t = String(v.teacher||v.teacherName||v.staffTeacher||'').trim(); if(t) teacherSet.add(t);
      });
      const schoolListEl = q('#schoolList'); if(schoolListEl){ schoolListEl.innerHTML = Array.from(schoolSet).sort().map(s=> `<option value="${escapeHtml(s)}"></option>`).join(''); }
      const teacherListEl = q('#teacherList'); if(teacherListEl){ teacherListEl.innerHTML = Array.from(teacherSet).sort().map(t=> `<option value="${escapeHtml(t)}"></option>`).join(''); }
    }catch(e){ console.warn('populate autocomplete lists failed', e); }
    // apply favor and cross-filtering client-side (visit fields may use various keys)
    const favor = q('#filterFavor') && q('#filterFavor').value || '';
    // global cross-filter set by chart clicks: { type:'activity'|'subject'|'region'|'staff'|'date', value: '...' }
    const cross = window._crossFilter || null;
    function visitFavor(v){ const raw = String(v.favor || v.favorValue || v.favor_raw || v.reaction || v.반응 || v['반응'] || '').trim().toLowerCase(); if(!raw) return ''; if(raw.indexOf('좋')!==-1) return 'promoter'; if(raw.indexOf('보통')!==-1) return 'passive'; if(raw.indexOf('나쁨')!==-1 || raw.indexOf('나쁘')!==-1) return 'detractor'; return ''; }
    function matchCross(v, c){ if(!c) return true; try{ const val = String(c.value||'').toLowerCase(); if(!val) return true; if(c.type === 'activity'){ const act = Array.isArray(v.activities)? v.activities.join(' '): String(v.activities||''); return act.toLowerCase().indexOf(val)!==-1; } if(c.type === 'subject'){ const subs = Array.isArray(v.subject)? v.subject : (Array.isArray(v.subjects)? v.subjects : (v.subject? [v.subject] : (v.subjects? [v.subjects] : []))); return subs.some(s=> String(s||'').toLowerCase().indexOf(val)!==-1); } if(c.type === 'region'){ return String(v.region||'').toLowerCase().indexOf(val)!==-1; } if(c.type === 'staff'){ const s = String(v.staff||'').toLowerCase(); const sl = String(v.staffLabel||'').toLowerCase(); return s === val || sl === val || s.indexOf(val)!==-1 || sl.indexOf(val)!==-1; } if(c.type === 'date'){ return String(v._date||v.visitDate||'').indexOf(val)!==-1; } if(c.type === 'hour'){ const vs = String(v.visitStart||v.startTime||v.time||''); const h = (vs && vs.split && vs.split(':')[0])? String(vs.split(':')[0]).padStart(2,'0') : vs; return String(h||'').toLowerCase().indexOf(val)!==-1; } if(c.type === 'establishment'){ const e = String(v.establishment||v.establish||v['설립구분']||'').toLowerCase(); return e.indexOf(val)!==-1; } if(c.type === 'grade'){ const g1 = String(v.grade1||''); const g2 = String(v.grade2||''); const g3 = String(v.grade3||''); return String(g1).toLowerCase().indexOf(val)!==-1 || String(g2).toLowerCase().indexOf(val)!==-1 || String(g3).toLowerCase().indexOf(val)!==-1; } return true; }catch(e){ return true; } }
    let visits = (visitsRaw||[]).filter(v=>{
      if(favor){ const f = visitFavor(v); if(!f || f !== favor) return false; }
      if(cross && !matchCross(v, cross)) return false;
      // apply school filter (partial match) if provided
      if(school){ try{ const sv = String(v.school||v.schoolName||'').toLowerCase(); if(!sv || sv.indexOf(String(school||'').toLowerCase()) === -1) return false; }catch(e){} }
      // apply teacher filter (partial match) if provided
      if(teacher){ try{ const tv = String(v.teacher||v.teacherName||v.staffTeacher||'').toLowerCase(); if(!tv || tv.indexOf(String(teacher||'').toLowerCase()) === -1) return false; }catch(e){} }
      return true;
    });
        await renderKPIs(visits, { staff, start, end, region, subject, establishment, schoolLevel, minStudents, maxStudents, minActivities, maxActivities, minMaterials, maxMaterials });
        // Prefer server-side aggregates based on `visit_entries` only. Query server first and use result when available.
        let serverAgg = null;
        try{
          // pass full set of active filters to server aggregate so server can honor them if supported
          serverAgg = await fetchServerAggregate(Object.assign({ source: 'visit_entries' }, { staff, start, end, region, subject, establishment, schoolLevel, school, minStudents, maxStudents, minActivities, maxActivities, minMaterials, maxMaterials }));
        }catch(e){ serverAgg = null; }
        // Preserve an unfiltered/full aggregate for use by charts that must show the overall column
        try{
          if (serverAgg && serverAgg.activities){
            window._fullAgg = serverAgg;
          } else {
            // derive full aggregate from raw visits (before applying client-side cross/favor filters)
            try{ window._fullAgg = aggregate(visitsRaw || []); }catch(e){ window._fullAgg = null; }
          }
        }catch(e){ window._fullAgg = null; }
        try{
          if (serverAgg && serverAgg.activities){
              // server aggregate doesn't know about client-side cross-filtering, so re-aggregate locally if cross-filter or favor is active
              if(cross || favor){ const agg = aggregate(visits); renderCharts(agg); } else { renderCharts(serverAgg); }
            } else {
              // fallback: derive from visits we already fetched
              const agg = aggregate(visits);
              renderCharts(agg);
            }
        }catch(e){
          console.warn('renderCharts failed', e);
          // attempt to continue: render NPS and populate recent tables from visits
          try{ if (typeof renderNpsDashboard === 'function') renderNpsDashboard(visits); }catch(e2){ console.warn('renderNpsDashboard after renderCharts failure failed', e2); }
          try{ renderRecentTable(visits); }catch(e3){ console.warn('renderRecentTable after renderCharts failure failed', e3); }
        }
      // prepare & paginate recent issues (issue-only) and other text fields (requests/delivery/materials)
      try{
        const sharedOpts = { staff:start? staff : staff, start, end, region, subject, establishment, schoolLevel, minStudents, maxStudents, minActivities, maxActivities, minMaterials, maxMaterials };
        const issues = await fetchIssueVisits(sharedOpts); setIssuesList(issues);
        const requests = await fetchRequestVisits(sharedOpts); setRequestsList(requests);
        const delivery = await fetchDeliveryVisits(sharedOpts); setDeliveryList(delivery);
        const materials = await fetchMaterialsVisits(sharedOpts); setMaterialsList(materials);
        // build meeting-keyword list from the already-fetched visits (client-side check)
        try{ setMeetingKeywordsList(visits); }catch(e){ console.warn('setMeetingKeywordsList call failed', e); }
      }catch(e){ console.warn('issue/aux lists failed', e); renderRecentTable(visits); }
        try{ if (typeof renderNpsDashboard === 'function') renderNpsDashboard(visits); }catch(e){ console.warn('renderNpsDashboard failed', e); }
      }

      // wire filters
      document.getElementById('exportBtn').addEventListener('click', function(){ exportCsv(); });
      ['filterUser','filterRegion','filterSchool','filterTeacher','filterStart','filterEnd','filterSubject','filterEstablish','filterSchoolLevel','filterFavor'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('change', refresh); });
        // existing clearFilters button (lower on page) and new resetFiltersBtn both clear active filters
        function clearAllFilters(){ ['filterUser','filterRegion','filterSchool','filterStart','filterEnd','filterSubject','filterEstablish','filterSchoolLevel'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; }); document.getElementById('activeFilters').textContent = '없음'; refresh(); }

        // Cross-filter helpers: clicking a chart sets `window._crossFilter` and triggers refresh
        function setCrossFilter(type, value){ try{ window._crossFilter = { type: String(type||'').toLowerCase(), value: String(value||'') }; const af = document.getElementById('activeFilters'); if(af) af.textContent = `${type}=${value}`; refresh(); }catch(e){ console.warn('setCrossFilter failed', e); } }
        function clearCrossFilter(){ try{ window._crossFilter = null; const af = document.getElementById('activeFilters'); if(af) af.textContent = '없음'; refresh(); }catch(e){ console.warn('clearCrossFilter failed', e); } }
        const clearBtn = document.getElementById('clearFilters'); if(clearBtn) clearBtn.addEventListener('click', function(){ clearAllFilters(); clearCrossFilter(); });
        const resetBtn = document.getElementById('resetFiltersBtn'); if(resetBtn) resetBtn.addEventListener('click', function(){ clearAllFilters(); clearCrossFilter(); });

  // CSV columns panel wiring
  const toggle = document.getElementById('toggleCsvCols');
  const panel = document.getElementById('csvColsPanel');
  const applyBtn = document.getElementById('csvColsApply');
  const closeBtn = document.getElementById('csvColsClose');
  toggle.addEventListener('click', function(e){ e.preventDefault(); panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; const rect = toggle.getBoundingClientRect(); panel.style.left = (rect.left) + 'px'; panel.style.top = (rect.bottom + 6) + 'px'; });
  closeBtn.addEventListener('click', function(e){ e.preventDefault(); panel.style.display='none'; });
  applyBtn.addEventListener('click', function(e){ e.preventDefault(); panel.style.display='none'; refresh(); });

  // delegated click handler for detail buttons in the recent table -> open in-page modal
  (function(){
    const salesTableEl = document.getElementById('salesTable');
    function showModal(obj){
      const m = document.getElementById('detailModal'); if(!m) return;
      m.style.display = 'flex';
      // map numeric/short school level codes to readable labels
      let displayLevel = obj.schoolLevel || '';
      try{
        const s = String(displayLevel||'').trim();
        if(/^[0-9]+$/.test(s)){
          if(s === '4') displayLevel = '고등';
          else if(s === '3') displayLevel = '중등';
          else if(s === '1') displayLevel = '초등';
        } else if(s.indexOf('고') !== -1 || s.indexOf('중') !== -1 || s.indexOf('초') !== -1) {
          displayLevel = s;
        }
      }catch(e){ }

      q('#modalTitle').textContent = obj.school || obj.staff || '상세 정보';
      q('#modalBody').innerHTML = `
        <div class="modal-row"><div class="label">일시</div><div>${escapeHtml(obj.date||'')}</div></div>
        <div class="modal-row"><div class="label">담당자</div><div>${escapeHtml(obj.staff||'')}</div></div>
        <div class="modal-row"><div class="label">지역</div><div>${escapeHtml(obj.region||'')}</div></div>
  <div class="modal-row"><div class="label">학교</div><div>${escapeHtml(obj.school||'')}</div></div>
  <div class="modal-row"><div class="label">서버 ID</div><div>${escapeHtml(obj.id||'')}</div></div>
  <div class="modal-row"><div class="label">설립</div><div>${escapeHtml(obj.establishment||'')}</div></div>
  <div class="modal-row"><div class="label">급</div><div>${escapeHtml(displayLevel||'')}</div></div>
  <div class="modal-row"><div class="label">총학생수</div><div>${escapeHtml(obj.totalStudents||'')}</div></div>
  <div class="modal-row"><div class="label">특성</div><div>${escapeHtml(obj.features||'')}</div></div>
  <div class="modal-row"><div class="label">방문 시작</div><div>${escapeHtml(obj.visitStart||'')}</div></div>
  <div class="modal-row"><div class="label">시간 소요</div><div>${escapeHtml(obj.duration||'')}</div></div>
  <div class="modal-row"><div class="label">방문 종료</div><div>${escapeHtml(obj.visitEnd||'')}</div></div>
  <div class="modal-row"><div class="label">과목</div><div>${escapeHtml(obj.subjects||'')}</div></div>
  <div class="modal-row"><div class="label">선생님</div><div>${escapeHtml(obj.teacher||'')}</div></div>
  <div class="modal-row"><div class="label">1학년</div><div>${escapeHtml(obj.grade1||'')}</div></div>
  <div class="modal-row"><div class="label">2학년</div><div>${escapeHtml(obj.grade2||'')}</div></div>
  <div class="modal-row"><div class="label">3학년</div><div>${escapeHtml(obj.grade3||'')}</div></div>
        <hr style="border:none;border-top:1px solid rgba(255,255,255,0.06);margin:8px 0">
        <div class="modal-row"><div class="label">영업활동</div><div style="white-space:pre-wrap">${escapeHtml(obj.activities||'')}</div></div>
        <div class="modal-row"><div class="label">전달자료</div><div style="white-space:pre-wrap">${escapeHtml(obj.materials||'')}</div></div>
        <div class="modal-row"><div class="label">출판사</div><div>${escapeHtml(obj.publisher||'')}</div></div>
        <div class="modal-row"><div class="label">대화내용</div><div style="white-space:pre-wrap">${escapeHtml(obj.conversation || obj.meeting || obj.meetingContent || obj.note || '')}</div></div>
        <div class="modal-row"><div class="label">고객요청사항</div><div style="white-space:pre-wrap">${escapeHtml(obj.requests||'')}</div></div>
        <div class="modal-row"><div class="label">특이사항</div><div style="white-space:pre-wrap">${escapeHtml(obj.special||obj.note||'')}</div></div>
        <div class="modal-row"><div class="label">납품사항</div><div style="white-space:pre-wrap">${escapeHtml(obj.delivery||'')}</div></div>
        <div class="modal-row"><div class="label">후속 조치</div><div style="white-space:pre-wrap">${escapeHtml(obj.followUp||'')}</div></div>
        <div class="modal-row"><div class="label">연락처</div><div>${escapeHtml(obj.phone||'')} ${escapeHtml(obj.email||'')}</div></div>
      `;
    }
    function hideModal(){ const m=document.getElementById('detailModal'); if(m) m.style.display='none'; }

    document.addEventListener('click', function(e){
      const btn = e.target && (e.target.matches && e.target.matches('.detail-btn') ? e.target : (e.target.closest && e.target.closest('.detail-btn')));
      if (btn && btn.dataset){
        const obj = {
          id: btn.dataset.id,
          staff: decodeURIComponent(btn.dataset.staff||''),
          school: decodeURIComponent(btn.dataset.school||''),
          region: decodeURIComponent(btn.dataset.region||''),
          subjects: decodeURIComponent(btn.dataset.subjects||''),
          activities: decodeURIComponent(btn.dataset.activities||''),
          meeting: decodeURIComponent(btn.dataset.meeting||''),
          meetingContent: decodeURIComponent(btn.dataset.meetingcontent||''),
          materials: decodeURIComponent(btn.dataset.materials||''),
          publisher: decodeURIComponent(btn.dataset.publisher||''),
          conversation: decodeURIComponent(btn.dataset.conversation||''),
          phone: decodeURIComponent(btn.dataset.phone||''),
          email: decodeURIComponent(btn.dataset.email||''),
          visitStart: decodeURIComponent(btn.dataset.visitstart||''),
          visitEnd: decodeURIComponent(btn.dataset.visitend||''),
          note: decodeURIComponent(btn.dataset.note||''),
          followUp: decodeURIComponent(btn.dataset.followup||''),
          delivery: decodeURIComponent(btn.dataset.delivery||''),
          requests: decodeURIComponent(btn.dataset.requests||''),
          special: decodeURIComponent(btn.dataset.special||''),
          teacher: decodeURIComponent(btn.dataset.teacher||''),
          establishment: decodeURIComponent(btn.dataset.establishment||''),
          schoolLevel: decodeURIComponent(btn.dataset.schoollevel||''),
          totalStudents: decodeURIComponent(btn.dataset.totalstudents||''),
          features: decodeURIComponent(btn.dataset.features||''),
          grade1: decodeURIComponent(btn.dataset.grade1||''),
          grade2: decodeURIComponent(btn.dataset.grade2||''),
          grade3: decodeURIComponent(btn.dataset.grade3||''),
          duration: decodeURIComponent(btn.dataset.duration||''),
          date: decodeURIComponent(btn.dataset.date||'')
        };

        // If CSV metadata exists for this school, use it to fill any missing fields
        try{
          const schoolKey = (obj.school||'').trim().toLowerCase();
          if(schoolKey && salesStaffMap && salesStaffMap.has(schoolKey)){
            const meta = salesStaffMap.get(schoolKey) || {};
            if((!obj.totalStudents || obj.totalStudents === '') && meta.totalStudents !== undefined) obj.totalStudents = String(meta.totalStudents || '');
            if((!obj.features || obj.features === '') && meta.features) obj.features = meta.features;
            if((!obj.grade1 || obj.grade1 === '') && meta.grade1) obj.grade1 = meta.grade1;
            if((!obj.grade2 || obj.grade2 === '') && meta.grade2) obj.grade2 = meta.grade2;
            if((!obj.grade3 || obj.grade3 === '') && meta.grade3) obj.grade3 = meta.grade3;
            if((!obj.establishment || obj.establishment==='') && meta.establishment) obj.establishment = meta.establishment;
            if((!obj.schoolLevel || obj.schoolLevel==='') && meta.schoolLevel) obj.schoolLevel = meta.schoolLevel;
          }
        }catch(e){ console.warn('detail modal csv enrichment failed', e); }

        showModal(obj);
      }
    });

    // modal close wiring
    document.addEventListener('click', function(e){ if(e.target && e.target.matches && e.target.matches('.modal-close')){ hideModal(); } });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape'){ hideModal(); } });
    // click outside modal content closes
    document.addEventListener('click', function(e){ const m = document.getElementById('detailModal'); if(!m) return; if(e.target===m) hideModal(); });
  })();

  // --- NPS gauge for dashboard ---
  function computeNpsFromVisits(visits){
    let promoters=0, passives=0, detractors=0;
    (visits||[]).forEach(v=>{
      const raw = String(v.favor || v.favorValue || v.favor_raw || v.reaction || v.반응 || v['반응'] || '').trim();
      if(!raw) return;
      if(raw === '반응좋음' || raw.toLowerCase().indexOf('좋')!==-1) promoters++;
      else if(raw === '반응보통' || raw.toLowerCase().indexOf('보통')!==-1) passives++;
      else if(raw === '반응나쁨' || raw.toLowerCase().indexOf('나쁨')!==-1 || raw.toLowerCase().indexOf('나쁨')!==-1) detractors++;
    });
    const total = promoters + passives + detractors;
    const pPct = total? Math.round(promoters/total*100):0;
    const paPct = total? Math.round(passives/total*100):0;
    const dPct = total? Math.round(detractors/total*100):0;
    const nps = Math.round(pPct - dPct);
    return { promoters, passives, detractors, total, pPct, paPct, dPct, nps };
  }

  function ensureDashboardGaugeSize(){
    const cnv = document.getElementById('dashboardGauge'); if(!cnv) return;
    // prefer filling the available horizontal space so the semi-donut is wider
    const parentW = (cnv.parentElement||document.body).clientWidth || document.body.clientWidth;
    const w = Math.min(1100, Math.round(parentW * 0.98));
    // increase height proportion to remove excessive bottom whitespace
    // prefer a taller minimum so NPS stacked bars match other tall stacked charts
    const h = Math.max(560, Math.round(w * 0.6));
    const dpr = window.devicePixelRatio || 1;
    cnv.style.width = w + 'px'; cnv.style.height = h + 'px'; cnv.width = Math.round(w * dpr); cnv.height = Math.round(h * dpr);
    // reduce top spacing and center horizontally
    cnv.style.marginTop = '6px';
    cnv.style.marginBottom = '0px';
    cnv.style.display = 'block';
    cnv.style.marginLeft = 'auto';
    cnv.style.marginRight = 'auto';
  }

  // Helper: find establishments map for a staff name with tolerant matching
  function findEstMapForStaff(agg, shortName){
    try{
      if(!agg || !agg.establishmentsByStaff) return new Map();
      // exact match
      if(agg.establishmentsByStaff[shortName]) return agg.establishmentsByStaff[shortName].estTypes || new Map();
      // try substring match (prefer keys that include shortName)
      const keys = Object.keys(agg.establishmentsByStaff || {});
      for(const k of keys){ if(k && k.indexOf(shortName) !== -1) return agg.establishmentsByStaff[k].estTypes || new Map(); }
      // try case-insensitive contains
      const sLower = String(shortName||'').toLowerCase();
      for(const k of keys){ if(k && String(k).toLowerCase().indexOf(sLower) !== -1) return agg.establishmentsByStaff[k].estTypes || new Map(); }
      // lastly return empty map
      return new Map();
    }catch(e){ return new Map(); }
  }

  // Compute NPS breakdown per staff (전체, 송훈재, 임준호, 조영환)
  function computeNpsByStaff(visits){
    const labels = ['전체','송훈재','임준호','조영환'];
    const promos = [0,0,0,0], passives = [0,0,0,0], dets = [0,0,0,0];
    (visits||[]).forEach(v=>{
      const raw = String(v.favor || v.favorValue || v.favor_raw || v.reaction || v.반응 || v['반응'] || '').trim();
      if(!raw) return;
      // determine category
      let cat = 'passive';
      if(raw === '반응좋음' || raw.toLowerCase().indexOf('좋')!==-1) cat = 'promoter';
      else if(raw === '반응보통' || raw.toLowerCase().indexOf('보통')!==-1) cat = 'passive';
      else if(raw === '반응나쁨' || raw.toLowerCase().indexOf('나쁨')!==-1) cat = 'detractor';

      const staffRaw = String(v.staffLabel || v.staff || '').trim();
      // increment overall
      if(cat === 'promoter') promos[0]++; else if(cat === 'passive') passives[0]++; else dets[0]++;
      // try match preferred staff by substring
      if(staffRaw.indexOf('송훈재') !== -1){ if(cat === 'promoter') promos[1]++; else if(cat === 'passive') passives[1]++; else dets[1]++; }
      if(staffRaw.indexOf('임준호') !== -1){ if(cat === 'promoter') promos[2]++; else if(cat === 'passive') passives[2]++; else dets[2]++; }
      if(staffRaw.indexOf('조영환') !== -1){ if(cat === 'promoter') promos[3]++; else if(cat === 'passive') passives[3]++; else dets[3]++; }
    });
    return { labels, promos, passives, dets };
  }

  function drawNpsStackChart(nps){
    try{
      try{ console.log('drawNpsStackChart start', nps && nps.labels ? nps.labels.slice(0,8) : nps); }catch(e){}
      const cnv = document.getElementById('dashboardGauge'); if(!cnv) return;
      ensureDashboardGaugeSize();
      const ctx = cnv.getContext('2d');
      const labels = nps.labels || ['전체','송훈재','임준호','조영환'];

      // raw counts per dataset
      const rawPromos = Array.isArray(nps.promos)? nps.promos.slice() : [];
      const rawPassives = Array.isArray(nps.passives)? nps.passives.slice() : [];
      const rawDets = Array.isArray(nps.dets)? nps.dets.slice() : [];
      const len = Math.max(labels.length, rawPromos.length, rawPassives.length, rawDets.length);
      // pad arrays
      while(rawPromos.length < len) rawPromos.push(0); while(rawPassives.length < len) rawPassives.push(0); while(rawDets.length < len) rawDets.push(0);

      // compute per-column totals (raw) and percent arrays for stacked percent chart
      const totals = Array(len).fill(0);
      for(let i=0;i<len;i++) totals[i] = (Number(rawPromos[i]||0) + Number(rawPassives[i]||0) + Number(rawDets[i]||0)) || 0;
      const pctPromos = rawPromos.map((v,i)=> totals[i]? Math.round((Number(v||0)/totals[i])*100) : 0);
      const pctPassives = rawPassives.map((v,i)=> totals[i]? Math.round((Number(v||0)/totals[i])*100) : 0);
      const pctDets = rawDets.map((v,i)=> totals[i]? Math.round((Number(v||0)/totals[i])*100) : 0);

      const datasets = [
        { label: '반응좋음', data: pctPromos, _raw: rawPromos, backgroundColor: '#2ecc71', barThickness: 36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 },
        { label: '반응보통', data: pctPassives, _raw: rawPassives, backgroundColor: '#f1c40f', barThickness: 36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 },
        { label: '반응나쁨', data: pctDets, _raw: rawDets, backgroundColor: '#e74c3c', barThickness: 36, maxBarThickness:80, categoryPercentage:0.6, barPercentage:0.9 }
      ];

      if(charts.npsStack){ charts.npsStack.data.labels = labels; charts.npsStack.data.datasets = datasets; charts.npsStack.update(); }
      else {
        const npsDataLabelsPlugin = {
          id: 'npsDataLabels',
          afterDatasetsDraw(chart){
            const {ctx} = chart;
            // always use black labels for readability
            function labelColor(){ return '#000'; }
            ctx.save();
            const dsCount = chart.data.datasets.length;
            const itemCount = chart.data.labels.length;
            // compute raw totals per item using _raw arrays when available
            const rawTotals = Array(itemCount).fill(0);
            for(let di=0; di<dsCount; di++){
              const ds = chart.data.datasets[di];
              const raw = ds._raw || ds.data || [];
              for(let i=0;i<itemCount;i++) rawTotals[i] += Number((raw[i]||0));
            }

            chart.data.datasets.forEach((ds, dsIndex)=>{
              const meta = chart.getDatasetMeta(dsIndex);
              meta.data.forEach((bar, i)=>{
                const rawVal = Number((ds._raw && ds._raw[i]) || 0); if(!rawVal && rawVal!==0) return;
                const totalRaw = rawTotals[i] || 1;
                const pct = Math.round((rawVal/totalRaw)*100);
                const x = bar.x; const y = bar.y; const base = bar.base !== undefined ? bar.base : (bar.y + (bar.height||0));
                const h = Math.abs(base - y);
                const centerY = Math.min(y, base) + h/2;
                const textColor = labelColor();
                ctx.fillStyle = textColor; ctx.font = '700 15px / 1.1 "Noto Sans", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const labelText = ds.label || '';
                const countText = `${rawVal}건 (${pct}%)`;
                if(h > 68){ ctx.fillText(labelText, x, centerY - 14); ctx.fillText(countText, x, centerY + 14); }
                else if(h > 38){ ctx.fillText(countText, x, centerY); }
                else { ctx.fillStyle = '#000'; ctx.fillText(countText, x, Math.min(y, base) - 16); }
              });
            });
            ctx.restore();
          }
        };

        charts.npsStack = new Chart(ctx, {
          type: 'bar',
          data: { labels, datasets },
          plugins: [npsDataLabelsPlugin],
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: function(ctx){
                    const idx = ctx.dataIndex;
                    const raw = (ctx.dataset && ctx.dataset._raw && ctx.dataset._raw[idx]) ? ctx.dataset._raw[idx] : (ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed);
                    const totalRaw = ctx.chart.data.datasets.reduce((s,ds)=> s + Number((ds._raw && ds._raw[idx])? ds._raw[idx] : (ds.data[idx]||0)),0) || 1;
                    const pct = Math.round((Number(raw)/totalRaw)*100);
                    return `${ctx.dataset.label}: ${raw}건 (${pct}%)`;
                  }
                }
              }
            },
            layout: { padding: { top: 30, bottom: 30 } },
            scales: {
              x: { stacked: true, ticks: { maxRotation:0, minRotation:0 } },
              y: {
                stacked: true,
                title: { display:true, text:'비율' },
                beginAtZero: true,
                suggestedMin: 0,
                suggestedMax: 100,
                min: 0,
                max: 100,
                ticks: {
                  stepSize: 10,
                  autoSkip: false,
                  maxTicksLimit: 11,
                  callback: v => `${v}%`
                }
              }
            }
            ,
            onClick: function(evt){
              try{
                const pts = charts.npsStack.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, false);
                if(!pts || !pts.length) return;
                const idx = pts[0].index; const label = charts.npsStack.data.labels[idx];
                if(String(label||'').trim() === '전체') return; // 전체 column should not set staff filter
                setCrossFilter('staff', label);
              }catch(e){ console.warn('npsStack onClick failed', e); }
            }
          }
        });
      }
    }catch(e){ console.warn('drawNpsStackChart failed', e); }
  }

  function renderNpsBreakdownDashboard(b){
    const bd = document.getElementById('dashboardBreakdown'); if(!bd) return;
    const rows = [];
    rows.push(`<div class="list-item" style="padding:10px;border-radius:10px;background:#fff;border:1px solid rgba(10,60,100,0.06)"><div style="display:flex;align-items:center;gap:12px"><div class="swatch" style="width:56px;height:56px;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:#2ecc71"><div style="font-weight:800">${b.pPct}%</div><div style="font-weight:700;font-size:12px;margin-top:4px">${b.promoters}건</div></div><div style="flex:1"><div style="font-weight:800;color:#12325a">Promoters</div><div style="color:#607489">반응좋음</div></div></div></div>`);
    rows.push(`<div class="list-item" style="padding:10px;border-radius:10px;background:#fff;border:1px solid rgba(10,60,100,0.06)"><div style="display:flex;align-items:center;gap:12px"><div class="swatch" style="width:56px;height:56px;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:#f1c40f"><div style="font-weight:800">${b.paPct}%</div><div style="font-weight:700;font-size:12px;margin-top:4px">${b.passives}건</div></div><div style="flex:1"><div style="font-weight:800;color:#12325a">Passives</div><div style="color:#607489">반응보통</div></div></div></div>`);
    rows.push(`<div class="list-item" style="padding:10px;border-radius:10px;background:#fff;border:1px solid rgba(10,60,100,0.06)"><div style="display:flex;align-items:center;gap:12px"><div class="swatch" style="width:56px;height:56px;border-radius:28px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;background:#e74c3c"><div style="font-weight:800">${b.dPct}%</div><div style="font-weight:700;font-size:12px;margin-top:4px">${b.detractors}건</div></div><div style="flex:1"><div style="font-weight:800;color:#12325a">Detractors</div><div style="color:#607489">반응나쁨</div></div></div></div>`);
    bd.innerHTML = rows.join('');
  }

  function renderNpsDashboard(visits){
    try{
      try{ console.log('renderNpsDashboard start', Array.isArray(visits)? visits.length: typeof visits); }catch(e){}
      const b = computeNpsFromVisits(visits || []);
      // render stacked-bar NPS per staff and the breakdown cards
      try{ const staffNps = computeNpsByStaff(visits || []); drawNpsStackChart(staffNps); }catch(e){ console.warn('staff NPS render failed', e); }
      renderNpsBreakdownDashboard(b);
    }catch(e){ console.warn('renderNpsDashboard inner failed', e); }
  }

      // CSV export implementation
      function exportCsv(){
        (async function(){
          const staff = q('#filterUser') && q('#filterUser').value || '';
          const region = q('#filterRegion') && q('#filterRegion').value || '';
          const school = q('#filterSchool') && q('#filterSchool').value || '';
          const subject = q('#filterSubject') && q('#filterSubject').value || '';
          const start = q('#filterStart') && q('#filterStart').value || '';
          const end = q('#filterEnd') && q('#filterEnd').value || '';
          const minActivities = q('#filterMinActivities') && q('#filterMinActivities').value || 0;
          const maxActivities = q('#filterMaxActivities') && q('#filterMaxActivities').value || 0;
          const minMaterials = q('#filterMinMaterials') && q('#filterMinMaterials').value || 0;
          const maxMaterials = q('#filterMaxMaterials') && q('#filterMaxMaterials').value || 0;
          const rows = await fetchVisits({staff, start, end, region, subject, minActivities, maxActivities, minMaterials, maxMaterials});
          if (!rows || !rows.length){ alert('내보낼 데이터가 없습니다'); return; }
          // determine selected fields from CSV columns panel
          const checked = Array.from(document.querySelectorAll('input[name="csvcol"]:checked')).map(i=> i.value);
          const fields = checked.length ? checked : ['_date','staff','staffLabel','region','school','subjects','activities','teacher','visitStart','visitEnd','duration','establishment','schoolLevel','totalStudents','features','grade1','grade2','grade3','phone','email','conversation','followUp'];
          const csv = [fields.join(',')].concat(rows.map(r=> fields.map(f=> '"' + (escapeCsvField(r[f])||'') + '"').join(',')).join('\n'));
          const blob = new Blob([csv.join('\n')], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `visit_entries_export_${(new Date()).toISOString().substring(0,10)}.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        })();
      }
      function escapeCsvField(v){ if (v===undefined || v===null) return ''; return String(v).replace(/"/g,'""'); }

      // PIN gate: only run refresh if unlocked; otherwise show PIN overlay
      (function(){
        const PIN = '2274';
        const overlay = document.getElementById('pinOverlay');
        const input = document.getElementById('pinInput');
        const submit = document.getElementById('pinSubmit');
        const clear = document.getElementById('pinClear');
        const err = document.getElementById('pinError');

        function showPin(){ if(overlay) overlay.style.display = 'flex'; if(input) input.focus(); }
        function hidePin(){ if(overlay) overlay.style.display = 'none'; if(err) err.style.display='none'; }
        function unlocked(){ return sessionStorage.getItem('dashboard:unlocked') === '1'; }
        function setUnlocked(){ sessionStorage.setItem('dashboard:unlocked','1'); }

        function checkAndUnlock(){ const val = input && input.value ? input.value.trim() : ''; if(val === PIN){ setUnlocked(); hidePin(); try{ refresh(); }catch(e){ console.warn(e); } } else { if(err) err.style.display='block'; if(input){ input.value=''; input.focus(); } } }

        if (submit) submit.addEventListener('click', function(e){ e.preventDefault(); checkAndUnlock(); });
        if (clear) clear.addEventListener('click', function(e){ e.preventDefault(); if(input) input.value=''; if(err) err.style.display='none'; input && input.focus(); });
        if (input) input.addEventListener('keydown', function(e){ if(e.key === 'Enter'){ e.preventDefault(); checkAndUnlock(); } });

        // Require PIN unless session already unlocked. If unlocked, refresh; otherwise show PIN overlay.
        try{
          if (unlocked()){
            hidePin();
            try{ refresh(); }catch(e){ console.warn('refresh failed after unlocked check', e); }
          } else {
            showPin();
          }
        }catch(e){ console.warn('pin check failed', e); }
      })();

    })();
    // End dashboard I/O
    
        <!-- detail modal (in-page) -->
        (function(){
          const modalHtml = `
            <div id="detailModal" class="modal" style="display:none">
              <div class="modal-content">
                <div class="modal-header"><h3 id="modalTitle">상세정보</h3><button class="modal-close" title="닫기">✕</button></div>
                <div class="modal-body" id="modalBody">Loading...</div>
              </div>
            </div>
          `;
          try{ document.body.insertAdjacentHTML('beforeend', modalHtml); }catch(e){ /* ignore */ }
        })();
  