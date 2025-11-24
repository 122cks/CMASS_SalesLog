// Query Firestore visit_entries for documents whose data contains the substring '사서'
// Usage: set GOOGLE_APPLICATION_CREDENTIALS env var (already set in your environment), then run:
// node scripts/query_teacher_contains_sasa.js

const admin = require('firebase-admin');

function init() {
  if (!admin.apps.length) {
    try {
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        admin.initializeApp({ credential: admin.credential.applicationDefault() });
      } else {
        admin.initializeApp();
      }
    } catch (e) {
      console.error('firebase-admin init error', e);
      process.exit(1);
    }
  }
}

async function run() {
  init();
  const db = admin.firestore();
  console.log('Querying visit_entries...');
  try {
    const snap = await db.collection('visit_entries').get();
    console.log('Total documents scanned:', snap.size);
    const matches = [];
    snap.forEach(doc => {
      try {
        const data = doc.data() || {};
        // Quick heuristic: stringify the doc and search for the substring '사서'
        const raw = JSON.stringify(data);
        if (raw && raw.indexOf('사서') !== -1) {
          matches.push({ id: doc.id, snippet: extractSnippet(raw, '사서') });
        }
      } catch (e) {
        // ignore per-doc errors
      }
    });

    if (!matches.length) {
      console.log('No documents found containing "사서".');
      process.exit(0);
    }

    console.log('\nDocuments containing "사서":\n');
    matches.forEach(m => console.log(m.id));
    console.log('\nTotal matches:', matches.length);
    // also output JSON for easy copy
    console.log('\nJSON output:\n' + JSON.stringify(matches.map(m => m.id), null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Query failed', err);
    process.exit(2);
  }
}

function extractSnippet(s, keyword, context=30){
  const idx = s.indexOf(keyword);
  if (idx === -1) return '';
  const start = Math.max(0, idx - context);
  const end = Math.min(s.length, idx + keyword.length + context);
  return s.slice(start, end).replace(/\\s+/g, ' ');
}

run();
