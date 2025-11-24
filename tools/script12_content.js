<script>
    // Wire up duration buttons -> hidden #duration so existing handlers continue to work
    (function(){
      function qs(id){ return document.getElementById(id); }
      function clearActive(container){ Array.from(container.querySelectorAll('button.dur-btn')).forEach(b=>b.classList.remove('active')); }
      function markActive(container, value){ const btn = container.querySelector('button.dur-btn[data-min="'+value+'"]'); if (btn) btn.classList.add('active'); }
      function init(){
        const container = qs('durationBtns');
        const hidden = qs('duration');
        if (!container || !hidden) return;
        container.addEventListener('click', function(ev){
          const btn = ev.target.closest('button.dur-btn');
          if (!btn) return;
          try{ clearActive(container); btn.classList.add('active'); const val = btn.getAttribute('data-min') || ''; hidden.value = val; hidden.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){}
        }, true);

        // initialize from existing hidden value (if any)
        try{ if (hidden.value){ markActive(container, hidden.value); } }catch(e){}
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    })();

      // If an edit entry was set from report.html, prefill the form for editing.
      (function(){
        function qs(id){ return document.getElementById(id); }
        function trimText(s){ try{return String(s||'').trim(); }catch(e){return ''} }
        function activateButtons(containerSelector, btnClass, values, single){
          try{
            const container = document.querySelector(containerSelector); if (!container) return;
            const buttons = Array.from(container.querySelectorAll('button.'+btnClass));
            if (!Array.isArray(values)) values = [];
            const set = new Set(values.map(v=>String(v||'').trim()));
            if (single){
              // pick first matching value
              let chosen = null;
              for (const b of buttons){ const t = trimText(b.textContent); if (set.has(t)){ chosen = b; break; } }
              buttons.forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-pressed','false'); });
              if (chosen){ chosen.classList.add('active'); chosen.setAttribute('aria-pressed','true'); }
            } else {
              buttons.forEach(b=>{ const t = trimText(b.textContent); if (set.has(t)){ b.classList.add('active'); b.setAttribute('aria-pressed','true'); } else { b.classList.remove('active'); b.setAttribute('aria-pressed','false'); } });
            }
          }catch(e){}
        }

        function setDuration(val){
          try{
            const hidden = qs('duration'); const container = qs('durationBtns');
            if (!hidden) return; hidden.value = val || '';
            if (container){ Array.from(container.querySelectorAll('button.dur-btn')).forEach(b=>b.classList.remove('active'));
              const btn = container.querySelector('button.dur-btn[data-min="'+String(val)+'"]'); if (btn) btn.classList.add('active'); }
            try{ hidden.dispatchEvent(new Event('change',{bubbles:true})); }catch(e){}
          }catch(e){}
        }

        function applyEntry(entry){
          try{
            if (!entry) return;
            // staff
            try{ if (entry.staff){ const s = qs('staff'); if (s){ s.value = entry.staff; s.dispatchEvent(new Event('change',{bubbles:true})); } } }catch(e){}
            // visitDate
            try{ if (entry.visitDate){ const d = qs('visitDate'); if (d){ d.value = entry.visitDate; d.dispatchEvent(new Event('change',{bubbles:true})); } } }catch(e){}
            // region & school (region may not be populated yet)
            try {
              if (entry.region) {
                const r = qs('regionSelect');
                if (r) {
                  r.value = entry.region;
                  r.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }
            } catch (e) {}
            // school select logic (separate try/catch)
            try {
              if (entry.school) {
                const attemptSetSchool = () => {
                  const sh = qs('schoolSelect');
                  if (sh) {
                    try {
                      sh.value = entry.school;
                      sh.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (e) {}
                    return true;
                  }
                  return false;
                };
                // try immediately and retry a few times if needed
                let tries = 0;
                const t = setInterval(() => {
                  tries++;
                  const ok = attemptSetSchool();
                  if (ok || tries > 12) clearInterval(t);
                }, 150);
              }
            } catch (e) {}

            // time
            try{
              if (entry.startHour){ const h = qs('startHour'); if (h){ h.value = String(entry.startHour); h.dispatchEvent(new Event('change',{bubbles:true})); } }
              if (entry.startMinute){ const m = qs('startMinute'); if (m){ m.value = String(entry.startMinute); m.dispatchEvent(new Event('change',{bubbles:true})); } }

              // If duration is present, use the canonical setter. Otherwise if an endTime
              // is provided, compute duration from start and end and set it so computeEndTime
              // and UI duration buttons reflect the stored visit length.
              try{
                const hasDur = entry.duration !== undefined && entry.duration !== null && String(entry.duration).trim() !== '';
                const hasEnd = entry.endTime || entry.visitEnd || entry.visitend || '';
                if (hasDur){ setDuration(entry.duration); }
                else if (hasEnd){
                  // normalize endTime string
                  const rawEnd = (entry.endTime || entry.visitEnd || entry.visitend || '').toString().trim();
                  const outEl = qs('endTime'); if (outEl) outEl.value = rawEnd;
                  // try compute duration from startHour/startMinute to endTime
                  try{
                    const sh = qs('startHour') && qs('startHour').value ? Number(qs('startHour').value) : NaN;
                    const sm = qs('startMinute') && qs('startMinute').value ? Number(qs('startMinute').value) : NaN;
                    if (!Number.isNaN(sh) && !Number.isNaN(sm) && rawEnd.indexOf(':') !== -1){
                      const parts = rawEnd.split(':'); const eh = Number(parts[0]); const em = Number(parts[1]);
                      if (!Number.isNaN(eh) && !Number.isNaN(em)){
                        let startMin = sh*60 + sm; let endMin = eh*60 + em; let diff = endMin - startMin; if (diff < 0) diff += 24*60;
                        if (diff > 0){ setDuration(String(diff)); }
                      }
                    }
                  }catch(e){}
                }
              }catch(e){}
            }catch(e){}

            // subjects (single) and activities (multi)
            try{ activateButtons('#subjects','subject-btn', entry.subjects || [], true); }catch(e){}
            try{ activateButtons('#activities','subject-btn', entry.activities || [], false); }catch(e){}
            // favor
            try{ if (entry.favor){ activateButtons('#favorBtns','favor-btn', [entry.favor], true); } }catch(e){}

            // other fields
            try{ if (entry.teacherName) qs('teacherName').value = entry.teacherName; }catch(e){}
            try{ if (entry.publisher) qs('publisher').value = entry.publisher; }catch(e){}
            try{ if (entry.phone) qs('phone').value = entry.phone; }catch(e){}
            try{ if (entry.email) qs('email').value = entry.email; }catch(e){}
            try{ if (entry.requests) qs('requests').value = entry.requests; }catch(e){}
            try{ if (entry.notes) qs('notes').value = entry.notes; }catch(e){}
            try{ if (entry.deliveries) qs('deliveries').value = entry.deliveries; }catch(e){}
            try{ if (entry.followUp) qs('followUp').value = entry.followUp; }catch(e){}

            // endTime will be auto-calculated by existing computeEndTime listener
          }catch(e){}
        }

        function tryApply(){
          try{
            if (!window.sessionStorage) return;
            const raw = sessionStorage.getItem('cmass:edit_entry');
            if (!raw) return;
            let entry = null;
            try{ entry = JSON.parse(raw); }catch(e){ entry = null; }
            if (!entry) return;

            // Robust apply: attempt to apply entry now and retry a few times if some inputs
            // are not present yet or get overwritten by later scripts. This prevents a
            // race where defaulting code or dynamic UI modifications clear applied values.
            let attempts = 0;
            const maxAttempts = 12; // ~12 * 150ms = ~1.8s max retry window
            const iv = setInterval(()=>{
              try{
                applyEntry(entry);
                attempts++;
                // verify that at least one key text field was populated
                const teacherOk = (document.getElementById('teacherName') && document.getElementById('teacherName').value && String(document.getElementById('teacherName').value).trim() !== '');
                const notesOk = (document.getElementById('notes') && document.getElementById('notes').value && String(document.getElementById('notes').value).trim() !== '');
                const phoneOk = (document.getElementById('phone') && document.getElementById('phone').value && String(document.getElementById('phone').value).trim() !== '');
                if (teacherOk || notesOk || phoneOk || attempts >= maxAttempts){ clearInterval(iv); }
              }catch(e){ clearInterval(iv); }
            }, 150);

            // keep edit_entry until save completes; do not remove here to allow submit logic to know it's an edit
          }catch(e){}
        }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(tryApply, 120); }); else setTimeout(tryApply, 120);

    // populateTimeSelectors removed: time selects are left uninitialized so edit flow controls values explicitly
    // Lightweight initializer: ensure startHour and startMinute have option elements so the
    // dropdowns are usable in the UI. This does NOT auto-select a value (no defaulting).
    (function(){
      // Lightweight initializer: ensure startHour and startMinute have option elements so the
      // dropdowns are usable in the UI. This does NOT auto-select a value (no defaulting).
      // ...existing code...
    })();
    // If the user arrived here from input.html (or via our Next navigation), prefer staff+visitDate
    // populated from sessionStorage (set by input.html) and keep only the staff query param in the URL.
    (function(){
      try{
        const params = new URLSearchParams(location.search);
        const ref = document.referrer || '';

        // Try sessionStorage values first (set by input.html) — more reliable across rewrites
  let nextToken = null;
  let nextLabel = null;
  let nextDate = null;
  let nextRegion = null;
  let nextSchool = null;
        try{
          if (window.sessionStorage){
            nextToken = sessionStorage.getItem('cmass:next_staff_token') || null;
            nextLabel = sessionStorage.getItem('cmass:next_staff_label') || null;
            nextDate = sessionStorage.getItem('cmass:next_visitDate') || null;
            nextRegion = sessionStorage.getItem('cmass:next_region') || null;
            // input.html may also set next_school to let meeting.html pre-select the school
            nextSchool = sessionStorage.getItem('cmass:next_school') || null;
          }
        }catch(e){/* ignore */}

        function slugifyStaff(val){
          try{
            if(!val) return '';
            const s = String(val).trim();
            const ascii = s.normalize ? s.normalize('NFKD') : s;
            return ascii.toLowerCase().replace(/[^a-z0-9]/g,'');
          }catch(e){ return ''; }
        }

  // prefer explicit staff param in URL, otherwise sessionStorage token, otherwise staff select value
  const urlStaff = params.get('staff');
  // normalize incoming staff token from URL/session to canonical ascii slug
  const normalizedUrlStaff = slugifyStaff(urlStaff);
  const normalizedNext = slugifyStaff(nextToken);
  const fromSelect = slugifyStaff((document.getElementById('staff') && document.getElementById('staff').value) || '');
  const staffToken = (normalizedUrlStaff) ? normalizedUrlStaff : (normalizedNext || fromSelect || '');

        if (staffToken){
          // set staff select to token if possible and set internal globals
          try{
            const sel = document.getElementById('staff');
            if (sel){ sel.value = staffToken; sel.dispatchEvent(new Event('change', { bubbles: true })); }
            if (nextLabel) {
              // keep a readable label for topline and other UI
              window._cmass_staffParam = nextLabel;
            }
            if (nextToken) {
              window._cmass_staffToken = nextToken;
            }
            // If input provided a visitDate, use it. Otherwise default to today.
            try{
              const d = document.getElementById('visitDate');
              const today = (new Date()).toISOString().slice(0,10);
              const useDate = (nextDate && String(nextDate).trim()) ? nextDate : today;
              if (d && !d.value) { d.value = useDate; d.dispatchEvent(new Event('change',{ bubbles: true })); }
            }catch(e){}
          }catch(e){}
        }

        // Apply region selection from input if present (do NOT add it to the URL)
        try{
          if (nextRegion && String(nextRegion).trim()){
            const regSel = document.getElementById('regionSelect');
            if (regSel) {
              regSel.value = nextRegion;
              regSel.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch (e) {
          console.warn('Region selection error:', e);
        }

        // If a school was provided by input.html, apply it (attempt after regions are populated)
        try{
          if (nextSchool && String(nextSchool).trim()){
            const schoolEl = document.getElementById('schoolSelect');
            if (schoolEl) {
              schoolEl.value = nextSchool;
              schoolEl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        } catch (e) {
          console.warn('School selection error:', e);
        }
      }catch(e){}

      // Only keep the staff query param in the address bar (no date/region/school)
      try{
        const q = staffToken ? ('?staff='+encodeURIComponent(staffToken)) : '';
        const newUrl = location.pathname + q;
        if (newUrl !== location.pathname + location.search){
          history.replaceState({}, '', newUrl);
        }
      }catch(e){}

      // cleanup sessionStorage keys we used
  // cleanup sessionStorage keys we used (consume next_school as well)
  try{ if (window.sessionStorage){ sessionStorage.removeItem('cmass:next_staff_token'); sessionStorage.removeItem('cmass:next_staff_label'); sessionStorage.removeItem('cmass:next_visitDate'); sessionStorage.removeItem('cmass:next_region'); sessionStorage.removeItem('cmass:next_school'); } }catch(e){}
    })();
  </script>
