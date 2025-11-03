
    // If the page is opened via file:// the browser will block fetch requests (origin=null).
    // Show a clear on-page message to the user instead of failing silently with CORS errors.
    // --- Multi-visit (dayVisits) support and summary templates ---
    const dayVisits = [];
  // whether the user has manually edited the generated summary textarea
  let manualSummaryEdited = false;
  // internal flag: when true, programmatic writes to the summary should not be treated as user edits
  let _suppressSummaryInputHandler = false;

  // Feature flag: prevent automatic advancement to step2 on page load.
  // Set to true only if you intentionally want pages to auto-advance.
  const ALLOW_AUTO_ADVANCE = false;

  // small utility: pad numbers to 2 digits. Defined early so other functions can use it.
    function pad2(n){
      const num = parseInt(n,10);
      if (isNaN(num)) return '00';
      return (num < 10 ? '0' : '') + String(num);
    }

    function buildCurrentVisitObject() {
      // capture top-level visit info
      const visitDate = (document.getElementById('visitDate') || {}).value || '';
      const staff = (document.getElementById('staffName') || {}).value || '';
  const region = (document.querySelector('#regionButtons .grid-button[aria-selected="true"]') || {}).dataset?.region || '';
  const schoolBtn = document.querySelector('#schoolButtons .grid-button[aria-selected="true"]');
  const school = schoolBtn ? (schoolBtn.dataset.school || schoolBtn.textContent.trim()) : '';
      const meta = {};
      const est = document.getElementById('metaPillEstablish'); if (est) meta.establish = est.textContent || '';
      const level = document.getElementById('metaPillLevel'); if (level) meta.level = level.textContent || '';
      const g1 = document.getElementById('metaG1c'); if (g1) meta.g1 = g1.textContent || '';

      const startHour = (document.getElementById('visitStartHour')||{}).value || '08';
      const startMinute = (document.getElementById('visitStartMinute')||{}).value || '00';
      const visitStart = `${pad2(startHour)}:${pad2(startMinute)}`;
      let visitEnd = (document.getElementById('visitEnd')||{}).value || '';
      // duration input (minutes) -- prefer selectedDurationInput or visitDuration
      const explicitDuration = Number((document.getElementById('selectedDurationInput')||{}).value || (document.getElementById('visitDuration')||{}).value || 0);
      if ((!visitEnd || visitEnd === '') && explicitDuration > 0){
        try{
          const sh = parseInt(startHour,10)||0; const sm = parseInt(startMinute,10)||0;
          let total = sh*60 + sm + Number(explicitDuration);
          total = ((total % (24*60)) + (24*60)) % (24*60);
          const eh = Math.floor(total/60); const em = total % 60;
          visitEnd = pad2(eh) + ':' + pad2(em);
        }catch(e){ /* ignore computation errors */ }
      }

      // subjects
      const subjectBlocks = Array.from(document.querySelectorAll('#subjectsBlock .subject-block'));
      const subjects = subjectBlocks.map((blk)=>{
        const subj = (blk.querySelector('.subject-name')||{}).value || '';
        const teacher = (blk.querySelector('.teacher-name')||{}).value || '';
        const teacherLocation = (blk.querySelector('.teacher-location')||{}).value || '';
        const publisher = (blk.querySelector('.publisher')||{}).value || '';
        const conv = (blk.querySelector('.conversation-detail')||{}).value || '';
        const followUp = (blk.querySelector('.followUpSelect')||{}).value || '';
        const contactSuffix = (blk.querySelector('.contact-suffix')||{}).value || '';
        const contact = contactSuffix ? `010-${contactSuffix.slice(0,4)}-${contactSuffix.slice(4)}` : '';
        const meetings = Array.from(blk.querySelectorAll('.meeting-btn.selected')).map(b=>b.dataset.value||b.textContent.trim());
        return { subject:subj, teacher, teacherLocation, publisher, conversation:conv, followUp, contact, meetings };
      });

      return { visitDate, staff, region, school, meta, visitStart, visitEnd, duration: explicitDuration, subjects };
    }

    // --- Inline field error helpers ---
    function showFieldError(el, msg) {
      try {
        if (!el) return;
        el.classList.add('field-error');
        el.setAttribute('aria-invalid', 'true');
        el.style.border = '1px solid #e53935';
        // find or create message node directly after the element
        let next = el.nextElementSibling;
        if (!next || !next.classList || !next.classList.contains('field-error-message')) {
          const m = document.createElement('div');
          m.className = 'field-error-message';
          m.style.color = '#e53935';
          m.style.fontSize = '12px';
          m.style.marginTop = '6px';
          el.parentNode && el.parentNode.insertBefore(m, el.nextSibling);
          next = el.nextElementSibling;
        }
        if (next) next.textContent = msg || '';
      } catch (e) { /* ignore */ }
    }

    function clearFieldError(el) {
      try {
        if (!el) return;
        el.classList.remove('field-error');
        el.removeAttribute('aria-invalid');
        el.style.border = '';
        const next = el.nextElementSibling;
        if (next && next.classList && next.classList.contains('field-error-message')) next.parentNode.removeChild(next);
      } catch (e) { /* ignore */ }
    }

    // Lightweight modal confirm + toast helpers (replace native confirm/alert in UI flows)
    (function(){
      function ensureModal(){ if (document.getElementById('cmass-confirm-modal')) return; const tpl = document.createElement('div'); tpl.id='cmass-confirm-modal'; tpl.style.display='none'; tpl.innerHTML = '\n        <div class="cmass-modal-backdrop" style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);z-index:99999">\n          <div class="cmass-modal-card" style="background:#fff;color:#072042;padding:18px;border-radius:10px;max-width:420px;width:92%;box-shadow:0 12px 30px rgba(2,6,23,0.35);text-align:center">\n            <div id="cmass-modal-msg" style="margin-bottom:14px;white-space:pre-wrap;text-align:left"></div>\n            <div style="text-align:right">\n              <button id="cmass-modal-no" class="alt-btn" style="margin-right:8px;padding:8px 12px;border-radius:8px">취소</button>\n              <button id="cmass-modal-yes" style="padding:8px 12px;border-radius:8px;background:#1e88e5;color:#fff;border:none">확인</button>\n            </div>\n          </div>\n        </div>';
        document.body.appendChild(tpl);
      }
      window.showConfirmModal = function(message){ try{ ensureModal(); const root = document.getElementById('cmass-confirm-modal'); const msg = root.querySelector('#cmass-modal-msg'); const yes = root.querySelector('#cmass-modal-yes'); const no = root.querySelector('#cmass-modal-no'); msg.textContent = message || ''; root.style.display = ''; return new Promise((resolve)=>{ function cleanup(val){ root.style.display='none'; yes.removeEventListener('click', onYes); no.removeEventListener('click', onNo); resolve(val); } function onYes(){ cleanup(true);} function onNo(){ cleanup(false);} yes.addEventListener('click', onYes); no.addEventListener('click', onNo); }); }catch(e){ try{ return Promise.resolve(confirm(message)); }catch(err){ return Promise.resolve(false); } } };

      window.showToast = function(message, timeout){ try{ let t = document.getElementById('cmass-toast'); if(!t){ t = document.createElement('div'); t.id='cmass-toast'; t.style.position='fixed'; t.style.right='16px'; t.style.bottom='18px'; t.style.zIndex='99999'; t.style.background='rgba(0,0,0,0.85)'; t.style.color='#fff'; t.style.padding='10px 14px'; t.style.borderRadius='8px'; t.style.fontSize='14px'; t.style.boxShadow='0 8px 20px rgba(0,0,0,0.2)'; document.body.appendChild(t); } t.textContent = message || ''; t.style.opacity='1'; t.style.transition='opacity 0.25s ease'; if (window.__cmass_toast_timer) clearTimeout(window.__cmass_toast_timer); window.__cmass_toast_timer = setTimeout(()=>{ t.style.opacity='0'; }, timeout || 2200); }catch(e){ try{ alert(message); }catch(err){} } };
    })();

    // --- Enhanced fuzzy/tokenized/pronunciation-insensitive search for region and school buttons ---
    (function attachSearchFilter(){
      try{
        const search = document.getElementById('searchInput');
        const clearBtn = document.getElementById('searchClear');
        const regionContainer = document.getElementById('regionButtons');
        const schoolContainer = document.getElementById('schoolButtons');
        if(!search || !regionContainer || !schoolContainer) return;

        // remove diacritics, normalize unicode and lower
        function removeDiacritics(str){
          try{ return str.normalize('NFKD').replace(/\p{M}/gu,''); }catch(e){ return str; }
        }

        // Hangul syllable decomposition to cho/jung/jong indices (used to make matching pronunciation-insensitive)
        const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
        const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
        const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
        function hangulToJamoKey(s){
          let out = '';
          for (let ch of s){
            const code = ch.charCodeAt(0);
            if (code >= 0xAC00 && code <= 0xD7A3){
              const SIndex = code - 0xAC00;
              const cho = Math.floor(SIndex / (21*28));
              const jung = Math.floor((SIndex % (21*28)) / 28);
              const jong = SIndex % 28;
              out += 'C'+cho+'V'+jung+'T'+jong+'|';
            } else {
              out += ch;
            }
          }
          return out;
        }

        // simple tokenization: split on whitespace/punct and also produce trigrams
        function tokenize(str){
          const s = removeDiacritics(String(str||'')).toLowerCase();
          const rawTokens = s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
          const tokens = [];
          rawTokens.forEach(t=>{
            tokens.push(t);
            // trigrams for short fuzzy matching
            const n = 3;
            if (t.length > n){
              for (let i=0;i<=t.length-n;i++){ tokens.push(t.slice(i,i+n)); }
            }
          });
          return tokens;
        }

        // Levenshtein distance
        function levenshtein(a,b){
          if(a===b) return 0;
          a = a || '';
          b = b || '';
          const m = a.length, n = b.length;
          if(m===0) return n; if(n===0) return m;
          let v0 = new Array(n+1), v1 = new Array(n+1);
          for(let j=0;j<=n;j++) v0[j]=j;
          for(let i=0;i<m;i++){
            v1[0]=i+1;
            for(let j=0;j<n;j++){
              const cost = a[i]===b[j] ? 0 : 1;
              v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
            }
            const tmp=v0; v0=v1; v1=tmp;
          }
          return v0[n];
        }

        // Build an index for buttons to speed matching (runs lazily when lists change)
        function buildIndex(container){
          const items = Array.from(container.querySelectorAll('.grid-button'));
          return items.map(b=>{
            const raw = (b.textContent || b.dataset.value || '').trim();
            const base = removeDiacritics(raw).toLowerCase();
            const jamo = hangulToJamoKey(raw);
            const tokens = tokenize(raw);
            return { el: b, raw, base, jamo, tokens };
          });
        }

  let regionIndex = buildIndex(regionContainer);
  let schoolIndex = buildIndex(schoolContainer);
  // If the search query doesn't match any existing rendered school buttons
  // we may dynamically populate matching school names from the CSV (staffData).
  // This helps users search by school name across regions (e.g., "대평중").
  let dynamicPopulated = false;

        // If DOM changes, rebuild indexes
        const rebuild = ()=>{ regionIndex = buildIndex(regionContainer); schoolIndex = buildIndex(schoolContainer); };

        function candidateScore(queryTokens, qJamo, cand){
          // quick exact substring check
          const qJoined = queryTokens.join(' ');
          if (cand.base.indexOf(qJoined) !== -1) return 1.0;
          // token overlap
          let overlap = 0;
          for (let qt of queryTokens){
            for (let ct of cand.tokens){ if (ct.indexOf(qt) !== -1 || qt.indexOf(ct)!==-1) { overlap++; break; } }
          }
          const overlapRatio = overlap / Math.max(1, queryTokens.length);
          // jamo similarity (for Hangul phonetic matching)
          let jamoScore = 0;
          try{
            const lev = levenshtein(qJamo, cand.jamo);
            const maxL = Math.max(qJamo.length, cand.jamo.length);
            jamoScore = maxL ? 1 - (lev / maxL) : 0;
          }catch(e){ jamoScore = 0; }
          // fallback fuzzy on joined strings
          const lev2 = levenshtein(qJoined, cand.base);
          const levScore = 1 - (lev2 / Math.max(1, Math.max(qJoined.length, cand.base.length)));
          // combine scores (weights favor token overlap and jamo for Korean)
          const score = Math.max(overlapRatio, levScore*0.9, jamoScore*0.95);
          return Math.max(0, Math.min(1, score));
        }

        function filterLists(){
          const rawQ = String(search.value || '').trim();
          if (!rawQ){
            regionIndex.forEach(i=>i.el.style.display='');
            schoolIndex.forEach(i=>i.el.style.display='');
            return;
          }
          // tokenize query and also create jamo key
          const queryTokens = tokenize(rawQ);
          const qJamo = hangulToJamoKey(rawQ);
          // threshold can be tuned; lower for broader matches
          const THRESH = 0.45;

          regionIndex.forEach(cand=>{
            const sc = candidateScore(queryTokens, qJamo, cand);
            cand.el.style.display = sc >= THRESH ? '' : 'none';
          });
          schoolIndex.forEach(cand=>{
            const sc = candidateScore(queryTokens, qJamo, cand);
            cand.el.style.display = sc >= THRESH ? '' : 'none';
          });

          // If no school buttons are visible after filtering, try a fallback:
          // dynamically populate schoolButtons from `staffData` using the same scoring
          // so users can search globally by school name (not just within a selected region).
          const anyVisible = schoolIndex.some(s => s.el.style.display !== 'none');
          if (!anyVisible && rawQ.length >= 2 && !dynamicPopulated && Array.isArray(window.staffData) && window.staffData.length){
            try{
              const seen = new Set();
              const candidates = [];
              for (const d of window.staffData){
                const schoolName = (d && d.school) ? String(d.school).trim() : '';
                if (!schoolName) continue;
                if (seen.has(schoolName)) continue;
                seen.add(schoolName);
                const cand = { raw: schoolName, base: removeDiacritics(schoolName).toLowerCase(), jamo: hangulToJamoKey(schoolName), tokens: tokenize(schoolName) };
                const score = candidateScore(queryTokens, qJamo, cand);
                if (score >= THRESH) candidates.push({ name: schoolName, score });
              }
              // sort by score desc and keep top 50
              candidates.sort((a,b) => b.score - a.score);
              const top = candidates.slice(0,50).map(c=>c.name);
              if (top.length){
                // clear existing school buttons and render matches
                schoolContainer.innerHTML = '';
                for (const sName of top){
                  const sb = document.createElement('button');
                  sb.type = 'button'; sb.className = 'grid-button'; sb.dataset.school = sName; sb.setAttribute('role','option'); sb.setAttribute('aria-selected','false'); sb.tabIndex = 0; sb.textContent = sName; sb.title = sName; schoolContainer.appendChild(sb);
                }
                // rebuild index and mark dynamic populated so we don't repeat
                schoolIndex = buildIndex(schoolContainer);
                dynamicPopulated = true;
                // reapply filter so the newly created buttons are visible
                schoolIndex.forEach(cand=>{
                  const sc = candidateScore(queryTokens, qJamo, cand);
                  cand.el.style.display = sc >= THRESH ? '' : 'none';
                });
              }
            }catch(e){ console.warn('dynamic school populate failed', e); }
          }
        }

        // wire events
        search.addEventListener('input', filterLists);
        clearBtn.addEventListener('click', ()=>{ search.value=''; search.dispatchEvent(new Event('input')); search.focus(); });

        // observe list changes and rebuild indexes + reapply filter
        const observer = new MutationObserver(()=>{ try{ rebuild(); filterLists(); }catch(e){/*ignore*/} });
        observer.observe(regionContainer, { childList: true, subtree: true });
        observer.observe(schoolContainer, { childList: true, subtree: true });
      }catch(e){ console.warn('attachSearchFilter failed', e); }
    })();

    function renderVisitsList() {
      const el = document.getElementById('visitsList');
      if (!el) return;
      el.innerHTML = '';
      if (dayVisits.length === 0) { el.innerHTML = '<div style="color:#666;padding:.6rem;">추가된 방문이 없습니다.</div>'; return; }
      // render stacked cards (chronological)
      dayVisits.forEach((v, idx) => {
        const card = document.createElement('div');
        card.className = 'visit-card';
        card.style = 'border-radius:8px;border:1px solid #e6eefc;background:#fff;padding:.8rem;margin-bottom:8px;';
        const header = document.createElement('div');
        header.style = 'display:flex;justify-content:space-between;align-items:center;gap:.6rem;';
        const title = document.createElement('div');
        title.innerHTML = `<strong>${idx+1}. ${v.school || '학교 미선택'}</strong><div style="font-size:12px;color:#556">${v.visitDate || ''} ${v.visitStart || ''} ~ ${v.visitEnd || ''}</div>`;
        const actions = document.createElement('div');
        const editBtn = document.createElement('button'); editBtn.textContent='편집'; editBtn.style='margin-right:6px;padding:.3rem .6rem;border-radius:.5rem;'; editBtn.addEventListener('click',()=>loadVisitToForm(idx));
        const removeBtn = document.createElement('button'); removeBtn.textContent='제거'; removeBtn.style='padding:.3rem .6rem;border-radius:.5rem;color:#c33;'; removeBtn.addEventListener('click',()=>{ if(editingVisitIndex===idx) resetEditState(); dayVisits.splice(idx,1); renderVisitsList(); });
        actions.appendChild(editBtn); actions.appendChild(removeBtn);
        header.appendChild(title); header.appendChild(actions);
        card.appendChild(header);
        // brief subjects summary
        if (v.subjects && v.subjects.length) {
          const ul = document.createElement('div'); ul.style='margin-top:.6rem;font-size:13px;color:#233';
          v.subjects.forEach(s=>{
            const line = document.createElement('div'); line.textContent = `${s.subject || '-'} ${s.teacher? '('+s.teacher+')':''} ${s.contact? '· '+s.contact : ''}`;
            ul.appendChild(line);
          });
          card.appendChild(ul);
        }
        el.appendChild(card);
      });
      // auto-scroll to bottom so latest added visit is visible
      el.scrollTop = el.scrollHeight;
    }

    function resetFormForNextVisit() {
      // keep visitDate and staffInfo, clear region/school selection and subject blocks (leave one blank block)
      // clear region/school UI selection
      document.querySelectorAll('#regionButtons .grid-button.selected').forEach(b=>b.classList.remove('selected'));
      document.querySelectorAll('#schoolButtons .grid-button.selected').forEach(b=>b.classList.remove('selected'));
      document.getElementById('selectedRegionInput').value = '';
      document.getElementById('selectedSchoolInput').value = '';
      document.getElementById('displayRegion').textContent = '';
      document.getElementById('displaySchool').textContent = '';
      document.getElementById('selectedInfo').style.display = 'none';
      // reset subject blocks: keep single blank block
  const container = document.getElementById('subjectsBlock');
  container.innerHTML = `\n+        <label>과목/선생님별 영업기록</label>\n+        <div class="subject-block">\n+              <input type="hidden" class="subject-name">\n+              <div class="subjects" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px;">\n+                <button type="button" class="grid-button subject-choice" data-subject="정보">정보</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="진로">진로</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="보건">보건</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="미술">미술</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="체육">체육</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="특성화">특성화</button>\n+                <button type="button" class="grid-button subject-choice" data-subject="기타">기타</button>\n+              </div>\n+          <input type="text" class="teacher-name" placeholder="선생님 이름">\n+              <select class="publisher">\n+                <option value="">출판사 선택</option>\n+                <option>천재</option><option>비상</option><option>동아</option><option>삼양</option><option>기타</option>\n+              </select>\n+              <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">\n+                <label style="font-weight:700;min-width:38px;">연락처</label>\n+                    <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">\n+                      <span style="display:inline-block;padding:.55rem .7rem;border-radius:.6rem;background:#f2f4ff;border:1px solid #d6dbe8;color:#12325a;font-weight:700;">010</span>\n+                      <input type="text" class="contact-suffix" placeholder="12345678" maxlength="8" inputmode="numeric" pattern="[0-9]*" style="width:120px;padding:.55rem .6rem;border-radius:.6rem;border:1px solid #d6dbe8;">\n+                      <span class="contact-formatted" style="margin-left:8px;color:#103254;font-weight:700;"></span>\n+                      <button type="button" class="copy-contact" style="margin-left:6px;padding:.4rem .6rem;border-radius:.5rem;border:1px solid #d6dbe8;background:#fff;cursor:pointer;">복사</button>\n+                    </div>\n+              </div>\n+          <div style="margin-top:16px;"></div>\n+          <div class="meeting-buttons" id="main-meeting-buttons">\n+            <button class="meeting-btn" type="button">명함인사</button>\n+            <button class="meeting-btn" type="button">티칭샘소개</button>\n+            <button class="meeting-btn" type="button">채팅방소개</button>\n+            <button class="meeting-btn" type="button">미팅불가</button>\n+          </div>\n+          <div class="meeting-buttons" id="info-extra-buttons" style="display:none;">\n+            <button class="meeting-btn" type="button">구글클래스룸 사용</button>\n+            <button class="meeting-btn" type="button">패들렛 사용</button>\n+            <button class="meeting-btn" type="button">하이러닝 사용</button>\n+          </div>\n+          <textarea class="conversation-detail" rows="2" placeholder="특이사항"></textarea>\n+          <div style="margin-top:0.6rem;">\n+            <label style="font-weight:700;display:block;margin-bottom:6px;">후속조치</label>\n+            <select class="followUpSelect" style="width:100%;padding:.6rem;border-radius:.6rem;border:1px solid #d6dbe8;background:#fff;">\n+              <option value="">선택하세요</option>\n+              <option>채팅방 지속 관리</option>\n+              <option>추가 자료 발송 예정</option>\n+              <option>재방문 예정</option>\n+              <option>선정 시기 연락 대기</option>\n+              <option>워크북 무상지원 제안</option>\n+              <option>완료 (추가 조치 없음)</option>\n+            </select>\n+          </div>\n+        </div>\n+        <div style="margin-top:16px;"></div>\n+      `;
      if (typeof renumberSubjectBlocks === 'function') renumberSubjectBlocks();
      // if user enabled auto-focus, focus the first region button (or school if region already selected)
      setTimeout(()=>{
        try{
          const auto = document.getElementById('autoFocusNext');
          if (auto && auto.checked) {
            const regionFirst = document.querySelector('#regionButtons .grid-button');
            const schoolFirst = document.querySelector('#schoolButtons .grid-button');
            if (regionFirst) { regionFirst.focus(); }
            else if (schoolFirst) { schoolFirst.focus(); }
          }
        }catch(e){/* ignore focus errors */}
      },60);
    }

    let editingVisitIndex = -1; // -1 means not editing

    function resetEditState() {
      editingVisitIndex = -1;
      const addBtn = document.getElementById('addVisitBtn'); if (addBtn) addBtn.textContent = '오늘 방문에 추가';
      renderVisitsList();
    }

    function loadVisitToForm(idx) {
      const v = dayVisits[idx];
      if (!v) return;
      // populate top-level
      if (v.visitDate) {
        const vdEl = document.getElementById('visitDate') || null;
        try{
          const s = String(v.visitDate || '').trim();
          let norm = '';
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) norm = s;
          else {
            const m = s.match(/^(\d{4}-\d{2}-\d{2})T/);
            if (m && m[1]) norm = m[1];
            else { const d = new Date(s); if (!isNaN(d.getTime())) norm = d.toISOString().slice(0,10); }
          }
          if (vdEl) vdEl.value = norm || '';
        }catch(e){}
      }
      if (v.visitStart) {
        const [hh, mm] = v.visitStart.split(':');
        if (document.getElementById('visitStartHour')) document.getElementById('visitStartHour').value = hh;
        if (document.getElementById('visitStartMinute')) document.getElementById('visitStartMinute').value = mm;
      }
      if (v.visitEnd) (document.getElementById('visitEnd')||{}).value = v.visitEnd;
      // select region and school buttons if possible
      if (v.region) {
        const regionBtn = Array.from(document.querySelectorAll('#regionButtons .grid-button')).find(b=>b.textContent.trim()===v.region || b.dataset.region===v.region);
        if (regionBtn) regionBtn.click();
      }
      if (v.school) {
        // small delay to allow schools populated after region click
        setTimeout(()=>{
          const schoolBtn = Array.from(document.querySelectorAll('#schoolButtons .grid-button')).find(b=>b.textContent.trim()===v.school || b.dataset.school===v.school);
          if (schoolBtn) schoolBtn.click();
        }, 120);
      }
      // clear existing subject blocks and rebuild from v.subjects
      const container = document.getElementById('subjectsBlock');
      container.innerHTML = '<label>과목/선생님별 영업기록</label>';
      v.subjects.forEach(s => {
        const block = document.createElement('div'); block.className = 'subject-block';
        block.innerHTML = `
          <input type="hidden" class="subject-name" required>
          <div class="subjects" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px;">
            <button type="button" class="grid-button subject-choice" data-subject="정보">정보</button>
            <button type="button" class="grid-button subject-choice" data-subject="진로">진로</button>
            <button type="button" class="grid-button subject-choice" data-subject="보건">보건</button>
            <button type="button" class="grid-button subject-choice" data-subject="미술">미술</button>
      <button type="button" class="grid-button subject-choice" data-subject="체육">체육</button>
        <button type="button" class="grid-button subject-choice" data-subject="도서관사서">도서관사서</button>
        <button type="button" class="grid-button subject-choice" data-subject="특성화">특성화</button>
            <button type="button" class="grid-button subject-choice" data-subject="기타">기타</button>
          </div>
          <input type="text" class="teacher-name" placeholder="선생님 이름" required>
          <select class="publisher">
                <option value="">출판사 선택</option>
                <option>씨마스</option><option>천재</option><option>비상</option><option>미래엔</option><option>동아</option><option>지학사</option><option>금성</option><option>창비</option><option>해냄</option><option>능률</option><option>삼양</option><option>이오북스</option><option>YBM</option><option>길벗</option><option>미진사</option><option>다락원</option><option>타임</option><option>채움</option>
          </select>
          <div style="margin-top:0.6rem;">
            <label style="font-weight:700;display:block;margin-bottom:6px;">후속조치</label>
            <select class="followUpSelect" style="width:100%;padding:.6rem;border-radius:.6rem;border:1px solid #d6dbe8;background:#fff;">
              <option value="">선택하세요</option>
              <option>채팅방 지속 관리</option>
              <option>추가 자료 발송 예정</option>
              <option>재방문 예정</option>
              <option>선정 시기 연락 대기</option>
              <option>워크북 무상지원 제안</option>
              <option>완료 (추가 조치 없음)</option>
            </select>
          </div>
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">
            <label style="font-weight:700;min-width:38px;">연락처</label>
            <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">
              <span style="display:inline-block;padding:.55rem .7rem;border-radius:.6rem;background:#f2f4ff;border:1px solid #d6dbe8;color:#12325a;font-weight:700;">010</span>
              <input type="text" class="contact-suffix" placeholder="12345678" maxlength="8" inputmode="numeric" pattern="[0-9]*" style="width:120px;padding:.55rem .6rem;border-radius:.6rem;border:1px solid #d6dbe8;">
              <span class="contact-formatted" style="margin-left:8px;color:#103254;font-weight:700;"></span>
              <button type="button" class="copy-contact" style="margin-left:6px;padding:.4rem .6rem;border-radius:.5rem;border:1px solid #d6dbe8;background:#fff;cursor:pointer;">복사</button>
            </div>
          </div>
          <div style="margin-top:16px;"></div>
          <div class="meeting-buttons main-meeting-buttons">
            <button class="meeting-btn" type="button">명함인사</button>
            <button class="meeting-btn" type="button">티칭샘소개</button>
            <button class="meeting-btn" type="button">채팅방소개</button>
            <button class="meeting-btn" type="button">미팅불가</button>
          </div>
          <div class="meeting-buttons info-extra-buttons" style="display:none;">
            <button class="meeting-btn" type="button">구글클래스룸 사용</button>
            <button class="meeting-btn" type="button">패들렛 사용</button>
            <button class="meeting-btn" type="button">하이러닝 사용</button>
          </div>
          <textarea class="conversation-detail" rows="2" placeholder="특이사항"></textarea>
        `;
        // populate values
        if (s.subject) {
          block.querySelector('.subject-name').value = s.subject;
          const subjectBtn = Array.from(block.querySelectorAll('.subject-choice')).find(b=>b.dataset.subject===s.subject || b.textContent.trim()===s.subject);
          if (subjectBtn) subjectBtn.classList.add('selected');
        }
        if (s.teacher) block.querySelector('.teacher-name').value = s.teacher;
        if (s.publisher) block.querySelector('.publisher').value = s.publisher;
        if (s.followUp) block.querySelector('.followUpSelect').value = s.followUp;
        if (s.contact) {
          // extract suffix digits from format like 010-1234-5678
          const digits = (s.contact || '').replace(/\D+/g,'');
          if (digits.length === 11) block.querySelector('.contact-suffix').value = digits.slice(3);
        }
        if (s.conversation) block.querySelector('.conversation-detail').value = s.conversation;
        // meetings selection
        setTimeout(()=>{
          if (s.meetings && s.meetings.length) {
            Array.from(block.querySelectorAll('.meeting-btn')).forEach(btn=>{
              if (s.meetings.includes(btn.textContent.trim())) btn.classList.add('selected');
            });
          }
        }, 10);
        block.querySelector('.removeSubjectBtn').onclick = function(){ block.remove(); if(typeof renumberSubjectBlocks==='function') renumberSubjectBlocks(); };
        container.appendChild(block);
      });
      // renumber and show edit UI
      if (typeof renumberSubjectBlocks === 'function') renumberSubjectBlocks();
      editingVisitIndex = idx;
      const addBtn = document.getElementById('addVisitBtn'); if (addBtn) addBtn.textContent = '편집사항 저장';
      renderVisitsList();
    }

    document.getElementById('addVisitBtn')?.addEventListener('click',()=>{
      const v = buildCurrentVisitObject();
      // 방문일 필수
      if (!v.visitDate) { alert('방문일을 선택한 뒤 방문을 추가하세요.'); const vd = document.getElementById('visitDate'); vd && vd.focus(); return; }
      // basic validation: must have school
      if (!v.school) { alert('학교를 선택한 뒤 추가하세요.'); return; }
      if (editingVisitIndex >= 0) {
        dayVisits[editingVisitIndex] = v;
        resetEditState();
        renderVisitsList();
      } else {
        dayVisits.push(v);
        renderVisitsList();
        // prepare form for next visit
        resetFormForNextVisit();
      }
    });

    // copy to clipboard helper
    async function copyToClipboard(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(text); return true; } catch(e){ /* fallthrough */ }
      }
      // fallback
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); document.body.removeChild(ta); return true; } catch(e){ document.body.removeChild(ta); return false; }
    }

    document.getElementById('copySummaryBtn')?.addEventListener('click', async ()=>{
      const txt = (document.getElementById('generatedSummary')||{}).value || '';
      if (!txt) { alert('복사할 요약이 없습니다. 먼저 요약을 생성하세요.'); return; }
      const ok = await copyToClipboard(txt);
      if (ok) { alert('요약이 클립보드에 복사되었습니다.'); } else { alert('복사에 실패했습니다. 수동으로 복사해주세요.'); }
    });

    // One-click: build kakao template from dayVisits (require at least one visit) and copy to clipboard
    // Build simple auto-tags from visits and return array of tags (Korean)
    // buildAutoTags(visits, maxTags)
    // returns an array of human-readable tag strings (Korean)
    function buildAutoTags(visits, maxTags=8){
      const tags = [];
      if (!visits || !visits.length) return tags;
      const subjCount = {};
      const schoolCount = {};
      let contactCount = 0;
      let chatInvite = false;
      let followUpNeeded = false;
      let trainingInterest = false;
      // expanded keywords for training/education interest
  const trainingKeywords = /(연수|연수안내|연수문의|워크숍|연수희망|연수희망자|교육|교육안내|교육설명회|교원연수|연수참여|연수요청|교사연수|직무연수|연수신청)/i;
      const chatKeywords = /(채팅|채팅방|카톡|카카오|텔레그램|라인|메신저)/i;
      const followKeywords = /(자료|발송|추가|재방문|워크북|샘플|안내자료|자료요청)/i;

      visits.forEach(v=>{
        if (v.school) schoolCount[v.school] = (schoolCount[v.school]||0)+1;
        (v.subjects||[]).forEach(s=>{
          const name = (s.subject||'').trim(); if (name) subjCount[name] = (subjCount[name]||0)+1;
          if (s.contact) contactCount++;
          const meetings = (s.meetings||[]).join(' ');
          if (chatKeywords.test(meetings)) chatInvite = true;
          if (s.followUp && followKeywords.test(s.followUp)) followUpNeeded = true;
          if (s.conversation && trainingKeywords.test(s.conversation)) trainingInterest = true;
        });
      });
      // subject-level tags (top subjects)
      const subjEntries = Object.entries(subjCount).sort((a,b)=>b[1]-a[1]);
      if (subjEntries.length){
        const top = subjEntries.slice(0,3).map(s=>s[0]+(s[1]>1?`(${s[1]}회)`:''));
        tags.push('주요과목: '+top.join(', '));
  subjEntries.forEach(([s,c])=>{ if(c>=3) tags.push(s+' 다수 방문'); });
      }
      // school-level
      const schoolEntries = Object.entries(schoolCount).sort((a,b)=>b[1]-a[1]);
      if (schoolEntries.length){
        const multi = schoolEntries.filter(e=>e[1]>=2).map(e=>e[0]);
        if (multi.length) tags.push('재방문: '+multi.join(', '));
      }
      if (contactCount>0) tags.push('연락처 확보 '+contactCount+'건');
      if (chatInvite) tags.push('채팅방 안내');
      if (followUpNeeded) tags.push('자료 발송 필요');
      if (trainingInterest) tags.push('연수 관심');
      // limit tags and dedupe according to maxTags
      const seen = new Set();
      const out = [];
      for (const t of tags){ if (!seen.has(t)){ seen.add(t); out.push(t); } if (out.length>=Math.max(1,Math.min(50,Math.floor(maxTags)||8))) break; }
      return out;
    }

    document.getElementById('copyKakaoBtn')?.addEventListener('click', async ()=>{
      if (!dayVisits || !dayVisits.length) { alert('먼저 방문을 추가하세요. (하루치 방문이 쌓여 있어야 합니다)'); return; }
      let summary = buildAggregateSummary(dayVisits, 'kakao');
      // build auto-tags and append to summary for Kakao copy
      try{
        const maxTags = parseInt(document.getElementById('optMaxTags')?.value) || 8;
        // basic/default behavior: include human-readable line, do NOT include hashtags
        const includeHuman = true;
        const includeHash = false;
        const tags = buildAutoTags(dayVisits, maxTags);
        if (tags && tags.length){
          if (includeHuman) summary += '\n\n자동 태그: ' + tags.join(', ');
          if (includeHash) summary += '\n\n#' + tags.map(t=>t.replace(/[^\p{L}\p{N}]+/gu,'_')).join(' #');
        }
      }catch(e){ console.warn('autotag generation failed', e); }
      const ok = await copyToClipboard(summary);
      if (ok) { alert('카카오용 요약이 클립보드에 복사되었습니다. 카톡에 붙여넣기 해주세요.'); }
      else { alert('복사에 실패했습니다. 생성된 요약을 수동으로 복사해주세요.'); }
    });

    // POST dayVisits to backend
    document.getElementById('saveToServerBtn')?.addEventListener('click', async ()=>{
      if (!dayVisits || !dayVisits.length) { alert('저장할 방문 기록이 없습니다. 먼저 방문을 추가하세요.'); return; }
      const staff = getStaffFromQuery() || (document.getElementById('staffInfo')||{}).textContent.replace(/^담당자:\s*/,'').trim();
      const payload = { staff, visits: dayVisits };
      try {
        const res = await fetch('/api/visits', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        const j = await res.json();
        if (res.ok && j && j.ok) { alert('서버에 저장되었습니다. ID: ' + j.id); }
        else { alert('저장 실패: ' + (j && j.msg ? j.msg : res.statusText)); }
      } catch(e){ alert('서버 저장 중 오류: ' + e.message); }
    });

      // Edit last added visit: load last visit into the form for editing
      document.getElementById('editLastBtn')?.addEventListener('click', ()=>{
        if (!dayVisits || !dayVisits.length) { alert('편집할 방문이 없습니다. 먼저 방문을 추가하세요.'); return; }
        const idx = dayVisits.length - 1;
        loadVisitToForm(idx);
  // switch to step2 view
  try { document.getElementById('step1').style.display = 'none'; document.getElementById('step2').style.display = 'block'; } catch(e){}
  // Ensure top of new content is visible (some webviews keep previous scroll)
  try { if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'auto' }); if (document.body) document.body.scrollTop = 0; if (document.documentElement) document.documentElement.scrollTop = 0; } catch(e){}
        // focus first editable field
        setTimeout(()=>{ const el = document.querySelector('#salesForm .teacher-name'); if(el) el.focus(); }, 120);
      });

    // register service worker for PWA (if available)
    if ('serviceWorker' in navigator) {
      try { navigator.serviceWorker.register('/sw.js'); } catch(e) { /* ignore */ }
    }

    // enhanced generateSummary: uses dayVisits if exists, otherwise single current form
    document.getElementById('genSummaryBtn')?.addEventListener('click', ()=>{
      const template = (document.getElementById('summaryTemplate')||{}).value || 'detailed';
      let visits = dayVisits.length ? dayVisits : [ buildCurrentVisitObject() ];
      const summary = buildAggregateSummary(visits, template);
      const out = document.getElementById('generatedSummary'); if (out) writeGeneratedSummary(reportIntro() + '\n' + summary, { replace: true });
    });

    // report intro/header block to prepend to generated summaries
    function reportIntro() {
      // dynamic header: use URL ?user= parameter when present, otherwise fallback to staffInfo text
      let staffName = '';
      try {
        staffName = getStaffFromQuery() || '';
      } catch(e) { staffName = ''; }
      if (!staffName) {
        const infoEl = document.getElementById('staffInfo');
        if (infoEl && infoEl.textContent) {
          staffName = infoEl.textContent.replace(/^담당자:\s*/,'').trim();
        }
      }
      if (!staffName) staffName = '담당자';
      // normalize base name (remove common title suffixes if present)
      let base = staffName.replace(/\s*(부장|차장|과장|대리|사원)\s*$/,'').trim();
      // mapping to titled names
      const titleMap = {
        '송훈재': '송훈재 부장',
        '임준호': '임준호 차장',
        '조영환': '조영환 부장'
      };
      const displayName = titleMap[base] || staffName;
      const lines = [];
      lines.push(`(${displayName} 퇴근보고)`);
      lines.push('');
      return lines.join('\n');
    }

    function buildAggregateSummary(visits, template) {
      // aggregate stats
      const totalSchools = visits.length;
      let contactCount = 0;
      let additionalConfirmCount = 0;
      visits.forEach(v => {
        v.subjects.forEach(s => { if (s.contact) contactCount++; if (s.followUp && s.followUp.indexOf('추가선정')!==-1) additionalConfirmCount++; });
      });

      // helper: Korean ordinal labels 가, 나, 다, ... fallback to numeric if out of range
      const korLetters = ['가','나','다','라','마','바','사','아','자','차','카','타','파','하'];
      const getKorLabel = (i) => (korLetters[i] ? korLetters[i] + '.' : (i+1) + '.');

      // treat first visit start as 출근, last visit end as 퇴근 (use insertion order)
      const firstStart = (visits && visits.length && visits[0].visitStart) ? visits[0].visitStart : '';
      const lastEnd = (visits && visits.length && visits[visits.length-1].visitEnd) ? visits[visits.length-1].visitEnd : '';

      if (template === 'compact') {
        // one-line per school
        const lines = visits.map((v,i)=>{
          const subjCount = v.subjects.length;
          return `${getKorLabel(i)} ${v.school} ${v.visitStart || ''}-${v.visitEnd || ''} (${subjCount}과목)`;
        });
        lines.push(`총 방문 학교: ${totalSchools}개, 연락처 확보: ${contactCount}건, 추가선정 확인: ${additionalConfirmCount}건`);
        return lines.join('\n');
      }

      if (template === 'paragraph') {
        // natural paragraph
        const parts = [];
        parts.push(`${visits[0].visitDate || ''} 방문 보고입니다.`.trim());
        visits.forEach((v,i)=>{
          parts.push(`${getKorLabel(i)} ${v.school} (${v.region || ''}) 에서 ${v.visitStart || ''}부터 ${v.visitEnd || ''}까지 방문하여 ${v.subjects.length}과목을 지도했습니다.`);
          v.subjects.forEach(s=>{
            const m = s.meetings && s.meetings.length ? `미팅: ${s.meetings.join(', ')}.` : '';
            parts.push(`- ${s.subject} ${s.teacher ? '('+s.teacher+')':''} ${m} ${s.conversation? '특이사항: '+s.conversation : ''}`);
          });
        });
        parts.push(`총 ${totalSchools}개 학교 방문, 연락처 확보 ${contactCount}건, 추가선정 확인 ${additionalConfirmCount}건.`);
        return parts.join('\n');
      }

      if (template === 'kakao') {
        // Kakao-style structured report requested by user
        const parts = [];
        // include dynamic intro
        parts.push(reportIntro().trim());
        // header: show only YYYY-MM-DD
        function fmtDateForHeader(raw) {
          if (!raw) return '';
          try { const d = new Date(raw); if (!isNaN(d.getTime())) { return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); } } catch(e){}
          const m = String(raw).match(/(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; return String(raw).slice(0,10);
        }
        parts.push(`방문일: ${fmtDateForHeader(visits[0].visitDate || '')}`);
        parts.push(`총 방문 학교: ${totalSchools}개 · 연락처 확보: ${contactCount}건 · 추가선정 확인: ${additionalConfirmCount}건`);
        // 1. 출근/퇴근 summary (numbered section 1)
        parts.push('');
        // compute 자료정리 end (lastEnd + 30min) and use it as 퇴근 when available
        function computeEndCollect(t){ if(!t) return ''; try { return addMinutesToTime(t, 30); } catch(e){ return ''; } }
        const lastEndTime = lastEnd || '';
        const computedEndCollect = computeEndCollect(lastEndTime);
        let finalEnd = lastEnd || '';
        if (lastEnd && computedEndCollect) finalEnd = computedEndCollect;
        // compute working duration between firstStart and finalEnd
        let workDurationText = '';
        if (firstStart && finalEnd) {
          const totalMin = calcMinutesInterval(firstStart, finalEnd);
          const hrs = Math.floor(totalMin / 60);
          const mins = totalMin % 60;
          workDurationText = ` (근무시간 ${hrs}h ${mins}m)`;
        }
        parts.push(`1. 출근: ${firstStart || '-'} · 퇴근: ${finalEnd || '-'}${workDurationText}`);
        parts.push('');
        // 2. 세부업무 with lettered school sections
        parts.push('2. 세부업무');
        parts.push('');
        visits.forEach((v, idx) => {
          const label = getKorLabel(idx).replace(/\.$/, ''); // '가' not '가.' for header prefix
          // compute duration
          // compute a single time range for the school.
          // If visitStart/visitEnd contain multiple tokens (comma-separated, ranges, etc.),
          // pick the earliest start and the latest end so only one time appears per school.
          let timeRange = '';
          let durMinutes = null;
          try {
            const extractTimes = (str) => {
              if (!str) return [];
              const parts = String(str).split(/[,;|\/]+/).map(s=>s.trim()).filter(Boolean);
              const times = [];
              parts.forEach(p => {
                if (p.indexOf('~') !== -1) {
                  const [a,b] = p.split('~').map(x=>x.trim());
                  if (/^\d{1,2}:\d{2}$/.test(a)) times.push(a);
                  if (/^\d{1,2}:\d{2}$/.test(b)) times.push(b);
                } else {
                  const m = p.match(/\d{1,2}:\d{2}/g);
                  if (m) m.forEach(x=>times.push(x));
                }
              });
              return times.map(t => {
                const [hh, mm] = t.split(':').map(x=>parseInt(x,10));
                return pad2(hh) + ':' + pad2(mm);
              }).filter(Boolean);
            };
            const starts = extractTimes(v.visitStart);
            const ends = extractTimes(v.visitEnd);
            if (starts.length || ends.length) {
              const allStarts = starts.length ? starts.slice() : (ends.length ? ends.slice() : []);
              const allEnds = ends.length ? ends.slice() : (starts.length ? starts.slice() : []);
              allStarts.sort(); allEnds.sort();
              const minStart = allStarts.length ? allStarts[0] : null;
              const maxEnd = allEnds.length ? allEnds[allEnds.length-1] : null;
              if (minStart && maxEnd) {
                timeRange = `(${minStart}~${maxEnd})`;
                try { durMinutes = calcMinutesInterval(minStart, maxEnd); } catch(e) { durMinutes = null; }
              }
            }
          } catch(e) { /* ignore and fall back to no timeRange */ }
          // e.g. 가. 과천고등학교  (08:00~08:10) (10분)
          const schoolLine = `${label}. ${v.school || '-'}  ${timeRange}${durMinutes ? ` (${durMinutes}분)` : ''}`;
          parts.push(schoolLine);
          parts.push('세부업무:');
          v.subjects.forEach(s => {
            const meetings = s.meetings && s.meetings.length ? s.meetings.join(', ') : '';
            const follow = s.followUp ? `후속:${s.followUp}` : '';
            const conv = s.conversation ? `특이사항:${s.conversation}` : '';
            const teacher = s.teacher ? `(${s.teacher})` : '';
            const publisher = s.publisher ? ` / ${s.publisher}` : '';
            const segs = [];
            // main subject + teacher + publisher
            segs.push(`- ${s.subject || '-'} ${teacher}${publisher}`.trim());
            if (meetings) segs.push(meetings);
            if (follow) segs.push(follow);
            if (conv) segs.push(conv);
            parts.push(segs.join(' · '));
          });
          parts.push('');
        });
        // 3. 퇴근보고 자료 정리 — allocate a 30-minute slot after lastEnd
        if (lastEndTime && computedEndCollect) {
          const dur = calcMinutesInterval(lastEndTime, computedEndCollect);
          parts.push(`3. 퇴근보고 자료 정리 (${lastEndTime}~${computedEndCollect}) (${dur}분)`);
        } else {
          parts.push('3. 퇴근보고 자료 정리');
        }
        parts.push('');
  parts.push('- 끝.');
        return parts.join('\n');
      }

      // detailed (default): header + per-visit block with per-subject rows
      const lines = [];
  // detailed header: format date to YYYY-MM-DD
  function fmtDateForHeader(raw) { if (!raw) return ''; try { const d = new Date(raw); if (!isNaN(d.getTime())) return d.getFullYear() + '-' + pad2(d.getMonth()+1) + '-' + pad2(d.getDate()); } catch(e){} const m = String(raw).match(/(\d{4}-\d{2}-\d{2})/); if (m) return m[1]; return String(raw).slice(0,10); }
  lines.push(`방문일: ${fmtDateForHeader(visits[0].visitDate || '')}`);
      lines.push(`총 방문 학교: ${totalSchools}개`);
      lines.push(`출근: ${firstStart || '-'} | 퇴근: ${lastEnd || '-'}`);
      lines.push(`연락처 확보: ${contactCount}건 | 추가선정 확인: ${additionalConfirmCount}건`);
      lines.push('');
      visits.forEach((v, idx)=>{
        lines.push(`${getKorLabel(idx)} ${v.school} — ${v.region || ''} (${v.visitStart || ''} ~ ${v.visitEnd || ''})`);
        lines.push('세부업무:');
        v.subjects.forEach(s=>{
          const meetings = s.meetings && s.meetings.length ? `[${s.meetings.join(', ')}] ` : '';
          const follow = s.followUp ? `팔로업:${s.followUp} ` : '';
          const conv = s.conversation ? `특이사항:${s.conversation}` : '';
          lines.push(` - ${s.subject} / ${s.teacher || '-'} / ${s.publisher || '-'} ${meetings}${follow}${conv}`.trim());
        });
        lines.push('');
      });
      return lines.join('\n');
    }

    // format a single visit into a readable paragraph (used for appending to the textarea)
    function formatVisitText(v, idx) {
      const lines = [];
      // plain structured per-visit representation (no emojis)
      const timeRange = (v.visitStart || '') && (v.visitEnd || '') ? `${v.visitStart}~${v.visitEnd}` : '';
      const duration = (v.visitStart && v.visitEnd) ? ` (${calcMinutesInterval(v.visitStart,v.visitEnd)}분)` : '';
      lines.push(`${idx+1}. ${v.school || '-'} (${v.region || '-'}) ${timeRange}${duration}`);
      v.subjects.forEach(s=>{
        const segs = [];
        segs.push(s.subject || '-');
        if (s.teacher) segs.push(s.teacher);
        if (s.publisher) segs.push(s.publisher);
        if (s.meetings && s.meetings.length) segs.push(s.meetings.join('/'));
  // do not include contact value in generated text (kept for backend only)
        if (s.followUp) segs.push(`후속:${s.followUp}`);
        if (s.conversation) segs.push(`특이:${s.conversation}`);
        lines.push(' - ' + segs.join(' · '));
      });
      lines.push('');
      return lines.join('\n');
    }

    // add minutes to time string 'HH:MM' and return 'HH:MM' (24-hour wrap)
    function addMinutesToTime(timeStr, minutesToAdd) {
      if (!timeStr || typeof timeStr !== 'string') return '';
      const parts = timeStr.split(':');
      if (parts.length < 2) return '';
      const hh = parseInt(parts[0],10); const mm = parseInt(parts[1],10);
      if (isNaN(hh) || isNaN(mm)) return '';
      const total = hh * 60 + mm + parseInt(minutesToAdd,10);
      const wrapped = (total + 24*60) % (24*60);
      const newH = Math.floor(wrapped/60);
      const newM = wrapped % 60;
      return pad2(newH) + ':' + pad2(newM);
    }

    // robust writer for #generatedSummary: temporarily clear readonly, write (append or replace)
    // If the user manually edited the textarea (manualSummaryEdited === true), do not clobber their edits when asked to replace;
    // instead append the new content below.
    function writeGeneratedSummary(text, opts) {
      // opts: { replace: boolean }
      opts = opts || {};
      const ta = document.getElementById('generatedSummary');
      if (!ta) { console.warn('writeGeneratedSummary: textarea not found'); return; }
      // perform write on next tick to avoid interference with other DOM updates
      setTimeout(() => {
        const wasReadOnly = ta.hasAttribute('readonly');
        try {
          if (wasReadOnly) ta.removeAttribute('readonly');
          if (opts.replace) {
            if (manualSummaryEdited) {
              // user edited manually — append instead of replacing to avoid losing user's changes
              const cur = ta.value || '';
              const sep = cur && cur.trim() ? '\n\n' : '';
              ta.value = cur + sep + (text || '');
            } else {
              ta.value = text || '';
            }
          } else {
            // append ensuring a trailing newline separator
            const cur = ta.value || '';
            ta.value = (cur && cur.trim() && !cur.endsWith('\n') ? cur + '\n' : cur) + (text || '');
          }
          // dispatch input event so any listeners notice the change
          try {
            _suppressSummaryInputHandler = true;
            ta.dispatchEvent(new Event('input', { bubbles: true }));
          } catch(e){} finally { _suppressSummaryInputHandler = false; }
          // scroll to bottom so new content is visible
          ta.scrollTop = ta.scrollHeight;
        } finally {
          // restore readonly state if it existed
          if (wasReadOnly) ta.setAttribute('readonly','');
        }
      }, 40);
    }

    (function checkProtocolAndWarn(){
      if (window.location.protocol === 'file:') {
        const container = document.getElementById('step1');
        container.innerHTML = `
          <div style="padding:1.2rem;border:2px solid #ffdcdc;background:#fff5f5;border-radius:0.8rem;">
            <h3 style="margin:0 0 .5rem 0;color:#a33;">파일에서 직접 열려 있습니다 — CSV를 불러올 수 없습니다</h3>
            <div style="color:#333;margin-bottom:.6rem;">이 페이지는 CSV 파일을 브라우저에서 불러오기 위해 HTTP로 서빙되어야 합니다. 현재 파일 프로토콜(file://)로 열려 있어 브라우저가 외부 리소스(fetch)를 차단합니다.</div>
            <div style="font-size:0.95rem;color:#333;margin-bottom:.6rem;">권장: 해당 폴더에서 간단한 HTTP 서버를 켜고 아래 URL로 접속하세요:</div>
            <pre style="background:#f6f8ff;border-radius:6px;padding:.6rem;color:#0b2b5a">python -m http.server 8000</pre>
            <div style="margin-top:.6rem;display:flex;gap:.5rem;">
              <button id="copyCmd" style="padding:.5rem 1rem;border-radius:.5rem;border:none;background:#1e3c72;color:#fff;cursor:pointer;">명령어 복사</button>
              <button id="openGuide" style="padding:.5rem 1rem;border-radius:.5rem;border:1px solid #ddd;background:#fff;cursor:pointer;">서버 실행 가이드 보기</button>
            </div>
            <div style="margin-top:.6rem;color:#666;font-size:.9rem;">참고: 서버 실행 후 브라우저에서 <code>http://localhost:8000/input?user=송훈재</code> 로 접속하세요.</div>
          </div>`;
        document.getElementById('copyCmd').addEventListener('click', () => {
          navigator.clipboard && navigator.clipboard.writeText('python -m http.server 8000');
          alert('명령어가 클립보드에 복사되었습니다. PowerShell에서 붙여넣기 하여 실행하세요.');
        });
        document.getElementById('openGuide').addEventListener('click', () => {
          alert('PowerShell 또는 터미널에서 프로젝트 루트 폴더로 이동한 뒤:\ncd "C:\\Users\\PC\\Desktop\\조경수_업무\\flask-web-app\\cmass-sales-system"; python -m http.server 8000\n그 다음 브라우저에서 http://localhost:8000/input?user=송훈재 로 엽니다.');
        });
        // Prevent the rest of the script from running (skip fetch)
        return;
      }
    })();

    // sales_staff.csv 기반 담당자별 지역-학교명 2단 드롭다운 (PapaParse 사용)
    function getStaffFromQuery() {
      const params = new URLSearchParams(window.location.search);
      const user = params.get('user');
      if (!user) return '';
      // canonical lowercase mapping (normalize incoming token to lower case)
      const lowerMap = {
        'songhoonjae': '송훈재 부장',
        'songhunje': '송훈재 부장', // legacy variant
        'limjunho': '임준호 차장',
        'imjunho': '임준호 차장', // legacy variant
        'choyounghwan': '조영환 부장',
        'joyounghwan': '조영환 부장' // legacy variant
      };
      const directMap = {
        'Songhoonjae': '송훈재 부장',
        'LimJunho': '임준호 차장',
        'ChoYounghwan': '조영환 부장'
      };
      // canonical key mapping: lowercase/legacy -> canonical token used in links
      const canonicalKeyForLower = {
        'songhoonjae': 'Songhoonjae',
        'songhunje': 'Songhoonjae',
        'limjunho': 'LimJunho',
        'imjunho': 'LimJunho',
        'choyounghwan': 'ChoYounghwan',
        'joyounghwan': 'ChoYounghwan'
      };
      const lower = (user || '').toLowerCase();
      // if a legacy/lowercase token was used, canonicalize the URL to the preferred token
      try {
        const canonical = canonicalKeyForLower[lower] || (directMap[user] ? user : null);
        if (canonical && canonical !== user) {
          const newUrl = window.location.pathname + '?user=' + canonical + (window.location.hash || '');
          history.replaceState(null, '', newUrl);
        }
      } catch (e) { /* ignore replaceState errors in older webviews */ }
      if (lowerMap[lower]) return lowerMap[lower];
      if (directMap[user]) return directMap[user];
      // fallback to returning the raw param so downstream code can still show it
      return user;
    }
    let staffData = [];
    document.addEventListener('DOMContentLoaded', function() {
      // utility to normalize strings: remove BOM, collapse newlines and excessive spaces but keep internal spaces
      const clean = s => {
        if (s === null || s === undefined) return '';
        let str = String(s);
        // remove leading BOM
        str = str.replace(/^\uFEFF/, '');
        // replace newlines/carriage returns with a single space
        str = str.replace(/[\r\n]+/g, ' ');
        // collapse multiple spaces/tabs into one
        str = str.replace(/\s+/g, ' ').trim();
        return str;
      };
      let staffParam = '';
      // Use query param mapping when available; don't force a hardcoded default here.
      // `getStaffFromQuery()` already maps english tokens -> Korean + title and canonicalizes the URL.
      let staff = getStaffFromQuery() || '';
      // show a clear placeholder if no staff was provided
      document.getElementById('staffInfo').textContent = '담당자: ' + (staff || '-');
      // PIN protection: require 4-digit PIN for specific staff members before allowing form use
      try {
        const normalizeForPin = s => (s||'').toString().replace(/\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)/g,'').trim();
        const pinMap = { '송훈재': '8747', '임준호': '1203', '조영환': '0686' };
        const baseForPin = normalizeForPin(staff);
        const needPin = Object.prototype.hasOwnProperty.call(pinMap, baseForPin);
        let alreadyAuth = false;
        try {
          const stored = sessionStorage.getItem('cmass_pin_authenticated');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.staff === baseForPin) alreadyAuth = true;
          }
        } catch (_e) { /* ignore parse errors */ }

        // show overlay only when PIN is required and not already authenticated in this session
        if (needPin && !alreadyAuth) {
          const overlay = document.getElementById('pinOverlay');
          const pinInput = document.getElementById('pinInput');
          const pinErr = document.getElementById('pinError');
          const pinBtn = document.getElementById('pinProceed');
          if (overlay && pinInput && pinBtn) {
            document.body.style.overflow = 'hidden';
            overlay.style.display = 'flex';
            pinInput.focus();
            const clearError = () => { pinErr.textContent = ''; pinInput.classList.remove('contact-invalid'); };
            const hideOverlay = () => { overlay.style.display = 'none'; document.body.style.overflow = ''; };
            const checkPin = async () => {
              const val = (pinInput.value || '').toString().trim();
              if (!/^\d{4}$/.test(val)) { pinErr.textContent = '4자리 숫자 PIN을 정확히 입력하세요.'; pinInput.classList.add('contact-invalid'); return; }
              // Try relative path first (works when backend is proxied), then fall back to deployed Cloud Run URL.
              // Prefer Cloud Run absolute URL first for robustness in embedded environments
              // Use same-origin API only; remove external fallback to avoid CORS.
              const candidates = ['/api/pin-check'];
              let lastErr = null;
              for (const url of candidates) {
                try {
                  const resp = await fetch(url, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ staff: baseForPin, pin: val })
                  });
                  // Safely parse response only if JSON
                  const ct = (resp.headers.get('content-type') || '').toLowerCase();
                  let j = null;
                  if (ct.indexOf('application/json') !== -1) {
                    try { j = await resp.json(); } catch(parseErr) { j = { ok: false, msg: '응답 파싱 실패' }; }
                  } else {
                    // try to read text to give a helpful message
                    try { const txt = await resp.text(); j = { ok: false, msg: '서버 응답이 JSON이 아닙니다: ' + (txt||'').slice(0,200) }; } catch(_) { j = { ok: false, msg: '서버 응답이 비어있거나 파싱 불가' }; }
                  }
                  if (resp.ok && j && j.ok) {
                    try { sessionStorage.setItem('cmass_pin_authenticated', JSON.stringify({ staff: baseForPin, ts: Date.now() })); } catch(e){}
                    hideOverlay(); clearError();
                    return;
                  } else {
                    // if this candidate was the relative path and it returned a non-JSON/404 HTML page, try next candidate
                    if (url === candidates[0]) {
                      // continue to fallback
                      lastErr = j && j.msg ? j.msg : ('HTTP ' + resp.status);
                      continue;
                    }
                    pinErr.textContent = (j && j.msg) ? j.msg : 'PIN이 일치하지 않습니다.';
                    pinInput.classList.add('contact-invalid'); pinInput.select();
                    return;
                  }
                } catch(e) {
                  lastErr = e && e.message ? e.message : String(e);
                  // try next candidate
                  continue;
                }
              }
              // all candidates failed
              pinErr.textContent = '서버에 연결할 수 없습니다: ' + (lastErr || '알 수 없는 오류');
            };
            pinBtn.addEventListener('click', checkPin);
            pinInput.addEventListener('keydown', (ev)=>{ clearError(); if (ev.key === 'Enter') { ev.preventDefault(); checkPin(); } });
          }
        }
      } catch(e) { console.warn('PIN protection setup failed', e); }
      // step1(첫 화면) 숨기고 step2(입력 화면) 보이기
      var step1 = document.getElementById('step1');
      var step2 = document.getElementById('step2');
      // Do NOT auto-advance to step2 on page load. Require the user to click '다음'.
      // Previous behavior auto-hid step1 and showed step2 when a ?user= parameter existed.
      // if (step1 && step2) {
      //   step1.style.display = 'none';
      //   step2.style.display = 'block';
      // }
      fetch('sales_staff.csv')
        .then(res => res.text())
        .then(csv => {
          // 컬럼명에 공백/줄바꿈/BOM 등 특수문자 있어도 인덱스 기반 접근
          const parsed = Papa.parse(csv, {header: true, skipEmptyLines: true});
          staffData = parsed.data.map(row => {
            const keys = Object.keys(row);
            const staffVal = clean(row['담당자'] || row[keys[keys.length-1]]);
            const region = clean(row['지역'] || row[keys[2]]);
            const school = clean(row['학교명'] || row[keys[4]]);
            // try to capture education-office columns and public school code when present
            const sido = clean(row['시도교육청'] || row['시도'] || row['시도교육'] || row[keys[0]] || '');
            const ofc = clean(row['교육지원청'] || row['교육청'] || row['교육지원'] || row[keys[1]] || '');
            const infoCode = clean(row['정보공시학교코드'] || row['SCHOOL_CODE'] || row['학교코드'] || row['정보공시코드'] || '');
            const atptRaw = clean(row['ATPT_OFCDC_SC_CODE'] || row['ATPT'] || row['ATPT_CODE'] || row['교육청코드'] || row['교육청코드_raw'] || '');
            const establish = clean(row['설립구분'] || row['설립구분'] || row[keys.indexOf('설립구분')>-1? '설립구분' : keys[6]] || '');
            const level = clean(row['학교급'] || row['학교급'] || row[keys.indexOf('학교급')>-1? '학교급' : keys[keys.length-2]] || '');
            const g1_class = clean(row['1학년학급수'] || row[keys.indexOf('1학년학급수')>-1? '1학년학급수' : keys[10]] || '');
            const g1_students = clean(row['1학년학생수'] || row[keys.indexOf('1학년학생수')>-1? '1학년학생수' : keys[11]] || '');
            const g2_class = clean(row['2학년학급수'] || row[keys.indexOf('2학년학급수')>-1? '2학년학급수' : keys[13]] || '');
            const g2_students = clean(row['2학년학생수'] || row[keys.indexOf('2학년학생수')>-1? '2학년학생수' : keys[14]] || '');
            const g3_class = clean(row['3학년학급수'] || row[keys.indexOf('3학년학급수')>-1? '3학년학급수' : keys[16]] || '');
            const g3_students = clean(row['3학년학생수'] || row[keys.indexOf('3학년학생수')>-1? '3학년학생수' : keys[17]] || '');
            const feature = clean(row['학교특성'] || row[keys.indexOf('학교특성')>-1? '학교특성' : keys[Math.max(0, keys.length-4)]] || '');
            return { staff: staffVal, region, school, establish, level, g1_class, g1_students, g2_class, g2_students, g3_class, g3_students, feature, sido, ofc, infoCode, atptRaw };
          });
          console.log('parsed rows count:', parsed.data.length);
          console.log('staffData (sample 5):', staffData.slice(0,5));
          console.log('staffData length:', staffData.length);
          // build helper maps from CSV for debugging and optional mapping
          window.atptCsvMap = window.atptCsvMap || {}; // map of office name -> resolved atpt code (best-effort)
          window.schoolInfoCodeMap = window.schoolInfoCodeMap || {}; // map school name -> info public code (S09...)
          (function buildCsvMaps(){
            const seen = new Set();
            // load any user overrides persisted in localStorage (key: cmass_atpt_map_v1)
            try{
              const raw = localStorage.getItem('cmass_atpt_map_v1');
              if (raw){
                const parsedMap = JSON.parse(raw);
                window.atptCsvMap = Object.assign({}, window.atptCsvMap || {}, parsedMap || {});
              }
            } catch(e){ console.warn('failed to load atpt map from localStorage', e); }
            staffData.forEach(d => {
              if (d.infoCode) window.schoolInfoCodeMap[d.school] = d.infoCode;
              // if CSV provides an explicit ATPT code, use it to map common region labels -> code
              const atptCandidate = (d.atptRaw || '').toString().trim();
              const atptPattern = /^[A-Z]\d{2}$/; // e.g. B10, I10, J10
              const candidates = [d.sido, d.ofc, d.region];
              if (atptCandidate && atptPattern.test(atptCandidate)){
                for (const c of candidates){ if (c && !window.atptCsvMap[c]) window.atptCsvMap[c] = atptCandidate; }
              } else {
                // fall back to recording the region strings for later manual mapping
                for (const c of candidates){ if (c && !seen.has(c)) { seen.add(c); /* placeholder */ } }
              }
            });
            console.log('atptCsvMap (sample):', Object.entries(window.atptCsvMap).slice(0,10));
            console.log('schoolInfoCodeMap (sample):', Object.entries(window.schoolInfoCodeMap).slice(0,10));
          })();
            // --- ATPT 매핑 편집기 초기화 ---
            (function initAtptMapEditor(){
              function saveLocalMap(){
                try{ localStorage.setItem('cmass_atpt_map_v1', JSON.stringify(window.atptCsvMap || {})); }catch(e){ console.warn('saveLocalMap failed', e); }
              }
              function renderList(){
                const list = document.getElementById('atptMapList');
                if (!list) return;
                list.innerHTML = '';
                const entries = Object.entries(window.atptCsvMap || {});
                if (!entries.length) { list.innerHTML = '<div style="color:#666">등록된 매핑이 없습니다.</div>'; return; }
                entries.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([k,v])=>{
                  const row = document.createElement('div');
                  row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center'; row.style.padding='6px 4px';
                  const left = document.createElement('div'); left.style.fontSize='13px'; left.textContent = k + ' → ' + v;
                  const del = document.createElement('button'); del.type='button'; del.textContent='삭제'; del.style.marginLeft='8px'; del.className='meeting-btn'; del.style.padding='4px .6rem'; del.addEventListener('click', ()=>{ delete window.atptCsvMap[k]; saveLocalMap(); renderList(); });
                  row.appendChild(left); row.appendChild(del); list.appendChild(row);
                });
              }
              const btn = document.getElementById('btnEditAtptMap');
              const modal = document.getElementById('atptMapModal');
              const addBtn = document.getElementById('atptMapAddBtn');
              const closeBtn = document.getElementById('atptMapCloseBtn');
              const regionInput = document.getElementById('atptMapRegionInput');
              const codeInput = document.getElementById('atptMapCodeInput');
              if (!btn || !modal) return;
              btn.addEventListener('click', ()=>{ renderList(); modal.style.display='block'; });
              closeBtn && closeBtn.addEventListener('click', ()=>{ modal.style.display='none'; });
              addBtn && addBtn.addEventListener('click', ()=>{
                const r = (regionInput.value||'').trim(); const c = (codeInput.value||'').trim().toUpperCase();
                if (!r || !c) { alert('지역명과 코드를 모두 입력하세요.'); return; }
                // basic validation for code like B10
                if (!/^[A-Z]\d{2}$/.test(c)) { if (!confirm('코드 형식이 예상과 다릅니다. 계속 저장할까요?')) return; }
                window.atptCsvMap[r] = c; saveLocalMap(); renderList(); regionInput.value=''; codeInput.value='';
              });
              // click outside modal to close
              window.addEventListener('click', (ev)=>{ if (modal && modal.style.display==='block' && !modal.contains(ev.target) && ev.target !== btn) modal.style.display='none'; });
            })();
          const regionButtons = document.getElementById('regionButtons');
          regionButtons.innerHTML = '';
          // staff 변수도 동일하게 정제해서 비교
          // normalize early so defaults like '송훈재 부장' or '임준호 차장' match CSV '송훈재' / '임준호'
          // Robust normalization for staff param: remove BOM/zero-width/non-breaking spaces,
          // strip common titles at the end (부장/차장/과장/팀장/대리/사원/선생님/선생),
          // and collapse whitespace. This ensures '임준호 차장' -> '임준호'.
          const normalizeStaffImmediate = s => {
            if (s === null || s === undefined) return '';
            // replace invisible whitespace characters with normal space
            let t = String(s).replace(/\uFEFF|\u00A0|\u200B|\u200C|\u200D|\u3000/g,' ');
            // collapse whitespace
            t = t.replace(/\s+/g,' ').trim();
            // remove trailing titles (only when they appear as a separate token at end)
            t = t.replace(/\s*(부장|차장|과장|팀장|대리|사원|선생님|선생)\s*$/,'').trim();
            return t;
          };
          staffParam = normalizeStaffImmediate(clean(staff));
          // staffParam is used internally; avoid noisy console output in production
          // initialize generatedSummary textarea with report intro header
          const gen = document.getElementById('generatedSummary');
          if (gen) {
            // if textarea contains the placeholder text, replace with intro
            const cur = (gen.value || '').trim();
            if (!cur || cur === '요약이 여기에 생성됩니다.') {
              // use writeGeneratedSummary replace to ensure readonly handling is consistent
              writeGeneratedSummary(reportIntro(), { replace: true });
            }
          }
          // match staff rows using normalized names (strip titles) so both English tokens and Korean names match
          const matchedRowsExact = staffData.filter(d => normalizeStaff(d.staff) === normalizeStaff(staffParam));
          let matchedRows = matchedRowsExact.slice();
          // normalize staff names (remove common titles like '부장', '차장', '대리') for tolerant matching
          // Keep this in sync with normalizeStaffImmediate above.
          const normalizeStaff = s => (s||'').toString().replace(/\s*(부장|차장|과장|팀장|대리|사원|선생님|선생)/g, '').trim();
          // normalize arbitrary names/labels for region/school matching:
          // - remove parenthetical text, non-alphanumeric/korean characters, collapse spaces, lowercase
          const normalizeName = s => (s||'').toString().replace(/\(.+?\)/g,'').replace(/[^0-9a-zA-Z가-힣\s]/g,'').replace(/\s+/g,' ').trim().toLowerCase();
          // tolerant mappings for common latin usernames -> Korean names
          // keys must be lowercase because we compare using lowerParam = staffParam.toLowerCase()
          const staffMap = {
            'songhoonjae': '송훈재',
            'choyounghwan': '조영환',
            'limjunho': '임준호'
          };
          // if no exact matches, try mapping or partial contains matches
          if (!matchedRows.length) {
            const lowerParam = staffParam.toLowerCase();
            if (staffMap[lowerParam]) {
              const mapped = staffMap[lowerParam];
              // compare using normalized names so titles like '차장' won't prevent a match
              matchedRows = staffData.filter(d => normalizeStaff(d.staff) === normalizeStaff(mapped));
              if (matchedRows.length) {
                console.log('Mapped user param', staffParam, '->', mapped);
                staffParam = mapped;
              }
            }
          }
          if (!matchedRows.length) {
            // partial contains match: staff names that include param or vice versa
            matchedRows = staffData.filter(d => {
              const a = (d.staff||'').toString();
              const b = (staffParam||'').toString();
              return (a && a.indexOf(b) > -1) || (b && b.indexOf(a) > -1) || (normalizeStaff(a) && normalizeStaff(a).indexOf(normalizeStaff(b)) > -1) || (normalizeStaff(b) && normalizeStaff(b).indexOf(normalizeStaff(a)) > -1);
            });
            if (matchedRows.length) console.log('Partial-match rows found for', staffParam, matchedRows.length);
          }
          console.log('matchedRows count:', matchedRows.length);
          let regions = [...new Set(matchedRows.map(d => d.region))];
          // fallback: if this staff has no mapped regions, show all regions and mark as fallback
          let usedFallback = false;
          if (!regions.length) {
            regions = [...new Set(staffData.map(d => d.region))];
            usedFallback = true;
            console.warn('No regions found for', staffParam, '- falling back to full region list');
          }
          console.log('regions:', regions);
          // create region buttons
          regions.forEach(region => {
            if (region) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = 'grid-button';
              btn.dataset.region = region;
              btn.setAttribute('role','option');
              btn.setAttribute('aria-selected','false');
              btn.tabIndex = 0;
              btn.textContent = region;
              btn.title = region;
              regionButtons.appendChild(btn);
            }
          });
          if (usedFallback) {
            const note = document.createElement('div');
            note.style.fontSize = '0.9rem';
            note.style.color = '#666';
            note.style.marginTop = '0.4rem';
            note.textContent = '※ 해당 담당자에 매핑된 학교가 없어 전체 목록을 표시합니다.';
            regionButtons.parentNode.insertBefore(note, regionButtons.nextSibling);
          }
          // selection state
          let selectedRegion = '';
          let selectedSchool = '';
          const schoolButtons = document.getElementById('schoolButtons');
          // delegate region clicks
          regionButtons.addEventListener('click', (ev) => {
            const b = ev.target.closest('.grid-button');
            if (!b) return;
            selectedRegion = b.dataset.region;
            // update selected style and aria
            regionButtons.querySelectorAll('.grid-button').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-selected','false'); });
            b.classList.add('selected'); b.setAttribute('aria-selected','true');
            // populate schools for selected region
            schoolButtons.innerHTML = '';
            selectedSchool = '';
            // find schools for this region filtered by staff (preferred)
            let schools = [...new Set(
  staffData.filter(d => 
    d.region === selectedRegion && ( (d.staff||'').includes(staffParam) || normalizeStaff(d.staff) === normalizeStaff(staffParam) )
  ).map(d => d.school)
)];
            // If no staff-specific schools found, fall back to any school in the region
            let usedRegionFallbackForSchools = false;
            if (!schools.length) {
              schools = [...new Set(staffData.filter(d => d.region === selectedRegion).map(d => d.school))];
              usedRegionFallbackForSchools = true;
            }
            schools.forEach(school => {
              if (school) {
                const sb = document.createElement('button');
                sb.type = 'button';
                sb.className = 'grid-button';
                sb.dataset.school = school;
                sb.setAttribute('role','option');
                sb.setAttribute('aria-selected','false');
                sb.tabIndex = 0;
                sb.textContent = school;
                sb.title = school;
                schoolButtons.appendChild(sb);
              }
            });
            // If schools were populated, auto-select the first one to show the school name
            // (improves UX so users see the selected school immediately after choosing a region)
            if (schoolButtons.querySelectorAll('.grid-button').length > 0) {
              const first = schoolButtons.querySelector('.grid-button');
              // mark the first button when we used a region-fallback so downstream logic can detect it if needed
              if (usedRegionFallbackForSchools) first.dataset.fallback = 'region';
              // simulate a click so the existing school click handler runs (sets hidden inputs and display)
              try { first.click(); } catch(e){ /* ignore */ }
            }
          });
          // delegate school clicks - show metadata and set hidden inputs
          schoolButtons.addEventListener('click', async (ev) => {
            const b = ev.target.closest('.grid-button');
            if (!b) return;
            selectedSchool = b.dataset.school;
            schoolButtons.querySelectorAll('.grid-button').forEach(x => { x.classList.remove('selected'); x.setAttribute('aria-selected','false'); });
            b.classList.add('selected'); b.setAttribute('aria-selected','true');
            // populate hidden inputs and visible display
            document.getElementById('selectedRegionInput').value = selectedRegion;
            document.getElementById('selectedSchoolInput').value = selectedSchool;
            document.getElementById('displayRegion').textContent = selectedRegion;
            document.getElementById('displaySchool').textContent = selectedSchool;
            document.getElementById('selectedInfo').style.display = 'block';
            // If there's already a visit for this date+school in today's list, offer to append (이어쓰기)
            try {
              const visitDateVal = (document.getElementById('visitDate')||{}).value || '';
              if (visitDateVal && Array.isArray(dayVisits) && dayVisits.length) {
                const existingIndex = dayVisits.findIndex(v => v.visitDate === visitDateVal && v.school === selectedSchool);
                if (existingIndex >= 0) {
                  try{
                    const ok = await showConfirmModal('이미 해당 방문일에 이 학교의 기록이 있습니다. 이어쓰기 하시겠습니까?');
                    if (ok) { try { if (typeof loadVisitToForm === 'function') { loadVisitToForm(existingIndex); } } catch(e){}; return; }
                  }catch(e){ /* ignore */ }
                }
              }
            } catch(e) { /* ignore errors */ }
            // find metadata row (match by staff, region, school)
            // Detailed debug: show raw and normalized values and matching rows to diagnose why meta may be missing
            let meta = null;
            let rowsByRegionSchool = [];
            try {
              const rawStaff = (staffParam||'').toString();
              const normStaff = normalizeStaff(rawStaff);
              const rawRegion = (selectedRegion||'').toString();
              const rawSchool = (selectedSchool||'').toString();
              console.log('SCHOOL_CLICK', { rawStaff, normStaff, rawRegion, rawSchool });
              // normalize region/school strings for more robust matching
              const nRawRegion = normalizeName(rawRegion);
              const nRawSchool = normalizeName(rawSchool);
              // staff-specific tolerant matches for this region+school using normalized names
              const matchedStaffRows = staffData.filter(d => {
                const ds = normalizeStaff(d.staff || '');
                const nDr = normalizeName(d.region || '');
                const nDschool = normalizeName(d.school || '');
                const staffMatch = ds && (ds === normStaff || ds.indexOf(normStaff) !== -1 || normStaff.indexOf(ds) !== -1);
                const schoolMatch = nDschool === nRawSchool || nDschool.indexOf(nRawSchool) !== -1 || nRawSchool.indexOf(nDschool) !== -1;
                const regionMatch = nDr === nRawRegion || nDr.indexOf(nRawRegion) !== -1 || nRawRegion.indexOf(nDr) !== -1;
                return staffMatch && regionMatch && schoolMatch;
              });
              // any rows that match region+school (fallback candidates) with normalized matching
              rowsByRegionSchool = staffData.filter(d => {
                const nDr = normalizeName(d.region || '');
                const nDschool = normalizeName(d.school || '');
                const schoolMatch = nDschool === nRawSchool || nDschool.indexOf(nRawSchool) !== -1 || nRawSchool.indexOf(nDschool) !== -1;
                const regionMatch = nDr === nRawRegion || nDr.indexOf(nRawRegion) !== -1 || nRawRegion.indexOf(nDr) !== -1;
                return regionMatch && schoolMatch;
              });
              console.log('DBG matchedStaffRows count:', matchedStaffRows.length, matchedStaffRows.slice(0,5));
              console.log('DBG rowsByRegionSchool count:', rowsByRegionSchool.length, rowsByRegionSchool.slice(0,5));
              // choose meta: prefer staff-specific row, else fallback to region+school row
              meta = (matchedStaffRows.length ? matchedStaffRows[0] : (rowsByRegionSchool.length ? rowsByRegionSchool[0] : null));

              // If still no meta, try a conservative fuzzy-match fallback within the same region
              // This helps when UI label slightly differs (abbrev/spacing/parentheses) from CSV school name.
              if (!meta) {
                try {
                  // simple levenshtein implementation (local copy to avoid cross-scope dependency)
                  function levenshteinLocal(a,b){
                    if(a===b) return 0;
                    a = a || '';
                    b = b || '';
                    const m = a.length, n = b.length;
                    if(m===0) return n; if(n===0) return m;
                    let v0 = new Array(n+1), v1 = new Array(n+1);
                    for(let j=0;j<=n;j++) v0[j]=j;
                    for(let i=0;i<m;i++){
                      v1[0]=i+1;
                      for(let j=0;j<n;j++){
                        const cost = a[i]===b[j] ? 0 : 1;
                        v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
                      }
                      const tmp=v0; v0=v1; v1=tmp;
                    }
                    return v0[n];
                  }
                  // prepare candidates: prefer same-region rows, else fall back to all rows
                  let fuzzyCandidates = staffData.filter(d => normalizeName(d.region || '') === nRawRegion);
                  if (!fuzzyCandidates.length) fuzzyCandidates = staffData.slice();
                  const q = nRawSchool;
                  let best = null; let bestScore = 0;
                  for (const c of fuzzyCandidates) {
                    const candName = normalizeName(c.school || '');
                    if (!candName) continue;
                    // token overlap
                    const qTokens = q.split(' ').filter(Boolean);
                    const cTokens = candName.split(' ').filter(Boolean);
                    let overlap = 0;
                    for (const t of qTokens) { if (cTokens.indexOf(t) !== -1) overlap++; }
                    const overlapRatio = qTokens.length ? (overlap / qTokens.length) : 0;
                    // levenshtein ratio
                    const lev = levenshteinLocal(q, candName);
                    const maxL = Math.max(1, q.length, candName.length);
                    const levScore = 1 - (lev / maxL);
                    const score = Math.max(overlapRatio, levScore);
                    if (score > bestScore) { bestScore = score; best = c; }
                  }
                  // require a reasonably strong match to avoid false positives
                  if (best && bestScore >= 0.60) {
                    meta = best;
                    console.log('SCHOOL_META_FUZZY: matched', selectedSchool, '->', best.school, 'score=', bestScore.toFixed(2));
                  } else {
                    console.log('SCHOOL_META_FUZZY: no confident fuzzy match (bestScore=', bestScore.toFixed(2), ') for', selectedSchool);
                  }
                } catch(e) { console.warn('SCHOOL_META_FUZZY failed', e); }
              }
            } catch(e) { console.warn('SCHOOL_CLICK debug failed', e); }
            // If we didn't find metadata in the CSV, try a NEIS schoolInfo lookup as a best-effort fallback.
            if (!meta) {
              try{
                console.log('SCHOOL_META_FALLBACK: no CSV meta, trying NEIS schoolInfo for', { region: selectedRegion, school: selectedSchool });
                const atptCode = resolveAtptCodeForRegion(selectedRegion || '') || '';
                if (atptCode) {
                  const schoolInfoUrl = `https://open.neis.go.kr/hub/schoolInfo?KEY=${NEIS_KEY}&type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${encodeURIComponent(atptCode)}&SCHUL_NM=${encodeURIComponent(selectedSchool)}`;
                  console.log('SCHOOL_META_FALLBACK: NEIS schoolInfo URL:', schoolInfoUrl);
                  try{
                    const siRes = await fetch(schoolInfoUrl);
                    const siText = await siRes.text();
                    console.log('SCHOOL_META_FALLBACK: NEIS schoolInfo status:', siRes.status);
                    if (siRes.ok) {
                      let siJson = null;
                      try{ siJson = JSON.parse(siText); } catch(e){ siJson = null; }
                      const siBlock = siJson && siJson.schoolInfo;
                      const siRows = (Array.isArray(siBlock) && siBlock.length>1 && siBlock[1].row) ? siBlock[1].row : [];
                      if (siRows && siRows.length) {
                        const found = siRows[0];
                        // Map NEIS fields conservatively to our metadata model
                        meta = {
                          establish: found.FOND_SC_NM || found.FOND_NM || found.FOND_SC_NM || '',
                          level: found.SCHUL_KND_SC_NM || found.SCHUL_KND_NM || '',
                          g1_class: '-', g1_students: '-', g2_class: '-', g2_students: '-', g3_class: '-', g3_students: '-',
                          feature: (found.SCHUL_MAST_NM || found.ORG_RDNZC || '')
                        };
                        // NEIS gives numeric school code we can store for later timetable resolution
                        if (found.SD_SCHUL_CODE) meta.infoCode = found.SD_SCHUL_CODE;
                        meta.__source = 'neisFallback';
                        console.log('SCHOOL_META_FALLBACK: NEIS provided metadata:', meta);
                      }
                    }
                  } catch(e){ console.warn('SCHOOL_META_FALLBACK NEIS fetch failed', e); }
                }
              } catch(e){ console.warn('SCHOOL_META_FALLBACK failed', e); }
            }

            if (meta) {
              // tag the meta for UI so we can show source when fallback used
              meta.__source = meta.__source || (rowsByRegionSchool.length && rowsByRegionSchool[0] === meta ? 'regionFallback' : 'staffSpecific');
              // Step2 metadata panel
              document.getElementById('schoolMeta').style.display = 'block';
              (function(){ const el1 = document.getElementById('metaEstablish'); if(el1) el1.textContent = (meta.establish && meta.establish.toString().trim()) ? meta.establish : '-'; const el2 = document.getElementById('metaLevel'); if(el2) el2.textContent = (meta.level && meta.level.toString().trim()) ? meta.level : '-'; })();
              document.getElementById('metaG1c').textContent = meta.g1_class || '-';
              document.getElementById('metaG1s').textContent = meta.g1_students || '-';
              document.getElementById('metaG2c').textContent = meta.g2_class || '-';
              document.getElementById('metaG2s').textContent = meta.g2_students || '-';
              document.getElementById('metaG3c').textContent = meta.g3_class || '-';
              document.getElementById('metaG3s').textContent = meta.g3_students || '-';
              // update meta-summary pills
              document.getElementById('metaPillEstablish').textContent = (meta.establish || '-');
              document.getElementById('metaPillLevel').textContent = (meta.level || '-');
              // compute total students where numeric
              const toNum = v => { const n = parseInt((v||'').toString().replace(/[^0-9]/g,''),10); return isNaN(n)?0:n; };
              const totalStudents = toNum(meta.g1_students) + toNum(meta.g2_students) + toNum(meta.g3_students);
              document.getElementById('metaPillStudents').textContent = '총학생수: ' + (totalStudents > 0 ? totalStudents : '-');
              // school feature (학교특성) - show only for 고등 schools
              const featureText = meta.feature || '';
              const showFeature = (meta.level || '').toString().indexOf('고등') > -1 && featureText;
              const metaFeatureEl = document.getElementById('metaPillFeature');
              if (metaFeatureEl) {
                metaFeatureEl.textContent = showFeature ? ('특성: ' + featureText) : '';
                metaFeatureEl.style.display = showFeature ? 'inline-block' : 'none';
              }
              // Inline immediate metadata
              document.getElementById('schoolMetaInline').style.display = 'block';
              (function(){ const i1 = document.getElementById('inlineEstablish'); if(i1) i1.textContent = (meta.establish && meta.establish.toString().trim()) ? meta.establish : '-'; const i2 = document.getElementById('inlineLevel'); if(i2) i2.textContent = (meta.level && meta.level.toString().trim()) ? meta.level : '-'; })();
              document.getElementById('inlineG1c').textContent = meta.g1_class || '-';
              document.getElementById('inlineG1s').textContent = meta.g1_students || '-';
              document.getElementById('inlineG2c').textContent = meta.g2_class || '-';
              document.getElementById('inlineG2s').textContent = meta.g2_students || '-';
              document.getElementById('inlineG3c').textContent = meta.g3_class || '-';
              document.getElementById('inlineG3s').textContent = meta.g3_students || '-';
              document.getElementById('inlinePillEstablish').textContent = (meta.establish || '-');
              document.getElementById('inlinePillLevel').textContent = (meta.level || '-');
              document.getElementById('inlinePillStudents').textContent = '총학생수: ' + (totalStudents > 0 ? totalStudents : '-');
              const inlineFeatureEl = document.getElementById('inlinePillFeature');
              if (inlineFeatureEl) {
                inlineFeatureEl.textContent = showFeature ? ('특성: ' + featureText) : '';
                inlineFeatureEl.style.display = showFeature ? 'inline-block' : 'none';
              }
            } else {
              document.getElementById('schoolMeta').style.display = 'none';
              document.getElementById('schoolMetaInline').style.display = 'none';
            }
            // After selecting a school, move focus to Next button
            document.getElementById('nextStepBtn').focus();
            // Also automatically fetch the selected school's timetable so the user sees it immediately.
            // This simulates clicking the "선택 학교 시간표 보기" button if present.
            try {
              const autoBtn = document.getElementById('btnFetchSelectedTimetable');
              if (autoBtn) {
                // small delay to ensure DOM updates (metadata visible) before fetching
                setTimeout(() => {
                  try { autoBtn.click(); } catch(e) { console.warn('auto timetable fetch failed', e); }
                }, 150);
              }
            } catch(e) { console.warn('auto timetable trigger failed', e); }
            // Also automatically reveal Step2 (school metadata panel / timetable) so the user sees the full
            // school info immediately after selecting a school. This does NOT perform the Next-button
            // validations (like visit date) — it only toggles the UI into the step2 view and resets time fields.
            try {
              const s1 = document.getElementById('step1');
              const s2 = document.getElementById('step2');
              if (s1 && s2) {
                try { if (typeof resetTimeFields === 'function') resetTimeFields(); } catch(e) { /* ignore */ }
                s1.style.display = 'none';
                s2.style.display = 'block';
              }
            } catch(e){ console.warn('auto show step2 failed', e); }
          });

          // keyboard navigation for grids (arrow keys)
          function makeGridKeyboardNav(container) {
            container.addEventListener('keydown', (ev) => {
              const keys = ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
              if (!keys.includes(ev.key)) return;
              ev.preventDefault();
              const buttons = Array.from(container.querySelectorAll('.grid-button'));
              if (!buttons.length) return;
              const idx = buttons.indexOf(document.activeElement);
              let next = 0;
              if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') next = (idx + 1) % buttons.length;
              if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') next = (idx - 1 + buttons.length) % buttons.length;
              buttons[next].focus();
            });
          }
          makeGridKeyboardNav(regionButtons);
          makeGridKeyboardNav(schoolButtons);

          // next step button: read selected region/school from button state
          document.getElementById('nextStepBtn').addEventListener('click', function() {
            // 방문일 필수 검사
            const vd = document.getElementById('visitDate');
            if (!vd || !vd.value) {
              alert('방문일을 입력하세요.');
              vd && vd.focus();
              return;
            }
            // `selectedRegion` and `selectedSchool` captured in closure above
            if (!selectedRegion || !selectedSchool) {
              alert('지역과 학교명을 모두 선택하세요.');
              return;
            }
            // set visible fields in step2 if needed (e.g., fill a display or hidden inputs)
            const blocks = document.querySelectorAll('.subject-name');
            if (blocks && blocks.length) {
              // no-op now; could prefill schoolName into a hidden input if desired
            }
            // reset time fields each time we enter step2
            try { resetTimeFields(); } catch(e){}
            // hide step1 / show step2 (user-initiated)
            document.getElementById('step1').style.display = 'none';
            document.getElementById('step2').style.display = 'block';
          });
          // ---------------- NEIS timetable integration ----------------
          // load reusable NEIS grid helpers
          (function(){ var s=document.createElement('script'); s.src='neis_grid.js'; s.async=false; document.head.appendChild(s); })();
          const NEIS_KEY = '94bb8b0dc511401387d36eb3f6d10905'; // user-provided key
          // map region labels to NEIS 교육청(atpt) codes.
          // staffData.region values are often detailed (e.g. "경기도수원시권선구"),
          // so resolve by exact match first, then by substring prefix match.
          const regionToAtptCode = { '서울':'B10', '인천':'I10', '경기':'J10', '서울특별시':'B10', '인천광역시':'I10', '경기도':'J10' };
          function resolveAtptCodeForRegion(regionLabel){
            if (!regionLabel) return '';
            // 1) Prefer CSV-derived mapping if available
            try{
              const csvMap = window.atptCsvMap || {};
              // CSV 기반 매핑은 정확한 키(정확한 지역/교육청명)가 있을 때만 우선 사용
              if (csvMap[regionLabel]) return csvMap[regionLabel];
            } catch(e){ /* ignore csv map errors */ }
            // 2) fall back to bundled regionToAtptCode
            if (regionToAtptCode[regionLabel]) return regionToAtptCode[regionLabel];
            const keys = Object.keys(regionToAtptCode).sort((a,b)=>b.length-a.length);
            for (const k of keys){ if (regionLabel.indexOf(k) !== -1) return regionToAtptCode[k]; }
            if (regionLabel.indexOf('경기') !== -1) return regionToAtptCode['경기'];
            if (regionLabel.indexOf('서울') !== -1) return regionToAtptCode['서울'];
            if (regionLabel.indexOf('인천') !== -1) return regionToAtptCode['인천'];
            return '';
          }

          function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

          function makeNeisUrl(kind, atptCode, sdSchulCode, year, semester, pIndex=1, pSize=1000){
            const endpoint = (kind === 'high') ? 'hisTimetable' : 'misTimetable';
            const params = new URLSearchParams({ KEY: NEIS_KEY, type: 'json', pIndex: String(pIndex), pSize: String(pSize), ATPT_OFCDC_SC_CODE: atptCode, SD_SCHUL_CODE: sdSchulCode, AY: String(year), SEM: String(semester) });
            return `https://open.neis.go.kr/hub/${endpoint}?` + params.toString();
          }

          async function fetchNeisTimetable(kind, atptCode, sdSchulCode, year, semester){
            const url = makeNeisUrl(kind, atptCode, sdSchulCode, year, semester);
            const progress = document.getElementById('timetableProgress');
            if (progress) { progress.style.display = 'block'; progress.textContent = `요청 중: ${sdSchulCode} ...`; }
            try{
              // Debug: log which identifiers we're using for this NEIS request.
              let matched = {};
              try{
                matched = staffData.find(d => d.school === sdSchulCode) || staffData.find(d => d.school && sdSchulCode && d.school.indexOf(sdSchulCode)!==-1) || {};
                const infoFromMap = (window.schoolInfoCodeMap && window.schoolInfoCodeMap[sdSchulCode]) ? window.schoolInfoCodeMap[sdSchulCode] : null;
                console.log('NEIS request', { kind, atptCode, sdSchulCode, year, semester, matchedInfoCode: matched.infoCode || null, infoFromMap, matchedSido: matched.sido || null, matchedOfc: matched.ofc || null });
              } catch(e){ console.warn('NEIS debug log failed', e); }

              // primary request
              console.log('NEIS fetch URL (primary):', url);
              let res = await fetch(url);
              const resText = await res.text();
              console.log('NEIS response (primary) status:', res.status);
              console.log('NEIS response (primary) body (truncated 4k):', resText && resText.substring ? resText.substring(0,4096) : resText);
              if (!res.ok) throw new Error('HTTP ' + res.status + ' - ' + (resText||'') );
              let j = null;
              try{ j = JSON.parse(resText); } catch(e){ console.warn('failed to parse primary NEIS response as JSON', e); j = null; }
              const rootKey = (kind === 'high') ? 'hisTimetable' : 'misTimetable';
              if (!j || !j[rootKey]) {
                // no data block at all
                // 1) Try to resolve NEIS's numeric SD_SCHUL_CODE via schoolInfo endpoint and retry
                try{
                  const schoolInfoUrl = `https://open.neis.go.kr/hub/schoolInfo?KEY=${NEIS_KEY}&type=json&pIndex=1&pSize=10&ATPT_OFCDC_SC_CODE=${encodeURIComponent(atptCode)}&SCHUL_NM=${encodeURIComponent(sdSchulCode)}`;
                  console.log('NEIS attempting schoolInfo lookup to resolve SD_SCHUL_CODE:', schoolInfoUrl);
                  const siRes = await fetch(schoolInfoUrl);
                  const siText = await siRes.text();
                  console.log('NEIS schoolInfo response status:', siRes.status);
                  console.log('NEIS schoolInfo response body (truncated 4k):', siText && siText.substring ? siText.substring(0,4096) : siText);
                  if (siRes.ok){
                    let siJson = null;
                    try{ siJson = JSON.parse(siText); } catch(e){ siJson = null; }
                    const siBlock = siJson && siJson.schoolInfo;
                    const siRows = (Array.isArray(siBlock) && siBlock.length>1 && siBlock[1].row) ? siBlock[1].row : [];
                    if (siRows && siRows.length){
                      const found = siRows[0];
                      const neisSchCode = found.SD_SCHUL_CODE || found.SD_SCHUL_CODE && found.SD_SCHUL_CODE.toString();
                      if (neisSchCode && neisSchCode !== sdSchulCode){
                        console.log('NEIS resolved SD_SCHUL_CODE via schoolInfo:', neisSchCode, '- retrying timetable');
                        const retryUrl2 = makeNeisUrl(kind, atptCode, neisSchCode, year, semester);
                        try{
                          console.log('NEIS fetch URL (schoolInfo-retry):', retryUrl2);
                          const retryRes2 = await fetch(retryUrl2);
                          const retryText2 = await retryRes2.text();
                          console.log('NEIS response (schoolInfo-retry) status:', retryRes2.status);
                          console.log('NEIS response (schoolInfo-retry) body (truncated 4k):', retryText2 && retryText2.substring ? retryText2.substring(0,4096) : retryText2);
                          if (retryRes2.ok){
                            let retryJson2 = null;
                            try{ retryJson2 = JSON.parse(retryText2); } catch(e){ retryJson2 = null; }
                            const retryBlock2 = retryJson2 && retryJson2[rootKey];
                            const retryRows2 = (Array.isArray(retryBlock2) && retryBlock2.length>1 && retryBlock2[1].row) ? retryBlock2[1].row : [];
                            if (retryRows2 && retryRows2.length) {
                              if (progress) progress.textContent = '완료(NEIS schoolInfo 재시도): ' + retryRows2.length + '행 수신';
                              return { ok:true, rows: retryRows2 };
                            }
                          }
                        } catch(e){ console.warn('NEIS schoolInfo-retry failed', e); }
                      }
                    }
                  }
                } catch(e){ console.warn('NEIS schoolInfo lookup failed', e); }

                // 2) If CSV provides an infoCode for this school, try retrying with that code as SD_SCHUL_CODE once.
                const fallbackCode = (matched && matched.infoCode) ? matched.infoCode : (window.schoolInfoCodeMap && window.schoolInfoCodeMap[sdSchulCode]) || null;
                if (fallbackCode && fallbackCode !== sdSchulCode){
                  console.log('NEIS primary returned no block; retrying with fallback SD_SCHUL_CODE=', fallbackCode);
                  const retryUrl = makeNeisUrl(kind, atptCode, fallbackCode, year, semester);
                  try{
                    console.log('NEIS fetch URL (retry):', retryUrl);
                    const retryRes = await fetch(retryUrl);
                    const retryText = await retryRes.text();
                    console.log('NEIS response (retry) status:', retryRes.status);
                    console.log('NEIS response (retry) body (truncated 4k):', retryText && retryText.substring ? retryText.substring(0,4096) : retryText);
                    if (retryRes.ok){
                      let retryJson = null;
                      try{ retryJson = JSON.parse(retryText); } catch(e){ retryJson = null; }
                      const retryBlock = retryJson && retryJson[rootKey];
                      const retryRows = (Array.isArray(retryBlock) && retryBlock.length>1 && retryBlock[1].row) ? retryBlock[1].row : [];
                      if (retryRows && retryRows.length) {
                        if (progress) progress.textContent = '완료(대체코드 재시도): ' + retryRows.length + '행 수신';
                        return { ok:true, rows: retryRows };
                      }
                    }
                  } catch(e){ console.warn('NEIS retry failed', e); }
                }
                if (progress) progress.textContent = 'NEIS: 데이터 없음';
                return { ok:false, msg: '데이터 없음' };
              }
              // NEIS JSON often: { endpoint: [ { head: [...] }, { row: [...] } ] }
              const block = j[rootKey];
              const rows = (Array.isArray(block) && block.length > 1 && block[1].row) ? block[1].row : [];
              // if rows empty but we have a matched.infoCode different from sdSchulCode, try one more time with that code
              if ((!rows || rows.length===0) && matched && matched.infoCode && matched.infoCode !== sdSchulCode){
                const fallback = matched.infoCode;
                console.log('NEIS returned no rows; attempting fallback SD_SCHUL_CODE=', fallback);
                try{
                  const retryUrl = makeNeisUrl(kind, atptCode, fallback, year, semester);
                  console.log('NEIS fetch URL (fallback):', retryUrl);
                  const retryRes = await fetch(retryUrl);
                  const retryText = await retryRes.text();
                  console.log('NEIS response (fallback) status:', retryRes.status);
                  console.log('NEIS response (fallback) body (truncated 4k):', retryText && retryText.substring ? retryText.substring(0,4096) : retryText);
                  if (retryRes.ok){
                    let retryJson = null;
                    try{ retryJson = JSON.parse(retryText); } catch(e){ retryJson = null; }
                    const retryBlock = retryJson && retryJson[rootKey];
                    const retryRows = (Array.isArray(retryBlock) && retryBlock.length>1 && retryBlock[1].row) ? retryBlock[1].row : [];
                    if (retryRows && retryRows.length) {
                      if (progress) progress.textContent = '완료(폴백): ' + retryRows.length + '행 수신';
                      return { ok:true, rows: retryRows };
                    }
                  }
                } catch(e){ console.warn('NEIS fallback fetch failed', e); }
              }
              if (progress) progress.textContent = '완료: ' + (rows ? rows.length : 0) + '행 수신';
              return { ok:true, rows };
            } catch(e){
              if (progress) progress.textContent = 'NEIS 오류: ' + (e && e.message ? e.message : String(e));
              return { ok:false, msg: e && e.message ? e.message : String(e) };
            } finally{
              // keep progress visible so the user sees the last NEIS status
            }
          }

          function renderTimetableRows(rows, title){
            const container = document.getElementById('timetableContainer');
            if (!container) return;
            const wrapper = document.createElement('div');
            wrapper.style.marginTop = '8px';
            const heading = document.createElement('h4'); heading.textContent = title; heading.style.margin='8px 0';
            wrapper.appendChild(heading);
            if (!rows || !rows.length){
              const p = document.createElement('div'); p.textContent = '해당 학교의 시간표 데이터가 없습니다.'; p.style.color='#666'; wrapper.appendChild(p); container.appendChild(wrapper); return;
            }
            const table = document.createElement('table'); table.style.width='100%'; table.style.borderCollapse='collapse'; table.style.fontSize='11px';
            const thead = document.createElement('thead'); const tbody = document.createElement('tbody');
            const keys = Object.keys(rows[0]);
            const trh = document.createElement('tr');
            keys.forEach(k=>{ const th=document.createElement('th'); th.textContent = k; th.style.border='1px solid #e6eefc'; th.style.padding='6px'; th.style.background='#f7fbff'; th.style.textAlign='left'; trh.appendChild(th); });
            thead.appendChild(trh);
            rows.forEach(r=>{ const tr=document.createElement('tr'); keys.forEach(k=>{ const td=document.createElement('td'); td.textContent = r[k] || ''; td.style.border='1px solid #f2f6ff'; td.style.padding='6px'; tr.appendChild(td); }); tbody.appendChild(tr); });
            table.appendChild(thead); table.appendChild(tbody); wrapper.appendChild(table);
            // CSV download button
            const csv = Papa.unparse(rows);
            const dl = document.createElement('a'); dl.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); dl.download = title.replace(/\s+/g,'_') + '.csv'; dl.textContent = 'CSV 다운로드'; dl.style.display = 'inline-block'; dl.style.marginTop='6px'; dl.style.color='#0b3a72'; wrapper.appendChild(dl);
            container.appendChild(wrapper);
          }

          // Render timetable as weekday × period × class grid (thin wrapper that delegates to neisGrid)
          function renderTimetableGrid(rows, title, opts={}){
            try{
              // The "방문요일만 보기" UI was removed; default to false unless explicitly provided in opts
              const visitOnly = (opts && opts.showOnlyVisitWeekday !== undefined) ? opts.showOnlyVisitWeekday : false;
              const visitDateVal = opts.visitDate || (document.getElementById('visitDate')||{}).value || null;
              const visitHour = (document.getElementById('visitStartHour')||{}).value || '';
              const visitMinute = (document.getElementById('visitStartMinute')||{}).value || '';
              const visitTimeVal = (visitHour!=='' && visitMinute!=='') ? pad2(visitHour) + ':' + pad2(visitMinute) : (opts.visitTime || null);
              const moduleOpts = { showOnlyVisitWeekday: visitOnly, visitDate: visitDateVal, visitTime: visitTimeVal, periodTimes: opts.periodTimes };
              if (window.neisGrid && typeof window.neisGrid.renderGridTo === 'function'){
                window.neisGrid.renderGridTo('timetableContainer', rows, title, moduleOpts);
              } else {
                // fallback to previous row-table rendering
                renderTimetableRows(rows, title);
              }
            } catch(e){ console.warn('renderTimetableGrid error', e); renderTimetableRows(rows, title); }
          }

          // button: fetch selected school's timetable
          const btnSingle = document.getElementById('btnFetchSelectedTimetable');
          if (btnSingle) btnSingle.addEventListener('click', async ()=>{
            const year = document.getElementById('neisYear').value || '2025';
            const sem = document.getElementById('neisSemester').value || '2';
            const sd = document.getElementById('selectedSchoolInput').value || '';
            const atpt = resolveAtptCodeForRegion(selectedRegion) || '';
            const container = document.getElementById('timetableContainer');
            if (!sd){
              // render inline error instead of alert to avoid modal interruptions
              if (container) container.innerHTML = '<div style="color:#b00;padding:8px;border-radius:.5rem;background:#fff6f6;border:1px solid #f5d6d6;">먼저 학교를 선택하세요.</div>';
              return;
            }
            if (!atpt){
              // ask user but render fallback if they cancel
              if (!confirm('선택된 지역의 교육청 코드가 매핑되지 않았습니다. 계속 진행하시겠습니까?')) {
                if (container) container.innerHTML = '<div style="color:#666;padding:8px;">교육청 코드가 매핑되지 않아 시간표 조회를 취소했습니다.</div>';
                return;
              }
            }
            if (container) {
              container.innerHTML = '<div style="color:#175;padding:8px;">시간표를 불러오는 중입니다... (잠시만 기다려주세요)</div>';
            }
            // decide kind by meta.level if possible
            let meta = staffData.find(d=>d.region===selectedRegion && d.school===sd && normalizeStaff(d.staff)===normalizeStaff(staffParam)) || null;
            if (!meta) {
              console.warn('NEIS_META_FALLBACK: staff-specific meta missing for', { staffParam, selectedRegion, sd });
              meta = staffData.find(d=>d.region===selectedRegion && d.school===sd) || null;
              if (meta) console.log('NEIS_META_FALLBACK used', meta);
            }
            meta = meta || {};
            const kind = (meta.level && meta.level.indexOf('고등')>-1) ? 'high' : 'middle';
            let res = null;
            try{
              res = await fetchNeisTimetable(kind, atpt || '', sd, year, sem);
            } catch(e){
              console.warn('fetchNeisTimetable threw', e);
              if (container) container.innerHTML = '<div style="color:#b00;padding:8px;">시간표를 가져오는 중 오류가 발생했습니다: ' + (e && e.message ? e.message : String(e)) + '</div>';
              return;
            }
            if (!res || !res.ok){
              console.warn('NEIS fetch failed or returned no data', res);
              if (container) {
                container.innerHTML = '<div style="color:#666;padding:8px;">해당 학교의 시간표 데이터가 없습니다. 직접 확인하려면 "선택 학교 시간표 보기" 버튼을 다시 눌러 재시도하세요.</div>';
                // provide a Retry button for convenience
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.textContent = '다시 시도';
                retry.className = 'meeting-btn';
                retry.style.marginTop = '8px';
                retry.addEventListener('click', ()=> btnSingle.click());
                container.appendChild(retry);
              }
              return;
            }
            // If a visit date is selected on the form, show only that weekday's timetable.
            const visitDateVal = (document.getElementById('visitDate')||{}).value || null;
            const vh = (document.getElementById('visitStartHour')||{}).value || '';
            const vm = (document.getElementById('visitStartMinute')||{}).value || '';
            const visitTimeVal = (vh!=='' && vm!=='') ? pad2(vh) + ':' + pad2(vm) : null;
            const visitOnly = !!visitDateVal; // true when a visit date was entered on the page
            renderTimetableGrid(res.rows, `${selectedRegion} - ${sd} (${year} ${sem}학기)`, { showOnlyVisitWeekday: visitOnly, visitDate: visitDateVal, visitTime: visitTimeVal });
            // show the Close Timetable button if present and wire it to clear the timetable area
            try {
              const closeBtn = document.getElementById('btnCloseTimetable');
              if (closeBtn) {
                closeBtn.style.display = 'inline-block';
                closeBtn.onclick = function() {
                  try { document.getElementById('timetableContainer').innerHTML = ''; } catch(e){}
                  try { this.style.display = 'none'; } catch(e){}
                };
              }
            } catch(e){ console.warn('failed to show/hook close timetable button', e); }
          });

          // Note: region-wide fetch UI removed. If you need bulk fetching later, reintroduce a controlled UI and
          // a server-side proxy to avoid client-side API key exposure.
          // --- duration buttons and time calculation ---
          // create duration buttons 10,20,...,90
          const durationContainer = document.getElementById('durationButtons');
          const durationValues = [10,20,30,40,50,60,70,80,90];
          durationValues.forEach(v => {
            const db = document.createElement('button');
            db.type = 'button';
            db.className = 'grid-button';
            db.dataset.minutes = String(v);
            db.textContent = v + '분';
            db.title = v + '분';
            durationContainer.appendChild(db);
          });

          // support both old input (#visitStart) and new selects (#visitStartHour/#visitStartMinute)
          const visitStartInput = document.getElementById('visitStart');
          const visitStartHour = document.getElementById('visitStartHour');
          const visitStartMinute = document.getElementById('visitStartMinute');
          const visitEndInput = document.getElementById('visitEnd');
          const visitDurationInput = document.getElementById('visitDuration');
          const selectedDurationInput = document.getElementById('selectedDurationInput');
          const clearDurationBtn = document.getElementById('clearDuration');

          // clear inline errors when user edits relevant fields
          try {
            if (visitStartInput) visitStartInput.addEventListener('input', ()=> clearFieldError(visitStartInput));
            if (visitStartHour) visitStartHour.addEventListener('change', ()=> clearFieldError(visitStartHour));
            if (visitStartMinute) visitStartMinute.addEventListener('change', ()=> clearFieldError(visitStartMinute));
            if (visitEndInput) visitEndInput.addEventListener('input', ()=> clearFieldError(visitEndInput));
            if (visitDurationInput) visitDurationInput.addEventListener('input', ()=> clearFieldError(visitEndInput));
          } catch(e) { /* ignore */ }

          function pad2(n){ return (n<10? '0' : '') + n; }
          function computeEndFromStartAndMinutes(startValue, minutes){
            if (!startValue) return '';
            // startValue is 'HH:MM'
            const parts = startValue.split(':');
            if (parts.length < 2) return '';
            let hh = parseInt(parts[0],10);
            let mm = parseInt(parts[1],10);
            if (isNaN(hh) || isNaN(mm)) return '';
            const total = hh*60 + mm + Number(minutes);
            const endHH = Math.floor((total % (24*60)) / 60);
            const endMM = total % 60;
            return pad2(endHH) + ':' + pad2(endMM);
          }

          // reset time-related fields (start selects, duration buttons/inputs, end input)
          function resetTimeFields() {
            try {
              const vsh = document.getElementById('visitStartHour');
              const vsm = document.getElementById('visitStartMinute');
              const vdur = document.getElementById('visitDuration');
              const sdur = document.getElementById('selectedDurationInput');
              const durContainer = document.getElementById('durationButtons');
              const vend = document.getElementById('visitEnd');
              if (vsh) vsh.value = pad2(8);
              if (vsm) vsm.value = pad2(0);
              if (vdur) vdur.value = '';
              if (sdur) sdur.value = '';
              if (durContainer) durContainer.querySelectorAll('.grid-button').forEach(b=>b.classList.remove('selected'));
              if (vend) vend.value = '';
            } catch(e) { console.warn('resetTimeFields error', e); }
          }
          // initialize time fields on page load
          try { resetTimeFields(); } catch(e){}

          // populate hour/minute selects (00-23, 00-59) and set default to current time
          if (visitStartHour && visitStartMinute) {
            // clear any existing options
            visitStartHour.innerHTML = '';
            visitStartMinute.innerHTML = '';
            // start hours at 08시 (skip early-morning hours)
            for (let h = 8; h < 24; h++){
              const o = document.createElement('option'); o.value = pad2(h); o.textContent = pad2(h) + '시'; visitStartHour.appendChild(o);
            }
            for (let m = 0; m < 60; m += 5){
              const o = document.createElement('option'); o.value = pad2(m); o.textContent = pad2(m) + '분'; visitStartMinute.appendChild(o);
            }
            const now = new Date();
            // default hour set to 08 on landing
            visitStartHour.value = pad2(8);
            // round minutes to nearest 5-minute interval and clamp (e.g., 58 -> 55)
            let roundedMin = Math.round(now.getMinutes() / 5) * 5;
            if (roundedMin >= 60) roundedMin = 55;
            visitStartMinute.value = pad2(roundedMin);
          }

          // click handler for duration buttons
          durationContainer.addEventListener('click', (ev) => {
            const b = ev.target.closest('.grid-button');
            if (!b) return;
            const minutes = Number(b.dataset.minutes || 0);
            // style selected
            durationContainer.querySelectorAll('.grid-button').forEach(x => x.classList.remove('selected'));
            b.classList.add('selected');
            // set numeric input and hidden
            visitDurationInput.value = minutes;
            selectedDurationInput.value = minutes;
            // compute end time if start present (support old input or new selects)
            const startVal = visitStartInput ? visitStartInput.value : (visitStartHour && visitStartMinute ? (visitStartHour.value + ':' + visitStartMinute.value) : '');
            const endVal = computeEndFromStartAndMinutes(startVal, minutes);
            if (endVal) visitEndInput.value = endVal;
          });

          // when start time changes, recompute end if duration exists
          const onStartChange = () => {
            const minutes = Number(selectedDurationInput.value || visitDurationInput.value || 0);
            if (minutes > 0) {
              const startVal = visitStartInput ? visitStartInput.value : (visitStartHour && visitStartMinute ? (visitStartHour.value + ':' + visitStartMinute.value) : '');
              const endVal = computeEndFromStartAndMinutes(startVal, minutes);
              if (endVal) visitEndInput.value = endVal;
            }
          };
          if (visitStartInput) visitStartInput.addEventListener('change', onStartChange);
          if (visitStartHour) visitStartHour.addEventListener('change', onStartChange);
          if (visitStartMinute) visitStartMinute.addEventListener('change', onStartChange);

          // allow manual numeric input of duration (keeps buttons unselected)
          visitDurationInput.addEventListener('input', () => {
            const v = Number(visitDurationInput.value || 0);
            selectedDurationInput.value = v > 0 ? v : '';
            // clear selected button states if not equal to a button value
            durationContainer.querySelectorAll('.grid-button').forEach(x => x.classList.toggle('selected', Number(x.dataset.minutes) === v));
            if (v > 0) {
              const startVal = visitStartInput ? visitStartInput.value : (visitStartHour && visitStartMinute ? (visitStartHour.value + ':' + visitStartMinute.value) : '');
              const endVal = computeEndFromStartAndMinutes(startVal, v);
              if (endVal) visitEndInput.value = endVal;
            }
          });

          clearDurationBtn.addEventListener('click', () => {
            visitDurationInput.value = '';
            selectedDurationInput.value = '';
            visitEndInput.value = '';
            durationContainer.querySelectorAll('.grid-button').forEach(x => x.classList.remove('selected'));
          });
          
          // contact formatting helper: turn '12345678' -> '010-1234-5678'
          function formatContact(suffix) {
            const digits = (suffix || '').toString().replace(/\D+/g,'').slice(0,8);
            if (!digits) return '';
            if (digits.length <=4) return '010-' + digits;
            return '010-' + digits.slice(0,4) + '-' + digits.slice(4);
          }

          // when contact inputs change, update formatted span
          document.getElementById('subjectsBlock').addEventListener('input', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('contact-suffix')){
              const cleaned = (e.target.value||'').replace(/\D+/g,'').slice(0,8);
              if (cleaned !== e.target.value) e.target.value = cleaned;
              const parent = e.target.closest('.subject-block') || e.target.parentNode;
              const fmt = parent.querySelector('.contact-formatted');
              if (fmt) fmt.textContent = formatContact(cleaned);
            }
          });

          // copy-to-clipboard for contact buttons
          document.getElementById('subjectsBlock').addEventListener('click', function(e){
            if (e.target && e.target.classList && e.target.classList.contains('copy-contact')){
              const sb = e.target.closest('.subject-block');
              if (!sb) return;
              const suffix = sb.querySelector('.contact-suffix') ? sb.querySelector('.contact-suffix').value : '';
              const formatted = formatContact(suffix);
              if (!formatted) { alert('연락처가 입력되어 있지 않습니다.'); return; }
              navigator.clipboard && navigator.clipboard.writeText(formatted);
              // small feedback
              e.target.textContent = '복사됨';
              setTimeout(()=> e.target.textContent = '복사', 1200);
            }
          });
          // subject choice buttons: set hidden .subject-name value and toggle selected style
          document.getElementById('subjectsBlock').addEventListener('click', function(e){
            const btn = e.target.closest('.subject-choice');
            if (!btn) return;
            const sb = btn.closest('.subject-block');
            if (!sb) return;
            // set hidden input value
            const hidden = sb.querySelector('.subject-name');
            if (hidden) hidden.value = btn.dataset.subject || '';
            // toggle selected styling among siblings
            const parent = sb.querySelector('.subjects');
            if (parent) parent.querySelectorAll('.subject-choice').forEach(x => x.classList.remove('selected'));
            btn.classList.add('selected');
            // update buttons that depend on selected subject (정보 -> info-extra, 진로 -> camp button)
            setTimeout(() => { try{ updateInfoButtons(); updateSpecialMeetingButtons(); }catch(e){console.warn('update buttons failed',e);} }, 0);
          });
          // number subject blocks on initial load
          if (typeof renumberSubjectBlocks === 'function') renumberSubjectBlocks();
        });
    });
    // 과목/선생님 추가 기능
    document.getElementById('addSubjectBtn').addEventListener('click', function() {
      const block = document.createElement('div');
      block.className = 'subject-block';
      block.innerHTML = `
        <input type="hidden" class="subject-name" required>
        <div class="subjects" style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:8px;">
          <button type="button" class="grid-button subject-choice" data-subject="정보">정보</button>
          <button type="button" class="grid-button subject-choice" data-subject="진로">진로</button>
          <button type="button" class="grid-button subject-choice" data-subject="보건">보건</button>
          <button type="button" class="grid-button subject-choice" data-subject="미술">미술</button>
      <button type="button" class="grid-button subject-choice" data-subject="체육">체육</button>
        <button type="button" class="grid-button subject-choice" data-subject="도서관사서">도서관사서</button>
          <button type="button" class="grid-button subject-choice" data-subject="특성화">특성화</button>
          <button type="button" class="grid-button subject-choice" data-subject="기타">기타</button>
        </div>
        <input type="text" class="teacher-name" placeholder="선생님 이름" required>
        <select class="publisher">
          <option value="">출판사 선택</option>
          <option>씨마스</option><option>천재</option><option>비상</option><option>미래엔</option><option>동아</option><option>지학사</option><option>금성</option><option>창비</option><option>해냄</option><option>능률</option><option>삼양</option><option>이오북스</option><option>YBM</option><option>길벗</option><option>미진사</option><option>다락원</option><option>타임</option><option>채움</option>
        </select>
        <div style="margin-top:0.6rem;">
          <label style="font-weight:700;display:block;margin-bottom:6px;">후속조치</label>
          <select class="followUpSelect" style="width:100%;padding:.6rem;border-radius:.6rem;border:1px solid #d6dbe8;background:#fff;">
            <option value="">선택하세요</option>
            <option>채팅방 지속 관리</option>
            <option>추가 자료 발송 예정</option>
            <option>재방문 예정</option>
            <option>선정 시기 연락 대기</option>
            <option>워크북 무상지원 제안</option>
            <option>완료 (추가 조치 없음)</option>
          </select>
        </div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">
          <label style="font-weight:700;min-width:38px;">연락처</label>
          <div style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem;">
            <span style="display:inline-block;padding:.55rem .7rem;border-radius:.6rem;background:#f2f4ff;border:1px solid #d6dbe8;color:#12325a;font-weight:700;">010</span>
            <input type="text" class="contact-suffix" placeholder="12345678" maxlength="8" inputmode="numeric" pattern="[0-9]*" style="width:120px;padding:.55rem .6rem;border-radius:.6rem;border:1px solid #d6dbe8;">
            <span class="contact-formatted" style="margin-left:8px;color:#103254;font-weight:700;"></span>
            <button type="button" class="copy-contact" style="margin-left:6px;padding:.4rem .6rem;border-radius:.5rem;border:1px solid #d6dbe8;background:#fff;cursor:pointer;">복사</button>
          </div>
        </div>
        <div style="margin-top:16px;"></div>
        <div class="meeting-buttons" id="main-meeting-buttons">
          <button class="meeting-btn" type="button">명함인사</button>
          <button class="meeting-btn" type="button">티칭샘소개</button>
          <button class="meeting-btn" type="button">채팅방소개</button>
          <button class="meeting-btn" type="button">미팅불가</button>
        </div>
        <div class="meeting-buttons" id="info-extra-buttons" style="display:none;">
          <button class="meeting-btn" type="button">구글클래스룸 사용</button>
          <button class="meeting-btn" type="button">패들렛 사용</button>
          <button class="meeting-btn" type="button">하이러닝 사용</button>
        </div>
  <textarea class="conversation-detail" rows="2" placeholder="특이사항"></textarea>
  <button type="button" class="removeSubjectBtn" style="margin:0.5rem 0 1rem 0;padding:0.5rem 1rem;font-size:1rem;border-radius:0.7rem;background:#ff9800;color:#fff;border:none;cursor:pointer;">삭제</button>
      `;
      block.querySelector('.removeSubjectBtn').onclick = function() {
        block.remove();
        // renumber after removal
        if (typeof renumberSubjectBlocks === 'function') renumberSubjectBlocks();
      };
      document.getElementById('subjectsBlock').appendChild(block);
      // renumber after adding
      if (typeof renumberSubjectBlocks === 'function') renumberSubjectBlocks();
    });
    // sanitize contact input: only digits, max 8
    document.getElementById('subjectsBlock').addEventListener('input', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('contact-suffix')) {
        // remove non-digits and limit to 8
        const cleaned = (e.target.value || '').replace(/\D+/g, '').slice(0,8);
        if (cleaned !== e.target.value) e.target.value = cleaned;
      }
    });
    // 정보 과목 선택 시 추가 버튼 표시 (동적 subject-block에도 적용)
        function updateInfoButtons() {
            const selects = document.querySelectorAll('.subject-name');
            let show = false;
            selects.forEach(sel => {
                if (sel.value === '정보') show = true;
            });
            document.getElementById('info-extra-buttons').style.display = show ? 'flex' : 'none';
        }
        document.addEventListener('DOMContentLoaded', function() {
            document.getElementById('subjectsBlock').addEventListener('change', function(e) {
                if (e.target.classList.contains('subject-name')) {
                    updateInfoButtons();
                }
            });
            // 과목/선생님 추가 시에도 이벤트 적용
            document.getElementById('addSubjectBtn').addEventListener('click', function() {
                setTimeout(updateInfoButtons, 100);
            });
        });
          // Special meeting buttons: ensure 단행본안내 exists and 캠프안내 shows only for '진로'
          function updateSpecialMeetingButtons(){
            try{
              // decide whether any subject '진로' exists
              const hasJinro = Array.from(document.querySelectorAll('.subject-name')).some(s => (s.value||'').trim() === '진로');
              // ensure every .meeting-buttons container has 단행본안내 and a 캠프안내 (hidden by default)
              document.querySelectorAll('.meeting-buttons').forEach(container => {
                if (!container) return;
                // 단행본안내 button (add if absent)
                if (!container.querySelector('.book-btn')){
                  const b = document.createElement('button'); b.type='button'; b.className='meeting-btn book-btn'; b.textContent='단행본안내';
                  // insert after 채팅방소개 if present, otherwise append
                  const chat = Array.from(container.querySelectorAll('.meeting-btn')).find(x=>x.textContent.trim()==='채팅방소개');
                  if (chat && chat.parentNode === container) chat.insertAdjacentElement('afterend', b);
                  else container.appendChild(b);
                }
                // 캠프안내 (toggle visibility based on hasJinro)
                let camp = container.querySelector('.camp-btn');
                if (!camp){
                  camp = document.createElement('button'); camp.type='button'; camp.className='meeting-btn camp-btn'; camp.textContent='캠프안내'; camp.style.display='none';
                  container.appendChild(camp);
                }
                camp.style.display = hasJinro ? '' : 'none';
              });
            }catch(e){ console.warn('updateSpecialMeetingButtons failed', e); }
          }
          // ensure special buttons exist on load and when DOM mutates
          document.addEventListener('DOMContentLoaded', function(){ setTimeout(updateSpecialMeetingButtons, 60); const mo = new MutationObserver(()=> setTimeout(updateSpecialMeetingButtons,40)); mo.observe(document.body, { childList:true, subtree:true }); });
    // 영업일지 입력
    // delegated handler: toggle meeting button selection (visual only)
    document.getElementById('subjectsBlock').addEventListener('click', function(e){
      const mb = e.target.closest('.meeting-btn');
      if (!mb) return;
      const block = mb.closest('.subject-block');
      if (!block) return;
      // toggle selected state; multiple selections allowed
      mb.classList.toggle('selected');
      // do NOT write markers into the conversation textarea anymore (UI only)
      // keep visibility logic for info-extra-buttons in case a '정보' subject exists
    });

    // helper: send a visit payload to the backend API (/api/visits)
    // The backend expects { staff: string, visits: Array }.
    function sendToServer(visit) {
      try {
        // derive staff if not present on the visit object
        const staffField = (visit && visit.staff) ? visit.staff : ((document.getElementById('staffName')||{}).value || '');
        const payload = { staff: staffField, visits: Array.isArray(visit) ? visit : [visit] };
        // non-blocking POST; attach server id to local visit when available
        fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(resp => {
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          return resp.json();
        }).then(data => {
          try { console.log('Server saved visit:', data); } catch(e){}
          if (data && data.id) {
            // store returned id for reference on the first visit in the payload
            try {
              const target = Array.isArray(visit) ? visit[0] : visit;
              if (target) target.server_id = data.id;
            } catch(_){}
          }
        }).catch(err => {
          try { console.warn('Failed to send visit to server:', err); } catch(e){}
          // don't block user; optionally notify them
        });
      } catch(e) { try{console.warn('sendToServer error', e);}catch(_){} }
    }

    document.getElementById('salesForm').addEventListener('submit', function(e) {
      e.preventDefault();
      // 방문일 필수 (최종 검사)
      const vd = document.getElementById('visitDate');
      if (!vd || !vd.value) { alert('방문일을 입력하세요.'); vd && vd.focus(); return; }
      // Build a visit object from current form and add to dayVisits
      const visitObj = buildCurrentVisitObject();
      // must have school
      if (!visitObj.school) { alert('학교를 선택한 뒤 저장하세요.'); return; }
      // 방문 시작/종료 시간 필수 (인라인 에러 표시)
      clearFieldError(document.getElementById('visitStart'));
      clearFieldError(document.getElementById('visitEnd'));
      if (!visitObj.visitStart || !visitObj.visitEnd) {
        if (!visitObj.visitStart) {
          const vsEl = document.getElementById('visitStart') || document.getElementById('visitStartHour') || document.getElementById('visitStartMinute');
          if (vsEl) showFieldError(vsEl, '방문 시작 시간을 입력하세요.');
        }
        if (!visitObj.visitEnd) {
          const ve = document.getElementById('visitEnd');
          if (ve) {
            showFieldError(ve, '방문 종료 시간을 입력하세요.');
            ve.focus();
            ve.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
        return;
      }
  const ta = document.getElementById('generatedSummary');
  const defaultHint = '요약이 여기에 생성됩니다.';
  // debug logging
  try { console.log('submit: visitObj=', visitObj); console.log('submit: dayVisits length before=', dayVisits.length); } catch(e){}
      if (editingVisitIndex >= 0) {
        // update existing visit
        dayVisits[editingVisitIndex] = visitObj;
        resetEditState();
        renderVisitsList();
        // rebuild the textarea from all visits so the accumulated text stays consistent
        if (ta) {
          const rebuilt = dayVisits.map((v,i) => formatVisitText(v,i)).join('\n');
          writeGeneratedSummary(rebuilt, { replace: true });
        }
        alert('방문 내용이 수정되어 저장되었습니다.');
        // send updated visit to server (best-effort)
        try { sendToServer(visitObj); } catch(e){}
      } else {
        dayVisits.push(visitObj);
        renderVisitsList();
        // append this visit's formatted text to the generatedSummary textarea
        if (ta) {
          // debug log
          try { console.log('submit: textarea current value length=', (ta.value||'').length); } catch(e){}
          // prepare formatted text and append via robust writer
          const formatted = formatVisitText(visitObj, dayVisits.length - 1);
          try { console.log('submit: formatted text=', formatted); } catch(e){}
          // if default hint present, replace; otherwise append
          if ((ta.value||'').trim() === defaultHint) writeGeneratedSummary(formatted, { replace: true });
          else writeGeneratedSummary(formatted, { replace: false });
        } else {
          try { console.warn('submit: generatedSummary textarea not found'); } catch(e){}
        }
        // prepare the form for the next visit while keeping the date
        resetFormForNextVisit();
        alert('현재 방문이 저장되었습니다. 다음 방문을 입력하세요.');
        // send created visit to server (best-effort)
        try { sendToServer(visitObj); } catch(e){}
      }
    });
    // add a small numeric badge to each subject-block so user can distinguish blocks
    function renumberSubjectBlocks(){
      const blocks = Array.from(document.querySelectorAll('.subject-block'));
      blocks.forEach((b,idx) => {
        let badge = b.querySelector('.subject-index');
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'subject-index';
          b.insertBefore(badge, b.firstChild);
        }
        badge.textContent = String(idx+1);
      });
    }
    // 뒤로 버튼: Step2 → Step1로 복귀
    const backBtnEl = document.getElementById('backBtn');
    if (backBtnEl) {
      backBtnEl.addEventListener('click', function(){
        const s2 = document.getElementById('step2'); if (s2) s2.style.display = 'none';
        const s1 = document.getElementById('step1'); if (s1) s1.style.display = 'block';
        // restore focus to Next button for quick navigation
        const next = document.getElementById('nextStepBtn'); if (next) next.focus();
      });
    }

    // Generate a human-friendly summary from current form state
    function generateSummary(){
      const date = document.getElementById('visitDate') ? document.getElementById('visitDate').value : '';
      const staff = document.getElementById('staffInfo') ? document.getElementById('staffInfo').textContent.replace('담당자: ','') : '';
      const region = document.getElementById('displayRegion') ? document.getElementById('displayRegion').textContent : '';
      const school = document.getElementById('displaySchool') ? document.getElementById('displaySchool').textContent : '';
      const start = (document.getElementById('visitStartHour') && document.getElementById('visitStartMinute')) ? (document.getElementById('visitStartHour').value + ':' + document.getElementById('visitStartMinute').value) : '';
      const end = document.getElementById('visitEnd') ? document.getElementById('visitEnd').value : '';
      const blocks = Array.from(document.querySelectorAll('.subject-block'));
      let out = '';
      out += (date ? `□ 일시: ${date}\n\n` : '');
      out += (staff ? `담당자: ${staff}\n` : '');
      if (region || school) out += `대상: ${region} / ${school}\n`;
      if (start || end) out += `방문: ${start} ~ ${end} (${start && end ? calcMinutesInterval(start,end) + '분' : ''})\n\n`;
      out += '세부업무:\n\n';
      blocks.forEach((b, idx) => {
        const subj = b.querySelector('.subject-name') ? b.querySelector('.subject-name').value : '';
        const teacher = b.querySelector('.teacher-name') ? b.querySelector('.teacher-name').value : '';
        const pub = b.querySelector('.publisher') ? b.querySelector('.publisher').value : '';
        const meetings = Array.from(b.querySelectorAll('.meeting-btn.selected')).map(x => x.textContent.trim());
        const follow = b.querySelector('.followUpSelect') ? b.querySelector('.followUpSelect').value : '';
        const contact = b.querySelector('.contact-suffix') ? b.querySelector('.contact-suffix').value : '';
        const notes = b.querySelector('.conversation-detail') ? b.querySelector('.conversation-detail').value : '';
        out += `${idx+1}. ${subj} (${teacher}${pub? ' / '+pub : ''})\n`;
        if (meetings.length) out += `- 진행: ${meetings.join(', ')}\n`;
  // contact is intentionally omitted from the on-page summary; it's kept for backend only
        if (follow) out += `- 후속조치: ${follow}\n`;
        if (notes) out += `- 특이사항: ${notes}\n`;
        out += '\n';
      });
      // summary stats
      const totalSchools = document.querySelectorAll('#schoolButtons .grid-button.selected').length ? 1 : 0; // simple heuristic
      out += `※ 특이사항 ※\n- 방문학교 : ${totalSchools} 개교\n`;
      // set into textarea
      const ta = document.getElementById('generatedSummary'); if (ta) ta.value = out;
    }
    function calcMinutesInterval(start, end){
      if (!start || !end) return '';
      const [sh, sm] = start.split(':').map(n=>parseInt(n,10));
      const [eh, em] = end.split(':').map(n=>parseInt(n,10));
      const s = sh*60 + sm; const e = eh*60 + em; let diff = e - s; if (diff < 0) diff += 24*60; return diff;
    }
  document.getElementById('genSummaryBtn')?.addEventListener('click', generateSummary);

  // Allow user to manually edit the generated summary and prevent overwrites.
  document.addEventListener('DOMContentLoaded', function(){
    const ta = document.getElementById('generatedSummary');
    const editBtn = document.getElementById('summaryEditToggleBtn');
    const regenBtn = document.getElementById('summaryRegenerateBtn');
    if (ta) {
      ta.addEventListener('input', function(){
        // ignore programmatic input events triggered by writeGeneratedSummary
        if (_suppressSummaryInputHandler) return;
        // only consider manual edits when the textarea is editable
        if (!ta.hasAttribute('readonly')) {
          manualSummaryEdited = true;
          if (editBtn) editBtn.textContent = '수정 완료';
        }
      });
    }
    // ensure the edit button shows the default '수정' label on initial load
    if (editBtn) editBtn.textContent = '수정';
    if (editBtn) {
      editBtn.addEventListener('click', function(){
        if (!ta) return;
        if (ta.hasAttribute('readonly')) {
          // enter edit mode: allow editing of summary, teacher name and conversation fields
          ta.removeAttribute('readonly');
          ta.focus();
          document.querySelectorAll('.teacher-name, .conversation-detail').forEach(el=>{
            try{ el.removeAttribute('readonly'); el.removeAttribute('disabled'); }catch(e){}
          });
          editBtn.textContent = '수정 완료';
        } else {
          // exit edit mode: lock summary and teacher/conversation fields again
          ta.setAttribute('readonly','');
          document.querySelectorAll('.teacher-name, .conversation-detail').forEach(el=>{
            try{ el.setAttribute('readonly',''); }catch(e){}
          });
          // keep manualSummaryEdited true if the user changed anything
          editBtn.textContent = '수정';
        }
      });
    }
    if (regenBtn) {
      regenBtn.addEventListener('click', async function(){
        try{
          const ok = await showConfirmModal('양식 내용을 모두 지우시겠습니까?');
          if (!ok) return;
        }catch(e){}
        // clear the entire form (keep visitDate/staff per resetFormForNextVisit logic)
        try {
          if (typeof resetFormForNextVisit === 'function') resetFormForNextVisit();
        } catch(e){}
        manualSummaryEdited = false;
        try { if (typeof writeGeneratedSummary === 'function') writeGeneratedSummary('', { replace: true }); } catch(e){}
        try { if (typeof clearAutosaveForToday === 'function') clearAutosaveForToday(); } catch(e){}
        // ensure textarea locked and edit button reset
        if (ta) ta.setAttribute('readonly','');
        if (editBtn) editBtn.textContent = '수정';
        try{ showToast('양식이 초기화되었습니다.'); }catch(e){}
      });
    }
    // 임시저장 버튼
    try {
      const tempSaveBtn = document.getElementById('summaryTempSaveBtn');
      if (tempSaveBtn) {
        tempSaveBtn.addEventListener('click', function(){
          try {
            const v = (typeof buildCurrentVisitObject === 'function') ? buildCurrentVisitObject() : null;
            const key = (typeof todayKey === 'function') ? (todayKey() + '_draft') : ('draft_' + String(new Date().toISOString()).slice(0,10));
            localStorage.setItem(key, JSON.stringify({ visit: v, ts: Date.now() }));
            try { persistGeneratedSummary(); } catch(e){}
            try { persistDayVisits(); } catch(e){}
            try{ showToast('임시저장되었습니다.'); }catch(e){}
          } catch(e){ console.warn('temp save failed', e); try{ showToast('임시저장에 실패했습니다.'); }catch(err){} }
        });
      }
    } catch(e){}
  });
    // Ensure canonical subject buttons exist in all subject rows and normalize grid columns to 7.
    (function ensureCanonicalSubjectsAndGrid(){
  const canonical = ['정보','진로','보건','미술','체육','도서관사서','특성화','기타'];
      function ensure() {
        try{
          document.querySelectorAll('.subjects').forEach(s => {
            try{
              const st = s.getAttribute('style') || '';
              if (st.indexOf('repeat(4,1fr)') !== -1) {
                s.setAttribute('style', st.replace('repeat(4,1fr)', 'repeat(7,1fr)'));
              }
              if (st.indexOf('repeat(5,1fr)') !== -1) {
                s.setAttribute('style', st.replace('repeat(5,1fr)', 'repeat(7,1fr)'));
              }
              // ensure buttons in canonical order; add missing ones
              canonical.forEach(subject => {
                if (!s.querySelector('[data-subject="'+subject+'"]')){
                  const btn = document.createElement('button');
                  btn.type = 'button'; btn.className = 'grid-button subject-choice'; btn.dataset.subject = subject; btn.textContent = subject;
                  // insert before '기타' when adding earlier items to preserve order
                  if (subject !== '기타'){
                    const gita = s.querySelector('[data-subject="기타"]');
                    if (gita) s.insertBefore(btn, gita);
                    else s.appendChild(btn);
                  } else {
                    s.appendChild(btn);
                  }
                }
              });
            }catch(e){}
          });
        }catch(e){console.warn('ensureCanonicalSubjectsAndGrid failed', e);}    
      }
      // run once on load and observe DOM changes to keep it consistent
      setTimeout(ensure, 80);
      const mo = new MutationObserver(() => { setTimeout(ensure, 40); });
      mo.observe(document.body, { childList: true, subtree: true });
})();
  
