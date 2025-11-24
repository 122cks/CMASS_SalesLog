#!/usr/bin/env node
/*
  Firestore migration script: rename field `meetings` -> `activities` in the
  `visit_entries` collection.

  Usage (dry-run):
    set GOOGLE_APPLICATION_CREDENTIALS=path\to\serviceAccount.json
    node scripts/rename_meetings_to_activities.js --project cmass-sales

  To apply changes (writes):
    node scripts/rename_meetings_to_activities.js --project cmass-sales --apply

  Options:
    --project <projectId>  Firebase project id (required)
    --batchSize <N>       Number of docs to fetch per loop (default 500)
    --apply               Actually perform writes. Without this flag the script is a dry-run.

  Safety notes:
  - The script will NOT overwrite an existing `activities` field. If a document
    already contains `activities`, it will be skipped and logged.
  - Always run dry-run first and backup your data (Firestore export) before applying.
*/

const admin = require('firebase-admin');
const {argv} = require('process');

function parseArgs(){
  const args = { project: null, batchSize: 500, apply: false, listIds: false };
  for (let i=2;i<argv.length;i++){
    const a = argv[i];
    if (a === '--project' && argv[i+1]){ args.project = argv[i+1]; i++; }
    else if (a === '--batchSize' && argv[i+1]){ args.batchSize = Number(argv[i+1]) || 500; i++; }
    else if (a === '--apply'){ args.apply = true; }
    else if (a === '--list-ids' || a === '--listIds'){ args.listIds = true; }
  }
  return args;
}

async function main(){
  const args = parseArgs();
  if (!args.project){ console.error('Missing --project <projectId>'); process.exit(2); }

  // Initialize admin SDK. Expects GOOGLE_APPLICATION_CREDENTIALS env var
  try{
    admin.initializeApp({ projectId: args.project });
  }catch(e){ /* already initialized possibly */ }
  const db = admin.firestore();
  const FieldValue = admin.firestore.FieldValue;

  console.log(`Starting migration for project=${args.project} batchSize=${args.batchSize} apply=${args.apply}`);

  let processed = 0;
  let renamed = 0;
  let skipped_existing_activities = 0;
  const foundIds = []; // collect server_id or doc.id when meetings->activities candidate
  let lastDoc = null;

  while (true){
    let q = db.collection('visit_entries').orderBy(admin.firestore.FieldPath.documentId()).limit(args.batchSize);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const doc of snap.docs){
      processed++;
      const data = doc.data();
      if (data === undefined) continue;
      if (data.activities !== undefined){
        // Already has activities; skip to avoid overwriting
        skipped_existing_activities++;
        continue;
      }
      if (data.meetings === undefined) continue; // nothing to do

      // record id for listing if requested
      if (args.listIds){
        if (data.server_id) foundIds.push(String(data.server_id));
        else foundIds.push(String(doc.id));
      }

      // Prepare update: set activities = meetings, delete meetings
      const meetingsVal = data.meetings;
      if (args.apply){
        batch.update(doc.ref, { activities: meetingsVal, meetings: FieldValue.delete() });
      }
      renamed++;
    }

    if (args.apply){
      try{
        await batch.commit();
        console.log(`Committed batch of ${snap.docs.length} docs (processed so far: ${processed})`);
      }catch(e){ console.error('Batch commit failed', e); throw e; }
    } else {
      console.log(`Dry-run: evaluated ${snap.docs.length} docs (processed so far: ${processed}, would rename: ${renamed})`);
    }

    lastDoc = snap.docs[snap.docs.length - 1];
    // If fewer than batchSize, we're done
    if (snap.docs.length < args.batchSize) break;
  }

  console.log('Migration summary:');
  console.log('  processed docs:', processed);
  console.log('  renamed (meetings -> activities):', renamed);
  console.log('  skipped (already had activities):', skipped_existing_activities);
  if (args.listIds){
    console.log('\nMatched document ids (server_id or doc.id) -- one per line:');
    for (const id of foundIds) console.log(id);
    console.log('\nTotal matched ids:', foundIds.length);
  }
  console.log('Done.');
}

main().catch(err=>{ console.error('Migration failed', err); process.exit(1); });
