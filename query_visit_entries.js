// query_visit_entries.js
// Usage: node query_visit_entries.js /full/path/to/serviceAccount.json
// Prints matching documents in `visit_entries` where staff == 'LimJunho' and visitDate == '2025-11-19'.

const path = require('path');
const fs = require('fs');

async function main(){
  try{
    const arg = process.argv[2];
    if (!arg){
      console.error('Usage: node query_visit_entries.js /path/to/serviceAccount.json');
      process.exit(2);
    }
    const keyPath = path.resolve(arg);
    if (!fs.existsSync(keyPath)){
      console.error('Service account JSON not found at', keyPath);
      process.exit(3);
    }

    const admin = require('firebase-admin');
    const serviceAccount = require(keyPath);

    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    const db = admin.firestore();

    const staffKey = 'LimJunho';
    const visitDate = '2025-11-19';

    console.log('Querying visit_entries for', staffKey, visitDate);
    const q = db.collection('visit_entries').where('staff','==', staffKey).where('visitDate','==', visitDate);
    const snap = await q.get();
    if (snap.empty){
      console.log('No documents found.');
      process.exit(0);
    }

    snap.forEach(doc => {
      const data = doc.data() || {};
      const serverId = data.server_id || data.serverId || null;
      console.log('---');
      console.log('docId:', doc.id);
      console.log('server_id:', serverId);
      console.log('full:', JSON.stringify(data, null, 2));
    });

    // Graceful shutdown
    await admin.app().delete();
  }catch(err){
    console.error('Error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

main();
