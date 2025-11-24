/*
  update_staff_tokens.js

  Safe helper to normalize staff tokens in Firestore documents.
  Usage (dry-run):
    node update_staff_tokens.js --project=cmass-sales
  To apply changes (destructive):
    node update_staff_tokens.js --project=cmass-sales --apply

  Authentication:
  - The script uses Application Default Credentials (ADC) if available (e.g. gcloud auth application-default login)
  - Or provide a service account key JSON and set GOOGLE_APPLICATION_CREDENTIALS to its path.

  The script scans the 'visit_entries' collection and updates the 'staff' field
  to one of the canonical tokens: LimJunho, ChoYounghwan, Songhoonjae when a
  legacy variant is detected. It prints a dry-run report unless --apply is used.
*/

const { Firestore } = require('@google-cloud/firestore');
const argv = require('minimist')(process.argv.slice(2));

const mapping = {
  // English/lowercase variants
  'limjunho': 'LimJunho',
  'imjunho': 'LimJunho',
  'joyounghwan': 'ChoYounghwan',
  'choyounghwan': 'ChoYounghwan',
  'songhoonjae': 'SongHoonjae',
  'songhunje': 'SongHoonjae',
  'songhoojae': 'SongHoonjae',
  // Korean variants (common labels/roles)
  '송훈재': 'SongHoonjae',
  '송훈재 부장': 'SongHoonjae',
  '송훈재부장': 'SongHoonjae',
  '임준호': 'LimJunho',
  '임준호 차장': 'LimJunho',
  '임준호차장': 'LimJunho',
  '조영환': 'ChoYounghwan',
  '조영환 부장': 'ChoYounghwan',
  '조영환부장': 'ChoYounghwan'
};

// Map canonical token to the preferred Korean label for staffLabel field
const labelMap = {
  'SongHoonjae': '송훈재 부장',
  'LimJunho': '임준호 차장',
  'ChoYounghwan': '조영환 부장'
};

async function main(){
  const project = argv.project || process.env.GCLOUD_PROJECT || process.env.FIRESTORE_PROJECT || null;
  const apply = !!argv.apply;
  console.log('Starting update_staff_tokens.js', { project, apply });

  const opts = {};
  if (project) opts.projectId = project;
  const db = new Firestore(opts);

  const col = db.collection('visit_entries');
  const snapshot = await col.get();
  console.log('Documents fetched:', snapshot.size);

  const toUpdate = [];
  snapshot.forEach(doc => {
    const data = doc.data() || {};
    const raw = (data.staff || data.staffToken || data.staff_token || '').toString().trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const mapped = mapping[lower];
    if (mapped && mapped !== raw){
      // desired staffLabel from canonical token
      const desiredLabel = labelMap[mapped] || null;
      toUpdate.push({ id: doc.id, before: raw, after: mapped, staffLabel: desiredLabel });
    }
  });

  if (!toUpdate.length){
    console.log('No documents require staff normalization.');
    return;
  }

  console.log('\nDry-run report: documents to update:', toUpdate.length);
  toUpdate.slice(0,20).forEach(x => console.log(x));
  if (toUpdate.length > 20) console.log('(showing 20 of ' + toUpdate.length + ')');

  if (!apply){
    console.log('\nDry-run complete. To apply changes run with --apply (and ensure credentials are set).');
    return;
  }

  console.log('\nApplying changes...');
  let applied = 0;
  for (const item of toUpdate){
    try{
      const updatePayload = { staff: item.after };
      if (item.staffLabel) updatePayload.staffLabel = item.staffLabel;
      await db.collection('visit_entries').doc(item.id).update(updatePayload);
      applied++;
      console.log('Updated', item.id, item.before, '=>', item.after, item.staffLabel ? ('(label: ' + item.staffLabel + ')') : '');
    }catch(err){
      console.error('Failed to update', item.id, err && err.message);
    }
  }
  console.log('Apply complete. Updated count:', applied);
}

main().catch(err => { console.error('Fatal error', err && err.stack ? err.stack : err); process.exit(1); });
