/*
  add_missing_ids.js

  Small migration helper to ensure each document in the 'visit_entries' collection
  has an `id` field equal to the document id.

  Usage (dry-run):
    node add_missing_ids.js --project=cmass-sales

  To apply changes (destructive):
    node add_missing_ids.js --project=cmass-sales --apply

  Authentication: same as other scripts in this repo. Set
    $env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\key.json'
  or use Application Default Credentials.
*/

const { Firestore } = require('@google-cloud/firestore');
const argv = require('minimist')(process.argv.slice(2));

async function main(){
  const project = argv.project || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT || null;
  const apply = !!argv.apply;
  console.log('Starting add_missing_ids.js', { project, apply });

  const opts = {};
  if (project) opts.projectId = project;
  const db = new Firestore(opts);

  const col = db.collection('visit_entries');
  const snapshot = await col.get();
  console.log('Documents fetched:', snapshot.size);

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    // consider id missing if the field is not present or is empty/null
    const hasIdField = Object.prototype.hasOwnProperty.call(data, 'id');
    const currentId = data.id;
    if (!hasIdField || currentId === null || currentId === undefined || String(currentId).trim() === ''){
      toUpdate.push({ docId: doc.id, currentId });
    }
  });

  if (!toUpdate.length){
    console.log('No documents are missing the `id` field.');
    return;
  }

  console.log('\nDry-run report: documents missing `id`:', toUpdate.length);
  toUpdate.slice(0,20).forEach(x => console.log(x));
  if (toUpdate.length > 20) console.log('(showing 20 of ' + toUpdate.length + ')');

  if (!apply){
    console.log('\nDry-run complete. To apply changes run with --apply (and ensure credentials are set).');
    return;
  }

  console.log('\nApplying changes...');
  let applied = 0;
  for (const item of toUpdate){
    try{
      await db.collection('visit_entries').doc(item.docId).update({ id: item.docId });
      applied++;
      console.log('Updated', item.docId, 'set id =', item.docId);
    }catch(err){
      console.error('Failed to update', item.docId, err && err.message ? err.message : err);
    }
  }
  console.log('Apply complete. Updated count:', applied);
}

main().catch(err => { console.error('Fatal error', err && err.stack ? err.stack : err); process.exit(1); });
