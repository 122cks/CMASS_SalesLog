(function(){
  // Avoid running this script more than once (duplicate <script> includes will create
  // separate isolated closures that attach duplicate DOM listeners and can cause
  // cross-instance re-entrancy (infinite recursion). Use a global marker to
  // short-circuit subsequent executions.
  try{
    if (typeof window !== 'undefined'){
      if (window._cmass_meeting_loaded) { try{ console.warn('[CMASS] meeting.js already loaded, skipping duplicate execution'); }catch(e){}; return; }
      window._cmass_meeting_loaded = true;
    }
  }catch(e){}
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
  // debug logger: enabled when URL has ?debug=1 or localStorage cmass:debug === '1'
  function debugLog(){
    try{
      const params = new URLSearchParams(window.location.search || '');
      const enabled = params.get('debug') === '1' || (window.localStorage && localStorage.getItem && localStorage.getItem('cmass:debug') === '1');
      if (!enabled) return;
      try{ console.info.apply(console, ['[CMASS_DEBUG]'].concat(Array.from(arguments))); }catch(e){ console.info('[CMASS_DEBUG]', arguments); }
    }catch(e){}
  }
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
    debugLog('loadRegions start');
    if (typeof fetchCsvRows !== 'function') {
      console.warn('fetchCsvRows not available. Ensure /csv-helpers.js is loaded.');        
      debugLog('loadRegions abort: fetchCsvRows missing');
      return [];
    }
    const rows = await withTimeout((typeof fetchCsvRows === 'function' ? fetchCsvRows() : Promise.resolve([])), FETCH_TIMEOUT_MS).catch(()=>[]);
    debugLog('loadRegions fetched rows count', (rows && rows.length) || 0);
    regions = parseRegionsFromRows(rows || []);
    populateRegionSelect();
    debugLog('loadRegions done, regions count', (regions && regions.length) || 0);
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
  // top-level favor (우호도) - single-select buttons
  let topFavor = '';
  try{ const favContainer = document.getElementById('favorBtns'); if (favContainer) { const fbtn = favContainer.querySelector('.favor-btn.active'); topFavor = (fbtn && fbtn.textContent) ? fbtn.textContent.trim() : ''; } }catch(e){}
    const formObj = {
      staff: staffEl ? staffEl.value : '',
      date: dateEl ? dateEl.value : '',
      region: regionEl ? regionEl.value : '',
      schoolCode: schoolEl ? schoolEl.value : '',
      school: schoolText,
      server_id,
      startTime: (function(){ try{ const h = (startHourEl && startHourEl.value) ? String(startHourEl.value).padStart(2,'0') : '08'; const m = (startMinEl && startMinEl.value) ? String(startMinEl.value).padStart(2,'0') : '00'; return `${h}:${m}`;}catch(e){return '';}})(),
  durationMin: Number(durEl && durEl.value)||0,
  favor: topFavor,
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

    // collect meetingContents from the collapsible list (legacy simple list)
    try{
      const contentNodes = Array.from(document.querySelectorAll('#meetingContents .meeting-content-text')) || [];
      if(contentNodes.length){ formObj.meetingContents = contentNodes.map(n => (n && n.value) ? String(n.value) : ''); }
    }catch(e){}

    // collect per-session structured data (if any)
    try{
      const sessions = [];
      // wrap sessions in #sessionContainer (details.meeting-session-wrap) or single main session elements
      const wraps = Array.from(document.querySelectorAll('#sessionContainer .meeting-session-wrap')) || [];
      for(const w of wraps){
        try{
          const panel = w.querySelector('.meeting-session') || w.querySelector('section');
          if(!panel) continue;
          const sSubjects = Array.from(panel.querySelectorAll('.session-subjects .subject-btn.active')).map(b=>b.textContent.trim());
          const sActivities = Array.from(panel.querySelectorAll('.session-activities .subject-btn.active')).map(b=>b.textContent.trim());
          const sFavor = (panel.querySelector('.session-favor .favor-btn.active') || {}).textContent || '';
          const s = {
            subjects: sSubjects,
            activities: sActivities,
            favor: (sFavor||'').trim(),
            teacher: (panel.querySelector('.session-teacher') && panel.querySelector('.session-teacher').value) || '',
            publisher: (panel.querySelector('.session-publisher') && panel.querySelector('.session-publisher').value) || '',
            phone: (panel.querySelector('.session-phone') && panel.querySelector('.session-phone').value) || '',
            email: (panel.querySelector('.session-email') && panel.querySelector('.session-email').value) || '',
            requests: (panel.querySelector('.session-requests') && panel.querySelector('.session-requests').value) || '',
            notes: (panel.querySelector('.session-notes') && panel.querySelector('.session-notes').value) || '',
            deliveries: (panel.querySelector('.session-deliveries') && panel.querySelector('.session-deliveries').value) || '',
            followUp: (panel.querySelector('.session-followup') && panel.querySelector('.session-followup').value) || ''
          };
          sessions.push(s);
        }catch(e){}
      }
      // Ensure we always provide a fixed number of sessions (6) so saving/reporting is predictable
      const SCOUNT = 6;
      while(sessions.length < SCOUNT) sessions.push({ subjects: [], activities: [], favor: '', teacher: '', publisher: '', phone: '', email: '', requests: '', notes: '', deliveries: '', followUp: '' });
      formObj.sessions = sessions.slice(0, SCOUNT);
    }catch(e){}

    return formObj;
  }

  function saveDraft(){
    const key = buildKey();
    try{
      const payload = Object.assign({}, gatherForm(), { _savedAt: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(payload));
      try{ renderSavedDraft(payload); }catch(e){}
    }catch(e){ console.warn('failed to save draft', e); }
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
      const url = '/get-draft?'+params.toString();
      debugLog('fetchDraftFromServer start', url);
      const res = await fetchWithTimeout(url, {}, FETCH_TIMEOUT_MS).catch((e)=>{ debugLog('fetchDraftFromServer fetch error', e && e.message); return null; });
      if(!res){ debugLog('fetchDraftFromServer: no response'); return null; }
      debugLog('fetchDraftFromServer response status', res.status);
      if(!res.ok) return null;
      const j = await res.json().catch((e)=>{ debugLog('fetchDraftFromServer json parse failed', e && e.message); return null; });
      if(!j || !j.ok || !j.draft) { debugLog('fetchDraftFromServer: no draft in response', j); return null; }
      try{ renderSavedDraft(j.draft); }catch(e){}
      debugLog('fetchDraftFromServer done, draft keys', Object.keys(j.draft||{}));
      return j.draft;
    }catch(e){ console.warn('fetchDraftFromServer failed', e); return null; }
  }

  function renderSavedDraft(d){
    if(!savedDraftEl) return;
    try{
      if(!d) { savedDraftEl.textContent = ''; return; }
      // Render per-session blocks: repeat top-level metadata for each of the
      // six sessions so the saved-draft area displays "미팅내용1".."미팅내용6"
      if (typeof buildPerSessionDraftText === 'function') {
        savedDraftEl.textContent = buildPerSessionDraftText(d);
      } else if (typeof buildDraftPreviewText === 'function') {
        savedDraftEl.textContent = buildDraftPreviewText(d);
      } else {
        savedDraftEl.textContent = JSON.stringify(d);
      }
    }catch(e){ console.warn('renderSavedDraft failed', e); }
  }

  // Return a multiline, human-readable preview string for a draft object.
  function buildDraftPreviewText(d){
    if(!d) return '';
    const parts = [];
    if(d.staff) parts.push(`담당자: ${d.staff}`);
    if(d.date) parts.push(`방문일: ${d.date}`);
    if(d.region) parts.push(`지역: ${d.region}`);
    if(d.school) parts.push(`학교: ${d.school}`);
    if(d.visitStart || d.startTime) parts.push(`시작: ${d.visitStart || d.startTime}`);
    if(d.duration || d.durationMin) parts.push(`총분: ${d.duration || d.durationMin}`);
    if(d.subjects && Array.isArray(d.subjects) && d.subjects.length) parts.push(`과목: ${d.subjects.join(', ')}`);
    if(d.activities && Array.isArray(d.activities) && d.activities.length) parts.push(`활동: ${d.activities.join(', ')}`);
    if(d.favor) parts.push(`우호도: ${d.favor}`);
    if(d.entries && Array.isArray(d.entries) && d.entries.length){
      const entryFavors = d.entries.map((e,i)=> (e && e.favor) ? (`${i+1}:${e.favor}`) : null).filter(Boolean);
      if(entryFavors.length) parts.push(`엔트리 우호도: ${entryFavors.join(', ')}`);
    }
    if(d.publisher) parts.push(`출판사: ${d.publisher}`);
    if(d.teacher) parts.push(`선생님: ${d.teacher}`);
    if(d.requests) parts.push(`요청: ${d.requests}`);
    if(d.notes) parts.push(`특이사항: ${d.notes}`);
    if(d.delivery) parts.push(`납품: ${d.delivery}`);
    if(d.followUp) parts.push(`후속: ${d.followUp}`);
    if (Array.isArray(d.sessions) && d.sessions.length){
      parts.push('');
      d.sessions.forEach((s, idx) => {
        try{
          const has = (Array.isArray(s.subjects) && s.subjects.length) || (s.subjects && String(s.subjects).trim()) || (Array.isArray(s.activities) && s.activities.length) || (s.activities && String(s.activities).trim()) || (s.teacher && String(s.teacher).trim()) || (s.publisher && String(s.publisher).trim()) || (s.requests && String(s.requests).trim()) || (s.notes && String(s.notes).trim());
          if(!has) return;
          const subj = Array.isArray(s.subjects) ? s.subjects.join(', ') : (s.subjects || '');
          const acts = Array.isArray(s.activities) ? s.activities.join(', ') : (s.activities || '');
          const fav = (s.favor || s.favor === 0) ? s.favor : '';
          parts.push(`미팅내용 ${idx+1}:`);
          parts.push(`  과목: ${subj || '-'}`);
          if(acts) parts.push(`  활동: ${acts}`);
          parts.push(`  우호도: ${fav || '-'}`);
          if(s.teacher) parts.push(`  선생님: ${s.teacher}`);
          if(s.publisher) parts.push(`  출판사: ${s.publisher}`);
          if(s.requests) parts.push(`  요청: ${s.requests}`);
          if(s.notes) parts.push(`  특이사항: ${s.notes}`);
          if(s.deliveries) parts.push(`  납품: ${s.deliveries}`);
          if(s.followUp) parts.push(`  후속: ${s.followUp}`);
        }catch(e){}
      });
    }
    return parts.join('\n');
  }
  
  function buildPerSessionDraftText(d){
    if(!d) return '';
    const blocks = [];
    const sessions = Array.isArray(d.sessions) ? d.sessions.slice(0) : [];
    while(sessions.length < 6) sessions.push({ subjects: [], activities: [], favor: '', teacher: '', publisher: '', phone: '', email: '', requests: '', notes: '', deliveries: '', followUp: '' });
    for(let i=0;i<6;i++){
      const s = sessions[i] || {};
      const lines = [];
      lines.push(`미팅내용 ${i+1}`);
      if(d.staff) lines.push(`담당자: ${d.staff}`);
      if(d.date) lines.push(`방문일: ${d.date}`);
      if(d.region) lines.push(`지역: ${d.region}`);
      if(d.school) lines.push(`학교: ${d.school}`);
      if(d.visitStart || d.startTime) lines.push(`시작: ${d.visitStart || d.startTime}`);
      if(d.duration || d.durationMin) lines.push(`총분: ${d.duration || d.durationMin}`);
      if(d.visitEnd || d.endTime) lines.push(`종료: ${d.visitEnd || d.endTime}`);
      const subj = Array.isArray(s.subjects) ? s.subjects.join(', ') : (s.subjects || '');
      const acts = Array.isArray(s.activities) ? s.activities.join(', ') : (s.activities || '');
      lines.push(`과목: ${subj}`);
      lines.push(`활동: ${acts}`);
  // show only the session's own favor; do not fall back to top-level draft.favor
  lines.push(`우호도: ${(s.favor||'')}`);
      lines.push(`선생님: ${s.teacher || ''}`);
      lines.push(`요청: ${s.requests || ''}`);
      lines.push(`특이사항: ${s.notes || ''}`);
      lines.push(`납품: ${s.deliveries || ''}`);
      lines.push(`후속: ${s.followUp || ''}`);
      blocks.push(lines.join('\n'));
    }
    return blocks.join('\n\n');
  }
  // Expose helper functions for testing/automation purposes
  try{
    if (typeof window !== 'undefined'){
      try{ window.buildDraftPreviewText = buildDraftPreviewText; }catch(e){}
      try{ window.renderSavedDraft = renderSavedDraft; }catch(e){}
    }
  }catch(e){}

  try{ if (typeof window !== 'undefined'){ try{ window.buildPerSessionDraftText = buildPerSessionDraftText; }catch(e){} } }catch(e){}

  // Create a per-entry DOM block for teacher/subject/activity details
  function createEntryBlock(data){
    try{
      const container = document.getElementById('entriesContainer');
      if(!container) return null;
      const eWrap = document.createElement('div'); eWrap.className = 'entry'; eWrap.style.padding = '8px'; eWrap.style.border = '1px solid #eef6fb'; eWrap.style.borderRadius = '8px'; eWrap.style.background = '#fff';
      const header = document.createElement('div'); header.className = 'entry-title'; header.style.display = 'flex'; header.style.justifyContent = 'space-between'; header.style.alignItems = 'center';
      const left = document.createElement('div'); left.style.fontWeight = '700';
      // default school display: prefer data.school, then selected option text, then #schoolDisplay textContent
      try{
        let schoolText = (data && data.school) ? data.school : '';
        if(!schoolText){
          const sel = document.getElementById('schoolSelect');
          if(sel && sel.selectedOptions && sel.selectedOptions[0]) schoolText = sel.selectedOptions[0].textContent || sel.value || '';
        }
        if(!schoolText){ const sd = document.getElementById('schoolDisplay'); if(sd) schoolText = sd.textContent || '' }
        left.textContent = schoolText || '';
      }catch(e){ left.textContent = (data && data.school) ? data.school : ''; }
      const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '6px';
  const removeBtn = document.createElement('button'); removeBtn.type = 'button'; removeBtn.textContent = '삭제'; removeBtn.style.border = '1px solid #f0dede'; removeBtn.style.color = '#c33'; removeBtn.addEventListener('click', ()=>{ try{ eWrap.remove(); saveDraft(); scheduleServerSave(); }catch(e){} });
      actions.appendChild(removeBtn);
      header.appendChild(left); header.appendChild(actions); eWrap.appendChild(header);

      // subject buttons row (per-entry)
      const subjRow = document.createElement('div'); subjRow.className = 'entry-subjects btn-row'; subjRow.style.marginTop = '8px';
      // reuse top-level subject labels
      try{
        const labels = Array.from(document.querySelectorAll('#subjects .subject-btn')).map(b=>b.textContent.trim());
    labels.forEach(l => { const b = document.createElement('button'); b.type='button'; b.className='entry-subject-btn subject-btn'; b.textContent = l; subjRow.appendChild(b); });
      }catch(e){ }
      eWrap.appendChild(subjRow);

      // activity row
      const actRow = document.createElement('div'); actRow.className = 'entry-activities btn-row'; actRow.style.marginTop = '6px';
  try{ const alabs = Array.from(document.querySelectorAll('#activities .subject-btn')).map(b=>b.textContent.trim()); alabs.forEach(l=>{ const b=document.createElement('button'); b.type='button'; b.className='entry-activity-btn subject-btn'; b.textContent = l; actRow.appendChild(b); }); }catch(e){}
      eWrap.appendChild(actRow);

      // per-entry favor
  const favRow = document.createElement('div'); favRow.className = 'btn-row'; favRow.style.marginTop = '6px';
  ['좋음','보통','나쁨'].forEach(label => { const b = document.createElement('button'); b.type='button'; b.className='entry-favor-btn favor-btn'; b.textContent = label; favRow.appendChild(b); });
      eWrap.appendChild(favRow);

      // teacher / publisher inputs
      const tp = document.createElement('div'); tp.style.display='flex'; tp.style.gap='8px'; tp.style.marginTop='8px';
      const tIn = document.createElement('input'); tIn.type='text'; tIn.className='entry-teacher'; tIn.placeholder='선생님 이름'; tIn.style.flex='1'; if(data && data.teacher) tIn.value = data.teacher;
  const pIn = document.createElement('input'); pIn.type='text'; pIn.className='entry-publisher'; pIn.placeholder='출판사'; pIn.style.flex='0 0 140px';
  try{ pIn.setAttribute('list','publishersList'); }catch(e){}
  if(data && data.publisher) pIn.value = data.publisher;
      tp.appendChild(tIn); tp.appendChild(pIn); eWrap.appendChild(tp);

      // contact / requests / notes / deliveries
      const c1 = document.createElement('div'); c1.style.display='flex'; c1.style.gap='8px'; c1.style.marginTop='8px';
      const phone = document.createElement('input'); phone.type='tel'; phone.className='entry-phone'; phone.placeholder='전화번호'; phone.style.flex='1'; if(data && data.phone) phone.value = data.phone;
      const email = document.createElement('input'); email.type='email'; email.className='entry-email'; email.placeholder='이메일'; email.style.flex='1'; if(data && data.email) email.value = data.email;
      c1.appendChild(phone); c1.appendChild(email); eWrap.appendChild(c1);

      const req = document.createElement('input'); req.type='text'; req.className='entry-requests'; req.placeholder='요청사항'; req.style.width='100%'; req.style.marginTop='8px'; if(data && data.requests) req.value = data.requests; eWrap.appendChild(req);
      const notes = document.createElement('input'); notes.type='text'; notes.className='entry-notes'; notes.placeholder='특이사항'; notes.style.width='100%'; notes.style.marginTop='8px'; if(data && data.notes) notes.value = data.notes; eWrap.appendChild(notes);
      const del = document.createElement('input'); del.type='text'; del.className='entry-deliveries'; del.placeholder='납품사항'; del.style.width='100%'; del.style.marginTop='8px'; if(data && data.deliveries) del.value = data.deliveries; eWrap.appendChild(del);
  const fu = document.createElement('input'); fu.type='text'; fu.className='entry-followup'; fu.placeholder='후속조치'; fu.style.width='100%'; fu.style.marginTop='8px';
  try{ fu.setAttribute('list','followupList'); }catch(e){}
  if(data && data.followUp) fu.value = data.followUp; eWrap.appendChild(fu);

      // set active classes for subjects/activities/favor based on data
      try{
        if (data){
          if (Array.isArray(data.subjects) && data.subjects.length){ data.subjects.forEach(s=>{ const btn = Array.from(subjRow.querySelectorAll('.entry-subject-btn')).find(b=>b.textContent.trim()===s); if(btn) btn.classList.add('active'); }); }
          if (Array.isArray(data.activities) && data.activities.length){ data.activities.forEach(s=>{ const btn = Array.from(actRow.querySelectorAll('.entry-activity-btn')).find(b=>b.textContent.trim()===s); if(btn) btn.classList.add('active'); }); }
          if (data.favor){ const fb = Array.from(favRow.querySelectorAll('.entry-favor-btn')).find(b=>b.textContent.trim()===data.favor); if(fb) fb.classList.add('active'); }
        }
      }catch(e){ }

      // attach lightweight per-entry handlers so the entry is interactive immediately
      try{
        // button toggles
        const toggleHandler = function(ev){ try{ const btn = ev.target.closest && ev.target.closest('.entry-subject-btn, .entry-activity-btn, .entry-favor-btn'); if(!btn) return; if(btn.matches('.entry-subject-btn') || btn.matches('.entry-favor-btn')){ const group = btn.matches('.entry-subject-btn') ? '.entry-subject-btn' : '.entry-favor-btn'; const siblings = Array.from(eWrap.querySelectorAll(group)); const was = btn.classList.contains('active'); siblings.forEach(s=>s.classList.remove('active')); if(!was) btn.classList.add('active'); } else { btn.classList.toggle('active'); } saveDraft(); scheduleServerSave(); }catch(e){} };
        subjRow.addEventListener('click', toggleHandler);
        actRow.addEventListener('click', toggleHandler);
        favRow.addEventListener('click', toggleHandler);
        // inputs -> autosave
        const inputs = eWrap.querySelectorAll('input');
        inputs.forEach(inp => { inp.addEventListener('input', function(){ try{ saveDraft(); scheduleServerSave(); }catch(e){} }); });
      }catch(e){}

      container.appendChild(eWrap);
      try{ console.log('[CMASS] createEntryBlock appended, school=', left.textContent); }catch(e){}
      return eWrap;
    }catch(e){ console.warn('createEntryBlock failed', e); return null; }
  }

  // Create and show a modal allowing the user to pick a draft to restore (or cancel)
  function showDraftPicker(list){
    try{
      if(!Array.isArray(list) || list.length===0) return;
      // Remove existing modal if any
      const existing = document.getElementById('cmass-draft-picker'); if (existing) existing.remove();
      const overlay = document.createElement('div'); overlay.id = 'cmass-draft-picker';
      overlay.style.position = 'fixed'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0'; overlay.style.background = 'rgba(0,0,0,0.45)'; overlay.style.zIndex = '10010'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';
      const box = document.createElement('div'); box.style.background = '#fff'; box.style.padding = '18px'; box.style.borderRadius = '10px'; box.style.width = 'min(720px, 92vw)'; box.style.maxHeight = '80vh'; box.style.overflow = 'auto'; box.style.boxShadow = '0 10px 40px rgba(0,0,0,0.25)';
      const title = document.createElement('h3'); title.textContent = '저장된 드래프트 복원'; title.style.marginTop = '0'; box.appendChild(title);
      const desc = document.createElement('div'); desc.textContent = '아래 중 복원할 항목을 선택하세요. 취소하면 새로 시작합니다.'; desc.style.marginBottom = '10px'; desc.className = 'small muted'; box.appendChild(desc);
      const listEl = document.createElement('div'); listEl.style.display = 'flex'; listEl.style.flexDirection = 'column'; listEl.style.gap = '8px';
      list.forEach((it, idx)=>{
        const row = document.createElement('label'); row.style.display='flex'; row.style.flexDirection='column'; row.style.border='1px solid #e6eefc'; row.style.padding='8px'; row.style.borderRadius='8px';
        const top = document.createElement('div'); top.style.display='flex'; top.style.justifyContent='space-between'; top.style.alignItems='center';
        const left = document.createElement('div'); left.innerHTML = `<strong>${it.obj && it.obj.school ? it.obj.school : '(학교명 없음)'}</strong> · ${it.obj && it.obj.visitStart? it.obj.visitStart : (it.obj && it.obj.startTime? it.obj.startTime : '')}`;
        const right = document.createElement('div'); right.className='muted small'; right.textContent = (it.ts? (new Date(it.ts)).toLocaleString() : '저장일시 정보 없음');
        top.appendChild(left); top.appendChild(right);
        const body = document.createElement('div'); body.style.marginTop='6px'; body.innerHTML = `<div>담당자: ${(it.obj && it.obj.staff) || ''} · 방문일: ${(it.obj && it.obj.date) || ''} · 지역: ${(it.obj && it.obj.region) || ''} · 학교: ${(it.obj && it.obj.school) || ''}</div>`;
        const radioWrap = document.createElement('div'); radioWrap.style.marginTop='6px';
        const radio = document.createElement('input'); radio.type='radio'; radio.name='cmass_draft_choice'; radio.value = it.key; radio.dataset.key = it.key; radio.dataset.idx = idx; radio.style.marginRight='8px';
        if(idx===0) radio.checked=true;
        const radioLabel = document.createElement('div');
        radioLabel.style.display = 'flex';
        radioLabel.style.flexDirection = 'column';
        radioLabel.style.alignItems = 'flex-start';
        // top-row: radio input + small meta
        const topRow = document.createElement('div'); topRow.style.display = 'flex'; topRow.style.alignItems = 'center'; topRow.appendChild(radio);
        const meta = document.createElement('div'); meta.style.marginLeft = '8px'; meta.className = 'muted small'; meta.textContent = (it.obj && it.obj.school) ? `${it.obj.school} · ${it.obj.visitStart || it.obj.startTime || ''}` : '';
        topRow.appendChild(meta);
        radioLabel.appendChild(topRow);
        // preview: full multiline preview of the draft
        try{
          const pre = document.createElement('pre');
          pre.style.whiteSpace = 'pre-wrap';
          pre.style.margin = '6px 0 0 26px';
          pre.style.padding = '6px 8px';
          pre.style.background = '#f7f9fc';
          pre.style.border = '1px solid #eef6fb';
          pre.style.borderRadius = '6px';
          pre.style.fontSize = '12px';
          pre.style.lineHeight = '1.3';
          pre.style.maxHeight = '160px';
          pre.style.overflow = 'auto';
          pre.textContent = (typeof buildPerSessionDraftText === 'function') ? buildPerSessionDraftText(it.obj) : ((typeof buildDraftPreviewText === 'function') ? buildDraftPreviewText(it.obj) : (it.obj ? JSON.stringify(it.obj) : '미리보기 없음'));
          radioLabel.appendChild(pre);
        }catch(e){
          const lbl = document.createElement('div'); lbl.textContent = (it.obj && it.obj.subjects && it.obj.subjects.length) ? ('과목: ' + it.obj.subjects.join(', ')) : '내용 미리보기 없음'; radioLabel.appendChild(lbl);
        }
        radioWrap.appendChild(radioLabel);
        // add a small delete button to allow removing this saved draft locally
        try{
          const delBtn = document.createElement('button'); delBtn.type = 'button'; delBtn.textContent = '삭제'; delBtn.style.marginLeft = '8px'; delBtn.style.background = '#fff'; delBtn.style.border = '1px solid #f0dede'; delBtn.style.color = '#c33';
          delBtn.addEventListener('click', function(ev){
            try{
              ev.stopPropagation();
              const k = it.key;
              if(!k) return;
              // remove from localStorage and from list in-memory
              try{ localStorage.removeItem(k); }catch(e){}
              // remove the row from DOM
              try{ row.remove(); }catch(e){}
              // also remove from the list array so restore/other handlers skip it
              try{ const idxIn = list.findIndex(x=>x.key===k); if(idxIn>=0) list.splice(idxIn,1); }catch(e){}
            }catch(e){}
          });
          radioLabel.appendChild(delBtn);
        }catch(e){}
        row.appendChild(top); row.appendChild(body); row.appendChild(radioWrap);
        listEl.appendChild(row);
      });
      box.appendChild(listEl);
      const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px'; actions.style.marginTop='12px';
      const btnCancel = document.createElement('button'); btnCancel.type='button'; btnCancel.textContent='취소'; btnCancel.style.padding='8px 12px'; btnCancel.addEventListener('click', ()=>{ overlay.remove(); });
      const btnRestore = document.createElement('button'); btnRestore.type='button'; btnRestore.textContent='복원하기'; btnRestore.style.padding='8px 12px'; btnRestore.style.background='#1e3c72'; btnRestore.style.color='#fff'; btnRestore.addEventListener('click', ()=>{
        try{
          const sel = box.querySelector('input[name="cmass_draft_choice"]:checked');
          if(!sel) { overlay.remove(); return; }
          const k = sel.value;
          const found = list.find(x=>x.key===k);
          if(found){
            overlay.remove();
            try{ restoreDraftFromObject(found.obj, found.key); }catch(e){ console.warn('restore from picker failed', e); }
          } else { overlay.remove(); }
        }catch(e){ overlay.remove(); }
      });
      actions.appendChild(btnCancel); actions.appendChild(btnRestore); box.appendChild(actions);
      overlay.appendChild(box); document.body.appendChild(overlay);
    }catch(e){ console.warn('showDraftPicker failed', e); }
  }

  // Simple Yes/No modal to ask the user whether to restore an exact local draft
  // Accepts an optional parsed draft object for richer preview (avoid re-parsing)
  function showAskRestoreModal(key, draftObj){
    try{
      // if modal already present, remove
      const existing = document.getElementById('cmass-ask-restore'); if(existing) existing.remove();
      const overlay = document.createElement('div'); overlay.id = 'cmass-ask-restore'; overlay.style.position='fixed'; overlay.style.left='0'; overlay.style.top='0'; overlay.style.right='0'; overlay.style.bottom='0'; overlay.style.background='rgba(0,0,0,0.45)'; overlay.style.zIndex='10011'; overlay.style.display='flex'; overlay.style.alignItems='center'; overlay.style.justifyContent='center';
      const box = document.createElement('div'); box.style.background='#fff'; box.style.padding='16px'; box.style.borderRadius='8px'; box.style.width='min(560px,92vw)'; box.style.boxShadow='0 8px 30px rgba(0,0,0,0.2)'; box.style.maxHeight = '80vh'; box.style.overflow = 'auto';
      // Use wording requested by user: offer to load previous draft when same staff/date/region/school
  const msg = document.createElement('div'); msg.style.marginBottom='12px'; msg.style.fontWeight = '700'; msg.textContent = '이전에 저장된 드래프트가 있습니다. 어떻게 진행하시겠습니까?';
      const details = document.createElement('div'); details.style.marginBottom='12px'; details.style.fontSize='13px'; details.className='muted';
      // Use provided draftObj when available, else parse from storage
      let obj = draftObj;
  if(!obj){ try{ const txt = localStorage.getItem(key); obj = txt ? JSON.parse(txt) : null; }catch(e){ obj = null; } }
  // Expose the parsed draft to window for debugging/automation visibility
  try{ if (typeof window !== 'undefined') window._cmass_last_parsed_draft = obj; }catch(e){}
      if(obj){
        // Build a short preview: savedAt, subjects, activities, teacher, requests/notes, duration
        const lines = [];
        if(obj._savedAt || obj.savedAt) lines.push(`저장일시: ${obj._savedAt || obj.savedAt}`);
        if(Array.isArray(obj.subjects) && obj.subjects.length) lines.push(`과목: ${obj.subjects.join(', ')}`);
        if(Array.isArray(obj.activities) && obj.activities.length) lines.push(`활동: ${obj.activities.join(', ')}`);
        if(obj.teacher) lines.push(`선생님: ${obj.teacher}`);
        if(obj.publisher) lines.push(`출판사: ${obj.publisher}`);
        if(obj.duration || obj.durationMin) lines.push(`총 방문시간: ${obj.duration || obj.durationMin}분`);
        if(obj.requests) lines.push(`요청: ${String(obj.requests).slice(0,120)}`);
        if(obj.notes) lines.push(`특이사항: ${String(obj.notes).slice(0,120)}`);
        if(obj.entries && Array.isArray(obj.entries) && obj.entries.length){ lines.push(`엔트리 수: ${obj.entries.length}`); }
        details.innerHTML = lines.map(l => `<div style="margin-bottom:6px">${l}</div>`).join('');
      } else {
        details.textContent = '드래프트 미리보기를 불러올 수 없습니다.';
      }
  const actions = document.createElement('div'); actions.style.display='flex'; actions.style.justifyContent='flex-end'; actions.style.gap='8px';
  const newBtn = document.createElement('button'); newBtn.type='button'; newBtn.textContent='새로 작성';
  newBtn.addEventListener('click', ()=> overlay.remove());
  const restoreBtn = document.createElement('button'); restoreBtn.type='button'; restoreBtn.textContent='이전 드래프트 복원'; restoreBtn.style.background='#1e3c72'; restoreBtn.style.color='#fff';
  restoreBtn.addEventListener('click', ()=>{ try{ if(obj){ restoreDraftFromObject(obj, key); } else { restoreDraft(); } showRestoreNotice(key); }catch(e){ console.warn('restore on restoreBtn failed', e); } overlay.remove(); });
  actions.appendChild(newBtn); actions.appendChild(restoreBtn);
      box.appendChild(msg); box.appendChild(details); box.appendChild(actions); overlay.appendChild(box); document.body.appendChild(overlay);
    }catch(e){ console.warn('showAskRestoreModal failed', e); }
  }

  function restoreDraftFromObject(d, key){
    if(!d) return;
    try{
      _isRestoring = true;
      // apply familiar fields (mirrors restoreDraft)
      if (staffEl) staffEl.value = d.staff||''; if (dateEl) dateEl.value = d.date||''; if (regionEl) regionEl.value = d.region||'';
      if(d.region) populateSchoolSelect(d.region);
      if (schoolEl) {
        if(d.schoolCode) schoolEl.value = d.schoolCode; else schoolEl.value = d.school||'';
        try{ schoolEl.dispatchEvent(new Event('change', { bubbles: true })); if (typeof updateTopline === 'function') updateTopline(); }catch(e){}
      }
      try{ if(d.startTime){ const m = (d.startTime||'').toString().trim().split(':'); if(m && m.length>=2){ if(startHourEl) startHourEl.value = String(m[0]).padStart(2,'0'); if(startMinEl) startMinEl.value = String(m[1]).padStart(2,'0'); } } }catch(e){}
      if (durEl) durEl.value = d.durationMin||durEl.value; if (endEl) endEl.value = d.endTime||'';
  // prefer explicit top-level values, but fall back to first entry or first session
  const firstEntry = (Array.isArray(d.entries) && d.entries[0]) ? d.entries[0] : null;
  const firstSession = (Array.isArray(d.sessions) && d.sessions[0]) ? d.sessions[0] : null;
  const teacherVal = d.teacher || (firstEntry && firstEntry.teacher) || (firstSession && firstSession.teacher) || '';
  const publisherVal = d.publisher || (firstEntry && firstEntry.publisher) || (firstSession && firstSession.publisher) || '';
  const phoneVal = d.phone || (firstEntry && firstEntry.phone) || (firstSession && firstSession.phone) || '';
  const emailVal = d.email || (firstEntry && firstEntry.email) || (firstSession && firstSession.email) || '';
  const requestsVal = d.requests || (firstEntry && firstEntry.requests) || (firstSession && firstSession.requests) || '';
  const notesVal = d.notes || (firstEntry && firstEntry.notes) || (firstSession && firstSession.notes) || '';
  const deliveriesVal = d.deliveries || (firstEntry && firstEntry.deliveries) || (firstSession && firstSession.deliveries) || '';
  try{ console.log('[CMASS_DEBUG] restoreDraftFromObject values teacherVal,publisherVal,phoneVal:', teacherVal, publisherVal, phoneVal); }catch(e){}
  if (qs('teacherName')) qs('teacherName').value = teacherVal; if (qs('publisher')) qs('publisher').value = publisherVal;
  if (qs('phone')) qs('phone').value = phoneVal; if (qs('email')) qs('email').value = emailVal;
  if (qs('requests')) qs('requests').value = requestsVal; if (qs('notes')) qs('notes').value = notesVal; if (qs('deliveries')) qs('deliveries').value = deliveriesVal;
      if (followUpEl) followUpEl.value = d.followUp || '';
      if (subjectContainer) { const btns = subjectContainer.querySelectorAll('.subject-btn'); btns.forEach(b=> b.classList.toggle('active', (d.subjects||[]).includes(b.textContent.trim()))); }
      if (activitiesContainer) { const acts = activitiesContainer.querySelectorAll('.subject-btn'); acts.forEach(b=> b.classList.toggle('active', (d.activities||[]).includes(b.textContent.trim()))); }
      try{ renderSavedDraft(d); }catch(e){}
    }catch(e){ console.warn('restoreDraftFromObject failed', e); }
    finally { _isRestoring = false; try{ updateTopline(); }catch(e){} }

    // populate per-entry blocks if present
    try{
      const container = document.getElementById('entriesContainer');
      if (container && d && Array.isArray(d.entries) && d.entries.length){
        container.innerHTML = '';
        d.entries.forEach(en => { try{ createEntryBlock(en); }catch(e){} });
      }
    }catch(e){ }

    // restore simplified meetingContents list if present
    try{
      const contentNodes = Array.from(document.querySelectorAll('#meetingContents .meeting-content-text')) || [];
      if (Array.isArray(d.meetingContents) && d.meetingContents.length){
        for (let i=0;i<contentNodes.length;i++){
          try{ contentNodes[i].value = d.meetingContents[i] || ''; }catch(e){}
        }
      }
    }catch(e){}

    // restore structured sessions (if present)
    try{
      if (Array.isArray(d.sessions) && d.sessions.length){
        const wraps = Array.from(document.querySelectorAll('#sessionContainer .meeting-session-wrap')) || [];
        for (let i=0;i<wraps.length && i<d.sessions.length;i++){
          try{
            const panel = wraps[i].querySelector('.meeting-session') || wraps[i].querySelector('section');
            const src = d.sessions[i] || {};
            if(!panel) continue;
            // set subject/activities active states
            try{ const subjBtns = panel.querySelectorAll('.session-subjects .subject-btn'); subjBtns.forEach(b=> b.classList.toggle('active', (src.subjects||[]).includes((b.textContent||'').trim()))); }catch(e){}
            try{ const actBtns = panel.querySelectorAll('.session-activities .subject-btn'); actBtns.forEach(b=> b.classList.toggle('active', (src.activities||[]).includes((b.textContent||'').trim()))); }catch(e){}
            try{ const fav = (src.favor||'').trim(); const favBtns = panel.querySelectorAll('.session-favor .favor-btn'); favBtns.forEach(b=> b.classList.toggle('active', (b.textContent||'').trim()===fav)); }catch(e){}
            try{ if(panel.querySelector('.session-teacher')) panel.querySelector('.session-teacher').value = src.teacher || ''; }catch(e){}
            try{ if(panel.querySelector('.session-publisher')) panel.querySelector('.session-publisher').value = src.publisher || ''; }catch(e){}
            try{ if(panel.querySelector('.session-phone')) panel.querySelector('.session-phone').value = src.phone || ''; }catch(e){}
            try{ if(panel.querySelector('.session-email')) panel.querySelector('.session-email').value = src.email || ''; }catch(e){}
            try{ if(panel.querySelector('.session-requests')) panel.querySelector('.session-requests').value = src.requests || ''; }catch(e){}
            try{ if(panel.querySelector('.session-notes')) panel.querySelector('.session-notes').value = src.notes || ''; }catch(e){}
            try{ if(panel.querySelector('.session-deliveries')) panel.querySelector('.session-deliveries').value = src.deliveries || ''; }catch(e){}
            try{ if(panel.querySelector('.session-followup')) panel.querySelector('.session-followup').value = src.followUp || ''; }catch(e){}
          }catch(e){}
        }
      }
    }catch(e){}
  }

  // show a short transient on-screen notice about which draft key was restored
  function showRestoreNotice(key){
    try{
      if(!key) return;
      let n = document.getElementById('cmass-restore-notice');
      if(!n){ n = document.createElement('div'); n.id = 'cmass-restore-notice'; n.style.position='fixed'; n.style.right='12px'; n.style.top='12px'; n.style.background='#123'; n.style.color='#fff'; n.style.padding='8px 10px'; n.style.borderRadius='8px'; n.style.zIndex='9999'; n.style.fontSize='13px'; document.body.appendChild(n); }
      n.textContent = 'Restored draft: ' + key;
      n.style.display = 'block';
      // hide after 5s
      setTimeout(()=>{ try{ n.style.display = 'none'; }catch(e){} }, 5000);
    }catch(e){ }
  }

  function restoreDraft(){
    const key = buildKey();
    const txt = localStorage.getItem(key); if(!txt) return;
    try{
      debugLog('restoreDraft start', key);
      const d = JSON.parse(txt);
      if(!d) { debugLog('restoreDraft: parsed draft empty'); return; }
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
  // prefer explicit top-level values, but fall back to first entry or first session
  const firstEntry2 = (Array.isArray(d.entries) && d.entries[0]) ? d.entries[0] : null;
  const firstSession2 = (Array.isArray(d.sessions) && d.sessions[0]) ? d.sessions[0] : null;
  const teacherVal2 = d.teacher || (firstEntry2 && firstEntry2.teacher) || (firstSession2 && firstSession2.teacher) || '';
  const publisherVal2 = d.publisher || (firstEntry2 && firstEntry2.publisher) || (firstSession2 && firstSession2.publisher) || '';
  const phoneVal2 = d.phone || (firstEntry2 && firstEntry2.phone) || (firstSession2 && firstSession2.phone) || '';
  const emailVal2 = d.email || (firstEntry2 && firstEntry2.email) || (firstSession2 && firstSession2.email) || '';
  const requestsVal2 = d.requests || (firstEntry2 && firstEntry2.requests) || (firstSession2 && firstSession2.requests) || '';
  const notesVal2 = d.notes || (firstEntry2 && firstEntry2.notes) || (firstSession2 && firstSession2.notes) || '';
  const deliveriesVal2 = d.deliveries || (firstEntry2 && firstEntry2.deliveries) || (firstSession2 && firstSession2.deliveries) || '';
  try{ console.log('[CMASS_DEBUG] restoreDraft values teacherVal2,publisherVal2,phoneVal2:', teacherVal2, publisherVal2, phoneVal2); }catch(e){}
  if (qs('teacherName')) qs('teacherName').value = teacherVal2; if (qs('publisher')) qs('publisher').value = publisherVal2;
  if (qs('phone')) qs('phone').value = phoneVal2; if (qs('email')) qs('email').value = emailVal2;
  if (qs('requests')) qs('requests').value = requestsVal2; if (qs('notes')) qs('notes').value = notesVal2; if (qs('deliveries')) qs('deliveries').value = deliveriesVal2;
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
        debugLog('restoreDraft applied fields', { staff: d.staff, date: d.date, region: d.region, school: d.school });
      } finally { _isRestoring = false; debugLog('restoreDraft end', key); }
    }catch(e){ console.warn('failed to restore draft', e); debugLog('restoreDraft error', e && e.message); }
  }

  async function loadDraftForCurrentKey(){
    // Avoid re-entrant loads while we're already restoring to prevent
    // infinite recursion where restoreDraft -> dispatch change -> loadDraftForCurrentKey
    // -> restoreDraft would otherwise loop. Guard early.
    if (_isRestoring) { debugLog('loadDraftForCurrentKey aborted: already restoring'); return; }
    const key = buildKey();
    const txt = localStorage.getItem(key);
    if(txt){ try{ debugLog('loadDraftForCurrentKey: found local draft', key); const d = JSON.parse(txt); if(d){ restoreDraft(); renderSavedDraft(d); } }catch(e){ debugLog('loadDraftForCurrentKey: local parse error', e && e.message); } return; }
    try{
      // If we didn't find the exact key, try a fallback: search localStorage for any
      // draft that matches the same date|region|school (ignore staff differences).
      const datePart = (dateEl && dateEl.value) ? dateEl.value : '';
      const regionPart = (regionEl && regionEl.value) ? regionEl.value : '';
      const schoolPart = (schoolEl && schoolEl.value) ? (schoolEl.selectedOptions && schoolEl.selectedOptions[0] && schoolEl.selectedOptions[0].textContent) || schoolEl.value : '';
      const suffix = `|${datePart}|${regionPart}|${schoolPart}`;
      try{
        const matches = [];
        for (let i = 0; i < localStorage.length; i++){
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.indexOf('meeting:draft:') !== 0) continue;
          if (!k.endsWith(suffix)) continue;
          try{
            const txt2 = localStorage.getItem(k);
            if(!txt2) continue;
            const obj = JSON.parse(txt2);
            let ts = 0;
            if (obj && obj._savedAt) ts = Date.parse(obj._savedAt) || 0;
            matches.push({ key: k, obj: obj, ts: ts });
          }catch(e){ /* ignore parse errors */ }
        }
        if (matches.length === 1){
          // Single match: offer a simple restore prompt
          const m = matches[0];
          try{ showDraftPicker([m]); }catch(e){}
          return;
        } else if (matches.length > 1){
          // Multiple matches: present a chooser modal
          // sort by timestamp desc
          matches.sort((a,b)=> (b.ts||0) - (a.ts||0));
          try{ showDraftPicker(matches); }catch(e){}
          return;
        }
      }catch(e){ debugLog('loadDraftForCurrentKey: fallback scan error', e && e.message); }

      debugLog('loadDraftForCurrentKey: no local draft, fetching server draft', key);
      const serverDraft = await fetchDraftFromServer();
      if(serverDraft){ debugLog('loadDraftForCurrentKey: serverDraft received');
        try{ if(!serverDraft._savedAt) serverDraft._savedAt = new Date().toISOString(); }catch(e){}
        localStorage.setItem(key, JSON.stringify(serverDraft)); _isRestoring = true; try{ restoreDraft(); }finally{ _isRestoring = false; } renderSavedDraft(serverDraft); try{ showRestoreNotice(key); }catch(e){} }
      else {
        debugLog('loadDraftForCurrentKey: serverDraft empty or unavailable');
        // Server failed or returned no draft — offer local fallbacks by date
        try{
          const dateOnly = datePart || '';
          if (dateOnly){
            const looseMatches = [];
            for (let i = 0; i < localStorage.length; i++){
              const k = localStorage.key(i);
              if (!k) continue;
              if (k.indexOf('meeting:draft:') !== 0) continue;
              // include any draft that contains the same date segment
              if (k.indexOf('|' + dateOnly + '|') === -1) continue;
              try{
                const txt2 = localStorage.getItem(k);
                if(!txt2) continue;
                const obj = JSON.parse(txt2);
                let ts = 0; if (obj && obj._savedAt) ts = Date.parse(obj._savedAt) || 0;
                looseMatches.push({ key: k, obj: obj, ts: ts });
              }catch(e){}
            }
            if (looseMatches.length === 1){ try{ showDraftPicker([looseMatches[0]]); return; }catch(e){} }
            else if (looseMatches.length > 1){ looseMatches.sort((a,b)=> (b.ts||0)-(a.ts||0)); try{ showDraftPicker(looseMatches); return; }catch(e){} }
          }
        }catch(e){ debugLog('loadDraftForCurrentKey: post-server fallback scan failed', e && e.message); }
      }
    }catch(e){ debugLog('loadDraftForCurrentKey error', e && e.message); }
  }

  // Check whether an exact local draft exists for current staff|date|region|school
  // If a draft exists, show a Yes/No prompt asking the user to restore it.
  function checkAndPromptRestoreOnCurrentKey(){
    try{
      if (_isRestoring) { debugLog('checkAndPromptRestoreOnCurrentKey aborted: already restoring'); return; }
      const key = buildKey();
      if(!key) return;
      let txt = null;
      try{ txt = localStorage.getItem(key); }catch(e){ txt = null; }
      if(txt){
        try{ const obj = JSON.parse(txt); showAskRestoreModal(key, obj); return; }catch(e){ showAskRestoreModal(key, null); return; }
      }
      // No exact-match found. As a robustness improvement, look for any draft matching
      // the same staff and date (ignoring region/school). This covers cases where
      // the UI hasn't finished populating region/school before we check the key.
      try{
        const params = key.split(':'); // meeting:draft:staff|date|region|school
        if (params.length >= 3){
          const rest = params.slice(2).join(':');
          const [staffDatePart] = [rest.split('|').slice(0,2).join('|')];
          if (staffDatePart){
            const matches = [];
            for (let i=0;i<localStorage.length;i++){
              const k = localStorage.key(i);
              if (!k || k.indexOf('meeting:draft:') !== 0) continue;
              try{
                const suffix = k.substring('meeting:draft:'.length);
                if (suffix.indexOf(staffDatePart) === 0){
                  const txt2 = localStorage.getItem(k);
                  if(!txt2) continue;
                  const obj = JSON.parse(txt2);
                  let ts = 0; if (obj && obj._savedAt) ts = Date.parse(obj._savedAt) || 0;
                  matches.push({ key: k, obj: obj, ts: ts });
                }
              }catch(e){}
            }
            if (matches.length === 1){ try{ showAskRestoreModal(matches[0].key, matches[0].obj); return; }catch(e){} }
            else if (matches.length > 1){ matches.sort((a,b)=> (b.ts||0)-(a.ts||0)); try{ showDraftPicker(matches); return; }catch(e){} }
          }
        }
      }catch(e){ /* ignore */ }
      // no exact-match local draft found — do nothing here (other fallback flows may run)
    }catch(e){ debugLog('checkAndPromptRestoreOnCurrentKey error', e && e.message); }
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
  // Fix topline to show 담당자 - 방문일 - 지역 - 학교
  if (topline) topline.textContent = `${(staffEl && staffEl.value)||'-'} - ${(dateEl && dateEl.value)||'-'} - ${(regionEl && regionEl.value)||'-'} - ${schoolText||'-'}`;
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
  if(!res){ alert('서버 응답이 없습니다. 로컬에 저장합니다.'); try{ appendToDailyReport(data); const key = buildKey(); try{ data._savedAt = new Date().toISOString(); }catch(e){} localStorage.setItem(key, JSON.stringify(data)); }catch(e){} return false; }
      const ct = (res.headers && res.headers.get) ? (res.headers.get('content-type')||'').toLowerCase() : '';
      if(!res.ok){ const txt = await res.text().catch(()=>res.statusText); alert('저장 실패: '+txt); return false; }
      if(ct.indexOf('application/json') === -1){
        console.warn('saveToServer: non-JSON response, treating as server unavailable', ct);
        alert('서버 응답 형식이 올바르지 않습니다. 로컬에 저장합니다.');
  try{ appendToDailyReport(data); const key = buildKey(); try{ data._savedAt = new Date().toISOString(); }catch(e){} localStorage.setItem(key, JSON.stringify(data)); }catch(e){}
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
  console.log('[CMASS] meeting.js DOMContentLoaded start');
  // Load region data in the background so a slow/blocked CSV fetch doesn't
  // delay or 'freeze' the initial UI on desktop browsers. Capture the
  // promise so we can await completion later when applying URL params.
  const regionsPromise = loadRegions().catch(()=>[]);
    try{
      if (startHourEl) {
        startHourEl.innerHTML = '';
        // only allow business hours 08 through 17
        for (let h = 8; h <= 17; h++) {
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
      // Support fallback to locally stored staff token when URL lacks staff
      let effectiveStaff = (pStaff || pUser) || '';
      let staffSource = 'none';
      if (pStaff) staffSource = 'url';
      else if (pUser) staffSource = 'url_user';
      if (!effectiveStaff) {
        try{ const ls = localStorage.getItem('cmass:staff') || ''; if (ls) { effectiveStaff = ls; staffSource = 'localStorage'; } }catch(e){}
        // sessionStorage may also hold auth info from index login
        if (!effectiveStaff) {
          try{ const auth = sessionStorage.getItem('cmass_pin_authenticated'); if (auth) { const obj = JSON.parse(auth); if (obj && obj.staff) { effectiveStaff = obj.staff; staffSource = 'sessionStorage'; } } }catch(e){}
        }
      }
      debugLog('effectiveStaff resolved', effectiveStaff, 'source', staffSource);
  // Prefer URL params, then sessionStorage fallbacks (last-used), then empty
  const pDate = params.get('date') || (sessionStorage.getItem('cmass:last_date') || '') || '';
  const pRegion = params.get('region') || (sessionStorage.getItem('cmass:last_region') || '') || '';
  // Important: only use school if it's explicitly present in the URL querystring.
  // When returning from report.html we intentionally omit the `school` param so
  // the meeting page will start with no school selected (user must re-select).
  const pSchool = params.has('school') ? (params.get('school') || '') : '';
      if (effectiveStaff && staffEl) staffEl.value = effectiveStaff;
      if (effectiveStaff && staffEl) {
        try{ staffEl.readOnly = true; staffEl.style.background = '#f3f6ff'; staffEl.style.cursor = 'not-allowed'; }catch(e){}
        try{ localStorage.setItem('cmass:staff', effectiveStaff); }catch(e){}
      }
      if (pDate && dateEl) { dateEl.value = pDate; try{ sessionStorage.setItem('cmass:last_date', pDate); }catch(e){} }
      // Wait for regions/schools to finish loading before applying region/school params
      try{ await regionsPromise; }catch(e){ /* ignore */ }
      if (pRegion && regionEl) {
        try {
            regionEl.value = pRegion;
            sessionStorage.setItem('cmass:last_region', pRegion);
            populateSchoolSelect(pRegion);
            regionEl.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof updateTopline === 'function') updateTopline();
        } catch (e) {
            console.error('Failed to apply region parameter:', e);
        }
      }
      if (pSchool && schoolEl) {
        try {
            const byValue = Array.from(schoolEl.options).find(o => o.value === pSchool);
            const byText = Array.from(schoolEl.options).find(o => (o.textContent || '') === pSchool);
            if (byValue) schoolEl.value = byValue.value;
            else if (byText) schoolEl.value = byText.value;
            else schoolEl.value = pSchool;
            sessionStorage.setItem('cmass:last_school', (schoolEl.selectedOptions && schoolEl.selectedOptions[0] && schoolEl.selectedOptions[0].textContent) || schoolEl.value || pSchool);
            schoolEl.dispatchEvent(new Event('change', { bubbles: true }));
            if (typeof updateTopline === 'function') updateTopline();
        } catch (e) {
            console.error('Failed to apply school parameter:', e);
        }
      }
      debugLog('appliedParams', { date: pDate, region: pRegion, school: pSchool });
      const qStart = params.get('start') || params.get('startTime') || params.get('visitStart') || '';
      if (qStart) {
        try{ const parts = qStart.split(':'); if (parts.length >= 2) { if (startHourEl) startHourEl.value = String(parts[0]).padStart(2,'0'); if (startMinEl) startMinEl.value = String(parts[1]).padStart(2,'0'); } }catch(e){}
      }
    }catch(e){ }

  // Instead of auto-restoring silently, check if an exact local draft exists
  // for the current staff|date|region|school and ask the user whether to
  // restore it. This prevents unexpected overwrites when the form is
  // pre-populated from URL params or session storage.
  try{ checkAndPromptRestoreOnCurrentKey(); }catch(e){ restoreDraft(); }
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
  try{ updatePreserveLinks(); }catch(e){}
    // Wire meetingContents collapse/input handlers to autosave
    try{
      const contentArea = document.getElementById('meetingContents');
      if(contentArea){
        // autosave on textarea input
        contentArea.addEventListener('input', function(ev){ try{ if(!_isRestoring) saveDraft(); scheduleServerSave(); }catch(e){} });
        // optional: ensure clicking summary toggles and doesn't block interactions
        const details = Array.from(contentArea.querySelectorAll('details'));
        details.forEach(d => { d.addEventListener('toggle', function(){ try{ /* no-op, but allows us to detect user toggles in future */ }catch(e){} }); });
      }
    }catch(e){}
    // Defensive repair: ensure key interactive controls are visible and accept pointer events.
    try{
      (function ensureClickableControls(){
        try{
          // First: detect any large fixed/absolute overlays that may be blocking pointer events
          try{
            const candidates = Array.from(document.querySelectorAll('body *'));
            for (const el of candidates){
              try{
                const cs = window.getComputedStyle(el);
                if (!cs) continue;
                const pos = (cs.position || '').toLowerCase();
                // candidate overlay: fixed or absolute, visible, and accepts pointer-events
                if ((pos === 'fixed' || pos === 'absolute') && cs.pointerEvents !== 'none' && cs.display !== 'none' && cs.visibility !== 'hidden'){
                  const r = el.getBoundingClientRect();
                  if (!r) continue;
                  // large enough to cover most of viewport
                  const coversWidth = (r.width >= (window.innerWidth * 0.9));
                  const coversHeight = (r.height >= (window.innerHeight * 0.9));
                  if (coversWidth && coversHeight && r.top <= 2 && r.left <= 2){
                    // avoid disabling known cmass-protected overlays (ids starting with 'cmass-')
                    const eid = el.id || '';
                    if (!eid.startsWith('cmass-')){
                      try{ el.dataset._cmass_overlay_disabled = '1'; el.style.pointerEvents = 'none'; console.log('[CMASS_REPAIR] disabled blocking overlay', eid, el.className); }catch(e){}
                    }
                  }
                }
              }catch(e){}
            }
          }catch(e){ /* ignore overlay scan errors */ }

          const selectors = ['.entry-favor-btn', '.friend-btn', '#addSubjectBtn', '#addEntryBtn', '#duration', '.entry-subject-btn', '.entry-activity-btn'];
          selectors.forEach(sel => {
            try{
              const nodes = Array.from(document.querySelectorAll(sel));
              nodes.forEach(n => {
                try{
                  const s = window.getComputedStyle(n);
                  // if hidden via display/visibility/pointer-events, try to restore basic interactivity
                  if (s && (s.display === 'none' || s.visibility === 'hidden' || s.pointerEvents === 'none')) {
                    n.style.display = n.style.display === 'none' ? '' : n.style.display;
                    n.style.visibility = n.style.visibility === 'hidden' ? '' : n.style.visibility;
                    n.style.pointerEvents = 'auto';
                  }
                  // If element is positioned offscreen (negative bounding rect), try to make it reachable
                  try{
                    const r = n.getBoundingClientRect();
                    if (r && (r.top < 0 || r.bottom < 0 || isNaN(r.width))) {
                      if (typeof n.scrollIntoView === 'function') {
                        n.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                      }
                    }
                  }catch(e){}
                  // Ensure no ancestor is blocking pointer-events (some UI frameworks set pointer-events:none on overlays)
                  try{
                    let p = n.parentElement;
                    while(p && p !== document.body){
                      try{
                        const pcs = window.getComputedStyle(p);
                        if (pcs && pcs.pointerEvents === 'none'){
                          p.style.pointerEvents = 'auto';
                          p.dataset._cmass_parent_pointer = '1';
                          console.log('[CMASS_REPAIR] restored pointer-events on ancestor', p.id || p.className || p.tagName);
                        }
                        if (pcs && (pcs.display === 'none' || pcs.visibility === 'hidden')){
                          p.style.display = p.style.display === 'none' ? '' : p.style.display;
                          p.style.visibility = p.style.visibility === 'hidden' ? '' : p.style.visibility;
                        }
                      }catch(e){}
                      p = p.parentElement;
                    }
                  }catch(e){}
                  // Add a lightweight click-logger for debug so we can see if users attempt clicks
                  try{
                    if (!n.dataset || n.dataset._cmass_click_logger !== '1') {
                      n.dataset._cmass_click_logger = '1';
                      n.addEventListener('click', function(ev){ try{ console.log('[CMASS_REPAIR] clicked', sel, this && (this.id || this.className)); }catch(e){} });
                    }
                  }catch(e){}
                }catch(e){}
              });
            }catch(e){}
          });
        }catch(e){ console.warn('ensureClickableControls failed', e); }
      })();
      // If the add-subject button is missing on the page, create a minimal, robust
      // `#addSubjectBtn` and wire it to append a simple `.entry` block so probes
      // and users can add a subject/teacher quickly. This avoids editing HTML
      // templates across multiple pages and is defensive (no-op if elements exist).
      try{
        // Previous behavior injected a global #addSubjectBtn into the DOM when missing.
        // Keeping this noop guard here in case other scripts query for the id; do NOT create the element.
        (function ensureAddSubjectButton(){
          return;
        })();
      }catch(e){}
      // wire addEntryBtn if present
      try{
        const addBtn = document.getElementById('addEntryBtn');
        if(addBtn){ addBtn.addEventListener('click', function(){ try{ console.log('[CMASS] addEntryBtn clicked'); createEntryBlock({}); saveDraft(); scheduleServerSave(); }catch(e){ console.warn('add entry failed', e); } }); }
        // delegated fallback: if direct listener didn't attach for some reason, handle clicks at document level
        if (!addBtn) {
          document.addEventListener('click', function(ev){ try{ const a = ev.target.closest && ev.target.closest('#addEntryBtn'); if (!a) return; console.log('[CMASS] delegated addEntryBtn click'); createEntryBlock({}); saveDraft(); scheduleServerSave(); }catch(e){} });
        }
      }catch(e){ }
      // If navigated from report edit action, restore edit payload
      try{
        const params2 = new URLSearchParams(window.location.search || '');
        if (params2.get('edit')){
          const editTxt = localStorage.getItem('meeting:edit');
          if (editTxt){ try{ const obj = JSON.parse(editTxt); if(obj){ // apply to form
                // set top-level fields if available
                try{ if (staffEl && obj.staff) staffEl.value = obj.staff; }catch(e){}
                try{ if (dateEl && obj.date) dateEl.value = obj.date; }catch(e){}
                try{ if (regionEl && obj.region) { regionEl.value = obj.region; populateSchoolSelect(obj.region); } }catch(e){}
                try{ if (schoolEl && obj.school) { const byText = Array.from(schoolEl.options).find(o => (o.textContent||'') === obj.school); if(byText) schoolEl.value = byText.value; else schoolEl.value = obj.school; schoolEl.dispatchEvent(new Event('change',{bubbles:true})); } }catch(e){}
                // apply the entry payload as per-entry blocks
                try{ const container = document.getElementById('entriesContainer'); if(container){ container.innerHTML = ''; if (Array.isArray(obj.entries) && obj.entries.length){ obj.entries.forEach(en => createEntryBlock(en)); } else { createEntryBlock(obj); } } }catch(e){ console.warn('restore edit entries failed', e); }
              } }catch(e){ console.warn('parse meeting:edit failed', e); }
            try{ localStorage.removeItem('meeting:edit'); }catch(e){}
          }
        }
      }catch(e){ console.warn('edit restore flow failed', e); }
    }catch(e){}
  });

  // event wiring (outside DOMContentLoaded)
  function updatePreserveLinks(){
    try{
      const back = document.getElementById('backToInput');
      if(!back) return;
      // Use raw values and let URLSearchParams handle encoding to avoid double-encoding
      const s = (staffEl && staffEl.value||'').trim();
      const d = (dateEl && dateEl.value||'').trim();
      const r = (regionEl && regionEl.value||'').trim();
      const sc = (((schoolEl && schoolEl.selectedOptions && schoolEl.selectedOptions[0] && schoolEl.selectedOptions[0].textContent) || (schoolEl && schoolEl.value) || '')).trim();
      const params = new URLSearchParams();
      if (s) params.set('staff', s);
      if (d) params.set('date', d);
      if (r) params.set('region', r);
      if (sc) params.set('school', sc);
      back.href = '/input.html' + (params.toString() ? ('?' + params.toString()) : '');
      try{ updateDailyReportButton(); }catch(e){}
    }catch(e){}
  }

  // Update the '방문일 보고서' button so it shows the selected date and navigates
  // to report.html?staff=...&date=... when clicked. This keeps the button in sync
  // with the preserved link logic and is safe to call repeatedly.
  function updateDailyReportButton(){
    try{
      const btn = document.getElementById('btnDailyReport');
      if(!btn) return;
      const staffVal = ((staffEl && staffEl.value) || '').trim();
      const dateVal = ((dateEl && dateEl.value) || '').trim();
      const params = new URLSearchParams();
      if (staffVal) params.set('staff', staffVal);
      if (dateVal) params.set('date', dateVal);
      const qs = params.toString();
      const target = '/report.html' + (qs ? ('?' + qs) : '');
      // Update label: use 'YYYY-MM-DD 보고서' when date selected, otherwise fallback label
      try{ btn.textContent = dateVal ? (dateVal + ' 보고서') : '방문일 보고서'; }catch(e){}
      // Replace click handler to navigate to the report URL. If date is missing, warn the user.
      try{ btn.onclick = function(){ if(!dateVal){ alert('방문일을 선택해 주세요.'); try{ if(dateEl && typeof dateEl.focus === 'function') dateEl.focus(); }catch(e){} return; } location.href = target; }; }catch(e){}
      // Also set an accessible href attribute for progressive enhancement (useful if converted to anchor later)
      try{ btn.setAttribute('data-report-href', target); }catch(e){}
    }catch(e){ }
  }

  if (isReal(schoolEl)) schoolEl.addEventListener('change', async ()=>{
    // If we're restoring programmatically, avoid triggering a reload of drafts
    if (_isRestoring) { try{ updateTopline(); }catch(e){} return; }
    try{ saveDraft(); scheduleServerSave(); }catch(e){}
    try{ updateTopline(); }catch(e){}
    try{ updatePreserveLinks(); }catch(e){}
    // Create 5 additional collapsible sessions (so total 6 including the main one)
    try{
      const container = document.getElementById('sessionContainer');
      const tpl = document.getElementById('sessionTemplate');
      if(container && tpl){
        // Ensure the existing main session (first panel) is wrapped in a <details>
        // so it becomes collapsible like the cloned sessions. This makes
        // "미팅내용 1" foldable.
        try{
          // find an existing session panel (meeting-session or section) that is
          // currently a direct child of the container and not already wrapped.
          const existingPanel = container.querySelector('.meeting-session');
          const existingWrap = existingPanel ? existingPanel.closest('details.meeting-session-wrap') : null;
          if (existingPanel && !existingWrap){
            const details = document.createElement('details'); details.className = 'meeting-session-wrap';
            const summary = document.createElement('summary'); summary.textContent = '미팅내용 1';
            // Move the panel node into a new wrapper.
            const panelParent = existingPanel.parentNode;
            // If the panel is already the container's first child, insert at top.
            details.appendChild(summary);
            details.appendChild(existingPanel);
            if (panelParent === container) {
              container.insertBefore(details, container.firstElementChild);
            } else {
              // fallback: append the wrapper so the UI still contains the panel
              container.insertBefore(details, container.firstElementChild);
            }
          }
        }catch(e){}
        for(let i=1;i<=5;i++){
          try{
            const node = tpl.content.firstElementChild.cloneNode(true);
            // label the session
            const title = node.querySelector('.section-title') || node.querySelector('h4');
            if(title) title.textContent = `- 미팅내용 ${i+1} -`;
            // wrap in details for collapse
            const details = document.createElement('details'); details.className = 'meeting-session-wrap';
            const summary = document.createElement('summary'); summary.textContent = `미팅내용 ${i+1}`;
            details.appendChild(summary);
            details.appendChild(node);
            container.appendChild(details);
            // populate subject and activity buttons by cloning texts from top-level grids
            try{
              const subjLabels = Array.from(document.querySelectorAll('#subjects .subject-btn')).map(b=>b.textContent.trim());
              const actLabels = Array.from(document.querySelectorAll('#activities .subject-btn')).map(b=>b.textContent.trim());
              const subjRow = node.querySelector('.session-subjects');
              const actRow = node.querySelector('.session-activities');
              subjLabels.forEach(l => { const b = document.createElement('button'); b.type='button'; b.className='subject-btn'; b.textContent = l; subjRow.appendChild(b); });
              actLabels.forEach(l => { const b = document.createElement('button'); b.type='button'; b.className='subject-btn'; b.textContent = l; actRow.appendChild(b); });
            }catch(e){}
          }catch(e){ console.warn('create session failed', e); }
        }
      }
    }catch(e){}
    // When a user selects a school explicitly, offer to restore any existing
    // local draft for the current staff|date|region|school key. If none exists,
    // fall back to the broader loadDraftForCurrentKey() which may consult server
    // or present other fallback matches.
    try{
      const key = buildKey();
      const txt = localStorage.getItem(key);
      if (txt){
        try{
          const obj = JSON.parse(txt);
          // Only ask to restore if the draft actually contains meaningful content
          const has = (obj && (Array.isArray(obj.subjects) && obj.subjects.length) || (Array.isArray(obj.activities) && obj.activities.length) || (obj.teacher && String(obj.teacher).trim()) || (obj.notes && String(obj.notes).trim()) || (obj.requests && String(obj.requests).trim()) || (obj.duration && Number(obj.duration) > 0) || (obj.durationMin && Number(obj.durationMin) > 0) || (obj.entries && Array.isArray(obj.entries) && obj.entries.length));
          if (has){
            try{ showAskRestoreModal(key, obj); }catch(e){ try{ restoreDraft(); }catch(_){} }
          } else {
            // no meaningful content -> do not prompt; proceed with fallback behavior
            await loadDraftForCurrentKey();
          }
        }catch(e){ debugLog('parse existing draft failed', e && e.message); await loadDraftForCurrentKey(); }
      } else {
        await loadDraftForCurrentKey();
      }
    }catch(e){ debugLog('school change restore check failed', e && e.message); try{ await loadDraftForCurrentKey(); }catch(_){} }
  });

  [staffEl, dateEl].forEach(el=> {
    if (!isReal(el)) return;
    el.addEventListener('input', async ()=>{
      // avoid re-entrant loads while we're restoring
      if (_isRestoring) { try{ updateTopline(); }catch(e){} return; }
      try{ saveDraft(); scheduleServerSave(); }catch(e){}
      try{ updateTopline(); }catch(e){}
      try{ updatePreserveLinks(); }catch(e){}
      // Instead of auto-restoring silently, ask the user if an exact local
      // draft exists for the current staff|date|region|school.
      try{ checkAndPromptRestoreOnCurrentKey(); }catch(e){ await loadDraftForCurrentKey(); }
    });
    // Debug: log counts of key selectors and any overlays we disabled
    try{
      try{
        const keySelectors = ['.entry-favor-btn', '.friend-btn', '#addSubjectBtn', '#addEntryBtn', '#duration', '.entry-subject-btn', '.entry-activity-btn'];
        const counts = keySelectors.map(s => ({ sel: s, count: (document.querySelectorAll(s)||[]).length }));
        console.log('[CMASS_DEBUG] selector counts', JSON.stringify(counts));
        const overlays = Array.from(document.querySelectorAll('[data-_cmass_overlay_disabled="1"]') || []).map(el => ({ id: el.id || null, cls: el.className || null }));
        console.log('[CMASS_DEBUG] disabled overlays', JSON.stringify(overlays));
      }catch(e){ console.warn('[CMASS_DEBUG] selector debug failed', e); }
    }catch(e){}
  });
  // persist last-used date/region/school so other pages can recover if URL lacks params
  try{ if (isReal(dateEl)) dateEl.addEventListener('input', ()=>{ try{ sessionStorage.setItem('cmass:last_date', dateEl.value || ''); }catch(e){} }); }catch(e){}
  try{ if (isReal(regionEl)) regionEl.addEventListener('change', ()=>{ try{ sessionStorage.setItem('cmass:last_region', regionEl.value || ''); }catch(e){} if(!_isRestoring){ saveDraft(); scheduleServerSave(); } updateTopline(); }); }catch(e){}
  try{ if (isReal(schoolEl)) schoolEl.addEventListener('change', ()=>{ try{ const txt = (schoolEl.selectedOptions && schoolEl.selectedOptions[0] && schoolEl.selectedOptions[0].textContent) || schoolEl.value || ''; sessionStorage.setItem('cmass:last_school', txt); }catch(e){} if(!_isRestoring){ saveDraft(); scheduleServerSave(); } updateTopline(); }); }catch(e){}
  // keep preserve links updated when region/school change
  try{ if (isReal(regionEl)) regionEl.addEventListener('change', ()=>{ try{ updatePreserveLinks(); }catch(e){} }); }catch(e){}
  try{ if (isReal(regionEl)) regionEl.addEventListener('change', ()=>{ try{ checkAndPromptRestoreOnCurrentKey(); }catch(e){} }); }catch(e){}
  try{ if (isReal(schoolEl)) schoolEl.addEventListener('change', ()=>{ try{ updatePreserveLinks(); }catch(e){} }); }catch(e){}
  if (isReal(startHourEl)) startHourEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (isReal(startMinEl)) startMinEl.addEventListener('change', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });
  if (isReal(durEl)) durEl.addEventListener('input', ()=>{ computeEndTime(); saveDraft(); scheduleServerSave(); });

  if (isReal(subjectContainer)) subjectContainer.addEventListener('click', (ev)=>{
    const b = ev.target.closest('.subject-btn');
    if(!b) return;
    // enforce single-select for top-level subject buttons: selecting one clears others
    try{
      const peers = Array.from(subjectContainer.querySelectorAll('.subject-btn'));
      const wasActive = b.classList.contains('active');
      // clear all peers
      peers.forEach(p => p.classList.remove('active'));
      // if the clicked button wasn't active, activate it; if it was active, keep none active
      if (!wasActive) b.classList.add('active');
    }catch(e){ /* tolerate */ }
    try{ saveDraft(); scheduleServerSave(); }catch(e){}
  });

  if (isReal(activitiesContainer)) {
    activitiesContainer.addEventListener('click', (ev)=>{
      const b = ev.target.closest('.subject-btn'); if(!b) return; b.classList.toggle('active'); saveDraft(); scheduleServerSave();
    });
  }

  // Top-level favor buttons (좋음/보통/나쁨) single-select behavior
  try{
    // Use delegated click handler so buttons added dynamically are handled
    document.addEventListener('click', function(ev){
      try{
        const btn = ev.target.closest && ev.target.closest('.favor-btn');
        if (!btn) return;
        // debug: log favor button clicks
        try{ console.log('[CMASS_DEBUG] favor-btn clicked:', (btn && btn.textContent && btn.textContent.trim()) || '<unknown>'); }catch(e){}
        // ensure this is not inside an entry (entry-level favors handled separately)
        if (btn.closest && btn.closest('.entry')) return;
        const parent = btn.parentElement || document;
        const peers = Array.from(parent.querySelectorAll('.favor-btn'));
        const wasActive = btn.classList.contains('active');
        peers.forEach(p => p.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
        try{ btn.setAttribute('aria-pressed', wasActive ? 'false' : 'true'); }catch(e){}
        if (!_isRestoring) { try{ saveDraft(); scheduleServerSave(); }catch(e){} }
      }catch(e){ /* tolerate */ }
    });
  }catch(e){}

  // Delegate inputs/clicks inside entries container so per-entry text and button toggles trigger autosave
  const entriesContainer = qs('entriesContainer');
  if (isReal(entriesContainer)) {
    // any input inside entries should schedule a save
    // If _isRestoring is true due to programmatic restore, we still allow
    // user-initiated events (ev.isTrusted) to persist so a stuck flag won't
    // permanently block user input saves.
    entriesContainer.addEventListener('input', (ev)=>{
      try{
        if (!_isRestoring || (ev && ev.isTrusted)) { saveDraft(); scheduleServerSave(); }
      }catch(e){}
    });
    // handle per-entry button toggles (subjects/activities/favors)
    entriesContainer.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('.entry-subject-btn, .entry-activity-btn, .entry-favor-btn');
      if (!btn) return;
      // Single-select within an entry for subject and favor (우호도)
      if (btn.matches('.entry-subject-btn') || btn.matches('.entry-favor-btn')){
        try{
          const entry = btn.closest('.entry') || entriesContainer;
          const groupSelector = btn.matches('.entry-subject-btn') ? '.entry-subject-btn' : '.entry-favor-btn';
          const siblings = Array.from(entry.querySelectorAll(groupSelector));
          const wasActive = btn.classList.contains('active');
          siblings.forEach(s => s.classList.remove('active'));
          if (!wasActive) btn.classList.add('active');
        }catch(e){ /* tolerate */ }
      } else {
        // activity buttons remain multi-select
        btn.classList.toggle('active');
      }
      if(!_isRestoring) { saveDraft(); scheduleServerSave(); }
    });
  }

  // Delegated handlers for session panels (session-subjects, session-activities, session-favor)
  try{
    const sessionContainer = document.getElementById('sessionContainer');
    if(sessionContainer){
      // Clicks: handle subject single-select, activities multi-select, favor single-select
      sessionContainer.addEventListener('click', function(ev){
        try{
          if(!ev || !ev.target) return;
          // find a clicked button (subject/activity/favor) inside the session container
          const btn = ev.target.closest ? ev.target.closest('.subject-btn, .favor-btn') : null;
          if(!btn) return;
          // identify the session panel that contains this button
          const panel = btn.closest('.meeting-session') || btn.closest('.meeting-session-wrap') || btn.closest('section') || sessionContainer;

          // subject buttons (single-select within .session-subjects)
          if (btn.closest && btn.closest('.session-subjects')){
            const peers = Array.from((panel || document).querySelectorAll('.session-subjects .subject-btn'));
            const was = btn.classList.contains('active');
            peers.forEach(p=>p.classList.remove('active'));
            if(!was) btn.classList.add('active');
            try{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } }catch(e){}
            ev.stopPropagation();
            return;
          }

          // activity buttons (multi-select within .session-activities)
          if (btn.closest && btn.closest('.session-activities')){
            btn.classList.toggle('active');
            try{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } }catch(e){}
            ev.stopPropagation();
            return;
          }

          // favor buttons (single-select within .session-favor)
          if (btn.closest && btn.closest('.session-favor')){
            const favPeers = Array.from((panel || document).querySelectorAll('.session-favor .favor-btn'));
            const was = btn.classList.contains('active');
            favPeers.forEach(p=>p.classList.remove('active'));
            if(!was) btn.classList.add('active');
            try{ if(!_isRestoring) { saveDraft(); scheduleServerSave(); } }catch(e){}
            ev.stopPropagation();
            return;
          }
        }catch(e){ /* tolerate */ }
      });

      // Input changes inside sessions should trigger autosave
      sessionContainer.addEventListener('input', function(ev){ try{ if(!_isRestoring || (ev && ev.isTrusted)) { saveDraft(); scheduleServerSave(); } }catch(e){} });
    }
  }catch(e){ console.warn('sessionContainer wiring failed', e); }

  // Top-level singleton groups: subject-choice, friend buttons, duration presets
  try{
    // Global click handler to enforce single-select semantics for top-level button groups.
    // Guard: ignore clicks that occur inside per-entry containers or explicit button grids
    // so we don't interfere with their delegated handlers.
    document.addEventListener('click', function(ev){
      try{
        // If click happened inside an entry or button grid, let the container handlers manage it.
        if (!ev || !ev.target) return;
        if (ev.target.closest('#entriesContainer') || ev.target.closest('.entry') || ev.target.closest('#subjects') || ev.target.closest('#activities') || ev.target.closest('.entry-subjects') || ev.target.closest('.entry-activities') || ev.target.closest('.btn-row')) return;
        const topSingle = ev.target.closest('.subject-choice-btn, .subject-btn, .friend-btn, .duration-btn');
        if (!topSingle) return;
        // determine which group to enforce
        let groupSelector = null;
        if (topSingle.matches('.subject-choice-btn') || topSingle.matches('.subject-btn')) groupSelector = '.subject-choice-btn, .subject-btn';
        else if (topSingle.matches('.friend-btn')) groupSelector = '.friend-btn';
        else if (topSingle.matches('.duration-btn')) groupSelector = '.duration-btn';
        if (!groupSelector) return;
        const parent = topSingle.parentElement || document;
        const peers = Array.from(parent.querySelectorAll(groupSelector));
        const wasActive = topSingle.classList.contains('active');
        // Synchronously enforce single-select: remove active from peers, then set on the clicked one if it wasn't active
        peers.forEach(p => { p.classList.remove('active'); try{ p.setAttribute('aria-pressed','false'); p.dataset.cmassActive = '0'; }catch(e){} });
        if (!wasActive) {
          try{ topSingle.classList.add('active'); topSingle.setAttribute('aria-pressed','true'); topSingle.dataset.cmassActive = '1'; }catch(e){}
        }
        // Persist selection immediately (allow user-initiated events even if _isRestoring)
        try{ if (!_isRestoring) { saveDraft(); scheduleServerSave(); } else if (ev.isTrusted) { saveDraft(); scheduleServerSave(); } }catch(e){}
      }catch(e){ /* ignore handler errors */ }
    });
  }catch(e){}

  if (isReal(btnCopy)) btnCopy.addEventListener('click', async ()=>{
    const txt = formatForCopy();
    try{ await navigator.clipboard.writeText(txt); alert('클립보드에 복사되었습니다.'); }catch(e){ alert('복사 실패: '+e.message); }
  });

  if (isReal(btnSaveServer)) btnSaveServer.addEventListener('click', async ()=>{ await saveToServer(); });

  // Submit: do NOT send to server automatically. Only save locally and navigate.
  if (isReal(btnSubmit)) btnSubmit.addEventListener('click', async ()=>{
    // Ensure required fields (staff, date) are present for report grouping.
    saveDraft();
    try{
      const form = gatherForm();
      // fallback to session/local stored values if form lacks them
      if (!form.staff || !form.staff.trim()) {
        try{ form.staff = sessionStorage.getItem('cmass:last_staff') || localStorage.getItem('cmass:staff') || (staffEl && staffEl.value) || ''; }catch(e){}
      }
      if (!form.date || !form.date.trim()) {
        try{ form.date = (dateEl && dateEl.value) || sessionStorage.getItem('cmass:last_date') || ''; }catch(e){}
      }
      if (!form.date) {
        alert('방문일을 선택해 주세요.');
        try{ if (dateEl && typeof dateEl.focus === 'function') dateEl.focus(); }catch(e){}
        return;
      }
      if (!form.staff) {
        alert('담당자 이름이 필요합니다.');
        try{ if (staffEl && typeof staffEl.focus === 'function') staffEl.focus(); }catch(e){}
        return;
      }
      try{ appendToDailyReport(form); }catch(e){ console.warn('append report failed', e); }
  // Use URLSearchParams to build the target querystring (single encoding pass)
  const params = new URLSearchParams();
  if (form.staff && String(form.staff).trim()) params.set('staff', String(form.staff).trim());
  if (form.date && String(form.date).trim()) params.set('date', String(form.date).trim());
      // persist last-used values for report page convenience
      try{ sessionStorage.setItem('cmass:last_date', form.date); }catch(e){}
      try{ localStorage.setItem('cmass:staff', form.staff); }catch(e){}
      // update preserve links before navigating
      try{ updatePreserveLinks(); }catch(e){}
  location.href = '/report.html' + (params.toString() ? ('?' + params.toString()) : '');
    }catch(e){ console.warn('submit handler failed', e); alert('입력 중 오류가 발생했습니다. 다시 시도해주세요.'); }
  });

  function reportKeyFor(staff, date){
    return `report:${(staff||'').trim()}|${(date||'').trim()}`;
  }

  function appendToDailyReport(entry){
    const staff = (entry.staff||'').trim();
    // Accept either date or visitDate (some code paths populate visitDate)
    const date = (entry.date || entry.visitDate || '').trim();
    if(!staff || !date) return;
    const key = reportKeyFor(staff,date);
    let arr = [];
    try{ arr = JSON.parse(localStorage.getItem(key) || '[]') || []; }catch(e){ arr = []; }
    // ensure stored entry has a normalized date field for later retrieval
    const toStore = Object.assign({}, entry, { date: date, visitDate: date, savedAt: new Date().toISOString() });
    arr.push(toStore);
    try{ 
      localStorage.setItem(key, JSON.stringify(arr)); 
      // Diagnostic: remember the last saved report key/count for easier troubleshooting across pages
      try{ localStorage.setItem('meeting:lastSavedReportKey', key); }catch(e){}
      try{ localStorage.setItem('meeting:lastSavedReportCount', String((arr && arr.length) || 0)); }catch(e){}
      try{ console.log('[CMASS_SAVE] appended to', key, 'count', (arr && arr.length) || 0, 'entry=', entry); }catch(e){}
    }catch(e){ console.warn('failed to save report', e); }
  }

  if (isReal(btnBack)) btnBack.addEventListener('click', ()=>{
    try{
      // Do not pre-encode values; URLSearchParams will handle encoding.
      const staffVal = ((staffEl && staffEl.value) || '').trim();
      const dateVal = ((dateEl && dateEl.value) || '').trim();
      const params = new URLSearchParams();
      if (staffVal) params.set('staff', staffVal);
      if (dateVal) params.set('date', dateVal);
      const qs = params.toString();
      const target = '/input' + (qs ? ('?' + qs) : '');
      location.href = target;
    }catch(e){ try{ location.href = '/input'; }catch(e2){ } }
  });

  try{
    // Remove duplicate event wiring for topline update
  }catch(e){}

  try{ if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') window.addEventListener('load', computeEndTime); }catch(e){}

  // Function to add a new meeting entry dynamically
// ...existing code...
})();
// Mobile touch / click smoke-test instrumentation
(function addMobileTouchDebug(){
  try{
    // install a small flash style for tapped elements
    const st = document.createElement('style');
    st.textContent = '.cmass-touch-flash{outline:3px solid rgba(255,165,0,0.95)!important;box-shadow:0 0 10px rgba(255,165,0,0.6)!important;border-radius:6px!important;}';
    try{ (document.head || document.documentElement).appendChild(st); }catch(e){}

    document.addEventListener('touchstart', function(ev){
      try{
        const t = ev.target;
        const btn = (t && t.closest) ? t.closest('.subject-btn, .favor-btn, .dur-btn, button, .entry-favor-btn, .entry-subject-btn, .entry-activity-btn') : null;
        if (!btn) return;
        btn.classList.add('cmass-touch-flash');
        try{ console.log('[CMASS_MOBILE] touchstart on', (btn.id||btn.className|| (btn.textContent||'')).toString().trim()); }catch(e){}
        setTimeout(()=>{ try{ btn.classList.remove('cmass-touch-flash'); }catch(e){} }, 300);
      }catch(e){}
    }, { passive: true });

    // Also log clicks (for browsers that synthesize click from touch)
    document.addEventListener('click', function(ev){
      try{
        const t = ev.target;
        const btn = (t && t.closest) ? t.closest('.subject-btn, .favor-btn, .dur-btn, button, .entry-favor-btn, .entry-subject-btn') : null;
        if (!btn) return;
        try{ console.log('[CMASS_MOBILE] click on', (btn.id||btn.className|| (btn.textContent||'')).toString().trim()); }catch(e){}
      }catch(e){}
    }, true);
  }catch(e){}
})();

