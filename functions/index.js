const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '1mb' }));

// Cached mapping of school name -> region loaded from the hosted CSV
let schoolRegionMap = {};
let schoolRegionLastLoad = 0;
const SCHOOL_REGION_TTL_MS = 1000 * 60 * 60; // 1 hour cache
async function parseCsvLines(text){
  const out = [];
  let cur = '';
  let inQuotes = false;
  let row = [];
  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    if (ch === '"'){
      if (inQuotes && i+1 < text.length && text[i+1] === '"'){
        cur += '"'; i++; continue;
      }
      inQuotes = !inQuotes; continue;
    }
    if (!inQuotes && (ch === '\n' || ch === '\r')){
      if (ch === '\r' && i+1 < text.length && text[i+1] === '\n') { i++; }
      row.push(cur); cur = ''; out.push(row); row = []; continue;
    }
    if (!inQuotes && ch === ',') { row.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '' || inQuotes || row.length) { row.push(cur); out.push(row); }
  return out.map(r => r.map(c => c.replace(/^\uFEFF/, '').trim()));
}

async function ensureSchoolRegionMap(){
  try {
    const now = Date.now();
    if (schoolRegionLastLoad && (now - schoolRegionLastLoad) < SCHOOL_REGION_TTL_MS) return;
    const csvUrl = 'https://cmass-sales.web.app/sales_staff.csv';
    const resp = await fetch(csvUrl);
    if (!resp.ok) throw new Error('failed to fetch CSV: ' + resp.status);
    const txt = await resp.text();
    const rows = await parseCsvLines(txt);
    if (!rows || !rows.length) return;
    const header = rows[0] || [];
    const idxSchool = header.findIndex(h => /학교명|학교|school/i.test(h));
    const idxRegion = header.findIndex(h => /지역|region/i.test(h));
    const map = Object.create(null);
    if (idxSchool >= 0 && idxRegion >= 0){
      for (let i = 1; i < rows.length; i++){
        const cols = rows[i] || [];
        if (!cols || cols.length <= Math.max(idxSchool, idxRegion)) continue;
        const school = (cols[idxSchool] || '').trim();
        const region = (cols[idxRegion] || '').trim();
        if (school) map[school] = region || map[school] || '';
      }
    }
    schoolRegionMap = map; schoolRegionLastLoad = now;
    console.log('schoolRegionMap loaded, keys:', Object.keys(schoolRegionMap).length);
  } catch (e) { console.warn('ensureSchoolRegionMap failed', e && e.message); }
}

// Hosting rewrites to a function may forward the original path including the
// '/api' prefix (for example '/api/pin-check'). Normalize incoming requests
// by stripping a leading '/api' path segment so the internal express routes
// (which are defined as '/pin-check' and '/visits') continue to match.
app.use((req, res, next) => {
  try {
    if (req.path && req.path.indexOf('/api/') === 0) {
      req.url = req.url.replace(/^\/api/, '');
    }
  } catch (e) {
    // non-fatal, continue
  }
  return next();
});

// Temporary debug logger: log minimal info about incoming requests so we can
// diagnose 403s observed from browser clients. Keep output compact.
app.use((req, res, next) => {
  try {
    const info = {
      method: req.method,
      originalUrl: req.originalUrl,
      path: req.path,
      host: req.get('host'),
      origin: req.get('origin') || null,
      referer: req.get('referer') || null,
      ua: (req.get('user-agent') || '').slice(0, 120)
    };
    console.log('REQ_DEBUG', JSON.stringify(info));
  } catch (e) {
    console.log('REQ_DEBUG error', e && e.message);
  }
  return next();
});

// Health
app.get('/', (req, res) => res.json({ ok: true, service: 'cmass-sales-api' }));

// GET /visits - return recent visits (supports ?limit=N)
app.get('/visits', async (req, res) => {
  try {
    // Support two modes:
    // - legacy: query the top-level `visits` documents which contain an array of visits
    // - entries: query `visit_entries` collection where each saved subject/visit is its own document
    const useEntries = String(req.query.useEntries || 'false').toLowerCase() === 'true';
    const pageSize = Math.min(500, Math.max(1, parseInt(req.query.pageSize || req.query.limit || '100')));
    const cursor = req.query.cursor || null; // expected as encodeURIComponent("<ISO>|<docId>")
    const staffParam = req.query.staff || null;
    const subject = req.query.subject || null;
    const start = req.query.start || null;
    const end = req.query.end || null;

    if (useEntries) {
      // Query per-visit entries with indexed filters where possible
      let q = db.collection('visit_entries');
      // Ensure we have a timestamp field for ordering: visitDate_ts (Firestore Timestamp)
      q = q.orderBy('visitDate_ts', 'desc').orderBy(admin.firestore.FieldPath.documentId(), 'desc').limit(pageSize);

      // apply simple equality filters (these are index-friendly)
      if (staffParam) q = q.where('staff', '==', staffParam);
      if (subject) q = q.where('subject', '==', subject);
      if (start) {
        const sDate = new Date(start);
        if (!isNaN(sDate.getTime())) q = q.where('visitDate_ts', '>=', admin.firestore.Timestamp.fromDate(new Date(sDate.getFullYear(), sDate.getMonth(), sDate.getDate())));
      }
      if (end) {
        const eDate = new Date(end);
        if (!isNaN(eDate.getTime())){
          const eEx = new Date(eDate.getFullYear(), eDate.getMonth(), eDate.getDate()+1);
          q = q.where('visitDate_ts', '<', admin.firestore.Timestamp.fromDate(eEx));
        }
      }

      // apply cursor-based pagination if present
      if (cursor) {
        try {
          const dec = decodeURIComponent(cursor);
          const parts = dec.split('|');
          if (parts.length === 2) {
            const dt = new Date(parts[0]);
            const docId = parts[1];
            if (!isNaN(dt.getTime()) && docId) {
              q = q.startAfter(admin.firestore.Timestamp.fromDate(dt), docId);
            }
          }
        } catch (e) { /* ignore bad cursor */ }
      }

      const snap = await q.get();
      const rows = [];
      snap.forEach(doc => {
        const data = doc.data() || {};
        // convert visitDate_ts to ISO for clients
        if (data.visitDate_ts && data.visitDate_ts.toDate) data.visitDate = data.visitDate_ts.toDate().toISOString();
        rows.push(Object.assign({ id: doc.id }, data));
      });

      // nextCursor if paginated
      let nextCursor = null;
      if (rows.length === pageSize) {
        const last = rows[rows.length-1];
        const time = last.visitDate || (last.visitDate_ts && last.visitDate_ts.toDate && last.visitDate_ts.toDate().toISOString()) || '';
        if (time) nextCursor = encodeURIComponent(time + '|' + last.id);
      }

      return res.json({ ok: true, rows, nextCursor });
    }

    // legacy mode: query top-level visits documents (each document contains visits[])
    const qLimit = pageSize;
    let q = db.collection('visits').orderBy('createdAt', 'desc').limit(qLimit);
    if (cursor) {
      try{
        const dec = decodeURIComponent(cursor);
        const parts = dec.split('|');
        if (parts.length === 2) {
          const dt = new Date(parts[0]);
          const docId = parts[1];
          if (!isNaN(dt.getTime()) && docId) q = q.startAfter(admin.firestore.Timestamp.fromDate(dt), docId);
        }
      }catch(e){ /* ignore */ }
    }
    const snap = await q.get();
    const rows = [];
    snap.forEach(doc => {
      const data = doc.data();
      if (data && data.createdAt && data.createdAt.toDate) data.createdAt = data.createdAt.toDate().toISOString();
      rows.push(Object.assign({ id: doc.id }, data));
    });

    // apply post-filtering (as before) on legacy aggregated documents
    function inDateRange(visitDateStr){
      if (!visitDateStr) return false;
      try{ const d = new Date(visitDateStr); if (isNaN(d.getTime())) return false; if (start){ const s = new Date(start); if (isNaN(s.getTime())) return false; if (d < new Date(s.getFullYear(), s.getMonth(), s.getDate())) return false; } if (end){ const e = new Date(end); if (isNaN(e.getTime())) return false; const eEnd = new Date(e.getFullYear(), e.getMonth(), e.getDate()+1); if (d >= eEnd) return false; } return true; }catch(e){ return false; }
    }

    if (!start && !end && !subject && !staffParam) {
      // include nextCursor for legacy paging as well
      let nextCursor = null;
      if (rows.length === qLimit) {
        const last = rows[rows.length-1];
        if (last && last.createdAt) nextCursor = encodeURIComponent(last.createdAt + '|' + last.id);
      }
      return res.json({ ok: true, rows, nextCursor });
    }

    const filteredDocs = [];
    for (const doc of rows){
      try{
        if (staffParam){
          const sRaw = (doc.staff || '').toString();
          const sNorm = sRaw.replace(/\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)/g,'').trim();
          const qNorm = staffParam.toString().replace(/\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)/g,'').trim();
          if (!(sRaw === staffParam || sNorm === qNorm || sRaw.indexOf(qNorm) !== -1)){ continue; }
        }
        if (!doc.visits || !Array.isArray(doc.visits)) continue;
        const matchedVisits = doc.visits.filter(v => {
          const vDate = v.visitDate || v.createdAt || null;
          if (start || end){ if (!inDateRange(vDate)) return false; }
          if (subject){ const subs = v.subjects || (v.visits || []).map(x=>({ subject: x.subject })); if (!subs || !subs.length) return false; const has = subs.some(s => (s.subject||'').toString().trim() === subject.toString().trim()); if (!has) return false; }
          return true;
        });
        if (matchedVisits.length) { const copy = Object.assign({}, doc); copy.visits = matchedVisits; filteredDocs.push(copy); }
      }catch(e){ /* ignore doc errors */ }
    }

    return res.json({ ok: true, rows: filteredDocs });
  } catch (err) {
    console.error('get visits error', err);
    return res.status(500).json({ ok: false, msg: err.message || 'server error' });
  }
});

// POST /visits - save visits payload
app.post('/visits', async (req, res) => {
  try {
    const payload = req.body || {};
    const staff = (payload.staff || '').toString().trim();
    // allow callers to explicitly send an empty array to indicate deletion of the
    // aggregated document for the staff+date. If visits is undefined, treat as a
    // normal upsert path below; if it's an empty array, perform deletion/cleanup.
    const visits = (typeof payload.visits === 'undefined') ? null : payload.visits;

    if (Array.isArray(visits) && visits.length === 0) {
      // Deletion request: determine representative date (YYYY-MM-DD) from
      // payload.repDate, payload.visitDate, payload.ymd or fall back to KST today.
      let repDateIso = null;
      try {
        if (payload.repDate) repDateIso = String(payload.repDate).trim();
        else if (payload.ymd) repDateIso = String(payload.ymd).trim();
        else if (payload.visitDate) {
          const vd = new Date(payload.visitDate);
          if (!isNaN(vd.getTime())) {
            const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
            const seoul = new Date(vd.getTime() + KST_OFFSET_MS);
            const y = seoul.getFullYear(); const m = String(seoul.getMonth()+1).padStart(2,'0'); const d = String(seoul.getDate()).padStart(2,'0');
            repDateIso = `${y}-${m}-${d}`;
          }
        }
      } catch (e) { repDateIso = null; }

      if (!repDateIso) {
        const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
        const now = new Date(Date.now() + KST_OFFSET_MS);
        repDateIso = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      }

      if (!staff) return res.status(400).json({ ok: false, msg: 'staff required to delete aggregated doc' });

      const staffSafe = String(staff || '').trim() || 'anon';
      const staffEnc = encodeURIComponent(staffSafe).replace(/\./g, '%2E');
      const docId = `daily|${staffEnc}|${repDateIso}`;

      // delete visit_entries referencing this doc id
      try {
        const delBatchSize = 400;
        let last = null;
        while (true) {
          let q = db.collection('visit_entries').where('source_doc', '==', docId).limit(delBatchSize);
          if (last) q = q.startAfter(last);
          const snap = await q.get();
          if (!snap || snap.empty) break;
          let b = db.batch(); let ops = 0;
          for (const d of snap.docs) { b.delete(d.ref); ops++; }
          if (ops > 0) await b.commit();
          last = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < delBatchSize) break;
        }
      } catch (e) {
        console.warn('failed to delete existing visit_entries for docId (delete-request)', docId, e && e.message);
      }

      // delete aggregated visits document itself
      try {
        await db.collection('visits').doc(docId).delete();
      } catch (e) {
        console.warn('failed deleting aggregated doc for delete-request', docId, e && e.message);
      }

      return res.json({ ok: true, deleted: true, id: docId });
    }

    // basic aggregated document (backwards-compatible)
    // include any client-provided summary so the final report text is persisted
    const doc = {
      staff: String(staff || '').trim(),
      visits,
      summary: (payload.summary || payload.generatedSummary || '') ,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

  // Enforce: one final submission per staff per visit-date.
    // Use a deterministic document id derived from staff + visit date (KST) so
    // repeated saves for the same staff+date overwrite the previous aggregated
    // document. This reduces race conditions and ensures the most recent save
    // becomes the single source of truth.
    // Determine the representative visit date from the first visit item.
    const KST_OFFSET_MS = 9 * 60 * 60 * 1000; // +9 hours
    let repDateIso = null;
  let ref = null;
  try {
      const first = Array.isArray(visits) && visits.length ? visits[0] : null;
      const raw = first && (first.visitDate || first.createdAt) ? (first.visitDate || first.createdAt) : null;
      const vd = raw ? new Date(raw) : new Date();
      const seoul = new Date(vd.getTime() + KST_OFFSET_MS);
      const y = seoul.getFullYear(); const m = String(seoul.getMonth()+1).padStart(2,'0'); const d = String(seoul.getDate()).padStart(2,'0');
      const ymd = `${y}-${m}-${d}`;
      repDateIso = ymd;
      // create a deterministic doc id (safe-encode staff)
      const staffSafe = String(staff || '').trim() || 'anon';
      const staffEnc = encodeURIComponent(staffSafe).replace(/\./g,'%2E');
      const docId = `daily|${staffEnc}|${ymd}`;

      // Before writing, remove any existing visit_entries that reference this doc id
      try {
        const delBatchSize = 400;
        let last = null;
        while (true) {
          let q = db.collection('visit_entries').where('source_doc', '==', docId).limit(delBatchSize);
          if (last) q = q.startAfter(last);
          const snap = await q.get();
          if (!snap || snap.empty) break;
          let b = db.batch(); let ops = 0;
          for (const d of snap.docs) { b.delete(d.ref); ops++; }
          if (ops > 0) await b.commit();
          last = snap.docs[snap.docs.length - 1];
          if (snap.docs.length < delBatchSize) break;
        }
      } catch (e) {
        console.warn('failed to delete existing visit_entries for docId', docId, e && e.message);
      }

      // Write aggregated document with deterministic id (overwrites previous)
      const docRef = db.collection('visits').doc(docId);
      // ensure createdAt is set to server time for this save
      doc.createdAt = admin.firestore.FieldValue.serverTimestamp();
      await docRef.set(doc, { merge: false });
      ref = docRef; // keep compatibility with later code using ref.id
    } catch (e) {
      console.warn('deterministic save failed, falling back to add()', e && e.message);
      ref = await db.collection('visits').add(doc);
      // Note: in fallback case we don't attempt to remove previous entries; previous
      // cleanup may still exist from historic saves.
    }

    // Cleanup: remove any other aggregated documents for this staff that contain
    // visits for the same representative date (repDateIso) to avoid duplicates
    // like the U1Fm... / 4V7AA... case. For each such doc, delete its visit_entries
    // and then remove the aggregated document itself.
    try {
      if (repDateIso && staff) {
        const scanQ = db.collection('visits').where('staff', '==', staff).limit(1000);
        const scanSnap = await scanQ.get();
        for (const docSnap of scanSnap.docs) {
          try {
            if (!docSnap || !docSnap.exists) continue;
            const docId = docSnap.id;
            if (ref && docId === ref.id) continue; // skip the doc we just wrote
            const data = docSnap.data() || {};
            const arr = Array.isArray(data.visits) ? data.visits : [];
            let hasMatch = false;
            for (const v of arr) {
              try {
                const vraw = v.visitDate || v.createdAt || null;
                if (!vraw) continue;
                const vd = new Date(vraw);
                if (isNaN(vd.getTime())) continue;
                const seoul = new Date(vd.getTime() + KST_OFFSET_MS);
                const y = seoul.getFullYear(); const m = String(seoul.getMonth()+1).padStart(2,'0'); const d = String(seoul.getDate()).padStart(2,'0');
                const ymd = `${y}-${m}-${d}`;
                if (ymd === repDateIso) { hasMatch = true; break; }
              } catch (e) { continue; }
            }
            if (hasMatch) {
              // delete visit_entries referencing this doc id
              try {
                const delBatchSize = 400; let last = null;
                while (true) {
                  let q = db.collection('visit_entries').where('source_doc', '==', docId).limit(delBatchSize);
                  if (last) q = q.startAfter(last);
                  const snap = await q.get();
                  if (!snap || snap.empty) break;
                  let b = db.batch(); let ops = 0;
                  for (const d of snap.docs) { b.delete(d.ref); ops++; }
                  if (ops > 0) await b.commit();
                  last = snap.docs[snap.docs.length - 1];
                  if (snap.docs.length < delBatchSize) break;
                }
              } catch (e) { console.warn('failed cleaning entries for old doc', docId, e && e.message); }
              // delete aggregated doc
              try { await db.collection('visits').doc(docId).delete(); } catch (e) { console.warn('failed deleting old aggregated doc', docId, e && e.message); }
            }
          } catch (e) { /* ignore per-doc errors */ }
        }
      }
    } catch (e) {
      console.warn('post-save cleanup failed', e && e.message);
    }

    // Also write per-visit entries into `visit_entries` for better queryability.
    // Each subject within a visit becomes one document.
    // Use batched writes with safe batch size.
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let ops = 0;
    let createdCount = 0;
    for (const v of visits){
      // determine a visit-level date
      const vdRaw = v.visitDate || v.createdAt || new Date().toISOString();
      const vd = new Date(vdRaw);
      const visitDateTs = isNaN(vd.getTime()) ? admin.firestore.Timestamp.now() : admin.firestore.Timestamp.fromDate(vd);
      const base = {
        staff: staff,
        school: v.school || '',
        region: v.region || '',
        visitDate: (!isNaN(vd.getTime()) ? vd.toISOString() : ''),
        visitDate_ts: visitDateTs,
        // copy visit time metadata so per-entry docs include the same timing info
        visitStart: (typeof v.visitStart !== 'undefined') ? String(v.visitStart) : '',
        visitEnd: (typeof v.visitEnd !== 'undefined') ? String(v.visitEnd) : '',
        // Normalize duration: try extracting numeric minutes from strings like '50분' or '약 50',
        // store numeric minutes in `duration` (Number) and preserve original label in `duration_label` when present.
        // This avoids storing NaN in Firestore.
        duration: (function(raw){
          try{
            if (raw === undefined || raw === null || raw === '') return null;
            if (typeof raw === 'number' && isFinite(raw)) return Math.floor(raw);
            const s = String(raw || '');
            const m = s.match(/(\d+)/);
            if (m) return Number(m[1]);
            const n = Number(s);
            return isFinite(n) ? Math.floor(n) : null;
          }catch(e){ return null; }
        })(v.duration),
        duration_label: (typeof v.duration === 'string' && v.duration) ? String(v.duration) : ((typeof v.duration === 'number' && isFinite(v.duration)) ? String(v.duration) : ''),
        source_doc: ref.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      };

      // subjects array expected; if missing, treat the visit as a single implicit subject
      const subjects = Array.isArray(v.subjects) && v.subjects.length ? v.subjects : (v.subject ? [v] : []);
      for (const s of subjects){
        const entry = Object.assign({}, base, {
          subject: (s.subject || '').toString().trim(),
          teacher: (s.teacher || '').toString().trim(),
          contact: (s.contact || '').toString().trim(),
          meetings: Array.isArray(s.meetings) ? s.meetings : (s.meetings ? [s.meetings] : []),
          conversation: (s.conversation || s.conversation_detail || s.note || '').toString().trim(),
          followUp: (s.followUp || '').toString().trim()
        });
        const docRef = db.collection('visit_entries').doc();
        batch.set(docRef, entry);
        ops++; createdCount++;
        if (ops >= BATCH_SIZE){
          await batch.commit();
          batch = db.batch(); ops = 0;
        }
      }
    }
    if (ops > 0) await batch.commit();

    return res.json({ ok: true, id: ref.id, inserted: createdCount });
  } catch (err) {
    console.error('save visits error', err);
    return res.status(500).json({ ok: false, msg: err.message || 'server error' });
  }
});

// POST /visits/patch_school - admin helper to replace school names inside stored visits
app.post('/visits/patch_school', async (req, res) => {
  try {
    const body = req.body || {};
    const oldSchool = (body.old_school || '').toString().trim();
    const newSchool = (body.new_school || '').toString().trim();
    if (!oldSchool || !newSchool) return res.status(400).json({ ok: false, msg: 'old_school and new_school required' });

    const staffQ = body.staff || null;
    const visitDateQ = body.visit_date || null; // expect YYYY-MM-DD or ISO
    const teacherQ = body.teacher || null;
    const visitStartQ = body.visitStart || null;
    const sourceDocId = body.source_doc || null;

    // If caller provided a specific source_doc id, operate directly on that aggregated document
    if (sourceDocId) {
      try {
        const docRef = db.collection('visits').doc(sourceDocId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return res.status(404).json({ ok: false, msg: 'source_doc not found' });
        const doc = docSnap.data() || {};
        const visits = Array.isArray(doc.visits) ? doc.visits : [];
        let changed = false;

        const normalize = s => {
          if (!s) return '';
          try { return String(s).replace(/\uFEFF/g,'').replace(/\s+/g,'').trim(); } catch(e) { return String(s || ''); }
        };

        const teacherNorm = normalize(teacherQ || '');

        for (const v of visits) {
          const sname = v.school || '';
          if (!(typeof sname === 'string' && sname.indexOf(oldSchool) !== -1)) continue;

          // optional filters
          const vDate = v.visitDate || v.createdAt || null;
          if (visitDateQ && vDate) {
            const vd = new Date(vDate); const qd = new Date(visitDateQ);
            if (isNaN(vd.getTime()) || vd.getFullYear() !== qd.getFullYear() || vd.getMonth() !== qd.getMonth() || vd.getDate() !== qd.getDate()) continue;
          }
          if (visitStartQ && v.visitStart && v.visitStart !== visitStartQ) continue;

          // teacher match inside subjects (support object or string) using normalized substring match
          const subjects = Array.isArray(v.subjects) ? v.subjects : [];
          if (teacherQ) {
            let matched = false;
            for (const s of subjects) {
              if (s && typeof s === 'object') {
                const tnorm = normalize(s.teacher || '');
                if (teacherNorm && tnorm.indexOf(teacherNorm) !== -1) { matched = true; break; }
              } else if (typeof s === 'string') {
                const tnorm = normalize(s || '');
                if (teacherNorm && tnorm.indexOf(teacherNorm) !== -1) { matched = true; break; }
              }
            }
            if (!matched) continue;
          }

          v.school = sname.replace(oldSchool, newSchool);
          changed = true;
        }
        if (changed) {
          await docRef.update({ visits });
          return res.json({ ok: true, updated_ids: [sourceDocId], count: 1 });
        }
        return res.json({ ok: true, updated_ids: [], count: 0, msg: 'no matching visit entries in provided source_doc' });
      } catch (e) {
        console.error('source_doc patch error', e);
        return res.status(500).json({ ok: false, msg: e && e.message });
      }
    }

    // Find candidate source documents by querying visit_entries where school == oldSchool
    let q = db.collection('visit_entries').where('school', '==', oldSchool);
    if (staffQ) q = q.where('staff', '==', staffQ);
    if (teacherQ) q = q.where('teacher', '==', teacherQ);
    if (visitDateQ) {
      const d = new Date(visitDateQ);
      if (!isNaN(d.getTime())) {
        const from = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const to = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
        q = q.where('visitDate_ts', '>=', admin.firestore.Timestamp.fromDate(from)).where('visitDate_ts', '<', admin.firestore.Timestamp.fromDate(to));
      }
    }

  const snap = await q.get();
  // don't early-return; if no visit_entries candidates are found we'll fall back to scanning
  // the legacy `visits` collection which stores aggregated visits arrays.

    const sourceIds = new Set();
    snap.forEach(d => { const data = d.data() || {}; if (data.source_doc) sourceIds.add(data.source_doc); });
    const updated = [];

  // For each source_doc, load the aggregated visits document and adjust matching visit entries
    for (const sid of Array.from(sourceIds)) {
      const docRef = db.collection('visits').doc(sid);
      const docSnap = await docRef.get();
      if (!docSnap.exists) continue;
      const doc = docSnap.data() || {};
      const visits = Array.isArray(doc.visits) ? doc.visits : [];
      let changed = false;

      for (const v of visits) {
        // optional visit_date filter
        const vDate = v.visitDate || v.createdAt || null;
        if (visitDateQ && vDate) {
          const vd = new Date(vDate);
          const qd = new Date(visitDateQ);
          if (isNaN(vd.getTime()) || vd.getFullYear() !== qd.getFullYear() || vd.getMonth() !== qd.getMonth() || vd.getDate() !== qd.getDate()) {
            continue;
          }
        }

        // Check visitStart if provided
        if (visitStartQ && v.visitStart && v.visitStart !== visitStartQ) continue;

        // subjects may be array; try to match teacher filter inside subjects
        const subjects = Array.isArray(v.subjects) ? v.subjects : [];
        let subjectMatches = false;
        if (teacherQ) {
          for (const s of subjects) {
            if (s && typeof s === 'object') {
              const t = (s && s.teacher) ? String(s.teacher) : '';
              if (t && t.indexOf(teacherQ) !== -1) { subjectMatches = true; break; }
            } else if (typeof s === 'string') {
              if (s.indexOf(teacherQ) !== -1) { subjectMatches = true; break; }
            }
          }
          if (!subjectMatches) continue;
        }

        // Replace school string if it contains oldSchool
        const sname = v.school || '';
        if (typeof sname === 'string' && sname.indexOf(oldSchool) !== -1) {
          v.school = sname.replace(oldSchool, newSchool);
          changed = true;
        }
      }

      if (changed) {
        await docRef.update({ visits });
        updated.push(sid);
      }
    }

    // If nothing updated via visit_entries pathway, fallback to scanning the legacy `visits`
    // collection (aggregated documents) and update any matching visit entries there.
    if (!updated.length) {
      try {
        // limit scan size to a reasonable number (recent documents)
        const scanLimit = 2000;
        const q2 = db.collection('visits').orderBy('createdAt', 'desc').limit(scanLimit);
        const snap2 = await q2.get();
        for (const doc of snap2.docs) {
          const data = doc.data() || {};
          const visits = Array.isArray(data.visits) ? data.visits : [];
          let changed = false;
          for (const v of visits) {
            const vDate = v.visitDate || v.createdAt || null;
            if (visitDateQ && vDate) {
              const vd = new Date(vDate);
              const qd = new Date(visitDateQ);
              if (isNaN(vd.getTime()) || vd.getFullYear() !== qd.getFullYear() || vd.getMonth() !== qd.getMonth() || vd.getDate() !== qd.getDate()) {
                continue;
              }
            }
            if (visitStartQ && v.visitStart && v.visitStart !== visitStartQ) continue;

            const subjects = Array.isArray(v.subjects) ? v.subjects : [];
            let subjectMatches = false;
            if (teacherQ) {
              for (const s of subjects) {
                if (s && typeof s === 'object') {
                  const t = (s && s.teacher) ? String(s.teacher) : '';
                  if (t && t.indexOf(teacherQ) !== -1) { subjectMatches = true; break; }
                } else if (typeof s === 'string') {
                  if (s.indexOf(teacherQ) !== -1) { subjectMatches = true; break; }
                }
              }
              if (!subjectMatches) continue;
            }

            const sname = v.school || '';
            if (typeof sname === 'string' && sname.indexOf(oldSchool) !== -1) {
              v.school = sname.replace(oldSchool, newSchool);
              changed = true;
            }
          }
          if (changed) {
            await db.collection('visits').doc(doc.id).update({ visits });
            updated.push(doc.id);
          }
        }
      } catch (e) {
        console.error('fallback visits scan error', e);
      }
    }

    return res.json({ ok: true, updated_ids: updated, count: updated.length });
  } catch (err) {
    console.error('patch_school error', err);
    return res.status(500).json({ ok: false, msg: err && err.message });
  }
});

// POST /visits/backfill_region - admin helper: backfill missing v.region from hosted CSV used by the frontend
app.post('/visits/backfill_region', async (req, res) => {
  try {
    const body = req.body || {};
    const scanLimit = parseInt(body.scanLimit || '2000', 10) || 2000;
    const dry = !!body.dryRun;
    const staffQ = body.staff || null; // optional: only process docs for this staff

    // Fetch the published sales_staff.csv that the frontend uses to populate region/school lists
    // Use the hosting URL which should be public
    const csvUrl = body.csvUrl || 'https://cmass-sales.web.app/sales_staff.csv';
    let csvText = '';
    try {
      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error('failed to fetch CSV: ' + resp.status);
      csvText = await resp.text();
    } catch (e) {
      console.error('fetch csv error', e);
      return res.status(502).json({ ok: false, msg: 'failed to fetch CSV from hosting', error: (e && e.message) || String(e) });
    }

    // Robust CSV parse that handles quoted fields (basic state-machine parser)
    function parseCsvLines(text){
      const out = [];
      let cur = '';
      let inQuotes = false;
      let row = [];
      for (let i = 0; i < text.length; i++){
        const ch = text[i];
        if (ch === '"'){
          // peek next char for escaped quote
          if (inQuotes && i+1 < text.length && text[i+1] === '"'){
            cur += '"'; i++; continue;
          }
          inQuotes = !inQuotes; continue;
        }
        if (!inQuotes && (ch === '\n' || ch === '\r')){
          // handle CRLF
          if (ch === '\r' && i+1 < text.length && text[i+1] === '\n') { i++; }
          row.push(cur); cur = ''; out.push(row); row = []; continue;
        }
        if (!inQuotes && ch === ',') { row.push(cur); cur = ''; continue; }
        cur += ch;
      }
      // push last
      if (cur !== '' || inQuotes || row.length) { row.push(cur); out.push(row); }
      return out.map(r => r.map(c => c.replace(/^\uFEFF/, '').trim()));
    }

    const rows = parseCsvLines(csvText).filter(r => r && r.length);
    if (!rows.length) return res.status(400).json({ ok: false, msg: 'empty csv after parse' });
    const header = rows[0];
    const idxSchool = header.findIndex(h => /학교명|학교|school/i.test(h));
    const idxRegion = header.findIndex(h => /지역|region/i.test(h));
    if (idxSchool < 0 || idxRegion < 0) {
      return res.status(400).json({ ok: false, msg: 'csv missing expected columns (school, region)', header });
    }
    const mapping = Object.create(null);
    for (let i = 1; i < rows.length; i++){
      const cols = rows[i];
      if (!cols || cols.length <= Math.max(idxSchool, idxRegion)) continue;
      const school = (cols[idxSchool] || '').trim();
      const region = (cols[idxRegion] || '').trim();
      if (school) mapping[school] = region;
    }

    // Scan aggregated visits docs (paginated) and fill missing regions when we can infer from school name
    let q = db.collection('visits').orderBy('createdAt', 'desc');
    const limit = Math.max(1, Math.min(5000, scanLimit));
    q = q.limit(limit);
    const startCursor = body.startCursor || null; // expected encodeURIComponent("<ISO>|<docId>")
    if (startCursor) {
      try {
        const dec = decodeURIComponent(startCursor);
        const parts = dec.split('|');
        if (parts.length === 2) {
          const dt = new Date(parts[0]); const docId = parts[1];
          if (!isNaN(dt.getTime()) && docId) {
            q = q.startAfter(admin.firestore.Timestamp.fromDate(dt), docId);
          }
        }
      } catch (e) { /* ignore bad cursor */ }
    }
    const snap = await q.get();
    const updated = [];
  for (const docSnap of snap.docs) {
      try {
        const doc = docSnap.data() || {};
        if (staffQ && doc.staff !== staffQ) continue;
        const visits = Array.isArray(doc.visits) ? doc.visits : [];
        let changed = false;
        for (const v of visits) {
          // if region already present and non-empty, skip
          if (v.region && String(v.region).trim()) continue;
          const sname = (v.school || '').toString().trim();
          if (!sname) continue;
          // try exact match first
          let found = mapping[sname];
          // fallback: try substring match against keys
          if (!found) {
            for (const key of Object.keys(mapping)){
              if (!key) continue;
              if (sname.indexOf(key) !== -1 || key.indexOf(sname) !== -1) { found = mapping[key]; break; }
            }
          }
          if (found) { v.region = found; changed = true; }
        }
        if (changed) {
          if (!dry) {
            await db.collection('visits').doc(docSnap.id).update({ visits });
          }
          updated.push(docSnap.id);
        }
      } catch (e) { console.warn('per-doc backfill failed for', docSnap.id, e && e.message); }
    }
    // compute nextCursor
    let nextCursor = null;
    if (snap.docs.length === limit) {
      const last = snap.docs[snap.docs.length - 1];
      const lastData = last.data() || {};
      const time = (lastData.createdAt && lastData.createdAt.toDate) ? lastData.createdAt.toDate().toISOString() : (lastData.createdAt || '');
      if (time) nextCursor = encodeURIComponent(time + '|' + last.id);
    }

    return res.json({ ok: true, updated_ids: updated, count: updated.length, dryRun: !!dry, nextCursor });
  } catch (err) {
    console.error('backfill_region error', err);
    return res.status(500).json({ ok: false, msg: err && err.message });
  }
});

// POST /visits/set_region - admin helper: set v.region for visits matching a given school name
app.post('/visits/set_region', async (req, res) => {
  try {
    const body = req.body || {};
    const schoolQ = (body.school || '').toString().trim();
    const regionVal = (body.region || '').toString().trim();
    if (!schoolQ || !regionVal) return res.status(400).json({ ok: false, msg: 'school and region required' });
    const scanLimit = parseInt(body.scanLimit || '2000', 10) || 2000;
    const dry = !!body.dryRun;

    // Scan recent aggregated visits documents and set region when school matches
    const q = db.collection('visits').orderBy('createdAt', 'desc').limit(Math.max(1, Math.min(5000, scanLimit)));
    const snap = await q.get();
    const updated = [];
    for (const docSnap of snap.docs) {
      try {
        const doc = docSnap.data() || {};
        const visits = Array.isArray(doc.visits) ? doc.visits : [];
        let changed = false;
        for (const v of visits) {
          const sname = (v.school || '').toString().trim();
          if (!sname) continue;
          // match when exact or substring contains
          if (sname === schoolQ || sname.indexOf(schoolQ) !== -1 || schoolQ.indexOf(sname) !== -1) {
            if (!v.region || (v.region && String(v.region).trim() === '')) {
              v.region = regionVal; changed = true;
            }
          }
        }
        if (changed) {
          if (!dry) await db.collection('visits').doc(docSnap.id).update({ visits });
          updated.push(docSnap.id);
        }
      } catch (e) { console.warn('set_region per-doc failed', docSnap.id, e && e.message); }
    }

    return res.json({ ok: true, updated_ids: updated, count: updated.length, dryRun: !!dry });
  } catch (err) {
    console.error('set_region error', err);
    return res.status(500).json({ ok: false, msg: err && err.message });
  }
});

// POST /visits/sync_entries - admin helper: sync visit_entries documents to match an aggregated source_doc
app.post('/visits/sync_entries', async (req, res) => {
  try {
    const body = req.body || {};
    const sourceDoc = (body.source_doc || '').toString().trim();
    const dry = !!body.dryRun;
    if (!sourceDoc) return res.status(400).json({ ok: false, msg: 'source_doc required' });

    // Load the aggregated source document
    const srcRef = db.collection('visits').doc(sourceDoc);
    const srcSnap = await srcRef.get();
    if (!srcSnap.exists) return res.status(404).json({ ok: false, msg: 'source_doc not found' });
    const src = srcSnap.data() || {};
    const visits = Array.isArray(src.visits) ? src.visits : [];

    // Build a small list of visit signatures from the aggregated doc for matching
    function normalizeStr(s){ try { return (s||'').toString().replace(/\uFEFF/g,'').trim(); } catch(e){ return String(s||''); } }
    const visitSignatures = [];
    for (const v of visits){
      const vDateStr = normalizeStr(v.visitDate || v.createdAt || '');
      const vDate = vDateStr ? new Date(vDateStr) : null;
      const dateKey = (vDate && !isNaN(vDate.getTime())) ? (vDate.getFullYear() + '-' + (vDate.getMonth()+1) + '-' + vDate.getDate()) : '';
      const start = normalizeStr(v.visitStart || '');
      // collect teacher names from subjects if present
      const teachers = [];
      if (Array.isArray(v.subjects) && v.subjects.length){
        for (const s of v.subjects){
          if (s && typeof s === 'object' && s.teacher) teachers.push(normalizeStr(s.teacher));
          else if (typeof s === 'string') teachers.push(normalizeStr(s));
        }
      }
      // fallback single teacher on visit
      if (v.teacher) teachers.push(normalizeStr(v.teacher));
      visitSignatures.push({ dateKey, start, teachers: teachers.filter(t=>t), school: normalizeStr(v.school||''), region: normalizeStr(v.region||'') });
    }

    // Query visit_entries for this source_doc
    const q = db.collection('visit_entries').where('source_doc','==', sourceDoc);
    const snap = await q.get();
    const planned = [];
    const toUpdate = [];

    snap.forEach(doc => {
      const d = doc.data() || {};
      const entryId = doc.id;
      const eSchool = normalizeStr(d.school || '');
      const eRegion = normalizeStr(d.region || '');
      const eTeacher = normalizeStr(d.teacher || '');
      // derive dateKey from visitDate_ts or visitDate
      let eDateKey = '';
      if (d.visitDate_ts && d.visitDate_ts.toDate) {
        const dt = d.visitDate_ts.toDate(); eDateKey = dt.getFullYear() + '-' + (dt.getMonth()+1) + '-' + dt.getDate();
      } else if (d.visitDate) {
        const dt = new Date(d.visitDate);
        if (!isNaN(dt.getTime())) eDateKey = dt.getFullYear() + '-' + (dt.getMonth()+1) + '-' + dt.getDate();
      }
      const eStart = normalizeStr(d.visitStart || '');

      // Find matching aggregated visit
      let matched = null;
      for (const vs of visitSignatures){
        // date must match when available
        if (vs.dateKey && eDateKey && vs.dateKey !== eDateKey) continue;
        // start if present and both sides have it
        if (vs.start && eStart && vs.start !== eStart) continue;
        // teacher matching: if aggregated lists teachers, check substring/equals
        if (vs.teachers && vs.teachers.length){
          let ok = false;
          for (const t of vs.teachers){
            if (!t) continue;
            if (eTeacher && (eTeacher === t || eTeacher.indexOf(t) !== -1 || t.indexOf(eTeacher) !== -1)) { ok = true; break; }
          }
          if (!ok) continue; // no teacher match
        }
        // matched candidate
        matched = vs; break;
      }

      if (matched){
        const newSchool = matched.school || '';
        const newRegion = matched.region || '';
        if (newSchool && newSchool !== eSchool){
          planned.push({ entryId, before: { school: eSchool, region: eRegion }, after: { school: newSchool, region: (eRegion || newRegion) } });
          toUpdate.push({ id: entryId, school: newSchool, region: (eRegion || newRegion) });
        } else if (!eRegion && newRegion){
          // school same but region missing -> fill region
          planned.push({ entryId, before: { school: eSchool, region: eRegion }, after: { school: eSchool, region: newRegion } });
          toUpdate.push({ id: entryId, school: eSchool, region: newRegion });
        }
      }
    });

    // If dryRun, return planned changes
    if (dry) return res.json({ ok: true, planned, count: planned.length, dryRun: true });

    // Apply updates in batches
    const BATCH_SIZE = 400;
    let batch = db.batch(); let ops = 0; const updatedIds = [];
    for (const u of toUpdate){
      const r = db.collection('visit_entries').doc(u.id);
      const payload = Object.create(null);
      if (u.school) payload.school = u.school;
      if (typeof u.region !== 'undefined') payload.region = u.region;
      batch.update(r, payload);
      ops++;
      if (ops >= BATCH_SIZE){ await batch.commit(); batch = db.batch(); ops = 0; }
      updatedIds.push(u.id);
    }
    if (ops > 0) await batch.commit();

    return res.json({ ok: true, updated_ids: updatedIds, count: updatedIds.length, dryRun: false });
  } catch (err){
    console.error('sync_entries error', err);
    return res.status(500).json({ ok: false, msg: err && err.message });
  }
});

// POST /visits/backfill_entries_region - backfill region in visit_entries by matching school -> region from CSV
app.post('/visits/backfill_entries_region', async (req, res) => {
  try {
    const body = req.body || {};
    const scanLimit = parseInt(body.scanLimit || '2000', 10) || 2000;
    const dry = !!body.dryRun;
    const startCursor = body.startCursor || null; // expected encodeURIComponent("<ISO>|<docId>")
    const csvUrl = body.csvUrl || 'https://cmass-sales.web.app/sales_staff.csv';

    // Ensure the cached mapping is loaded
    try { await ensureSchoolRegionMap(); } catch (e) { /* continue, mapping may be empty */ }

    // If caller provided an explicit mapping in the request body, use it (allows overriding/forcing)
    let mapping = schoolRegionMap || {};
    if (body.mapping && typeof body.mapping === 'object') {
      // caller may send keys as raw school names -> region; normalize keys similarly to CSV loader
      const provided = Object.assign({}, body.mapping);
      const normMap = Object.create(null);
      for (const k of Object.keys(provided)){
        try { const nk = (k||'').toString().replace(/\uFEFF/g,'').trim(); normMap[nk] = provided[k]; } catch(e) { normMap[k] = provided[k]; }
      }
      mapping = normMap;
    }
    if (!mapping || Object.keys(mapping).length === 0) {
      // attempt one-off fetch and parse
      try {
        const resp = await fetch(csvUrl);
        if (resp.ok) {
          const txt = await resp.text();
          const rows = await parseCsvLines(txt);
          const header = rows[0] || [];
          const idxSchool = header.findIndex(h => /학교명|학교|school/i.test(h));
          const idxRegion = header.findIndex(h => /지역|region/i.test(h));
          const map = Object.create(null);
          if (idxSchool >= 0 && idxRegion >= 0){
            for (let i=1;i<rows.length;i++){ const cols = rows[i]||[]; if (!cols || cols.length <= Math.max(idxSchool, idxRegion)) continue; const school = (cols[idxSchool]||'').trim(); const region = (cols[idxRegion]||'').trim(); if (school) map[school]=region; }
          }
          mapping = map;
        }
      } catch (e){ console.warn('one-off csv fetch failed', e && e.message); }
    }

    // Scan visit_entries (paginated) and find those with school present but missing region
    let q = db.collection('visit_entries').orderBy('visitDate_ts','desc');
    const limit = Math.max(1, Math.min(5000, scanLimit));
    q = q.limit(limit);
    // apply cursor if provided
    if (startCursor) {
      try {
        const dec = decodeURIComponent(startCursor);
        const parts = dec.split('|');
        if (parts.length === 2) {
          const dt = new Date(parts[0]); const docId = parts[1];
          if (!isNaN(dt.getTime()) && docId) {
            q = q.startAfter(admin.firestore.Timestamp.fromDate(dt), docId);
          }
        }
      } catch (e) { /* ignore bad cursor */ }
    }
    const snap = await q.get();
    const planned = [];
    const toUpdate = [];

    // compute nextCursor for pagination
    let nextCursor = null;

    const keys = Object.keys(mapping || {});
  for (const doc of snap.docs){
      try {
        const data = doc.data() || {};
        const school = (data.school || '').toString().trim();
        const regionNow = (data.region || '').toString().trim();
        if (!school) continue;
        if (regionNow && regionNow.length) continue; // already has region

        // exact match
        let found = mapping[school];
        if (!found) {
          // substring fallback
          for (const k of keys){ if (!k) continue; if (school.indexOf(k) !== -1 || k.indexOf(school) !== -1){ found = mapping[k]; break; } }
        }
        if (found) {
          planned.push({ entryId: doc.id, before: { school, region: regionNow }, after: { school, region: found } });
          toUpdate.push({ id: doc.id, region: found });
        }
      } catch (e){ console.warn('per-entry parse failed', doc.id, e && e.message); }
    }

    // determine nextCursor if we hit the limit
    if (snap.docs.length === limit) {
      const last = snap.docs[snap.docs.length - 1];
      const lastData = last.data() || {};
      const time = (lastData.visitDate || (lastData.visitDate_ts && lastData.visitDate_ts.toDate && lastData.visitDate_ts.toDate().toISOString())) || '';
      if (time) nextCursor = encodeURIComponent(time + '|' + last.id);
    }

    if (dry) return res.json({ ok: true, planned, count: planned.length, dryRun: true, nextCursor });

    // apply updates in batches
    const BATCH_SIZE = 400;
    let batch = db.batch(); let ops = 0; const updated = [];
    for (const u of toUpdate){
      const r = db.collection('visit_entries').doc(u.id);
      batch.update(r, { region: u.region }); ops++; updated.push(u.id);
      if (ops >= BATCH_SIZE){ await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    return res.json({ ok: true, updated_ids: updated, count: updated.length, dryRun: false, nextCursor });
  } catch (err){ console.error('backfill_entries_region error', err); return res.status(500).json({ ok:false, msg: err && err.message }); }
});

// POST /visits/find_entries_by_school - admin read-only: return sample visit_entries matching a school string
app.post('/visits/find_entries_by_school', async (req, res) => {
  try {
    const body = req.body || {};
    const schoolQ = (body.school || '').toString().trim();
    const limit = Math.max(1, Math.min(500, parseInt(body.limit || '200', 10)));
    if (!schoolQ) return res.status(400).json({ ok: false, msg: 'school required' });

    // Try direct equality query first
    let results = [];
    try {
      const q = db.collection('visit_entries').where('school','==', schoolQ).orderBy('visitDate_ts','desc').limit(limit);
      const snap = await q.get();
      snap.forEach(d => {
        const data = d.data() || {};
        results.push({ id: d.id, school: data.school || '', region: data.region || '', teacher: data.teacher || '', visitDate: data.visitDate || '', visitStart: data.visitStart || '', source_doc: data.source_doc || '', conversation: data.conversation || '' });
      });
    } catch (e) {
      console.warn('equality query failed', e && e.message);
    }

    // If none found, fallback to substring scan over recent entries
    if (!results.length) {
      const snap2 = await db.collection('visit_entries').orderBy('visitDate_ts','desc').limit(5000).get();
      for (const d of snap2.docs) {
        const data = d.data() || {};
        const s = (data.school || '').toString();
        if (s && (s === schoolQ || s.indexOf(schoolQ) !== -1 || schoolQ.indexOf(s) !== -1)) {
          results.push({ id: d.id, school: data.school || '', region: data.region || '', teacher: data.teacher || '', visitDate: data.visitDate || '', visitStart: data.visitStart || '', source_doc: data.source_doc || '', conversation: data.conversation || '' });
          if (results.length >= limit) break;
        }
      }
    }

    return res.json({ ok: true, rows: results, count: results.length });
  } catch (err) { console.error('find_entries_by_school error', err); return res.status(500).json({ ok: false, msg: err && err.message }); }
});

// POST /visits/count_missing_region - diagnostic: count and sample visit_entries and visits missing region but with school present
app.post('/visits/count_missing_region', async (req, res) => {
  try {
    const body = req.body || {};
    const scanLimit = parseInt(body.scanLimit || '5000', 10) || 5000;
    const sampleLimit = Math.max(1, Math.min(200, parseInt(body.sampleLimit || '50', 10)));

    // scan visit_entries (most recent scanLimit)
    const q = db.collection('visit_entries').orderBy('visitDate_ts','desc').limit(scanLimit);
    const snap = await q.get();
    let entriesCount = 0;
    const entrySamples = [];
    for (const doc of snap.docs){
      const d = doc.data() || {};
      const school = (d.school || '').toString().trim();
      const region = (d.region || '').toString().trim();
      if (school && !region){
        entriesCount++;
        if (entrySamples.length < sampleLimit) entrySamples.push({ id: doc.id, school, region, teacher: d.teacher || '', visitDate: d.visitDate || '' });
      }
    }

    // scan aggregated visits
    const q2 = db.collection('visits').orderBy('createdAt','desc').limit(scanLimit);
    const snap2 = await q2.get();
    let visitsCount = 0;
    const visitSamples = [];
    for (const doc of snap2.docs){
      const d = doc.data() || {};
      const visits = Array.isArray(d.visits) ? d.visits : [];
      for (const v of visits){
        const school = (v.school || '').toString().trim();
        const region = (v.region || '').toString().trim();
        if (school && !region){
          visitsCount++;
          if (visitSamples.length < sampleLimit) visitSamples.push({ docId: doc.id, school, region, visitDate: v.visitDate || v.createdAt || '' });
        }
      }
    }

    return res.json({ ok: true, entriesCount, visitsCount, entrySamples, visitSamples, scannedLimit: scanLimit });
  } catch (err){ console.error('count_missing_region error', err); return res.status(500).json({ ok:false, msg: err && err.message }); }
});

// POST /visits/apply_mapping_bulk - apply provided mapping (school -> region) by equality query on visit_entries and visits
app.post('/visits/apply_mapping_bulk', async (req, res) => {
  try {
    const body = req.body || {};
    const mapping = body.mapping || null;
    const dry = !!body.dryRun;
    if (!mapping || typeof mapping !== 'object') return res.status(400).json({ ok: false, msg: 'mapping object required' });

    const updatedEntries = [];
    const updatedVisits = [];
    // Process visit_entries by exact equality query per school key
    for (const rawKey of Object.keys(mapping)){
      const key = (rawKey||'').toString().trim();
      const regionVal = (mapping[rawKey] || mapping[key] || '').toString();
      if (!key || !regionVal) continue;
      // query equality
      try {
        const q = db.collection('visit_entries').where('school','==', key).limit(2000);
        const snap = await q.get();
        const batch = db.batch(); let ops = 0;
        for (const doc of snap.docs){
          const d = doc.data() || {};
          const curRegion = (d.region || '').toString().trim();
          if (!curRegion){
            if (!dry) batch.update(doc.ref, { region: regionVal });
            updatedEntries.push(doc.id);
            ops++;
          }
        }
        if (!dry && ops > 0) await batch.commit();
      } catch (e){ console.warn('apply_mapping_bulk entry query failed', key, e && e.message); }
      // aggregated visits: scan recent docs and update matching visit items where school equals key
      try {
        const q2 = db.collection('visits').orderBy('createdAt','desc').limit(5000);
        const snap2 = await q2.get();
        for (const doc of snap2.docs){
          const data = doc.data() || {};
          let changed = false;
          const visits = Array.isArray(data.visits) ? data.visits : [];
          for (const v of visits){
            const sname = (v.school || '').toString().trim();
            if (sname === key){
              const cur = (v.region || '').toString().trim();
              if (!cur){ v.region = regionVal; changed = true; }
            }
          }
          if (changed){ if (!dry) await db.collection('visits').doc(doc.id).update({ visits }); updatedVisits.push(doc.id); }
        }
      } catch (e){ console.warn('apply_mapping_bulk visits scan failed', key, e && e.message); }
    }

    return res.json({ ok: true, updated_entries: updatedEntries, updated_visits: updatedVisits, dryRun: !!dry });
  } catch (err){ console.error('apply_mapping_bulk error', err); return res.status(500).json({ ok: false, msg: err && err.message }); }
});

// POST /visits/get_entry - return a visit_entries document by id (diagnostic)
app.post('/visits/get_entry', async (req, res) => {
  try {
    const body = req.body || {};
    const id = (body.id || '').toString().trim();
    if (!id) return res.status(400).json({ ok: false, msg: 'id required' });
    const doc = await db.collection('visit_entries').doc(id).get();
    if (!doc.exists) return res.status(404).json({ ok: false, msg: 'not found' });
    return res.json({ ok: true, id: doc.id, data: doc.data() });
  } catch (err){ console.error('get_entry error', err); return res.status(500).json({ ok:false, msg: err && err.message }); }
});

// POST /keywords - simple server-side keyword extractor for Korean/Latin text
app.post('/keywords', async (req, res) => {
  try {
    const body = req.body || {};
    const texts = Array.isArray(body.texts) ? body.texts : [];
    const topN = Math.max(5, Math.min(200, parseInt(body.topN || '30')));
    if (!texts.length) return res.json({ ok: true, keywords: [] });

    // Simple heuristic tokenizer: extract Hangul runs and Latin words; remove short tokens and stopwords
    const stopwords = new Set(['입니다','있습니다','합니다','없습니다','또한','및','와','과','의','에','으로','로','이','가','은','는','을','를','하다','요','선생님','학교','학생','있다','있어','했습니다','했습니다']);
    const counts = Object.create(null);

    function addTok(t){
      if (!t) return;
      const tok = t.trim();
      if (!tok) return;
      if (tok.length < 2) return; // ignore one-letter tokens
      if (stopwords.has(tok)) return;
      counts[tok] = (counts[tok] || 0) + 1;
    }

    for (const raw of texts){
      if (!raw) continue;
      const s = String(raw || '');
      // Hangul words (2+ chars)
      const hangul = s.match(/[가-힣]{2,}/g) || [];
      hangul.forEach(h => addTok(h));
      // Latin words
      const latin = s.match(/[A-Za-z]{2,}/g) || [];
      latin.forEach(l => addTok(l.toLowerCase()));
      // also consider simple bigrams of hangul tokens within the string (adjacent)
      if (hangul.length >= 2){
        for (let i=0;i<hangul.length-1;i++){ addTok(hangul[i] + ' ' + hangul[i+1]); }
      }
    }

    const out = Object.keys(counts).map(k => ({ token: k, count: counts[k] })).sort((a,b)=>b.count - a.count).slice(0, topN);
    return res.json({ ok: true, keywords: out });
  } catch (err){ console.error('keywords error', err); return res.status(500).json({ ok:false, msg: err && err.message || 'server error' }); }
});

// POST /pin-check - simple PIN validation for small internal use
app.post('/pin-check', async (req, res) => {
  try {
    const body = req.body || {};
    const staff = (body.staff || '').toString().trim();
    const pin = (body.pin || '').toString().trim();
    // Normalize and robustly match staff names. Do not log the PIN itself.
    const normalizeStr = s => {
      if (s === null || s === undefined) return '';
      let out = String(s || '');
      // remove BOM and common zero-width characters
      out = out.replace(/\uFEFF/g, '');
      out = out.replace(/[\u200B-\u200D\uFEFF]/g, '');
      // collapse whitespace
      out = out.replace(/\s+/g, ' ').trim();
      try { if (out.normalize) out = out.normalize('NFC'); } catch(_) {}
      return out;
    };
    const stripTitles = s => (s||'').toString().replace(/\s*(부장|차장|과장|대리|사원|팀장|선생님|선생)/g,'').trim();
    const staffRaw = normalizeStr(staff);
    const staffNoTitle = stripTitles(staffRaw);
    // simple matching helper: try exact, whitespace-insensitive, and case-insensitive (for Latin)
    const findMatchingKey = (s, map) => {
      if (!s) return null;
      const keys = Object.keys(map || {});
      // exact
      for (const k of keys) if (k === s) return k;
      const sCompact = s.replace(/\s+/g,'');
      for (const k of keys) if (k.replace(/\s+/g,'') === sCompact) return k;
      const sNorm = s.toLowerCase();
      for (const k of keys) if (k.toLowerCase() === sNorm) return k;
      for (const k of keys) if (k.replace(/\s+/g,'').toLowerCase() === sCompact.toLowerCase()) return k;
      return null;
    };

  // Debug logging removed: PIN values and related debug lines were used during
  // investigation and have been removed to reduce log noise and avoid
  // exposing even masked identifiers in production.
    // simple in-memory map mirroring the frontend's small pinMap
    const pinMap = {
      '송훈재': '8747',
      '임준호': '1203',
      '조영환': '0686',
      // accept canonical latin tokens too
      'Songhoonjae': '8747',
      'LimJunho': '1203',
      'ChoYounghwan': '0686'
    };
    if (!staffRaw || !pin) return res.status(400).json({ ok: false, msg: 'staff and pin required' });

    // Try to find a matching key using the normalized values
    let matchedKey = findMatchingKey(staffNoTitle, pinMap) || findMatchingKey(staffRaw, pinMap) || findMatchingKey(staff, pinMap);
    if (!matchedKey) {
      // last-ditch: try converting ascii letters-only version
      const ascii = staffRaw.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g,'');
      if (ascii) matchedKey = findMatchingKey(ascii, pinMap);
    }

    if (!matchedKey) {
      // No matching staff key found; return 404.
      return res.status(404).json({ ok: false, msg: 'unknown staff' });
    }

    const expected = pinMap[matchedKey];
    const ok = (expected === pin);
  // Removed PIN_RESULT logging in production.
    if (ok) return res.json({ ok: true });
    return res.status(403).json({ ok: false, msg: 'invalid pin' });
  } catch (err) {
    console.error('pin-check error', err);
    return res.status(500).json({ ok: false, msg: err.message || 'server error' });
  }
});

// POST /log-access - record dashboard/admin access attempts
app.post('/log-access', async (req, res) => {
  try {
    const body = req.body || {};
    const viewer = (body.viewer || body.user || '').toString().trim() || '(unknown)';
    const href = (body.href || '').toString().slice(0, 1000);
    const ua = (body.ua || req.get('user-agent') || '').toString().slice(0, 512);
    // try to obtain proxied client IP
    const xf = (req.get('x-forwarded-for') || '').toString();
    const ip = xf ? xf.split(',')[0].trim() : (req.ip || null);

    const doc = {
      viewer,
      href: href || null,
      userAgent: ua || null,
      ip: ip || null,
      referer: req.get('referer') || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('access_logs').add(doc);
    return res.json({ ok: true });
  } catch (err) {
    console.error('log-access error', err);
    return res.status(500).json({ ok: false, msg: err.message || 'server error' });
  }
});

// (Temporary test endpoint removed) The /pin-check-test diagnostic route was used
// during debugging and has been removed from production code. Client diagnostics
// should now use the real /api/pin-check route; server logs continue to emit
// masked PIN_RESULT and PIN_DEBUG lines for safe troubleshooting.

// Export as single function to receive /visits in Seoul (asia-northeast3)
// Set explicit region to avoid deploying to the default (us-central1).
exports.api = functions
  .region('asia-northeast3')
  .runWith({ memory: '512MB', timeoutSeconds: 540 })
  .https.onRequest(app);

// POST /visits/apply_mapping_full - full collection scan (paginated) to apply provided mapping (school->region)
app.post('/visits/apply_mapping_full', async (req, res) => {
  try {
    const body = req.body || {};
    const mapping = body.mapping || null;
    const batchSize = Math.max(100, Math.min(1000, parseInt(body.batchSize || '500', 10)));
    const dry = !!body.dryRun;
    if (!mapping || typeof mapping !== 'object') return res.status(400).json({ ok: false, msg: 'mapping object required' });

    // normalize mapping keys
    const normMap = Object.create(null);
    const normalizeKey = s => { try { return (s||'').toString().replace(/\uFEFF/g,'').replace(/\s+/g,' ').trim().toLowerCase(); } catch(e){ return (s||'').toString(); } };
    for (const k of Object.keys(mapping)){
      const nk = normalizeKey(k);
      normMap[nk] = mapping[k];
    }

    const updatedEntryIds = [];
    const updatedVisitDocIds = [];

    // --- visit_entries full scan ---
    let last = null;
    while (true){
      let q = db.collection('visit_entries').orderBy('__name__').limit(batchSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (!snap || snap.empty) break;
      let batch = db.batch(); let ops = 0;
      for (const doc of snap.docs){
        const data = doc.data() || {};
        const schoolRaw = (data.school || '').toString();
        const regionNow = (data.region || '').toString().trim();
        if (!schoolRaw || regionNow) continue;
        const nk = normalizeKey(schoolRaw);
        const mapped = normMap[nk];
        if (!mapped) continue;
        if (!dry) batch.update(doc.ref, { region: mapped });
        updatedEntryIds.push(doc.id);
        ops++;
        if (ops >= 400){ await batch.commit(); batch = db.batch(); ops = 0; }
      }
      if (!dry && ops > 0) await batch.commit();
      last = snap.docs[snap.docs.length-1];
      // continue to next page
    }

    // --- aggregated visits full scan ---
    last = null;
    while (true){
      let q = db.collection('visits').orderBy('__name__').limit(batchSize);
      if (last) q = q.startAfter(last);
      const snap = await q.get();
      if (!snap || snap.empty) break;
      let batch = db.batch(); let ops = 0;
      for (const doc of snap.docs){
        const data = doc.data() || {};
        const visits = Array.isArray(data.visits) ? data.visits : [];
        let changed = false;
        for (const v of visits){
          const sRaw = (v.school || '').toString();
          const rNow = (v.region || '').toString().trim();
          if (!sRaw || rNow) continue;
          const nk = normalizeKey(sRaw);
          const mapped = normMap[nk];
          if (!mapped) continue;
          v.region = mapped; changed = true;
        }
        if (changed){
          if (!dry) batch.update(db.collection('visits').doc(doc.id), { visits });
          updatedVisitDocIds.push(doc.id);
          ops++;
          if (ops >= 400){ await batch.commit(); batch = db.batch(); ops = 0; }
        }
      }
      if (!dry && ops > 0) await batch.commit();
      last = snap.docs[snap.docs.length-1];
    }

    return res.json({ ok: true, updated_entries: updatedEntryIds, updated_visits: updatedVisitDocIds, dryRun: !!dry });
  } catch (err){ console.error('apply_mapping_full error', err); return res.status(500).json({ ok:false, msg: err && err.message }); }
});

// POST /visits/apply_by_ids - admin helper: update visit_entries by explicit list of IDs
app.post('/visits/apply_by_ids', async (req, res) => {
  try {
    const body = req.body || {};
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : null;
    const regionOverride = (body.region || '').toString().trim();
    const mapping = (body.mapping && typeof body.mapping === 'object') ? body.mapping : null; // optional school->region map
    const dry = !!body.dryRun;
    if (!ids || !ids.length) return res.status(400).json({ ok: false, msg: 'ids array required' });

    const planned = [];
    // fetch docs
    const BATCH_FETCH = 500;
    for (let i = 0; i < ids.length; i += BATCH_FETCH) {
      const slice = ids.slice(i, i + BATCH_FETCH);
      const snaps = await Promise.all(slice.map(id => db.collection('visit_entries').doc(id).get()));
      for (const s of snaps) {
        if (!s || !s.exists) continue;
        const d = s.data() || {};
        const curRegion = (d.region || '').toString().trim();
        const school = (d.school || '').toString();
        let newRegion = regionOverride || (mapping && mapping[school]);
        if (!newRegion) {
          // nothing to set
          continue;
        }
        if (curRegion && curRegion.length) {
          // already has region, skip
          continue;
        }
        planned.push({ id: s.id, before: curRegion, after: newRegion });
      }
    }

    if (dry) return res.json({ ok: true, planned, count: planned.length, dryRun: true });

    // apply in batches
    const BATCH_SIZE = 400;
    let batch = db.batch(); let ops = 0; const updated = [];
    for (const p of planned) {
      const ref = db.collection('visit_entries').doc(p.id);
      batch.update(ref, { region: p.after }); ops++; updated.push(p.id);
      if (ops >= BATCH_SIZE) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    return res.json({ ok: true, updated_ids: updated, count: updated.length, dryRun: false });
  } catch (err) {
    console.error('apply_by_ids error', err);
    return res.status(500).json({ ok: false, msg: err && err.message });
  }
});
