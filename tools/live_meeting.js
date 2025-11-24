(function(){
  // safer qs: return actual element or a lightweight stub so later code that
  // assumes an element (and calls addEventListener, querySelectorAll, etc.)
  // won't throw when an element is missing. This avoids TypeErrors like
  // "Cannot read properties of null (reading 'addEventListener')".
  const qs = (id) => {
    const el = document.getElementById(id);
    if (el) return el;
    // lightweight stub - implement only commonly used members to be safe
    return {
      addEventListener: function(){},
      removeEventListener: function(){},
      dispatchEvent: function(){},
      querySelector: function(){ return null; },
      querySelectorAll: function(){ return []; },
      appendChild: function(){},
      removeChild: function(){},
      classList: { add: function(){}, remove: function(){}, toggle: function(){}, contains: function(){return false;} },
      style: {},
      value: '',
      innerHTML: '',
      textContent: '',
      selectedOptions: [],
      dataset: {},
      setAttribute: function(){},
      getAttribute: function(){ return null; }
    };
  };
  // Ensure a safe global `isReal` exists so other scripts or inline callers
  // that run before this module don't throw "isReal is not defined".
  // Bind a local const to the same function for fast local checks.
  try{
    window.isReal = window.isReal || function(el){ return !!(el && el.nodeType === 1 && typeof el.addEventListener === 'function'); };
  }catch(e){}
  const isReal = window.isReal;
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
    const rows = await withTimeout((typeof fetchCsvRows === 'function' ? fetchCsvRows() : Promise.resolve([])), FETCH_TIMEOUT_MS).catch(()=>[]);
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
    // collect per-entry items (cloned blocks for multiple teachers within the same school)
    let entries = [];
    try{
      if (typeof document !== 'undefined' && document.getElementById('entriesContainer')){
        const container = document.getElementById('entriesContainer');
        const nodes = Array.from(container.querySelectorAll('.entry'));
        entries = nodes.map(n => {
          const eSubjects = Array.from(n.querySelectorAll('.entry-subject-btn.active')).map(b=>b.textContent.trim());
          const eActs = Array.from(n.querySelectorAll('.entry-activity-btn.active')).map(b=>b.textContent.trim());
          const eFavor = (n.querySelector('.entry-favor-btn.active') || {}).textContent || '';
          return {
            subjects: eSubjects,
            activities: eActs,
            favor: (eFavor || '').trim(),
            teacher: (n.querySelector('.entry-teacher') && n.querySelector('.entry-teacher').value) || '',
            publisher: (n.querySelector('.entry-publisher') && n.querySelector('.entry-publisher').value) || '',
            phone: (n.querySelector('.entry-phone') && n.querySelector('.entry-phone').value) || '',
            email: (n.querySelector('.entry-email') && n.querySelector('.entry-email').value) || '',
            requests: (n.querySelector('.entry-requests') && n.querySelector('.entry-requests').value) || '',
            notes: (n.querySelector('.entry-notes') && n.querySelector('.entry-notes').value) || '',
            deliveries: (n.querySelector('.entry-deliveries') && n.querySelector('.entry-deliveries').value) || '',
            followUp: (n.querySelector('.entry-followup') && n.querySelector('.entry-followup').value) || ''
          };
        });
      }
    }catch(e){ /* tolerate collection errors */ }
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
  entries: entries,
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
  try{ if (typeof window !== 'undefined' && typeof saveDraft === 'function') window.saveDraft = saveDraft; }catch(e){}
  // expose for inline callers (defensive): attach to window if available
  try{ if (typeof window !== 'undefined' && typeof saveDraft === 'function') window.saveDraft = saveDraft; }catch(e){}

  // --- server autosave (debounced) ---
  let _serverSaveTimer = null;
  const SERVER_SAVE_DELAY = 1500; // ms

  // helper: check whether a fetch Response looks like JSON
  function _isJsonResponse(res){
    try{ const ct = (res && res.headers && res.headers.get) ? (res.headers.get('content-type')||'').toLowerCase() : ''; return ct.indexOf('application/json') !== -1; }catch(e){ return false; }
  }

  // Fetch timeout helper (milliseconds)
  const FETCH_TIMEOUT_MS = 5000;

  // Wrap a promise with a timeout rejection
  function withTimeout(promise, ms){
    return new Promise((resolve, reject) => {
      let done = false;
      const t = setTimeout(() => { if(!done){ done = true; reject(new Error('timeout')); } }, ms);
      promise.then(r=>{ if(!done){ clearTimeout(t); done = true; resolve(r); } }).catch(e=>{ if(!done){ clearTimeout(t); done = true; reject(e); } });
    });
  }

  // Fetch wrapper that supports timeout via AbortController when available
  function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS){
    // prefer AbortController if supported by environment
    try{
      const controller = new AbortController();
      const signal = controller.signal;
      const opt = Object.assign({}, options, { signal });
      const p = fetch(url, opt);
      const t = setTimeout(()=> controller.abort(), ms);
      return p.finally(()=> clearTimeout(t));
    }catch(e){
      // fallback to promise wrapper
      return withTimeout(fetch(url, options), ms);
    }
  }

  function scheduleServerSave(){
    // NOTE: do NOT call the server automatically. Only persist draft locally on autosave.
    try{ if(_serverSaveTimer) clearTimeout(_serverSaveTimer); _serverSaveTimer = setTimeout(()=> { try{ saveDraft(); }catch(e){} _serverSaveTimer = null; }, SERVER_SAVE_DELAY); }catch(e){}       }

  async function saveDraftToServer(){
    const data = gatherForm();
    if(!data.staff || !data.date) return;
    try{
      const res = await fetchWithTimeout('/save-draft', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) }, FETCH_TIMEOUT_MS);
      // if server returned non-JSON (e.g., index.html) treat it as unavailable
      if(!res || !res.ok || !_isJsonResponse(res)){
        console.warn('saveDraftToServer: server unavailable or returned non-JSON', res && res.status, res && res.headers && res.headers.get && res.headers.get('content-type'));
        return;
      }
      const j = await res.json().catch(()=>null);
      if(j && j.ok){ try{ renderSavedDraft(data); }catch(e){} }
      else { console.warn('saveDraftToServer: unexpected server payload', j); }
    }catch(e){ console.warn('saveDraftToServer failed', e); }
  }

  async function fetchDraftFromServer(){
    try{
      const params = new URLSearchParams();
      params.set('staff', (staffEl && staffEl.value||'').trim());
      params.set('date', (dateEl && dateEl.value||'').trim());
      params.set('region', (regionEl && regionEl.value||'').trim());
      params.set('school', (schoolEl && schoolEl.value||'').trim());
      const res = await fetchWithTimeout('/get-draft?'+params.toString(), {}, FETCH_TIMEOUT_MS);
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
          // when setting the select programmatically ensure change handlers run and UI updates
          try{ schoolEl.dispatchEvent(new Event('change', { bubbles: true })); if (typeof updateTopline === 'function') updateTopline(); }catch(e){}
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
  try{ if (typeof window !== 'undefined' && typeof updateTopline === 'function') window.updateTopline = updateTopline; }catch(e){}

  function formatForCopy(){
    const f = gatherForm();
    return `담당자 ${f.staff}\n방문일 ${f.date} (${f.startTime} ~ ${f.endTime || ''})\n지역 ${f.region}\n학교: ${f.school}\n과목: ${f.subjects.join(', ')}\n활동: ${(f.activities||[]).join(', ')}\n선생님 ${f.teacher}\n출판사 ${f.publisher}\n연락 ${f.phone} ${f.email}\n\n요청사항:\n${f.requests}\n\n특이사항:\n${f.notes}\n\n납품:\n${f.deliveries}`;
  }

  async function saveToServer(){
    const data = gatherForm();
    const dedupeKey = buildKey();
    try{
      const payload = Object.assign({}, data, { client_dedupe_key: dedupeKey });
      const res = await fetchWithTimeout('/save-meeting', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }, FETCH_TIMEOUT_MS);
      // If server returned non-JSON (e.g., index.html) treat as unavailable and fallback to local save
      if(!res){ alert('서버 응답이 없습니다. 로컬에 저장합니다.'); try{ appendToDailyReport(data); const key = buildKey(); localStorage.setItem(key, JSON.stringify(data)); }catch(e){} return false; }
      const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type')||'').toLowerCase() : '';
      if(!res.ok){ const txt = await res.text().catch(()=>res.statusText); alert('저장 실패: '+txt); return false; }
      if(ct.indexOf('application/json') === -1){
        console.warn('saveToServer: non-JSON response, treating as server unavailable', ct);
        alert('서버 응답 형식이 올바르지 않습니다. 로컬에 저장합니다.');
        try{ appendToDailyReport(data); const key = buildKey(); localStorage.setItem(key, JSON.stringify(data)); }catch(e){}
        return false;
      }
      const j = await res.json().catch(()=>null);
      if(j && (j.ok === true || j.success === true)){
        // mark this draft as saved on server (overwrite semantics: latest save wins)
        try{ localStorage.setItem('meeting:serverSaved:'+dedupeKey, JSON.stringify({ savedAt: new Date().toISOString(), serverId: j.id || null })); }catch(e){}
        try{ if (isReal(btnSaveServer)) btnSaveServer.textContent = '서버에 저장됨'; }catch(e){}
        alert('저장 완료');
        return true;
      } else {
        const txt = (j && j.msg) ? j.msg : '서버가 성공 응답을 반환하지 않았습니다.';
        alert('저장 실패: '+txt); return false;
      }
    }catch(e){ alert('저장 에러: '+(e && e.message)); try{ appendToDailyReport(data); }catch(_){} return false; }
  }

  // wire events
  document.addEventListener('DOMContentLoaded', async ()=>{
    // Load region data in the background so a slow/blocked CSV fetch doesn't
    // delay or 'freeze' the initial UI on desktop browsers. We intentionally
    // don't await here.
    loadRegions().catch(()=>{});
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
      // Support legacy/alternate query key `user` and treat it as `staff`.
      const pStaff = params.get('staff') || '';
      const pUser = params.get('user') || '';
      // If `user` is present but `staff` is not, rewrite the URL to use `staff`
      // for consistency (no reload) and use its value.
      if (!pStaff && pUser) {
        try{
          params.set('staff', pUser);
          params.delete('user');
          const newQs = params.toString();
          const newUrl = window.location.pathname + (newQs ? ('?' + newQs) : '');
          history.replaceState(null, '', newUrl);
        }catch(e){ /* ignore */ }
      }
      const effectiveStaff = (pStaff || pUser) || '';
      const pDate = params.get('date') || '';
      const pRegion = params.get('region') || '';
      const pSchool = params.get('school') || '';
      if (effectiveStaff && staffEl) staffEl.value = effectiveStaff;
      if (effectiveStaff && staffEl) {
        try{ staffEl.readOnly = true; staffEl.style.background = '#f3f6ff'; staffEl.style.cursor = 'not-allowed'; }catch(e){}
      }
      if (pDate && dateEl) dateEl.value = pDate;
      if (pRegion && regionEl) { regionEl.value = pRegion; populateSchoolSelect(pRegion); try{ regionEl.dispatchEvent(new Event('change', { bubbles: true })); if (typeof updateTopline === 'function') updateTopline(); }catch(e){} }
      if (pSchool && schoolEl) {
        const byValue = Array.from(schoolEl.options).find(o=>o.value === pSchool);
        const byText = Array.from(schoolEl.options).find(o=> (o.textContent||'') === pSchool);
        if(byValue) schoolEl.value = byValue.value;
        else if(byText) schoolEl.value = byText.value;
        else schoolEl.value = pSchool;
        try{ schoolEl.dispatchEvent(new Event('change', { bubbles: true })); if (typeof updateTopline === 'function') updateTopline(); }catch(e){}
      }
      const qStart = params.get('start') || params.get('startTime') || params.get('visitStart') || '';
      if (qStart) {
        try{ const parts = qStart.split(':'); if (parts.length >= 2) { if (startHourEl) startHourEl.value = String(parts[0]).padStart(2,'0'); if (startMinEl) startMinEl.value = String(parts[1]).padStart(2,'0'); } }catch(e){}
      }
    }catch(e){ }

    restoreDraft();
    // Fetch server draft in background to avoid blocking UI initialization.
    (async ()=>{
      try{
        const serverDraft = await fetchDraftFromServer();
        if(serverDraft){
          const localKey = buildKey();
          const localTxt = localStorage.getItem(localKey);
          const local = localTxt ? JSON.parse(localTxt) : {};
          const merged = Object.assign({}, serverDraft, local || {});
          localStorage.setItem(localKey, JSON.stringify(merged));
          _isRestoring = true; try{ restoreDraft(); }finally{ _isRestoring = false; } renderSavedDraft(serverDraft);
        }
      }catch(e){ console.warn('merge server draft failed', e); }
    })();
    // finalize load: update UI and compute end time
    try{ updateTopline(); }catch(e){}
    try{ computeEndTime(); }catch(e){}
  });

  // event wiring (outside DOMContentLoaded)
  if (isReal(schoolEl)) schoolEl.addEventListener('change', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); });
  [staffEl, dateEl].forEach(el=> { if (isReal(el)) el.addEventListener('input', async ()=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } updateTopline(); await loadDraftForCurrentKey(); }); });
  if (isReal(startHourEl)) startHourEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (isReal(startMinEl)) startMinEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (isReal(durEl)) durEl.addEventListener('input', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });

  if (isReal(subjectContainer)) subjectContainer.addEventListener('click', (ev)=>{ const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave(); });

  if (isReal(activitiesContainer)) {
    activitiesContainer.addEventListener('click', (ev)=>{
      const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave();
    });
  }

  // Delegate inputs/clicks inside entries container so per-entry text and button toggles trigger autosave
  const entriesContainer = qs('entriesContainer');
  if (isReal(entriesContainer)) {
    // any input inside entries should schedule a save
    entriesContainer.addEventListener('input', (ev)=>{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } });
    // handle per-entry button toggles (subjects/activities/favors)
    entriesContainer.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.entry-subject-btn, .entry-activity-btn, .entry-favor-btn');
      if (!btn) return;
      btn.classList.toggle('active');
      if(!_isRestoring) { saveDraft(); scheduleServerSave(); }
    });
  }

  if (isReal(btnCopy)) btnCopy.addEventListener('click', async ()=>{
    const txt = formatForCopy();
    try{ await navigator.clipboard.writeText(txt); alert('클립보드에 복사되었습니다.'); }catch(e){ alert('복사 실패: '+e.message); }
  });

  if (isReal(btnSaveServer)) btnSaveServer.addEventListener('click', async ()=>{ await saveToServer(); });

  // Submit: do NOT send to server automatically. Only save locally and navigate.
  if (isReal(btnSubmit)) btnSubmit.addEventListener('click', async ()=>{
    saveDraft();
    try{ appendToDailyReport(gatherForm()); }catch(e){ console.warn('append report failed', e); }
    const s = encodeURIComponent((staffEl && staffEl.value||'').trim());
    const d = encodeURIComponent((dateEl && dateEl.value||'').trim());
    location.href = `/report.html?staff=${s}&date=${d}`;
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

  if (isReal(btnBack)) btnBack.addEventListener('click', ()=>{
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

  try{
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      const inputs = document.querySelectorAll('input,select,textarea') || [];
      if (inputs && inputs.forEach) inputs.forEach(el=> { try{ if (el && typeof el.addEventListener === 'function') el.addEventListener('input', updateTopline); }catch(e){} });
    }
  }catch(e){}

  try{ if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('load', computeEndTime); }catch(e){}

})();

