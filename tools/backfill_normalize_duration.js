#!/usr/bin/env node
/**
 * Backfill script: normalize `duration` fields in Firestore.
 *
 * - Scans `visit_entries` and `visits` collections.
 * - For each entry/visit object where `duration` is not a numeric minutes value,
 *   it will parse an integer minute value from existing text (e.g. "90분", "1시간 20분", "약 30분")
 *   and write it into `duration` (Number) and preserve the original string into `duration_label`.
 * - By default runs as dry-run and prints a summary. Use --apply to perform updates.
 *
 * Usage:
 *   node tools/backfill_normalize_duration.js --maxDocs=5000 --batchSize=500 --apply
 *
 * Notes:
 * - The script uses the Firebase Admin SDK. Configure credentials via one of the usual methods:
 *   - Set GOOGLE_APPLICATION_CREDENTIALS pointing to a service account JSON key
 *   - Or run on a machine with `gcloud auth application-default login` or with appropriate environment
 * - Recommended: run with --apply=false (or omit --apply) first to inspect the dry-run report.
 */

const admin = require('firebase-admin');
const path = require('path');

// Minimal arg parsing
const argv = require('minimist')(process.argv.slice(2), { boolean: ['apply'], default: { apply: false, batchSize: 500, maxDocs: 5000 } });
const APPLY = !!argv.apply;
const BATCH = Math.max(100, Math.min(1000, Number(argv.batchSize) || 500));
const MAX_DOCS = Math.max(100, Number(argv.maxDocs) || 5000);

console.log('\nBackfill normalize duration — start');
console.log('apply:', APPLY, 'batchSize:', BATCH, 'maxDocs:', MAX_DOCS);

// Initialize admin SDK (default application credentials)
try {
  admin.initializeApp();
} catch (e) {
  // already initialized in some environments
}
const db = admin.firestore();

function parseDurationToMinutes(s) {
  if (s === null || s === undefined) return null;
  if (typeof s === 'number') return Number(s);
  let str = String(s || '').trim();
  if (!str) return null;
  str = str.replace(/,/g, '');

  // Patterns: 1시간 20분, 1시간, 20분, 1.5시간, 90분, "약 30분"
  const hourMatch = str.match(/(\d+(?:[\.,]\d+)?)\s*시간/);
  const minMatch = str.match(/(\d+)\s*분/);
  if (hourMatch) {
    const h = parseFloat(hourMatch[1].replace(',', '.'));
    if (!isNaN(h)) {
      let mins = Math.round(h * 60);
      // if also explicit minutes exist, add them
      if (minMatch) {
        const m = parseInt(minMatch[1], 10);
        if (!isNaN(m)) mins += m;
      }
      return mins;
    }
  }
  if (minMatch) {
    const m = parseInt(minMatch[1], 10);
    if (!isNaN(m)) return m;
  }

  // Fallback: find any number and treat as minutes. Prefer numbers <= 240
  const anyNum = str.match(/(\d{1,4})/);
  if (anyNum) {
    const n = parseInt(anyNum[1], 10);
    if (!isNaN(n)) {
      // if looks like hours (1-4) and the string has 'h' or 'hr', convert
      if (n <= 4 && /\b(h|hr|hours?)\b/i.test(str)) return n * 60;
      // if value is > 240 (unlikely minutes), treat as null
      if (n > 0 && n <= 24) {
        // ambiguous small number (1..24) — if the string contains '시간' we would have matched earlier
        // assume minutes otherwise
        return n;
      }
      if (n > 24 && n <= 6000) return n; // assume minutes when reasonably sized
    }
  }
  return null;
}

function makeUpdateForDocData(data) {
  // Returns null if no update required, otherwise returns the update object
  const upd = {};
  // data.duration may be number or string; data.duration_label may or may not exist
  const dur = data.duration;
  const label = data.duration_label;

  // If duration is already a number, nothing to do
  if (typeof dur === 'number') return null;

  // Try to determine originalLabel
  let originalLabel = null;
  if (label && typeof label === 'string' && label.trim()) originalLabel = label;
  else if (typeof dur === 'string' && dur.trim()) originalLabel = dur;

  const parsed = parseDurationToMinutes(originalLabel || dur || label || '');

  // Only set duration (numeric) and duration_label if parsed !== undefined
  if (parsed !== null && parsed !== undefined) {
    upd.duration = parsed;
    if (!originalLabel && typeof dur === 'string' && dur.trim()) upd.duration_label = dur;
    if (!originalLabel && !dur && label) upd.duration_label = label;
    // If duration_label exists already but duration missing, still set duration
  } else {
    // Could not parse numeric minutes. If duration exists as a string and duration_label not set, save it as label and set duration=null
    if (typeof dur === 'string' && dur.trim()) {
      upd.duration = null;
      upd.duration_label = dur;
    } else if (!('duration' in data) && label && typeof label === 'string') {
      // legacy only duration_label
      upd.duration = parseDurationToMinutes(label);
      // may be null
    } else {
      return null; // nothing to do
    }
  }
  return upd;
}

async function processVisitEntries() {
  console.log('\nProcessing collection: visit_entries');
  let processed = 0;
  let updates = 0;
  let samples = [];
  let last = null;
  while (processed < MAX_DOCS) {
    let q = db.collection('visit_entries').orderBy('visitDate_ts', 'desc').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      processed++;
      const data = doc.data() || {};
      const upd = makeUpdateForDocData(data);
      if (upd) {
        updates++;
        samples.push({ id: doc.id, before: { duration: data.duration, duration_label: data.duration_label }, after: upd });
        if (APPLY) {
          try { await doc.ref.update(upd); } catch (e) { console.warn('Failed update visit_entry', doc.id, e.message || e); }
        }
      }
      last = doc;
      if (processed >= MAX_DOCS) break;
    }
    if (snap.size < BATCH) break;
  }
  console.log(`visit_entries scanned=${processed}, updates=${updates}`);
  return { scanned: processed, updates, samples: samples.slice(0,8) };
}

async function processAggregatedVisits() {
  console.log('\nProcessing collection: visits (aggregated docs)');
  let processedDocs = 0;
  let updatedDocs = 0;
  let updatedVisits = 0;
  let samples = [];
  let last = null;
  while (processedDocs < MAX_DOCS) {
    let q = db.collection('visits').orderBy('createdAt', 'desc').limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      processedDocs++;
      const data = doc.data() || {};
      const vs = Array.isArray(data.visits) ? data.visits : [];
      let changed = false;
      const newVisits = vs.map(v => {
        if (!v) return v;
        // v.duration may be number/string
        const upd = makeUpdateForDocData(v);
        if (upd) {
          changed = true;
          updatedVisits++;
          // apply updates onto a shallow clone of v
          return Object.assign({}, v, upd);
        }
        return v;
      });
      if (changed) {
        updatedDocs++;
        samples.push({ id: doc.id, visitsChanged: newVisits.length });
        if (APPLY) {
          try { await doc.ref.update({ visits: newVisits }); } catch (e) { console.warn('Failed update visits doc', doc.id, e.message || e); }
        }
      }
      last = doc;
      if (processedDocs >= MAX_DOCS) break;
    }
    if (snap.size < BATCH) break;
  }
  console.log(`visits scannedDocs=${processedDocs}, docsUpdated=${updatedDocs}, visitsUpdated=${updatedVisits}`);
  return { scannedDocs: processedDocs, docsUpdated: updatedDocs, visitsUpdated: updatedVisits, samples: samples.slice(0,8) };
}

(async function main(){
  try {
    const resEntries = await processVisitEntries();
    const resAgg = await processAggregatedVisits();

    console.log('\n==== Summary ====');
    console.log('APPLY mode:', APPLY ? 'ENABLED (writes performed)' : 'DRY-RUN (no writes)');
    console.log('visit_entries: scanned=', resEntries.scanned, 'updates=', resEntries.updates);
    console.log('visits (aggregated): scannedDocs=', resAgg.scannedDocs, 'docsUpdated=', resAgg.docsUpdated, 'visitsUpdated=', resAgg.visitsUpdated);
    if (resEntries.samples && resEntries.samples.length) {
      console.log('\nSample visit_entries changes:');
      resEntries.samples.forEach(s => console.log(JSON.stringify(s)));
    }
    if (resAgg.samples && resAgg.samples.length) {
      console.log('\nSample visits docs changed:');
      resAgg.samples.forEach(s => console.log(JSON.stringify(s)));
    }
    console.log('\nDone.');
    process.exit(0);
  } catch (err) {
    console.error('Fatal error', err && err.stack ? err.stack : err);
    process.exit(2);
  }
})();
