#!/usr/bin/env node
const {Firestore} = require('@google-cloud/firestore');

async function main() {
  const [,, idA, idB] = process.argv;
  if (!idA || !idB) {
    console.error('Usage: node compare_docs.js <idA> <idB>');
    process.exit(1);
  }
  const db = new Firestore();
  const da = await db.collection('visit_entries').doc(idA).get();
  const dbb = await db.collection('visit_entries').doc(idB).get();
  if (!da.exists || !dbb.exists) {
    console.log('MISSING', {a: da.exists, b: dbb.exists});
    process.exit(0);
  }
  const a = da.data();
  const b = dbb.data();

  function canon(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(canon);
    const keys = Object.keys(obj).filter(k => !['server_id','id','_savedAt'].includes(k)).sort();
    const out = {};
    for (const k of keys) out[k] = canon(obj[k]);
    return out;
  }

  const ca = canon(a);
  const cb = canon(b);
  const sa = JSON.stringify(ca);
  const sb = JSON.stringify(cb);
  if (sa === sb) {
    console.log('IDENTICAL_EXCEPT_SERVER_ID');
  } else {
    console.log('DIFFER');
    const keys = new Set([...Object.keys(ca), ...Object.keys(cb)]);
    for (const k of keys) {
      const va = JSON.stringify(ca[k]);
      const vb = JSON.stringify(cb[k]);
      if (va !== vb) console.log('DIFF KEY', k, '\nA:', va, '\nB:', vb);
    }
  }
}

main().catch(e => { console.error(e && e.stack || e); process.exit(2); });
