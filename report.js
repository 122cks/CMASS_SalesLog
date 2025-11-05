// report.js - render saved report entries from localStorage
(function(){
  function qs(k){ return new URLSearchParams(window.location.search || '').get(k) || ''; }
  function el(id){ return document.getElementById(id); }
  const staff = qs('staff') || (localStorage.getItem('cmass:staff')||'');
  // date: prefer explicit ?date= param, then previously stored report-specific date,
  // then fall back to the meeting page's last_date (for compatibility with meeting.js),
  // then finally localStorage values if present.
  const date = qs('date') || (sessionStorage.getItem('cmass:last_report_date') || sessionStorage.getItem('cmass:last_date') || localStorage.getItem('cmass:last_date') || '');
  const key = `report:${(staff||'').trim()}|${(date||'').trim()}`;
  // Diagnostic: expose computed key and raw stored value to console for troubleshooting
  try{
    console.log('[REPORT_DEBUG] computedKey=', key);
    try{ const raw = localStorage.getItem(key); console.log('[REPORT_DEBUG] localStorage.getItem(key)=', raw ? ('(len:'+raw.length+')') : raw); }catch(e){}
  }catch(e){}
  // fallback prefix used by older meeting history entries
  const HIST_PREFIX = (window && window.HIST_PREFIX) || 'meeting:history:';

  function renderEntry(e, idx){
    const div = document.createElement('div');
    div.className = 'entry';
    const title = document.createElement('div');
    title.innerHTML = `<strong>${e.school || ''}</strong> &nbsp; <span class="muted">${e.visitStart || e.startTime || ''} - ${e.visitEnd || e.endTime || ''} (${e.duration || e.durationMin || 0}분)</span>`;
    div.appendChild(title);
    const body = document.createElement('div');
    body.style.marginTop = '6px';
    const parts = [];
    if(e.subjects && e.subjects.length) parts.push('<strong>과목:</strong> ' + e.subjects.join(', '));
    if(e.activities && e.activities.length) parts.push('<strong>활동:</strong> ' + e.activities.join(', '));
    if(e.favor) parts.push('<strong>우호도:</strong> ' + e.favor);
    if(e.teacher) parts.push('<strong>선생님:</strong> ' + e.teacher);
    if(e.publisher) parts.push('<strong>출판사:</strong> ' + e.publisher);
    if(e.requests) parts.push('<strong>요청:</strong> ' + e.requests);
    if(e.notes) parts.push('<strong>특이사항:</strong> ' + e.notes);
    if(e.deliveries) parts.push('<strong>납품:</strong> ' + e.deliveries);
    // If structured sessions exist, render them as numbered subsections
    if (Array.isArray(e.sessions) && e.sessions.length) {
      const sessHtml = e.sessions.map((s, si) => {
        const sParts = [];
        if (Array.isArray(s.subjects) && s.subjects.length) sParts.push('<strong>과목:</strong> ' + s.subjects.join(', '));
        if (Array.isArray(s.activities) && s.activities.length) sParts.push('<strong>활동:</strong> ' + s.activities.join(', '));
        if (s.favor) sParts.push('<strong>우호도:</strong> ' + s.favor);
        if (s.teacher) sParts.push('<strong>선생님:</strong> ' + s.teacher);
        if (s.publisher) sParts.push('<strong>출판사:</strong> ' + s.publisher);
        if (s.requests) sParts.push('<strong>요청:</strong> ' + s.requests);
        if (s.notes) sParts.push('<strong>특이사항:</strong> ' + s.notes);
        if (s.deliveries) sParts.push('<strong>납품:</strong> ' + s.deliveries);
        if (s.followUp) sParts.push('<strong>후속조치:</strong> ' + s.followUp);
        return `<div style="margin-top:6px"><strong>세션 ${si+1}.</strong> ${sParts.join('<br>')}</div>`;
      }).join('');
      parts.push(`<div style="margin-top:8px"><strong>세션:</strong>${sessHtml}</div>`);
    }
    body.innerHTML = parts.join('<br>');
    div.appendChild(body);
    const footer = document.createElement('div');
    footer.className = 'muted';
    footer.style.marginTop = '8px';
    footer.textContent = `저장일시: ${e.savedAt || e._savedAt || ''} · 담당자: ${e.staff || ''}`;
    // delete button
    try{
      // Edit button
      const edit = document.createElement('button'); edit.type = 'button'; edit.textContent = '수정'; edit.style.marginLeft = '8px'; edit.style.borderColor = '#d6e8f0'; edit.style.color = '#0a5'; edit.addEventListener('click', function(){
        try{
          // Store the entry to be edited and navigate to meeting page
          try{ localStorage.setItem('meeting:edit', JSON.stringify(e)); }catch(err){ console.warn('failed to set meeting:edit', err); }
          // Pass raw values to URLSearchParams so encoding is handled once
          const s = ((e.staff || staff || '').trim());
          const d = ((e.date || date || '').trim());
          const params = new URLSearchParams(); if (s) params.set('staff', s); if (d) params.set('date', d);
          if (e.region) params.set('region', e.region);
          if (e.school) params.set('school', e.school);
          params.set('edit', '1');
          const qs = params.toString();
          location.href = '/meeting.html' + (qs ? ('?' + qs) : '');
        }catch(err){ console.warn('edit click failed', err); }
      });
      footer.appendChild(edit);
      const del = document.createElement('button'); del.type = 'button'; del.textContent = '삭제'; del.style.marginLeft = '8px'; del.style.borderColor = '#f0dede'; del.style.color = '#c33'; del.addEventListener('click', function(){ showDeleteConfirm(idx); });
      footer.appendChild(del);
    }catch(e){ }
    div.appendChild(footer);
    return div;
  }

  // Show confirmation modal before deleting an entry
  function showDeleteConfirm(index){
    try{
      const useDate = date;
      const useStaff = staff || '';
      if (!useDate) { alert('삭제할 방문일이 없습니다.'); return; }
      const reportKey = `report:${(useStaff||'').trim()}|${(useDate||'').trim()}`;
      const txt = localStorage.getItem(reportKey);
      if (!txt) { alert('저장된 보고서가 없습니다.'); return; }
      const arr = JSON.parse(txt) || [];
      if (index < 0 || index >= arr.length) { alert('잘못된 항목입니다.'); return; }
      if (!confirm('선택한 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
      arr.splice(index, 1);
      localStorage.setItem(reportKey, JSON.stringify(arr));
      // reload page to reflect changes
      window.location.reload();
    }catch(e){ console.warn('delete entry failed', e); alert('삭제 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
  }

  // compute summary: build `schools` map either from report:${staff}|${date} or fallback to meeting history
  const schools = {};
  try{
    const reportTxt = localStorage.getItem(key);
    if (reportTxt){
      const arr = JSON.parse(reportTxt) || [];
      arr.forEach(item => {
        const schoolName = item.school || '(학교명 없음)';
        if (!schools[schoolName]) schools[schoolName] = { region: item.region || '', entries: [] };
        schools[schoolName].entries.push(item);
      });
    } else {
      // fallback to old meeting:history keys
      const prefix = HIST_PREFIX + date + '|';
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (!k || typeof k !== 'string') continue;
        if (k.indexOf(prefix) !== 0) continue;
        const tail = k.slice(prefix.length);
        const parts = tail.split('|');
        const region = parts[0] || '';
        const school = parts.slice(1).join('|') || '(학교명 없음)';
        try{
          const arr = JSON.parse(localStorage.getItem(k) || '[]') || [];
          if (!schools[school]) schools[school] = { region: region, entries: [] };
          arr.forEach(snap => {
            if (snap && Array.isArray(snap.entries) && snap.entries.length){
              snap.entries.forEach(ent => { const e = Object.assign({}, ent); e.school = snap.school || school || ''; e.region = region; schools[school].entries.push(e); });
            } else if (snap){
              const e = { subjects: snap.subjects || '', activities: snap.activities || '', teacher: snap.teacher || '', publisher: snap.publisher || '', phone: snap.phone || '', email: snap.email || '', requests: snap.requests || '', notes: snap.notes || '', deliveries: snap.deliveries || '', followUp: snap.followUp || '', start: snap.start || '', endTime: snap.endTime || '', duration: snap.duration || '', school: snap.school || school || '', region: region };
              schools[school].entries.push(e);
            }
          });
        }catch(e){ /* ignore malformed entry */ }
      }
    }
  }catch(e){ console.warn('compute summary build failed', e); }

  const schoolNames = Object.keys(schools).sort();
  let totalMeetings = 0, contactCount = 0, addSelectCount = 0;
  const subjCounts = {};
  let earliest = null, latest = null;
  const revisit = [];

  schoolNames.forEach(school => {
    const entries = schools[school].entries || [];
    if (entries.length > 1) revisit.push(school);
    totalMeetings += entries.length;
    entries.forEach(ent => {
      if ((ent.phone||'').trim() || (ent.email||'').trim()) contactCount++;
      if (ent.followUp && /선정/.test(ent.followUp)) addSelectCount++;
      const subs = String(ent.subjects||'').split(/,\s*/).filter(Boolean);
      subs.forEach(s => subjCounts[s] = (subjCounts[s]||0)+1);
      // times
      if (ent.start){ if (!earliest || ent.start < earliest) earliest = ent.start; }
      if (ent.endTime){ if (!latest || ent.endTime > latest) latest = ent.endTime; }
    });
  });

  // render summary
  const summaryHtml = `\n  <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">\n    <div class="pill">방문일: <strong>${date}</strong></div>\n    <div class="pill">총 방문 학교: <strong>${schoolNames.length}개</strong></div>\n    <div class="pill">총 미팅수: <strong>${totalMeetings}건</strong></div>\n    <div class="pill">연락처 확보: <strong>${contactCount}건</strong></div>\n    <div class="pill">추가선정 확인: <strong>${addSelectCount}건</strong></div>\n  </div>`;
  try{ const summaryEl = el('summary'); if (summaryEl) summaryEl.innerHTML = summaryHtml; }catch(e){ console.warn('failed to render summary', e); }

  // group by school
  const groupedEl = el('grouped');
  if (schoolNames.length === 0){ groupedEl.innerHTML = '<p class="muted">해당 일자의 기록이 없습니다.</p>'; }
  else{
    let html = '';
    schoolNames.forEach((school, si)=>{
      const info = schools[school];
      const entries = info.entries || [];
      // compute school's time range and total minutes
      let sEar=null, sLat=null, sTotal=0;
      entries.forEach(e => { if (e.start){ if (!sEar||e.start<sEar) sEar=e.start; } if (e.endTime){ if (!sLat||e.endTime>sLat) sLat=e.endTime; } sTotal += parseInt(e.duration||0,10)||0; });
      html += `<div class="entry"><div class="school-title">${school || '(학교명 없음)'}</div>`;
      if (info.region) html += `<div class="muted">${info.region}</div>`;
      html += `<div style="margin-top:6px" class="muted">${sEar? (sEar + ' ~ ' + (sLat||'')) : ''} (${sTotal}분)</div>`;
      entries.forEach((it, idx) => {
        // If structured sessions exist, render each session with its details
  // wrap each entry so we can attach edit/delete buttons after rendering
  const savedAtAttr = encodeURIComponent(String(it.savedAt || it._savedAt || ''));
  const startAttr = encodeURIComponent(String(it.start || it.visitStart || it.startTime || ''));
  html += `<div class="grouped-entry" data-saved-at="${savedAtAttr}" data-school="${encodeURIComponent(String(it.school||''))}" data-start="${startAttr}">`;
  if (Array.isArray(it.sessions) && it.sessions.length) {
          html += `<div style="margin-top:8px"><strong>${idx+1}.</strong> ${it.start || ''} ${it.endTime?('~'+it.endTime):''} (${it.duration||0}분)</div>`;
          it.sessions.forEach((s, si) => {
            const sSubs = Array.isArray(s.subjects) ? s.subjects.join(', ') : (s.subjects || '');
            const sActs = Array.isArray(s.activities) ? s.activities.join(', ') : (s.activities || '');
            html += `<div style="margin-left:12px;margin-top:6px"><strong>세션 ${si+1}.</strong> <span class="muted">${sSubs}</span></div>`;
            if (sActs) html += `<div class="muted" style="margin-left:12px">영업활동: ${sActs}</div>`;
            html += `<div style="margin-left:12px">선생님: ${s.teacher || '-'} · 출판사: ${s.publisher || '-'} · 연락처: ${s.phone || s.email || '-'}</div>`;
            if (s.requests) html += `<div style="margin-left:12px">요청: ${s.requests}</div>`;
            if (s.deliveries) html += `<div style="margin-left:12px">납품: ${s.deliveries}</div>`;
            if (s.followUp) html += `<div style="margin-left:12px">후속조치: ${s.followUp}</div>`;
          });
        } else {
          const subs = it.subjects || '';
          const acts = it.activities || '';
          html += `<div style="margin-top:8px"><strong>${idx+1}.</strong> ${it.start || ''} ${it.endTime?('~'+it.endTime):''} (${it.duration||0}분) <span class="muted">${subs}</span></div>`;
          if (acts) html += `<div class="muted">영업활동: ${acts}</div>`;
          html += `<div>선생님: ${it.teacher || '-'} · 출판사: ${it.publisher || '-' } · 연락처: ${it.phone || it.email || '-'}</div>`;
          if (it.requests) html += `<div>요청: ${it.requests}</div>`;
          if (it.deliveries) html += `<div>납품: ${it.deliveries}</div>`;
          if (it.followUp) html += `<div>후속조치: ${it.followUp}</div>`;
        }
        html += `</div>`; // end grouped-entry
      });
      html += `</div>`;
    });
    groupedEl.innerHTML = html;
  // After injecting grouped HTML, attach Edit/Delete buttons for each grouped entry
  try{ attachGroupedEntryButtons(key); }catch(e){ console.warn('attachGroupedEntryButtons failed', e); }
    setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, document.body.scrollHeight); } }, 30);
  }

  // Build the long formatted report text (copy target)
  function minutesBetween(startStr, endStr){
    try{
      const [sh, sm] = String(startStr||'').split(':').map(s=>parseInt(s||'0',10)||0);
      const [eh, em] = String(endStr||'').split(':').map(s=>parseInt(s||'0',10)||0);
      const smin = sh*60 + sm; const emin = eh*60 + em; let diff = emin - smin; if (diff < 0) diff += 24*60; return diff;
    }catch(e){return 0}
  }

  function minutesToHM(mins){
    try{ mins = Number(mins)||0; const h = Math.floor(mins/60); const m = mins%60; return `${h}시간 ${m}분`; }catch(e){ return '0시간 0분'; }
  }

  function buildReportText(dateParam, staffParam){
    // Prefer the consolidated report:${staff}|${date} array if present (this is what the UI renders)
    const useDate = dateParam || date;
    const useStaff = staffParam || staff || '';
    if (!useDate) return null;
    const reportKey = `report:${(useStaff||'').trim()}|${(useDate||'').trim()}`;
    try{
      const txt = localStorage.getItem(reportKey);
      if (txt){
        const arr = JSON.parse(txt) || [];
        // build a readable aggregated text in the requested format
        try{
          let out = '';
          out += `(${useStaff} 퇴근보고)\n`;
          out += `방문일: ${useDate}\n`;
          out += `총 방문 학교: ${arr.length}개 총 미팅수: ${arr.length}건\n`;
          // compute contact count and add select count
          let contactCount = 0; let addSelectCount = 0; let totalMeetDur = 0; let earliestLocal = null; let latestLocal = null;
          arr.forEach(it=>{
            if ((it.phone||'').trim() || (it.email||'').trim()) contactCount++;
            if (it.followUp && /선정/.test(it.followUp)) addSelectCount++;
            const dur = Number(it.duration || it.durationMin || 0) || 0; totalMeetDur += dur;
            const s = it.start || it.visitStart || it.startTime || ''; if (s){ if (!earliestLocal || s < earliestLocal) earliestLocal = s; }
            const e = it.endTime || it.visitEnd || ''; if (e){ if (!latestLocal || e > latestLocal) latestLocal = e; }
          });
          out += `연락처 확보: ${contactCount}건 추가선정 확인: ${addSelectCount}건\n\n`;

          // determine work start/end defaults from earliest/latest if available
          const metaKey = `report:meta:${(useStaff||'').trim()}|${(useDate||'').trim()}`;
          let meta = {};
          try{ meta = JSON.parse(localStorage.getItem(metaKey) || '{}') || {}; }catch(e){ meta = {}; }
          const workStart = meta.workStart || earliestLocal || '';
          const workEnd = meta.workEnd || latestLocal || '';
          const workMinutes = (workStart && workEnd) ? minutesBetween(workStart, workEnd) : 0;
          const officeMinutes = (typeof meta.officeMinutes !== 'undefined') ? Number(meta.officeMinutes) : Math.max(0, workMinutes - totalMeetDur);
          const prepMinutes = (typeof meta.prepMinutes !== 'undefined') ? Number(meta.prepMinutes) : 0;

          out += `1. 출근 ${workStart || '--:--'} 퇴근 ${workEnd || '--:--'} (근무시간 ${workMinutes}분)\n   사무실내근 ${officeMinutes}분\n\n`;
          out += `2. 세부업무\n\n`;

          // per-school lines
          arr.forEach((it, idx) => {
            const hangul = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하'];
            const label = hangul[idx] ? (hangul[idx] + '.') : ((idx+1) + '.');
            const sName = it.school || '(학교명 없음)';
            const sStart = it.visitStart || it.start || '';
            const sDur = Number(it.duration||it.durationMin||0)||0;
            out += `${label} ${sName}  ${sStart} (${sDur}분)\n`;
            if (Array.isArray(it.sessions) && it.sessions.length){
              it.sessions.forEach((s, si) => {
                const subj = Array.isArray(s.subjects)? s.subjects.join(', '): (s.subjects||'');
                const acts = Array.isArray(s.activities)? s.activities.join(', '): (s.activities||'');
                out += `   - 미팅내용 ${si+1} 과목: ${subj} 활동: ${acts}\n`;
              });
            } else {
              const subj = Array.isArray(it.subjects)? it.subjects.join(', '): (it.subjects||'');
              const acts = Array.isArray(it.activities)? it.activities.join(', '): (it.activities||'');
              out += `   - 미팅내용 1 과목: ${subj} 활동: ${acts}\n`;
            }
            out += '\n';
          });
          out += `3. 퇴근보고 자료정리 (${prepMinutes}분)\n\n- 끝.\n`;
          return out;
        }catch(e){ console.warn('buildReportText formatted build failed', e); return null; }
      }
    }catch(e){ console.warn('buildReportText parse reportKey failed', e); }

    // Fallback: try older meeting history format (meeting:history:DATE|region|school)
    try{
      const prefix = HIST_PREFIX + useDate + '|';
      const schoolsLocal = {};
      for (let i=0;i<localStorage.length;i++){
        const k = localStorage.key(i);
        if (!k || typeof k !== 'string') continue;
        if (k.indexOf(prefix) !== 0) continue;
        const tail = k.slice(prefix.length);
        const parts = tail.split('|');
        const region = parts[0] || '';
        const school = parts.slice(1).join('|') || '';
        const arr = JSON.parse(localStorage.getItem(k) || '[]') || [];
        if (!schoolsLocal[school]) schoolsLocal[school] = { region: region, entries: [] };
        arr.forEach(snap => {
          if (snap && Array.isArray(snap.entries) && snap.entries.length){
            snap.entries.forEach(ent => { const e = Object.assign({}, ent); e.school = snap.school || school || ''; e.region = region; schoolsLocal[school].entries.push(e); });
          } else if (snap){
            const e = { subjects: snap.subjects || '', activities: snap.activities || '', teacher: snap.teacher || '', publisher: snap.publisher || '', phone: snap.phone || '', email: snap.email || '', requests: snap.requests || '', notes: snap.notes || '', deliveries: snap.deliveries || '', followUp: snap.followUp || '', start: snap.start || '', endTime: snap.endTime || '', duration: snap.duration || '', school: snap.school || school || '', region: region };
            schoolsLocal[school].entries.push(e);
          }
        });
      }
      const schoolNamesLocal = Object.keys(schoolsLocal).sort();
      if (schoolNamesLocal.length === 0) return null;
      let out = '';
      out += `(${useStaff} 퇴근보고)\n`;
      out += `방문일: ${useDate}\n`;
      schoolNamesLocal.forEach((s, idx) => {
        const info = schoolsLocal[s];
        out += `${idx+1}. ${s} (${info.region||''})\n`;
        (info.entries||[]).forEach((e, j)=>{
          out += `   - ${e.start||''}${e.endTime?('~'+e.endTime):''} ${Array.isArray(e.subjects)? e.subjects.join(', '): (e.subjects||'')} (${e.duration||0}분)\n`;
        });
        out += `\n`;
      });
      out += `- 끝.\n`;
      return out;
    }catch(e){ console.warn('buildReportText fallback failed', e); return null; }
  }

  async function copyToClipboard(text){
    try{
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); return true; }
      else { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); return true; }
    }catch(e){ console.warn('copy failed', e); return false; }
  }

  // Attach Edit/Delete buttons to grouped entries by matching them to the
  // canonical report array stored under `report:${staff}|${date}`.
  function attachGroupedEntryButtons(reportKey){
    try{
      const container = document.getElementById('grouped');
      if(!container) return;
      const txt = localStorage.getItem(reportKey);
      if(!txt) return;
      const arr = JSON.parse(txt) || [];
      const nodes = Array.from(container.querySelectorAll('.grouped-entry'));
      nodes.forEach(node => {
        try{
          // if buttons already attached, skip
          if (node.dataset._actionsAttached === '1') return;
          const savedAt = decodeURIComponent(node.getAttribute('data-saved-at') || '');
          const school = decodeURIComponent(node.getAttribute('data-school') || '');
          const start = decodeURIComponent(node.getAttribute('data-start') || '');
          // find best matching index in the report array
          let foundIdx = -1;
          for (let i=0;i<arr.length;i++){
            const it = arr[i] || {};
            const itSaved = String(it.savedAt || it._savedAt || '');
            const itSchool = String(it.school || '');
            const itStart = String(it.start || it.visitStart || it.startTime || '');
            if (savedAt && itSaved && savedAt === itSaved){ foundIdx = i; break; }
            // fallback: match school + start + duration if savedAt not available
            if (!savedAt && itSchool === school && (itStart === start || (!itStart && !start))){ foundIdx = i; break; }
          }
          // create action container
          const actions = document.createElement('div'); actions.style.marginTop = '8px'; actions.style.display = 'flex'; actions.style.gap = '8px';
          const editBtn = document.createElement('button'); editBtn.type='button'; editBtn.textContent='수정'; editBtn.style.marginLeft='8px'; editBtn.style.borderColor='#d6e8f0'; editBtn.style.color='#0a5';
          editBtn.addEventListener('click', function(){
            try{
              if (foundIdx < 0) { alert('편집할 항목을 찾을 수 없습니다.'); return; }
              // store the entry to be edited and navigate to meeting page
              try{ localStorage.setItem('meeting:edit', JSON.stringify(arr[foundIdx])); }catch(err){ console.warn('failed to set meeting:edit', err); }
              const s = ((arr[foundIdx].staff || staff || '').trim());
              const d = ((arr[foundIdx].date || date || '').trim());
              const params = new URLSearchParams(); if (s) params.set('staff', s); if (d) params.set('date', d);
              if (arr[foundIdx].region) params.set('region', arr[foundIdx].region);
              if (arr[foundIdx].school) params.set('school', arr[foundIdx].school);
              params.set('edit','1');
              const qs = params.toString();
              location.href = '/meeting.html' + (qs ? ('?' + qs) : '');
            }catch(e){ console.warn('grouped edit failed', e); }
          });
          const delBtn = document.createElement('button'); delBtn.type='button'; delBtn.textContent='삭제'; delBtn.style.marginLeft='8px'; delBtn.style.borderColor='#f0dede'; delBtn.style.color='#c33';
          delBtn.addEventListener('click', function(){
            try{
              if (foundIdx < 0) { alert('삭제할 항목을 찾을 수 없습니다.'); return; }
              if (!confirm('선택한 항목을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
              arr.splice(foundIdx,1);
              localStorage.setItem(reportKey, JSON.stringify(arr));
              window.location.reload();
            }catch(e){ console.warn('grouped delete failed', e); alert('삭제 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
          });
          actions.appendChild(editBtn); actions.appendChild(delBtn);
          node.appendChild(actions);
          node.dataset._actionsAttached = '1';
        }catch(e){ }
      });
    }catch(e){ console.warn('attachGroupedEntryButtons top-level failed', e); }
  }

  async function saveReportToServer(text, dateParam){
    try{
      const staffName = staff || '';
      // build a compact payload describing the aggregated report
      const payload = {
        staff: staffName,
        region: '',
        school: `(퇴근보고 ${dateParam || date})`,
        subjects: [],
        activities: [],
        teacher: '',
        publisher: '',
        contact: '',
        ask: '',
        conversation: text,
        delivery: '',
        followUp: '',
        visitDate: dateParam || date,
        visitStart: '',
        duration: 0,
        visitEnd: ''
      };
      const resp = await fetch('/save-meeting', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) throw new Error('서버 응답 오류 ' + resp.status);
      const j = await resp.json();
      return j;
    }catch(e){ console.error('saveReportToServer failed', e); throw e; }
  }

  // Attach handlers for report buttons
  document.addEventListener('DOMContentLoaded', function(){
    // populate work meta inputs (work start/end, officeMinutes, prepMinutes)
    try{
      const workStartEl = document.getElementById('workStart');
      const workEndEl = document.getElementById('workEnd');
      const officeEl = document.getElementById('officeMinutes');
      const prepEl = document.getElementById('prepMinutes');
      const metaKey = `report:meta:${(staff||'').trim()}|${(date||'').trim()}`;
      let meta = {};
      try{ meta = JSON.parse(localStorage.getItem(metaKey) || '{}') || {}; }catch(e){ meta = {}; }
      // defaults: try to compute earliest/latest from grouped entries already rendered
      try{
        // compute earliest/latest from localStorage report array if present
        const reportTxt = localStorage.getItem(key);
        let arr = [];
        if (reportTxt) arr = JSON.parse(reportTxt) || [];
        let earliestLocal = meta.workStart || '';
        let latestLocal = meta.workEnd || '';
        arr.forEach(it => { const s = it.visitStart || it.start || it.startTime || ''; const e = it.visitEnd || it.endTime || ''; if(s && (!earliestLocal || s < earliestLocal)) earliestLocal = s; if(e && (!latestLocal || e > latestLocal)) latestLocal = e; });
        if (workStartEl) workStartEl.value = meta.workStart || earliestLocal || '';
        if (workEndEl) workEndEl.value = meta.workEnd || latestLocal || '';
        // compute defaults for officeMinutes and prepMinutes
        let totalMeetDur = 0; arr.forEach(it=> totalMeetDur += Number(it.duration||it.durationMin||0)||0);
        const workMinutes = (workStartEl && workEndEl && workStartEl.value && workEndEl.value) ? minutesBetween(workStartEl.value, workEndEl.value) : 0;
        if (officeEl) officeEl.value = (typeof meta.officeMinutes !== 'undefined') ? meta.officeMinutes : Math.max(0, workMinutes - totalMeetDur);
        if (prepEl) prepEl.value = (typeof meta.prepMinutes !== 'undefined') ? meta.prepMinutes : 0;
        // save changes when user edits fields
        const saveMeta = () => {
          try{
            const nm = { workStart: (workStartEl && workStartEl.value)||'', workEnd: (workEndEl && workEndEl.value)||'', officeMinutes: Number((officeEl && officeEl.value)||0)||0, prepMinutes: Number((prepEl && prepEl.value)||0)||0 };
            localStorage.setItem(metaKey, JSON.stringify(nm));
          }catch(e){ console.warn('save meta failed', e); }
        };
        if (workStartEl) workStartEl.addEventListener('change', saveMeta);
        if (workEndEl) workEndEl.addEventListener('change', saveMeta);
        if (officeEl) officeEl.addEventListener('input', saveMeta);
        if (prepEl) prepEl.addEventListener('input', saveMeta);
      }catch(e){ console.warn('populate meta inputs failed', e); }
    }catch(e){ /* ignore */ }
    const copyBtn = document.getElementById('btnCopyReport');
    if (copyBtn){ copyBtn.addEventListener('click', async function(){ const txt = buildReportText(date, staff); if (!txt) { alert('방문일을 선택하세요.'); return; } const ok = await copyToClipboard(txt); if (ok) alert('퇴근보고 요약이 클립보드에 복사되었습니다. 카톡방에 붙여넣어 전송하세요.'); else alert('클립보드 복사에 실패했습니다.'); }); }

    const saveBtn = document.getElementById('btnSaveServerReport');
    if (saveBtn){ saveBtn.addEventListener('click', async function(){ const txt = buildReportText(date, staff); if (!txt){ alert('방문일을 선택하세요.'); return; } if (!confirm('이 방문일의 누적보고(요약)를 서버에 저장하시겠습니까?')) return; try{ const res = await saveReportToServer(txt, date); alert('서버에 저장되었습니다. id: ' + (res && res.id)); }catch(e){ alert('서버 저장에 실패했습니다. 콘솔을 확인하세요.'); } }); }
    const clearSummaryBtn = document.getElementById('btnClearSummary');
    if (clearSummaryBtn){
      clearSummaryBtn.addEventListener('click', function(){
        if (!confirm('SUMMARY를 모두 지우시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
        try{ localStorage.removeItem('meeting:summaries'); alert('SUMMARY가 삭제되었습니다.'); window.location.reload(); }catch(e){ alert('삭제 중 오류가 발생했습니다. 콘솔을 확인하세요.'); }
      });
    }
    // Keep staff and date in the back link so returning to meeting preserves values
    try{
      const backLink = document.getElementById('backLink');
      if (backLink){
        // Re-read query params from the URL to be robust if report.js was loaded
        // in a different state; prefer explicit staff/date query params, fall
        // back to localStorage for staff.
        const qsSrc = new URLSearchParams(window.location.search || '');
        const s = qsSrc.get('staff') || localStorage.getItem && localStorage.getItem('cmass:staff') || '';
        const d = qsSrc.get('date') || '';
        const regionVal = qsSrc.get('region') || (sessionStorage.getItem && sessionStorage.getItem('cmass:last_region')) || (localStorage.getItem && localStorage.getItem('cmass:last_region')) || '';
        const qp = new URLSearchParams();
        if (s) qp.set('staff', s);
        if (d) qp.set('date', d);
        if (regionVal) qp.set('region', regionVal);
        const qs = qp.toString();
        // Intentionally omit school so meeting will start with no school selected
        backLink.href = '/meeting.html' + (qs ? ('?' + qs) : '');
      }
    }catch(e){console.warn('failed to set backLink', e);}
  });

})();
