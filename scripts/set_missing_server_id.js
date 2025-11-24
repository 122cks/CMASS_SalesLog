/*
  set_missing_server_id.js

  Sets `server_id` = document id for documents in `visit_entries` where
  `server_id` is missing, null, or empty string.

  Usage (dry-run):
    node set_missing_server_id.js --project=cmass-sales

  To apply changes:
    node set_missing_server_id.js --project=cmass-sales --apply

  Auth: same as other scripts in this repo.
*/

const { Firestore } = require('@google-cloud/firestore');
const argv = require('minimist')(process.argv.slice(2));

async function main(){
  const project = argv.project || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT || null;
  const apply = !!argv.apply;
  console.log('Starting set_missing_server_id.js', { project, apply });

  const opts = {};
  if (project) opts.projectId = project;
  const db = new Firestore(opts);

  const col = db.collection('visit_entries');
  const snapshot = await col.get();
  console.log('Documents fetched:', snapshot.size);

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const serverId = data.server_id || data.serverId || null;
    if (serverId === null || serverId === undefined || String(serverId).trim() === ''){
      toUpdate.push({ docId: doc.id });
    }
  });

  if (!toUpdate.length){
    console.log('No documents require server_id population.');
    return;
  }

  console.log('\nDry-run report: documents missing server_id:', toUpdate.length);
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
      await db.collection('visit_entries').doc(item.docId).update({ server_id: item.docId });
      applied++;
      console.log('Updated', item.docId, 'set server_id =', item.docId);
    }catch(err){
      console.error('Failed to update', item.docId, err && err.message ? err.message : err);
    }
  }
  console.log('Apply complete. Updated count:', applied);
}

main().catch(err => { console.error('Fatal error', err && err.stack ? err.stack : err); process.exit(1); });
