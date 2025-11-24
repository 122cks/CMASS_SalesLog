// find_test_docs.js
// Usage: node scripts/find_test_docs.js
// This script loads a service account key (hardcoded path below), connects to Firestore,
// scans visit_entries (limited to 10000 docs), and prints document IDs whose JSON contains '테스트'.

const path = require('path');
const fs = require('fs');

async function main(){
  try{
    const keyPath = path.resolve("C:/Users/PC/OneDrive/cmass-sales-system/CMASS_SalesLog/cmass-sales-8b9a9d55138f.json");
    if (!fs.existsSync(keyPath)){
      console.error('SERVICE_ACCOUNT_NOT_FOUND', keyPath);
      process.exit(2);
    }
    const admin = require('firebase-admin');
    const sa = require(keyPath);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    const db = admin.firestore();

    console.log('Connected to Firestore project:', sa.project_id || sa.projectId || '<unknown>');

    const col = db.collection('visit_entries');
    const limit = 10000;
    const snap = await col.limit(limit).get();
    if (!snap || snap.empty){
      console.log('NO_DOCS');
      process.exit(0);
    }
    const matches = [];
    snap.forEach(doc => {
      try{
        const data = doc.data() || {};
        const s = JSON.stringify(data);
        if (s && s.indexOf('테스트') !== -1){
          matches.push({ id: doc.id, excerpt: (s.length>200? s.substr(0,200)+'...': s) });
        }
      }catch(e){ /* ignore per-doc errors */ }
    });
    console.log(JSON.stringify({ count: matches.length, matches: matches.map(m=>m.id) }, null, 2));
    // also print excerpts (first match) for user visibility
    if (matches.length){
      console.log('\n--- Sample excerpt from first match ---\n');
      console.log(matches[0].excerpt);
    }
    process.exit(0);
  }catch(err){
    console.error('ERROR', err && err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
