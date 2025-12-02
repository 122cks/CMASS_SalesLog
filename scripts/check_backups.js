// Usage: node scripts/check_backups.js [projectId]
// Checks for collections whose id contains '_backup' and prints document count/sample.

const admin = require('firebase-admin');

async function main(){
  const projectId = process.argv[2] || process.env.FIREBASE_PROJECT || 'cmass-sales';
  try{
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId });
  }catch(e){ console.error('Init failed', e.message); process.exit(1); }
  const db = admin.firestore();
  try{
    // list root collections
    const cols = await db.listCollections();
    const backups = cols.filter(c => c.id && c.id.toLowerCase().indexOf('_backup') !== -1);
    if (!backups.length){
      console.log('No collections with "_backup" found at root.');
    } else {
      console.log('Found backup collections:');
      for (const c of backups){
        try{
          const snap = await c.limit(20).get();
          console.log(`- ${c.id} (sample ${snap.size} docs):`);
          snap.forEach(d => { console.log('   id:', d.id, '=>', JSON.stringify(d.data()).slice(0,200)); });
        }catch(e){ console.warn('Failed to read collection', c.id, e.message); }
      }
    }

    // Also check for collections named '_backup_ask' explicitly
    try{
      const explicit = db.collection('_backup_ask');
      const s = await explicit.limit(5).get();
      if (!s.empty){
        console.log('Explicit collection _backup_ask exists, sample:');
        s.forEach(d=> console.log('  id:', d.id, JSON.stringify(d.data()).slice(0,200)));
      } else {
        console.log('_backup_ask collection not found or empty.');
      }
    }catch(e){ console.warn('Error checking _backup_ask', e.message); }

  }catch(e){ console.error('Error listing collections', e); }
  process.exit(0);
}

main();
