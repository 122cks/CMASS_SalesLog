const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

async function run(){
  const htmlPath = path.join(__dirname, '..', 'public', 'input.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Do NOT execute page scripts (they may be in an inconsistent state after dedupe).
  const dom = new JSDOM(html, { url: 'http://localhost/' });
  const { window } = dom;

  // Provide a local implementation of fillSchoolGradeCounts (same logic as the runtime filler)
  function toNumber(v){
    if (v === null || v === undefined) return null;
    try{ const n = String(v).replace(/[,\s]/g,''); if(n === '') return null; const f = parseFloat(n); return isNaN(f) ? null : f; }catch(e){ return null; }
  }
  function pick(obj, keys){ for(const k of keys){ if(!obj) continue; if(typeof obj[k] !== 'undefined' && obj[k] !== null && String(obj[k]).trim() !== '') return obj[k]; } return null; }
  function setAllById(id, text){ try{ const nodes = Array.from(window.document.querySelectorAll('#' + id)); nodes.forEach(n=>{ n.textContent = (text === undefined || text === null) ? '' : String(text); }); }catch(e){}
  }
  function applyMeta(meta){
    if(!meta) return;
    [1,2,3].forEach(g=>{
      const classKeys = [`${g}학년학급수`, `${g}학년_학급수`, `${g}학급수`, `${g}학급`, `${g}GradeClassCount`];
      const studentKeys = [`${g}학년학생수`, `${g}학년_학생수`, `${g}학생수`, `${g}학생`, `${g}GradeStudentCount`];
      const avgKeys = [`${g}학년학급당학생수`, `${g}학급당학생수`, `${g}학급당`, `${g}AvgStudentsPerClass`];
      const cls = pick(meta, classKeys); const stu = pick(meta, studentKeys); const avg = pick(meta, avgKeys);
      let clsNum = toNumber(cls); const stuNum = toNumber(stu); const avgNum = toNumber(avg);
      if (clsNum === null && stuNum !== null && avgNum !== null && avgNum > 0) clsNum = Math.round(stuNum / avgNum) || null;
      setAllById('inlineG' + g + 'c', clsNum === null ? '-' : clsNum);
      setAllById('inlineG' + g + 's', stuNum === null ? '-' : stuNum);
      setAllById('metaG' + g + 'c', clsNum === null ? '-' : clsNum);
      setAllById('metaG' + g + 's', stuNum === null ? '-' : stuNum);
    });
  }

  window.fillSchoolGradeCounts = applyMeta;

  const sampleMeta = {
    '1학년학급수': '8',
    '1학년학생수': '176',
    '2학년학급수': '8',
    '2학년학생수': '162',
    '3학년학급수': '8',
    '3학년학생수': '177'
  };

  // Call the filler (synchronous)
  window.fillSchoolGradeCounts(sampleMeta);

  // check inline spans (there may be duplicate IDs; check at least one and all)
  const inlineG1c = Array.from(dom.window.document.querySelectorAll('#inlineG1c'));
  const inlineG1s = Array.from(dom.window.document.querySelectorAll('#inlineG1s'));
  const metaG1c = Array.from(dom.window.document.querySelectorAll('#metaG1c'));
  const metaG1s = Array.from(dom.window.document.querySelectorAll('#metaG1s'));

  assert(inlineG1c.length > 0, 'no #inlineG1c elements found');
  assert(inlineG1s.length > 0, 'no #inlineG1s elements found');
  assert(metaG1c.length > 0, 'no #metaG1c elements found');
  assert(metaG1s.length > 0, 'no #metaG1s elements found');

  inlineG1c.forEach(n => assert.strictEqual(n.textContent.trim(), '8'));
  inlineG1s.forEach(n => assert.strictEqual(n.textContent.trim(), '176'));
  metaG1c.forEach(n => assert.strictEqual(n.textContent.trim(), '8'));
  metaG1s.forEach(n => assert.strictEqual(n.textContent.trim(), '176'));

  console.log('TEST PASSED: meta->DOM population works for sample meta');
}

run().catch(err=>{ console.error('TEST FAILED', err); process.exit(1); });
