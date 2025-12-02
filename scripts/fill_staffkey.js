/*
  scripts/fill_staffkey.js

  Usage:
    node scripts/fill_staffkey.js --key ./public/cmass-sales-8b9a9d55138f.json --dry-run
    node scripts/fill_staffkey.js --key ./public/cmass-sales-8b9a9d55138f.json

  The script connects to Firestore using the provided service account JSON file,
  scans the `visit_entries` collection, and for documents missing `StaffKey`
  attempts to infer it from `Staff` (or `staff`) field using a fixed mapping.

  It supports a `--dry-run` flag that prints changes without writing.
*/

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function usageAndExit(msg) {
  if (msg) console.error(msg);
  console.log('\nUsage: node scripts/fill_staffkey.js --key <serviceAccount.json> [--dry-run]');
  process.exit(msg ? 1 : 0);
}

const argv = process.argv.slice(2);
let keyPath = null;
let dryRun = false;
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--key' && argv[i+1]) { keyPath = argv[i+1]; i++; }
  else if (a === '--dry-run') dryRun = true;
  else usageAndExit(`Unknown arg: ${a}`);
}
if (!keyPath) usageAndExit('Missing --key argument');
if (!fs.existsSync(keyPath)) usageAndExit(`Service account file not found: ${keyPath}`);

// Mapping: StaffKey (ascii) -> display Korean name (normalized)
const STAFF_MAP = {
  'SongHoonJae': '송훈재',
  'LimJunho': '임준호',
  'ChoYoungHwan': '조영환'
};
// build reverse map (normalized display -> key)
const reverseMap = {};
Object.keys(STAFF_MAP).forEach(k => {
  const v = STAFF_MAP[k];
  reverseMap[normalizeName(v)] = k;
  // also add variant with suffix '부장' commonly present in data
  reverseMap[normalizeName(v + ' 부장')] = k;
  reverseMap[normalizeName(v + ' 부장님')] = k;
});

function normalizeName(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g, ' ').replace(/님|선생님|부장|부장님/g, '').trim();
}

async function main() {
  try {
    const serviceAccount = require(path.resolve(keyPath));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();
    console.log('Connected to Firestore.');

    const colRef = db.collection('visit_entries');
    console.log('Fetching documents from visit_entries...');
    const snap = await colRef.get();
    console.log(`Found ${snap.size} documents.`);

    const toUpdate = [];
    snap.forEach(doc => {
      const data = doc.data();
      // Accept multiple field name variants
      const staffKey = data.StaffKey || data.staffKey || data.staff_key || data.Staffkey || null;
      const staffVal = data.Staff || data.staff || data.StaffName || data.staffName || null;
      if (staffKey && String(staffKey).trim() !== '') return; // already present
      const normalized = normalizeName(staffVal || '');
      let resolved = null;
      // try exact normalized match in reverseMap
      if (reverseMap[normalized]) resolved = reverseMap[normalized];
      else {
        // try substring or case-insensitive contains against known display names
        for (const k of Object.keys(STAFF_MAP)){
          const display = STAFF_MAP[k];
          if (String(staffVal || '').indexOf(display) !== -1) { resolved = k; break; }
          if (String(staffVal || '').toLowerCase().indexOf(k.toLowerCase()) !== -1) { resolved = k; break; }
        }
      }
      if (resolved) toUpdate.push({ id: doc.id, ref: doc.ref, resolved, staffVal });
    });

    if (!toUpdate.length) {
      console.log('No documents require StaffKey updates.');
      process.exit(0);
    }

    console.log(`Documents to update: ${toUpdate.length}`);
    toUpdate.forEach(u => console.log(`${u.id}: staff='${u.staffVal}' -> StaffKey='${u.resolved}'`));

    if (dryRun) {
      console.log('\nDry-run mode: no writes performed.');
      process.exit(0);
    }

    // apply updates in batches (max 500 per batch)
    const BATCH_SIZE = 250;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = admin.firestore().batch();
      const chunk = toUpdate.slice(i, i + BATCH_SIZE);
      chunk.forEach(u => {
        batch.update(u.ref, { StaffKey: u.resolved });
      });
      await batch.commit();
      console.log(`Committed batch ${Math.floor(i / BATCH_SIZE) + 1} (${chunk.length} updates).`);
    }

    console.log('All updates applied.');
    process.exit(0);
  } catch (err) {
    console.error('Error', err);
    process.exit(2);
  }
}

main();
