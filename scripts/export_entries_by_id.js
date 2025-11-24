// scripts/export_entries_by_id.js
// Helper to export visit_entries documents by explicit list of IDs to a JSON file.
// Usage:
//   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
//   node scripts/export_entries_by_id.js

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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

  console.log('Exporting documents:', rows.length);
  const out = [];
  for (const id of rows) {
    try {
      const snap = await db.collection('visit_entries').doc(id).get();
      if (!snap.exists) {
        out.push({ id, exists: false });
      } else {
        out.push({ id, exists: true, data: snap.data() });
      }
    } catch (e) {
      out.push({ id, error: e && e.message });
    }
  }

  const outPath = path.resolve(__dirname, 'exported_visit_entries.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log('Export written to', outPath);
}

main().catch(err => { console.error(err); process.exit(1); });
