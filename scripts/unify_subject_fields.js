// Unify 'subject' and 'subjects' fields in visit_entries into a single 'subject' field.
// Behavior (dry-run by default):
//  - For each document, gather values from 'subjects' (array or string) and 'subject' (string or array)
//  - Build a combined array of unique, trimmed subject strings
//  - If combined.length === 0 -> no change
//  - If combined.length === 1 -> set 'subject' to the single string
//  - If combined.length > 1 -> set 'subject' to the array of strings
//  - Remove the 'subjects' field if present
// Usage:
//  node scripts/unify_subject_fields.js        # dry-run
//  node scripts/unify_subject_fields.js --apply  # perform updates

const admin = require('firebase-admin');

function init(){
  if (!admin.apps.length){
    try{
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS){
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else {
        admin.initializeApp();
      }
    }catch(e){ console.error('firebase-admin init error', e); process.exit(1); }
  }
}

function toArray(val){
  if (val === undefined || val === null) return [];
  if (Array.isArray(val)) return val.map(x => String(x||'').trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(/[,，\/|;]/).map(x=>x.trim()).filter(Boolean);
  try{ return [String(val).trim()].filter(Boolean); }catch(e){ return []; }
}

function uniq(arr){
  const seen = new Set();
  const out = [];
  for (const a of arr){ const key = String(a||'').trim(); if (!key) continue; if (!seen.has(key)){ seen.add(key); out.push(key); } }
  return out;
}

async function run(){
  init();
  const db = admin.firestore();
  const apply = process.argv.indexOf('--apply') !== -1;
  console.log('Apply mode:', apply);

  const snap = await db.collection('visit_entries').get();
  console.log('Scanned docs:', snap.size);
  const changes = [];

  snap.forEach(doc => {
    try{
      const d = doc.data() || {};
      const arr1 = toArray(d.subjects);
      const arr2 = toArray(d.subject);
      const combined = uniq(arr1.concat(arr2));
      if (combined.length === 0) return; // nothing to do

      // Determine newSubject value
      const newSubject = (combined.length === 1) ? combined[0] : combined.slice();

      // Determine if change actually required
      const existingSubject = (d.subject === undefined) ? undefined : d.subject;
      const existingSubjects = (d.subjects === undefined) ? undefined : d.subjects;

      // decide if current doc already matches desired shape
      let already = false;
      if (existingSubjects !== undefined){
        // subjects exists -> we will remove it so change required
        already = false;
      } else if (existingSubject !== undefined){
        // compare
        if (Array.isArray(existingSubject) && Array.isArray(newSubject)){
          // compare arrays
          if (existingSubject.length === newSubject.length && existingSubject.every((v,i)=>String(v)===String(newSubject[i]))) already = true;
        } else if (!Array.isArray(existingSubject) && !Array.isArray(newSubject)){
          if (String(existingSubject) === String(newSubject)) already = true;
        } else {
          already = false;
        }
      }

      if (!already){
        changes.push({ id: doc.id, newSubject, old: { subject: existingSubject, subjects: existingSubjects } });
      }
    }catch(e){ console.warn('doc check failed', doc.id, e); }
  });

  if (!changes.length){ console.log('No documents require changes.'); return; }

  console.log('Documents to change:', changes.length);
  // show preview for first 50
  changes.slice(0,50).forEach(c => {
    console.log('\n---');
    console.log('doc:', c.id);
    console.log('old.subject:', JSON.stringify(c.old.subject));
    console.log('old.subjects:', JSON.stringify(c.old.subjects));
    console.log('new subject:', JSON.stringify(c.newSubject));
  });
  if (changes.length > 50) console.log('\n... +', (changes.length-50), 'more');

  if (!apply){ console.log('\nDry-run complete. Rerun with --apply to perform updates.'); return; }

  // Apply updates in batches
  const batchSize = 400;
  let idx = 0;
  while (idx < changes.length){
    const batch = db.batch();
    const slice = changes.slice(idx, idx + batchSize);
    slice.forEach(ch => {
      const ref = db.collection('visit_entries').doc(ch.id);
      // set subject, delete subjects
      const payload = {};
      payload.subject = ch.newSubject;
      payload.subjects = admin.firestore.FieldValue.delete();
      batch.update(ref, payload);
    });
    try{
      await batch.commit();
      console.log('Committed batch', Math.floor(idx / batchSize) + 1, 'items=', slice.length);
    }catch(e){ console.error('Batch commit failed', e); }
    idx += batchSize;
  }

  console.log('\nApply complete.');
}

run().catch(e=>{ console.error('Script failed', e); process.exit(2); });
