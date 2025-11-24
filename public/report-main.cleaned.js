
    (function(){
  function qs(id){ return document.getElementById(id); }
  function qsParam(k){ try{ return (new URLSearchParams(window.location.search || '').get(k) || '').toString(); }catch(e){ return ''; } }
  // normalize/trim URL params to avoid accidental mismatches
  const staff = (qsParam('staff') || '').toString().trim();
  const visitDate = (qsParam('visitDate') || qsParam('date') || '').toString().trim();
      document.getElementById('subtitle').textContent = `\ub2f4\ub2f9\uc790: ${staff || '-'} \u00b7 \ubc29\ubb38\uc77c: ${visitDate || '-'}`;
      document.getElementById('staffName').textContent = staff || '';
      document.getElementById('reportDate').textContent = visitDate || '';

      // Ensure anonymous authentication before Firestore write/delete operations.
      // Uses the compat SDK firebase.auth() when available.
      async function ensureAnonymousAuth(firebaseAuth){
        try{
          const auth = firebaseAuth || (window.firebase && firebase.auth ? firebase.auth() : null);
          if (!auth) return null;
          if (auth.currentUser) return auth.currentUser;
          const cred = await auth.signInAnonymously();
          // compat SDK: currentUser should be set after sign-in
          return cred && cred.user ? cred.user : auth.currentUser || null;
        }catch(err){
          console.warn('ensureAnonymousAuth failed', err);
          throw err;
        }
      }

      // PIN \uc778\uc99d \uc0c1\ud0dc \ud655\uc778: index.html\uc5d0\uc11c sessionStorage\uc5d0 `cmass_pin_authenticated`\ub97c
      // \uc124\uc815\ud558\uba74 \uc11c\ubc84 \uc4f0\uae30 \uad8c\ud55c(\ud074\ub77c\uc774\uc5b8\ud2b8 \ucabd UI)\uc744 \ud5c8\uc6a9\ud569\ub2c8\ub2e4. \uc5c6\ub294 \uacbd\uc6b0 \uc5c5\ub85c\ub4dc \ubc84\ud2bc\uc744 \ube44\ud65c\uc131\ud654\ud569\ub2c8\ub2e4.
      try{
        const pinFlagRaw = (window.sessionStorage && sessionStorage.getItem('cmass_pin_authenticated')) || null;
        const pinBtn = document.getElementById('cmass-save-server-btn');
        if (!pinFlagRaw){
          if (pinBtn){ pinBtn.disabled = true; pinBtn.title = '\uc5c5\ub85c\ub4dc\ub97c \uc704\ud574\uc11c\ub294 \uc2dc\uc791 \ud398\uc774\uc9c0\uc5d0\uc11c PIN \uc778\uc99d\uc774 \ud544\uc694\ud569\ub2c8\ub2e4.'; }
          try{ const authStatusEl = document.getElementById('cmass-auth-status'); if (authStatusEl) authStatusEl.textContent = '(\uc778\uc99d \uc0c1\ud0dc: PIN \ud544\uc694)'; }catch(e){}
        } else {
          // Enable the upload button in the UI when PIN flag present
          if (pinBtn){ pinBtn.disabled = false; pinBtn.title = '\uc11c\ubc84 \uc5c5\ub85c\ub4dc \uac00\ub2a5 (PIN \uc778\uc99d\ub428)'; }

          // \uc790\ub3d9 \uc775\uba85 \ub85c\uadf8\uc778: sessionStorage\uc5d0 PIN \ud50c\ub798\uadf8\uac00 \uc788\uc73c\uba74 \uc2dc\ub3c4
          (function(){
            try {
              const pinFlag = (window.sessionStorage && sessionStorage.getItem('cmass_pin_authenticated')) || null;
              if (!pinFlag) return;

              // \ubc29\uc5b4: firebase.auth\uac00 \uc900\ube44\ub420 \ub54c\uae4c\uc9c0 \ub300\uae30
              function trySignIn() {
                try {
                  if (!window.firebase || !firebase.auth) {
                    // \uc544\uc9c1 SDK \ube44\ub3d9\uae30 \ub85c\ub529\uc911\uc774\uba74 \uc7ac\uc2dc\ub3c4
                    setTimeout(trySignIn, 200);
                    return;
                  }
                  // \uc774\ubbf8 \ub85c\uadf8\uc778\ub3fc \uc788\uc73c\uba74 \ubb34\uc2dc
                  if (firebase.auth().currentUser) {
                    console.debug('[auth] already signed in', firebase.auth().currentUser && firebase.auth().currentUser.uid);
                    try{ const authStatusEl = document.getElementById('cmass-auth-status'); if (authStatusEl) authStatusEl.textContent = '(\uc778\uc99d \uc0c1\ud0dc: \uc775\uba85 \ub85c\uadf8\uc778\ub428)'; }catch(e){}
                    return;
                  }
                  firebase.auth().signInAnonymously()
                    .then(res => {
                      console.debug('[auth] \uc775\uba85 \ub85c\uadf8\uc778 \uc131\uacf5', res && res.user && res.user.uid);
                      try{ const authStatusEl = document.getElementById('cmass-auth-status'); if (authStatusEl) authStatusEl.textContent = '(\uc778\uc99d \uc0c1\ud0dc: \uc775\uba85 \ub85c\uadf8\uc778\ub428)'; }catch(e){}
                    })
                    .catch(err => {
                      console.error('[auth] \uc775\uba85 \ub85c\uadf8\uc778 \uc2e4\ud328', err);
                      try{ const authStatusEl = document.getElementById('cmass-auth-status'); if (authStatusEl) authStatusEl.textContent = '(\uc778\uc99d \uc0c1\ud0dc: \uc775\uba85 \ub85c\uadf8\uc778 \uc2e4\ud328)'; }catch(e){}
                      // UI\uc5d0 \ucd94\uac00 \uc548\ub0b4\uac00 \ud544\uc694\ud558\uba74 \uc5ec\uae30\uc5d0 \ud1a0\uc2a4\ud2b8/\ubc30\ub108 \ud638\ucd9c\uc744 \ucd94\uac00\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.
                    });
                } catch(e) { console.warn('[auth] trySignIn \uc608\uc678', e); }
              }

              trySignIn();
            } catch(e) { console.warn('[auth] auto-anon init error', e); }
          })();
        }
      }catch(e){ /* tolerate */ }

      // Build a textual summary for the current staff+visitDate using local entries and office data
      function buildOfficeSummary(){
        try{
          const entries = (window._cmass_report_lastFiltered && window._cmass_report_lastFiltered.length) ? window._cmass_report_lastFiltered.slice() : (computeMetrics(loadLocalReports()).filtered || []);
          if (!entries || entries.length === 0) return '';
          const office = loadOfficeData() || {};
          // Prefer a human-friendly display name (staffLabel) from entries if available
          let staffLabel = staff || '';
          if (entries && entries.length && entries[0].staffLabel) staffLabel = entries[0].staffLabel || staffLabel;
          const header = `(${staffLabel} \ud1f4\uadfc\ubcf4\uace0)`;
          const lines = [];
          lines.push(header);
          lines.push(`\ubc29\ubb38\uc77c: ${visitDate || ''}`);

          // metrics
          const schools = Array.from(new Set(entries.map(e=> (e.school||'').toString().trim()).filter(x=>x)));
          const totalSchools = schools.length;
          const totalMeetings = entries.length;
          const contacts = entries.filter(e=> (e.phone || '').toString().trim()).length;
          const additional = entries.filter(e=> (e.followUp || '').toString().trim()).length;
          lines.push(`\ucd1d \ubc29\ubb38 \ud559\uad50: ${totalSchools}\uac1c \u00b7 \ucd1d \ubbf8\ud305\uc218: ${totalMeetings}\uac74 \u00b7 \uc5f0\ub77d\ucc98 \ud655\ubcf4: ${contacts}\uac74 \u00b7 \ucd94\uac00\uc120\uc815 \ud655\uc778: ${additional}\uac74`);

          // 1. \ucd9c\uadfc/\ud1f4\uadfc
          // \ucd9c\uadfc: \uac00\uc7a5 \uc774\ub978 \ubc29\ubb38 \uc2dc\uc791\uc2dc\uac04(\uc788\ub294 \uacbd\uc6b0)\uc744 \uc0ac\uc6a9, \uc5c6\uc73c\uba74 \uc624\ud53c\uc2a4 \uc785\ub825 \uc0ac\uc6a9
          const internalM = (Number(office.internalHours||0) * 60) + Number(office.internalMinutes||0);
          const meetingTotalM = entries.reduce((s,it)=> s + (Number(it.duration)||0), 0);
          // find earliest visit start (minutes since midnight) and latest visit end
          const startTimes = entries.map(it=>{ try{ if (it.startHour !== undefined && it.startHour !== '') return (Number(it.startHour||0)*60 + Number(it.startMinute||0)); }catch(e){} return null; }).filter(x=>x!==null).sort((a,b)=>a-b);
          const earliestStart = startTimes.length ? startTimes[0] : null;
          const latestEnd = entries.reduce((acc,it)=>{ try{ const st = (it.startHour !== undefined && it.startHour !== '') ? (Number(it.startHour||0)*60 + Number(it.startMinute||0)) : null; const dur = Number(it.duration||0); if (st!==null){ const end = st + dur; return Math.max(acc,end); } }catch(e){} return acc; }, 0);
          const cleanupM = Number(office.endMinutes || 0) || 30;
          function fmtHM(totalMin){ const h = Math.floor(totalMin/60); const m = totalMin % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
          // compute displayed checkin (use earliest visit start when available)
          let checkinTotal = null;
          if (earliestStart !== null){ checkinTotal = earliestStart; }
          else { const checkinH = Number(office.checkinHour || 0); const checkinM = Number(office.checkinMinute || 0); checkinTotal = (checkinH*60) + checkinM; }
          // checkout is defined as latest visit end + cleanup (\ud1f4\uadfc\ubcf4\uace0 \uc790\ub8cc \uc815\ub9ac \ub05d\ub098\ub294 \uc2dc\uac04)
          const checkoutTotal = (latestEnd > 0 ? (latestEnd + cleanupM) : (checkinTotal + internalM + meetingTotalM + cleanupM));
          // external work should include meeting durations plus the cleanup time
          const externalM = meetingTotalM + cleanupM;
          const totalWorkM = internalM + externalM;
          lines.push(`1. \ucd9c\uadfc: ${fmtHM(checkinTotal)} \u00b7 \ud1f4\uadfc: ${fmtHM(checkoutTotal)} ( ${Math.floor(totalWorkM/60)}H ${totalWorkM%60}M)`);
          lines.push(`   \uc0ac\ubb34\uc2e4 \ub0b4\uadfc (${Math.floor(internalM/60)}H ${internalM%60}M) \uc678\uadfc (${Math.floor(externalM/60)}H ${externalM%60}M)`);

          // 2. \uc138\ubd80\uc5c5\ubb34
          lines.push('');
          lines.push('2. \uc138\ubd80\uc5c5\ubb34');
          // group by school
          const bySchool = {};
          entries.forEach(it=>{ const s = (it.school||'\ud559\uad50 \ubbf8\uc815'); bySchool[s] = bySchool[s] || []; bySchool[s].push(it); });
          let idxSchool = 0;
          const korNums = ['\uac00','\ub098','\ub2e4','\ub77c','\ub9c8','\ubc14','\uc0ac','\uc544','\uc790','\ucc28','\uce74','\ud0c0','\ud30c','\ud558'];
          for (const sch of Object.keys(bySchool)){
            idxSchool++;
            const list = bySchool[sch];
            // determine school-level start/end
            const startTimes = list.map(it=>{ if (it.startHour !== undefined && it.startHour !== '') return (Number(it.startHour||0)*60 + Number(it.startMinute||0)); return null; }).filter(x=>x!==null).sort((a,b)=>a-b);
            const first = startTimes.length ? startTimes[0] : null;
            const lastEnd = list.reduce((acc,it)=>{ const st = (it.startHour !== undefined && it.startHour !== '') ? (Number(it.startHour||0)*60 + Number(it.startMinute||0)) : null; const dur = Number(it.duration||0); if (st!==null){ const end = st + dur; return Math.max(acc,end); } return acc; }, 0);
            const schStart = first !== null ? fmtHM(first) : '';
            const schEnd = lastEnd ? fmtHM(lastEnd) : '';
            // For Kakao copy/display: use the largest single meeting duration for the school
            // (user requested: \ud559\uad50\ubcc4 \ubc29\ubb38\uc2dc\uac04\uc740 \ubc29\ubb38\uc2dc\uac04 \uc81c\uc77c \ud070 \uc22b\uc790\ub85c \uc801\uc6a9)
            const durations = list.map(it => Number(it.duration) || 0);
            const totalMinForSchool = durations.length ? Math.max.apply(null, durations) : 0;
            // append optional school meta inline when available
            const metaText = (list[0] && list[0].meta) ? (' (' + list[0].meta + ')') : '';
            const schoolLabel = korNums[idxSchool-1] || String(idxSchool);
            lines.push(`${schoolLabel}. ${sch}: ${schStart}${schStart && schEnd ? ('~'+schEnd) : ''} (${totalMinForSchool}\ubd84)${metaText}`);
            lines.push('');
            // per-meeting bullets
            list.forEach((it, j)=>{
              const subjArr = Array.isArray(it.subjects) ? it.subjects : (it.subjects ? [it.subjects] : []);
              const subjText = subjArr.length ? subjArr.join(', ') : '';
              const teacher = it.teacherName || '';
              const pub = it.publisher || '';
              const dur = Number(it.duration||0);
              const start = (it.startHour !== undefined && it.startHour !== '') ? fmtHM(Number(it.startHour||0)*60 + Number(it.startMinute||0)) : '';
              lines.push(`-  ${String.fromCharCode(97 + j)}. ${subjText} (${teacher}${pub?'-'+pub:''}) : ${subjText} ${it.favor||''} ${it.activities||''} ${it.requests||''} ${it.notes||''} ${it.deliveries||''}`);
            });
            lines.push('');
          }

          // 3. \ud1f4\uadfc\ubcf4\uace0 \uc790\ub8cc \uc815\ub9ac
          const cleanupStart = checkoutTotal - cleanupM;
          const cleanupEnd = checkoutTotal;
          lines.push('3. \ud1f4\uadfc\ubcf4\uace0 \uc790\ub8cc \uc815\ub9ac (' + fmtHM(cleanupStart) + '~' + fmtHM(cleanupEnd) + ') (' + cleanupM + '\ubd84)');
          lines.push('');
          lines.push('- \ub05d.');
          lines.push('');

          // auto tags simple heuristic
          const subjCounts = {};
          entries.forEach(it=>{ const arr = Array.isArray(it.subjects) ? it.subjects : (it.subjects? [it.subjects] : []); arr.forEach(s=>{ const k = (s||'').toString(); if (!k) return; subjCounts[k] = (subjCounts[k]||0)+1; }); });
          const subjEntries = Object.entries(subjCounts).sort((a,b)=>b[1]-a[1]);
          const tags = [];
          if (subjEntries.length){ tags.push('\uc8fc\uc694\uacfc\ubaa9: ' + subjEntries[0][0] + '('+subjEntries[0][1]+'\ud68c)'); if (subjEntries[0][1] > 1) tags.push(subjEntries[0][0] + ' \ub2e4\uc218 \ubc29\ubb38'); }
          const revisit = Object.entries(bySchool).filter(([k,v])=> v.length>1).map(x=>x[0]);
          if (revisit.length) tags.push('\uc7ac\ubc29\ubb38: ' + revisit.join(', '));
          if (tags.length) lines.push('\uc790\ub3d9 \ud0dc\uadf8: ' + tags.join(', '));

          return lines.join('\n');
        }catch(e){ console.warn('buildOfficeSummary failed', e); return ''; }
      }

      function loadLocalReports(){
        try{ const raw = localStorage.getItem('cmass_reports') || '[]'; return JSON.parse(raw) || []; }catch(e){ return []; }
      }

      // expose to other scripts (report.js) that call loadLocalReports from the global scope
      window.loadLocalReports = loadLocalReports;

      function computeMetrics(entries){
        try{
          const targetVisit = (visitDate || '').toString().trim();
          const targetStaff = (staff || '').toString().trim();
          // Start by filtering with visitDate/staff from the provided array
          let rawFiltered = (entries||[]).filter(e => {
            try{
              const evd = (e.visitDate || '').toString().trim();
              const est = (e.staff || '').toString().trim();
              // visitDate: allow prefix match (handles full ISO timestamps)
              const visitMatch = !targetVisit || (evd.indexOf(targetVisit) === 0);
              // staff: require exact token match when provided
              const staffMatch = !targetStaff || (est === targetStaff);
              return visitMatch && staffMatch;
            }catch(ex){ return false; }
          });
          // If we found nothing with the strict staff+visitDate filter, but a visitDate
          // is provided, try a looser fallback that matches visitDate only. This
          // handles cases where the saved entry uses a different staff token (e.g.
          // label vs token mismatch) but is still the same visit day.
          let usedStaffFallback = false;
          if ((rawFiltered || []).length === 0 && targetVisit){
            const looser = (entries||[]).filter(e => { try{ const evd = (e.visitDate||'').toString().trim(); return (!targetVisit) || (evd.indexOf(targetVisit) === 0); }catch(x){ return false; } });
            if ((looser||[]).length > 0){ rawFiltered = looser; usedStaffFallback = true; }
          }
          // Deduplicate by server_id when present, otherwise by _savedAt fallback
          const seen = new Set();
          const filtered = [];
          for (const e of rawFiltered){
            try{
              const key = (e && e.server_id) ? ('s:' + String(e.server_id)) : ('l:' + String(e._savedAt || JSON.stringify(e)));
              if (seen.has(key)) continue;
              seen.add(key);
              filtered.push(e);
            }catch(err){ filtered.push(e); }
          }
          const totalMeetings = filtered.length;
          try{ console.debug('[report] computeMetrics', { targetStaff: targetStaff, targetVisit: targetVisit, rawCount: (entries||[]).length, matched: totalMeetings, usedStaffFallback: !!usedStaffFallback }); }catch(e){}
          const schools = new Set(filtered.map(it => (it.school||'').toString().trim()).filter(Boolean));
          const totalSchools = schools.size;
          const contactsSecured = filtered.reduce((s,it)=> s + (((it.phone && String(it.phone).trim()) || (it.email && String(it.email).trim())) ? 1:0), 0);
          const additionalSelections = filtered.reduce((s,it)=>{ const text = ((it.followUp||'') + ' ' + (it.requests||'') + ' ' + (it.notes||'')).toString(); return s + ((text.indexOf('\uc120\uc815') !== -1) ? 1 : 0); },0);
          return { totalMeetings, totalSchools, contactsSecured, additionalSelections, filtered };
        }catch(e){ return { totalMeetings:0, totalSchools:0, contactsSecured:0, additionalSelections:0, filtered:[] }; }
      }

      function renderSummary(metrics){
        const mainEl = qs('main');
        const m = metrics || { totalMeetings:0, totalSchools:0, contactsSecured:0, additionalSelections:0, filtered:[] };
        const html = [];
        html.push('<div style="font-weight:800;margin-bottom:8px">\ubcf4\uace0\uc11c \uc694\uc57d</div>');
        html.push('<div class="summary-grid">');
        html.push(`<div class="summary-item"><div class="muted">\ubc29\ubb38\uc77c</div><div style="font-weight:800">${visitDate||'-'}</div></div>`);
        html.push(`<div class="summary-item"><div class="muted">\ucd1d \ubc29\ubb38 \ud559\uad50</div><div style="font-weight:800">${m.totalSchools||0}\uac1c</div></div>`);
        html.push(`<div class="summary-item"><div class="muted">\ucd1d \ubbf8\ud305\uc218</div><div style="font-weight:800">${m.totalMeetings||0}\uac74</div></div>`);
        html.push(`<div class="summary-item"><div class="muted">\uc5f0\ub77d\ucc98 \ud655\ubcf4</div><div style="font-weight:800">${m.contactsSecured||0}\uac74</div></div>`);
        html.push(`<div class="summary-item"><div class="muted">\ucd94\uac00\uc120\uc815 \ud655\uc778</div><div style="font-weight:800">${m.additionalSelections||0}\uac74</div></div>`);
        html.push('</div>');
        if ((m.filtered || []).length === 0) html.push('<div style="margin-top:12px;color:#c33">\ud574\ub2f9 \uc77c\uc790\uc758 \uae30\ub85d\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</div>');
        mainEl.innerHTML = html.join('');

        // Render list of schools visited that day as clickable buttons under the summary
        try{
          // store last filtered list for school-button callbacks
          // Ensure we only expose entries that match the current staff (defensive filter)
          const filteredByStaffRaw = (m.filtered || []).filter(it => { try{ return !staff || ((it.staff||'').toString().trim() === staff); }catch(e){ return false; } });
          // Deduplicate entries by server_id when present, otherwise by _savedAt fallback.
          // This prevents showing multiple duplicate cards when local copies and server docs
          // or multiple local copies share the same server_id.
          const dedupMap = new Map();
          const filteredByStaff = [];
          for (const e of filteredByStaffRaw){
            try{
              const key = (e && e.server_id) ? ('s:' + String(e.server_id)) : ('l:' + String(e._savedAt || JSON.stringify(e)));
              if (dedupMap.has(key)) continue;
              dedupMap.set(key, true);
              filteredByStaff.push(e);
            }catch(x){ /* tolerate malformed entries */ }
          }
          window._cmass_report_lastFiltered = filteredByStaff.slice();
          const schoolSet = new Set((filteredByStaff||[]).map(it => (it.school||'').toString().trim()).filter(Boolean));
          const containerId = '__report_school_list';
          let container = document.getElementById(containerId);
          // preserve previously-selected school (if any) so we can re-apply the active state
          const prevActive = (container && container.querySelector) ? (container.querySelector('button.active') ? ((container.querySelector('button.active').dataset || {}).school || '') : '') : '';
          if (!container){ container = document.createElement('div'); container.id = containerId; container.style.marginTop = '12px'; mainEl.appendChild(container); }
          container.innerHTML = '';
          const title = document.createElement('div'); title.className = 'muted-strong'; title.style.marginBottom = '6px'; title.textContent = '\ud574\ub2f9\uc77c \ubc29\ubb38 \ud559\uad50'; container.appendChild(title);
          const listWrap = document.createElement('div'); listWrap.style.display = 'flex'; listWrap.style.gap = '8px'; listWrap.style.flexWrap = 'wrap'; container.appendChild(listWrap);
          // '\uc804\uccb4' button
          const btnAll = document.createElement('button'); btnAll.className = 'alt-btn'; btnAll.textContent = '\uc804\uccb4'; btnAll.dataset.school = '';
          btnAll.addEventListener('click', function(){
            // clear active states and render the staff-filtered list immediately
            Array.from(listWrap.querySelectorAll('button')).forEach(b => b.classList.remove('active'));
            btnAll.classList.add('active');
            try{
              const all = window._cmass_report_lastFiltered || [];
              renderEntries(all);
            }catch(e){ console.warn('\uc804\uccb4 button render failed', e); }
          });
          listWrap.appendChild(btnAll);

          // (\uc9c1\uc6d0 \uc804\uccb4) \ubc84\ud2bc \uc81c\uac70 \u2014 \uc9c1\uc6d0 \ud544\ud130\uc5d0 \ub9de\ucdb0 \ud45c\uc2dc\ub418\ub3c4\ub85d \ub2e8\uc77c '\uc804\uccb4' \ubc84\ud2bc\ub9cc \ub0a8\uae41\ub2c8\ub2e4.

          // create one button per school, showing visit count per school
          Array.from(schoolSet).forEach(sch => {
            const count = (filteredByStaff||[]).filter(it => (it.school||'').toString().trim() === sch).length || 0;
            const b = document.createElement('button'); b.className = 'alt-btn'; b.textContent = (count > 0) ? (sch + ' (' + String(count) + ')') : sch; b.dataset.school = sch;
            b.addEventListener('click', function(){
              // highlight
              Array.from(listWrap.querySelectorAll('button')).forEach(bb => bb.classList.remove('active'));
              b.classList.add('active');
              try{
                  const all = window._cmass_report_lastFiltered || [];
                  const filteredBySchool = all.filter(it => (it.school||'').toString().trim() === sch);
                renderEntries(filteredBySchool);
              }catch(e){ console.warn('school filter failed', e); }
            });
            listWrap.appendChild(b);
          });
          // re-apply previous active selection if any
          try{
            if (prevActive){
              const match = Array.from(listWrap.querySelectorAll('button')).find(x => (x.dataset && x.dataset.school) === prevActive);
              if (match){ match.classList.add('active');
                // render entries for that school
                const all = window._cmass_report_lastFiltered || [];
                const filteredBySchool = all.filter(it => (it.school||'').toString().trim() === prevActive);
                renderEntries(filteredBySchool);
              } else {
                // no previous active selection, fall back to \uc804\uccb4
                btnAll.classList.add('active');
                try{ renderEntries(window._cmass_report_lastFiltered || []); }catch(e){}
              }
            } else {
              // default to \uc804\uccb4 (staff-filtered) and render entries immediately
              btnAll.classList.add('active');
              try{ renderEntries(window._cmass_report_lastFiltered || []); }catch(e){}
            }
          }catch(e){ btnAll.classList.add('active'); }
        }catch(e){ console.warn('renderSummary school list error', e); }
      }

      function renderEntries(filtered){
        const area = qs('entriesArea'); area.innerHTML = '';
        if (!filtered || filtered.length === 0) return;
        // Defensive dedupe before rendering: prefer one entry per server_id or _savedAt
        const seen = new Set();
        const unique = [];
        for (const e of filtered){
          try{
            const key = (e && e.server_id) ? ('s:' + String(e.server_id)) : ('l:' + String(e._savedAt || JSON.stringify(e)));
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(e);
          }catch(err){ unique.push(e); }
        }
        unique.forEach((e, idx)=>{
          const div = document.createElement('div'); div.className = 'report-entry';
          // insert upload-selection checkbox (data-local-index should map back to cmass_reports)
          try{
            const localArr = loadLocalReports();
            // attempt to find local index by server_id or by matching key fields
            let localIndex = localArr.findIndex(it => it && e && it.server_id && e.server_id && String(it.server_id) === String(e.server_id));
            if (localIndex === -1){
              localIndex = localArr.findIndex(it => it && e && (it._savedAt && e._savedAt && it._savedAt === e._savedAt));
            }
            if (localIndex === -1){
              localIndex = localArr.findIndex(it => it && e && (String(it.school||'') === String(e.school||'')) && (String(it.visitDate||'') === String(e.visitDate||'')) && (String(it.startHour||'') === String(e.startHour||'')));
            }
            const isServer = !!(e && e.server_id);
            const chk = document.createElement('input'); chk.type = 'checkbox'; chk.className = 'cmass-upload-check';
            // Attach helpful data- attributes so uploader can reliably map checkbox -> local entry
            try{ if (e && e.server_id) chk.setAttribute('data-server-id', String(e.server_id)); }catch(_){}
            try{ if (e && e.school) chk.setAttribute('data-school', String(e.school)); }catch(_){}
            try{ if (e && e.visitDate) chk.setAttribute('data-visit-date', String(e.visitDate)); }catch(_){}
            try{ if (e && e.startHour) chk.setAttribute('data-start-hour', String(e.startHour)); }catch(_){}
            try{ if (e && e._savedAt) chk.setAttribute('data-saved-at', String(e._savedAt)); }catch(_){}
            // If this entry already exists on server, indicate it and disable upload checkbox
            if (isServer){ chk.checked = true; chk.disabled = true; chk.title = '\uc774\ubbf8 \uc11c\ubc84\uc5d0 \uc800\uc7a5\ub41c \ud56d\ubaa9\uc785\ub2c8\ub2e4.'; }
            else { chk.checked = true; chk.disabled = false; chk.title = '\uc11c\ubc84\uc5d0 \uc5c5\ub85c\ub4dc\ud560 \ud56d\ubaa9 \uc120\ud0dd'; }
            chk.setAttribute('data-local-index', String(localIndex === -1 ? -1 : localIndex));
            // generate a stable-ish slug for this entry so the edit link can reference it
            try{
              const slugSource = ((e && e.staff) || '') + '|' + ((e && e.visitDate) || '') + '|' + ((e && e.school) || '') + '|' + ((e && e._savedAt) || '');
              const slug = (slugSource && slugSource.normalize ? slugSource.normalize('NFKD') : slugSource).toString().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
              if (slug) chk.setAttribute('data-edit-slug', slug);
            }catch(_){ }
            chk.style.marginRight = '8px';
            div.appendChild(chk);

            // If server-saved, show a small icon/badge indicating server origin
            if (isServer){
              const badge = document.createElement('span');
              badge.textContent = '\u2601\ufe0f'; // cloud icon
              badge.title = '\uc11c\ubc84\uc5d0 \uc800\uc7a5\ub428';
              badge.style.marginLeft = '6px';
              badge.style.fontSize = '14px';
              badge.style.verticalAlign = 'middle';
              div.appendChild(badge);
            }
          }catch(err){ /* tolerate */ }
          const title = document.createElement('div'); title.className='school-title'; title.textContent = (e.school||'(\ud559\uad50 \ubbf8\uc815)') + ' \u00b7 ' + (e.visitDate||'');
          const meta = document.createElement('div'); meta.className='muted'; meta.textContent = (e.staffLabel || e.staff || '') + ' \u00b7 ' + (e.region||'');
          // We'll show a compact summary by default; full title/meta live in the details when expanded
          title.style.display = 'none';
          meta.style.display = 'none';
          div.appendChild(title); div.appendChild(meta);

          // Compact summary visible when collapsed: show school, subjects, teacher, phone
          const summaryDiv = document.createElement('div'); summaryDiv.className = 'report-entry-summary';
          const left = document.createElement('div'); left.className = 'meta-left';
          const subjectsText = Array.isArray(e.subjects) ? (e.subjects.join(', ')) : (e.subjects || '');
          const parts = [];
          if (e.school) parts.push(e.school);
          if (subjectsText) parts.push(subjectsText);
          if (e.teacherName) parts.push(e.teacherName);
          // show '\uc6b0\ud638\ub3c4' (favor) in the compact collapsed summary instead of \uc5f0\ub77d\ucc98
          if (e.favor) parts.push(e.favor);
          left.textContent = parts.join(' \u00b7 ');
          const right = document.createElement('div');
          const toggleBtn = document.createElement('button'); toggleBtn.textContent = '\ud3bc\uce58\uae30';
          toggleBtn.style.minWidth = '72px';
          right.appendChild(toggleBtn);
          summaryDiv.appendChild(left); summaryDiv.appendChild(right);
          div.appendChild(summaryDiv);
          // Human-friendly Korean labels for fields
          const FIELD_LABELS = {
            server_id: '\uc11c\ubc84 ID',
            staff: '\uc9c1\uc6d0',
            staffLabel: '\uc9c1\uc6d0(\ud45c\uc2dc\uba85)',
            region: '\uc9c0\uc5ed',
            school: '\ud559\uad50',
            visitDate: '\ubc29\ubb38\uc77c',
            startHour: '\ubc29\ubb38\uc2dc\uc791\uc2dc\uac04',
            startMinute: '\ubc29\ubb38\uc2dc\uc791\ubd84',
            duration: '\ucd1d \ubc29\ubb38\uc2dc\uac04',
            endTime: '\ubc29\ubb38\uc885\ub8cc\uc2dc\uac04',
            subjects: '\uacfc\ubaa9',
            activities: '\uc601\uc5c5\ud65c\ub3d9',
            favor: '\uc6b0\ud638\ub3c4',
            teacherName: '\uc120\uc0dd\ub2d8 \uc774\ub984',
            publisher: '\ucd9c\ud310\uc0ac',
            phone: '\uc5f0\ub77d\ucc98',
            email: '\uc774\uba54\uc77c',
            requests: '\uace0\uac1d \uc694\uccad\uc0ac\ud56d',
            notes: '\ud2b9\uc774\uc0ac\ud56d',
            deliveries: '\ub0a9\ud488\uc0ac\ud56d',
            followUp: '\ud6c4\uc18d\uc870\uce58',
            _savedAt: '\uc800\uc7a5\uc2dc\uae30'
          };

          // Preferred order for display
          const fields = ['server_id','staff','staffLabel','region','school','visitDate','startHour','startMinute','duration','endTime','subjects','activities','favor','teacherName','publisher','phone','email','requests','notes','deliveries','followUp','_savedAt'];

          // Details container (hidden by default)
          const details = document.createElement('div'); details.className = 'report-entry-details'; details.style.display = 'none';

          fields.forEach(f=>{
            const v = e[f];
            // skip undefined/empty (allow 0 value)
            if ((v === undefined || v === null || v === '') && v !== 0) return;
            const p = document.createElement('div'); p.style.marginTop='6px';

            // combine startHour and startMinute into a single readable time when available
            if (f === 'startHour'){
              const hr = e.startHour || '';
              const min = e.startMinute || '';
              const time = hr ? (hr + (min ? (':' + String(min).padStart(2,'0')) : '')) : '';
              if (!time) return; // nothing to show
              p.innerHTML = `<strong>${FIELD_LABELS[f]}:</strong> ${time}`;
              details.appendChild(p);
              return;
            }

            // don't repeat startMinute separately if we've already shown it
            if (f === 'startMinute') return;

            const label = FIELD_LABELS[f] || f;
            const display = Array.isArray(v) ? (v.length ? v.join(', ') : '') : v;
            if ((display === '' || display === undefined || display === null) && display !== 0) return;
            p.innerHTML = `<strong>${label}:</strong> ${display}`;
            details.appendChild(p);
          });

          // Wire toggle button to show/hide details and title/meta
          try{
            toggleBtn.addEventListener('click', function(ev){
              ev.preventDefault();
              const open = (details.style.display !== 'none');
              if (open){
                details.style.display = 'none';
                title.style.display = 'none';
                meta.style.display = 'none';
                toggleBtn.textContent = '\ud3bc\uce58\uae30';
              } else {
                details.style.display = 'block';
                title.style.display = 'block';
                meta.style.display = 'block';
                toggleBtn.textContent = '\uc811\uae30';
              }
            });
            // allow clicking the summary left area to toggle as well
            summaryDiv.querySelector('.meta-left').addEventListener('click', function(){ toggleBtn.click(); });
          }catch(e){}

          // Edit link (in details) \u2014 use an anchor so users can open it in a new tab and still preserve query params
          const editLink = document.createElement('a');
          editLink.textContent = '\uc218\uc815';
          editLink.setAttribute('role','button');
          editLink.style.display = 'inline-block';
          editLink.style.marginTop = '8px';
          editLink.style.padding = '6px 10px';
          editLink.style.border = '1px solid #d6e8f0';
          editLink.style.borderRadius = '6px';
          editLink.style.color = '#0a5';
          try{
            const staffToken = e && e.staff ? encodeURIComponent(String(e.staff)) : '';
            const params = [];
            if (staffToken) params.push('staff='+staffToken);
            // include visitDate so meeting can match by date even if sessionStorage is missing
            if (e && e.visitDate) params.push('visitDate='+encodeURIComponent(String(e.visitDate)));
            if (e && e.server_id) params.push('edit_server_id='+encodeURIComponent(String(e.server_id)));
            if (typeof idx !== 'undefined' && idx !== null) params.push('edit_local_index='+encodeURIComponent(String(idx)));
            // compute and include a lightweight slug to make cross-tab edit handoff robust
            try{
              const slugSource = ((e && e.staff) || '') + '|' + ((e && e.visitDate) || '') + '|' + ((e && e.school) || '') + '|' + ((e && e._savedAt) || '');
              const slug = (slugSource && slugSource.normalize ? slugSource.normalize('NFKD') : slugSource).toString().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
              if (slug) { params.push('edit_slug='+encodeURIComponent(slug)); editLink.dataset.editSlug = slug; }
            }catch(_){ }
            const q = params.length ? ('?'+params.join('&')) : '';
            editLink.href = '/meeting.html' + q;
          }catch(err){ editLink.href = '/meeting.html'; }
          // Create a delete button for each entry (will handle server/local cases in handler)
          const btnDel = document.createElement('button'); btnDel.textContent='\uc0ad\uc81c'; btnDel.style.marginLeft='8px'; btnDel.style.marginTop='8px'; btnDel.style.borderColor='#f0dede'; btnDel.style.color='#c33';
          btnDel.addEventListener('click', async function(){
              // Show controls depending on whether this entry exists on server
              if (isServer) {
                // Delete button for server-saved entries (visible in summary and details)
                const btnDel = document.createElement('button'); btnDel.textContent='\uc0ad\uc81c'; btnDel.style.marginLeft='8px'; btnDel.style.marginTop='8px'; btnDel.style.borderColor='#f0dede'; btnDel.style.color='#c33';
                btnDel.addEventListener('click', async function(){
                  try{
                    if (!confirm('\uc815\ub9d0\ub85c \uc774 \ud56d\ubaa9\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return;
                    // Attempt server delete first (if available), then remove from localStorage
                    try{
                      // ensure anonymous auth before server-side operations
                      try{
                        if (window.firebaseDb && window.firebase && firebase.auth){
                          await ensureAnonymousAuth(firebase.auth());
                        }
                      }catch(authErr){
                        console.warn('anonymous auth before delete failed', authErr);
                        alert('\uc0ad\uc81c\ub97c \uc704\ud574 \uc775\uba85 \uc778\uc99d\uc774 \ud544\uc694\ud569\ub2c8\ub2e4. Firebase \ucf58\uc194\uc5d0\uc11c \uc775\uba85 \uc778\uc99d\uc744 \ud65c\uc131\ud654\ud588\ub294\uc9c0 \ud655\uc778\ud558\uc138\uc694.');
                        return;
                      }

                      if (window.firebaseDb && e && e.server_id){
                        // Prefer to delete by server_id to target a single document
                        try{
                          await window.firebaseDb.collection('visit_entries').doc(String(e.server_id)).delete();
                        }catch(err){ console.warn('direct delete by id failed', err); }
                        try{ await window.firebaseDb.collection('visits').doc(String(e.server_id)).delete().catch(()=>{}); }catch(_){ }
                      }
                    }catch(serverErr){ console.warn('server delete error', serverErr); alert('\uc11c\ubc84 \uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4: '+(serverErr && serverErr.message)); }

                    // Remove from localStorage (match by server_id first, then fallback to fields). Always do this to keep UI consistent.
                    try{
                      const arr = loadLocalReports();
                      let removed = false;
                      if (e && e.server_id){
                        const idxLocal = arr.findIndex(it => String(it.server_id||'') === String(e.server_id));
                        if (idxLocal !== -1){ arr.splice(idxLocal,1); removed = true; }
                      }
                      if (!removed){
                        // fallback: try match by school/staff/visitDate and start time
                        const idxLocal = arr.findIndex(it => (it.school||'')=== (e.school||'') && (it.visitDate||'') === (e.visitDate||'') && (it.staff||'') === (e.staff||'') && ((it.startHour||'') === (e.startHour||'')));
                        if (idxLocal !== -1){ arr.splice(idxLocal,1); removed = true; }
                      }
                      if (!removed){
                        // last resort: remove first matching school+date
                        const idxLocal2 = arr.findIndex(it => (it.school||'')=== (e.school||'') && (it.visitDate||'') === (e.visitDate||''));
                        if (idxLocal2 !== -1){ arr.splice(idxLocal2,1); removed = true; }
                      }
                      if (removed){ localStorage.setItem('cmass_reports', JSON.stringify(arr)); }
                    }catch(lsErr){ console.warn('local delete failed', lsErr); }

                    // re-render (preserve school filter if applied)
                    try{ _reRenderUI(); }catch(re){ /* tolerate */ }
                  }catch(ex){ console.error('delete handler', ex); alert('\uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); }
                });

                try{ details.appendChild(btnDel); }catch(_){ }
                try{ right.insertBefore(btnDel.cloneNode(true), toggleBtn); }catch(_){ }
              } else {
                // Store an enhanced edit payload to sessionStorage when clicked in the same tab.
                // Enhancements: normalize visitDate, derive startHour/startMinute from visitStart,
                // ensure staff token exists by matching staff label to a select option if needed.
                // Reuse handler for both details and summary edit links
                const doEdit = function(ev){
                  try{
                    // Build a defensive copy to augment without mutating original
                    const payload = Object.assign({}, e || {});

                    // Normalize visitDate (ISO -> yyyy-mm-dd)
                    try{ if (payload.visitDate && typeof payload.visitDate === 'string' && payload.visitDate.indexOf('T') !== -1){ payload.visitDate = payload.visitDate.slice(0,10); } }catch(_){ }

                    // Derive startHour/startMinute from visitStart if present
                    try{
                      if ((!payload.startHour || !payload.startMinute) && payload.visitStart){
                        const vs = (''+payload.visitStart).trim();
                        if (vs.indexOf(':') !== -1){ const p = vs.split(':'); payload.startHour = String(p[0]).padStart(2,'0'); payload.startMinute = String(p[1]).padStart(2,'0'); }
                      }
                    }catch(_){ }

                    // If staff token is missing but a human label exists, try to map it to a select option value
                    try{
                      if ((!payload.staff || payload.staff === '') && (payload.staffLabel || payload.staffName || payload.staff_label)){
                        const label = payload.staffLabel || payload.staffName || payload.staff_label || '';
                        try{
                          const sel = document.getElementById('staff');
                          if (sel && sel.options && sel.options.length){
                            // Try exact visible text match, then partial inclusion
                            let foundOpt = Array.from(sel.options).find(o => (o.text||'').trim() === (label||'').trim());
                            if (!foundOpt){ foundOpt = Array.from(sel.options).find(o => (o.text||'').indexOf(label) !== -1); }
                            if (foundOpt) payload.staff = foundOpt.value;
                          }
                        }catch(_){ }
                      }
                    }catch(_){ }

                    // Finally, write the enhanced payload to sessionStorage (if available)
                    try{
                      if (window.sessionStorage){
                        sessionStorage.setItem('cmass:edit_entry', JSON.stringify(payload));
                        sessionStorage.setItem('cmass:edit_index', String(idx));
                      }
                    }catch(_){ }

                    // If user intended to open in a new tab (modifier keys), allow default anchor behavior so the
                    // browser opens the href in new tab. For same-tab clicks, perform a programmatic navigation to
                    // ensure our sessionStorage write happens before leaving.
                    try{
                      const isModified = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey);
                      if (!isModified){
                        try{ ev.preventDefault(); }catch(_){ }
                        try{ window.location.href = editLink.href; }catch(_){ try{ location.assign(editLink.href); }catch(__){} }
                      }
                    }catch(_){ }
                  }catch(ex){ /* tolerate */ }
                };
                editLink.addEventListener('click', doEdit);
                // add an extra copy in the summary so local entries have an immediate '\uc218\uc815' button
                try{ details.appendChild(editLink); }catch(_){ }
                try{ const summaryEdit = editLink.cloneNode(true); summaryEdit.addEventListener('click', doEdit); right.insertBefore(summaryEdit, toggleBtn); }catch(_){ }
              }

          // If this entry is local-only (no server_id) show an edit link that pre-fills the meeting form.
          if (!e || !e.server_id){
            // Store an enhanced edit payload to sessionStorage when clicked in the same tab.
            // Enhancements: normalize visitDate, derive startHour/startMinute from visitStart,
            // ensure staff token exists by matching staff label to a select option if needed.
            editLink.addEventListener('click', function(ev){
              try{
                // Build a defensive copy to augment without mutating original
                const payload = Object.assign({}, e || {});

                // Normalize visitDate (ISO -> yyyy-mm-dd)
                try{ if (payload.visitDate && typeof payload.visitDate === 'string' && payload.visitDate.indexOf('T') !== -1){ payload.visitDate = payload.visitDate.slice(0,10); } }catch(_){ }

                // Derive startHour/startMinute from visitStart if present
                try{
                  if ((!payload.startHour || !payload.startMinute) && payload.visitStart){
                    const vs = (''+payload.visitStart).trim();
                    if (vs.indexOf(':') !== -1){ const p = vs.split(':'); payload.startHour = String(p[0]).padStart(2,'0'); payload.startMinute = String(p[1]).padStart(2,'0'); }
                  }
                }catch(_){ }

                // If staff token is missing but a human label exists, try to map it to a select option value
                try{
                  if ((!payload.staff || payload.staff === '') && (payload.staffLabel || payload.staffName || payload.staff_label)){
                    const label = payload.staffLabel || payload.staffName || payload.staff_label || '';
                    try{
                      const sel = document.getElementById('staff');
                      if (sel && sel.options && sel.options.length){
                        // Try exact visible text match, then partial inclusion
                        let foundOpt = Array.from(sel.options).find(o => (o.text||'').trim() === (label||'').trim());
                        if (!foundOpt){ foundOpt = Array.from(sel.options).find(o => (o.text||'').indexOf(label) !== -1); }
                        if (foundOpt) payload.staff = foundOpt.value;
                      }
                    }catch(_){ }
                  }
                }catch(_){ }

                // Finally, write the enhanced payload to sessionStorage (if available)
                try{
                  if (window.sessionStorage){
                    sessionStorage.setItem('cmass:edit_entry', JSON.stringify(payload));
                    sessionStorage.setItem('cmass:edit_index', String(idx));
                  }
                }catch(_){ }

                // If user intended to open in a new tab (modifier keys), allow default anchor behavior so the
                // browser opens the href in new tab. For same-tab clicks, perform a programmatic navigation to
                // ensure our sessionStorage write happens before leaving.
                try{
                  const isModified = ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey);
                  if (!isModified){
                    try{ ev.preventDefault(); }catch(_){ }
                    try{ window.location.href = editLink.href; }catch(_){ try{ location.assign(editLink.href); }catch(__){} }
                  } // else allow default (new-tab) behavior
                }catch(_){ }
              }catch(ex){ /* tolerate */ }
            });
            details.appendChild(editLink);
          } 

          // Append delete button to both details area and summary right-side so it's visible when collapsed
          try{ details.appendChild(btnDel); }catch(_){ }
          try{ right.insertBefore(btnDel.cloneNode(true), toggleBtn); }catch(_){ }

          // Attach details and append the entry container to the area for both local and server entries
          try{ div.appendChild(details); area.appendChild(div); }catch(_){ /* tolerate DOM errors */ }
        });
      }

      function mapServerDocToEntry(doc){
        try{
          const start = ((doc && (doc.visitStart || doc.visitstart)) || '');
          let startHour = '';
          let startMinute = '';
          if (start && String(start).indexOf(':') !== -1){
            const parts = String(start).split(':');
            startHour = parts[0];
            startMinute = parts[1];
          }
          return {
            server_id: doc.server_id || doc._id || '',
            staff: doc.staff || '',
            staffLabel: doc.staffLabel || '',
            region: doc.region || '',
            school: doc.school || '',
            meta: doc.meta || doc.schoolMeta || '',
            visitDate: doc.visitDate || '',
            startHour: startHour,
            startMinute: startMinute,
            duration: doc.duration || 0,
            endTime: doc.visitEnd || doc.visitend || '',
            subjects: Array.isArray(doc.subjects) ? doc.subjects : (doc.subjects ? [doc.subjects] : []),
            activities: Array.isArray(doc.activities) ? doc.activities : (doc.activities ? [doc.activities] : []),
            favor: doc.favor || '',
            teacherName: doc.teacher || doc.teacherName || '',
            publisher: doc.publisher || '',
            phone: doc.Phonenumber || doc.phone || '',
            email: doc.email || '',
            requests: doc.ask || doc.requests || '',
            notes: doc.conversation || doc.notes || '',
            deliveries: doc.delivery || doc.deliveries || '',
            followUp: doc.followUp || '' ,
            _savedAt: doc._savedAt || ''
          };
        }catch(e){ return {}; }
      }

        // Map local entry shape back to server payload
        function mapEntryToServerPayload(e){
          return {
            staff: e.staff || '',
            staffLabel: e.staffLabel || '',
            region: e.region || '',
            school: e.school || '',
            visitDate: e.visitDate || '',
            visitStart: (e.startHour ? (String(e.startHour).padStart(2,'0') + ':' + (e.startMinute ? String(e.startMinute).padStart(2,'0') : '00')) : ''),
            duration: (e.duration !== undefined) ? Number(e.duration) : 0,
            visitEnd: e.endTime || '',
            subjects: Array.isArray(e.subjects) ? e.subjects : (e.subjects ? [e.subjects] : []),
            activities: Array.isArray(e.activities) ? e.activities : (e.activities ? [e.activities] : []),
            favor: e.favor || '',
            teacher: e.teacherName || e.teacher || '',
            publisher: e.publisher || '',
            Phonenumber: e.phone || e.Phonenumber || '',
            phone: e.phone || e.Phonenumber || '',
            email: e.email || '',
            ask: e.requests || e.ask || '',
            conversation: e.notes || '',
            delivery: e.deliveries || e.delivery || '',
            followUp: e.followUp || '',
            _savedAt: e._savedAt || new Date().toISOString()
          };
        }
        try{ window.mapEntryToServerPayload = mapEntryToServerPayload; }catch(e){}

        // If the meeting page left an edited entry in sessionStorage, apply it (local + server)
    async function applySessionEditIfPresent(){
          try{
            if (!window.sessionStorage) return;
            const raw = sessionStorage.getItem('cmass:edit_entry');
            const idxRaw = sessionStorage.getItem('cmass:edit_index');
            if (!raw) return;
            const edited = JSON.parse(raw);
            // update localStorage
            const arr = loadLocalReports();
            let idx = -1;
            if (idxRaw){ idx = Number(idxRaw); }
            if (idx >=0 && idx < arr.length){ arr[idx] = edited; }
            else {
              // try to find by server_id or by matching key fields
              if (edited.server_id){ idx = arr.findIndex(it=> String(it.server_id||'') === String(edited.server_id)); }
              if (idx === -1){ idx = arr.findIndex(it=> (it.school||'')=== (edited.school||'') && (it.visitDate||'') === (edited.visitDate||'') && (it.staff||'') === (edited.staff||'')); }
              if (idx === -1){ arr.push(edited); idx = arr.length-1; }
              else { arr[idx] = edited; }
            }

            // Expose the apply function for console/tests
            try{ window._cmass_applySessionEditIfPresent = applySessionEditIfPresent; }catch(e){}

            // Extracted delete routine so it can be called from console or a test harness
            async function deleteEntryRoutine(e){
              try{
                if (!confirm('\uc815\ub9d0\ub85c \uc774 \ud56d\ubaa9\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return { ok:false, reason: 'cancel' };
                // Attempt server delete first (if available), then remove from localStorage
                try{
                  // ensure anonymous auth before server-side operations
                  try{
                    if (window.firebaseDb && window.firebase && firebase.auth){
                      await ensureAnonymousAuth(firebase.auth());
                    }
                  }catch(authErr){
                    console.warn('anonymous auth before delete failed', authErr);
                    return { ok:false, reason: 'auth' };
                  }

                  if (window.firebaseDb){
                    if (e.server_id){
                      try{ await window.firebaseDb.collection('visit_entries').doc(String(e.server_id)).delete(); }catch(err){ console.warn('direct delete by id failed', err); }
                      try{ await window.firebaseDb.collection('visits').doc(String(e.server_id)).delete().catch(()=>{}); }catch(_){ }
                    } else {
                      try{
                        const visitStart = (e.startHour ? (String(e.startHour).padStart(2,'0') + ':' + (e.startMinute ? String(e.startMinute).padStart(2,'0') : '00')) : '');
                        let q = window.firebaseDb.collection('visit_entries')
                          .where('staff','==', e.staff || '')
                          .where('visitDate','==', e.visitDate || '')
                          .where('school','==', e.school || '');
                        if (visitStart) q = q.where('visitStart','==', visitStart);
                        const snap = await q.limit(5).get();
                        let deletedAny = false;
                        snap.forEach(d => { if (deletedAny) return; try{ window.firebaseDb.collection('visit_entries').doc(d.id).delete().catch(()=>{}); deletedAny = true; }catch(_){ } });
                        if (!deletedAny){ console.warn('no matching server doc found for targeted delete (no server_id)'); }
                      }catch(qerr){ console.warn('targeted query delete failed', qerr); }
                    }
                  }
                }catch(serverErr){ console.warn('server delete error', serverErr); alert('\uc11c\ubc84 \uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4: '+(serverErr && serverErr.message)); }

                // Remove from localStorage (defensive, clear only matching items)
                try{
                  const arr = loadLocalReports() || [];
                  let removed = false;

                  // Helper to remove at index and mark removed
                  function removeAt(i){ if (i !== -1 && i < arr.length){ arr.splice(i,1); removed = true; } }

                  // 1) match by server_id if present
                  if (e && e.server_id){ const idxLocal = arr.findIndex(it => String(it.server_id||'') === String(e.server_id)); removeAt(idxLocal); }

                  // 2) match by exact school/date/staff/startHour
                  if (!removed){ const idxLocal = arr.findIndex(it => (String(it.school||'') === String(e.school||'')) && (String(it.visitDate||'') === String(e.visitDate||'')) && (String(it.staff||'') === String(e.staff||'')) && (String(it.startHour||'') === String(e.startHour||'')) ); removeAt(idxLocal); }

                  // 3) fallback: match by school+date
                  if (!removed){ const idxLocal2 = arr.findIndex(it => (String(it.school||'') === String(e.school||'')) && (String(it.visitDate||'') === String(e.visitDate||'')) ); removeAt(idxLocal2); }

                  if (removed){ try{ localStorage.setItem('cmass_reports', JSON.stringify(arr)); }catch(x){ console.warn('failed to persist local delete', x); } }
                }catch(lsErr){ console.warn('local delete failed', lsErr); }

                // re-render (preserve school filter if applied)
                try{ if (typeof _reRenderUI === 'function') _reRenderUI(); }catch(re){ /* tolerate */ }
                return { ok:true };
              }catch(ex){ console.error('delete handler', ex); alert('\uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); return { ok:false, reason: ex }; }
            }

            try{ window._cmass_deleteEntry = deleteEntryRoutine; }catch(e){}

            // Small interactive test runner exposed to window
            async function _cmass_runSyncTest(){
              try{
                console.log('[CMASS TEST] \uc2dc\uc791');
                const testEntry = {
                  server_id: '', staff: staff || '\uae40\uc601\uc5c5', staffLabel: staff || '\uae40\uc601\uc5c5', region: '\ud14c\uc2a4\ud2b8', school: '\ud14c\uc2a4\ud2b8\ud559\uad50-\uc0ad\uc81c', visitDate: visitDate || new Date().toISOString().slice(0,10), startHour: '09', startMinute: '05', duration: 30, endTime: '09:35', subjects: ['\ud14c\uc2a4\ud2b8\uacfc\ubaa9'], activities: ['\ud14c\uc2a4\ud2b8\ud589\ub3d9'], favor: '\ubcf4\ud1b5', teacherName: '\ud14c\uc2a4\ud2b8\uc120\uc0dd', publisher: '', phone: '010-0000-9999', email: '', requests:'', notes:'\ud14c\uc2a4\ud2b8 \ub178\ud2b8', deliveries:'', followUp:'', _savedAt: new Date().toISOString()
                };
                // save locally
                const arr = loadLocalReports(); arr.push(testEntry); localStorage.setItem('cmass_reports', JSON.stringify(arr));
                console.log('[CMASS TEST] \ub85c\uceec\uc5d0 \ud14c\uc2a4\ud2b8 \uc5d4\ud2b8\ub9ac \ucd94\uac00\ub428');
                // attempt server add
                if (window.firebaseDb){
                  try{
                    // ensure auth if possible
                    if (firebase.auth && !firebase.auth().currentUser){ try{ await firebase.auth().signInAnonymously(); }catch(e){} }
                    const ref = await window.firebaseDb.collection('visit_entries').add(mapEntryToServerPayload(testEntry));
                    testEntry.server_id = ref.id;
                    // write back to local
                    const arr2 = loadLocalReports(); const idx = arr2.findIndex(it=> it.school === testEntry.school && it.visitDate === testEntry.visitDate && it.staff === testEntry.staff); if (idx!==-1){ arr2[idx].server_id = ref.id; localStorage.setItem('cmass_reports', JSON.stringify(arr2)); }
                    console.log('[CMASS TEST] \uc11c\ubc84\uc5d0 \ucd94\uac00\ub428 id=', ref.id);
                  }catch(e){ console.warn('[CMASS TEST] \uc11c\ubc84 \ucd94\uac00 \uc2e4\ud328', e); }
                }

                // simulate edit via sessionStorage
                testEntry.notes = '\ud14c\uc2a4\ud2b8 \uc218\uc815: \ub178\ud2b8 \ubcc0\uacbd';
                sessionStorage.setItem('cmass:edit_entry', JSON.stringify(testEntry));
                sessionStorage.setItem('cmass:edit_index', String(arr.length-1));
                // apply
                if (typeof applySessionEditIfPresent === 'function'){ await applySessionEditIfPresent(); console.log('[CMASS TEST] \uc138\uc158 \ud3b8\uc9d1 \uc801\uc6a9 \uc644\ub8cc'); }
                else if (window._cmass_applySessionEditIfPresent){ await window._cmass_applySessionEditIfPresent(); }

                // now delete via routine
                const delRes = await deleteEntryRoutine(testEntry);
                console.log('[CMASS TEST] \uc0ad\uc81c \uacb0\uacfc:', delRes);
                alert('[CMASS TEST] \uc644\ub8cc - \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.');
              }catch(e){ console.error('[CMASS TEST] \uc608\uc678', e); alert('\ud14c\uc2a4\ud2b8 \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); }
            }
            try{ window._cmass_runSyncTest = _cmass_runSyncTest; }catch(e){}
            localStorage.setItem('cmass_reports', JSON.stringify(arr));

            // attempt server sync
            if (window.firebaseDb){
              // ensure anonymous auth before attempting to write/update server documents
              try{
                if (window.firebase && firebase.auth){
                  await ensureAnonymousAuth(firebase.auth());
                }
              }catch(authErr){ console.warn('anonymous auth before server sync failed', authErr); }

              const payload = mapEntryToServerPayload(edited);
              try{
                if (edited.server_id){
                  // update existing doc
                  await window.firebaseDb.collection('visit_entries').doc(String(edited.server_id)).set(payload, { merge: true });
                }else{
                  const ref = await window.firebaseDb.collection('visit_entries').add(payload);
                  // write back server_id into local arr and persist
                  arr[idx].server_id = ref.id;
                  localStorage.setItem('cmass_reports', JSON.stringify(arr));
                }
              }catch(err){ console.warn('server sync for edit failed', err); }
            }

            // cleanup sessionStorage markers
            try{ sessionStorage.removeItem('cmass:edit_entry'); sessionStorage.removeItem('cmass:edit_index'); }catch(e){}
          }catch(e){ console.warn('applySessionEditIfPresent error', e); }
        }

        // --- Office / End-of-day report helpers ---
        function _officeStorageKey(){
          // store map by staff:visitDate
          const key = (staff || 'UNKNOWN') + ':' + (visitDate || new Date().toISOString().slice(0,10));
          return key;
        }

        function loadOfficeData(){
          try{
            const raw = localStorage.getItem('cmass_office_reports') || '{}';
            const map = JSON.parse(raw || '{}');
            return map[_officeStorageKey()] || {};
          }catch(e){ return {}; }
        }

        function saveOfficeData(payload){
          try{
            const raw = localStorage.getItem('cmass_office_reports') || '{}';
            const map = JSON.parse(raw || '{}');
            map[_officeStorageKey()] = Object.assign({}, map[_officeStorageKey()]||{}, payload, { _savedAt: new Date().toISOString() });
            localStorage.setItem('cmass_office_reports', JSON.stringify(map));
            return map[_officeStorageKey()];
          }catch(e){ console.warn('office save failed', e); return null; }
        }

        function renderOfficeSection(){
          try{
            const data = loadOfficeData();
            const elHour = qs('officeCheckinHour');
            const elMin = qs('officeCheckinMinute');
            const elHours = qs('officeInternalHours');
            const elMins = qs('officeInternalMinutes');
            const elEnd = qs('officeEndMinutes');
            const elSaved = qs('officeSavedAt');
            if (!elHour || !elMin || !elHours || !elMins || !elEnd || !elSaved) return;
            // populate new inputs
            elHour.value = data.checkinHour || '';
            elMin.value = data.checkinMinute || '';
            elHours.value = (data.internalHours !== undefined) ? String(data.internalHours) : '';
            elMins.value = (data.internalMinutes !== undefined) ? String(data.internalMinutes) : '';
            // default to 30 minutes for end/cleanup time when no saved value exists
            elEnd.value = (data.endMinutes !== undefined && data.endMinutes !== null && data.endMinutes !== '') ? String(data.endMinutes) : '30';
            elSaved.textContent = data._savedAt ? ('\uc800\uc7a5: ' + new Date(data._savedAt).toLocaleString()) : '';
          }catch(e){ /* tolerate */ }
        }

        // Helper: determine currently selected school from the school-list UI
        function _getActiveSchoolSelection(){
          try{
            const container = document.getElementById('__report_school_list');
            if (!container) return '';
            const btn = container.querySelector('button.active');
            if (!btn) return '';
            return btn.dataset ? (btn.dataset.school || '') : '';
          }catch(e){ return ''; }
        }

  // Ensure a global stub exists immediately so DevTools can call it
  // even before the rest of the script has finished executing.
  try{ window._reRenderUI = window._reRenderUI || function(){ console.warn('reRenderUI: not ready yet'); }; }catch(e){}

  // Re-render summary and entries, preserving any active per-school filter.
  function _reRenderUI(){
          try{
            const entries = loadLocalReports();
            const metrics = computeMetrics(entries);
            // update stored lastFiltered for other code
            window._cmass_report_lastFiltered = (metrics.filtered || []).slice();
            renderSummary(metrics);
            const activeSchool = _getActiveSchoolSelection();
            if (activeSchool){
              const bySchool = (metrics.filtered || []).filter(it => ((it.school||'').toString().trim() === activeSchool));
              renderEntries(bySchool);
            }else{
              renderEntries(metrics.filtered);
            }
          }catch(e){ console.warn('_reRenderUI failed', e); }
        }
        try{ window._reRenderUI = _reRenderUI; }catch(e){}
        try{ window.loadLocalReports = loadLocalReports; }catch(e){}
  // Expose core helpers for external scripts (reloadServerReports and tests)
  try{ window.computeMetrics = computeMetrics; }catch(e){}
  try{ window.renderSummary = renderSummary; }catch(e){}
  try{ window.renderEntries = renderEntries; }catch(e){}

        // wire office buttons
        function wireOfficeButtons(){
          try{
            const btnSave = qs('btnSaveOffice');
            const btnClear = qs('btnClearOffice');
            if (btnSave){ btnSave.addEventListener('click', function(){
              const payload = {
                checkinHour: qs('officeCheckinHour').value || '',
                checkinMinute: qs('officeCheckinMinute').value || '',
                internalHours: qs('officeInternalHours').value ? Number(qs('officeInternalHours').value) : 0,
                internalMinutes: qs('officeInternalMinutes').value ? Number(qs('officeInternalMinutes').value) : 0,
                endMinutes: qs('officeEndMinutes').value ? Number(qs('officeEndMinutes').value) : 0
              };
              const saved = saveOfficeData(payload);
              if (saved){ renderOfficeSection(); alert('\uc0ac\ubb34\uc2e4 \uae30\ub85d\uc774 \uc800\uc7a5\ub418\uc5c8\uc2b5\ub2c8\ub2e4.'); }
              else alert('\uc800\uc7a5\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.');
            }); }

            if (btnClear){ btnClear.addEventListener('click', function(){
              if (!confirm('\uc0ac\ubb34\uc2e4 \uae30\ub85d\uc744 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c?')) return;
              try{
                const raw = localStorage.getItem('cmass_office_reports') || '{}';
                const map = JSON.parse(raw || '{}');
                delete map[_officeStorageKey()];
                localStorage.setItem('cmass_office_reports', JSON.stringify(map));
                renderOfficeSection();
              }catch(e){ console.warn('clear office failed', e); }
            }); }
            // Copy summary to clipboard for KakaoTalk paste
            try{
              const btnCopy = qs('btnCopyKakao');
              if (btnCopy){ btnCopy.addEventListener('click', async function(){
                try{
                  const text = buildOfficeSummary();
                  if (!text) { alert('\uc694\uc57d\ud560 \ub0b4\uc6a9\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.'); return; }
                  // copy to clipboard
                  if (navigator.clipboard && navigator.clipboard.writeText){ await navigator.clipboard.writeText(text); alert('\uc694\uc57d\uc774 \ud074\ub9bd\ubcf4\ub4dc\uc5d0 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uce74\ud1a1\uc5d0 \ubd99\uc5ec\ub123\uae30\ud558\uc138\uc694.'); }
                  else {
                    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); alert('\uc694\uc57d\uc774 \ud074\ub9bd\ubcf4\ub4dc\uc5d0 \ubcf5\uc0ac\ub418\uc5c8\uc2b5\ub2c8\ub2e4. \uce74\ud1a1\uc5d0 \ubd99\uc5ec\ub123\uae30\ud558\uc138\uc694.');
                  }
                }catch(e){ console.warn('copy kakao failed', e); alert('\ubcf5\uc0ac\uc5d0 \uc2e4\ud328\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); }
              }); }
            }catch(e){}
          }catch(e){ /* tolerate */ }
        }

      // initial render from localStorage
      (async function(){
        try{
          // If meeting.html left an edited entry in sessionStorage, apply it first so
          // the report view reflects the most recent changes saved by the editor.
          try{ if (typeof applySessionEditIfPresent === 'function') await applySessionEditIfPresent().catch(()=>{}); }catch(_){ /* tolerate */ }

          const entries = loadLocalReports();
          const metrics = computeMetrics(entries);
          renderSummary(metrics);
          renderEntries(metrics.filtered);
          // render office section and wire buttons
          renderOfficeSection();
          wireOfficeButtons();
        }catch(e){ /* tolerate */ }

        // attach realtime listener to Firestore visit_entries once firebase is ready
        (async function attachRealtime(){
          try{
            if (!staff || !visitDate) return; // only attach when both provided
            await window.waitForFirebase().catch(()=>null);
            if (!window.firebaseDb) return;
            try{
              let q = window.firebaseDb.collection('visit_entries').where('staff','==', staff).where('visitDate','==', visitDate);
              const unsub = q.onSnapshot((snap)=>{
                try{
                  const docs = [];
                  snap.forEach(d=>{ const data = d.data(); data._id = d.id; docs.push(mapServerDocToEntry(data)); });
                  // If server returned no docs for this query, prefer localStorage view
                  // to avoid overwriting user's local entries with an empty server result.
                  const localAll = loadLocalReports() || [];
                  const localFiltered = (localAll||[]).filter(it => { try{ return (!visitDate || (String(it.visitDate||'').indexOf(visitDate)===0)) && (!staff || String(it.staff||'')===String(staff)); }catch(e){ return false; } });

                  if ((!docs || docs.length === 0) && (!localFiltered || localFiltered.length === 0)) { return; }

                  // Merge server docs with local entries, prefer server documents when server_id matches.
                  // However, if a server document is missing some fields (e.g. legacy docs without `staff` token)
                  // prefer filling those missing fields from the corresponding local entry when available.
                  const merged = [];
                  const serverById = {};
                  // index local entries by server_id (array) for possible enrichment/duplicates
                  const localById = {};
                  (localFiltered||[]).forEach(l => {
                    try{
                      const sid = String(l.server_id || l.serverId || '');
                      if (!sid) return;
                      localById[sid] = localById[sid] || [];
                      localById[sid].push(l);
                    }catch(e){}
                  });
                  docs.forEach(d => { if (d && d.server_id) serverById[String(d.server_id)] = d; });

                  // Start with server docs but enrich missing fields from local when possible.
                  // If multiple local entries share the same server_id, preserve them as additional
                  // entries rather than collapsing them into a single server doc.
                  docs.forEach(d => {
                    try{
                      if (!d) { merged.push(d); return; }
                      const sid = String(d.server_id || d.serverId || '');
                      const localList = sid && localById[sid] ? localById[sid].slice() : [];
                      if (localList && localList.length){
                        // Use first local item to enrich missing display fields on the server doc
                        const local = localList.shift();
                        const enriched = Object.assign({}, d);
                        if ((!enriched.staff || String(enriched.staff).trim() === '') && local.staff) enriched.staff = local.staff;
                        if ((!enriched.staffLabel || String(enriched.staffLabel).trim() === '') && local.staffLabel) enriched.staffLabel = local.staffLabel;
                        if ((!enriched.startHour || enriched.startHour === '') && local.startHour) enriched.startHour = local.startHour;
                        if ((!enriched.startMinute || enriched.startMinute === '') && local.startMinute) enriched.startMinute = local.startMinute;
                        if ((!enriched.duration || Number(enriched.duration) === 0) && local.duration) enriched.duration = local.duration;
                        merged.push(enriched);
                        // Any remaining local entries that share the same server_id but are distinct
                        // (for example, multiple sessions recorded locally before server consolidation)
                        // should be preserved as separate entries so they remain visible to the user.
                        localList.forEach(extraLocal => {
                          try{ merged.push(extraLocal); }catch(e){}
                        });
                      } else {
                        merged.push(d);
                      }
                    }catch(e){ merged.push(d); }
                  });

                  // Add local entries that are not represented on server (by server_id or by _savedAt)
                  localFiltered.forEach(l => {
                    try{
                      const sid = l.server_id || l.serverId || '';
                      // if it has a server id and serverById has been handled above, but there may be
                      // local entries without server_id or with server_id that wasn't in serverById
                      if (sid && serverById[String(sid)]) return; // already represented (or already appended above)
                      // try to detect by _savedAt match to avoid dupes
                      const exists = merged.find(mdoc => mdoc && mdoc._savedAt && l._savedAt && String(mdoc._savedAt) === String(l._savedAt));
                      if (!exists) merged.push(l);
                    }catch(e){}
                  });

                  const m = computeMetrics(merged || docs || []);
                  renderSummary(m);
                  renderEntries(m.filtered);
                }catch(e){ /* tolerate */ }
              }, (err)=>{ /* tolerate */ });
              window._cmass_report_unsub = unsub;
            }catch(e){ /* tolerate */ }
          }catch(e){ /* tolerate */ }
        })();
      })();

      // Wire buttons
      qs('btnClearSummary').addEventListener('click', async function(){
        try{
          if (!confirm('\uc815\ub9d0\ub85c \ud574\ub2f9 \ubc29\ubb38\uc77c\uc758 \ubcf4\uace0\uc11c\ub97c \ubaa8\ub450 \uc0ad\uc81c\ud558\uc2dc\uaca0\uc2b5\ub2c8\uae4c? \uc774 \uc791\uc5c5\uc740 \ub418\ub3cc\ub9b4 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4.')) return;
          // Remove matching entries from localStorage
          try{
            const arr = loadLocalReports();
            const before = arr.length;
            const filtered = arr.filter(it => {
              if (!it) return true;
              // keep entries that do NOT match the target date (or staff if provided)
              if (String(it.visitDate||'') !== String(visitDate)) return true;
              if (staff && String(it.staff||'') !== String(staff)) return true;
              return false; // remove this entry
            });
            if (filtered.length !== before){ localStorage.setItem('cmass_reports', JSON.stringify(filtered)); }
          }catch(lsErr){ console.warn('local clear failed', lsErr); }

          // Attempt server-side deletion of matching docs (delete all for that visitDate / staff)
          try{
            if (window.firebaseDb){
              // ensure anonymous auth before bulk deletes
              try{
                if (window.firebase && firebase.auth){
                  await ensureAnonymousAuth(firebase.auth());
                }
              }catch(authErr){ console.warn('anonymous auth before bulk delete failed', authErr); alert('\uc0ad\uc81c\ub97c \uc704\ud574 \uc775\uba85 \uc778\uc99d\uc774 \ud544\uc694\ud569\ub2c8\ub2e4. \ucf58\uc194\uc5d0\uc11c \uc775\uba85 \uc778\uc99d\uc744 \ud65c\uc131\ud654\ud588\ub294\uc9c0 \ud655\uc778\ud558\uc138\uc694.'); }

              await window.waitForFirebase().catch(()=>null);
              let q = window.firebaseDb.collection('visit_entries').where('visitDate','==', visitDate);
              if (staff) q = q.where('staff','==', staff);
              const snap = await q.get();
              const batchDeletes = [];
              snap.forEach(d => { batchDeletes.push(d.id); });
              // delete each doc (best-effort)
              for (const id of batchDeletes){
                try{ await window.firebaseDb.collection('visit_entries').doc(id).delete(); }catch(e){ console.warn('delete doc failed', id, e); }
              }
            }
          }catch(serverErr){ console.warn('server bulk delete failed', serverErr); alert('\uc11c\ubc84 \uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); }

          // Re-render or reload to reflect changes (preserve school filter)
          try{ _reRenderUI(); }catch(e){}
        }catch(e){ console.error('clear all handler', e); alert('\ubaa8\ub450 \uc0ad\uc81c \uc911 \uc624\ub958\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc744 \ud655\uc778\ud558\uc138\uc694.'); }
      });
      qs('backLink').addEventListener('click', function(ev){ ev.preventDefault(); const q = new URLSearchParams(); if (staff) q.set('staff', staff); if (visitDate) q.set('visitDate', visitDate); window.location.href = '/meeting.html' + (q.toString() ? ('?' + q.toString()) : ''); });

      // Test button wiring (best-effort)
      try{
        const tbtn = qs('btnRunTest'); if (tbtn){ tbtn.addEventListener('click', function(){ try{ if (window._cmass_runSyncTest) window._cmass_runSyncTest(); else alert('\ud14c\uc2a4\ud2b8 \ud568\uc218\uac00 \uc900\ube44\ub418\uc9c0 \uc54a\uc558\uc2b5\ub2c8\ub2e4. \ucf58\uc194\uc5d0 \ud568\uc218\ub97c \ud655\uc778\ud558\uc138\uc694.'); }catch(e){ console.error(e); alert('\ud14c\uc2a4\ud2b8 \ud638\ucd9c \uc911 \uc624\ub958'); } }); }
      }catch(e){}
    })();
    