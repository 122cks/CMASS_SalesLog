#!/usr/bin/env node
/**
 * migrate_ask_to_request.js
 *
 * Usage examples:
 *  node scripts/migrate_ask_to_request.js --key "./public/cmass-sales-dabccd916a67.json" --collection visit_entries --dry-run
 *  node scripts/migrate_ask_to_request.js --key "./public/cmass-sales-dabccd916a67.json" --collection visit_entries --remove-old true --apply true
 *
 * This script will copy `ask` -> `request` for documents that have `ask`.
 * By default it does a dry-run unless you pass `--apply true`.
 */

const fs = require('fs');
const path = require('path');
const { argv } = require('process');

function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i+1];
      if (!next || next.startsWith('--')) {
        args[key] = 'true';
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const keyPath = args.key || args.k;
  const collectionName = args.collection || 'visit_entries';
  const apply = args.apply === 'true' || args.apply === 'yes';
  const removeOld = (args['remove-old'] === 'true' || args.removeOld === 'true' || args.remove_old === 'true') || false;
  const backupField = args['backup-field'] || '_backup_ask';

  if (!keyPath) {
    console.error('ERROR: --key path to service account JSON is required.');
    process.exit(2);
  }

  if (!fs.existsSync(keyPath)) {
    console.error('ERROR: Provided key file not found:', keyPath);
    process.exit(2);
  }

  let admin;
  try {
    admin = require('firebase-admin');
  } catch (e) {
    console.error('ERROR: firebase-admin not installed. Run `npm install firebase-admin` first.');
    process.exit(2);
  }

  const key = require(path.resolve(keyPath));
  admin.initializeApp({
    credential: admin.credential.cert(key)
  });

  const db = admin.firestore();

  console.log(`Collection: ${collectionName}`);
  console.log(`Apply changes: ${apply}`);
  console.log(`Remove old 'ask' field: ${removeOld}`);
  console.log(`Backup field: ${backupField}`);

  const snapshot = await db.collection(collectionName).get();
  console.log(`Total documents in collection: ${snapshot.size}`);

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    if (Object.prototype.hasOwnProperty.call(data, 'ask')) {
      const askVal = data.ask;
      const hasRequest = Object.prototype.hasOwnProperty.call(data, 'request') && data.request !== undefined && data.request !== null && String(data.request).trim() !== '';
      if (!hasRequest) {
        toUpdate.push({ id: doc.id, ask: askVal });
      }
    }
  });

  console.log(`Documents with 'ask' needing migration: ${toUpdate.length}`);
  if (toUpdate.length === 0) {
    console.log('Nothing to do. Exiting.');
    process.exit(0);
  }

  const sample = toUpdate.slice(0, 10).map(d => d.id);
  console.log('Sample doc IDs (first 10):', sample.join(', '));

  if (!apply) {
    console.log('\nDry-run complete. To actually apply changes, re-run with --apply true');
    process.exit(0);
  }

  // Apply changes in batches of 400 (safely under 500 limit)
  const BATCH_SIZE = 400;
  let applied = 0;
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const chunk = toUpdate.slice(i, i + BATCH_SIZE);
    for (const item of chunk) {
      const ref = db.collection(collectionName).doc(item.id);
      const updateObj = { request: item.ask };
      if (backupField) updateObj[backupField] = item.ask;
      if (removeOld) {
        // Firestore FieldValue delete
        updateObj.ask = admin.firestore.FieldValue.delete();
      }
      batch.set(ref, updateObj, { merge: true });
    }
    await batch.commit();
    applied += chunk.length;
    console.log(`Committed batch: ${i}..${i + chunk.length - 1}  (applied so far: ${applied})`);
  }

  console.log(`Migration applied. Total documents updated: ${applied}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
