#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {Firestore} = require('@google-cloud/firestore');

function parseArgs(argv) {
  const out = {};
  argv.slice(2).forEach(a => {
    if (a === '--apply') out.apply = true;
    else if (a.startsWith('--staff=')) out.staff = a.split('=')[1];
    else if (a.startsWith('--date=')) out.date = a.split('=')[1];
    else if (a.startsWith('--backup=')) out.backup = a.split('=')[1];
    else if (a.startsWith('--project=')) out.project = a.split('=')[1];
  });
  return out;
}

function canonicalizeStaff(s) {
  if (!s) return '';
  return String(s).replace(/\s+/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.date || !args.staff) {
    console.error('Usage: node dedupe_visit_entries.js --staff=<StaffToken> --date=<YYYY-MM-DD> [--backup=path] [--apply] [--project=proj]');
    process.exit(1);
  }

  const firestoreOpts = {};
  if (args.project) firestoreOpts.projectId = args.project;
  const db = new Firestore(firestoreOpts);

  console.log('Querying visit_entries for visitDate=', args.date);
  const qSnap = await db.collection('visit_entries').where('visitDate', '==', args.date).get();
  console.log('Total docs matched by date:', qSnap.size);

  const targetStaffCanon = canonicalizeStaff(args.staff);
  const docs = [];
  qSnap.forEach(d => {
    const data = d.data();
    const staffCandidates = [data.staff, data.staffToken, data.staffLabel, data.publisher].filter(Boolean);
    const matched = staffCandidates.some(x => canonicalizeStaff(x) === targetStaffCanon);
    if (matched) docs.push({id: d.id, ref: d.ref, data});
  });

  console.log('Docs after staff filter:', docs.length);
  if (docs.length === 0) return;

  // Group by all fields except server_id and id
  const groups = new Map();
  for (const doc of docs) {
    const data = JSON.parse(JSON.stringify(doc.data || doc.data));
    // remove volatile fields
    delete data.server_id;
    delete data.id;
    delete data._savedAt;
    // deterministic stringify: sort keys
    const canonical = canonicalizeObject(data);
    const key = JSON.stringify(canonical);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc.id);
  }

  const duplicateGroups = [];
  for (const [k, ids] of groups.entries()) {
    if (ids.length > 1) duplicateGroups.push({key:k, ids});
  }

  console.log('Duplicate groups found:', duplicateGroups.length);

  const backupPath = args.backup || path.join('tools','backup', `dupe_candidates_${args.date.replace(/-/g,'')}_${Date.now()}.json`);
  ensureDir(path.dirname(backupPath));
  const backupData = {date: args.date, staff: args.staff, createdAt: new Date().toISOString(), groups: []};

  // Populate backup groups with full doc data
  for (const g of duplicateGroups) {
    const groupDocs = [];
    for (const id of g.ids) {
      const d = await db.collection('visit_entries').doc(id).get();
      groupDocs.push({id, data: d.exists ? d.data() : null});
    }
    backupData.groups.push({ids: g.ids, docs: groupDocs});
  }

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
  console.log('Backup written to', backupPath);

  if (!args.apply) {
    console.log('Dry-run complete. To delete duplicates run with --apply');
    duplicateGroups.forEach((g,i) => console.log(i+1, 'group size', g.ids.length, g.ids.join(', ')));
    return;
  }

  console.log('--apply provided — proceeding to delete duplicates (keep 1 per group)');
  let deleted = 0, failed = 0;
  for (const g of duplicateGroups) {
    const keep = g.ids[0];
    const toDelete = g.ids.slice(1);
    for (const id of toDelete) {
      try {
        await db.collection('visit_entries').doc(id).delete();
        console.log('Deleted', id);
        deleted++;
      } catch (err) {
        console.error('Failed delete', id, err && err.message);
        failed++;
      }
    }
  }

  console.log('SUMMARY', deleted, 'deleted,', failed, 'failed');

  const verifySnap = await db.collection('visit_entries').where('visitDate', '==', args.date).get();
  const remaining = [];
  verifySnap.forEach(d => {
    const data = d.data();
    const staffCandidates = [data.staff, data.staffToken, data.staffLabel, data.publisher].filter(Boolean);
    const matched = staffCandidates.some(x => canonicalizeStaff(x) === targetStaffCanon);
    if (matched) remaining.push({id:d.id, data});
  });
  console.log('Remaining docs for staff/date after deletion:', remaining.length);
}

function canonicalizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizeObject);
  const keys = Object.keys(obj).sort();
  const out = {};
  for (const k of keys) out[k] = canonicalizeObject(obj[k]);
  return out;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}

main().catch(err => { console.error(err && err.stack || err); process.exit(2); });
