// update_visitdate.js
// Usage: node update_visitdate.js /path/to/serviceAccount.json
// Will query visit_entries where staff=='LimJunho' and visitDate=='2025-11-19' and update visitDate to '2025-11-18'.

const path = require('path');
const fs = require('fs');

async function main(){
  try{
    const arg = process.argv[2];
    if (!arg){
      console.error('Usage: node update_visitdate.js /path/to/serviceAccount.json');
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
    const fromDate = '2025-11-19';
    const toDate = '2025-11-18';

    console.log('Searching for documents: staff=', staffKey, 'visitDate=', fromDate);
    const q = db.collection('visit_entries').where('staff','==', staffKey).where('visitDate','==', fromDate);
    const snap = await q.get();
    if (snap.empty){
      console.log('No documents found.');
      await admin.app().delete();
      process.exit(0);
    }

    const updated = [];
    for (const doc of snap.docs){
      try{
        await db.collection('visit_entries').doc(doc.id).update({ visitDate: toDate });
        console.log('Updated', doc.id);
        updated.push(doc.id);
      }catch(e){
        console.error('Failed to update', doc.id, e && e.message);
      }
    }

    console.log('Update complete. Updated count:', updated.length);
    if (updated.length) console.log('Updated docIds:', updated.join(', '));

    await admin.app().delete();
    process.exit(0);
  }catch(err){
    console.error('Error:', err && (err.stack || err.message || err));
    process.exit(1);
  }
}

main();
