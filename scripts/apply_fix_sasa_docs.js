// Apply fixes to visit_entries:
// - set subjects -> ['도서관사서'] and subject -> '도서관사서'
// - normalize teacher field by removing '사서' tokens and surrounding punctuation, leaving name only
// Usage:
//  node scripts/apply_fix_sasa_docs.js        -> dry-run (no writes)
//  node scripts/apply_fix_sasa_docs.js --apply -> perform updates

const admin = require('firebase-admin');

function init(){
  if (!admin.apps.length){
    try{
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS){
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else {
        admin.initializeApp();
      }
    }catch(e){ console.error('firebase-admin init failed', e); process.exit(1); }
  }
}

function normalizeTeacher(raw){
  try{
    if (!raw) return '';
    let s = String(raw).trim();
    // Remove common patterns: '(사서)', ' (사서)', '사서-이름', '사서 이름', leading '사서-' etc
    // Remove parentheses that include 사서
    s = s.replace(/\([^)]*사서[^)]*\)/gi, '');
    // Remove prefixes like '사서-', '사서 -', '사서:'
    s = s.replace(/^\s*사서\s*[-:\u2013—]?\s*/i, '');
    // Remove standalone '사서' tokens surrounded by non-word or ends
    s = s.replace(/(^|[^\p{L}\p{N}_])사서([^\p{L}\p{N}_]|$)/giu, ' ');
    // Remove stray dashes/colons/commas left
    s = s.replace(/[-:,;\u2013\u2014]/g, ' ');
    // Collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }catch(e){ return String(raw || ''); }
}

async function run(){
  init();
  const db = admin.firestore();
  const apply = process.argv.indexOf('--apply') !== -1;
  console.log('Apply mode:', apply);

  // We will scan visit_entries and filter documents where teacher contains '사서' and subjects include '기타'
  const snap = await db.collection('visit_entries').get();
  console.log('Scanned docs:', snap.size);
  const toUpdate = [];
  snap.forEach(doc => {
    try{
      const d = doc.data() || {};
      // teacher check
      const teacherKeys = ['teacher','teacherName','teacher_name','instructor','tchr'];
      let teacherRaw = '';
      for (const k of teacherKeys){ if (d[k]){ teacherRaw = d[k]; break; } }
      const teacherContains = teacherRaw && String(teacherRaw).indexOf('사서') !== -1;
      // subject check
      const subj = d.subjects || d.subject || d.subjects_raw || d.subject_raw;
      let subjectMatch = false;
      if (Array.isArray(subj)){
        subjectMatch = subj.some(s => String(s).trim() === '기타');
      } else if (subj){
        const s = String(subj);
        // exact or splitted
        if (s.trim() === '기타') subjectMatch = true;
        else{
          const parts = s.split(/[,，\/|;]/).map(x=>x.trim());
          subjectMatch = parts.some(p => p === '기타');
        }
      }
      if (teacherContains && subjectMatch){
        toUpdate.push({ id: doc.id, data: d, teacherRaw });
      }
    }catch(e){}
  });

  if (!toUpdate.length){ console.log('No documents to update.'); return; }
  console.log('Documents to update:', toUpdate.length);
  // show preview
  toUpdate.forEach(x => {
    const newTeacher = normalizeTeacher(x.teacherRaw);
    console.log('\n---');
    console.log('doc:', x.id);
    console.log('old teacher:', x.teacherRaw);
    console.log('new teacher:', newTeacher);
    console.log('old subjects:', x.data.subjects || x.data.subject);
    console.log('new subjects:', ['도서관사서']);
  });

  if (!apply){ console.log('\nDry-run complete. Rerun with --apply to perform updates.'); return; }

  // apply updates in batch (up to 500 per batch)
  const batches = [];
  let batch = db.batch();
  let count = 0;
  for (const x of toUpdate){
    const docRef = db.collection('visit_entries').doc(x.id);
    const newTeacher = normalizeTeacher(x.teacherRaw);
    const updatePayload = { subjects: ['도서관사서'], subject: '도서관사서', teacher: newTeacher, teacherName: newTeacher };
    batch.update(docRef, updatePayload);
    count++;
    if (count % 450 === 0){ batches.push(batch); batch = db.batch(); }
  }
  batches.push(batch);

  // commit batches sequentially
  let applied = 0;
  for (const b of batches){
    try{
      await b.commit();
      applied += 450; // approximate per batch; we'll correct below
    }catch(e){ console.error('batch commit failed', e); }
  }

  // Since we approximated, recount by checking docs updated
  console.log('\nFinished applying updates. Please verify in Firestore.');
}

run().catch(e=>{ console.error('Script failed', e); process.exit(2); });
