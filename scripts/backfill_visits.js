// backfill_visits.js
// Usage (locally):
//   node scripts/backfill_visits.js --dry
//   node scripts/backfill_visits.js --idempotent --since=2025-01-01
// This script will read documents from `visits` collection and write per-subject
// documents into `visit_entries`.
// Cost-saving features added:
//  - --since=YYYY-MM-DD    : only process visits with visitDate >= given date
//  - --idempotent           : use deterministic doc IDs (source_doc_visitIndex_subjectIndex)
//                            and skip documents that already exist (reduces duplicate writes)
//  - --dry                 : report counts and samples without writing

const admin = require('firebase-admin');
const argv = require('minimist')(process.argv.slice(2));
const fs = require('fs');
const path = require('path');

// Simple file lock implementation using lockfile create (wx) with retries
function acquireLock(lockPath, retries = 5, waitMs = 500){
  for (let i=0;i<retries;i++){
    try{
      const fd = fs.openSync(lockPath, 'wx');
      fs.closeSync(fd);
      return true;
    }catch(e){
      // EEXIST -> wait and retry
      if (e.code === 'EEXIST'){
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
        continue;
      }
      throw e;
    }
  }
  return false;
}

function releaseLock(lockPath){
  try{ if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); }catch(e){ console.warn('releaseLock failed', e.message); }
}

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.warn('Warning: GOOGLE_APPLICATION_CREDENTIALS not set. If running locally, set it to a service account JSON for write access.');
}

admin.initializeApp();
const db = admin.firestore();

(async function main(){
  try{
  const dry = !!argv.dry;
  const idempotent = !!argv.idempotent;
  const since = argv.since ? new Date(argv.since) : null; // process visits with visitDate >= since
  const batchSize = argv['batchSize'] ? parseInt(argv['batchSize'],10) : 400;
  const checkpointFile = argv['checkpoint-file'] ? String(argv['checkpoint-file']) : path.join(process.cwd(), 'backfill_checkpoint.json');
  const resume = !!argv.resume;
  const manifestFile = argv.manifest ? String(argv.manifest) : null;
  let pricePer100kWrites = argv['price-writes'] ? parseFloat(argv['price-writes']) : 0.18; // USD per 100k writes default
  let pricePer100kReads = argv['price-reads'] ? parseFloat(argv['price-reads']) : 0.06; // USD per 100k reads default
    const useBillingApi = !!argv['use-billing-api'];

      // Helper: attempt to query Cloud Billing Catalog for Firestore read/write SKU prices
      async function fetchFirestorePrices(){
        try{
          const {google} = require('googleapis');
          const auth = new google.auth.GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-billing.readonly'] });
          const client = await auth.getClient();
          const cloudbilling = google.cloudbilling({ version: 'v1', auth: client });

          // List services and find Firestore-related services
          const servicesRes = await cloudbilling.services.list();
          const services = (servicesRes && servicesRes.data && servicesRes.data.services) || [];
          // Find candidates whose displayName mentions Firestore
          const candidates = services.filter(s => (s.displayName || '').toLowerCase().includes('firestore') || (s.displayName || '').toLowerCase().includes('cloud firestore'));
          if (candidates.length === 0){
            console.warn('Cloud Billing: no Firestore service found in services list; falling back to defaults');
            return null;
          }

          // We'll search SKUs under each candidate service for read/write operation SKUs
          let foundRead = null, foundWrite = null;
          for (const svc of candidates){
            const parent = svc.name; // e.g. services/...
            let pageToken = null;
            do {
              const skuRes = await cloudbilling.services.skus.list({ parent, pageToken, pageSize: 500 });
              const skus = (skuRes && skuRes.data && skuRes.data.skus) || [];
              for (const sku of skus){
                const desc = (sku.description || '').toLowerCase();
                const category = sku.category || {};
                const resourceFamily = (category.resourceFamily || '').toLowerCase();
                // Heuristics: look for 'read' or 'get' for reads, and 'write' or 'write operation' for writes
                if (!foundRead && (desc.includes('read') || desc.includes('get') || desc.includes('document read') || desc.includes('reads'))){
                  foundRead = sku;
                }
                if (!foundWrite && (desc.includes('write') || desc.includes('writes') || desc.includes('document write') || desc.includes('writes per') || desc.includes('write operation'))){
                  foundWrite = sku;
                }
                // Fallback based on resourceFamily
                if (!foundRead && resourceFamily.includes('storage') && desc.includes('read')) foundRead = sku;
                if (!foundWrite && resourceFamily.includes('storage') && desc.includes('write')) foundWrite = sku;
                if (foundRead && foundWrite) break;
              }
              pageToken = skuRes.data.nextPageToken;
              if (foundRead && foundWrite) break;
            } while(pageToken);
            if (foundRead && foundWrite) break;
          }

          function skuUnitPrice(sku){
            try{
              const pi = sku.pricingInfo && sku.pricingInfo[0];
              if (!pi) return null;
              const pe = pi.pricingExpression;
              if (!pe) return null;
              // pricingExpression.unitPrice has { units, nanos }
              const unitPrice = (pe.unitPrice && (parseFloat(pe.unitPrice.units || 0) + (parseFloat(pe.unitPrice.nanos || 0) / 1e9))) || null;
              return unitPrice;
            }catch(e){ return null; }
          }

          const readUnit = foundRead ? skuUnitPrice(foundRead) : null;
          const writeUnit = foundWrite ? skuUnitPrice(foundWrite) : null;
          // Prices from catalog might be per operation or per 1000 ops; we cannot be certain. We'll return unit prices and the SKU descriptions so caller can inspect.
          return {
            read: readUnit === null ? null : { unitPrice: readUnit, sku: foundRead },
            write: writeUnit === null ? null : { unitPrice: writeUnit, sku: foundWrite }
          };
        }catch(e){ console.warn('fetchFirestorePrices failed:', e.message); return null; }
      }

    console.log('Starting backfill visits -> visit_entries', dry ? '(DRY RUN)' : '', idempotent ? '(IDEMPOTENT)' : '');

    // Base query for visits
    let q = db.collection('visits').orderBy('createdAt', 'asc');
    if (argv.limit) q = q.limit(parseInt(argv.limit,10));
    // If resume + checkpoint exists, start after last processed doc
    if (resume && fs.existsSync(checkpointFile)){
      try{
        const cp = JSON.parse(fs.readFileSync(checkpointFile,'utf8'));
        if (cp && cp.last_processed_doc_id){
          const afterDocSnap = await db.collection('visits').doc(cp.last_processed_doc_id).get();
          if (afterDocSnap.exists) q = q.startAfter(afterDocSnap);
          console.log('Resuming after', cp.last_processed_doc_id, 'visitIndex:', cp.last_visit_index, 'subjectIndex:', cp.last_subject_index);
        }
      }catch(e){ console.warn('Could not read checkpoint file, starting from beginning:', e.message); }
    }
    const snap = await q.get();
    console.log('Found', snap.size, 'visits documents.');

  let total = 0;
  let pendingWrites = [];
  let sample = [];
  let lastProcessedDocId = null;
  let lastProcessedVisitIndex = null;
  let lastProcessedSubjectIndex = null;

    // Load manifest if provided (list of already-migrated deterministic IDs)
    let manifestSet = null;
    if (manifestFile){
      try{
        const raw = fs.readFileSync(manifestFile,'utf8');
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) manifestSet = new Set(arr);
        console.log('Loaded manifest with', manifestSet ? manifestSet.size : 0, 'entries from', manifestFile);
      }catch(e){ console.warn('Could not load manifest file:', e.message); manifestSet = null; }
    }

    for (const doc of snap.docs){
      const data = doc.data() || {};
      const visits = Array.isArray(data.visits) ? data.visits : [];
      for (let vi = 0; vi < visits.length; vi++){
        const v = visits[vi] || {};
        const vdRaw = v.visitDate || v.createdAt || null;
        const vd = vdRaw ? new Date(vdRaw) : null;
        if (since && vd && vd < since) {
          // Skip older than since
          continue;
        }
        const visitDateTs = vd && !isNaN(vd.getTime()) ? admin.firestore.Timestamp.fromDate(vd) : admin.firestore.Timestamp.now();
        const subjects = Array.isArray(v.subjects) && v.subjects.length ? v.subjects : (v.subject ? [v] : []);
        if (subjects.length === 0) subjects.push(v);
        for (let si = 0; si < subjects.length; si++){
          const s = subjects[si] || {};
          const entry = {
            staff: data.staff || '',
            school: v.school || data.school || '',
            region: v.region || data.region || '',
            visitDate: vd ? vd.toISOString() : '',
            visitDate_ts: visitDateTs,
            subject: (s.subject || s).toString().trim(),
            teacher: (s.teacher || '').toString().trim(),
            contact: (s.contact || '').toString().trim(),
            meetings: Array.isArray(s.meetings) ? s.meetings : (s.meetings ? [s.meetings] : []),
            conversation: (s.conversation || s.conversation_detail || s.note || '').toString().trim(),
            followUp: (s.followUp || '').toString().trim(),
            source_doc: doc.id,
            source_visitIndex: vi,
            source_subjectIndex: si,
            migratedAt: admin.firestore.FieldValue.serverTimestamp()
          };

          total++;
          if (sample.length < 5) sample.push(Object.assign({id: doc.id, vi, si}, entry));

            if (!dry){
              if (idempotent){
                // Create deterministic ID to allow existence checks and avoid duplicate writes
                const deterministId = `${doc.id}_${vi}_${si}`;
                // If a manifest was provided and contains this id, skip adding it to pendingWrites
                if (manifestSet && manifestSet.has(deterministId)){
                  // already present in manifest; skip
                } else {
                  pendingWrites.push({ id: deterministId, data: entry });
                }
              } else {
                pendingWrites.push({ id: null, data: entry });
              }
            }
            lastProcessedDocId = doc.id;
            // record last processed tuple
            lastProcessedVisitIndex = vi;
            lastProcessedSubjectIndex = si;
        }
      }
    }

    console.log('Total entries identified for creation:', total);
    console.log('Sample entries:', JSON.stringify(sample, null, 2));

    if (dry){
      // If requested, attempt to fetch region-specific pricing via Cloud Billing API
      if (useBillingApi){
        // Try to fetch Firestore SKU unit prices and compute per-100k estimates
        const skuRes = await fetchFirestorePrices();
        if (skuRes){
          const readUnit = skuRes.read && skuRes.read.unitPrice ? skuRes.read.unitPrice : null;
          const writeUnit = skuRes.write && skuRes.write.unitPrice ? skuRes.write.unitPrice : null;
          if (readUnit) console.log('Billing: detected Firestore read unit price (per unit):', readUnit, 'USD');
          if (writeUnit) console.log('Billing: detected Firestore write unit price (per unit):', writeUnit, 'USD');
          // Estimate per-100k
          const estRead100k = readUnit ? readUnit * 100000 : null;
          const estWrite100k = writeUnit ? writeUnit * 100000 : null;
          if (estRead100k) console.log('Estimated read cost per 100k ops:', estRead100k.toFixed(6), 'USD');
          if (estWrite100k) console.log('Estimated write cost per 100k ops:', estWrite100k.toFixed(6), 'USD');
          // Override pricePer100k* if we found values
          if (estWrite100k) pricePer100kWrites = estWrite100k;
          if (estRead100k) pricePer100kReads = estRead100k;
        } else {
          console.warn('Billing API: could not detect SKU prices, falling back to default price overrides');
        }
      }
      // Estimate reads for dry-run: visits docs read + existence-check reads (if idempotent and no manifest)
      const existenceChecks = (idempotent && !manifestSet) ? pendingWrites.length : 0;
      const estimatedReads = snap.size + existenceChecks;
      const estimatedWrites = total;
      const costWrites = estimatedWrites * (pricePer100kWrites/100000);
      const costReads = estimatedReads * (pricePer100kReads/100000);
      console.log('Dry-run complete. No documents written.');
      console.log('Estimated writes:', estimatedWrites, 'Estimated reads:', estimatedReads);
      console.log('\nEstimated cost (USD): writes=', costWrites.toFixed(6), 'reads=', costReads.toFixed(6), 'total=', (costWrites+costReads).toFixed(6));
      console.log('If you want more accurate region-based pricing, re-run with --price-writes and --price-reads to override defaults.');
      return;
    }

  // If idempotent, check which deterministic IDs already exist to skip them
    let toWrite = [];
    if (idempotent){
      if (manifestSet){
        // If we have a manifest, we already skipped manifest entries when building pendingWrites
        toWrite = pendingWrites;
        console.log('Using manifest to skip existence checks. To write:', toWrite.length);
      } else {
        console.log('Idempotent mode: checking existing documents to avoid duplicate writes...');
        const chunkSize = 200; // smaller chunk to avoid too many refs
        for (let i=0; i<pendingWrites.length; i+=chunkSize){
          const chunk = pendingWrites.slice(i, i+chunkSize);
          const refs = chunk.map(p => db.collection('visit_entries').doc(p.id));
          const snaps = await db.getAll(...refs);
          for (let j=0;j<chunk.length;j++){
            const existing = snaps[j];
            if (existing && existing.exists){
              // skip
            } else {
              toWrite.push(chunk[j]);
            }
          }
        }
        console.log('Existing entries skipped. To write:', toWrite.length);
      }
    } else {
      toWrite = pendingWrites;
    }

    // Commit in batches
    let committed = 0;
    // Prepare manifest append if manifestFile provided
    let manifestAppend = manifestSet ? [] : null;
    for (let i=0; i<toWrite.length; i+=batchSize){
      const batch = db.batch();
      const chunk = toWrite.slice(i, i+batchSize);
      for (const p of chunk){
        const docRef = p.id ? db.collection('visit_entries').doc(p.id) : db.collection('visit_entries').doc();
        batch.set(docRef, p.data, { merge: false });
      }
      await batch.commit();
      committed += chunk.length;
      console.log('Committed batch', Math.min(i+batchSize, toWrite.length), '/', toWrite.length);

      // Update checkpoint after each committed batch for resume safety
      try{
        const cpData = { last_processed_doc_id: lastProcessedDocId, last_visit_index: lastProcessedVisitIndex, last_subject_index: lastProcessedSubjectIndex, committed: committed, timestamp: (new Date()).toISOString() };
        // atomic write of checkpoint: write to temp then rename
        const tmpCp = checkpointFile + '.tmp';
        fs.writeFileSync(tmpCp, JSON.stringify(cpData, null, 2), 'utf8');
        fs.renameSync(tmpCp, checkpointFile);
      }catch(e){ console.warn('Could not write checkpoint file:', e.message); }

      // Append to manifest file progressively if requested
      if (manifestFile && manifestAppend !== null){
        for (const p of chunk){ if (p.id) manifestAppend.push(p.id); }
        // flush manifest append to disk atomically using lock
        try{
          const lockPath = manifestFile + '.lock';
          const got = acquireLock(lockPath, 10, 200);
          if (!got) console.warn('Could not acquire manifest lock, skipping manifest write this round');
          else{
            try{
              const existingArr = manifestSet ? Array.from(manifestSet) : [];
              const merged = existingArr.concat(manifestAppend);
              const tmp = manifestFile + '.tmp';
              fs.writeFileSync(tmp, JSON.stringify(merged, null, 2), 'utf8');
              fs.renameSync(tmp, manifestFile);
              manifestSet = new Set(merged);
              manifestAppend = [];
            }finally{ releaseLock(lockPath); }
          }
        }catch(e){ console.warn('Could not write manifest file:', e.message); }
      }
    }

    console.log('Backfill completed. Total created:', committed, 'skipped:', total - (dry ? 0 : committed));
  }catch(err){ console.error('Backfill failed', err); process.exit(2); }
})();
