// Usage: node scripts/add_materials_field.js [projectId]
// Adds materials: [] to all documents in visit_entries that don't have materials.
// Creates a backup copy in `_backup_materials/{docId}` with original data + _backupAt timestamp.

const admin = require('firebase-admin');

async function main(){
  const projectId = process.argv[2] || process.env.FIREBASE_PROJECT || 'cmass-sales';
  try{
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  }catch(e){ console.error('Init failed', e.message); process.exit(1); }
  const db = admin.firestore();
  const col = db.collection('visit_entries');
  const backupCol = db.collection('_backup_materials');

  const pageSize = 500;
  let last = null;
  let total = 0;
  let updated = 0;
  try{
    while(true){
      let q = col.orderBy('__name__').limit(pageSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      for (const d of snap.docs){
        total++;
        const data = d.data();
        const hasMaterials = (data.hasOwnProperty('materials') && data.materials !== undefined);
        if (!hasMaterials){
          // backup original
          try{
            await backupCol.doc(d.id).set(Object.assign({}, data, { _backupAt: new Date().toISOString() }));
          }catch(be){ console.warn('backup failed for', d.id, be.message); }
          // set materials to empty array
          try{
            await col.doc(d.id).set({ materials: [] }, { merge: true });
            updated++;
            console.log('updated:', d.id);
          }catch(we){ console.warn('update failed for', d.id, we.message); }
        }
      }
      last = snap.docs[snap.docs.length-1];
      if (snap.docs.length < pageSize) break;
    }
    console.log(`Finished. scanned=${total}  updated=${updated}`);
  }catch(e){ console.error('Script failure', e); }
  process.exit(0);
}

main();
