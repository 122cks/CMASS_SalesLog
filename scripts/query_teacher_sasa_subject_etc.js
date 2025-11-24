// Query Firestore visit_entries for documents where teacher contains '사서' and subjects include '기타'
// Usage: node scripts/query_teacher_sasa_subject_etc.js

const admin = require('firebase-admin');

function init() {
  if (!admin.apps.length) {
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else {
        admin.initializeApp();
      }
    } catch (e) {
      console.error('firebase-admin init error', e);
      process.exit(1);
    }
  }
}

function subjectIncludes(docSubjects, target) {
  try {
    if (!docSubjects && docSubjects !== '') return false;
    if (Array.isArray(docSubjects)) {
      return docSubjects.some(s => (s || '').toString().trim() === target);
    }
    // string
    const s = (docSubjects || '').toString();
    if (!s) return false;
    // exact match or contains as comma-separated
    if (s === target) return true;
    // try split by common delimiters
    const parts = s.split(/[,，\/|;]/).map(x=>x.trim()).filter(Boolean);
    return parts.some(p => p === target);
  } catch(e) { return false; }
}

function teacherContains(docData, keyword) {
  try{
    const keys = ['teacher','teacherName','teacher_name','teacherFullName','instructor','tchr','teacherFullname'];
    for (const k of keys){
      const v = docData[k];
      if (v && v.toString && v.toString().indexOf(keyword) !== -1) return true;
    }
    // also check common alternate fields
    for (const k in docData){
      try{ const v = docData[k]; if (typeof v === 'string' && v.indexOf(keyword)!==-1) return true; }catch(e){}
    }
    return false;
  }catch(e){ return false; }
}

async function run(){
  init();
  const db = admin.firestore();
  console.log('Scanning visit_entries...');
  try{
    const snap = await db.collection('visit_entries').get();
    console.log('Total docs:', snap.size);
    const matches = [];
    snap.forEach(doc=>{
      try{
        const data = doc.data() || {};
        const hasTeacher = teacherContains(data, '사서');
        const hasSubject = subjectIncludes(data.subjects || data.subject || data.subjects_raw, '기타');
        if (hasTeacher && hasSubject){
          const serverId = (data.server_id || data._id || doc.id || '');
          matches.push({ id: serverId, teacher: (data.teacher || data.teacherName || '').toString(), subjects: data.subjects });
        }
      }catch(e){ }
    });
    if (!matches.length){ console.log('No matching documents found.'); process.exit(0); }
    console.log('\nMatched server_id values:');
    matches.forEach(m => console.log(m.id));
    console.log('\nCount:', matches.length);
    console.log('\nDetailed JSON:');
    console.log(JSON.stringify(matches, null, 2));
    process.exit(0);
  }catch(err){ console.error('Scan failed', err); process.exit(2); }
}

run();
