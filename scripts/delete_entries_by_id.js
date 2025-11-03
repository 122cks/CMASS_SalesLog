// scripts/delete_entries_by_id.js
// Safe helper to delete visit_entries by explicit list of IDs.
// Usage:
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
//   node scripts/delete_entries_by_id.js --dry
//   node scripts/delete_entries_by_id.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const dry = process.argv.includes('--dry') || process.argv.includes('-d');

// Initialize admin SDK via GOOGLE_APPLICATION_CREDENTIALS env var
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('ERROR: set GOOGLE_APPLICATION_CREDENTIALS env var to your service account JSON path');
  process.exit(1);
}
try {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
} catch (e) {
  // if already initialized in some contexts, continue
}

const db = admin.firestore();

async function main() {
  const idsPath = path.resolve(__dirname, 'tmp_delete_ids.json');
  if (!fs.existsSync(idsPath)) {
    console.error('tmp_delete_ids.json not found at', idsPath);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No IDs found in tmp_delete_ids.json');
    return;
  }

  console.log('Planned deletions:', rows.length);
  if (dry) {
    console.log('Dry-run: no deletes will be performed. Run without --dry to apply.');
    console.log(JSON.stringify(rows.slice(0, 200), null, 2));
    return;
  }

  const BATCH_SIZE = 500; // Firestore batch limit is 500
  let batch = db.batch();
  let ops = 0;
  let deleted = 0;
  for (const id of rows) {
    const docRef = db.collection('visit_entries').doc(id);
    batch.delete(docRef);
    ops++;
    deleted++;
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
      console.log('Committed batch, deleted so far:', deleted);
    }
  }
  if (ops > 0) await batch.commit();

  console.log('Deletion applied. Total deleted (attempted):', deleted);
}

main().catch(err => { console.error(err); process.exit(1); });
