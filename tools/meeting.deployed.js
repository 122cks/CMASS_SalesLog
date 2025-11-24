(function(){
  const qs = (id) => document.getElementById(id);
  const staffEl = qs('staff');
  const dateEl = qs('visitDate');
  const regionEl = qs('regionSelect');
  const schoolEl = qs('schoolSelect');
  const startHourEl = qs('startHour');
  const startMinEl = qs('startMinute');
  const durEl = qs('duration');
  const endEl = qs('endTime');
  const subjectContainer = qs('subjects');
  const activitiesContainer = qs('activities');
  const schoolDisplay = qs('schoolDisplay');
  const followUpEl = qs('followUp');
  const btnBack = qs('btnBack');
  const btnCopy = qs('btnCopy');
  const btnSaveServer = qs('btnSaveServer');
  const btnSubmit = qs('btnSubmit');
  const topline = qs('topline');
  const savedDraftEl = qs('savedDraft');

  let regions = [];
  let _isRestoring = false; // when true, don't trigger autosave while populating

  function parseRegionsFromRows(rows){
    const header = rows[0] || [];
  const idxRegion = header.findIndex(h => /region/i.test((h||'').trim()));
  const idxStaff = header.findIndex(h => /staff/i.test((h||'').trim()));
    // identify school-name and school-code columns robustly
    let idxSchoolName = -1;
    let idxSchoolCode = -1;
    for (let i = 0; i < header.length; i++){
      const h = (header[i] || '').trim();
      const lower = h.toLowerCase();
      // detect explicit code columns first
  if (/(school_code|schoolcode|\bcode\b)/i.test(h)) {
        if (idxSchoolCode === -1) idxSchoolCode = i;
        continue;
      }
      // explicit name-like headers
  if (/(school_name|schoolname|school name|^school$)/i.test(h)) {   
        idxSchoolName = i; break;
      }
    }
    // if explicit name header not found, pick any header containing '?숆탳' or 'school' but not '肄붾뱶'/'code'
    if (idxSchoolName === -1) {
      for (let i = 0; i < header.length; i++){
        const h = (header[i] || '').trim();
  if (/(school)/i.test(h) && !/(code)/i.test(h)) { idxSchoolName = i; break; }
      }
    }
    // final fallback: if we only found a code column, use it as code and don't treat it as name
    const idxSchool = idxSchoolName >= 0 ? idxSchoolName : idxSchoolCode;
    if (idxRegion < 0 || idxSchool < 0) return [];
    const regionMap = new Map();
    for (let i=1;i<rows.length;i++){
      const r = rows[i]; if(!r) continue;
      const rn = (r[idxRegion]||'').trim();
      const sn = idxSchoolName>=0 ? (r[idxSchoolName]||'').trim() : '';
      const scode = idxSchoolCode>=0 ? (r[idxSchoolCode]||'').trim() : '';
      const st = idxStaff>=0? (r[idxStaff]||'').trim() : '';
      if(!rn||!(sn||scode)) continue;
      if(!regionMap.has(rn)) regionMap.set(rn,{name:rn,schools:[],staffSet:new Set()});     
      const reg = regionMap.get(rn);
      const displayName = sn || scode;
      reg.schools.push({ name: displayName, code: scode || '', staff: st? [st] : [] });     
      if(st) reg.staffSet.add(st);
    }
    return Array.from(regionMap.values()).map(reg => ({
      name: reg.name,
      schools: reg.schools.map(s => ({ name: s.name, code: s.code }))
    })).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  }

  async function loadRegions(){
    if (typeof fetchCsvRows !== 'function') {
      console.warn('fetchCsvRows not available. Ensure /csv-helpers.js is loaded.');        
      return [];
    }
    const rows = await fetchCsvRows().catch(()=>[]);
    regions = parseRegionsFromRows(rows || []);
    populateRegionSelect();
    return regions;
  }

  function populateRegionSelect(){
    if (!regionEl) return;
    regionEl.innerHTML = '<option value="">지역 선택...</option>';
    regions.forEach(r => {
      const opt = document.createElement('option'); opt.value = r.name; opt.textContent = r.name; regionEl.appendChild(opt);
    });
  }

  function populateSchoolSelect(regionName){
    if (!schoolEl) return;
    schoolEl.innerHTML = '<option value="">학교 선택...</option>';
    const reg = regions.find(r=>r.name===regionName);
    if(!reg) return;
    reg.schools.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.code && s.code.length ? s.code : s.name;
      opt.textContent = s.name; 
      if(s.code) opt.dataset.code = s.code;
      schoolEl.appendChild(opt);
    });
  }

  function buildKey(){
    const staff = (staffEl && staffEl.value||'').trim();
    const date = dateEl ? dateEl.value : '';
    const region = regionEl ? regionEl.value : '';
    const school = schoolEl ? schoolEl.value : '';
    return `meeting:draft:${staff}|${date}|${region}|${school}`;
  }

  function gatherForm(){
    const subjects = subjectContainer ? Array.from(subjectContainer.querySelectorAll('.subject-btn.active')).map(b=>b.textContent.trim()) : [];
    const activities = activitiesContainer ? Array.from(activitiesContainer.querySelectorAll('.subject-btn.active')).map(b=>b.textContent.trim()) : [];
    const params = new URLSearchParams(window.location.search || '');
    const server_id = params.get('server_id') || params.get('serverId') || '';
    const schoolText = (schoolEl && schoolEl.selectedOptions && schoolEl.selectedOptions[0]) ? schoolEl.selectedOptions[0].textContent : (schoolEl ? schoolEl.value : '');
    return {
      staff: staffEl ? staffEl.value : '',
      date: dateEl ? dateEl.value : '',
      region: regionEl ? regionEl.value : '',
      schoolCode: schoolEl ? schoolEl.value : '',
      school: schoolText,
      server_id,
      startTime: (function(){ try{ const h = (startHourEl && startHourEl.value) ? String(startHourEl.value).padStart(2,'0') : '08'; const m = (startMinEl && startMinEl.value) ? String(startMinEl.value).padStart(2,'0') : '00'; return `${h}:${m}`;}catch(e){return '';}})(),
      durationMin: Number(durEl && durEl.value)||0,
      endTime: endEl ? endEl.value : '',
      subjects, activities, teacher: qs('teacherName') ? qs('teacherName').value : '', publisher: qs('publisher') ? qs('publisher').value : '',
      phone: qs('phone') ? qs('phone').value : '', email: qs('email') ? qs('email').value : '',
      requests: qs('requests') ? qs('requests').value : '', notes: qs('notes') ? qs('notes').value : '', deliveries: qs('deliveries') ? qs('deliveries').value : '',
      contact: qs('phone') ? qs('phone').value : '',
      ask: qs('requests') ? qs('requests').value : '',
      conversation: qs('notes') ? qs('notes').value : '',
      delivery: qs('deliveries') ? qs('deliveries').value : '',
      followUp: followUpEl ? followUpEl.value : '' ,
      visitDate: dateEl ? dateEl.value : '',
      visitStart: (function(){ try{ const h = (startHourEl && startHourEl.value) ? String(startHourEl.value).padStart(2,'0') : '08'; const m = (startMinEl && startMinEl.value) ? String(startMinEl.value).padStart(2,'0') : '00'; return `${h}:${m}`;}catch(e){return '';}})(),
      duration: Number(durEl && durEl.value)||0,
      visitEnd: endEl ? endEl.value : ''
    };
  }

  function saveDraft(){
    const key = buildKey();
    try{ localStorage.setItem(key, JSON.stringify(gatherForm())); }
    catch(e){ console.warn('failed to save draft', e); }
    try{ renderSavedDraft(gatherForm()); }catch(e){}
  }

  // --- server autosave (debounced) ---
  let _serverSaveTimer = null;
  const SERVER_SAVE_DELAY = 1500; // ms

  function scheduleServerSave(){
    try{ if(_serverSaveTimer) clearTimeout(_serverSaveTimer); _serverSaveTimer = setTimeout(()=> { saveDraftToServer(); _serverSaveTimer = null; }, SERVER_SAVE_DELAY); }catch(e){}       }

  async function saveDraftToServer(){
    const data = gatherForm();
    if(!data.staff || !data.date) return;
    try{
      await fetch('/save-draft', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      try{ renderSavedDraft(data); }catch(e){}
    }catch(e){ console.warn('saveDraftToServer failed', e); }
  }

  async function fetchDraftFromServer(){
    try{
      const params = new URLSearchParams();
      params.set('staff', (staffEl && staffEl.value||'').trim());
      params.set('date', (dateEl && dateEl.value||'').trim());
      params.set('region', (regionEl && regionEl.value||'').trim());
      params.set('school', (schoolEl && schoolEl.value||'').trim());
      const res = await fetch('/get-draft?'+params.toString());
      if(!res.ok) return null;
      const j = await res.json().catch(()=>null); if(!j || !j.ok || !j.draft) return null;  
      try{ renderSavedDraft(j.draft); }catch(e){}
      return j.draft;
    }catch(e){ console.warn('fetchDraftFromServer failed', e); return null; }
  }

  function renderSavedDraft(d){
    if(!savedDraftEl) return;
    try{
      if(!d) { savedDraftEl.textContent = ''; return; }
      const parts = [];
      if(d.staff) parts.push(`담당자: ${d.staff}`);
      if(d.date) parts.push(`방문일: ${d.date}`);
      if(d.region) parts.push(`지역: ${d.region}`);
      if(d.school) parts.push(`학교: ${d.school}`);
      if(d.visitStart || d.startTime) parts.push(`시작: ${d.visitStart || d.startTime}`);  
      if(d.duration || d.durationMin) parts.push(`총분: ${d.duration || d.durationMin}`);
      if(d.subjects && Array.isArray(d.subjects) && d.subjects.length) parts.push(`과목: ${d.subjects.join(', ')}`);
      if(d.activities && Array.isArray(d.activities) && d.activities.length) parts.push(`활동: ${d.activities.join(', ')}`);
      if(d.teacher) parts.push(`선생님: ${d.teacher}`);
      if(d.requests) parts.push(`요청: ${d.requests}`);
      if(d.notes) parts.push(`특이사항: ${d.notes}`);
      if(d.delivery) parts.push(`납품: ${d.delivery}`);
      if(d.followUp) parts.push(`후속: ${d.followUp}`);
      savedDraftEl.textContent = parts.join('\n');
    }catch(e){ console.warn('renderSavedDraft failed', e); }
  }

  function restoreDraft(){
    const key = buildKey();
    const txt = localStorage.getItem(key); if(!txt) return;
    try{
      const d = JSON.parse(txt);
      if(!d) return;
      _isRestoring = true;
      try{
        if (staffEl) staffEl.value = d.staff||''; if (dateEl) dateEl.value = d.date||''; if (regionEl) regionEl.value = d.region||'';
        if(d.region) populateSchoolSelect(d.region);
        if (schoolEl) {
          if(d.schoolCode) schoolEl.value = d.schoolCode; else schoolEl.value = d.school||'';
        }
        try{
          if(d.startTime){
            const m = (d.startTime||'').toString().trim().split(':');
            if(m && m.length>=2){ if(startHourEl) startHourEl.value = String(m[0]).padStart(2,'0'); if(startMinEl) startMinEl.value = String(m[1]).padStart(2,'0'); }
          }
        }catch(e){}
        if (durEl) durEl.value = d.durationMin||durEl.value; if (endEl) endEl.value = d.endTime||'';
        if (qs('teacherName')) qs('teacherName').value = d.teacher||''; if (qs('publisher')) qs('publisher').value = d.publisher||'';
        if (qs('phone')) qs('phone').value = d.phone||''; if (qs('email')) qs('email').value = d.email||'';
        if (qs('requests')) qs('requests').value = d.requests||''; if (qs('notes')) qs('notes').value = d.notes||''; if (qs('deliveries')) qs('deliveries').value = d.deliveries||'';
        if (followUpEl) followUpEl.value = d.followUp || '';
        // subjects
        if (subjectContainer) {
          const btns = subjectContainer.querySelectorAll('.subject-btn'); btns.forEach(b=> b.classList.toggle('active', (d.subjects||[]).includes(b.textContent.trim())));
        }
        // activities
        if (activitiesContainer) {
          const acts = activitiesContainer.querySelectorAll('.subject-btn');
          acts.forEach(b=> b.classList.toggle('active', (d.activities||[]).includes(b.textContent.trim())));
        }
      } finally { _isRestoring = false; }
    }catch(e){ console.warn('failed to restore draft', e); }
  }

  async function loadDraftForCurrentKey(){
    const key = buildKey();
    const txt = localStorage.getItem(key);
    if(txt){ try{ const d = JSON.parse(txt); if(d){ restoreDraft(); renderSavedDraft(d); } }catch(e){} return; }
    try{
      const serverDraft = await fetchDraftFromServer();
      if(serverDraft){ localStorage.setItem(key, JSON.stringify(serverDraft)); _isRestoring = true; try{ restoreDraft(); }finally{ _isRestoring = false; } renderSavedDraft(serverDraft); }
    }catch(e){ /* ignore */ }
  }

  function computeEndTime(){
    const dur = Number(durEl && durEl.value)||0;
    if(!startHourEl || !startMinEl || !dur){ if (endEl) endEl.value = ''; return; }
    const hh = Number(String(startHourEl.value).replace(/^0+/, '') || 0);
    const mm = Number(String(startMinEl.value).replace(/^0+/, '') || 0);
    if(Number.isNaN(hh) || Number.isNaN(mm)){ if (endEl) endEl.value = ''; return; }
    const startMinutes = hh*60 + mm;
    const endMinutes = startMinutes + dur;
    const eh = Math.floor((endMinutes%1440)/60).toString().padStart(2,'0');
    const em = (endMinutes%60).toString().padStart(2,'0');
    if (endEl) endEl.value = `${eh}:${em}`;
  }

  function updateTopline(){
    const schoolText = (schoolEl && schoolEl.selectedOptions && schoolEl.selectedOptions[0]) ? schoolEl.selectedOptions[0].textContent : (schoolEl ? schoolEl.value : '');
    if(schoolDisplay) schoolDisplay.textContent = schoolText || '';
    if (topline) topline.textContent = `${(staffEl && staffEl.value)||'-'} - ${(dateEl && dateEl.value)||'-'} - ${(regionEl && regionEl.value)||'-'}`;
  }

  function formatForCopy(){
    const f = gatherForm();
    return `담당자 ${f.staff}\n방문일 ${f.date} (${f.startTime} ~ ${f.endTime || ''})\n지역 ${f.region}\n학교: ${f.school}\n과목: ${f.subjects.join(', ')}\n활동: ${(f.activities||[]).join(', ')}\n선생님 ${f.teacher}\n출판사 ${f.publisher}\n연락 ${f.phone} ${f.email}\n\n요청사항:\n${f.requests}\n\n특이사항:\n${f.notes}\n\n납품:\n${f.deliveries}`;
  }

  async function saveToServer(){
    const data = gatherForm();
    try{
      const res = await fetch('/save-meeting', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      if(res.ok){ alert('저장 완료'); return true; }
      else { const txt = await res.text().catch(()=>res.statusText); alert('저장 실패: '+txt); return false; }
    }catch(e){ alert('저장 에러: '+e.message); return false; }
  }

  // wire events
  document.addEventListener('DOMContentLoaded', async ()=>{
    await loadRegions();
    try{
      if (startHourEl) {
        startHourEl.innerHTML = '';
        for (let h = 8; h <= 20; h++) {
          const v = String(h).padStart(2,'0');
          const opt = document.createElement('option'); opt.value = v; opt.textContent = v; startHourEl.appendChild(opt);
        }
      }
      if (startMinEl) {
        startMinEl.innerHTML = '';
        for (let m = 0; m < 60; m += 5) {
          const v = String(m).padStart(2,'0');
          const opt = document.createElement('option'); opt.value = v; opt.textContent = v; startMinEl.appendChild(opt);
        }
      }
      if (startHourEl && !startHourEl.value) startHourEl.value = '08';
      if (startMinEl && !startMinEl.value) startMinEl.value = '00';
    }catch(e){ }
    try{
      const params = new URLSearchParams(window.location.search || '');
      const pStaff = params.get('staff') || '';
      const pDate = params.get('date') || '';
      const pRegion = params.get('region') || '';
      const pSchool = params.get('school') || '';
      if (pStaff && staffEl) staffEl.value = pStaff;
      if (pStaff && staffEl) {
        try{ staffEl.readOnly = true; staffEl.style.background = '#f3f6ff'; staffEl.style.cursor = 'not-allowed'; }catch(e){}
      }
      if (pDate && dateEl) dateEl.value = pDate;
      if (pRegion && regionEl) { regionEl.value = pRegion; populateSchoolSelect(pRegion); }
      if (pSchool && schoolEl) {
        const byValue = Array.from(schoolEl.options).find(o=>o.value === pSchool);
        const byText = Array.from(schoolEl.options).find(o=> (o.textContent||'') === pSchool);
        if(byValue) schoolEl.value = byValue.value;
        else if(byText) schoolEl.value = byText.value;
        else schoolEl.value = pSchool;
      }
      const qStart = params.get('start') || params.get('startTime') || params.get('visitStart') || '';
      if (qStart) {
        try{ const parts = qStart.split(':'); if (parts.length >= 2) { if (startHourEl) startHourEl.value = String(parts[0]).padStart(2,'0'); if (startMinEl) startMinEl.value = String(parts[1]).padStart(2,'0'); } }catch(e){}
      }
    }catch(e){ }

    restoreDraft();
    try{
      const serverDraft = await fetchDraftFromServer();
      if(serverDraft){
        const localKey = buildKey();
        const localTxt = localStorage.getItem(localKey);
        const local = localTxt ? JSON.parse(localTxt) : {};
        const merged = Object.assign({}, serverDraft, local || {});
        localStorage.setItem(localKey, JSON.stringify(merged));
        restoreDraft();
      }
    }catch(e){ console.warn('merge server draft failed', e); }
    updateTopline();
    computeEndTime();
  });

  // region -> schools
  if (regionEl) regionEl.addEventListener('change', async ()=>{ populateSchoolSelect(regionEl.value); if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); });
  if (schoolEl) schoolEl.addEventListener('change', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); });
  [staffEl, dateEl].forEach(el=> { if (el) el.addEventListener('input', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); }); });
  if (startHourEl) startHourEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (startMinEl) startMinEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (durEl) durEl.addEventListener('input', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });

  if (subjectContainer) subjectContainer.addEventListener('click', (ev)=>{ const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave(); });

  if (activitiesContainer) {
    activitiesContainer.addEventListener('click', (ev)=>{
      const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave();
    });
  }

  if (btnCopy) btnCopy.addEventListener('click', async ()=>{
    const txt = formatForCopy();
    try{ await navigator.clipboard.writeText(txt); alert('클립보드에 복사되었습니다.'); }catch(e){ alert('복사 실패: '+e.message); }
  });

  if (btnSaveServer) btnSaveServer.addEventListener('click', async ()=>{ await saveToServer(); });

  if (btnSubmit) btnSubmit.addEventListener('click', async ()=>{
    saveDraft();
    const ok = await saveToServer().catch(()=>false);
    if(ok){ try{ appendToDailyReport(gatherForm()); }catch(e){ console.warn('append report failed', e); }
      const s = encodeURIComponent((staffEl && staffEl.value||'').trim());
      const d = encodeURIComponent((dateEl && dateEl.value||'').trim());
      location.href = `/report.html?staff=${s}&date=${d}`;
    } else {
      try{ appendToDailyReport(gatherForm()); }catch(e){ console.warn('append report failed', e); }
      alert('입력완료: 서버 저장 실패, 로컬에 누적되었습니다.');
      const s = encodeURIComponent((staffEl && staffEl.value||'').trim());
      const d = encodeURIComponent((dateEl && dateEl.value||'').trim());
      location.href = `/report.html?staff=${s}&date=${d}`;
    }
  });

  function reportKeyFor(staff, date){
    return `report:${(staff||'').trim()}|${(date||'').trim()}`;
  }

  function appendToDailyReport(entry){
    const staff = (entry.staff||'').trim();
    const date = entry.date || '';
    if(!staff || !date) return;
    const key = reportKeyFor(staff,date);
    let arr = [];
    try{ arr = JSON.parse(localStorage.getItem(key) || '[]') || []; }catch(e){ arr = []; }
    arr.push(Object.assign({}, entry, { savedAt: new Date().toISOString() }));
    try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(e){ console.warn('failed to save report', e); }
  }

  if (btnBack) btnBack.addEventListener('click', ()=>{
    try{
      const staff = encodeURIComponent((staffEl && staffEl.value||'').trim());
      const date = encodeURIComponent((dateEl && dateEl.value||'').trim());
      const params = new URLSearchParams();
      if(staff) params.set('staff', staff);
      if(date) params.set('date', date);
      const qs = params.toString();
      const target = '/input' + (qs ? ('?' + qs) : '');
      location.href = target;
    }catch(e){ try{ location.href = '/input'; }catch(e2){ } }
  });

  document.querySelectorAll('input,select,textarea').forEach(el=> el.addEventListener('input', updateTopline));
  window.addEventListener('load', computeEndTime);

})();
// meeting.js - behavior for meeting.html
(function(){
  const qs = (id) => document.getElementById(id);
  const staffEl = qs('staff');
  const dateEl = qs('visitDate');
  const regionEl = qs('regionSelect');
  const schoolEl = qs('schoolSelect');
  const startHourEl = qs('startHour');
  const startMinEl = qs('startMinute');
  const durEl = qs('duration');
  const endEl = qs('endTime');
  const subjectContainer = qs('subjects');
  const activitiesContainer = qs('activities');
  const schoolDisplay = qs('schoolDisplay');
  const followUpEl = qs('followUp');
  const btnBack = qs('btnBack');
  const btnCopy = qs('btnCopy');
  const btnSaveServer = qs('btnSaveServer');
  const btnSubmit = qs('btnSubmit');
  const topline = qs('topline');
  const savedDraftEl = qs('savedDraft');

  let regions = [];
  let _isRestoring = false; // when true, don't trigger autosave while populating

  function parseRegionsFromRows(rows){
    const header = rows[0] || [];
    const idxRegion = header.findIndex(h => /region|지역/i.test((h||'').trim()));
    const idxStaff = header.findIndex(h => /staff|담당/i.test((h||'').trim()));
    // identify school-name and school-code columns robustly
    let idxSchoolName = -1;
    let idxSchoolCode = -1;
    for (let i = 0; i < header.length; i++){
      const h = (header[i] || '').trim();
      const lower = h.toLowerCase();
      // detect explicit code columns first
      if (/(정보공시학교코드|학교코드|school_code|schoolcode|\bcode\b)/i.test(h)) {
        if (idxSchoolCode === -1) idxSchoolCode = i;
        continue;
      }
      // explicit name-like headers
      if (/(학교명|학교 이름|school_name|schoolname|school name|^school$)/i.test(h)) {
        idxSchoolName = i; break;
      }
    }
    // if explicit name header not found, pick any header containing '학교' or 'school' but not '코드'/'code'
    if (idxSchoolName === -1) {
      for (let i = 0; i < header.length; i++){
        const h = (header[i] || '').trim();
        if (/(학교|school)/i.test(h) && !/(코드|code)/i.test(h)) { idxSchoolName = i; break; }
      }
    }
    // final fallback: if we only found a code column, use it as code and don't treat it as name
    const idxSchool = idxSchoolName >= 0 ? idxSchoolName : idxSchoolCode;
    if (idxRegion < 0 || idxSchool < 0) return [];
    const regionMap = new Map();
    for (let i=1;i<rows.length;i++){
      const r = rows[i]; if(!r) continue;
      const rn = (r[idxRegion]||'').trim();
  const sn = idxSchoolName>=0 ? (r[idxSchoolName]||'').trim() : '';
  const scode = idxSchoolCode>=0 ? (r[idxSchoolCode]||'').trim() : '';
      const st = idxStaff>=0? (r[idxStaff]||'').trim() : '';
  if(!rn||!(sn||scode)) continue;
      if(!regionMap.has(rn)) regionMap.set(rn,{name:rn,schools:[],staffSet:new Set()});
      const reg = regionMap.get(rn);
      // store both display name and optional code
      const displayName = sn || scode;
      reg.schools.push({ name: displayName, code: scode || '', staff: st? [st] : [] });
      if(st) reg.staffSet.add(st);
    }
    return Array.from(regionMap.values()).map(reg => ({
      name: reg.name,
      schools: reg.schools.map(s => ({ name: s.name, code: s.code }))
    })).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  }

  async function loadRegions(){
    if (typeof fetchCsvRows !== 'function') {
      console.warn('fetchCsvRows not available. Ensure /csv-helpers.js is loaded.');
      return [];
    }
    const rows = await fetchCsvRows().catch(()=>[]);
    regions = parseRegionsFromRows(rows || []);
    populateRegionSelect();
    return regions;
  }

  function populateRegionSelect(){
    regionEl.innerHTML = '<option value="">지역 선택...</option>';
    regions.forEach(r => {
      const opt = document.createElement('option'); opt.value = r.name; opt.textContent = r.name; regionEl.appendChild(opt);
    });
  }

  function populateSchoolSelect(regionName){
    schoolEl.innerHTML = '<option value="">학교 선택...</option>';
    const reg = regions.find(r=>r.name===regionName);
    if(!reg) return;
    reg.schools.forEach(s => { 
      const opt = document.createElement('option'); 
      // show the human-friendly school name as text; keep code (if present) as the value
      opt.value = s.code && s.code.length ? s.code : s.name; 
      opt.textContent = s.name; 
      if(s.code) opt.dataset.code = s.code;
      schoolEl.appendChild(opt); 
    });
  }

  function buildKey(){
    const staff = (staffEl.value||'').trim();
    const date = dateEl.value || '';
    const region = regionEl.value || '';
    const school = schoolEl.value || '';
    return `meeting:draft:${staff}|${date}|${region}|${school}`;
  }

  function gatherForm(){
    const subjects = Array.from(subjectContainer.querySelectorAll('.subject-btn.active')).map(b=>b.textContent.trim());
    const activities = activitiesContainer ? Array.from(activitiesContainer.querySelectorAll('.subject-btn.active')).map(b=>b.textContent.trim()) : [];
    const params = new URLSearchParams(window.location.search || '');
  const server_id = params.get('server_id') || params.get('serverId') || '';
    const schoolText = (schoolEl.selectedOptions && schoolEl.selectedOptions[0]) ? schoolEl.selectedOptions[0].textContent : schoolEl.value;
    return {
      staff: staffEl.value,
      date: dateEl.value,
      region: regionEl.value,
      // include both school code (value) and the displayed school name
      schoolCode: schoolEl.value,
      school: schoolText,
      server_id,
  // produce HH:MM from hour/minute selects
  startTime: (function(){ try{ const h = (startHourEl && startHourEl.value) ? String(startHourEl.value).padStart(2,'0') : '08'; const m = (startMinEl && startMinEl.value) ? String(startMinEl.value).padStart(2,'0') : '00'; return `${h}:${m}`;}catch(e){return '';}})(),
      durationMin: Number(durEl.value)||0,
      endTime: endEl.value,
      subjects, activities, teacher: qs('teacherName').value, publisher: qs('publisher').value,
      phone: qs('phone').value, email: qs('email').value,
      requests: qs('requests').value, notes: qs('notes').value, deliveries: qs('deliveries').value,
      // server-side friendly aliases
      contact: qs('phone').value,
      ask: qs('requests').value,
      conversation: qs('notes').value,
      delivery: qs('deliveries').value,
      followUp: qs('followUp') ? qs('followUp').value : '' ,
      // also include canonical visit fields
      visitDate: dateEl.value,
      visitStart: (function(){ try{ const h = (startHourEl && startHourEl.value) ? String(startHourEl.value).padStart(2,'0') : '08'; const m = (startMinEl && startMinEl.value) ? String(startMinEl.value).padStart(2,'0') : '00'; return `${h}:${m}`;}catch(e){return '';}})(),
      duration: Number(durEl.value)||0,
      visitEnd: endEl.value
    };
  }

  function saveDraft(){
    const key = buildKey();
    try{ localStorage.setItem(key, JSON.stringify(gatherForm())); }
    catch(e){ console.warn('failed to save draft', e); }
    try{ renderSavedDraft(gatherForm()); }catch(e){}
  }

  // --- server autosave (debounced) ---
  let _serverSaveTimer = null;
  const SERVER_SAVE_DELAY = 1500; // ms

  function scheduleServerSave(){
    try{ if(_serverSaveTimer) clearTimeout(_serverSaveTimer); _serverSaveTimer = setTimeout(()=> { saveDraftToServer(); _serverSaveTimer = null; }, SERVER_SAVE_DELAY); }catch(e){}
  }

  async function saveDraftToServer(){
    const data = gatherForm();
    // don't send if staff or date missing
    if(!data.staff || !data.date) return;
    try{
      await fetch('/save-draft', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) });
      // optional: could set a small visual indicator here
      try{ renderSavedDraft(data); }catch(e){}
    }catch(e){ console.warn('saveDraftToServer failed', e); }
  }

  async function fetchDraftFromServer(){
    try{
      const params = new URLSearchParams();
      params.set('staff', (staffEl.value||'').trim());
      params.set('date', (dateEl.value||'').trim());
      params.set('region', (regionEl.value||'').trim());
      // prefer schoolCode (select value) as query, but also include school name if available
      params.set('school', (schoolEl.value||'').trim());
      const res = await fetch('/get-draft?'+params.toString());
      if(!res.ok) return null;
      const j = await res.json().catch(()=>null); if(!j || !j.ok || !j.draft) return null;
      try{ renderSavedDraft(j.draft); }catch(e){}
      return j.draft;
    }catch(e){ console.warn('fetchDraftFromServer failed', e); return null; }
  }

  function renderSavedDraft(d){
    if(!savedDraftEl) return;
    try{
      if(!d) { savedDraftEl.textContent = ''; return; }
      // build a compact, readable summary of important fields
      const parts = [];
      if(d.staff) parts.push(`담당자: ${d.staff}`);
      if(d.date) parts.push(`방문일: ${d.date}`);
      if(d.region) parts.push(`지역: ${d.region}`);
      if(d.school) parts.push(`학교: ${d.school}`);
      if(d.visitStart || d.startTime) parts.push(`시작: ${d.visitStart || d.startTime}`);
      if(d.duration || d.durationMin) parts.push(`소요: ${d.duration || d.durationMin}분`);
      if(d.subjects && Array.isArray(d.subjects) && d.subjects.length) parts.push(`과목: ${d.subjects.join(', ')}`);
      if(d.activities && Array.isArray(d.activities) && d.activities.length) parts.push(`영업활동: ${d.activities.join(', ')}`);
      if(d.teacher) parts.push(`선생님: ${d.teacher}`);
      if(d.requests) parts.push(`요청: ${d.requests}`);
      if(d.notes) parts.push(`특이사항: ${d.notes}`);
      if(d.delivery) parts.push(`납품: ${d.delivery}`);
      if(d.followUp) parts.push(`후속조치: ${d.followUp}`);
      savedDraftEl.textContent = parts.join('\n');
    }catch(e){ console.warn('renderSavedDraft failed', e); }
  }

  function restoreDraft(){
    const key = buildKey();
    const txt = localStorage.getItem(key); if(!txt) return;
    try{
      const d = JSON.parse(txt);
      if(!d) return;
      _isRestoring = true;
      try{
        staffEl.value = d.staff||''; dateEl.value = d.date||''; regionEl.value = d.region||'';
        if(d.region) populateSchoolSelect(d.region);
        // try to restore by code first, then by displayed name
        if(d.schoolCode) schoolEl.value = d.schoolCode; else schoolEl.value = d.school||'';
        // restore startHour/startMinute from saved startTime if present
        try{
          if(d.startTime){
            const m = (d.startTime||'').toString().trim().split(':');
            if(m && m.length>=2){ if(startHourEl) startHourEl.value = String(m[0]).padStart(2,'0'); if(startMinEl) startMinEl.value = String(m[1]).padStart(2,'0'); }
          }
        }catch(e){}
        durEl.value = d.durationMin||durEl.value; endEl.value = d.endTime||'';
        qs('teacherName').value = d.teacher||''; qs('publisher').value = d.publisher||'';
        qs('phone').value = d.phone||''; qs('email').value = d.email||'';
        qs('requests').value = d.requests||''; qs('notes').value = d.notes||''; qs('deliveries').value = d.deliveries||'';
        if (qs('followUp')) qs('followUp').value = d.followUp || '';
        // subjects
        const btns = subjectContainer.querySelectorAll('.subject-btn'); btns.forEach(b=> b.classList.toggle('active', (d.subjects||[]).includes(b.textContent.trim())));
        // activities
        if (activitiesContainer) {
          const acts = activitiesContainer.querySelectorAll('.subject-btn');
          acts.forEach(b=> b.classList.toggle('active', (d.activities||[]).includes(b.textContent.trim())));
        }
      } finally { _isRestoring = false; }
    }catch(e){ console.warn('failed to restore draft', e); }
  }

  // Load draft for current key: prefer local, fallback to server; used when staff/date/region/school changes
  async function loadDraftForCurrentKey(){
    const key = buildKey();
    // try local first
    const txt = localStorage.getItem(key);
    if(txt){ try{ const d = JSON.parse(txt); if(d){ restoreDraft(); renderSavedDraft(d); } }catch(e){} return; }
    // else try server
    try{
      const serverDraft = await fetchDraftFromServer();
      if(serverDraft){ localStorage.setItem(key, JSON.stringify(serverDraft)); _isRestoring = true; try{ restoreDraft(); }finally{ _isRestoring = false; } renderSavedDraft(serverDraft); }
    }catch(e){ /* ignore */ }
  }

  function computeEndTime(){
    // read hour/minute from selects
    const dur = Number(durEl.value)||0;
    if(!startHourEl || !startMinEl || !dur){ endEl.value = ''; return; }
    const hh = Number(String(startHourEl.value).replace(/^0+/, '') || 0);
    const mm = Number(String(startMinEl.value).replace(/^0+/, '') || 0);
    if(Number.isNaN(hh) || Number.isNaN(mm)){ endEl.value = ''; return; }
    const startMinutes = hh*60 + mm;
    const endMinutes = startMinutes + dur;
    const eh = Math.floor((endMinutes%1440)/60).toString().padStart(2,'0');
    const em = (endMinutes%60).toString().padStart(2,'0');
    endEl.value = `${eh}:${em}`;
  }

  function updateTopline(){
    const schoolText = (schoolEl.selectedOptions && schoolEl.selectedOptions[0]) ? schoolEl.selectedOptions[0].textContent : (schoolEl.value || '');
    // put the readable school name next to the Back button
    if(schoolDisplay) schoolDisplay.textContent = schoolText || '';
    // topline no longer includes school to avoid duplication
    topline.textContent = `${staffEl.value||'-'} - ${dateEl.value||'-'} - ${regionEl.value||'-'}`;
  }

  function formatForCopy(){
    const f = gatherForm();
    return `담당자: ${f.staff}\n방문일: ${f.date} (${f.startTime} ~ ${f.endTime || ''})\n지역: ${f.region}\n학교: ${f.school}\n과목: ${f.subjects.join(', ')}\n영업활동: ${(f.activities||[]).join(', ')}\n선생님: ${f.teacher}\n출판사: ${f.publisher}\n연락처: ${f.phone} ${f.email}\n\n고객요청사항:\n${f.requests}\n\n특이사항:\n${f.notes}\n\n납품사항:\n${f.deliveries}`;
  }

  async function saveToServer(){
    const data = gatherForm();
    try{
      const res = await fetch('/save-meeting', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
      if(res.ok){ alert('서버 저장 성공'); return true; }
      else { const txt = await res.text().catch(()=>res.statusText); alert('서버 저장 실패: '+txt); return false; }
    }catch(e){ alert('서버 전송 중 오류: '+e.message); return false; }
  }

  // wire events
  document.addEventListener('DOMContentLoaded', async ()=>{
    await loadRegions();
    // populate hour and minute selects for start time
    try{
      if (startHourEl) {
        startHourEl.innerHTML = '';
        for (let h = 8; h <= 20; h++) {
          const v = String(h).padStart(2,'0');
          const opt = document.createElement('option'); opt.value = v; opt.textContent = v; startHourEl.appendChild(opt);
        }
      }
      if (startMinEl) {
        startMinEl.innerHTML = '';
        for (let m = 0; m < 60; m += 5) {
          const v = String(m).padStart(2,'0');
          const opt = document.createElement('option'); opt.value = v; opt.textContent = v; startMinEl.appendChild(opt);
        }
      }
      // default values
      if (startHourEl && !startHourEl.value) startHourEl.value = '08';
      if (startMinEl && !startMinEl.value) startMinEl.value = '00';
    }catch(e){ /* ignore */ }
    // Prefill from query params (if present) so navigation from input.html carries values
    try{
      const params = new URLSearchParams(window.location.search || '');
      const pStaff = params.get('staff') || '';
      const pDate = params.get('date') || '';
      const pRegion = params.get('region') || '';
      const pSchool = params.get('school') || '';
      if (pStaff) staffEl.value = pStaff;
        // If staff was supplied via query (navigated from input), lock the field so user cannot change it
        if (pStaff) {
          try{
            staffEl.readOnly = true;
            staffEl.style.background = '#f3f6ff';
            staffEl.style.cursor = 'not-allowed';
          }catch(e){}
        }
  if (pDate) dateEl.value = pDate;
      if (pRegion) {
        regionEl.value = pRegion;
        populateSchoolSelect(pRegion);
      }
  if (pSchool) {
        // try to restore by matching option value first (code), then by displayed text (name)
        const byValue = Array.from(schoolEl.options).find(o=>o.value === pSchool);
        const byText = Array.from(schoolEl.options).find(o=> (o.textContent||'') === pSchool);
        if(byValue) schoolEl.value = byValue.value;
        else if(byText) schoolEl.value = byText.value;
        else schoolEl.value = pSchool;
      }
      // if query contains start time like ?start=08:30 or ?startTime=08:30, set selects
      const qStart = params.get('start') || params.get('startTime') || params.get('visitStart') || '';
      if (qStart) {
        try{
          const parts = qStart.split(':');
          if (parts.length >= 2) {
            if (startHourEl) startHourEl.value = String(parts[0]).padStart(2,'0');
            if (startMinEl) startMinEl.value = String(parts[1]).padStart(2,'0');
          }
        }catch(e){}
      }
    }catch(e){ /* ignore */ }

    // restore saved draft for this key (key uses staff|date|region|school)
    restoreDraft();
    // attempt to fetch server-side draft and merge (server wins when local missing)
    try{
      const serverDraft = await fetchDraftFromServer();
      if(serverDraft){
        // only apply fields that are missing locally to avoid overwriting unsaved local edits
        const localKey = buildKey();
        const localTxt = localStorage.getItem(localKey);
        const local = localTxt ? JSON.parse(localTxt) : {};
        const merged = Object.assign({}, serverDraft, local || {});
        // save merged locally and restore
        localStorage.setItem(localKey, JSON.stringify(merged));
        restoreDraft();
      }
    }catch(e){ console.warn('merge server draft failed', e); }
    updateTopline();
    computeEndTime();
  });

  // region -> schools
  regionEl.addEventListener('change', async ()=>{ populateSchoolSelect(regionEl.value); if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); });
  schoolEl.addEventListener('change', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); });
  [staffEl, dateEl].forEach(el=> el.addEventListener('input', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); }));

  // time/duration
  if (startHourEl) startHourEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (startMinEl) startMinEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  durEl.addEventListener('input', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });

  // subject toggles
  subjectContainer.addEventListener('click', (ev)=>{
    const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave();
  });

  // activities toggles (same visual style)
  if (activitiesContainer) {
    activitiesContainer.addEventListener('click', (ev)=>{
      const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave();
    });
  }

  // followUp is now a datalist-backed input (publisher-style). No button handlers required.

  // copy to clipboard
  btnCopy.addEventListener('click', async ()=>{
    const txt = formatForCopy();
    try{ await navigator.clipboard.writeText(txt); alert('클립보드에 복사되었습니다.'); }catch(e){ alert('복사 실패: '+e.message); }
  });

  // server save
  btnSaveServer.addEventListener('click', async ()=>{ await saveToServer(); });

  // submit (finalize) - also save draft locally under a final key
  btnSubmit.addEventListener('click', async ()=>{
    // Save draft first
    saveDraft();
    // try server save
    const ok = await saveToServer().catch(()=>false);
    if(ok){
      // append to daily report and redirect to report view
      try{ appendToDailyReport(gatherForm()); }catch(e){ console.warn('append report failed', e); }
      // navigate to report page for this staff/date
      const s = encodeURIComponent((staffEl.value||'').trim());
      const d = encodeURIComponent((dateEl.value||'').trim());
      location.href = `/report.html?staff=${s}&date=${d}`;
    } else {
      // still append locally so draft accumulates
      try{ appendToDailyReport(gatherForm()); }catch(e){ console.warn('append report failed', e); }
      alert('입력완료: 서버 저장 실패, 로컬에 누적되었습니다.');
      const s = encodeURIComponent((staffEl.value||'').trim());
      const d = encodeURIComponent((dateEl.value||'').trim());
      location.href = `/report.html?staff=${s}&date=${d}`;
    }
  });

  function reportKeyFor(staff, date){
    return `report:${(staff||'').trim()}|${(date||'').trim()}`;
  }

  function appendToDailyReport(entry){
    // gatherForm already returns a normalized object
    const staff = (entry.staff||'').trim();
    const date = entry.date || '';
    if(!staff || !date) return;
    const key = reportKeyFor(staff,date);
    let arr = [];
    try{ arr = JSON.parse(localStorage.getItem(key) || '[]') || []; }catch(e){ arr = []; }
    arr.push(Object.assign({}, entry, { savedAt: new Date().toISOString() }));
    try{ localStorage.setItem(key, JSON.stringify(arr)); }catch(e){ console.warn('failed to save report', e); }
  }

  btnBack.addEventListener('click', ()=>{
    try{
      // Preserve 담당자 and 방문일 when navigating back to input
      const staff = encodeURIComponent((staffEl.value||'').trim());
      const date = encodeURIComponent((dateEl.value||'').trim());
      const params = new URLSearchParams();
      if(staff) params.set('staff', staff);
      if(date) params.set('date', date);
      const qs = params.toString();
      const target = '/input' + (qs ? ('?' + qs) : '');
      location.href = target;
    }catch(e){ try{ location.href = '/input'; }catch(e2){ /* ignore */ } }
  });

  // update headline when any input changes
  document.querySelectorAll('input,select,textarea').forEach(el=> el.addEventListener('input', updateTopline));

  // recompute end time on load if possible
  window.addEventListener('load', computeEndTime);

})();
