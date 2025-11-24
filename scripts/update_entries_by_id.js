// scripts/update_entries_by_id.js
// Safe helper to update visit_entries.region for a known list of entry IDs.
// Usage:
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
//   node scripts/update_entries_by_id.js --dry
//   node scripts/update_entries_by_id.js

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
  const candidatesPath = path.resolve(__dirname, '..', 'tmp_candidates.json');
  if (!fs.existsSync(candidatesPath)) {
    console.error('tmp_candidates.json not found at', candidatesPath);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(candidatesPath, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log('No candidates found in tmp_candidates.json');
    return;
  }

  // mapping: school name -> region
  const mapping = {
    '구리여자고등학교': '경기도구리시',
    '한광중학교': '경기도평택시',
    '용이중학교': '경기도평택시',
    '미금중학교': '경기도남양주시'
  };

  const planned = [];
  for (const r of rows) {
    const id = r.id;
    const school = (r.school || '').toString();
    const region = mapping[school];
    if (!region) {
      planned.push({ id, school, skip: true, reason: 'no mapping for school' });
      continue;
    }
    planned.push({ id, school, region });
  }

  console.log('Planned updates:', planned.filter(p => !p.skip).length, 'planned,', planned.filter(p=>p.skip).length, 'skipped');
  if (dry) {
    console.log('Dry-run: no writes will be performed. Run without --dry to apply.');
    console.log(JSON.stringify(planned.slice(0, 200), null, 2));
    return;
  }

  // Apply updates in batches
  const BATCH_SIZE = 200;
  let batch = db.batch();
  let ops = 0;
  const updated = [];
  for (const p of planned) {
    if (p.skip) continue;
    const docRef = db.collection('visit_entries').doc(p.id);
    batch.update(docRef, { region: p.region });
    ops++;
    updated.push(p.id);
    if (ops >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();

  console.log('Applied updates:', updated.length);
  if (updated.length) console.log('Updated IDs sample:', updated.slice(0, 50));
}

main().catch(err => { console.error(err); process.exit(1); });
