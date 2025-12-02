// Usage: node scripts/find_materials.js [projectId]
// Requires Google Application Default Credentials or a service account key via GOOGLE_APPLICATION_CREDENTIALS.
// Prints server_id and a short summary for documents that have materials-like fields.

const admin = require('firebase-admin');

async function main(){
  const projectId = process.argv[2] || process.env.FIREBASE_PROJECT || 'cmass-sales';
  try{
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
  }catch(e){
    console.error('Failed to initialize firebase-admin. Ensure Application Default Credentials are set (run `gcloud auth application-default login` or set GOOGLE_APPLICATION_CREDENTIALS).', e.message);
    process.exit(1);
  }

  const db = admin.firestore();
  const col = db.collection('visit_entries');

  // fields to check for materials content
  const materialFields = ['materials','material','deliveryMaterials','deliveredMaterials','materialsList',
    '전달자료','전달물','전달','delivered','delivered_materials','delivery_materials','deliveryMaterialsText','전달자료_text'];

  const found = new Map();

  await Promise.all(materialFields.map(async (f)=>{
    try{
      const q = col.where(f, '!=', null).limit(5000);
      const snap = await q.get();
      snap.forEach(d => {
        const data = d.data();
        const id = String(data.server_id || d.id || '');
        // consider non-empty strings/arrays
        const val = data[f];
        let has = false;
        if (Array.isArray(val)) has = val.length > 0;
        else if (typeof val === 'string') has = val.trim().length > 0;
        else if (val !== null && val !== undefined) has = true;
        if (has) found.set(d.id, { server_id: id || d.id, field: f, value: val });
      });
    }catch(e){
      // Firestore may not support != on some indexes; fallback to full scan later
    }
  }));

  // If none found by queries above (or queries failed due to index), do a paginated full scan (safe, up to provided limit)
  if (found.size === 0){
    console.warn('No hits from indexed queries — performing paginated full scan (up to 20000 docs).');
    const pageSize = 1000;
    let last = null;
    let scanned = 0;
    while(scanned < 20000){
      let q = col.orderBy('__name__').limit(pageSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (snap.empty) break;
      snap.forEach(d=>{
        const data = d.data();
        const id = String(data.server_id || d.id || '');
        for (const f of materialFields){
          const val = data[f];
          if (Array.isArray(val) && val.length) { found.set(d.id, { server_id: id || d.id, field: f, value: val }); break; }
          if (typeof val === 'string' && val.trim()) { found.set(d.id, { server_id: id || d.id, field: f, value: val }); break; }
          if (val !== undefined && val !== null && typeof val !== 'object') { found.set(d.id, { server_id: id || d.id, field: f, value: String(val) }); break; }
        }
      });
      scanned += snap.docs.length;
      last = snap.docs[snap.docs.length-1];
      if (snap.docs.length < pageSize) break;
    }
  }

  if (!found.size){
    console.log('No documents with materials-like fields found.');
    process.exit(0);
  }

  console.log(`Found ${found.size} documents with materials:`);
  const out = [];
  for (const [docId, info] of found.entries()){
    console.log(`- docId: ${docId}  server_id: ${info.server_id}  field: ${info.field}  sample: ${JSON.stringify(info.value).slice(0,200)}`);
    out.push({ docId, server_id: info.server_id, field: info.field, sample: info.value });
  }

  // Optionally write results to file
  const fs = require('fs');
  const path = require('path');
  const outFile = path.join(__dirname, 'materials_found.json');
  try{ fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8'); console.log('Wrote results to', outFile); }catch(e){ console.warn('Failed to write results file', e.message); }

  process.exit(0);
}

main().catch(e=>{ console.error('Script failed', e); process.exit(2); });
