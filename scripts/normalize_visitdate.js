/*
  normalize_visitdate.js

  Normalize `visitDate` field in `visit_entries` documents.
  If visitDate is an ISO datetime string like "2025-10-30T00:00:00.000Z",
  convert it to a date-only string "2025-10-30".

  Usage (dry-run):
    node normalize_visitdate.js --project=cmass-sales

  To apply changes:
    node normalize_visitdate.js --project=cmass-sales --apply
*/

const { Firestore } = require('@google-cloud/firestore');
const argv = require('minimist')(process.argv.slice(2));

function toDateOnly(val){
  try{
    if (!val || typeof val !== 'string') return null;
    // Already date-only format YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
    // ISO-like datetime starting with YYYY-MM-DDT
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)){
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth()+1).padStart(2,'0');
      const dd = String(d.getUTCDate()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}`;
    }
    return null;
  }catch(e){ return null; }
}

async function main(){
  const project = argv.project || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT || null;
  const apply = !!argv.apply;
  console.log('Starting normalize_visitdate.js', { project, apply });

  const opts = {};
  if (project) opts.projectId = project;
  const db = new Firestore(opts);

  const col = db.collection('visit_entries');
  const snapshot = await col.get();
  console.log('Documents fetched:', snapshot.size);

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const raw = data.visitDate;
    if (raw === undefined || raw === null) return;
    // treat only string values
    if (typeof raw !== 'string') return;
    const candidate = toDateOnly(raw);
    if (candidate && candidate !== raw){
      toUpdate.push({ docId: doc.id, before: raw, after: candidate });
    }
  });

  if (!toUpdate.length){
    console.log('No documents require visitDate normalization.');
    return;
  }

  console.log('\nDry-run report: documents to normalize visitDate:', toUpdate.length);
  toUpdate.slice(0,20).forEach(x => console.log(x));
  if (toUpdate.length > 20) console.log('(showing 20 of ' + toUpdate.length + ')');

  if (!apply){
    console.log('\nDry-run complete. To apply changes run with --apply.');
    return;
  }

  console.log('\nApplying changes...');
  let applied = 0;
  for (const item of toUpdate){
    try{
      await db.collection('visit_entries').doc(item.docId).update({ visitDate: item.after });
      applied++;
      console.log('Updated', item.docId, item.before, '=>', item.after);
    }catch(err){
      console.error('Failed to update', item.docId, err && err.message ? err.message : err);
    }
  }
  console.log('Apply complete. Updated count:', applied);
}

main().catch(err => { console.error('Fatal error', err && err.stack ? err.stack : err); process.exit(1); });
