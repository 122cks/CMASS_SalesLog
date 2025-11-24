// Migration script: migrate documents from 'visits' to 'visit_entries'
// Usage:
//   Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON path OR pass --key <path>
//   node migrate_visits_to_visit_entries.js --project <projectId> [--staff SongHoonjae] [--limit 100] [--dry-run]

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

function usageAndExit(code=1){
  console.error('Usage: node migrate_visits_to_visit_entries.js --project <projectId> [--key <path-to-sa.json>] [--staff <staffSlug>] [--limit N] [--dry-run]');
  process.exit(code);
}

const argv = require('minimist')(process.argv.slice(2));
if(!argv.project) usageAndExit();

const projectId = argv.project;
const keyPath = argv.key || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const staffFilter = argv.staff || null;
const limit = argv.limit ? parseInt(argv.limit,10) : null;
const dryRun = argv['dry-run'] || argv.dryrun || false;

if(!keyPath){
  console.error('ERROR: Service account key not provided. Set GOOGLE_APPLICATION_CREDENTIALS or pass --key <path>');
  usageAndExit();
}

if(!fs.existsSync(keyPath)){
  console.error('ERROR: key file not found:', keyPath);
  process.exit(2);
}

const serviceAccount = require(path.resolve(keyPath));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId
});

const db = admin.firestore();

function mapLegacyToVisitEntry(legacy){
  // Attempt to normalize fields. This is best-effort mapping; adjust if your data uses different names.
  const out = {};
  out.legacy_collection = 'visits';
  out.legacy_id = legacy.id || legacy._id || null;

  // copy common fields
  const copyFields = ['staff','staffLabel','visitDate','startHour','startMinute','duration','endTime','subjects','activities','favor','teacherName','publisher','phone','email','requests','notes','deliveries','followUp','school','region'];
  copyFields.forEach(f => { if(legacy[f] !== undefined) out[f] = legacy[f]; });

  // Ensure visitDate is an ISO date string (YYYY-MM-DD) or Firestore Timestamp
  if(legacy.visitDate){
    // try parse
    const d = new Date(legacy.visitDate);
    if(!isNaN(d.getTime())){
      // store as ISO date string (YYYY-MM-DD)
      out.visitDate = d.toISOString().slice(0,10);
    }else{
      out.visitDate = legacy.visitDate;
    }
  }

  // compute visitStart and visitEnd if startHour/startMinute/duration are present
  try{
    if(out.visitDate && out.startHour !== undefined && out.startMinute !== undefined){
      const hh = String(out.startHour).padStart(2,'0');
      const mm = String(out.startMinute).padStart(2,'0');
      out.visitStart = `${out.visitDate}T${hh}:${mm}:00`;
      if(out.duration){
        const dur = parseInt(out.duration,10);
        const start = new Date(out.visitStart);
        const end = new Date(start.getTime() + (dur||0)*60000);
        out.visitEnd = end.toISOString();
      }
    }
  }catch(e){/* ignore */}

  // add migratedAt
  out.migratedAt = admin.firestore.FieldValue.serverTimestamp();
  return out;
}

async function run(){
  console.log('Migration start', new Date().toISOString());
  let q = db.collection('visits');
  if(staffFilter){
    q = q.where('staff','==',staffFilter);
  }
  if(limit) q = q.limit(limit);

  const snap = await q.get();
  console.log('Found', snap.size, 'legacy docs in visits matching filter');

  let migrated = 0;
  for(const doc of snap.docs){
    const data = doc.data();
    data.id = doc.id; // make id available to mapper

    // Check whether this doc was already migrated by looking for legacy_id in visit_entries
    const existingQuery = await db.collection('visit_entries').where('legacy_id','==',doc.id).limit(1).get();
    if(!existingQuery.empty){
      console.log('[skip] already migrated:', doc.id);
      continue;
    }

    const mapped = mapLegacyToVisitEntry(data);

    if(dryRun){
      console.log('[dry-run] would create visit_entries doc for', doc.id, 'mapped=', mapped);
      migrated++;
      continue;
    }

    try{
      const res = await db.collection('visit_entries').add(mapped);
      console.log('[migrated]', doc.id, '-> visit_entries/', res.id);
      migrated++;

      // Optionally, mark legacy doc as migrated to avoid repeated work
      await db.collection('visits').doc(doc.id).set({migratedToVisitEntries: true},{merge:true});
    }catch(err){
      console.error('ERROR migrating', doc.id, err);
    }
  }

  console.log('Migration finished. migrated count=', migrated);
}

run().then(()=>process.exit(0)).catch(err=>{console.error(err); process.exit(2);});
