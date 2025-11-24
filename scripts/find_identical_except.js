#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {Firestore} = require('@google-cloud/firestore');

function parseArgs(argv){
  const out = {};
  argv.slice(2).forEach(a=>{
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--staff=')) out.staff = a.split('=')[1];
    else if (a.startsWith('--date=')) out.date = a.split('=')[1];
    else if (a.startsWith('--project=')) out.project = a.split('=')[1];
    else if (a.startsWith('--backup=')) out.backup = a.split('=')[1];
  });
  return out;
}

function canonicalize(obj){
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = canonicalize(obj[k]);
  return out;
}

function stripFields(doc){
  const copy = JSON.parse(JSON.stringify(doc));
  // remove fields to ignore
  delete copy.server_id;
  delete copy.createdAt;
  delete copy.source_doc;
  delete copy.id;
  delete copy._savedAt;
  return copy;
}

function ensureDir(dir){
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}

async function main(){
  const args = parseArgs(process.argv);
  if (!args.staff || !args.date){
    console.error('Usage: node find_identical_except.js --staff=LimJunho --date=YYYY-MM-DD [--project=proj] [--backup=path] [--apply]');
    process.exit(1);
  }
  const opts = {};
  if (args.project) opts.projectId = args.project;
  const db = new Firestore(opts);

  const snap = await db.collection('visit_entries').where('visitDate','==',args.date).get();
  console.log('Matched by date:', snap.size);
  const target = args.staff.replace(/\s+/g,'').toLowerCase();
  const docs = [];
  snap.forEach(d=>{
    const data = d.data();
    const staffCandidates = [data.staff, data.staffToken, data.staffLabel, data.publisher].filter(Boolean);
    const matched = staffCandidates.some(x=>String(x).replace(/\s+/g,'').toLowerCase()===target);
    if (matched) docs.push({id:d.id, data});
  });
  console.log('After staff filter:', docs.length);

  const groups = new Map();
  for (const doc of docs){
    const stripped = stripFields(doc.data);
    const canonical = canonicalize(stripped);
    const key = JSON.stringify(canonical);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({id:doc.id, data:doc.data});
  }

  const dupGroups = [];
  for (const [k, arr] of groups.entries()){
    if (arr.length>1) dupGroups.push({key:k, docs:arr});
  }

  console.log('Groups identical except server_id/createdAt/source_doc/id/_savedAt:', dupGroups.length);

  const backupPath = args.backup || path.join('tools','backup', `identical_except_${args.date.replace(/-/g,'')}_${Date.now()}.json`);
  ensureDir(path.dirname(backupPath));

  const backup = { date: args.date, staff: args.staff, createdAt: new Date().toISOString(), groups: [] };
  for (const g of dupGroups){
    const groupDocs = [];
    for (const d of g.docs){
      const snapDoc = await db.collection('visit_entries').doc(d.id).get();
      groupDocs.push({ id: d.id, data: snapDoc.exists ? snapDoc.data() : null });
    }
    backup.groups.push({ ids: g.docs.map(x=>x.id), docs: groupDocs });
  }
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log('Backup written to', backupPath);

  dupGroups.forEach((g,i)=>{
    console.log(`Group ${i+1} (size ${g.docs.length}):`);
    g.docs.forEach(d=>{
      console.log(' -', d.id);
    });
    const rep = JSON.parse(g.key);
    console.log(' Representative (fields excluding server_id/createdAt/source_doc/id/_savedAt):');
    console.log(JSON.stringify(rep, null, 2));
  });

  if (!args.apply){
    console.log('Dry-run complete. Run with --apply --backup=<path> to delete duplicates (keeps first ID in each group).');
    return;
  }

  console.log('--apply provided — deleting duplicates (keep first in each group)');
  let deleted = 0, failed = 0;
  const dbForDelete = new Firestore(opts);
  for (const g of dupGroups){
    const ids = g.docs.map(x=>x.id);
    const keep = ids[0];
    const toDelete = ids.slice(1);
    for (const id of toDelete){
      try{
        await dbForDelete.collection('visit_entries').doc(id).delete();
        console.log('Deleted', id);
        deleted++;
      }catch(e){
        console.error('Failed delete', id, e && e.message);
        failed++;
      }
    }
  }
  console.log('SUMMARY', deleted, 'deleted,', failed, 'failed');

  // verification
  const verifySnap = await db.collection('visit_entries').where('visitDate','==',args.date).get();
  let remaining = 0;
  verifySnap.forEach(d=>{
    const data = d.data();
    const staffCandidates = [data.staff, data.staffToken, data.staffLabel, data.publisher].filter(Boolean);
    const matched = staffCandidates.some(x=>String(x).replace(/\s+/g,'').toLowerCase()===target);
    if (matched) remaining++;
  });
  console.log('Remaining docs for staff/date after deletion:', remaining);
}

main().catch(e=>{ console.error(e && e.stack || e); process.exit(2); });
