/*
Migration script: rename field `deliveries` -> `delivery` in Firestore documents.

Usage:
  1) Install dependencies (once):
     npm init -y
     npm install firebase-admin minimist

  2) Dry-run to preview changes (recommended):
     node scripts/migrate_deliveries_to_delivery.js --key "C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\cmass-sales-8b9a9d55138f.json" --collection visit_entries --dry-run

  3) Apply changes:
     node scripts/migrate_deliveries_to_delivery.js --key "C:\Users\PC\OneDrive\cmass-sales-system\CMASS_SalesLog\public\cmass-sales-8b9a9d55138f.json" --collection visit_entries --apply

Notes:
 - This script will look for documents that have a top-level `deliveries` field.
 - For each such document it will set `delivery` to the value of `deliveries` (preserving type),
   and optionally remove `deliveries` if `--remove-old` is passed along with `--apply`.
 - Default run is dry-run which logs what would change without modifying the DB.
 - Always back up your DB before running destructive migrations.
*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const argv = require('minimist')(process.argv.slice(2), { boolean: ['dry-run','apply','remove-old'] });

async function main(){
  const keyPath = argv.key || argv.k;
  const collectionName = argv.collection || 'visit_entries';
  const dryRun = argv['dry-run'] || (!argv.apply);
  const doApply = argv.apply || false;
  const removeOld = argv['remove-old'] || false;

  if(!keyPath){
    console.error('Error: service account key path required via --key');
    process.exit(1);
  }
  if(!fs.existsSync(keyPath)){
    console.error('Error: service account key not found at', keyPath);
    process.exit(1);
  }

  const key = require(path.resolve(keyPath));
  admin.initializeApp({ credential: admin.credential.cert(key) });
  const db = admin.firestore();

  console.log(`Collection: ${collectionName}`);
  console.log(`Mode: ${dryRun? 'dry-run (no writes)' : (doApply? 'APPLY (writes enabled)' : 'dry-run')}`);

  // Query for docs where deliveries field exists
  // Firestore doesn't support existence operator directly; we'll fetch documents and filter client-side.
  const q = db.collection(collectionName).limit(5000);
  const snap = await q.get();
  if(snap.empty){ console.log('No documents found in collection.'); return; }

  const toUpdate = [];
  snap.forEach(doc => {
    const data = doc.data();
    if(Object.prototype.hasOwnProperty.call(data, 'deliveries')){
      toUpdate.push({ id: doc.id, ref: doc.ref, deliveries: data.deliveries, data });
    }
  });

  console.log(`Found ${toUpdate.length} documents with 'deliveries' field (queried up to 5000 docs).`);
  if(toUpdate.length === 0) return;

  // Preview
  toUpdate.forEach(item => {
    console.log(`- doc ${item.id}: deliveries=${JSON.stringify(item.deliveries)} -> will set delivery=${JSON.stringify(item.deliveries)}` + (doApply && removeOld? ' and remove deliveries' : ''));
  });

  if(dryRun){ console.log('\nDry-run complete. No changes were written. Rerun with --apply to perform updates.'); return; }

  // Apply updates in batches
  const BATCH_SIZE = 400; // keep below 500
  for(let i=0;i<toUpdate.length;i+=BATCH_SIZE){
    const batch = db.batch();
    const slice = toUpdate.slice(i, i+BATCH_SIZE);
    slice.forEach(item => {
      const updates = {};
      updates['delivery'] = item.deliveries;
      if(removeOld){
        // Use FieldValue.delete() for deletion
        updates['deliveries'] = admin.firestore.FieldValue.delete();
      }
      batch.update(item.ref, updates);
    });
    console.log(`Committing batch ${Math.floor(i/BATCH_SIZE)+1} with ${slice.length} updates...`);
    await batch.commit();
  }

  console.log('Migration complete.');
}

main().catch(err => { console.error('Migration failed', err); process.exit(2); });
