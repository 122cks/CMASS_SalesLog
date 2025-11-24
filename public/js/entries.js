// entries.js — manage up to 6 per-school meeting entries with edit / 완료 flow
(function(){
  const MAX = 1;
  let entries = new Array(MAX).fill(null);

  function qs(id){ return document.getElementById(id); }
  function make(text, cls){ const d = document.createElement('div'); if(cls) d.className = cls; d.textContent = text; return d; }

  function updateHidden(){ const h = qs('entriesJson'); if(h) h.value = JSON.stringify(entries); window.currentEntries = entries; }

  function renderSlots(){
    const wrap = qs('entriesSlots');
    if (!wrap){
      // container isn't present on this page (meeting.html removed entries area). Skip rendering.
      return;
    }
    wrap.innerHTML = '';
    for(let i=0;i<MAX;i++){
      const card = document.createElement('div'); card.style.border = '1px solid #e6eef8'; card.style.padding = '8px'; card.style.borderRadius='8px'; card.style.minWidth='180px'; card.style.flex='0 0 180px';
  const title = document.createElement('div'); title.style.fontWeight='800'; title.style.marginBottom='6px';
  const label = (MAX === 1) ? '미팅내용' : `미팅내용 ${i+1}`;
  title.textContent = label;
      card.appendChild(title);

      const body = document.createElement('div'); body.style.minHeight = '40px';
      if (!entries[i]){
        body.appendChild(make('아직 입력되지 않음','muted'));
        const btn = document.createElement('button'); btn.type='button'; btn.textContent='입력하기'; btn.style.marginTop='8px';
        btn.addEventListener('click', ()=> openEditor(i));
        card.appendChild(body); card.appendChild(btn);
      } else {
        const e = entries[i];
        const summary = document.createElement('div'); summary.style.fontSize='13px'; summary.style.marginBottom='6px';
        summary.textContent = (e.teacher || '(이름없음)') + (e.publisher ? ' — '+e.publisher : '');
        body.appendChild(summary);
        // show subjects/activities summary if any
        if (e.subjects && e.subjects.length){
          const s = document.createElement('div'); s.style.fontSize='12px'; s.style.color='#345'; s.textContent = '과목: ' + e.subjects.join(', '); body.appendChild(s);
        }
        if (e.activities && e.activities.length){
          const a = document.createElement('div'); a.style.fontSize='12px'; a.style.color='#345'; a.textContent = '활동: ' + e.activities.join(', '); body.appendChild(a);
        }
        card.appendChild(body);
        const btnEdit = document.createElement('button'); btnEdit.type='button'; btnEdit.textContent='수정'; btnEdit.style.marginRight='6px';
        btnEdit.addEventListener('click', ()=> openEditor(i));
        const btnDel = document.createElement('button'); btnDel.type='button'; btnDel.textContent='삭제'; btnDel.addEventListener('click', ()=>{ if(confirm('정말 삭제하시겠습니까?')){ entries[i]=null; updateHidden(); renderSlots(); }});
        card.appendChild(btnEdit); card.appendChild(btnDel);
      }
      wrap.appendChild(card);
    }
  }

  function cloneTemplate(){
    const tpl = document.getElementById('sessionTemplate'); if(!tpl) return null;
    const clone = tpl.content.cloneNode(true);
    // wire up toggle behavior for buttons inside clone
    const toggleBtns = (root, selector, activeClass='active')=>{
      const buttons = Array.from(root.querySelectorAll(selector));
      buttons.forEach(b => b.addEventListener('click', ()=>{ b.classList.toggle(activeClass); }));
    };
    toggleBtns(clone, '.subject-btn'); toggleBtns(clone, '.session-subjects .subject-btn'); // in case template uses same classes
    toggleBtns(clone, '.session-activities .subject-btn'); toggleBtns(clone, '.session-favor .favor-btn');
    return clone;
  }

  let currentEditing = null; // index

  function openEditor(idx){
    const wrap = qs('entryEditorWrap'); if(!wrap) return; wrap.innerHTML=''; wrap.style.display='block';
    const node = cloneTemplate(); if(!node) return;
    // append to wrap
    const container = document.createElement('div'); container.appendChild(node); wrap.appendChild(container);

    // map fields
    const sel = container;
    const subjectsBtns = sel.querySelectorAll('.session-subjects .subject-btn, .subject-subject-btn');
    const activitiesBtns = sel.querySelectorAll('.session-activities .subject-btn, .session-activity-btn');
    const favorBtns = sel.querySelectorAll('.session-favor .favor-btn');
    const teacherInp = sel.querySelector('.session-teacher');
    const publisherInp = sel.querySelector('.session-publisher');
    const phoneInp = sel.querySelector('.session-phone');
    const emailInp = sel.querySelector('.session-email');
    const requestsInp = sel.querySelector('.session-requests');
    const notesInp = sel.querySelector('.session-notes');
    const deliveriesInp = sel.querySelector('.session-deliveries');
    const followInp = sel.querySelector('.session-followup');

    // fill if existing
    if (entries[idx]){
      const e = entries[idx];
      teacherInp.value = e.teacher || '';
      publisherInp.value = e.publisher || '';
      phoneInp.value = e.phone || '';
      emailInp.value = e.email || '';
      requestsInp.value = e.requests || '';
      notesInp.value = e.notes || '';
      deliveriesInp.value = e.deliveries || '';
      followInp.value = e.followUp || '';
      // activate subject/activity/favor
      Array.from(subjectsBtns).forEach(b => { if (e.subjects && e.subjects.includes(b.textContent)) b.classList.add('active'); });
      Array.from(activitiesBtns).forEach(b => { if (e.activities && e.activities.includes(b.textContent)) b.classList.add('active'); });
      Array.from(favorBtns).forEach(b => { if (e.favor && b.textContent === e.favor) b.classList.add('active'); });
    }

    // action buttons
    const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='8px'; actions.style.marginTop='8px';
    const btnSave = document.createElement('button'); btnSave.type='button'; btnSave.textContent='입력완료'; btnSave.style.background='#1e3c72'; btnSave.style.color='#fff'; btnSave.style.border='none'; btnSave.style.padding='8px 12px'; btnSave.style.borderRadius='8px';
    const btnCancel = document.createElement('button'); btnCancel.type='button'; btnCancel.textContent='취소';
    actions.appendChild(btnSave); actions.appendChild(btnCancel); wrap.appendChild(actions);

    btnCancel.addEventListener('click', ()=>{ wrap.innerHTML=''; wrap.style.display='none'; currentEditing = null; });

    btnSave.addEventListener('click', ()=>{
      // collect
      const selectedSubjects = Array.from(subjectsBtns).filter(b=>b.classList.contains('active')).map(b=>b.textContent.trim());
      const selectedActivities = Array.from(activitiesBtns).filter(b=>b.classList.contains('active')).map(b=>b.textContent.trim());
      const fav = Array.from(favorBtns).find(b=>b.classList.contains('active'));
      const obj = {
        teacher: (teacherInp && teacherInp.value) || '',
        publisher: (publisherInp && publisherInp.value) || '',
        phone: (phoneInp && phoneInp.value) || '',
        email: (emailInp && emailInp.value) || '',
        requests: (requestsInp && requestsInp.value) || '',
        notes: (notesInp && notesInp.value) || '',
        deliveries: (deliveriesInp && deliveriesInp.value) || '',
        followUp: (followInp && followInp.value) || '',
        subjects: selectedSubjects,
        activities: selectedActivities,
        favor: fav ? fav.textContent.trim() : ''
      };
      entries[idx] = obj;
      updateHidden(); renderSlots(); wrap.innerHTML=''; wrap.style.display='none'; currentEditing = null;
    });

    currentEditing = idx;
  }

  document.addEventListener('DOMContentLoaded', ()=>{
    // render initial slots
    renderSlots(); updateHidden();
  });

  // expose for debugging
  window._cmass_entries = { get: ()=>entries, set:(arr)=>{ entries = arr; renderSlots(); updateHidden(); } };

})();
// entries.js
// Manage up to 6 meeting entries per school. No drafts or localStorage used.
(function(){
  const MAX_ENTRIES = 1;
  let entries = new Array(MAX_ENTRIES).fill(null);

  function qs(id){ return document.getElementById(id); }
  function createEl(tag, props){ const e = document.createElement(tag); if(props) Object.assign(e, props); return e; }

  function summarize(entry){
    if (!entry) return '';
    const who = entry.teacher || entry.teacherName || '(무명)';
    const pub = entry.publisher || entry.publisher || '';
    const favor = entry.favor || '';
    return `${who}${pub? ' · '+pub : ''}${favor? ' · '+favor : ''}`;
  }

  function renderSlots(){
    const slots = qs('entriesSlots'); if(!slots) return;
    slots.innerHTML = '';
    for(let i=0;i<MAX_ENTRIES;i++){
      const box = createEl('div', { className: 'form-section', style: 'min-width:220px;flex:0 0 31%;padding:8px;box-sizing:border-box' });
  const header = createEl('div', { innerText: (MAX_ENTRIES === 1) ? '미팅내용' : `미팅 ${i+1}` });
      header.style.fontWeight = '800'; header.style.marginBottom = '6px';
      box.appendChild(header);
      const e = entries[i];
      if (!e){
        const addBtn = createEl('button', { type: 'button', innerText: '추가', className: 'subject-btn' });
        addBtn.addEventListener('click', ()=> openEditor(i));
        box.appendChild(addBtn);
      } else {
        const summ = createEl('div', { innerText: summarize(e) });
        summ.style.marginBottom = '8px'; box.appendChild(summ);
        const view = createEl('div', { innerText: e.requests || e.notes || '', className: 'small muted' });
        view.style.marginBottom = '8px'; box.appendChild(view);
        const btnRow = createEl('div', { className: 'btn-row' });
        const edit = createEl('button', { type: 'button', innerText: '수정', className: 'subject-btn' });
        edit.addEventListener('click', ()=> openEditor(i, e));
        const del = createEl('button', { type: 'button', innerText: '삭제', className: 'subject-btn' });
        del.addEventListener('click', ()=> { if(confirm('이 항목을 삭제하시겠습니까?')){ entries[i]=null; renderSlots(); } });
        btnRow.appendChild(edit); btnRow.appendChild(del); box.appendChild(btnRow);
      }
      slots.appendChild(box);
    }
  }

  function copyButtons(srcSelector, destRoot){
    const src = document.querySelector(srcSelector);
    if (!src || !destRoot) return;
    destRoot.innerHTML = src.innerHTML;
    // wire toggle behavior for buttons
    Array.from(destRoot.querySelectorAll('button')).forEach(btn => {
      btn.addEventListener('click', ()=> btn.classList.toggle('active'));
    });
  }

  function openEditor(index, prefill){
    const wrap = qs('entryEditorWrap'); if(!wrap) return;
    wrap.innerHTML = '';
    const template = document.getElementById('sessionTemplate');
    if (!template) return;
    const clone = template.content.cloneNode(true);
    // copy subject/activity buttons from master controls so styling matches
    const subjectsRoot = clone.querySelector('.session-subjects');
    const activitiesRoot = clone.querySelector('.session-activities');
    copyButtons('#subjects', subjectsRoot);
    copyButtons('#activities', activitiesRoot);

    // helpers to find fields inside clone
    function qcls(cls){ return clone.querySelector('.'+cls) || clone.querySelector('[class*="'+cls+'"]'); }

    // append action buttons
    const footer = createEl('div', { style: 'display:flex;gap:8px;margin-top:8px' });
    const done = createEl('button', { type: 'button', innerText: '완료', className: 'subject-btn' });
    const cancel = createEl('button', { type: 'button', innerText: '취소', className: 'subject-btn' });
    footer.appendChild(done); footer.appendChild(cancel);
    clone.querySelector('section').appendChild(footer);

    // mount
    wrap.style.display = ''; wrap.appendChild(clone);

    // now find the mounted nodes (last child)
    const editor = wrap.lastElementChild;
    // wire cancel
    cancel.addEventListener('click', ()=>{ wrap.style.display='none'; wrap.innerHTML=''; });

    // prefill if editing
    if (prefill){
      editor.querySelector('.session-teacher').value = prefill.teacher || prefill.teacherName || '';
      editor.querySelector('.session-publisher').value = prefill.publisher || '';
      editor.querySelector('.session-phone').value = prefill.phone || '';
      editor.querySelector('.session-email').value = prefill.email || '';
      editor.querySelector('.session-requests').value = prefill.requests || '';
      editor.querySelector('.session-notes').value = prefill.notes || '';
      editor.querySelector('.session-deliveries').value = prefill.deliveries || '';
      editor.querySelector('.session-followup').value = prefill.followUp || prefill.followup || '';
      // mark active buttons for subjects/activities/favor
      if (Array.isArray(prefill.subjects)){
        Array.from(editor.querySelectorAll('.session-subjects button')).forEach(b => { if (prefill.subjects.includes(b.innerText)) b.classList.add('active'); });
      }
      if (Array.isArray(prefill.activities)){
        Array.from(editor.querySelectorAll('.session-activities button')).forEach(b => { if (prefill.activities.includes(b.innerText)) b.classList.add('active'); });
      }
      if (prefill.favor){
        Array.from(editor.querySelectorAll('.session-favor button')).forEach(b => { if (b.innerText === prefill.favor) b.classList.add('active'); });
      }
    }

    done.addEventListener('click', ()=>{
      // collect data
      const teacher = editor.querySelector('.session-teacher').value || '';
      const publisher = editor.querySelector('.session-publisher').value || '';
      const phone = editor.querySelector('.session-phone').value || '';
      const email = editor.querySelector('.session-email').value || '';
      const requests = editor.querySelector('.session-requests').value || '';
      const notes = editor.querySelector('.session-notes').value || '';
      const deliveries = editor.querySelector('.session-deliveries').value || '';
      const followUp = editor.querySelector('.session-followup').value || '';
      const subjects = Array.from(editor.querySelectorAll('.session-subjects button.active')).map(b=>b.innerText);
      const activities = Array.from(editor.querySelectorAll('.session-activities button.active')).map(b=>b.innerText);
      const favor = (editor.querySelector('.session-favor button.active') || { innerText: '' }).innerText;

      const data = { teacher, publisher, phone, email, requests, notes, deliveries, followUp, subjects, activities, favor };
      entries[index] = data;
      // hide editor
      wrap.style.display='none'; wrap.innerHTML='';
      renderSlots();
      // update hidden field and window state for final submit
      const hidden = qs('entriesJson'); if (hidden) hidden.value = JSON.stringify(entries.filter(e=>!!e));
      window.currentEntries = entries.slice();
    });
  }

  // initialize
  document.addEventListener('DOMContentLoaded', ()=>{
    renderSlots();
    const submit = qs('btnSubmit'); if (submit){
      submit.addEventListener('click', ()=>{
        const hidden = qs('entriesJson'); if (hidden) hidden.value = JSON.stringify(entries.filter(e=>!!e));
        window.currentEntries = entries.slice();
        // leave further submit handling to existing meeting.js
      });
    }
  });

})();
