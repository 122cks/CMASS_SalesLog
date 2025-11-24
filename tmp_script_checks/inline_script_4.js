
    // One-time automatic service-worker & cache cleanup to ensure clients load the
    // newest JS/CSS. This runs only once per-browser (flagged in localStorage)
    // and reloads the page with `sw_cleared=1` to avoid loops.
    (function(){
      try{
        const params = new URLSearchParams(window.location.search);
        if (params.get('sw_cleared') === '1') { try{ localStorage.setItem('_cmass_sw_cleared','1'); }catch(e){} return; }
        if (localStorage.getItem('_cmass_sw_cleared') === '1') return;
        (async function(){
          try{
            // diag_inject disabled in production build (no-op placeholder)
            try{ const _p = (new URLSearchParams(window.location.search || '')); if (_p.get('diag_inject')) { console.info('diag_inject requested but disabled in this build'); } }catch(e){}
              try{
                const sKeys = Object.keys(sessionStorage || {});
                sKeys.forEach(k=>{ try{ if (/^(cmass|_cmass)|draft/i.test(k) || k.indexOf('geocode')!==-1){ sessionStorage.removeItem(k); } }catch(e){} });
              }catch(e){ console.warn('sessionStorage clear step failed', e); }
              // Also attempt to clear caches and service workers to be safe
              try{ if (window.caches && caches.keys) { caches.keys().then(keys=> Promise.all(keys.map(k=>caches.delete(k).catch(()=>{})))).catch(()=>{}); } }catch(e){}
              try{ if ('serviceWorker' in navigator){ navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r=>r.unregister().catch(()=>{}))).catch(()=>{}); } }catch(e){}
          <div style="width:100%">
            <div style="display:flex;flex-direction:column;gap:12px">
                  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
                    <div style="flex:1 1 320px;min-width:220px">
                      <div style="font-weight:800;margin-bottom:.4rem">과목 분포</div>
                      <canvas id="subjectsChart" aria-label="과목 분포 차트"></canvas>
                      <div id="__backend_status" class="small" style="margin-top:6px;color:#a33"></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

  <!-- Inserted renderer from backup to restore dashboard rendering -->
  <script>
    // Lightweight fallback to extract staff/user token from the URL query.
    // Some builds expect `getStaffFromQuery()` to exist globally; provide a
    // defensive implementation so the renderer doesn't throw if the helper
    // lives in another file or was omitted by accident.
    function getStaffFromQuery(){
      try{
        const params = new URLSearchParams(window.location.search || '');
        // Accept both `staff` and legacy `user` query keys.
        const v = params.get('staff') || params.get('user') || '';
        return (v || '').toString().trim();
      }catch(e){ return ''; }
    }

    async function loadPersonalVisits(){
      const staff = getStaffFromQuery();
      try { const lbl = document.getElementById('staffLabel'); if (lbl) lbl.textContent = staff ? ('담당자: ' + staff) : ''; } catch(e){}
      if (!staff){ document.getElementById('noAuth').style.display='block'; document.getElementById('loading').style.display='none'; return; }

      // UI hooks
      const startEl = document.getElementById('filterStart');
      const endEl = document.getElementById('filterEnd');
      const btnYesterday = document.getElementById('btnYesterday');
      const btnToday = document.getElementById('btnToday');
      const btnLastWeek = document.getElementById('btnLastWeek');
      const btnThisWeek = document.getElementById('btnThisWeek');
      const btnLastMonth = document.getElementById('btnLastMonth');
      const btnThisMonth = document.getElementById('btnThisMonth');
      const subjectFilterEl = document.getElementById('subjectFilter');
      const loadMoreBtn = document.getElementById('loadMoreBtn');
      const exportCsvBtn = document.getElementById('exportCsvBtn');
      const loadingEl = document.getElementById('loading');
      const loadingSpinner = document.getElementById('loadingSpinner');

      function showLoading(msg){ if (loadingEl) { loadingEl.style.display='block'; loadingEl.textContent = msg || '데이터를 불러오는 중...'; } if (loadingSpinner) loadingSpinner.style.display = '' }
      function hideLoading(){ if (loadingEl) loadingEl.style.display='none'; if (loadingSpinner) loadingSpinner.style.display = 'none' }

      // helper: format Date -> yyyy-mm-dd
      function fmt(d){ if (!d) return ''; const y = d.getFullYear(); const m = (d.getMonth()+1).toString().padStart(2,'0'); const day = d.getDate().toString().padStart(2,'0'); return `${y}-${m}-${day}`; }

      // compute week (Mon-Sun) for date 'ref'
      function weekRangeFor(ref){ const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()); const dow = d.getDay(); const diffToMon = (dow === 0) ? -6 : (1 - dow); const mon = new Date(d); mon.setDate(d.getDate() + diffToMon); const sun = new Date(mon); sun.setDate(mon.getDate() + 6); return [mon, sun]; }

      // compute month range for year,month index
      function monthRangeFor(year, monthIndex){ const start = new Date(year, monthIndex, 1); const end = new Date(year, monthIndex + 1, 0); return [start, end]; }

      // set inputs and optionally reload data
      function setRangeAndReload(sDate, eDate, reload=true){ if (!startEl || !endEl) return; startEl.value = sDate; endEl.value = eDate; if (reload) { renderAndReload(); } }

      // renderAndReload: call loadPersonalVisits again by re-invoking fetch flow
      function renderAndReload(){ try{ if (typeof loadPersonalVisits === 'function') { loadPersonalVisits(); } }catch(e){ console.warn('reload failed', e); } }

      // wire quick buttons
      if (btnToday) btnToday.addEventListener('click', ()=>{ const t = new Date(); setRangeAndReload(fmt(t), fmt(t)); });
      if (btnYesterday) btnYesterday.addEventListener('click', ()=>{ const t = new Date(); t.setDate(t.getDate() - 1); setRangeAndReload(fmt(t), fmt(t)); });
      if (btnThisWeek) btnThisWeek.addEventListener('click', ()=>{ const [mon, sun] = weekRangeFor(new Date()); setRangeAndReload(fmt(mon), fmt(sun)); });
      if (btnLastWeek) btnLastWeek.addEventListener('click', ()=>{ const ref = new Date(); ref.setDate(ref.getDate() - 7); const [mon, sun] = weekRangeFor(ref); setRangeAndReload(fmt(mon), fmt(sun)); });
      if (btnThisMonth) btnThisMonth.addEventListener('click', ()=>{ const now = new Date(); const [s,e] = monthRangeFor(now.getFullYear(), now.getMonth()); setRangeAndReload(fmt(s), fmt(e)); });
      if (btnLastMonth) btnLastMonth.addEventListener('click', ()=>{ const now = new Date(); const [s,e] = monthRangeFor(now.getFullYear(), now.getMonth()-1); setRangeAndReload(fmt(s), fmt(e)); });

      // wire apply/clear buttons to reload
      const filterApplyBtn = document.getElementById('filterApply');
      const filterClearBtn = document.getElementById('filterClear');
      if (filterApplyBtn) filterApplyBtn.addEventListener('click', ()=>{ renderAndReload(); });
      if (filterClearBtn) filterClearBtn.addEventListener('click', ()=>{ if (startEl) startEl.value=''; if (endEl) endEl.value=''; renderAndReload(); });

      // base staff name without title suffix
      const base = staff.replace(/\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)$/,'').trim();

      // Build initial query params
      const userToken = (new URLSearchParams(window.location.search)).get('user') || '';
      const buildUrl = (cursor) => {
        const params = new URLSearchParams();
        // Allow overriding API base via query string for debugging, e.g. ?api=https://api.example.com
        const qs = new URLSearchParams(window.location.search || '');
        const apiBase = (qs.get('api') || window.__CMASS_API_BASE || '').toString().trim();
        params.set('useEntries','true');
        params.set('pageSize','100');
        if (userToken) params.set('user', userToken);
        const sVal = startEl && startEl.value ? startEl.value : '';
        const eVal = endEl && endEl.value ? endEl.value : '';
        const subj = subjectFilterEl && subjectFilterEl.value ? subjectFilterEl.value : '';
        if (sVal) params.set('start', sVal);
        if (eVal) params.set('end', eVal);
        if (subj) params.set('subject', subj);
        if (cursor) params.set('cursor', cursor);
        const path = '/api/visits?' + params.toString();
        return apiBase ? (apiBase.replace(/\/$/, '') + path) : path;
      };

      try{
        try{
          if (startEl && endEl && !startEl.value && !endEl.value){
            const today = new Date();
            const isMonday = (today.getDay() === 1);
            const ref = new Date(today);
            if (isMonday){ ref.setDate(ref.getDate() - 7); }
            const [dMon, dSun] = weekRangeFor(ref);
            startEl.value = fmt(dMon);
            endEl.value = fmt(dSun);
          }
        }catch(e){ console.warn('default range calc failed', e); }

        showLoading('데이터를 불러오는 중...');
        window._visitsAccum = [];
        window._visitsNextCursor = null;

        const url = buildUrl(null);
        let j = null;
        try{
          const res = await fetch(url);
          j = await res.json();
          if (!j || !j.ok) { throw new Error('invalid_response'); }
        }catch(fetchErr){
          console.warn('fetch /api/visits failed', fetchErr);
          try{ const bs = document.getElementById('__backend_status'); if (bs) bs.textContent = '백엔드 응답 실패, 로컬 모의데이터로 대체합니다.'; }catch(e){}
          // show debug panel
          try{
            let dbg = document.getElementById('__fetch_debug');
            if (!dbg){ dbg = document.createElement('pre'); dbg.id = '__fetch_debug'; dbg.style.maxHeight = '220px'; dbg.style.overflow = 'auto'; dbg.style.padding = '.6rem'; dbg.style.background = '#fff7f7'; dbg.style.border = '1px solid #ffdede'; dbg.style.marginTop = '8px'; loadingEl.parentNode && loadingEl.parentNode.insertBefore(dbg, loadingEl.nextSibling); }
            dbg.textContent = 'Fetch failed: ' + (fetchErr && fetchErr.message) + '\nURL: ' + url;
          }catch(e){}

          // Fallback strategy: if server API fails, try reading from Firestore `visit_entries` (if firebase is available).
          // If Firestore isn't available or the query fails, fall back to local mock data.
          let _usedFirestore = false;
          try{
            // Initialize firebase (compat) locally if script is present but not initialized yet
            if (!window.firebaseDb && typeof window.firebase !== 'undefined'){
              try{
                const firebaseConfig = {
                  apiKey: "AIzaSyARdXNfFCUShNeFXV8cTDzFbKa4GId5EvU",
                  authDomain: "cmass-sales.firebaseapp.com",
                  projectId: "cmass-sales",
                  storageBucket: "cmass-sales.firebasestorage.app",
                  messagingSenderId: "918981476485",
                  appId: "1:918981476485:web:7939150e23500e2703a9ec",
                  measurementId: "G-9188JJXRWX"
                };
                try{ const app = firebase.initializeApp(firebaseConfig); const db = firebase.firestore(); window.firebaseDb = db; }catch(e){}
              }catch(e){}
            }

            if (window.firebaseDb){
              try{
                // Read visit_entries collection (client-side filtering by staff is applied below)
                const snap = await window.firebaseDb.collection('visit_entries').get();
                const docs = (snap && Array.isArray(snap.docs)) ? snap.docs.map(d=> (d && typeof d.data === 'function') ? d.data() : null).filter(Boolean) : [];
                if (docs && docs.length){ j = { ok: true, rows: docs }; _usedFirestore = true; try{ const bs2 = document.getElementById('__backend_status'); if (bs2) bs2.textContent = '백엔드(파이어스토어)에서 데이터 로드 완료.'; }catch(e){} }
              }catch(e){ console.warn('firestore read failed', e); }
            }
          }catch(e){ console.warn('firestore fallback failed', e); }

          if (!_usedFirestore){
            // Final fallback: local mock data
            j = { ok: true, rows: generateMockVisits() };
          }
        }
  const rows = Array.isArray(j.rows) ? j.rows : [];
        try{
          const params = new URLSearchParams(window.location.search);
          const debug = params.get('debug');
          if (loadingEl) loadingEl.textContent = '가져온 행 수: ' + rows.length;
          if (debug === '1'){
            let dbg = document.getElementById('__fetch_debug');
            if (!dbg){ dbg = document.createElement('pre'); dbg.id = '__fetch_debug'; dbg.style.maxHeight = '220px'; dbg.style.overflow = 'auto'; dbg.style.padding = '.6rem'; dbg.style.background = '#fbfdff'; dbg.style.border = '1px solid #eef2ff'; dbg.style.marginTop = '8px'; loadingEl.parentNode && loadingEl.parentNode.insertBefore(dbg, loadingEl.nextSibling); }
            dbg.textContent = JSON.stringify(j, null, 2);
          }
        }catch(e){ console.warn('debug UI update failed', e); }

        if (staff) {
          try{
            // Match staff case-insensitively to tolerate query param capitalization
            const staffNorm = (''+staff).toString().trim().toLowerCase();
            window._visitsAccum = rows.filter(r => ((r.staff||'').toString().trim().toLowerCase()) === staffNorm).slice();
          }catch(e){ window._visitsAccum = rows.slice(); }
        } else { window._visitsAccum = rows.slice(); }
        window._visitsNextCursor = j.nextCursor || null;

        if (window._visitsNextCursor) { loadMoreBtn.style.display = ''; loadMoreBtn.disabled = false; }
        else { loadMoreBtn.style.display = 'none'; }
        if (window._visitsAccum.length) exportCsvBtn.style.display = ''; else exportCsvBtn.style.display = 'none';

        if (!loadMoreBtn.dataset.bound){ loadMoreBtn.addEventListener('click', async ()=>{
          if (!window._visitsNextCursor) return; loadMoreBtn.disabled = true; loadMoreBtn.textContent = '불러오는 중...';
          try{ const moreUrl = buildUrl(window._visitsNextCursor); const r2 = await fetch(moreUrl); const j2 = await r2.json(); if (j2 && j2.ok && Array.isArray(j2.rows)){ window._visitsAccum = window._visitsAccum.concat(j2.rows); window._visitsNextCursor = j2.nextCursor || null; if (!window._visitsNextCursor) { loadMoreBtn.style.display = 'none'; } } }catch(e){ console.warn('load more failed', e); }
          loadMoreBtn.disabled = false; loadMoreBtn.textContent = '더 불러오기';
          renderFromVisitEntries(window._visitsAccum);
        }); loadMoreBtn.dataset.bound = '1'; }

        if (!exportCsvBtn.dataset.bound){ exportCsvBtn.addEventListener('click', ()=>{
          const notes = collectNotesFromEntries(window._visitsAccum);
          if (!notes.length){ alert('내보낼 특이사항이 없습니다.'); return; }
          const csvRows = [['일자','학교','과목','선생님','특이사항']].concat(notes.map(r=>[r.date||'', r.school||'', r.subject||'', r.teacher||'', (r.note||'').replace(/\n/g,' ')]));
          const csv = csvRows.map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""') }"`).join(',')).join('\n');
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = 'notes_export.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        }); exportCsvBtn.dataset.bound = '1'; }

        renderFromVisitEntries(window._visitsAccum);
      }catch(e){ console.warn('loadPersonalVisits failed', e); document.getElementById('loading').textContent = '불러오기 중 오류: ' + (e && e.message); }
      finally{ hideLoading(); document.getElementById('dashboardArea').style.display='block'; }

      function collectNotesFromEntries(entries){ const out = []; (entries||[]).forEach(r => { const note = (r.conversation || r.conversation || '').toString().trim(); if (note) out.push({ date: r.visitDate || '', school: r.school || '', subject: r.subject || '', teacher: r.teacher || '', note }); }); return out; }

      // --- Debug/mock helpers ---
      function generateMockVisits(){
        // small set of realistic-looking rows for visual verification
        const today = new Date();
        function d(days){ const t = new Date(today); t.setDate(t.getDate()-days); return t.toISOString(); }
        return [
          { visitDate: d(0), school: '고양고등학교', subject: '정보', teacher: '김선생', visitStart: '09:10', visitEnd: '09:40', conversation: '진로상담 및 교재 안내', staff: getStaffFromQuery() },
          { visitDate: d(1), school: '덕양중학교', subject: '미술', teacher: '박선생', visitStart: '11:00', visitEnd: '11:30', conversation: '교구 데모', staff: getStaffFromQuery() },
          { visitDate: d(3), school: '일산초등학교', subject: '체육', teacher: '이선생', visitStart: '14:00', visitEnd: '14:20', conversation: '체육수업 보조 관련 상담', staff: getStaffFromQuery() }
        ];
      }

      function createPersonalMap(){ try{ if (typeof L === 'undefined') { console.warn('Leaflet (L) is not loaded'); return null; } if (window.personalMap && typeof window.personalMap.setView === 'function') return window.personalMap; const map = L.map('personalMap', { preferCanvas: true }).setView([37.5665,126.9780], 10); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map); window.personalMap = map; try{ window.personalMarkerCluster = L.markerClusterGroup({ chunkedLoading: true }); window.personalMap.addLayer(window.personalMarkerCluster); }catch(e){ console.warn('marker cluster init failed', e); } try{ const info = L.control({ position: 'topright' }); info.onAdd = function(){ const div = L.DomUtil.create('div','small'); div.style.background = 'rgba(255,255,255,0.95)'; div.style.padding = '6px 8px'; div.style.borderRadius = '8px'; div.style.boxShadow = '0 6px 18px rgba(10,20,60,0.06)'; div.id = 'personalMapInfo'; div.innerHTML = '지도 로딩 중...'; return div; }; info.addTo(map); }catch(e){ console.warn('personalMapInfo control init failed', e); } return map; }catch(e){ console.warn('createPersonalMap failed', e); return null; } }

      async function loadGeocodes(){ if (window._geocodeCache) return window._geocodeCache; try{ const r = await fetch('/geocodes.json'); if (!r.ok) { window._geocodeCache = {}; return window._geocodeCache; } const j = await r.json(); window._geocodeCache = j || {}; return window._geocodeCache; }catch(e){ console.warn('loadGeocodes failed', e); window._geocodeCache = {}; return window._geocodeCache; } }

      // Geocode with localStorage cache, inflight dedupe and polite rate-limiting to Nominatim.
      async function geocodeAddress(address){
        if (!address) return null;
        try{
          // canonical key
          const key = String(address).trim();
          const cacheKey = 'cmass_geocode_cache_v1';

          // fast in-memory cache (per-page)
          window._geocodeMemoryCache = window._geocodeMemoryCache || {};
          if (window._geocodeMemoryCache[key]) return window._geocodeMemoryCache[key];

          // persistent cache in localStorage (store object: { lat, lon, display_name, ts, source })
          let persistent = {};
          try{ persistent = JSON.parse(localStorage.getItem(cacheKey) || '{}'); }catch(e){ persistent = {}; }
          const p = persistent[key];
          if (p && p.lat && p.lon){
            // respect cached value
            window._geocodeMemoryCache[key] = p;
            return p;
          }

          // dedupe concurrent requests for the same address
          window._geocodeInflight = window._geocodeInflight || {};
          if (window._geocodeInflight[key]) return await window._geocodeInflight[key];

          // polite global throttle: at most ~1 req/sec per tab to avoid spamming Nominatim
          window._nominatimLast = window._nominatimLast || 0;
          const minGap = 1100; // ms

          const attempt = async () => {
            // wait if last request was too recent
            const now = Date.now();
            const since = now - (window._nominatimLast || 0);
            if (since < minGap){ await new Promise(r => setTimeout(r, minGap - since)); }

            const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address + ', 대한민국');
            window._nominatimLast = Date.now();
            const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!resp.ok) throw new Error('nominatim-bad-status:' + resp.status);
            const arr = await resp.json();
            if (!Array.isArray(arr) || !arr.length) return null;
            const one = arr[0];
            const res = { lat: Number(one.lat), lon: Number(one.lon), display_name: one.display_name, ts: Date.now(), source: 'nominatim' };
            return res;
          };

          // store the inflight promise
          const inflightP = (async () => {
            try{
              // retry a couple times on network errors
              let lastErr = null;
              for (let i=0;i<3;i++){
                try{ const r = await attempt(); if (r) return r; lastErr = new Error('no-results'); break; }catch(err){ lastErr = err; const backoff = 200 * Math.pow(2, i); await new Promise(r=>setTimeout(r, backoff)); }
              }
              throw lastErr;
            }catch(e){
              // don't throw to callers - return null on failure
              console.warn('geocodeAddress: request failed for', key, e);
              return null;
            }
          })();
          window._geocodeInflight[key] = inflightP;

          const result = await inflightP;
          delete window._geocodeInflight[key];
          if (result){
            // persist and memory-cache
            window._geocodeMemoryCache[key] = result;
            try{ persistent[key] = result; localStorage.setItem(cacheKey, JSON.stringify(persistent)); }catch(e){}
            return result;
          }
          return null;
        }catch(e){ console.warn('geocodeAddress failed', e); return null; }
      }

      async function updateMapFromVisits(visits){
        try{
          if (!Array.isArray(visits)) visits = window._visitsAccum || [];
          const map = createPersonalMap();
          if (!map || typeof map.setView !== 'function'){
            console.warn('map not ready or createPersonalMap failed', map);
            return;
          }

          // load local geocode table (may be empty)
          const geos = await loadGeocodes() || {};

          // ensure marker cluster exists
          try{ if (!window.personalMarkerCluster && typeof L !== 'undefined') window.personalMarkerCluster = L.markerClusterGroup(); }catch(e){ console.warn('marker cluster init guard failed', e); }
          if (!window.personalMarkerCluster){ console.warn('marker cluster missing; skipping map plot'); return; }
          window.personalMarkerCluster.clearLayers();

          const schoolSet = new Set((visits||[]).map(v => (v.school||'').toString().trim()).filter(Boolean));
          let plotted = 0;
          const bounds = [];

          // iterate schools: try to use preloaded geos, then persistent cache, then Nominatim (polite)
          for (const school of Array.from(schoolSet)){
            try{
              let g = geos[school] || null;
              // also check persistent localStorage cache used by geocodeAddress
              try{
                const storeKey = 'cmass_geocode_cache_v1';
                const ls = JSON.parse(localStorage.getItem(storeKey) || '{}');
                if (!g && ls && ls[school] && ls[school].lat && ls[school].lon) g = ls[school];
              }catch(e){}

              if (!g) continue; // no geocode data available and we won't attempt arbitrary name->geocode here

              let lat = Number(g.lat || g.latitude || g.y || (Array.isArray(g) && g[0]));
              let lon = Number(g.lon || g.longitude || g.x || (Array.isArray(g) && g[1]));

              // If still missing, try to fallback to NEIS address + geocode (use geocodeAddress which is polite/deduped)
              if ((!lat || !lon || isNaN(lat) || isNaN(lon)) && g && g.neis && g.neis.ORG_RDNMA){
                try{
                  const addr = (g.neis.ORG_RDNMA || '').toString().trim();
                  if (addr){
                    const geo = await geocodeAddress(addr);
                    if (geo && geo.lat && geo.lon){
                      lat = Number(geo.lat); lon = Number(geo.lon);
                      // persist into both the geos object and localStorage cache
                      try{ g.lat = lat; g.lon = lon; geos[school] = g; window._geocodeCache = geos; }catch(e){}
                      try{ const storeKey = 'cmass_geocode_cache_v1'; const ls = JSON.parse(localStorage.getItem(storeKey)||'{}'); ls[school] = { lat, lon, source: 'neis-nominatim', ts: Date.now() }; localStorage.setItem(storeKey, JSON.stringify(ls)); }catch(e){}
                    }
                  }
                }catch(e){ console.warn('geocode fallback failed for', school, e); }
              }

              if (!lat || !lon || isNaN(lat) || isNaN(lon)) continue;

              const visitsForSchool = (visits||[]).filter(v=> (v.school||'').toString().trim() === school ).slice(0,10);
              const dates = visitsForSchool.map(v=> v.visitDate || '').filter(Boolean).slice(0,5).join('<br/>');
              const safeSchool = String(school).replace(/'/g, "\\'");
              const popup = `<div style="min-width:160px"><strong>${school}</strong><div class="small">방문 수: ${ ( (geos[school] && geos[school].count) || visitsForSchool.length || 1) }</div><div style="margin-top:6px">최근:<br/>${dates||'(기록없음)'}</div><div style="margin-top:8px"><button class="alt-btn" onclick="(function(s){ try{ if(window.scrollToSchool) window.scrollToSchool(s); else alert('목록 기능을 찾을 수 없습니다.'); }catch(e){ console.warn(e); } })('${safeSchool}')">목록에서 보기</button></div></div>`;

              try{
                const marker = L.marker([lat,lon]);
                marker.bindPopup(popup);
                window.personalMarkerCluster.addLayer(marker);
                bounds.push([lat,lon]);
                plotted++;
              }catch(e){ console.warn('marker add failed for', school, e); }
            }catch(e){ console.warn('updateMapFromVisits per-school failed for', school, e); }
          }

          if (plotted){
            try{ const b = L.latLngBounds(bounds); map.fitBounds(b.pad(0.2)); }catch(e){}
            const infoEl = document.getElementById('personalMapInfo'); if (infoEl) { infoEl.innerText = '표시된 학교: ' + plotted; } else { console.warn('personalMapInfo element not found when setting plotted count'); }
          } else {
            const infoEl = document.getElementById('personalMapInfo'); if (infoEl) { infoEl.innerText = '지도에 표시된 학교가 없습니다.'; } else { console.warn('personalMapInfo element not found when clearing plotted count'); }
            map.setView([37.5665,126.9780], 10);
          }
        }catch(e){ console.warn('updateMapFromVisits failed', e); }
      }

      function scrollToSchool(school){ try{ if (!school) return; const tbody = document.querySelector('#notesTableContainer .notes-table tbody'); if (!tbody){ alert('목록을 찾을 수 없습니다.'); return; } const rows = Array.from(tbody.querySelectorAll('tr')); const idx = rows.findIndex(tr => (tr.cells[1] && tr.cells[1].textContent && tr.cells[1].textContent.trim()) === school); if (idx === -1){ alert(school + '에 해당하는 항목을 찾을 수 없습니다.'); return; } const row = rows[idx]; row.scrollIntoView({ behavior: 'smooth', block: 'center' }); const orig = row.style.backgroundColor; row.style.backgroundColor = '#fff4d6'; setTimeout(()=>{ row.style.backgroundColor = orig; }, 2000); }catch(e){ console.warn('scrollToSchool failed', e); } }

      window.updateMapFromVisits = updateMapFromVisits;

      function renderFromVisitEntries(entries){ try{ const raw = Array.isArray(entries) ? entries.slice() : []; const visits = raw.map(v => { try{ const copy = Object.assign({}, v); let dateStr = copy.visitDate || copy.visit_date || copy.createdAt || copy.created_at || (copy.payload && (copy.payload.visitDate || copy.payload.visit_date || copy.payload.createdAt)) || ''; if (dateStr && typeof dateStr === 'object'){ if (dateStr._seconds){ dateStr = new Date(Number(dateStr._seconds)*1000).toISOString(); } else if (dateStr.toDate && typeof dateStr.toDate === 'function'){ try{ dateStr = dateStr.toDate().toISOString(); }catch(e){ dateStr = '' } } } if ((!dateStr || dateStr === '') && copy.visitDate_ts && typeof copy.visitDate_ts.toDate === 'function'){ try{ dateStr = copy.visitDate_ts.toDate().toISOString(); }catch(e){} } copy.visitDate = dateStr || ''; function normTimeField(val){ if (!val && val !== 0) return ''; if (typeof val === 'object'){ if (val._seconds){ try{ return new Date(Number(val._seconds)*1000).toISOString().substring(11,16); }catch(e){} } if (val.toDate && typeof val.toDate === 'function'){ try{ return val.toDate().toISOString().substring(11,16); }catch(e){} } } if (typeof val === 'string'){ const isoMatch = val.match(/\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/); if (isoMatch) return isoMatch[1]; const pm = val.match(/(\d{1,2}:\d{2})/); if (pm) return pm[1]; return val.trim(); } return ''; } const startCandidates = [copy.visitStart, copy.visit_start, copy.start, copy.visit_time_start, (copy.payload && (copy.payload.visitStart || copy.payload.visit_start || copy.payload.start)), copy.visitStart_ts, copy.start_ts]; const endCandidates = [copy.visitEnd, copy.visit_end, copy.end, copy.visit_time_end, (copy.payload && (copy.payload.visitEnd || copy.payload.visit_end || copy.payload.end)), copy.visitEnd_ts, copy.end_ts]; let sVal = ''; for (const c of startCandidates){ const n = normTimeField(c); if (n) { sVal = n; break; } } let eVal = ''; for (const c of endCandidates){ const n = normTimeField(c); if (n) { eVal = n; break; } } copy.visitStart = sVal || ''; copy.visitEnd = eVal || ''; return copy; }catch(e){ return v; } }); visits.sort((a,b)=>{ const ad = a.visitDate || a.createdAt || ''; const bd = b.visitDate || b.createdAt || ''; const at = ad ? new Date(ad).getTime() : 0; const bt = bd ? new Date(bd).getTime() : 0; return bt - at; }); document.getElementById('totalVisits').textContent = visits.length; const uniq = Array.from(new Set(visits.map(m=> (m.school||'').toString().trim() ).filter(Boolean))); document.getElementById('uniqueSchools').textContent = uniq.length; const recentShown = visits.length ? (visits[0].visitDate || visits[0].createdAt || '-') : '-'; document.getElementById('recentDate').textContent = recentShown ? (recentShown.substring(0,10)) : '-'; function setChartVisibility(canvasId, hasData, message){ const c = document.getElementById(canvasId); if (!c) return; let ph = document.getElementById(canvasId + '_placeholder'); if (!ph){ ph = document.createElement('div'); ph.id = canvasId + '_placeholder'; ph.className = 'small'; ph.style.padding = '.8rem'; ph.style.color = 'var(--muted)'; ph.style.minHeight = '60px'; c.parentNode.insertBefore(ph, c.nextSibling); } if (!hasData){ c.style.display = 'none'; ph.style.display = ''; ph.textContent = message || '데이터가 없습니다.'; } else { c.style.display = ''; ph.style.display = 'none'; } }

      // build school buttons and per-school visits table + subject quick-filter
      const buttonsEl = document.getElementById('schoolButtons');
      const subjectBtnsEl = document.getElementById('subjectButtons');
      const tableCont = document.getElementById('schoolVisitsTableContainer');
      const standardSubjects = ['정보','진로','보건','미술','체육','도서관사서','특성화','기타'];
      let currentSchool = null; let currentSubject = ''; let currentDate = '';
      const schoolCounts = {}; visits.forEach(v => { const s = (v.school||'').toString().trim(); if (!s) return; schoolCounts[s] = (schoolCounts[s]||0) + 1; });
      if (buttonsEl) { buttonsEl.innerHTML = ''; const allBtn = document.createElement('button'); allBtn.className='alt-btn'; allBtn.textContent = '전체'; allBtn.dataset.school = ''; allBtn.onclick = ()=>{ currentSchool = null; renderSchoolVisits(null, currentSubject, currentDate); }; buttonsEl.appendChild(allBtn); uniq.forEach(sch => { const cnt = schoolCounts[sch] || 0; const b = document.createElement('button'); b.className = 'alt-btn'; b.textContent = `${sch}(${cnt})`; b.dataset.school = sch; b.onclick = ()=>{ currentSchool = sch; renderSchoolVisits(sch, currentSubject, currentDate); }; buttonsEl.appendChild(b); }); }

      if (subjectBtnsEl){ subjectBtnsEl.innerHTML = ''; const subjCountsMap = {}; visits.forEach(v => { const key = (v.subject || '미지정').toString().trim() || '미지정'; subjCountsMap[key] = (subjCountsMap[key]||0) + 1; }); const allS = document.createElement('button'); allS.className = 'alt-btn'; allS.textContent = '전체'; allS.dataset.subject = ''; allS.onclick = ()=>{ currentSubject=''; renderSchoolVisits(currentSchool, currentSubject, currentDate); }; subjectBtnsEl.appendChild(allS); standardSubjects.forEach(sb => { const cnt = subjCountsMap[sb] || 0; const btn = document.createElement('button'); btn.className='alt-btn'; btn.textContent = `${sb}(${cnt})`; btn.dataset.subject = sb; btn.onclick = ()=>{ currentSubject = sb; renderSchoolVisits(currentSchool, currentSubject, currentDate); }; subjectBtnsEl.appendChild(btn); }); const otherCount = Object.keys(subjCountsMap).reduce((acc,k)=> acc + ((standardSubjects.indexOf(k)===-1)? subjCountsMap[k]:0), 0); if (standardSubjects.indexOf('기타') === -1) { const 기타Btn = document.createElement('button'); 기타Btn.className='alt-btn'; 기타Btn.textContent = `기타(${otherCount})`; 기타Btn.dataset.subject = '기타'; 기타Btn.onclick = ()=>{ currentSubject = '기타'; renderSchoolVisits(currentSchool, currentSubject, currentDate); }; subjectBtnsEl.appendChild(기타Btn); } else { try { const existing = Array.from(subjectBtnsEl.querySelectorAll('button')).find(b => b.dataset && b.dataset.subject === '기타'); if (existing) { const baseCount = subjCountsMap['기타'] || 0; const total = baseCount + (otherCount || 0); existing.textContent = `기타(${total})`; } } catch(e) { } }

      function updateCharts(rows){
        // Example: Render a simple bar chart for subject distribution
        const ctx = document.getElementById('subjectsChart');
        if (!ctx) return;
        const subjectCounts = {};
        (rows||[]).forEach(r => {
          const subj = (r.subject || '미지정').toString().trim();
          subjectCounts[subj] = (subjectCounts[subj]||0) + 1;
        });
        const labels = Object.keys(subjectCounts);
        const data = labels.map(l => subjectCounts[l]);
        if (window._subjectsChart) window._subjectsChart.destroy();
        window._subjectsChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [{ label: '과목별 방문수', data, backgroundColor: 'rgba(107,139,255,0.6)' }]
          },
          options: { responsive: true, plugins: { legend: { display: false } } }
        });
      }

      function renderSchoolVisits(school, subject, dateFilter){
        // Render visit entries in a table
        const cont = document.getElementById('schoolVisitsTableContainer');
        if (!cont) return;
        let entries = window._visitsAccum || [];
        if (school) entries = entries.filter(e => (e.school||'').toString().trim() === school);
        if (subject) entries = entries.filter(e => (e.subject||'').toString().trim() === subject);
        if (dateFilter) entries = entries.filter(e => (e.visitDate||'').toString().startsWith(dateFilter));
        if (!entries.length){ cont.innerHTML = '<div class="small">데이터가 없습니다.</div>'; return; }
        let html = '<table class="notes-table"><thead><tr>'+
          '<th>방문일</th><th>학교</th><th>방문시간</th><th>선생님명</th><th>과목명</th><th>영업활동</th><th>특이사항</th></tr></thead><tbody>';
        entries.forEach(e => {
          html += '<tr>'+
            `<td>${e.visitDate ? e.visitDate.substring(0,10) : ''}</td>`+
            `<td>${e.school||''}</td>`+
            `<td>${e.visitStart||''}~${e.visitEnd||''}</td>`+
            `<td>${e.teacher||''}</td>`+
            `<td>${e.subject||''}</td>`+
            `<td>${e.activity||e.salesActivity||''}</td>`+
            `<td>${e.conversation||e.note||''}</td>`+
            '</tr>';
        });
        html += '</tbody></table>';
        cont.innerHTML = html;
      }

      try{ renderSchoolVisits(null, '', currentDate); }catch(e){}
      try{ if (typeof updateCharts === 'function') updateCharts(visits); }catch(e){}
      try{ if (typeof updateKeywords === 'function') updateKeywords(visits); }catch(e){}
    }

    window.addEventListener('DOMContentLoaded', function(){ try{ if (typeof loadPersonalVisits === 'function') loadPersonalVisits(); }catch(e){ console.warn('auto-load failed', e); } });
  